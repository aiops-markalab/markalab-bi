/**
 * Un libro de Excel por pantalla.
 *
 * Cada función de este archivo arma lo que una pantalla le manda al servidor
 * para bajar su libro. La regla es la misma en todos:
 *
 *   - Lo que NO depende de los supuestos viaja como dato.
 *   - Lo que SÍ depende ya es fórmula en la plantilla, y aquí se manda además
 *     su resultado. El servidor lo guarda junto a la fórmula para que el
 *     archivo se vea completo aunque Excel lo abra en Vista protegida, donde
 *     nada se recalcula.
 *
 * Los resultados que se mandan tienen que ser los mismos que da la fórmula.
 * No es un acto de fe: el script de verificación recalcula cada libro y
 * compara celda por celda contra lo que salió de aquí.
 */

import {
  CORTE, CORTE_ANTERIOR, CORTE_RANGO, ETIQUETA_CLASE, PARAMS, PERIODO_TODO, cambioDeCorte, fechaCorta, rangoCorto, esPeriodoCompleto, etiquetaPeriodo, fracciones,
  periodoDe, porCadena, porEstado, porSucursal, serieDe,
  type Combo, type Dataset, type Filtro, type Indicadores, type Periodo,
} from "./engine";
import { cadenaPorId, coleccionPorId, estadoPorId } from "./catalog";
import { ETIQUETA_SEVERIDAD, type Hallazgo } from "./copiloto";
import { alcance } from "./pantallas";
import {
  proyectar, precioSellIn, ESCENARIOS_BASE, MARGEN_CADENA_MEDIO, MARGEN_MARCA, type Escenario,
} from "./plan";
import { aExcel, type Config, type Resultado } from "./pivot";
import { enHoja, enHojaPeriodo, filasExcel, r4, type Celda, type Paquete } from "./excel";

export type Base = { vista: Combo[]; data: Dataset; ind: Indicadores; filtro: Filtro };

const TASA = PARAMS.costoCapitalAnual;
const DESCUENTO = 0.35;
const EDAD = 360;

/** El periodo que está puesto en la plataforma: el libro baja con el mismo. */
const periodoDeBase = (b: Base): Periodo => periodoDe(b.filtro);

/** La segunda línea de todo tablero: de qué corte, de qué periodo y de qué alcance es el archivo. */
function subtitulo(b: Base, extra = ""): string {
  const hoy = new Date();
  const fecha = `${String(hoy.getDate()).padStart(2, "0")}/${String(hoy.getMonth() + 1).padStart(2, "0")}/${hoy.getFullYear()}`;
  const donde = alcance(b.filtro);
  const p = periodoDeBase(b);
  const periodo = esPeriodoCompleto(p) ? "Periodo: las 12 semanas cargadas" : `Periodo: ${etiquetaPeriodo(p)}`;
  return `Corte ${CORTE.etiqueta} (${CORTE_RANGO})  ·  ${periodo}  ·  ${donde[0].toUpperCase()}${donde.slice(1)}  ·  Umbral de ${b.filtro.umbral} semanas${extra ? `  ·  ${extra}` : ""}  ·  Generado el ${fecha}`;
}

const sufijo = (b: Base) => {
  const a = alcance(b.filtro);
  return a === "todo el canal" ? CORTE.etiqueta : `${CORTE.etiqueta}_${a}`;
};

/** Agrupa y devuelve los grupos en el orden en que aparecieron. */
function agrupar<T>(xs: T[], clave: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = clave(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(x);
  }
  return m;
}

const suma = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
const esQuiebre = (c: Combo) => c.clase === "quiebre";
const esSobre = (c: Combo) => c.clase === "alto" || c.clase === "saturado";
const enAlerta = (c: Combo) => c.sucursal.reporta && c.clase !== "sano";
const enAlertaAntes = (c: Combo) => c.sucursal.reporta && c.claseAnt !== "sano";
const cob = (inv: number, so: number) => (so > 0.05 ? inv / so : inv > 0 ? 99 : 0);
/** Piezas por semana que se dejan de vender: existencia en cero con desplazamiento vivo. */
const perdidaPzas = (c: Combo) => (c.perdida > 0 ? r4(c.so) : 0);

