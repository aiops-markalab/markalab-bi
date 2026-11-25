/**
 * Motor de datos y de cálculo.
 *
 * Genera 52 semanas de historia de forma determinista: la misma semilla produce
 * siempre las mismas cifras, de modo que nadie ve números distintos entre dos
 * aperturas de la demostración.
 *
 * Sobre la base estadística se inyectan situaciones concretas y narrables
 * (SITUACIONES, abajo). Esas son las que se cuentan en la junta.
 */

import {
  CADENAS,
  COLECCIONES,
  ESTADOS,
  SUCURSALES,
  type Cadena,
  type Coleccion,
  type Estado,
  type Modelo,
  type Sucursal,
  cadenaPorId,
  estadoPorId,
  modelosDe,
} from "./catalog";

/* ------------------------------------------------------------------ *
 * Aleatoriedad determinista
 * ------------------------------------------------------------------ */

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Semilla fija: la demostración es idéntica en cada apertura. */
const SEMILLA = 20261118;

/* ------------------------------------------------------------------ *
 * Parámetros de negocio
 * ------------------------------------------------------------------ */

export const PARAMS = {
  /** Semanas de cobertura por encima de las cuales se considera saturado. */
  umbral: 12,
  /** Múltiplo del umbral a partir del cual la saturación es crítica. */
  factorCritico: 1.45,
  /** Por debajo de esto hay riesgo de quiebre. */
  coberturaMinima: 2.5,
  /** Días de inventario objetivo para calcular resurtido. */
  diasObjetivo: 56,
  /** Semanas usadas para el promedio de desplazamiento. */
  ventana: 8,
  /** Semanas de historia que se conservan por combinación. */
  historia: 12,
  /** Costo financiero anual del inventario parado. */
  costoCapitalAnual: 0.18,
};

/** Semana de corte del reporte. */
export const CORTE = { anio: 2026, semana: 46, etiqueta: "2026-S46", fecha: "2026-11-15" };

/* ------------------------------------------------------------------ *
 * Situaciones inyectadas: lo que se narra en la junta
 * ------------------------------------------------------------------ */

export type Situacion = {
  id: string;
  titulo: string;
  resumen: string;
  /** Qué debería ver el director en pantalla. */
  evidencia: string;
};

export const SITUACIONES: Situacion[] = [
  {
    id: "saturacion-premium",
    titulo: "Alta gama estancada en el norte",
    resumen:
      "Series 8 y Attesa llevan meses acumulándose en Palacio de Hierro Valle Oriente y Monterrey Centro.",
    evidencia: "Nuevo León en rojo en el mapa, con más de 25 semanas de cobertura en alta gama.",
  },
  {
    id: "quiebre-turismo",
    titulo: "Tsuyosa agotada donde más se vende",
    resumen:
      "Las plazas turísticas venden Tsuyosa al doble del ritmo nacional y son las que se quedaron en cero.",
    evidencia: "Quintana Roo y Baja California Sur con quiebres y la mayor venta perdida semanal.",
  },
  {
    id: "mal-asignado",
    titulo: "Producto colocado en la plaza equivocada",
    resumen:
      "Hay piezas de alta gama en tiendas cuyo ticket promedio no las sostiene. No es un problema de inventario, es de asignación.",
    evidencia: "Oaxaca, Chiapas y Tabasco con inventario premium que no registra desplazamiento.",
  },
  {
    id: "desbalance-jalisco",
    titulo: "Sobra en Jalisco, falta en Querétaro",
    resumen:
      "La misma colección y la misma cadena: una plaza recibió de más y la otra se quedó en cero.",
    evidencia: "Liverpool Jalisco pasa del umbral en las mismas colecciones que Liverpool Querétaro tiene en cero.",
  },
  {
    id: "sin-reporte",
    titulo: "Cuatro tiendas que no entregan información",
    resumen:
      "Sanborns tiene cuatro sucursales sin reportar sell-out. Todo lo que se decida sobre ellas es a ciegas.",
    evidencia: "Salud del dato marca la cobertura de reporte por debajo del mínimo acordado.",
  },
  {
    id: "estacional",
    titulo: "El pico de diciembre llegó sin inventario",
    resumen:
      "Citizen L multiplica su desplazamiento en la última semana de noviembre y el resurtido no lo anticipó.",
    evidencia: "La curva de sell-out se despega del sell-in justo antes del cierre del año.",
  },
  {
    id: "plaza-sana",
    titulo: "Querétaro y Aguascalientes operando en rango",
    resumen:
      "No todo está mal. Dos estados sostienen cobertura dentro del umbral y sirven de referencia.",
    evidencia: "Verde en el mapa, para que el semáforo signifique algo.",
  },
  {
    id: "envejecido",
    titulo: "Corso sin rotar en Sears",
    resumen:
      "Varias tiendas Sears tienen Corso de sobra y lo venden a la mitad del ritmo. Lo que toca es no resurtirles más.",
    evidencia: "Las combinaciones de Corso en Sears aparecen en la lista No resurtir.",
  },
  {
    id: "apertura",
    titulo: "Los Cabos abrió hace catorce semanas",
    resumen:
      "Una tienda nueva no tiene historia suficiente para un promedio de ocho semanas. El sistema lo declara en vez de inventar una cifra.",
    evidencia: "Aparece marcada como tienda nueva y se excluye de los promedios comparables.",
  },
  {
    id: "empuje-cierre",
    titulo: "Resurtido de cierre de mes",
    resumen:
      "El sell-in se dispara la última semana de cada mes, muy por encima de lo que el canal desplaza.",
    evidencia: "Los picos de la línea azul contra la línea naranja, tres veces en doce semanas.",
  },
];

/* ------------------------------------------------------------------ *
 * Tipos del modelo
 * ------------------------------------------------------------------ */

export type ClaseEstado = "sano" | "quiebre" | "alto" | "saturado";

