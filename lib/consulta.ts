/**
 * El motor de consulta de Argos.
 *
 * Argos tenía un defecto de fondo: no leía la pregunta. Le pedían el sell-out
 * de la semana y contestaba con el resumen del corte, porque lo único que
 * sabía hacer sin un modelo era recitar el panorama. Eso no es un copiloto,
 * es un contestador automático, y un director lo nota a la segunda pregunta.
 *
 * Este archivo hace lo que hacía falta: entiende QUÉ se pregunta y lo calcula.
 * Una pregunta de negocio casi siempre tiene tres piezas:
 *
 *   la medida     sell-out, venta, inventario, cobertura, capital, quiebres…
 *   el periodo    esta semana, este mes, las últimas 8 o 12 semanas
 *   la entidad    una cadena, una colección, un estado, una tienda, un modelo
 *
 * y a veces una cuarta, el desglose: "por cadena", "qué colección vende más".
 *
 * Con esas piezas la respuesta no se redacta de memoria: se CALCULA sobre las
 * combinaciones del corte, en el momento, y por eso contesta lo que se le
 * preguntó y no otra cosa. No hay textos de relleno. Si la pregunta es del
 * negocio pero no hay con qué calcularla, lo dice. Si no es del negocio, dice
 * que no le toca.
 *
 * Cuando hay un modelo de lenguaje conectado, este cálculo viaja con la
 * pregunta como evidencia: el modelo redacta, las cifras salen de aquí.
 */

import { CORTE, PARAMS, fmt, moneyCorto, type Combo, type Dataset } from "./engine";
import { CADENAS, COLECCIONES, ESTADOS, MARCAS, cadenaPorId, estadoPorId, marcaPorId } from "./catalog";
import type { Hallazgo } from "./copiloto";

/* ------------------------------------------------------------------ *
 * Tipos
 * ------------------------------------------------------------------ */

export type TipoRespuesta =
  /** Una cifra calculada sobre el corte. */
  | "dato"
  /** Una explicación de cómo funciona una regla o una medida. */
  | "concepto"
  /** Las prioridades, armadas con los hallazgos. */
  | "prioridad"
  | "saludo"
  /** Del negocio, pero sin datos para calcularla. */
  | "sin-datos"
  /** No es una pregunta de este tablero. */
  | "fuera";

export type Respuesta = { tipo: TipoRespuesta; texto: string; hilo?: Hilo };

/**
 * De qué se venía hablando. Sirve para las preguntas de seguimiento: "¿y en
 * Sears?" solo cambia de quién se habla; "¿y esta semana?", solo el periodo.
 * Lo demás es lo de la pregunta anterior.
 */
export type Hilo = { medida?: string; dim?: string; p: unknown; e: unknown };

export type PlanActivo = {
  nombre: string;
  ingreso: number;
  margenBruto: number;
  margenPct: number;
  ebitda: number;
  ebitdaPct: number;
  otros: { nombre: string; ebitda: number; ebitdaPct: number; ingreso: number }[];
};

export type Entorno = {
  /** Lo que la pantalla tiene filtrado. */
  vista: Combo[];
  /** El corte completo, para cuando la pregunta nombra algo que el filtro dejó fuera. */
  todos: Combo[];
  data: Dataset;
  hallazgos: Hallazgo[];
  umbral: number;
  /** Cómo se llama el alcance de los filtros: "todo el canal", "Liverpool · Jalisco". */
  alcance: string;
  plan?: PlanActivo;
};

/* ------------------------------------------------------------------ *
 * Leer la pregunta
 * ------------------------------------------------------------------ */