/** Las cuatro cifras del periodo de un grupo de combinaciones, como las suma la hoja Datos. */
function delPeriodo(cs: Combo[], b: Base) {
  const f = fracciones(periodoDeBase(b));
  let outP = 0, outM = 0, inP = 0, inM = 0;
  for (const c of cs) {
    const x = enHojaPeriodo(c, f);
    outP += x.out; outM += x.outMonto; inP += x.in; inM += x.inMonto;
  }
  return { outP, outM, inP, inM };
}

/* ------------------------------------------------------------------ *
 * Resumen
 * ------------------------------------------------------------------ */
export function libroResumen(b: Base): Paquete {
  const { vista, ind, filtro } = b;
  const periodo = periodoDeBase(b);
  const venta = suma(vista, (c) => enHoja(c).venta);
  const ventaAnt = suma(vista, (c) => enHoja(c).ventaAnt);
  const so = suma(vista, (c) => r4(c.so));
  const tot = delPeriodo(vista, b);

  const cadenas = [...agrupar(vista, (c) => cadenaPorId(c.sucursal.cadenaId).nombre)]
    .map(([n, cs]) => {
      const p = delPeriodo(cs, b);
      const inv = suma(cs, (c) => c.inv), s = suma(cs, (c) => r4(c.so));
      return [n, p.outP, p.inP, p.outM, p.inM, p.inP ? p.outP / p.inP : 0, inv, suma(cs, (c) => c.inv * c.costo),
        s > 0.05 ? inv / s : 0, suma(cs, (c) => c.exc), Math.round(suma(cs, (c) => c.capital)),
        cs.filter(esQuiebre).length, suma(cs, perdidaPzas), suma(cs, (c) => c.perdida)] as Celda[];
    })
    .sort((x, y) => (y[1] as number) - (x[1] as number));

  const porModelo = [...agrupar(vista, (c) => c.modelo.sku)].map(([sku, cs]) => {
    const inv = suma(cs, (c) => c.inv), s = suma(cs, (c) => r4(c.so));
    return { sku, nombre: cs[0].modelo.nombre, inv, cob: s > 0.05 ? inv / s : 0, ...delPeriodo(cs, b) };
  });
  const topOut = [...porModelo].sort((x, y) => y.outP - x.outP).slice(0, 10)
    .map((m) => [m.sku, m.nombre, m.outP, m.outM, tot.outP ? m.outP / tot.outP : 0, m.inP, m.inv, m.cob] as Celda[]);
  const topIn = [...porModelo].sort((x, y) => y.inP - x.inP).slice(0, 10)
    .map((m) => [m.sku, m.nombre, m.inP, m.inM, tot.inP ? m.inP / tot.inP : 0, m.outP, m.inP ? m.outP / m.inP : 0, m.inv] as Celda[]);

  const pzEstado = new Map<string, number>();
  for (const c of vista) pzEstado.set(c.sucursal.estadoId, (pzEstado.get(c.sucursal.estadoId) ?? 0) + perdidaPzas(c));
  const estados = porEstado(vista, filtro.umbral)
    .slice(0, 10)
    .map((e) => [e.estado.nombre, e.exc, Math.round(e.capital), pzEstado.get(e.estado.id) ?? 0, e.perdida,
      Math.round(e.capital) + e.perdida * 4, e.inv, e.so > 0.05 ? e.inv / e.so : 0] as Celda[]);

  // La gráfica de líneas enseña siempre las doce semanas cargadas; los
  // indicadores, el periodo que esté puesto.
  const serie = serieDe(vista, PERIODO_TODO)
    // La semana con su fecha de inicio: es lo que lee el eje de la gráfica.
    .map((s) => [`${s.etiqueta} · ${fechaCorta(s.desde)}`, Math.round(s.sellIn), Math.round(s.sellOut), rangoCorto(s.desde, s.hasta)] as Celda[]);
  const capital = Math.round(ind.capital);

  return {
    plantilla: "resumen",
    sufijo: sufijo(b),
    hojas: {
      Datos: filasExcel(vista, periodo), Cadenas: cadenas, "Top sell-out": topOut, "Top sell-in": topIn,
      Estados: estados, Serie: serie,
    },
    valores: {
      subtitulo: subtitulo(b),
      umbral: filtro.umbral,
      tasa: TASA,
      sellout: tot.outP, selloutMonto: tot.outM, sellin: tot.inP, sellinMonto: tot.inM,
      indice: tot.inP ? tot.outP / tot.inP : 0,
      cobertura: so > 0 ? ind.inventario / so : 0,
      piezas: ind.inventario,
      inventarioMonto: suma(vista, (c) => c.inv * c.costo),
      exc: ind.excedente,
      capital,
      perdidaPzas: suma(vista, perdidaPzas),
      perdida: ind.perdida,
      quiebres: ind.quiebres,
      sobre: ind.saturadas,
      resurtir: suma(vista, (c) => c.sug),
      resurtirMonto: suma(vista, (c) => c.sug * c.costo),
      transito: suma(vista, (c) => c.tr),
      variacion: ventaAnt ? venta / ventaAnt - 1 : 0,
      financiero: ind.capital * TASA,
      perdidaAnual: ind.perdida * 52,
      inaccion: ind.perdida * 4.3 + (ind.capital * TASA) / 12,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Mapa
 * ------------------------------------------------------------------ */
export function libroMapa(b: Base): Paquete {
  const { vista, ind, filtro } = b;
  const estados = porEstado(vista, filtro.umbral);
  const cc = cambioDeCorte(vista);

  type Cuenta = { venta: number; pzas: number; antes: number; hoy: number; resueltas: number; nuevas: number };
  const cero = (): Cuenta => ({ venta: 0, pzas: 0, antes: 0, hoy: 0, resueltas: 0, nuevas: 0 });
  const porEdo = new Map<string, Cuenta>();
  const porSuc = new Map<string, Cuenta>();
  for (const c of vista) {
    const a = enAlertaAntes(c), h = enAlerta(c);
    for (const [m, k] of [[porEdo, c.sucursal.estadoId], [porSuc, c.sucursal.clave]] as [Map<string, Cuenta>, string][]) {
      if (!m.has(k)) m.set(k, cero());
      const x = m.get(k)!;
      x.venta += enHoja(c).venta;
      x.pzas += perdidaPzas(c);
      if (a) x.antes++;
      if (h) x.hoy++;
      if (a && !h) x.resueltas++;
      if (!a && h) x.nuevas++;
    }
  }

  const filasEstados = estados.map((e) => {
    const x = porEdo.get(e.estado.id) ?? cero();
    return [
      e.estado.nombre, e.sucursales, e.combos, e.inv, Math.round(e.so * PARAMS.ventana),
      x.venta, e.exc, Math.round(e.capital), e.perdida, Math.round(e.capital) + e.perdida * 4,
      cob(e.inv, e.so), e.sobreUmbral, e.quiebres, ETIQUETA_CLASE[e.clase],
      x.pzas, x.antes, x.hoy, x.resueltas, x.nuevas,
    ] as Celda[];
  });

  const sucursales = porSucursal(vista, filtro.umbral)
    .sort((x, y) => y.capital - x.capital || y.perdida - x.perdida)
    .slice(0, 120)
    .map((s) => {
      const x = porSuc.get(s.sucursal.clave) ?? cero();
      return [
        s.sucursal.nombre, cadenaPorId(s.sucursal.cadenaId).nombre, estadoPorId(s.sucursal.estadoId).nombre, s.sucursal.ciudad,
        s.combos, s.inv, s.so, cob(s.inv, s.so), s.exc, Math.round(s.capital), s.quiebres, s.perdida,
        s.sucursal.reporta ? ETIQUETA_CLASE[s.clase] : "Sin reporte",
        x.pzas, x.antes, x.hoy,
      ] as Celda[];
    });

  // Una por una: primero las que se resolvieron y las nuevas, que son pocas y
  // son la noticia; después las que siguen, por impacto, hasta llenar la hoja.
  const fila = (c: Combo, cambio: string): Celda[] => [
    c.sucursal.nombre, cadenaPorId(c.sucursal.cadenaId).nombre, estadoPorId(c.sucursal.estadoId).nombre, c.modelo.sku,
    c.modelo.nombre, c.invAnt, r4(c.soPrev), c.inv, r4(c.so), c.costo,
    ETIQUETA_CLASE[c.claseAnt], ETIQUETA_CLASE[c.clase], cambio, c.excAnt, c.exc, c.capitalAnt, Math.round(c.capital),
  ];
  const TOPE = 400;
  const noticia = [
    ...cc.resueltas.map((c) => fila(c, "Resuelta")),
    ...cc.nuevas.map((c) => fila(c, "Nueva")),
  ].slice(0, TOPE);
  const cambio = [...noticia, ...cc.vigentes.slice(0, Math.max(0, TOPE - noticia.length)).map((c) => fila(c, "Sigue en alerta"))];

  const capital = Math.round(ind.capital);
  return {
    plantilla: "mapa",
    sufijo: sufijo(b),
    hojas: {
      Datos: filasExcel(vista, periodoDeBase(b)), Estados: filasEstados, Sucursales: sucursales, "Cambio de corte": cambio,
    },
    valores: {
      subtitulo: subtitulo(b, `Contra el corte ${CORTE_ANTERIOR.etiqueta} (${CORTE_ANTERIOR.rango})`),
      umbral: filtro.umbral,
      descuento: DESCUENTO,
      tasa: TASA,
      estados: estados.length,
      alerta: estados.filter((e) => e.clase !== "sano").length,
      exc: ind.excedente,
      capital,
      perdidaPzas: suma(vista, perdidaPzas),
      perdida: ind.perdida,
      alertasAntes: cc.antes.alertas,
      alertasHoy: cc.hoy.alertas,
      resueltas: cc.resueltas.length,
      nuevas: cc.nuevas.length,
      vigentes: cc.vigentes.length,
      impacto: capital + ind.perdida * 4,
      capitalAnt: cc.antes.capital,
      capitalCambio: capital - cc.antes.capital,
      excAnt: cc.antes.excedente,
      perdidaAnt: cc.antes.perdida,
      liberado: capital * (1 - DESCUENTO),
      ahorro: capital * (1 - DESCUENTO) * TASA,
      perdidaAnual: ind.perdida * 52,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Qué atender
 * ------------------------------------------------------------------ */
export function libroEjecucion(b: Base): Paquete {
  const { vista, ind, filtro } = b;
  const u = filtro.umbral;
  const sobre = vista.filter(esSobre);
  const viejos = vista.filter((c) => c.edad > EDAD && c.inv > 0);
  const base = (c: Combo): Celda[] => [c.sucursal.nombre, cadenaPorId(c.sucursal.cadenaId).nombre, c.modelo.sku, c.modelo.nombre];

  const noResurtir = [...sobre].sort((x, y) => y.capital - x.capital).slice(0, 300)
    .map((c) => [...base(c), c.inv, c.tr, r4(c.so), c.costo, cob(c.inv, r4(c.so)), c.exc, Math.round(c.capital)] as Celda[]);

  const resurtir = vista.filter((c) => c.sug > 0).sort((x, y) => y.perdida - x.perdida || y.sug - x.sug).slice(0, 300)
    .map((c) => {
      const pz = c.inv === 0 && c.so > 0.15 ? r4(c.so) : 0;
      return [...base(c), c.inv, c.tr, r4(c.so), c.precio, c.costo, c.objetivo, c.sug, c.sug * c.costo, pz, pz * c.precio] as Celda[];
    });

  const liquidar = [...viejos].sort((x, y) => y.inv * y.costo - x.inv * x.costo).slice(0, 300)
    .map((c) => [...base(c), c.inv, c.edad, c.costo, c.inv * c.costo, c.inv * c.costo * (1 - DESCUENTO), "Sí"] as Celda[]);

  const colecciones = [...agrupar(vista, (c) => c.coleccion.nombre)]
    .map(([n, cs]) => [n, suma(cs, perdidaPzas), suma(cs.filter(esQuiebre), (c) => c.perdida), suma(cs, (c) => c.exc),
      Math.round(suma(cs, (c) => c.capital)), cs.filter(esQuiebre).length, cs.filter(esSobre).length] as Celda[])
    .sort((x, y) => (y[2] as number) - (x[2] as number));

  const capital = Math.round(ind.capital);
  const viejasCosto = suma(viejos, (c) => c.inv * c.costo);
  return {
    plantilla: "ejecucion",
    sufijo: sufijo(b),
    hojas: {
      Datos: filasExcel(vista, periodoDeBase(b)), "No resurtir": noResurtir, Resurtir: resurtir,
      Liquidar: liquidar, Colecciones: colecciones,
    },
    valores: {
      subtitulo: subtitulo(b),
      umbral: u, dias: PARAMS.diasObjetivo, tasa: TASA, edad: EDAD, descuento: DESCUENTO,
      sobre: sobre.length,
      exc: ind.excedente,
      capital,
      quiebres: ind.quiebres,
      perdidaPzas: suma(vista, perdidaPzas),
      perdida: ind.perdida,
      resurtir: suma(vista, (c) => c.sug),
      resurtirMonto: suma(vista, (c) => c.sug * c.costo),
      transito: suma(sobre, (c) => c.tr),
      viejas: suma(viejos, (c) => c.inv),
      viejasCosto,
      inaccion: ind.perdida * 4.3 + (capital * TASA) / 12,
      transitoMonto: suma(sobre, (c) => c.tr * c.costo),
      financiero: capital * TASA,
      perdidaAnual: ind.perdida * 52,
      viejasCaja: viejasCosto * (1 - DESCUENTO),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Detalle por tienda
 * ------------------------------------------------------------------ */
export function libroDetalle(b: Base): Paquete {
  const { vista, filtro } = b;
  const f = fracciones(periodoDeBase(b));
  const clase = (c: Combo) => (c.sucursal.reporta ? ETIQUETA_CLASE[c.clase] : "Sin reporte");
  const orden = [...vista].sort((x, y) => y.impacto - x.impacto).slice(0, 2500);
  const per = new Map(orden.map((c) => [c, enHojaPeriodo(c, f)] as const));

  const filas = orden.map((c) => {
    const p = per.get(c)!;
    return [
      c.sucursal.nombre, cadenaPorId(c.sucursal.cadenaId).nombre, estadoPorId(c.sucursal.estadoId).nombre, c.modelo.sku,
      c.modelo.nombre, c.coleccion.nombre, c.inv, c.tr, r4(c.so), c.precio, c.costo, c.edad, c.sucursal.reporta ? 1 : 0,
      c.sucursal.reporta ? cob(c.inv, r4(c.so)) : null, c.exc, Math.round(c.capital), c.perdida, Math.round(c.impacto),
      clase(c), `${c.sucursal.nombre} · ${c.modelo.sku}`,
      p.out, p.outMonto, p.in, p.inMonto, c.inv * c.costo,
    ] as Celda[];
  });

  const NOMBRES = ["Sano", "Cobertura alta", "Saturado", "Quiebre"];
  const clases = NOMBRES.map((n) => {
    const cs = orden.filter((c) => clase(c) === n);
    return [n, cs.length, suma(cs, (c) => c.inv), suma(cs, (c) => c.exc),
      Math.round(suma(cs, (c) => Math.round(c.capital))), suma(cs, (c) => c.perdida)] as Celda[];
  });
  const cuenta = (n: string) => orden.filter((c) => clase(c) === n).length;
  const todo = [...per.values()];

  return {
    plantilla: "detalle",
    sufijo: sufijo(b),
    hojas: { Detalle: filas, Clases: clases },
    valores: {
      subtitulo: subtitulo(b),
      umbral: filtro.umbral,
      combos: orden.length,
      piezas: suma(orden, (c) => c.inv),
      invMonto: suma(orden, (c) => c.inv * c.costo),
      so: suma(orden, (c) => r4(c.so)),
      exc: suma(orden, (c) => c.exc),
      capital: suma(orden, (c) => Math.round(c.capital)),
      sellout: suma(todo, (p) => p.out), selloutMonto: suma(todo, (p) => p.outMonto),
      sellin: suma(todo, (p) => p.in), sellinMonto: suma(todo, (p) => p.inMonto),
      perdidaPzas: suma(orden, perdidaPzas),
      perdida: suma(orden, (c) => c.perdida),
      impacto: suma(orden, (c) => Math.round(c.impacto)),
      sanas: cuenta("Sano"), altas: cuenta("Cobertura alta"), saturadas: cuenta("Saturado"),
      quiebres: cuenta("Quiebre"), sinReporte: cuenta("Sin reporte"),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Reportes: la tabla que está en pantalla
 * ------------------------------------------------------------------ */
export function libroReporte(b: Base, r: Resultado, cfg: Config, vistaNombre: string): Paquete {
  const x = aExcel(r, cfg);
  const g = x.grafica as [string, number][];
  const total = suma(g, (f) => f[1]);
  const mayor = g.length ? g.reduce((a, f) => (f[1] > a[1] ? f : a)) : (["", 0] as [string, number]);
  return {
    plantilla: "reporte",
    sufijo: `${CORTE.etiqueta}_${vistaNombre || "reporte"}`,
    hojas: { Reporte: x.filas, "Gráfica": x.grafica },
    encabezados: { Reporte: x.encabezados, "Gráfica": ["Concepto", x.medida] },
    valores: {
      subtitulo: subtitulo(b, `Medida graficada: ${x.medida}`),
      total: x.total,
      renglones: r.filas.length,
      mayorNombre: mayor[0],
      mayor: mayor[1],
      parte: total ? mayor[1] / total : 0,
      promedio: g.length ? total / g.length : 0,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Simulador del corte
 * ------------------------------------------------------------------ */
export function libroSimulador(b: Base): Paquete {
  const { vista, ind, filtro } = b;
  // Lo que se simula es sell-in. El sell-out va como dato: lo ya vendido.
  const tabla = (clave: (c: Combo) => string) =>
    [...agrupar(vista, clave)]
      .map(([n, cs]) => {
        const p = delPeriodo(cs, b);
        return [n, p.inP, p.outP, p.inM, p.outM, p.inP ? p.outP / p.inP : 0, suma(cs, (c) => c.inv),
          suma(cs, (c) => c.exc), Math.round(suma(cs, (c) => c.capital))] as Celda[];
      })
      .sort((x, y) => (y[3] as number) - (x[3] as number));

  const t = delPeriodo(vista, b);
  const capital = Math.round(ind.capital);
  return {
    plantilla: "corte",
    sufijo: sufijo(b),
    hojas: {
      Datos: filasExcel(vista, periodoDeBase(b)),
      Cadenas: tabla((c) => cadenaPorId(c.sucursal.cadenaId).nombre),
      Colecciones: tabla((c) => c.coleccion.nombre),
    },
    valores: {
      subtitulo: subtitulo(b),
      crecimiento: 0, precio: 0, umbral: filtro.umbral, liquidacion: 0, descuento: DESCUENTO,
      sellin: t.inP, sellinMonto: t.inM, sellout: t.outP, selloutMonto: t.outM,
      indice: t.inP ? t.outP / t.inP : 0,
      exc: ind.excedente, capital, liqPzas: 0, liberado: 0, castigo: 0,
      perdidaPzas: suma(vista, perdidaPzas), perdida: ind.perdida,
      sellinBase: t.inP, sellinBaseMonto: t.inM, sellinR: t.inP, sellinMontoR: t.inM, difPzas: 0, difMonto: 0,
      excR: ind.excedente, capitalR: capital, liqPzasR: 0, liberadoR: 0, castigoR: 0,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Escenario y estado de resultados
 * ------------------------------------------------------------------ */
export function libroEscenario(b: Base, activo: Escenario, todos: Escenario[]): Paquete {
  const { vista, ind } = b;
  const s = activo.supuestos;
  const ref = ESCENARIOS_BASE[0].supuestos;
  const p = proyectar(activo, vista, ind.perdida, ind.capital);

  // La corrida base es sell-in: lo cargado, llevado a un año.
  const semanas = Math.max(1, vista[0]?.hin.length ?? 12);
  const corrida = new Map<string, number>();
  for (const c of vista) {
    corrida.set(c.coleccion.id, (corrida.get(c.coleccion.id) ?? 0) + (suma(c.hin, (x) => x) * 52) / semanas);
  }

  const modelo = p.lineas.map((l) => {
    const col = coleccionPorId(l.coleccionId);
    return [
      l.nombre, l.segmento, corrida.get(l.coleccionId) ?? 0, col.precio, col.margen, col.estacionalidad,
      l.precioNeto, precioSellIn(col) * (1 - MARGEN_MARCA) * (1 + s.costo / 100),
      ...l.unidades, l.totalUnidades, l.totalIngreso, l.totalCosto, l.totalMargen, l.margenPct / 100,
    ] as Celda[];
  });

  const meses = Array.from({ length: 12 }, (_, m) => m);
  const porCol = meses.map((m) => suma(p.lineas, (l) => l.ingreso[m]));
  const conAnual = (nombre: string, xs: number[]) => [nombre, ...xs, suma(xs, (x) => x)] as Celda[];
  const filasMeses = [
    conAnual("Sell-in por colecciones", porCol),
    conAnual("Sell-in recuperado al cerrar quiebres", meses.map((m) => p.ingresoMes[m] - porCol[m])),
    conAnual("Ingreso por sell-in", p.ingresoMes),
    conAnual("Costo del producto", p.costoMes),
    conAnual("Margen sobre sell-in", p.margenMes),
    conAnual("Gasto total", p.gastoMes),
    conAnual("EBITDA", p.ebitdaMes),
    conAnual("Piezas de sell-in", p.unidadesMes),
  ];

  const trim = (xs: number[]) => [0, 1, 2, 3].map((q) => xs[q * 3] + xs[q * 3 + 1] + xs[q * 3 + 2]);
  const ing = trim(p.ingresoMes), cst = trim(p.costoMes), pzs = trim(p.unidadesMes);
  const fijo = [0, 1, 2, 3].map(() => (s.gastoFijo * 1e6) / 4);
  const vari = ing.map((x) => x * (s.gastoVariable / 100));
  const mkt = [0, 1, 2, 3].map(() => (s.mercadotecnia * 1e6) / 4);
  const fin = [0, 1, 2, 3].map(() => p.costoInventario / 4);
  const gasto = [0, 1, 2, 3].map((q) => fijo[q] + vari[q] + mkt[q] + fin[q]);
  const mb = ing.map((x, q) => x - cst[q]);
  const eb = mb.map((x, q) => x - gasto[q]);
  const resultados = [
    conAnual("Ingreso por sell-in", ing), conAnual("Costo del producto", cst), conAnual("Margen sobre sell-in", mb),
    conAnual("Gasto fijo de operación", fijo), conAnual("Gasto variable", vari), conAnual("Mercadotecnia", mkt),
    conAnual("Costo financiero del inventario y liquidación", fin), conAnual("Gasto operativo total", gasto),
    conAnual("EBITDA", eb), conAnual("Piezas de sell-in", pzs),
  ];
  const trimestres = [0, 1, 2, 3].map((q) => [`T${q + 1}`, ing[q], eb[q], pzs[q]] as Celda[]);

  const fila = (nombre: string, q: ReturnType<typeof proyectar>) =>
    [nombre, q.unidades, q.ingreso, q.margenBruto, q.margenPct / 100, q.ebitda, q.ebitdaPct / 100] as Celda[];
  const escenarios = [fila("Este libro, con sus supuestos", p), ...todos.map((e) => fila(e.nombre, proyectar(e, vista, ind.perdida, ind.capital)))];

  const cadenas = p.porCadena.map((c) => [c.nombre, p.ingreso ? c.ingreso / p.ingreso : 0, c.unidades, c.ingreso, c.margen] as Celda[]);

  // Lo que cada cadena ya vendió, y lo que se le resurtió, en el periodo puesto.
  const vendido = porCadena(vista, periodoDeBase(b))
    .map((c) => [c.nombre, c.outPzas, c.inPzas, c.outMonto, c.inMonto, c.inPzas - c.outPzas, c.inPzas ? c.outPzas / c.inPzas : 0] as Celda[]);

  const liq = s.liquidacion / 100;
  const factor =
    (1 + s.crecimiento / 100) * Math.pow(1 + s.precio / 100, -s.elasticidad) *
    (s.mercadotecnia <= 0 ? 0.94 : 1 + 0.085 * Math.log(s.mercadotecnia / Math.max(1, ref.mercadotecnia))) *
    (s.diasObjetivo < 35 ? 1 - (35 - s.diasObjetivo) * 0.006 : 1) * (1 + liq * 0.14);

  return {
    plantilla: "escenario",
    sufijo: `${CORTE.etiqueta}_${activo.nombre}`,
    hojas: {
      Modelo: modelo, Meses: filasMeses, Resultados: resultados, Trimestres: trimestres, Escenarios: escenarios,
      Cadenas: cadenas, "Lo ya vendido": vendido,
    },
    valores: {
      subtitulo: subtitulo(b, `Escenario: ${activo.nombre}`),
      crecimiento: s.crecimiento / 100, precio: s.precio / 100, costo: s.costo / 100, elasticidad: s.elasticidad,
      servicio: s.servicio / 100, mercadotecnia: s.mercadotecnia, dias: s.diasObjetivo, liquidacion: liq,
      gastoFijo: s.gastoFijo, gastoVariable: s.gastoVariable / 100,
      perdidaSem: ind.perdida, perdidaPzasSem: ind.perdidaPzas, capitalParado: ind.capital,
      baseMkt: ref.mercadotecnia, baseDias: ref.diasObjetivo, margenMarca: MARGEN_MARCA, margenCadena: MARGEN_CADENA_MEDIO,
      ingreso: p.ingreso, unidades: p.unidades, margen: p.margenBruto, margenPct: p.margenPct / 100,
      ebitda: p.ebitda, ebitdaPct: p.ebitdaPct / 100,
      // Lo que se recupera al cerrar quiebres es sell-in: piezas y pesos al
      // precio de venta a la cadena.
      recuperadoPzas: p.recuperadoPzas, recuperado: p.recuperado,
      caja: p.cajaLiberada, factor,
      costoInv: p.inventarioPromedio * 0.18,
      perdLiq: ind.capital * liq * 0.45,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Salud del dato
 * ------------------------------------------------------------------ */
export function libroSalud(b: Base): Paquete {
  const tiendas = [...agrupar(b.vista, (c) => c.sucursal.clave)].map(([, cs]) => ({
    s: cs[0].sucursal, inv: suma(cs, (c) => c.inv), monto: suma(cs, (c) => c.inv * c.costo), combos: cs.length,
  }));
  tiendas.sort((x, y) => Number(x.s.reporta) - Number(y.s.reporta) || x.s.cadenaId.localeCompare(y.s.cadenaId) || x.s.nombre.localeCompare(y.s.nombre));
  const sucursales = tiendas.map((t) => [
    t.s.nombre, cadenaPorId(t.s.cadenaId).nombre, estadoPorId(t.s.estadoId).nombre, t.s.ciudad,
    t.s.apertura > 0 ? `Abrió en la semana ${t.s.apertura}` : "Antes del periodo", t.s.reporta ? "Sí" : "No", t.inv, t.combos,
    t.monto,
  ] as Celda[]);

  const cadenas = [...agrupar(tiendas, (t) => cadenaPorId(t.s.cadenaId).nombre)].map(([n, ts]) => {
    const rep = ts.filter((t) => t.s.reporta).length;
    const ciegas = ts.filter((t) => !t.s.reporta);
    return [n, ts.length, rep, ts.length - rep, ts.length ? rep / ts.length : 0, suma(ciegas, (t) => t.inv),
      suma(ciegas, (t) => t.monto), suma(ts, (t) => t.inv), suma(ts, (t) => t.monto)] as Celda[];
  }).sort((x, y) => (y[1] as number) - (x[1] as number));

  const sin = tiendas.filter((t) => !t.s.reporta);
  const con = tiendas.filter((t) => t.s.reporta);
  return {
    plantilla: "salud",
    sufijo: sufijo(b),
    hojas: { Sucursales: sucursales, Cadenas: cadenas },
    valores: {
      subtitulo: subtitulo(b),
      sucursales: tiendas.length,
      reportan: tiendas.length - sin.length,
      pct: tiendas.length ? (tiendas.length - sin.length) / tiendas.length : 0,
      sin: sin.length,
      piezasSin: suma(sin, (t) => t.inv),
      montoSin: suma(sin, (t) => t.monto),
      combosSin: suma(sin, (t) => t.combos),
      piezasCon: suma(con, (t) => t.inv),
      montoCon: suma(con, (t) => t.monto),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Hallazgos del copiloto
 * ------------------------------------------------------------------ */
export function libroHallazgos(b: Base, hallazgos: Hallazgo[]): Paquete {
  const hs = hallazgos.slice(0, 40);
  const pz = (h: Hallazgo) => Math.round(h.piezas ?? 0);
  const filas = hs.map((h, i) => [i + 1, ETIQUETA_SEVERIDAD[h.severidad], h.titulo, h.area, h.cuerpo, h.accion, h.regla,
    Math.round(h.valor), h.unidad, h.piezas == null ? null : pz(h)] as Celda[]);
  const areas = [...agrupar(hs, (h) => h.area)]
    .map(([n, xs]) => [n, xs.length, suma(xs, (h) => Math.round(h.valor)), suma(xs, pz)] as Celda[])
    .sort((x, y) => (y[2] as number) - (x[2] as number));
  const de = (u: string) => suma(hs.filter((h) => h.unidad === u), (h) => Math.round(h.valor));
  return {
    plantilla: "hallazgos",
    sufijo: sufijo(b),
    hojas: { Hallazgos: filas, "Áreas": areas },
    valores: {
      subtitulo: subtitulo(b),
      total: hs.length,
      criticos: hs.filter((h) => h.severidad === "critica").length,
      liberable: de("liberable"), recuperable: de("recuperable"), riesgo: de("en riesgo"),
      valor: suma(hs, (h) => Math.round(h.valor)),
      piezas: suma(hs, pz),
    },
  };
}