export type Combo = {
  id: string;
  sucursal: Sucursal;
  coleccion: Coleccion;
  /** La referencia concreta. Las alertas se calculan a este nivel. */
  modelo: Modelo;
  /** Precio de lista del modelo, no de la colección. */
  precio: number;
  /** Costo unitario del modelo. */
  costo: number;
  /** Existencia en la semana de corte. */
  inv: number;
  /** Unidades en tránsito. */
  tr: number;
  /** Desplazamiento promedio semanal de la ventana. */
  so: number;
  /**
   * El mismo desplazamiento, pero del mismo corte del año pasado. Es la
   * columna que todo comprador pide primero: no le interesa cuánto vendió
   * esta semana, le interesa si vendió más o menos que el año pasado.
   */
  soAnt: number;
  /** Sell-out semana a semana, el más reciente al final. */
  hist: number[];
  /** Sell-in semana a semana: lo que la marca le resurtió a esa tienda. */
  hin: number[];
  /** Existencia en el corte anterior: la de hoy, menos lo que entró, más lo que salió. */
  invAnt: number;
  /** Desplazamiento promedio de la ventana que cerraba en el corte anterior. */
  soPrev: number;
  /** Cobertura, excedente, capital, venta perdida y semáforo del corte anterior. */
  cobAnt: number;
  excAnt: number;
  capitalAnt: number;
  perdidaAnt: number;
  claseAnt: ClaseEstado;
  /** Días que el inventario lleva en el canal. */
  edad: number;
  /** Semanas de cobertura. 99 significa inventario sin desplazamiento. */
  cob: number;
  /** Stock objetivo en piezas. */
  objetivo: number;
  /** Resurtido sugerido: objetivo menos existencia menos tránsito. */
  sug: number;
  /** Piezas por encima del umbral. */
  exc: number;
  /** Capital inmovilizado a costo, en pesos. */
  capital: number;
  /** Venta perdida semanal estimada a precio de lista. */
  perdida: number;
  /** Clasificación del semáforo. */
  clase: ClaseEstado;
  /** Impacto en pesos: capital parado más venta perdida de cuatro semanas. */
  impacto: number;
};

export type SemanaSerie = {
  semana: number;
  etiqueta: string;
  sellIn: number;
  sellOut: number;
  inventario: number;
};

export type Dataset = {
  combos: Combo[];
  serie: SemanaSerie[];
  cadenas: Cadena[];
  colecciones: Coleccion[];
  estados: Estado[];
  sucursales: Sucursal[];
};

/* ------------------------------------------------------------------ *
 * Generación
 * ------------------------------------------------------------------ */

/** Multiplicador estacional por semana del año, centrado en el cierre de año. */
function estacional(semana: number, fuerza: number) {
  const base =
    1 +
    0.1 * Math.sin((semana / 52) * Math.PI * 2 - 1.2) +
    (semana >= 44 ? (semana - 43) * 0.085 : 0) +
    (semana >= 18 && semana <= 20 ? 0.22 : 0);
  return 1 + (base - 1) * fuerza;
}

/** Afinidad de una colección con un estado y una cadena. */
function afinidad(col: Coleccion, est: Estado, cad: Cadena) {
  let a = 1;
  if (col.segmento === "Alta gama") a *= Math.pow(est.poder, 2.4);
  else if (col.segmento === "Premium") a *= Math.pow(est.poder, 1.5);
  else if (col.segmento === "Medio") a *= Math.pow(est.poder, 0.6);
  else a *= Math.pow(est.poder, 0.2);

  if (col.segmento === "Alta gama" && cad.id === "SAN") a *= 0.18;
  if (col.segmento === "Alta gama" && cad.id === "PDH") a *= 1.75;
  if (col.segmento === "Acceso" && cad.id === "PDH") a *= 0.55;
  if (col.segmento === "Acceso" && cad.id === "SAN") a *= 1.3;
  if (col.id === "TSU") a *= 0.85 + est.turismo * 0.45;
  if (col.id === "CTL" && cad.id === "LIV") a *= 1.2;
  return a;
}

/**
 * Qué modelos tiene surtidos cada sucursal.
 *
 * Primero decide qué colecciones entran por formato y plaza, y después qué
 * referencias de cada colección. Una tienda chica no trae los cuatro modelos
 * de Tsuyosa: trae los que más rotan.
 */
function surtido(suc: Sucursal, rnd: () => number): { col: Coleccion; mod: Modelo }[] {
  const cad = cadenaPorId(suc.cadenaId);
  const est = estadoPorId(suc.estadoId);
  const cols = COLECCIONES.filter((col) => {
    if (col.id === "TCZ") return cad.id === "PDH" && est.poder > 1.15;
    if (col.id === "SAT") return cad.id === "PDH" || (cad.id === "LIV" && suc.fuerza > 1.2);
    if (col.segmento === "Alta gama" && cad.id === "SAN") return false;
    if (col.segmento === "Alta gama") return suc.fuerza > 0.75 || rnd() < 0.3;
    return rnd() > 0.06;
  });

  const salida: { col: Coleccion; mod: Modelo }[] = [];
  for (const col of cols) {
    const mods = modelosDe(col.id);
    const cuantos =
      col.segmento === "Alta gama"
        ? Math.max(1, Math.round(mods.length * Math.min(1, suc.fuerza * 0.62)))
        : Math.max(1, Math.round(mods.length * Math.min(1, 0.45 + suc.fuerza * 0.45)));
    for (const mod of mods.slice(0, cuantos)) salida.push({ col, mod });
  }
  return salida;
}

/**
 * Cuánto creció cada colección contra el año pasado.
 *
 * El rango es el del canal departamental de verdad, no el de una
 * presentación: la categoría crece alrededor de tres puntos al año y lo que
 * se mueve es el mix. Una colección puede caer ocho puntos mientras otra
 * sube catorce, y el agregado apenas se despega del tres por ciento. Un BI
 * que pinta crecimientos de veinte puntos no se le cree a un director que
 * lleva quince años en el ramo.
 *
 * Determinista por id: la misma colección crece lo mismo en cada apertura.
 */
const DERIVAS = new Map<string, number>();
function derivaColeccion(id: string): number {
  const hay = DERIVAS.get(id);
  if (hay !== undefined) return hay;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const v = 0.9 + mulberry32(SEMILLA + h)() * 0.22;
  DERIVAS.set(id, v);
  return v;
}