/** Sin acentos, en minúsculas y con los guiones como espacios. */
export const plano = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[-_/]/g, " ")
    .replace(/[¿?¡!.,;:"()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tiene = (q: string, palabras: string[]) => palabras.some((p) => q.includes(p));

type Medida =
  | "sellout"
  | "venta"
  | "sellin"
  | "inventario"
  | "cobertura"
  | "capital"
  | "excedente"
  | "quiebre"
  | "perdida"
  | "margen"
  | "variacion"
  | "resurtido"
  | "transito"
  | "precio"
  | "red"
  | "impacto"
  | "traslado"
  | "plan";

/* El orden importa: la primera que coincide gana. "Venta perdida" tiene que
   revisarse antes que "venta", y "sell-out" antes que "venta" también. */
const MEDIDAS: { id: Medida; palabras: string[] }[] = [
  { id: "perdida", palabras: ["venta perdida", "perdiendo", "pierdo", "perdemos", "perdida", "dejando de vender", "dejo de vender", "dejamos de vender"] },
  { id: "sellin", palabras: ["sell in", "sellin", "embarque", "embarcado", "embarcamos", "embarco", "se surtio", "surtimos"] },
  { id: "sellout", palabras: ["sell out", "sellout", "desplazamiento", "desplazo", "se vendio", "vendimos", "vendieron", "vendio", "piezas vendidas", "unidades vendidas", "cuanto se vende", "cuanto vende", "vende mas", "vende menos", "venden mas", "venden menos"] },
  { id: "traslado", palabras: ["traslad", "mover piezas", "que muevo", "mover de"] },
  { id: "plan", palabras: ["ebitda", "escenario", "plan 2027", "el plan", "del plan", "proyeccion", "presupuesto", "estado de resultados"] },
  { id: "margen", palabras: ["margen", "utilidad bruta", "rentab"] },
  { id: "capital", palabras: ["capital", "inmovilizado", "dinero parado", "dinero detenido", "dinero tengo detenido", "dinero atorado"] },
  { id: "excedente", palabras: ["excedente", "exceso", "sobreinventario", "sobrante", "piezas de mas", "saturad", "saturacion", "sobre el umbral", "encima del umbral"] },
  { id: "quiebre", palabras: ["quiebre", "agot", "se acab", "acabando", "sin existencia", "desabasto", "faltante", "en cero"] },
  { id: "cobertura", palabras: ["cobertura", "semanas de inventario", "rotacion", "dias de inventario", "cuantas semanas"] },
  { id: "resurtido", palabras: ["resurt", "sugerido", "reponer", "reabastec", "que pido", "cuanto pido", "pedido sugerido"] },
  { id: "transito", palabras: ["transito", "en camino", "por llegar"] },
  { id: "inventario", palabras: ["inventario", "existencia", "stock", "piezas en canal", "piezas tengo", "piezas hay", "cuantas piezas", "piezas en"] },
  { id: "variacion", palabras: ["se esta cayendo", "ano pasado", "ano anterior", "crecimiento", "crecio", "crecimos", "crece", "cayo", "caida", "cayendo", "cae", "variacion", "comparado con", "contra el ano"] },
  { id: "red", palabras: ["cuantas tiendas", "cuantas sucursales", "numero de tiendas", "puntos de venta", "no reportan", "sin reporte", "no reporta", "reportan", "calidad del dato", "brecha de informacion"] },
  { id: "precio", palabras: ["precio promedio", "ticket promedio", "ticket", "precio"] },
  { id: "venta", palabras: ["venta", "ventas", "ingreso", "facturacion", "facturo", "vendido"] },
  { id: "impacto", palabras: ["impacto", "atiendo primero", "atender primero", "mas urgente", "prioridad", "priorizo", "que hago", "que atiendo", "tres cosas", "por donde empiezo", "resumen", "resumeme", "panorama", "como vamos", "que le enseno"] },
];

type Dimension = "cadena" | "coleccion" | "marca" | "estado" | "ciudad" | "tienda" | "modelo" | "genero" | "segmento";

const DIMENSIONES: { id: Dimension; nombre: string; palabras: string[] }[] = [
  { id: "cadena", nombre: "cadena", palabras: ["por cadena", "cada cadena", "que cadena", "cual cadena", "cuales cadenas", "entre cadenas", "las cadenas"] },
  { id: "coleccion", nombre: "colección", palabras: ["por coleccion", "cada coleccion", "que coleccion", "cual coleccion", "que colecciones", "cuales colecciones", "las colecciones"] },
  { id: "marca", nombre: "marca", palabras: ["por marca", "cada marca", "que marca", "cual marca", "las marcas"] },
  { id: "estado", nombre: "estado", palabras: ["por estado", "cada estado", "que estado", "cual estado", "que estados", "cuales estados", "los estados", "por plaza", "que plaza"] },
  { id: "ciudad", nombre: "ciudad", palabras: ["por ciudad", "cada ciudad", "que ciudad", "cual ciudad", "que ciudades", "las ciudades"] },
  { id: "tienda", nombre: "tienda", palabras: ["por tienda", "por sucursal", "cada tienda", "que tienda", "cual tienda", "que tiendas", "cuales tiendas", "que sucursal", "cual sucursal", "que sucursales", "las tiendas", "mejores tiendas", "peores tiendas"] },
  { id: "modelo", nombre: "modelo", palabras: ["por modelo", "por sku", "cada modelo", "que modelo", "cual modelo", "que modelos", "cuales modelos", "que sku", "que referencia", "que reloj", "que relojes", "los modelos", "top de modelos", "mejores modelos", "que producto", "que productos"] },
  { id: "genero", nombre: "género", palabras: ["por genero", "hombre o mujer", "caballero o dama"] },
  { id: "segmento", nombre: "segmento", palabras: ["por segmento", "que segmento", "cual segmento"] },
];

/* La dimensión dicha a secas, que solo cuenta como desglose si la pregunta
   trae además una palabra de orden: "top 5 modelos", "la tienda con menos". */
const SUELTAS: [string, Dimension][] = [
  ["modelos", "modelo"], ["modelo", "modelo"], ["skus", "modelo"], ["relojes", "modelo"], ["referencias", "modelo"], ["productos", "modelo"],
  ["tiendas", "tienda"], ["tienda", "tienda"], ["sucursales", "tienda"], ["sucursal", "tienda"],
  ["cadenas", "cadena"], ["cadena", "cadena"],
  ["colecciones", "coleccion"], ["coleccion", "coleccion"],
  ["estados", "estado"], ["estado", "estado"], ["plazas", "estado"],
  ["ciudades", "ciudad"], ["ciudad", "ciudad"],
  ["marcas", "marca"], ["marca", "marca"],
];

/* ------------------------------------------------------------------ *
 * Entidades: lo que la pregunta nombra
 * ------------------------------------------------------------------ */

type Entidades = {
  cadena?: string;
  coleccion?: string;
  marca?: string;
  estado?: string;
  ciudad?: string;
  sku?: string;
  tienda?: string;
  genero?: string;
  segmento?: string;
  /** Cómo decirlo: "Liverpool · Tsuyosa". */
  nombres: string[];
};

const ALIAS_CADENA: Record<string, string[]> = {
  LIV: ["liverpool"],
  PDH: ["palacio de hierro", "el palacio", "palacio", "pdh"],
  SEA: ["sears"],
  SAN: ["sanborns", "sanborn"],
};

const ALIAS_ESTADO: Record<string, string[]> = {
  "Ciudad de México": ["cdmx", "ciudad de mexico", "distrito federal", "la capital"],
  "Estado de México": ["edomex", "estado de mexico"],
  "Nuevo León": ["nuevo leon", "monterrey"],
};

function entidades(q0: string, todos: Combo[]): { e: Entidades; resto: string } {
  let q = ` ${q0} `;
  const e: Entidades = { nombres: [] };
  const quitar = (frase: string) => {
    q = q.replace(` ${frase} `, "  ");
  };
  const esta = (frase: string) => q.includes(` ${frase} `);

  // SKU: lo más específico va primero.
  const sku = q.match(/\b(ctz|bul)\s?([a-z]{2}\d{3,4})\b/);
  if (sku) {
    const buscado = `${sku[1]}-${sku[2]}`.toUpperCase();
    const hay = todos.find((c) => c.modelo.sku.toUpperCase() === buscado);
    if (hay) {
      e.sku = hay.modelo.sku;
      e.nombres.push(hay.modelo.sku);
      quitar(sku[0]);
    }
  }

  // Colecciones antes que marcas: "The Citizen" y "Citizen L" contienen "citizen".
  const cols = [...COLECCIONES].sort((a, b) => b.nombre.length - a.nombre.length);
  for (const c of cols) {
    const n = plano(c.nombre);
    const variantes = [n, n.replace(/ /g, "")];
    const v = variantes.find((x) => esta(x));
    if (v) {
      e.coleccion = c.id;
      e.nombres.push(c.nombre);
      quitar(v);
      break;
    }
  }

  for (const m of MARCAS) {
    if (esta(plano(m.nombre))) {
      e.marca = m.id;
      // Si ya hay colección, la marca no agrega nada al nombre.
      if (!e.coleccion) e.nombres.push(m.nombre);
      quitar(plano(m.nombre));
      break;
    }
  }

  for (const c of CADENAS) {
    const alias = [...(ALIAS_CADENA[c.id] ?? []), plano(c.nombre)].sort((a, b) => b.length - a.length);
    const v = alias.find((x) => esta(x));
    if (v) {
      e.cadena = c.id;
      e.nombres.push(c.nombre);
      quitar(v);
      break;
    }
  }

  // Tienda por su plaza: "Perisur", "Valle Oriente". Antes que estado y
  // ciudad porque es más específica.
  const plazas = new Map<string, string>();
  for (const c of todos) {
    const p = plano(c.sucursal.plaza);
    if (p.length >= 5) plazas.set(p, c.sucursal.plaza);
  }
  for (const [p, nombre] of [...plazas].sort((a, b) => b[0].length - a[0].length)) {
    if (esta(p)) {
      e.tienda = nombre;
      e.nombres.push(nombre);
      quitar(p);
      break;
    }
  }

  if (!e.tienda) {
    for (const s of [...ESTADOS].sort((a, b) => b.nombre.length - a.nombre.length)) {
      const alias = [...(ALIAS_ESTADO[s.nombre] ?? []), plano(s.nombre)];
      const v = alias.find((x) => esta(x));
      if (v) {
        e.estado = s.id;
        e.nombres.push(s.nombre);
        quitar(v);
        break;
      }
    }
    if (!e.estado) {
      const ciudades = new Set(todos.map((c) => c.sucursal.ciudad));
      for (const ciudad of [...ciudades].sort((a, b) => b.length - a.length)) {
        if (esta(plano(ciudad))) {
          e.ciudad = ciudad;
          e.nombres.push(ciudad);
          quitar(plano(ciudad));
          break;
        }
      }
    }
  }

  if (tiene(q, [" hombre ", " hombres ", " caballero ", " caballeros "])) {
    e.genero = "Hombre";
    e.nombres.push("hombre");
  } else if (tiene(q, [" mujer ", " mujeres ", " dama ", " damas "])) {
    e.genero = "Mujer";
    e.nombres.push("mujer");
  } else if (esta("unisex")) {
    e.genero = "Unisex";
    e.nombres.push("unisex");
  }

  if (esta("alta gama")) {
    e.segmento = "Alta gama";
    e.nombres.push("alta gama");
  } else if (esta("premium")) {
    e.segmento = "Premium";
    e.nombres.push("premium");
  }

  return { e, resto: q.trim() };
}

function aplicar(combos: Combo[], e: Entidades): Combo[] {
  return combos.filter(
    (c) =>
      (!e.sku || c.modelo.sku === e.sku) &&
      (!e.coleccion || c.coleccion.id === e.coleccion) &&
      (!e.marca || c.coleccion.marcaId === e.marca) &&
      (!e.cadena || c.sucursal.cadenaId === e.cadena) &&
      (!e.tienda || c.sucursal.plaza === e.tienda) &&
      (!e.estado || c.sucursal.estadoId === e.estado) &&
      (!e.ciudad || c.sucursal.ciudad === e.ciudad) &&
      (!e.genero || c.modelo.genero === e.genero) &&
      (!e.segmento || c.coleccion.segmento === e.segmento)
  );
}

/* ------------------------------------------------------------------ *
 * El periodo
 * ------------------------------------------------------------------ */

type Periodo = {
  /** Semanas que abarca, contadas hacia atrás desde el corte. */
  n: number;
  /** Semanas que se salta antes de empezar: 1 para "la semana pasada". */
  salto: number;
  /** Si la pregunta lo pidió o se tomó el de omisión. */
  pedido: boolean;
  /** Proyección a doce meses en vez de historia. */
  anual: boolean;
};

const NUMEROS: Record<string, number> = {
  una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
};

function periodo(q: string): Periodo {
  const H = PARAMS.historia;
  if (tiene(q, ["semana pasada", "semana anterior"])) return { n: 1, salto: 1, pedido: true, anual: false };
  const m = q.match(/(?:ultimas?|pasadas?)?\s*(\d{1,2}|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce) semanas/);
  if (m) {
    const n = Math.max(1, Math.min(H, Number(m[1]) || NUMEROS[m[1]] || 8));
    return { n, salto: 0, pedido: true, anual: false };
  }
  if (tiene(q, ["esta semana", "la semana", "semana actual", "ultima semana", "de la semana", "en la semana", "semanal", "hoy", "ayer", "al dia"]))
    return { n: 1, salto: 0, pedido: true, anual: false };
  if (tiene(q, ["mes pasado", "mes anterior"])) return { n: 4, salto: 4, pedido: true, anual: false };
  if (tiene(q, ["este mes", "del mes", "el mes", "mes actual", "ultimo mes", "mensual", "en el mes"]))
    return { n: 4, salto: 0, pedido: true, anual: false };
  if (tiene(q, ["dos meses", "bimestre"])) return { n: 8, salto: 0, pedido: true, anual: false };
  if (tiene(q, ["trimestre", "tres meses"])) return { n: 12, salto: 0, pedido: true, anual: false };
  if (!tiene(q, ["ano pasado", "ano anterior"]) && tiene(q, ["al ano", "anual", "este ano", "del ano", "doce meses", "12 meses"]))
    return { n: 8, salto: 0, pedido: true, anual: true };
  return { n: PARAMS.ventana, salto: 0, pedido: false, anual: false };
}

/** "la semana S46", "las últimas 4 semanas (S43 a S46)". */
function nombrePeriodo(p: Periodo): string {
  const fin = CORTE.semana - p.salto;
  const ini = fin - p.n + 1;
  if (p.n === 1) return p.salto ? `la semana pasada (S${fin})` : `la semana del corte (S${fin})`;
  if (p.salto) return `las ${p.n} semanas anteriores (S${ini} a S${fin})`;
  return `las últimas ${p.n} semanas (S${ini} a S${fin})`;
}

/** Piezas desplazadas por una combinación en el periodo. */
function piezas(c: Combo, p: Periodo): number {
  const H = c.hist.length;
  // Las ocho semanas de la ventana usan el mismo promedio que el resto de la
  // plataforma, para que la cifra de Argos sea la del tablero y no una prima.
  if (p.n === PARAMS.ventana && p.salto === 0) return c.so * PARAMS.ventana;
  const fin = H - p.salto;
  const ini = Math.max(0, fin - p.n);
  let s = 0;
  for (let i = ini; i < fin; i++) s += c.hist[i] ?? 0;
  return s;
}

/* ------------------------------------------------------------------ *
 * Las cifras de un conjunto de combinaciones
 * ------------------------------------------------------------------ */

type Cifras = {
  combos: number;
  tiendas: number;
  pz: number;
  venta: number;
  pzPrev: number | null;
  pzAnt: number;
  ventaAnt: number;
  inv: number;
  invCosto: number;
  tr: number;
  soSem: number;
  cob: number;
  exc: number;
  capital: number;
  sobre: number;
  quiebres: number;
  perdida: number;
  costo: number;
  sug: number;
  impacto: number;
};

function cifras(S: Combo[], p: Periodo): Cifras {
  let pz = 0, venta = 0, pzPrev = 0, pzAnt = 0, ventaAnt = 0, inv = 0, invCosto = 0, tr = 0;
  let soSem = 0, exc = 0, capital = 0, sobre = 0, quiebres = 0, perdida = 0, costo = 0, sug = 0, impacto = 0;
  const hayPrev = p.salto + p.n * 2 <= PARAMS.historia && !(p.n === PARAMS.ventana);
  const previo: Periodo = { ...p, salto: p.salto + p.n };
  const tiendas = new Set<string>();

  for (const c of S) {
    const u = piezas(c, p);
    pz += u;
    venta += u * c.precio;
    costo += u * c.costo;
    if (hayPrev) pzPrev += piezas(c, previo);
    pzAnt += c.soAnt * p.n;
    ventaAnt += c.soAnt * p.n * c.precio;
    inv += c.inv;
    invCosto += c.inv * c.costo;
    tr += c.tr;
    soSem += c.so;
    exc += c.exc;
    capital += c.capital;
    if (c.clase === "alto" || c.clase === "saturado") sobre++;
    if (c.clase === "quiebre") {
      quiebres++;
      perdida += c.perdida;
    }
    sug += c.sug;
    impacto += c.impacto;
    tiendas.add(c.sucursal.clave);
  }

  return {
    combos: S.length,
    tiendas: tiendas.size,
    pz, venta, pzPrev: hayPrev ? pzPrev : null, pzAnt, ventaAnt,
    inv, invCosto, tr, soSem,
    // La misma cuenta que hace el tablero: piezas del grupo entre
    // desplazamiento del grupo. Si Argos diera 10.2 donde la pantalla dice
    // 10.4, nadie volvería a creerle ninguna de las dos cifras.
    cob: soSem > 0.05 ? inv / soSem : 0,
    exc, capital, sobre, quiebres, perdida, costo, sug, impacto,
  };
}

/** La ventana de ocho semanas, que es la de omisión en toda la plataforma. */
const P8: Periodo = { n: PARAMS.ventana, salto: 0, pedido: false, anual: false };

const signo = (v: number) => `${v >= 0 ? "+" : "−"}${fmt(Math.abs(v), 1)}%`;
const variacion = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : 0);

/* ------------------------------------------------------------------ *
 * Desgloses
 * ------------------------------------------------------------------ */

function clave(c: Combo, d: Dimension): string {
  switch (d) {
    case "cadena": return cadenaPorId(c.sucursal.cadenaId).nombre;
    case "coleccion": return c.coleccion.nombre;
    case "marca": return marcaPorId(c.coleccion.marcaId).nombre;
    case "estado": return estadoPorId(c.sucursal.estadoId).nombre;
    case "ciudad": return c.sucursal.ciudad;
    case "tienda": return c.sucursal.nombre;
    case "modelo": return `${c.modelo.sku} ${c.modelo.nombre}`;
    case "genero": return c.modelo.genero;
    case "segmento": return c.coleccion.segmento;
  }
}

function grupos(S: Combo[], d: Dimension): Map<string, Combo[]> {
  const m = new Map<string, Combo[]>();
  for (const c of S) {
    const k = clave(c, d);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(c);
  }
  return m;
}

/** El número con el que se ordena y cómo se escribe, por medida. */
function valorDe(m: Medida, x: Cifras): { v: number; txt: string } {
  switch (m) {
    case "sellout": return { v: x.pz, txt: `${fmt(x.pz)} piezas (${moneyCorto(x.venta)})` };
    case "venta": return { v: x.venta, txt: `${moneyCorto(x.venta)} (${fmt(x.pz)} piezas)` };
    case "inventario": return { v: x.inv, txt: `${fmt(x.inv)} piezas, ${fmt(x.cob, 1)} semanas de cobertura` };
    case "cobertura": return { v: x.cob, txt: `${fmt(x.cob, 1)} semanas (${fmt(x.inv)} piezas)` };
    case "capital": return { v: x.capital, txt: `${moneyCorto(x.capital)} inmovilizados (${fmt(x.exc)} piezas de más)` };
    case "excedente": return { v: x.exc, txt: `${fmt(x.exc)} piezas sobre el umbral (${moneyCorto(x.capital)})` };
    case "quiebre": return { v: x.quiebres, txt: `${fmt(x.quiebres)} quiebres, ${moneyCorto(x.perdida)} por semana` };
    case "perdida": return { v: x.perdida, txt: `${moneyCorto(x.perdida)} por semana (${fmt(x.quiebres)} quiebres)` };
    case "margen": {
      const pct = x.venta > 0 ? ((x.venta - x.costo) / x.venta) * 100 : 0;
      return { v: pct, txt: `${fmt(pct, 1)}% (${moneyCorto(x.venta - x.costo)})` };
    }
    case "variacion": {
      const v = variacion(x.venta, x.ventaAnt);
      return { v, txt: `${signo(v)} (${moneyCorto(x.venta)} contra ${moneyCorto(x.ventaAnt)})` };
    }
    case "resurtido": return { v: x.sug, txt: `${fmt(x.sug)} piezas sugeridas` };
    case "transito": return { v: x.tr, txt: `${fmt(x.tr)} piezas en tránsito` };
    case "precio": {
      const pm = x.pz > 0 ? x.venta / x.pz : 0;
      return { v: pm, txt: `$${fmt(pm)} por pieza` };
    }
    default: return { v: x.impacto, txt: `${moneyCorto(x.impacto)} de impacto (${moneyCorto(x.capital)} parados, ${fmt(x.quiebres)} quiebres)` };
  }
}

const NOMBRE_MEDIDA: Record<Medida, string> = {
  sellout: "sell-out", venta: "venta", sellin: "sell-in", inventario: "inventario", cobertura: "cobertura",
  capital: "capital inmovilizado", excedente: "excedente", quiebre: "quiebres", perdida: "venta perdida",
  margen: "margen", variacion: "variación contra el año anterior", resurtido: "resurtido sugerido",
  transito: "tránsito", precio: "precio promedio", red: "red", impacto: "impacto", traslado: "traslados", plan: "plan",
};

function desglose(S: Combo[], m: Medida, d: Dimension, p: Periodo, q: string, donde: string): string {
  const dim = DIMENSIONES.find((x) => x.id === d)!;
  const g = [...grupos(S, d)].map(([k, cs]) => ({ k, ...valorDe(m, cifras(cs, p)) }));
  // La cobertura de un grupo sin desplazamiento es cero y no dice nada.
  const menos = tiene(q, ["menos", "peor", "peores", "menor", "mas bajo", "mas baja", "se cae", "cayendo", "cayo", "caida"]);
  // Un grupo en cero no es el "menor" de nada: es un grupo donde eso no pasa.
  const conteo = m === "cobertura" || m === "quiebre" || m === "perdida" || m === "capital" || m === "excedente" || m === "resurtido" || m === "transito";
  const util = g.filter((x) => (conteo ? x.v > 0 : true));
  util.sort((a, b) => (menos ? a.v - b.v : b.v - a.v));

  const pedidos = q.match(/top (\d{1,2})|(\d{1,2}) (?:mejores|peores|principales|primeros|primeras)|(?:mejores|peores|principales|primeros|primeras) (\d{1,2})/);
  const unico = plano(dim.nombre);
  const singular = tiene(` ${q} `, [` que ${unico} `, ` cual ${unico} `, ` la ${unico} `, ` el ${unico} `]) && !q.includes(`por ${unico}`);
  const n = pedidos ? Number(pedidos[1] ?? pedidos[2] ?? pedidos[3]) : singular ? 3 : d === "cadena" || d === "marca" || d === "genero" || d === "segmento" ? util.length : 5;
  // Si son pocos grupos se enseñan todos: decir "hay 1 más" es hacer
  // preguntar dos veces por algo que cabía en la primera respuesta.
  const lista = util.length <= 6 ? util : util.slice(0, Math.max(1, Math.min(n, 15)));
  if (!lista.length) return `No hay datos de ${NOMBRE_MEDIDA[m]} por ${dim.nombre} ${donde}.`;

  const conPeriodo = m === "sellout" || m === "venta" || m === "margen" || m === "variacion" || m === "precio";
  const cab =
    `${menos ? "De menor a mayor" : "De mayor a menor"}, ${NOMBRE_MEDIDA[m]} por ${dim.nombre} ${donde}` +
    (conPeriodo ? `, en ${nombrePeriodo(p)}` : "") + ":";
  const cuerpo = lista.map((x, i) => `${i + 1}. ${x.k}: ${x.txt}`).join("\n");
  const resto = util.length > lista.length ? `\nHay ${util.length - lista.length} más; pídeme el top que necesites.` : "";
  return `${cab}\n${cuerpo}${resto}`;
}

/* ------------------------------------------------------------------ *
 * Conceptos: cómo funciona una regla
 * ------------------------------------------------------------------ */

function concepto(q: string, x: Entorno, cobCanal: number): string | null {
  const explica = tiene(q, ["por que", "que es", "que significa", "como se calcula", "como calculas", "como funciona", "explicame", "explica", "a que te refieres", "que quiere decir", "definicion"]);

  if (tiene(q, ["otra cadena", "entre cadenas", "de liverpool a", "de sears a", "de sanborns a", "del palacio a", "a la otra cadena"]) ||
      (tiene(q, ["traslad", "mover"]) && tiene(q, ["cadena"]) && explica)) {
    return "Un traslado solo existe entre tiendas de la misma cadena y con el mismo modelo. El inventario que ya está en Liverpool es de Liverpool: se lo facturaste y está en su almacén, así que no puedes moverlo a Sears. Entre cadenas distintas lo que hay es una renegociación de embarque: dejar de surtir donde sobra y surtir donde falta. Y tampoco se sustituye un modelo por otro de la misma colección; quien pidió un CTZ-TS1525 no se lleva otro.";
  }
  if (tiene(q, ["cobertura"]) && tiene(q, ["promedio", "total", "renglones"]) && explica) {
    return `La cobertura se calcula como piezas en existencia entre desplazamiento semanal, y siempre sobre el grupo completo: se suman las piezas, se suma el desplazamiento y se divide. No se promedian las coberturas de los renglones, porque un promedio de promedios pesa igual a una tienda con 5 piezas que a una con 500 y esconde justo las que hay que atender. Hoy la cobertura del canal es de ${fmt(cobCanal, 1)} semanas contra un umbral de ${fmt(x.umbral)}.`;
  }
  if (!explica) return null;

  if (tiene(q, ["cobertura"]))
    return `La cobertura son las semanas que dura el inventario al ritmo de venta actual: piezas en existencia entre el desplazamiento semanal promedio de las últimas ${PARAMS.ventana} semanas. Por encima de ${fmt(x.umbral)} semanas se considera cobertura alta, por encima de ${fmt(x.umbral * PARAMS.factorCritico, 1)} saturado, y por debajo de ${fmt(PARAMS.coberturaMinima, 1)} con venta viva es riesgo de quiebre.`;
  if (tiene(q, ["sell out", "sellout", "sell in", "sellin", "desplazamiento"]))
    return "Sell-in es lo que la marca le embarca a la cadena; sell-out es lo que la cadena le vende al consumidor. La diferencia entre los dos es inventario que se queda en el canal. Cuando se embarca sostenidamente más de lo que se desplaza, el anaquel se satura aunque la venta a la cadena se vea bien: ese es el problema que este tablero existe para mostrar.";
  if (tiene(q, ["capital", "inmovilizado"]))
    return `El capital inmovilizado es el valor a costo de las piezas que están por encima del umbral de cobertura: existencia menos ${fmt(x.umbral)} semanas de desplazamiento, por el costo del modelo. Es dinero que ya está pagado y parado en un anaquel donde no rota.`;
  if (tiene(q, ["venta perdida", "perdida"]))
    return "La venta perdida es lo que se deja de vender por no tener producto: aplica a las combinaciones con existencia en cero y desplazamiento vivo, y vale el desplazamiento semanal por el precio de lista. Es una estimación a precio lleno; como techo es correcta, como cifra cerrada no.";
  if (tiene(q, ["quiebre"]))
    return `Hay quiebre cuando una combinación de tienda y modelo tiene menos de ${fmt(PARAMS.coberturaMinima, 1)} semanas de cobertura y sí se está vendiendo. No cuenta como quiebre lo que no tiene existencia ni desplazamiento: eso es producto que esa tienda no maneja.`;
  if (tiene(q, ["umbral"]))
    return `El umbral es el número de semanas de cobertura a partir del cual el inventario se considera de más. Hoy está en ${fmt(x.umbral)} semanas y se mueve desde la barra de filtros: al cambiarlo, todas las combinaciones se vuelven a clasificar en el momento.`;
  if (tiene(q, ["excedente", "saturad", "sobreinventario"]))
    return `El excedente son las piezas por encima del umbral: existencia menos ${fmt(x.umbral)} semanas de desplazamiento, por combinación de tienda y modelo. Una combinación está saturada cuando su cobertura pasa de ${fmt(x.umbral * PARAMS.factorCritico, 1)} semanas.`;
  if (tiene(q, ["resurt", "sugerido"]))
    return `El resurtido sugerido lleva cada combinación a ${PARAMS.diasObjetivo} días de inventario: desplazamiento semanal por ${PARAMS.diasObjetivo / 7} semanas, menos lo que ya hay en existencia y lo que va en tránsito. Nunca sugiere resurtir donde hay excedente.`;
  if (tiene(q, ["impacto"]))
    return "El impacto en pesos de una combinación es su capital inmovilizado más cuatro semanas de venta perdida. Sirve para ordenar: pone en la misma escala el dinero parado y el dinero que no entra.";
  return null;
}

/* ------------------------------------------------------------------ *
 * La respuesta
 * ------------------------------------------------------------------ */

const VOCABULARIO = [
  "corte", "hallazgo", "inventario", "existencia", "pieza", "stock", "sell", "desplazamiento", "venta", "vend",
  "cobertura", "saturad", "exceso", "excedente", "quiebre", "agot", "faltante", "traslad", "embarque",
  "resurt", "capital", "inmovilizado", "perd", "tienda", "sucursal", "plaza", "cadena", "marca", "coleccion", "modelo",
  "sku", "referencia", "reloj", "precio", "costo", "margen", "ebitda", "escenario", "plan", "supuesto", "proyeccion",
  "dato", "reporta", "brecha", "prioridad", "urgente", "riesgo", "canal", "tablero", "filtro", "umbral", "comprador",
  "anaquel", "argos",
];

const CAPACIDADES =
  "sell-out, venta, sell-in, inventario, cobertura, capital inmovilizado, quiebres, venta perdida, margen y resurtido; por cadena, colección, marca, estado, tienda o modelo; de la semana, del mes o de las últimas 8 y 12 semanas";

export function responder(pregunta: string, x: Entorno, hilo?: Hilo): Respuesta {
  const r = resolver(pregunta, x, hilo);
  return r;
}

function resolver(pregunta: string, x: Entorno, hilo?: Hilo): Respuesta {
  const q = plano(pregunta);

  if (!q) return { tipo: "saludo", texto: presentacion(x) };

  /* 1 · Lo que la pregunta nombra */
  const leido = entidades(q, x.todos);
  const resto = leido.resto;
  let e = leido.e;

  /* Una pregunta de seguimiento --"¿y en Sears?", "¿y por colección?"-- solo
     cambia una pieza. Las otras son las de la pregunta anterior. */
  let medida = MEDIDAS.find((m) => tiene(` ${resto} `, m.palabras))?.id;
  let dim = DIMENSIONES.find((d) => d.palabras.some((w) => ` ${q}`.includes(` ${w}`)))?.id;
  if (!dim && tiene(` ${q} `, [" top ", " ranking ", " mejores ", " peores ", " mas ", " menos ", " mayor ", " menor ", " principales ", " cuales "])) {
    dim = SUELTAS.find(([w]) => ` ${resto} `.includes(` ${w} `))?.[1];
  }
  let p = periodo(q);

  // Solo es seguimiento si la pregunta trae algo que cambiar. Un "hola" de
  // una palabra no es continuar la conversación anterior.
  const aporta = e.nombres.length > 0 || !!dim || p.pedido;
  const sigue = !!hilo && !medida && aporta && (q.startsWith("y ") || q.startsWith("ahora ") || q.split(" ").length <= 4);
  const antes = sigue ? hilo! : null;
  if (antes && !e.nombres.length && (antes.e as Entidades).nombres.length) e = antes.e as Entidades;

  const nombra = e.nombres.length > 0;
  // Si la pregunta nombra algo, manda la pregunta y no el filtro de la
  // pantalla: quien pregunta por Sears quiere Sears aunque esté viendo Liverpool.
  const S = nombra ? aplicar(x.todos, e) : x.vista;
  // "de Tsuyosa" pero "en Jalisco": el producto se posee, el lugar se ocupa.
  const esProducto = !!(e.sku || e.coleccion || e.marca || e.genero || e.segmento);
  const donde = nombra
    ? `${esProducto ? "de" : "en"} ${e.nombres.join(" · ")}`
    : x.alcance === "todo el canal" ? "en todo el canal" : `en ${x.alcance}`;

  /* 2 · Conceptos: se revisan antes que las cifras, porque "¿por qué la
        cobertura…?" trae la palabra de una medida pero pide una explicación. */
  const c = concepto(q, x, cifras(x.vista, P8).cob);
  if (c) return { tipo: "concepto", texto: c };

  /* Dos preguntas que se hacen mucho y no caben en medida + periodo. */
  if (tiene(q, ["no hacer nada", "si no hago nada", "cuesta esperar", "no actuar"]))
    return { tipo: "dato", texto: inaccion(S, donde) };
  if (tiene(q, ["que cambio", "respecto de la semana pasada", "contra la semana pasada", "vs la semana pasada", "frente a la semana pasada"]))
    return { tipo: "dato", texto: cambioSemanal(S, donde) };

  /* 3 · Qué se pregunta: la medida, el desglose y el periodo ya se leyeron arriba. */
  if (antes && !medida && antes.medida) {
    medida = antes.medida as Medida;
    // El desglose y el periodo anteriores se conservan si la pregunta nueva
    // no trae los suyos.
    if (!dim) dim = antes.dim as Dimension | undefined;
    if (!p.pedido) p = antes.p as Periodo;
  }
  const seguir: Hilo = { medida, dim, p, e };

  if (!medida && !dim) {
    if (tiene(` ${q} `, [" hola ", " buenas ", " buen dia ", " buenos dias ", " que tal ", " quien eres ", " que haces ", " que puedes ", " que sabes ", " ayuda ", " que hace argos ", " para que sirves "]))
      return { tipo: "saludo", texto: presentacion(x) };
    if (nombra) return { ...panorama(S, donde, x.umbral), hilo: seguir };
    const delNegocio = VOCABULARIO.some((v) => ` ${q}`.includes(` ${v}`));
    return delNegocio
      ? { tipo: "sin-datos", texto: `No tengo cómo calcular eso con los datos del corte. Lo que sí resuelvo al momento: ${CAPACIDADES}. Dime cuál necesitas.` }
      : { tipo: "fuera", texto: "Eso queda fuera de mi alcance: trabajo únicamente con la información comercial de este tablero. Puedo ayudarte con sell-out, inventario, cobertura, quiebres, traslados y el plan del año." };
  }

  if (nombra && !S.length)
    return { tipo: "sin-datos", texto: `No hay combinaciones en el corte para ${e.nombres.join(" · ")}: esa mezcla de tienda y producto no existe en la red cargada.` };

  // "Las mejores tiendas" sin decir en qué: se entiende que en venta.
  const m: Medida = medida ?? (tiene(` ${q} `, [" mejores ", " peores ", " mejor ", " peor "]) ? "venta" : "impacto");

  /* 4 · Medidas que no son una cifra por grupo */
  if (m === "plan") return { tipo: "dato", texto: plan(x, q) };
  if (m === "traslado") return { tipo: "dato", texto: trasladosTxt(x, donde) };
  if (m === "red") return { tipo: "dato", texto: red(S, donde) };
  if (m === "impacto" && !dim) return { tipo: "prioridad", texto: prioridades(x, q) };
  if (m === "sellin") return { tipo: "dato", texto: sellIn(S, x, p, donde, nombra) };

  /* 5 · Desglose o cifra */
  if (dim) return { tipo: "dato", texto: desglose(S, m, dim, p, q, donde), hilo: seguir };
  return { tipo: "dato", texto: cifra(S, m, p, donde, x.umbral), hilo: seguir };
}

function presentacion(x: Entorno): string {
  const cr = x.hallazgos.filter((h) => h.severidad === "critica").length;
  return `Soy Argos, el copiloto de este tablero. Calculo sobre el corte ${CORTE.etiqueta}: ${CAPACIDADES}. Hoy el corte trae ${x.hallazgos.length} hallazgos, ${cr} críticos. Pregúntame, por ejemplo, "sell-out de esta semana por cadena" o "qué colección tiene más capital parado".`;
}

function panorama(S: Combo[], donde: string, umbral: number): Respuesta {
  const k = cifras(S, P8);
  const v = variacion(k.venta, k.ventaAnt);
  return {
    tipo: "dato",
    texto:
      `Panorama ${donde}, últimas ${PARAMS.ventana} semanas: sell-out de ${fmt(k.pz)} piezas, ${moneyCorto(k.venta)}, ${signo(v)} contra el año anterior. ` +
      `Inventario de ${fmt(k.inv)} piezas en ${fmt(k.tiendas)} tiendas, ${fmt(k.cob, 1)} semanas de cobertura contra un umbral de ${fmt(umbral)}. ` +
      `${moneyCorto(k.capital)} de capital inmovilizado y ${fmt(k.quiebres)} quiebres que cuestan ${moneyCorto(k.perdida)} por semana.`,
  };
}

function cifra(S: Combo[], m: Medida, p: Periodo, donde: string, umbral: number): string {
  const k = cifras(S, p);
  const per = nombrePeriodo(p);
  const aviso = p.n === 1 && !p.salto ? " El corte es semanal: es el dato más reciente que hay." : "";

  switch (m) {
    case "sellout":
    case "venta": {
      if (p.anual) {
        const an = S.reduce((a, c) => a + c.so * 52, 0);
        const anV = S.reduce((a, c) => a + c.so * 52 * c.precio, 0);
        return `Al ritmo de las últimas ${PARAMS.ventana} semanas, el sell-out ${donde} proyecta ${fmt(an)} piezas y ${moneyCorto(anV)} en doce meses. Es una corrida del ritmo actual, no un pronóstico con estacionalidad: para eso está la pantalla de Escenarios.`;
      }
      const base = m === "sellout"
        ? `El sell-out ${donde} en ${per} fue de ${fmt(k.pz)} piezas, ${moneyCorto(k.venta)} a precio de lista.`
        : `La venta ${donde} en ${per} fue de ${moneyCorto(k.venta)}, ${fmt(k.pz)} piezas a precio de lista.`;
      let comp = "";
      if (k.pzPrev !== null && k.pzPrev > 0) {
        const ant = p.n === 1 ? "la semana anterior" : `las ${p.n} semanas anteriores`;
        comp = ` Son ${signo(variacion(k.pz, k.pzPrev))} contra ${ant} (${fmt(k.pzPrev)} piezas).`;
      } else if (k.ventaAnt > 0) {
        comp = ` Contra el mismo periodo del año anterior: ${signo(variacion(k.venta, k.ventaAnt))}.`;
      }
      return base + comp + aviso;
    }
    case "inventario":
      return `Hay ${fmt(k.inv)} piezas en canal ${donde}, repartidas en ${fmt(k.tiendas)} tiendas y con valor de ${moneyCorto(k.invCosto)} a costo. Equivalen a ${fmt(k.cob, 1)} semanas de cobertura contra un umbral de ${fmt(umbral)}. Además van ${fmt(k.tr)} piezas en tránsito.`;
    case "cobertura":
      return `La cobertura ${donde} es de ${fmt(k.cob, 1)} semanas: ${fmt(k.inv)} piezas contra un desplazamiento de ${fmt(k.soSem, 1)} por semana. El umbral está en ${fmt(umbral)}. ${fmt(k.sobre)} combinaciones lo rebasan y ${fmt(k.quiebres)} están en quiebre.`;
    case "capital":
    case "excedente": {
      const top = [...grupos(S, "estado")].map(([n, cs]) => ({ n, v: cs.reduce((a, c) => a + c.capital, 0) })).filter((g) => g.v > 0).sort((a, b) => b.v - a.v).slice(0, 3);
      return `Hay ${moneyCorto(k.capital)} de capital inmovilizado ${donde}: ${fmt(k.exc)} piezas por encima de ${fmt(umbral)} semanas de cobertura, en ${fmt(k.sobre)} combinaciones.` +
        (top.length > 1 ? ` Se concentra en ${top.map((g) => `${g.n} (${moneyCorto(g.v)})`).join(", ")}.` : "");
    }
    case "quiebre":
    case "perdida": {
      const top = [...grupos(S.filter((c) => c.clase === "quiebre"), "modelo")].map(([n, cs]) => ({ n: n.split(" ")[0], v: cs.reduce((a, c) => a + c.perdida, 0), t: cs.length })).sort((a, b) => b.v - a.v).slice(0, 3);
      if (!k.quiebres) return `No hay quiebres ${donde}: ninguna combinación con venta viva está por debajo de ${fmt(PARAMS.coberturaMinima, 1)} semanas de cobertura.`;
      return `Hay ${fmt(k.quiebres)} combinaciones en quiebre ${donde}. Cuestan ${moneyCorto(k.perdida)} de venta perdida por semana, ${moneyCorto(k.perdida * 52)} si se sostiene un año.` +
        (top.length ? ` Los modelos que más pesan: ${top.map((g) => `${g.n} en ${g.t === 1 ? "1 tienda" : `${g.t} tiendas`} (${moneyCorto(g.v)} por semana)`).join(", ")}.` : "");
    }
    case "margen": {
      const mb = k.venta - k.costo;
      return `El margen bruto ${donde} en ${per} es de ${fmt(k.venta > 0 ? (mb / k.venta) * 100 : 0, 1)}%: ${moneyCorto(mb)} sobre ${moneyCorto(k.venta)} de venta a precio de lista.`;
    }
    case "variacion": {
      const v = variacion(k.venta, k.ventaAnt);
      const cols = [...grupos(S, "coleccion")].map(([n, cs]) => { const y = cifras(cs, p); return { n, v: variacion(y.venta, y.ventaAnt) }; }).sort((a, b) => b.v - a.v);
      const sube = cols[0], baja = cols[cols.length - 1];
      return `La venta ${donde} en ${per} va ${signo(v)} contra el mismo periodo del año anterior: ${moneyCorto(k.venta)} contra ${moneyCorto(k.ventaAnt)}.` +
        (cols.length > 1 ? ` La colección que más crece es ${sube.n} (${signo(sube.v)}) y la que más cae es ${baja.n} (${signo(baja.v)}).` : "");
    }
    case "resurtido": {
      const top = [...grupos(S.filter((c) => c.sug > 0), "modelo")].map(([n, cs]) => ({ n: n.split(" ")[0], v: cs.reduce((a, c) => a + c.sug, 0) })).sort((a, b) => b.v - a.v).slice(0, 3);
      return `El resurtido sugerido ${donde} es de ${fmt(k.sug)} piezas para llevar cada combinación a ${PARAMS.diasObjetivo} días de inventario, ya descontado lo que va en tránsito.` +
        (top.length ? ` Lo que más pide: ${top.map((g) => `${g.n} (${fmt(g.v)} piezas)`).join(", ")}.` : "");
    }
    case "transito":
      return `Van ${fmt(k.tr)} piezas en tránsito ${donde}, contra ${fmt(k.inv)} que ya están en existencia.`;
    case "precio":
      return `El precio promedio de lo vendido ${donde} en ${per} es de $${fmt(k.pz > 0 ? k.venta / k.pz : 0)} por pieza.`;
    default:
      return panorama(S, donde, umbral).texto;
  }
}

function sellIn(S: Combo[], x: Entorno, p: Periodo, donde: string, nombra: boolean): string {
  const serie = x.data.serie;
  const fin = serie.length - p.salto;
  const tramo = serie.slice(Math.max(0, fin - p.n), fin);
  const totalSo = x.todos.reduce((a, c) => a + c.so, 0);
  const parte = totalSo > 0 ? S.reduce((a, c) => a + c.so, 0) / totalSo : 1;
  const si = tramo.reduce((a, s) => a + s.sellIn, 0) * parte;
  const so = tramo.reduce((a, s) => a + s.sellOut, 0) * parte;
  const idx = si > 0 ? (so / si) * 100 : 0;
  return `El sell-in ${donde} en ${nombrePeriodo(p)} fue de ${fmt(si)} piezas contra un sell-out de ${fmt(so)}: se desplazó el ${fmt(idx, 1)}% de lo embarcado.` +
    (idx < 95 ? " La diferencia se queda en el canal como inventario." : "") +
    (nombra || parte < 0.999 ? " El embarque se registra a nivel canal; para este alcance es una estimación por participación en el desplazamiento." : "");
}

/** Lo que cuesta dejar el canal como está un mes más. */
function inaccion(S: Combo[], donde: string): string {
  const k = cifras(S, P8);
  const perdidaMes = k.perdida * 4.3;
  const financiero = (k.capital * PARAMS.costoCapitalAnual) / 12;
  return `Un mes más sin actuar ${donde} cuesta ${moneyCorto(perdidaMes + financiero)}: ${moneyCorto(perdidaMes)} de venta que no ocurre por los ${fmt(k.quiebres)} quiebres, y ${moneyCorto(financiero)} de costo financiero por los ${moneyCorto(k.capital)} parados, a ${fmt(PARAMS.costoCapitalAnual * 100)}% anual. No incluye el riesgo de perder espacio de anaquel con el comprador.`;
}

/** La semana del corte contra la anterior. */
function cambioSemanal(S: Combo[], donde: string): string {
  const hoy: Periodo = { n: 1, salto: 0, pedido: true, anual: false };
  const k = cifras(S, hoy);
  const prev = k.pzPrev ?? 0;
  const cad = [...grupos(S, "cadena")].map(([n, cs]) => { const y = cifras(cs, hoy); return { n, v: variacion(y.pz, y.pzPrev ?? 0) }; }).sort((a, b) => b.v - a.v);
  return `En la semana del corte (S${CORTE.semana}) el sell-out ${donde} fue de ${fmt(k.pz)} piezas contra ${fmt(prev)} de la semana anterior: ${signo(variacion(k.pz, prev))}.` +
    (cad.length > 1 ? ` Por cadena: ${cad.map((c) => `${c.n} ${signo(c.v)}`).join(", ")}.` : "") +
    " El inventario, la cobertura y los quiebres se leen al corte; no guardo la foto de la semana pasada para compararlos.";
}

function red(S: Combo[], donde: string): string {
  const tiendas = new Map<string, { nombre: string; reporta: boolean; apertura: number }>();
  for (const c of S) tiendas.set(c.sucursal.clave, { nombre: c.sucursal.nombre, reporta: c.sucursal.reporta, apertura: c.sucursal.apertura });
  const todas = [...tiendas.values()];
  const sin = todas.filter((t) => !t.reporta);
  const pct = todas.length ? ((todas.length - sin.length) / todas.length) * 100 : 0;
  return `La red ${donde} tiene ${fmt(todas.length)} tiendas y ${fmt(todas.length - sin.length)} entregan sell-out: ${fmt(pct, 1)}% de cobertura de reporte.` +
    (sin.length ? ` No reportan: ${sin.slice(0, 6).map((t) => t.nombre).join(", ")}${sin.length > 6 ? ` y ${sin.length - 6} más` : ""}. En esas tiendas no se calcula cobertura ni excedente: sin sell-out no hay denominador, y declarar una cifra sería inventarla.` : " No hay brecha de información.");
}

function trasladosTxt(x: Entorno, donde: string): string {
  const h = x.hallazgos.find((y) => y.id === "traslados");
  if (!h) return `No hay traslados que proponer ${donde}. Un traslado solo existe entre tiendas de la misma cadena y con el mismo modelo, con excedente en el origen y riesgo de quiebre en el destino.`;
  return `${h.titulo}. ${h.cuerpo} ${h.accion} Valen ${moneyCorto(h.valor)}. El detalle, traslado por traslado, está en la pantalla Qué atender.`;
}

function prioridades(x: Entorno, q: string): string {
  const hs = x.hallazgos;
  if (!hs.length) return "Con los filtros puestos no hay hallazgos que atender: nada cruza los umbrales.";
  const n = tiene(q, ["resumen", "resumeme", "panorama", "como vamos"]) ? 3 : 3;
  const lista = hs.slice(0, n).map((h, i) => `${i + 1}. ${h.titulo}. ${h.accion} Vale ${moneyCorto(h.valor)}.`).join("\n");
  const cr = hs.filter((h) => h.severidad === "critica").length;
  return `Del corte salen ${hs.length} hallazgos, ${cr} críticos. Por impacto, en este orden:\n${lista}`;
}

function plan(x: Entorno, q: string): string {
  const p = x.plan;
  if (!p) return "El plan del año se arma en la pantalla Escenarios y su resultado está en Estado de resultados.";
  if (tiene(q, ["escenarios", "comparacion", "compara", "cual escenario", "que escenario", "mejor escenario"])) {
    const todos = [{ nombre: p.nombre, ebitda: p.ebitda, ebitdaPct: p.ebitdaPct, ingreso: p.ingreso }, ...p.otros].sort((a, b) => b.ebitda - a.ebitda);
    return "Los escenarios, por EBITDA:\n" + todos.map((e, i) => `${i + 1}. ${e.nombre}: ${moneyCorto(e.ebitda)} (${fmt(e.ebitdaPct, 1)}% sobre ${moneyCorto(e.ingreso)} de ingreso)`).join("\n");
  }
  return `El escenario activo es ${p.nombre}: ingreso de ${moneyCorto(p.ingreso)} en doce meses, margen bruto de ${moneyCorto(p.margenBruto)} (${fmt(p.margenPct, 1)}%) y EBITDA de ${moneyCorto(p.ebitda)}, ${fmt(p.ebitdaPct, 1)}% sobre ingreso. Los supuestos se mueven en la pantalla Escenarios.`;
}

/* ------------------------------------------------------------------ *
 * El resumen de datos que viaja al modelo
 * ------------------------------------------------------------------ */

/**
 * Lo que el modelo necesita para contestar preguntas de datos sin inventar.
 * Son tablas chicas y ya agregadas: no viajan las 1,821 combinaciones.
 */
export function resumenDatos(x: Entorno) {
  const p8: Periodo = { n: 8, salto: 0, pedido: false, anual: false };
  const p4: Periodo = { n: 4, salto: 0, pedido: true, anual: false };
  const p1: Periodo = { n: 1, salto: 0, pedido: true, anual: false };
  const fila = (nombre: string, cs: Combo[]) => {
    const a = cifras(cs, p8), b = cifras(cs, p4), c = cifras(cs, p1);
    return {
      nombre,
      selloutSemana: Math.round(c.pz), sellout4Sem: Math.round(b.pz), sellout8Sem: Math.round(a.pz),
      venta8SemMXN: Math.round(a.venta), variacionAnualPct: Number(variacion(a.venta, a.ventaAnt).toFixed(1)),
      piezas: a.inv, coberturaSem: Number(a.cob.toFixed(1)), capitalMXN: Math.round(a.capital),
      quiebres: a.quiebres, ventaPerdidaSemMXN: Math.round(a.perdida),
      margenPct: a.venta > 0 ? Number((((a.venta - a.costo) / a.venta) * 100).toFixed(1)) : 0,
    };
  };
  const tabla = (d: Dimension, tope: number) =>
    [...grupos(x.vista, d)].map(([k, cs]) => fila(k, cs)).sort((a, b) => b.venta8SemMXN - a.venta8SemMXN).slice(0, tope);
  return {
    alcance: x.alcance,
    total: fila("Total", x.vista),
    serie12Semanas: x.data.serie.map((s) => ({ semana: s.etiqueta, sellIn: Math.round(s.sellIn), sellOut: Math.round(s.sellOut) })),
    porCadena: tabla("cadena", 6),
    porColeccion: tabla("coleccion", 12),
    porEstado: tabla("estado", 12),
    topModelos: tabla("modelo", 10),
    plan: x.plan,
  };
}