export function generar(): Dataset {
  const factorAnual = new Map<string, number>();
  const rnd = mulberry32(SEMILLA);
  const combos: Combo[] = [];

  for (const suc of SUCURSALES) {
    const cad = cadenaPorId(suc.cadenaId);
    const est = estadoPorId(suc.estadoId);
    const nueva = suc.apertura > 0;

    for (const { col, mod } of surtido(suc, rnd)) {
      const af = afinidad(col, est, cad);
      // El peso reparte la velocidad de la colección entre sus modelos. El
      // factor compensa que una tienda rara vez trae el surtido completo, sin
      // inflar el total nacional: la colección entera sigue valiendo lo mismo.
      const base =
        col.velocidad * mod.peso * 1.1 * suc.fuerza * af * (0.78 + rnd() * 0.44);
      const precio = Math.round(col.precio * mod.precioRel);
      const costo = Math.round(precio * (1 - col.margen));

      // Historia semanal
      const hist: number[] = [];
      for (let i = 0; i < PARAMS.historia; i++) {
        const semana = CORTE.semana - (PARAMS.historia - 1 - i);
        if (nueva && semana < suc.apertura) {
          hist.push(0);
          continue;
        }
        const e = estacional(semana, col.estacionalidad - 1);
        hist.push(Math.max(0, base * e * (0.72 + rnd() * 0.58)));
      }

      // Promedio de la ventana, sin contar semanas previas a la apertura
      const ventana = hist.slice(-PARAMS.ventana);
      const validas = nueva
        ? ventana.filter((_, i) => CORTE.semana - (PARAMS.ventana - 1 - i) >= suc.apertura)
        : ventana;
      const so = validas.length
        ? validas.reduce((a, b) => a + b, 0) / validas.length
        : 0;

      // El año pasado. El crecimiento tiene dos capas: una deriva propia de
      // la colección y el ruido de cada tienda. Así hay colecciones que caen
      // completas y otras que vuelan, que es como se comporta el negocio de
      // verdad: un promedio nacional sano esconde la colección que se está
      // muriendo, y esa es justamente la lectura que importa.
      const crecimiento = derivaColeccion(col.id) * (0.85 + rnd() * 0.3);
      factorAnual.set(`${suc.clave}|${mod.sku}`, suc.apertura > 0 ? 0 : crecimiento);
      const soAnt = 0; // se calcula abajo, cuando las situaciones ya se aplicaron

      // Inventario: semanas de cobertura objetivo por cadena, con dispersión
      const objetivoSemanas = cad.umbralCadena * (0.6 + rnd() * 0.95);
      let inv = Math.round(so * objetivoSemanas);
      let edad = Math.round(20 + objetivoSemanas * 7 * (0.7 + rnd() * 0.7));
      let tr = rnd() < 0.22 ? Math.round(1 + rnd() * 6) : 0;

      combos.push({
        id: `${suc.clave}|${mod.sku}`,
        sucursal: suc,
        coleccion: col,
        modelo: mod,
        precio,
        costo,
        inv,
        tr,
        so,
        soAnt,
        hist,
        hin: [],
        invAnt: 0,
        soPrev: 0,
        cobAnt: 0,
        excAnt: 0,
        capitalAnt: 0,
        perdidaAnt: 0,
        claseAnt: "sano",
        edad,
        cob: 0,
        objetivo: 0,
        sug: 0,
        exc: 0,
        capital: 0,
        perdida: 0,
        clase: "sano",
        impacto: 0,
      });
    }
  }

  aplicarSituaciones(combos, mulberry32(SEMILLA + 7));

  /* El año anterior se calcula hasta aquí, después de las situaciones. Si se
     calculara antes, una tienda a la que la situación le mueve el inventario
     o el desplazamiento saldría creciendo cincuenta puntos contra sí misma,
     que es ruido, no crecimiento. El crecimiento lo decide la colección. */
  for (const c of combos) {
    const f = factorAnual.get(c.id) ?? 0;
    c.soAnt = f > 0 ? c.so / f : 0;
  }

  const serie = construirSerie(combos);
  repartirSellIn(combos, serie);

  for (const c of combos) derivar(c);

  return {
    combos,
    serie,
    cadenas: CADENAS,
    colecciones: COLECCIONES,
    estados: ESTADOS,
    sucursales: SUCURSALES,
  };
}

/* ------------------------------------------------------------------ *
 * Inyección de las situaciones narrables
 * ------------------------------------------------------------------ */

function aplicarSituaciones(combos: Combo[], rnd: () => number) {
  const busca = (pred: (c: Combo) => boolean) => combos.filter(pred);

  // 1. Alta gama estancada en Nuevo León: toda la gama alta de la plaza
  for (const c of busca(
    (c) =>
      c.sucursal.estadoId === "NLE" &&
      (c.coleccion.segmento === "Alta gama" || c.coleccion.id === "PRO")
  )) {
    c.inv = Math.max(14, Math.round(c.so * (27 + rnd() * 11)));
    c.edad = Math.round(230 + rnd() * 140);
    c.tr = rnd() < 0.5 ? Math.round(2 + rnd() * 4) : 0;
  }
  // y el resto del surtido regiomontano, por encima del umbral sin llegar a crítico
  for (const c of busca(
    (c) => c.sucursal.estadoId === "NLE" && c.coleccion.segmento !== "Alta gama"
  )) {
    if (c.so > 0.05) c.inv = Math.round(c.so * (16 + rnd() * 6));
  }

  // 2. Tsuyosa agotada en plazas turísticas
  for (const c of busca(
    (c) =>
      c.coleccion.id === "TSU" &&
      ["ROO", "BCS", "SIN", "YUC"].includes(c.sucursal.estadoId)
  )) {
    c.so = c.so * 1.75;
    c.hist = c.hist.map((h, i) => h * (1.4 + i * 0.05));
    c.inv = 0;
    c.tr = rnd() < 0.4 ? Math.round(2 + rnd() * 5) : 0;
    c.edad = 0;
  }

  // 2b. Eco-Drive agotado en las tiendas de más tráfico: el volumen también quiebra
  for (const c of busca(
    (c) =>
      c.coleccion.id === "ECO" &&
      c.sucursal.fuerza > 1.05 &&
      ["CMX", "MEX", "JAL", "ROO", "BCN"].includes(c.sucursal.estadoId)
  )) {
    if (rnd() < 0.62) {
      c.inv = 0;
      c.tr = rnd() < 0.5 ? Math.round(3 + rnd() * 8) : 0;
      c.edad = 0;
      c.so = c.so * 1.2;
    }
  }

  // 3. Alta gama colocada donde no hay ticket
  for (const c of busca(
    (c) =>
      c.coleccion.segmento === "Alta gama" &&
      ["OAX", "CHP", "TAB", "MIC", "HID"].includes(c.sucursal.estadoId)
  )) {
    c.so = c.so * 0.04;
    c.hist = c.hist.map(() => 0);
    c.inv = Math.max(2, Math.round(2 + rnd() * 4));
    c.edad = Math.round(300 + rnd() * 180);
  }

  // 4. Sobra en Jalisco, falta en Querétaro — misma cadena, misma colección
  for (const c of busca(
    (c) =>
      c.sucursal.estadoId === "JAL" &&
      c.sucursal.cadenaId === "LIV" &&
      ["TSU", "ECO", "AXI"].includes(c.coleccion.id)
  )) {
    c.inv = Math.round(c.so * (24 + rnd() * 8));
    c.edad = Math.round(150 + rnd() * 70);
  }
  for (const c of busca(
    (c) =>
      c.sucursal.estadoId === "QUE" &&
      c.sucursal.cadenaId === "LIV" &&
      ["TSU", "ECO", "AXI"].includes(c.coleccion.id)
  )) {
    c.inv = 0;
    c.tr = 0;
    c.edad = 0;
    c.so = c.so * 1.25;
  }

  // 6. Pico de Citizen L en el cierre de año, sin inventario que lo acompañe
  for (const c of busca((c) => c.coleccion.id === "CTL")) {
    c.hist = c.hist.map((h, i) => h * (i >= PARAMS.historia - 3 ? 1.9 + i * 0.05 : 1));
    const ventana = c.hist.slice(-PARAMS.ventana);
    c.so = ventana.reduce((a, b) => a + b, 0) / ventana.length;
    c.inv = Math.round(c.inv * (rnd() < 0.45 ? 0.1 : 0.5));
  }

  // 7. Querétaro y Aguascalientes operando en rango
  for (const c of busca(
    (c) =>
      ["QUE", "AGU"].includes(c.sucursal.estadoId) &&
      !(c.sucursal.cadenaId === "LIV" && ["TSU", "ECO", "AXI"].includes(c.coleccion.id))
  )) {
    if (c.so > 0.05) {
      c.inv = Math.round(c.so * (6 + rnd() * 5));
      c.edad = Math.round(45 + rnd() * 60);
    }
  }

  // 8. Corso sin rotar en Sears
  for (const c of busca(
    (c) => c.coleccion.id === "COR" && c.sucursal.cadenaId === "SEA"
  )) {
    c.edad = Math.round(380 + rnd() * 160);
    c.inv = Math.round(c.inv * 1.65);
    c.so = c.so * 0.55;
  }

  // 9. Tienda nueva: sin historia suficiente
  for (const c of busca((c) => c.sucursal.apertura > 0)) {
    c.edad = Math.min(c.edad, (CORTE.semana - c.sucursal.apertura) * 7);
  }

  // 5. Tiendas sin reporte: el inventario existe, el desplazamiento se desconoce
  for (const c of busca((c) => !c.sucursal.reporta)) {
    c.so = 0;
    c.hist = c.hist.map(() => 0);
  }
}

/* ------------------------------------------------------------------ *
 * Derivados
 * ------------------------------------------------------------------ */

export function derivar(c: Combo, umbral = PARAMS.umbral) {
  c.cob = c.so > 0.05 ? c.inv / c.so : c.inv > 0 ? 99 : 0;
  c.objetivo = Math.round((c.so * PARAMS.diasObjetivo) / 7);
  c.sug = Math.max(0, c.objetivo - c.inv - c.tr);

  // Una tienda que no entrega sell-out no tiene excedente calculable: sin
  // denominador no hay cobertura, y declarar un excedente sería inventarlo.
  if (!c.sucursal.reporta) {
    c.exc = 0;
    c.capital = 0;
    c.perdida = 0;
    c.sug = 0;
    c.clase = "sano";
    c.impacto = 0;
    c.cobAnt = 0;
    c.excAnt = 0;
    c.capitalAnt = 0;
    c.perdidaAnt = 0;
    c.claseAnt = "sano";
    return c;
  }

  c.exc = Math.max(0, Math.round(c.inv - c.so * umbral));
  c.capital = Math.round(c.exc * c.costo);
  c.perdida = c.inv === 0 && c.so > 0.15 ? c.so * c.precio : 0;
  c.clase = clasificar(c, umbral);
  c.impacto = Math.round(c.capital + c.perdida * 4);

  // El corte anterior, con las mismas reglas y el mismo umbral que el actual.
  c.cobAnt = c.soPrev > 0.05 ? c.invAnt / c.soPrev : c.invAnt > 0 ? 99 : 0;
  c.excAnt = Math.max(0, Math.round(c.invAnt - c.soPrev * umbral));
  c.capitalAnt = Math.round(c.excAnt * c.costo);
  c.perdidaAnt = c.invAnt === 0 && c.soPrev > 0.15 ? c.soPrev * c.precio : 0;
  c.claseAnt =
    c.cobAnt < PARAMS.coberturaMinima && c.soPrev > 0.15
      ? "quiebre"
      : c.cobAnt <= umbral
        ? "sano"
        : c.cobAnt <= umbral * PARAMS.factorCritico
          ? "alto"
          : "saturado";
  return c;
}

export function clasificar(c: Combo, umbral = PARAMS.umbral): ClaseEstado {
  if (!c.sucursal.reporta) return "sano";
  if (c.cob < PARAMS.coberturaMinima && c.so > 0.15) return "quiebre";
  if (c.cob <= umbral) return "sano";
  if (c.cob <= umbral * PARAMS.factorCritico) return "alto";
  return "saturado";
}

export const ETIQUETA_CLASE: Record<ClaseEstado, string> = {
  sano: "Sano",
  quiebre: "Quiebre",
  alto: "Cobertura alta",
  saturado: "Saturado",
};

/* ------------------------------------------------------------------ *
 * Serie nacional sell-in contra sell-out
 * ------------------------------------------------------------------ */

function construirSerie(combos: Combo[]): SemanaSerie[] {
  const rnd = mulberry32(SEMILLA + 31);
  const serie: SemanaSerie[] = [];
  const invTotal = combos.reduce((a, c) => a + c.inv, 0);

  for (let i = 0; i < PARAMS.historia; i++) {
    const semana = CORTE.semana - (PARAMS.historia - 1 - i);
    const sellOut = Math.round(
      combos.reduce((a, c) => a + (c.hist[i] ?? 0), 0)
    );
    // Resurtido de cierre de mes: cada cuarta semana el sell-in se dispara
    const cierre = (semana + 1) % 4 === 0;
    const factor = cierre ? 2.55 + rnd() * 0.5 : 0.66 + rnd() * 0.22;
    serie.push({
      semana,
      etiqueta: `S${semana}`,
      sellIn: Math.round(sellOut * factor),
      sellOut,
      inventario: Math.round(invTotal * (0.86 + i * 0.013)),
    });
  }
  return serie;
}

/**
 * El sell-in de cada tienda y modelo.
 *
 * La serie nacional ya dice cuánto se resurtió cada semana. Aquí se reparte
 * entre las combinaciones con una regla que cierra con el inventario: lo que
 * entró a una tienda en doce semanas es lo que vendió más lo que le creció la
 * existencia. La existencia de hoy creció la misma proporción en todas, la
 * que hace que el total nacional cuadre al centavo con la serie.
 *
 *   sell-in de la combinación = su sell-out de 12 semanas + beta × su existencia
 *   beta = (sell-in nacional − sell-out nacional) ÷ existencia nacional
 *
 * De ahí sale también el corte anterior: la existencia de hace una semana es
 * la de hoy, menos lo que entró esta semana, más lo que se vendió.
 */
function repartirSellIn(combos: Combo[], serie: SemanaSerie[]) {
  const n = PARAMS.historia;
  const totalIn = serie.reduce((a, s) => a + s.sellIn, 0);
  const totalOut = combos.reduce((a, c) => a + c.hist.reduce((x, y) => x + y, 0), 0);
  const totalInv = combos.reduce((a, c) => a + c.inv, 0);
  const beta = totalInv > 0 ? Math.max(0, (totalIn - totalOut) / totalInv) : 0;
  const forma = serie.map((s) => (totalIn > 0 ? s.sellIn / totalIn : 1 / n));

  for (const c of combos) {
    const out12 = c.hist.reduce((x, y) => x + y, 0);
    const in12 = out12 + beta * c.inv;
    c.hin = forma.map((f) => in12 * f);
    c.invAnt = Math.max(0, Math.round(c.inv - c.hin[n - 1] + c.hist[n - 1]));
    // Un quiebre rara vez nace el mismo lunes: la mayoría de las combinaciones
    // que hoy están en cero ya lo estaban la semana pasada, vendiendo lo poco
    // que les llegaba. Se decide por combinación, siempre igual.
    if (c.inv === 0 && c.invAnt > 0 && c.invAnt <= 3) {
      let h = 0;
      for (let i = 0; i < c.id.length; i++) h = (h * 31 + c.id.charCodeAt(i)) >>> 0;
      if (mulberry32(SEMILLA + h)() < 0.85) c.invAnt = 0;
    }
    const v = PARAMS.ventana;
    const hoy = c.hist.slice(n - v).reduce((x, y) => x + y, 0);
    const antes = c.hist.slice(n - v - 1, n - 1).reduce((x, y) => x + y, 0);
    c.soPrev = hoy > 0.01 ? c.so * (antes / hoy) : c.so;
  }
}

/* ------------------------------------------------------------------ *
 * El calendario del corte
 * ------------------------------------------------------------------ */

const MS_DIA = 86400000;
/** Días de historia cargada: doce semanas completas, de lunes a domingo. */
export const DIAS_HISTORIA = PARAMS.historia * 7;
const FIN_HISTORIA = Date.parse(CORTE.fecha + "T00:00:00Z");
const INICIO_HISTORIA = FIN_HISTORIA - (DIAS_HISTORIA - 1) * MS_DIA;

export const fechaDeDia = (d: number) =>
  new Date(INICIO_HISTORIA + d * MS_DIA).toISOString().slice(0, 10);
export const diaDeFecha = (iso: string) =>
  Math.round((Date.parse(iso + "T00:00:00Z") - INICIO_HISTORIA) / MS_DIA);
export const PRIMER_DIA = fechaDeDia(0);
export const ULTIMO_DIA = CORTE.fecha;

/** Un periodo en días de la historia, los dos extremos incluidos. */
export type Periodo = { desde: number; hasta: number };
export const PERIODO_TODO: Periodo = { desde: 0, hasta: DIAS_HISTORIA - 1 };

export function periodoDe(f: { desde?: string; hasta?: string }): Periodo {
  const lim = (v: number) => Math.max(0, Math.min(DIAS_HISTORIA - 1, v));
  let a = f.desde ? lim(diaDeFecha(f.desde)) : 0;
  let b = f.hasta ? lim(diaDeFecha(f.hasta)) : DIAS_HISTORIA - 1;
  if (!isFinite(a)) a = 0;
  if (!isFinite(b)) b = DIAS_HISTORIA - 1;
  return a <= b ? { desde: a, hasta: b } : { desde: b, hasta: a };
}

export const esPeriodoCompleto = (p: Periodo) => p.desde === 0 && p.hasta === DIAS_HISTORIA - 1;
export const diasDe = (p: Periodo) => p.hasta - p.desde + 1;

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const fechaCorta = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MESES_CORTOS[m - 1]}`;
};
/** "24–30 ago", o "31 ago–6 sep" cuando el rango cruza de mes. Un solo día: "15 nov". */
export function rangoCorto(desde: string, hasta: string): string {
  if (desde === hasta) return fechaCorta(desde);
  const [, m1, d1] = desde.split("-").map(Number);
  const [, m2, d2] = hasta.split("-").map(Number);
  return m1 === m2 ? `${d1}–${d2} ${MESES_CORTOS[m1 - 1]}` : `${fechaCorta(desde)}–${fechaCorta(hasta)}`;
}
/** Las dos mitades de ese rango, para escribirlo en dos renglones: "24–30" y "ago". */
export function rangoPartido(desde: string, hasta: string): [string, string] {
  const [, m1, d1] = desde.split("-").map(Number);
  const [, m2, d2] = hasta.split("-").map(Number);
  if (desde === hasta) return [String(d1), MESES_CORTOS[m1 - 1]];
  return [`${d1}–${d2}`, m1 === m2 ? MESES_CORTOS[m1 - 1] : `${MESES_CORTOS[m1 - 1]}–${MESES_CORTOS[m2 - 1]}`];
}
/**
 * De qué día a qué día va una semana del año, por su número: la S46 es del
 * lunes 9 al domingo 15 de noviembre. Un "S46" a secas obliga a quien lee a
 * ir a buscar un calendario.
 */
export function fechasDeSemana(semana: number): { desde: string; hasta: string } {
  const fin = FIN_HISTORIA - (CORTE.semana - semana) * 7 * MS_DIA;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { desde: iso(fin - 6 * MS_DIA), hasta: iso(fin) };
}
/** "9–15 nov": las fechas de una semana, por su número. */
export const rangoDeSemana = (semana: number) => {
  const f = fechasDeSemana(semana);
  return rangoCorto(f.desde, f.hasta);
};
const DIAS_SEMANA = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

/** "24 ago – 15 nov · 12 semanas" o "9 – 15 nov · 7 días". */
export function etiquetaPeriodo(p: Periodo): string {
  const a = fechaDeDia(p.desde);
  const b = fechaDeDia(p.hasta);
  const dias = diasDe(p);
  const largo = dias % 7 === 0 ? `${dias / 7} ${dias === 7 ? "semana" : "semanas"}` : `${dias} ${dias === 1 ? "día" : "días"}`;
  return (a === b ? fechaCorta(a) : `${fechaCorta(a)} – ${fechaCorta(b)}`) + ` · ${largo}`;
}

/* La carga es semanal. Para contestar por día, cada semana se reparte con el
   peso que cada día tiene en una tienda departamental: el fin de semana vende
   más y el resurtido llega entre semana. Los siete pesos suman uno, así que
   una semana completa vale exactamente lo que vale en la carga. */
const PESO_OUT = [0.1, 0.1, 0.11, 0.12, 0.17, 0.22, 0.18];
const PESO_IN = [0.2, 0.2, 0.2, 0.2, 0.2, 0, 0];

/** Qué parte de cada semana cae dentro del periodo, para sell-out y para sell-in. */
export type Fracciones = { out: number[]; in: number[] };
export function fracciones(p: Periodo): Fracciones {
  const out = Array(PARAMS.historia).fill(0);
  const ent = Array(PARAMS.historia).fill(0);
  for (let d = p.desde; d <= p.hasta; d++) {
    const s = Math.floor(d / 7);
    out[s] += PESO_OUT[d % 7];
    ent[s] += PESO_IN[d % 7];
  }
  // Las semanas completas valen uno exacto, sin el polvo de sumar decimales.
  for (let s = 0; s < PARAMS.historia; s++) {
    if (p.desde <= s * 7 && p.hasta >= s * 7 + 6) {
      out[s] = 1;
      ent[s] = 1;
    }
  }
  return { out, in: ent };
}

/** Piezas vendidas y piezas resurtidas de una combinación dentro del periodo. */
export function enPeriodo(c: Combo, f: Fracciones) {
  let out = 0;
  let ent = 0;
  for (let i = 0; i < c.hist.length; i++) {
    if (f.out[i]) out += c.hist[i] * f.out[i];
    if (f.in[i]) ent += (c.hin[i] ?? 0) * f.in[i];
  }
  return { out, in: ent };
}

export type PuntoSerie = {
  etiqueta: string;
  sellIn: number;
  sellOut: number;
  /** Los días que abarca el punto dentro del periodo. En una serie por día, los dos son el mismo. */
  desde: string;
  hasta: string;
  /** El día de la semana, cuando la serie va por día. */
  dia?: string;
};

/**
 * La serie de sell-in contra sell-out del alcance filtrado y del periodo.
 * Por semana cuando el periodo es largo, por día cuando cabe en tres semanas.
 */
export function serieDe(combos: Combo[], p: Periodo): PuntoSerie[] {
  const n = PARAMS.historia;
  const porSemanaOut = Array(n).fill(0);
  const porSemanaIn = Array(n).fill(0);
  for (const c of combos) {
    for (let i = 0; i < n; i++) {
      porSemanaOut[i] += c.hist[i] ?? 0;
      porSemanaIn[i] += c.hin[i] ?? 0;
    }
  }
  const salida: PuntoSerie[] = [];
  if (diasDe(p) <= 21) {
    for (let d = p.desde; d <= p.hasta; d++) {
      const s = Math.floor(d / 7);
      salida.push({
        etiqueta: fechaCorta(fechaDeDia(d)),
        sellOut: porSemanaOut[s] * PESO_OUT[d % 7],
        sellIn: porSemanaIn[s] * PESO_IN[d % 7],
        desde: fechaDeDia(d),
        hasta: fechaDeDia(d),
        dia: DIAS_SEMANA[d % 7],
      });
    }
    return salida;
  }
  const f = fracciones(p);
  for (let s = 0; s < n; s++) {
    if (!f.out[s] && !f.in[s]) continue;
    salida.push({
      etiqueta: `S${CORTE.semana - (n - 1 - s)}`,
      sellOut: porSemanaOut[s] * f.out[s],
      sellIn: porSemanaIn[s] * f.in[s],
      // Si el periodo corta la semana, las fechas son las de los días que sí cuenta.
      desde: fechaDeDia(Math.max(s * 7, p.desde)),
      hasta: fechaDeDia(Math.min(s * 7 + 6, p.hasta)),
    });
  }
  return salida;
}

/* ------------------------------------------------------------------ *
 * Agregaciones
 * ------------------------------------------------------------------ */

export type Filtro = {
  estado?: string;
  ciudad?: string;
  cadena?: string;
  /** Id de la marca: una casa vende varias y se negocian por separado. */
  marca?: string;
  coleccion?: string;
  /** SKU del modelo. */
  modelo?: string;
  genero?: string;
  material?: string;
  umbral: number;
  /** Periodo de análisis, en fechas ISO. Vacío significa toda la historia cargada. */
  desde?: string;
  hasta?: string;
};

export function filtrar(combos: Combo[], f: Filtro): Combo[] {
  return combos.filter((c) => {
    if (f.estado && c.sucursal.estadoId !== f.estado) return false;
    if (f.ciudad && c.sucursal.ciudad !== f.ciudad) return false;
    if (f.cadena && c.sucursal.cadenaId !== f.cadena) return false;
    if (f.marca && c.coleccion.marcaId !== f.marca) return false;
    if (f.coleccion && c.coleccion.id !== f.coleccion) return false;
    if (f.modelo && c.modelo.sku !== f.modelo) return false;
    if (f.genero && c.modelo.genero !== f.genero) return false;
    if (f.material && c.modelo.material !== f.material) return false;
    return true;
  });
}

/** Cuántos filtros hay puestos, sin contar el umbral. */
export const filtrosActivos = (f: Filtro) =>
  [f.estado, f.ciudad, f.cadena, f.marca, f.coleccion, f.modelo, f.genero, f.material].filter(
    Boolean
  ).length;

export type ResumenEstado = {
  estado: Estado;
  combos: number;
  sucursales: number;
  inv: number;
  so: number;
  cob: number;
  exc: number;
  capital: number;
  quiebres: number;
  perdida: number;
  clase: ClaseEstado;
  sinReporte: number;
  /** Combinaciones por encima del umbral, de cualquier intensidad. */
  sobreUmbral: number;
  /** Impacto total en pesos: capital parado más cuatro semanas de venta perdida. */
  impacto: number;
};

export function porEstado(combos: Combo[], umbral: number): ResumenEstado[] {
  const mapa = new Map<string, ResumenEstado>();
  const sucs = new Map<string, Set<string>>();

  for (const c of combos) {
    const id = c.sucursal.estadoId;
    if (!mapa.has(id)) {
      mapa.set(id, {
        estado: estadoPorId(id),
        combos: 0,
        sucursales: 0,
        inv: 0,
        so: 0,
        cob: 0,
        exc: 0,
        capital: 0,
        quiebres: 0,
        perdida: 0,
        clase: "sano",
        sinReporte: 0,
        sobreUmbral: 0,
        impacto: 0,
      });
      sucs.set(id, new Set());
    }
    const r = mapa.get(id)!;
    sucs.get(id)!.add(c.sucursal.clave);
    r.combos++;
    r.inv += c.inv;
    r.so += c.so;
    r.exc += c.exc;
    r.capital += c.capital;
    if (c.clase === "alto" || c.clase === "saturado") r.sobreUmbral++;
    if (c.clase === "quiebre") {
      r.quiebres++;
      r.perdida += c.perdida;
    }
    if (!c.sucursal.reporta) r.sinReporte++;
  }

  const salida: ResumenEstado[] = [];
  for (const [id, r] of mapa) {
    r.sucursales = sucs.get(id)!.size;
    r.cob = r.so > 0.05 ? r.inv / r.so : r.inv > 0 ? 99 : 0;
    r.impacto = Math.round(r.capital + r.perdida * 4);
    r.clase = claseEstado(r, umbral);
    salida.push(r);
  }
  return salida.sort((a, b) => b.impacto - a.impacto);
}

/**
 * La cobertura promedio de un estado esconde su problema: una plaza con la
 * mitad del surtido saturado y la otra mitad en quiebre promedia "sana".
 * Por eso el estado se clasifica por dónde está su dinero, no por su promedio.
 */
function claseEstado(r: ResumenEstado, umbral: number): ClaseEstado {
  const base = Math.max(1, r.combos);
  const parteSaturada = r.sobreUmbral / base;
  const parteQuiebre = r.quiebres / base;
  const dineroQuiebre = r.perdida * 4;
  const quiebreMarcado = r.quiebres >= 2 && parteQuiebre >= 0.05;

  if (quiebreMarcado && dineroQuiebre > r.capital) return "quiebre";
  if (r.cob > umbral * PARAMS.factorCritico || parteSaturada > 0.5) return "saturado";
  if (r.cob > umbral || parteSaturada > 0.3) return "alto";
  if (quiebreMarcado) return "quiebre";
  return "sano";
}

export type ResumenSucursal = {
  sucursal: Sucursal;
  combos: number;
  inv: number;
  so: number;
  cob: number;
  exc: number;
  capital: number;
  quiebres: number;
  perdida: number;
  clase: ClaseEstado;
};

export function porSucursal(combos: Combo[], umbral: number): ResumenSucursal[] {
  const mapa = new Map<string, ResumenSucursal>();
  for (const c of combos) {
    const k = c.sucursal.clave;
    if (!mapa.has(k)) {
      mapa.set(k, {
        sucursal: c.sucursal,
        combos: 0,
        inv: 0,
        so: 0,
        cob: 0,
        exc: 0,
        capital: 0,
        quiebres: 0,
        perdida: 0,
        clase: "sano",
      });
    }
    const r = mapa.get(k)!;
    r.combos++;
    r.inv += c.inv;
    r.so += c.so;
    r.exc += c.exc;
    r.capital += c.capital;
    if (c.clase === "quiebre") {
      r.quiebres++;
      r.perdida += c.perdida;
    }
  }
  const salida: ResumenSucursal[] = [];
  for (const r of mapa.values()) {
    r.cob = r.so > 0.05 ? r.inv / r.so : r.inv > 0 ? 99 : 0;
    if (!r.sucursal.reporta) r.clase = "sano";
    else if (r.cob > umbral * PARAMS.factorCritico) r.clase = "saturado";
    else if (r.cob > umbral) r.clase = "alto";
    else if (r.quiebres >= Math.max(1, Math.round(r.combos * 0.12))) r.clase = "quiebre";
    else r.clase = "sano";
    salida.push(r);
  }
  return salida;
}

export type Indicadores = {
  /** Piezas vendidas al consumidor en el periodo, y su monto a precio de lista. */
  sellOut: number;
  sellOutMonto: number;
  /** Piezas resurtidas por la marca en el periodo, y su monto a precio de venta a la cadena. */
  sellIn: number;
  sellInMonto: number;
  /** Días que abarca el periodo. */
  dias: number;
  desplazamiento: number;
  inventario: number;
  /** Valor del inventario en canal, a precio de venta a la cadena. */
  inventarioMonto: number;
  cobertura: number;
  saturadas: number;
  quiebres: number;
  /** Venta perdida semanal: en pesos y en piezas. */
  perdida: number;
  perdidaPzas: number;
  capital: number;
  excedente: number;
  coberturaReporte: number;
  sucursales: number;
  reportan: number;
};

export function indicadores(combos: Combo[], periodo: Periodo = PERIODO_TODO): Indicadores {
  const f = fracciones(periodo);
  let sellOut = 0;
  let sellOutMonto = 0;
  let sellIn = 0;
  let sellInMonto = 0;
  let inv = 0;
  let invMonto = 0;
  let so = 0;
  for (const c of combos) {
    const v = enPeriodo(c, f);
    sellOut += v.out;
    sellOutMonto += v.out * c.precio;
    sellIn += v.in;
    sellInMonto += v.in * c.costo;
    inv += c.inv;
    invMonto += c.inv * c.costo;
    so += c.so;
  }
  const sucs = new Set(combos.map((c) => c.sucursal.clave));
  const reportan = new Set(
    combos.filter((c) => c.sucursal.reporta).map((c) => c.sucursal.clave)
  );
  const quiebres = combos.filter((c) => c.clase === "quiebre");

  return {
    sellOut: Math.round(sellOut),
    sellOutMonto,
    sellIn: Math.round(sellIn),
    sellInMonto,
    dias: diasDe(periodo),
    desplazamiento: so,
    inventario: inv,
    inventarioMonto: invMonto,
    cobertura: so > 0.05 ? inv / so : 0,
    saturadas: combos.filter((c) => c.clase === "alto" || c.clase === "saturado").length,
    quiebres: quiebres.length,
    perdida: quiebres.reduce((a, c) => a + c.perdida, 0),
    perdidaPzas: quiebres.reduce((a, c) => a + (c.perdida > 0 ? c.so : 0), 0),
    capital: combos.reduce((a, c) => a + c.capital, 0),
    excedente: combos.reduce((a, c) => a + c.exc, 0),
    coberturaReporte: sucs.size ? (reportan.size / sucs.size) * 100 : 0,
    sucursales: sucs.size,
    reportan: reportan.size,
  };
}

/* ------------------------------------------------------------------ *
 * Los más vendidos y los más resurtidos
 * ------------------------------------------------------------------ */

export type FilaTop = {
  sku: string;
  nombre: string;
  coleccion: string;
  /** Piezas y monto del periodo, en la medida que ordena la lista. */
  piezas: number;
  monto: number;
  /** Parte del total de piezas del alcance. */
  parte: number;
  /** Las piezas de la otra medida, para leer las dos juntas. */
  otras: number;
  /** Variación contra el mismo periodo del año anterior. Solo existe para sell-out. */
  variacion: number | null;
  tiendas: number;
};

export type Top = {
  filas: FilaTop[];
  /** Cuántos modelos tienen movimiento en el alcance, y sus totales. */
  modelos: number;
  piezas: number;
  monto: number;
};

export function top(combos: Combo[], periodo: Periodo, medida: "out" | "in", cuantos = 10): Top {
  const f = fracciones(periodo);
  const m = new Map<string, FilaTop & { ant: number; base: number }>();
  for (const c of combos) {
    const v = enPeriodo(c, f);
    const k = c.modelo.sku;
    if (!m.has(k)) {
      m.set(k, {
        sku: k,
        nombre: c.modelo.nombre,
        coleccion: c.coleccion.nombre,
        piezas: 0,
        monto: 0,
        parte: 0,
        otras: 0,
        variacion: null,
        tiendas: 0,
        ant: 0,
        base: 0,
      });
    }
    const r = m.get(k)!;
    const pz = medida === "out" ? v.out : v.in;
    r.piezas += pz;
    r.monto += pz * (medida === "out" ? c.precio : c.costo);
    r.otras += medida === "out" ? v.in : v.out;
    if (pz > 0.01) r.tiendas++;
    // El año anterior solo se conoce para el sell-out, y solo donde había tienda.
    if (c.soAnt > 0 && c.so > 0) {
      r.base += v.out;
      r.ant += v.out * (c.soAnt / c.so);
    }
  }
  const todas = [...m.values()].filter((r) => r.piezas > 0.5);
  const piezas = todas.reduce((a, r) => a + r.piezas, 0);
  const monto = todas.reduce((a, r) => a + r.monto, 0);
  for (const r of todas) {
    r.parte = piezas > 0 ? (r.piezas / piezas) * 100 : 0;
    r.variacion = medida === "out" && r.ant > 0 ? (r.base / r.ant - 1) * 100 : null;
  }
  return {
    filas: todas.sort((a, b) => b.piezas - a.piezas).slice(0, cuantos),
    modelos: todas.length,
    piezas,
    monto,
  };
}

/* ------------------------------------------------------------------ *
 * Lo que cada cadena ya vendió y lo que se le resurtió
 * ------------------------------------------------------------------ */

export type FilaCadena = {
  id: string;
  nombre: string;
  outPzas: number;
  outMonto: number;
  inPzas: number;
  inMonto: number;
  inv: number;
  invMonto: number;
};

export function porCadena(combos: Combo[], periodo: Periodo = PERIODO_TODO): FilaCadena[] {
  const f = fracciones(periodo);
  const m = new Map<string, FilaCadena>();
  for (const c of combos) {
    const id = c.sucursal.cadenaId;
    if (!m.has(id)) {
      m.set(id, { id, nombre: cadenaPorId(id).nombre, outPzas: 0, outMonto: 0, inPzas: 0, inMonto: 0, inv: 0, invMonto: 0 });
    }
    const r = m.get(id)!;
    const v = enPeriodo(c, f);
    r.outPzas += v.out;
    r.outMonto += v.out * c.precio;
    r.inPzas += v.in;
    r.inMonto += v.in * c.costo;
    r.inv += c.inv;
    r.invMonto += c.inv * c.costo;
  }
  return [...m.values()].sort((a, b) => b.inMonto - a.inMonto);
}

/* ------------------------------------------------------------------ *
 * El corte anterior contra el actual
 * ------------------------------------------------------------------ */

const enAlerta = (k: ClaseEstado) => k !== "sano";

export type CambioCorte = {
  /** Alertas del corte anterior que ya no lo son. */
  resueltas: Combo[];
  /** Alertas que no estaban y aparecieron. */
  nuevas: Combo[];
  /** Alertas que siguen igual o cambiaron de tipo. */
  vigentes: Combo[];
  antes: { alertas: number; excedente: number; capital: number; quiebres: number; perdida: number; perdidaPzas: number };
  hoy: { alertas: number; excedente: number; capital: number; quiebres: number; perdida: number; perdidaPzas: number };
};

export function cambioDeCorte(combos: Combo[]): CambioCorte {
  const r: CambioCorte = {
    resueltas: [],
    nuevas: [],
    vigentes: [],
    antes: { alertas: 0, excedente: 0, capital: 0, quiebres: 0, perdida: 0, perdidaPzas: 0 },
    hoy: { alertas: 0, excedente: 0, capital: 0, quiebres: 0, perdida: 0, perdidaPzas: 0 },
  };
  for (const c of combos) {
    if (!c.sucursal.reporta) continue;
    const a = enAlerta(c.claseAnt);
    const h = enAlerta(c.clase);
    if (a && !h) r.resueltas.push(c);
    else if (!a && h) r.nuevas.push(c);
    else if (a && h) r.vigentes.push(c);
    if (a) r.antes.alertas++;
    if (h) r.hoy.alertas++;
    r.antes.excedente += c.excAnt;
    r.antes.capital += c.capitalAnt;
    r.hoy.excedente += c.exc;
    r.hoy.capital += c.capital;
    if (c.claseAnt === "quiebre") {
      r.antes.quiebres++;
      r.antes.perdida += c.perdidaAnt;
      if (c.perdidaAnt > 0) r.antes.perdidaPzas += c.soPrev;
    }
    if (c.clase === "quiebre") {
      r.hoy.quiebres++;
      r.hoy.perdida += c.perdida;
      if (c.perdida > 0) r.hoy.perdidaPzas += c.so;
    }
  }
  const porImpacto = (x: Combo, y: Combo) => y.impacto - x.impacto;
  r.nuevas.sort(porImpacto);
  r.vigentes.sort(porImpacto);
  r.resueltas.sort((x, y) => y.capitalAnt + y.perdidaAnt * 4 - (x.capitalAnt + x.perdidaAnt * 4));
  return r;
}

/**
 * Las mismas combinaciones, vistas como estaban en el corte anterior.
 *
 * Devuelve copias con la existencia, el desplazamiento y el semáforo de hace
 * una semana, para que porEstado y porSucursal pinten el mapa anterior con
 * exactamente las mismas reglas que el actual.
 */
export function comoEnCorteAnterior(combos: Combo[]): Combo[] {
  return combos.map((c) => ({
    ...c,
    inv: c.invAnt,
    so: c.soPrev,
    cob: c.cobAnt,
    exc: c.excAnt,
    capital: c.capitalAnt,
    perdida: c.perdidaAnt,
    clase: c.claseAnt,
    impacto: Math.round(c.capitalAnt + c.perdidaAnt * 4),
  }));
}

/** El corte anterior al vigente, con la misma forma que CORTE. */
export const CORTE_ANTERIOR = {
  semana: CORTE.semana - 1,
  etiqueta: `${CORTE.anio}-S${CORTE.semana - 1}`,
  /** Los días que abarca: "2–8 nov". */
  rango: rangoDeSemana(CORTE.semana - 1),
};
/** Los días que abarca el corte vigente: "9–15 nov". */
export const CORTE_RANGO = rangoDeSemana(CORTE.semana);

/* ------------------------------------------------------------------ *
 * Utilidades de formato
 * ------------------------------------------------------------------ */

/**
 * Formato de número propio, no `toLocaleString`.
 *
 * Node y el navegador no siempre traen los mismos datos de localización: el
 * separador de millares puede salir distinto en el servidor y en el cliente, y
 * eso rompe la hidratación de React. Formateando a mano, el servidor y el
 * navegador producen exactamente el mismo texto.
 */
export const fmt = (n: number, d = 0) => {
  const v = isFinite(n) ? n : 0;
  const neg = v < 0;
  const abs = Math.abs(v);
  const fijo = abs.toFixed(d);
  const [ent, dec] = fijo.split(".");
  const conMiles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (neg ? "-" : "") + conMiles + (dec ? "." + dec : "");
};

/** El signo va antes del símbolo de moneda: −$333 M, no $−333 M. */
const conSigno = (n: number, cuerpo: string) => (n < 0 ? "−$" : "$") + cuerpo;

export const money = (n: number) => {
  const v = Math.round(isFinite(n) ? n : 0);
  return conSigno(v, fmt(Math.abs(v)));
};

export const moneyCorto = (n: number) => {
  const v = isFinite(n) ? n : 0;
  const a = Math.abs(v);
  if (a >= 1e9) return conSigno(v, fmt(a / 1e9, 1) + " MMM");
  if (a >= 1e6) return conSigno(v, fmt(a / 1e6, 1) + " M");
  if (a >= 1e3) return conSigno(v, fmt(a / 1e3, 0) + " mil");
  return conSigno(v, fmt(a));
};

export const pct = (n: number, d = 1) => fmt(n, d) + "%";
