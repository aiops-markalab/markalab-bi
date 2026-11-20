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
  CORTE, ETIQUETA_CLASE, PARAMS, porEstado, porSucursal, traslados,
  type Combo, type Dataset, type Filtro, type Indicadores,
} from "./engine";
import { cadenaPorId, coleccionPorId, estadoPorId } from "./catalog";
import { ETIQUETA_SEVERIDAD, type Hallazgo } from "./copiloto";
import { alcance } from "./pantallas";
import { proyectar, ESCENARIOS_BASE, type Escenario } from "./plan";
import { aExcel, type Config, type Resultado } from "./pivot";
import { enHoja, filasExcel, r4, type Celda, type Paquete } from "./excel";

export type Base = { vista: Combo[]; data: Dataset; ind: Indicadores; filtro: Filtro };

const TASA = PARAMS.costoCapitalAnual;
const DESCUENTO = 0.35;
const EDAD = 360;

/** La segunda línea de todo tablero: de qué corte y de qué alcance es el archivo. */
function subtitulo(b: Base, extra = ""): string {
  const hoy = new Date();
  const fecha = `${String(hoy.getDate()).padStart(2, "0")}/${String(hoy.getMonth() + 1).padStart(2, "0")}/${hoy.getFullYear()}`;
  const donde = alcance(b.filtro);
  return `Corte ${CORTE.etiqueta}  ·  ${donde[0].toUpperCase()}${donde.slice(1)}  ·  Umbral de ${b.filtro.umbral} semanas${extra ? `  ·  ${extra}` : ""}  ·  Generado el ${fecha}`;
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
const cob = (inv: number, so: number) => (so > 0.05 ? inv / so : inv > 0 ? 99 : 0);

/* ------------------------------------------------------------------ *
 * Resumen
 * ------------------------------------------------------------------ */
export function libroResumen(b: Base): Paquete {
  const { vista, data, ind, filtro } = b;
  const venta = suma(vista, (c) => enHoja(c).venta);
  const ventaAnt = suma(vista, (c) => enHoja(c).ventaAnt);
  const costo = suma(vista, (c) => enHoja(c).costo);
  const so = suma(vista, (c) => r4(c.so));

  const cadenas = [...agrupar(vista, (c) => cadenaPorId(c.sucursal.cadenaId).nombre)]
    .map(([n, cs]) => {
      const v = suma(cs, (c) => enHoja(c).venta), a = suma(cs, (c) => enHoja(c).ventaAnt);
      const inv = suma(cs, (c) => c.inv), s = suma(cs, (c) => r4(c.so));
      return [n, v, a, a ? v / a - 1 : 0, suma(cs, (c) => enHoja(c).so8), inv, s > 0.05 ? inv / s : 0,
        Math.round(suma(cs, (c) => c.capital)), cs.filter(esQuiebre).length] as Celda[];
    })
    .sort((x, y) => (y[1] as number) - (x[1] as number));

  const modelos = [...agrupar(vista, (c) => c.modelo.sku)]
    .map(([sku, cs]) => {
      const v = suma(cs, (c) => enHoja(c).venta), a = suma(cs, (c) => enHoja(c).ventaAnt);
      const inv = suma(cs, (c) => c.inv), s = suma(cs, (c) => r4(c.so));
      return [sku, cs[0].modelo.nombre, v, suma(cs, (c) => enHoja(c).so8), a ? v / a - 1 : 0, inv, s > 0.05 ? inv / s : 0] as Celda[];
    })
    .sort((x, y) => (y[2] as number) - (x[2] as number))
    .slice(0, 10);

  const estados = porEstado(vista, filtro.umbral)
    .slice(0, 10)
    .map((e) => [e.estado.nombre, Math.round(e.capital), e.perdida, Math.round(e.capital) + e.perdida * 4, e.inv, e.so > 0.05 ? e.inv / e.so : 0] as Celda[]);

  const prop = data.combos.length ? vista.length / data.combos.length : 1;
  const serie = data.serie.map((s) => [s.etiqueta, Math.round(s.sellIn * prop), Math.round(s.sellOut * prop), Math.round(s.inventario * prop)] as Celda[]);
  const sellIn = suma(serie, (s) => s[1] as number), sellOut = suma(serie, (s) => s[2] as number);

  return {
    plantilla: "resumen",
    sufijo: sufijo(b),
    hojas: { Datos: filasExcel(vista), Cadenas: cadenas, Modelos: modelos, Estados: estados, Serie: serie },
    valores: {
      subtitulo: subtitulo(b),
      umbral: filtro.umbral,
      tasa: TASA,
      sellout8: suma(vista, (c) => enHoja(c).so8),
      venta,
      variacion: ventaAnt ? venta / ventaAnt - 1 : 0,
      cobertura: so > 0 ? ind.inventario / so : 0,
      capital: Math.round(ind.capital),
      perdida: ind.perdida,
      piezas: ind.inventario,
      quiebres: ind.quiebres,
      sobre: ind.saturadas,
      sellin: sellIn,
      indice: sellIn ? sellOut / sellIn : 0,
      margen: venta ? (venta - costo) / venta : 0,
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
  const ventaEstado = new Map<string, number>();
  for (const c of vista) ventaEstado.set(c.sucursal.estadoId, (ventaEstado.get(c.sucursal.estadoId) ?? 0) + enHoja(c).venta);

  const filasEstados = estados.map((e) => [
    e.estado.nombre, e.sucursales, e.combos, e.inv, Math.round(e.so * PARAMS.ventana),
    ventaEstado.get(e.estado.id) ?? 0, e.exc, Math.round(e.capital), e.perdida, Math.round(e.capital) + e.perdida * 4,
    cob(e.inv, e.so), e.sobreUmbral, e.quiebres, ETIQUETA_CLASE[e.clase],
  ] as Celda[]);

  const sucursales = porSucursal(vista, filtro.umbral)
    .sort((x, y) => y.capital - x.capital || y.perdida - x.perdida)
    .slice(0, 120)
    .map((s) => [
      s.sucursal.nombre, cadenaPorId(s.sucursal.cadenaId).nombre, estadoPorId(s.sucursal.estadoId).nombre, s.sucursal.ciudad,
      s.combos, s.inv, s.so, cob(s.inv, s.so), s.exc, Math.round(s.capital), s.quiebres, s.perdida,
      s.sucursal.reporta ? ETIQUETA_CLASE[s.clase] : "Sin reporte",
    ] as Celda[]);

  const capital = Math.round(ind.capital);
  return {
    plantilla: "mapa",
    sufijo: sufijo(b),
    hojas: { Datos: filasExcel(vista), Estados: filasEstados, Sucursales: sucursales },
    valores: {
      subtitulo: subtitulo(b),
      umbral: filtro.umbral,
      descuento: DESCUENTO,
      tasa: TASA,
      estados: estados.length,
      alerta: estados.filter((e) => e.clase !== "sano").length,
      capital,
      exc: ind.excedente,
      perdida: ind.perdida,
      impacto: capital + ind.perdida * 4,
      liberado: capital * (1 - DESCUENTO),
      castigo: capital * DESCUENTO,
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
  const mover = traslados(sobre, vista, 60);
  const base = (c: Combo): Celda[] => [c.sucursal.nombre, cadenaPorId(c.sucursal.cadenaId).nombre, c.modelo.sku, c.modelo.nombre];

  const filasTraslados = mover.map((t) => {
    const flete = t.piezas * PARAMS.costoTraslado, neto = t.recupera * 4 - flete;
    return [cadenaPorId(t.origen.sucursal.cadenaId).nombre, t.origen.modelo.sku, t.origen.modelo.nombre,
      t.origen.sucursal.nombre, t.destino.sucursal.nombre, t.piezas, t.semanas, t.recupera, flete, neto, neto > 0 ? "Sí" : "No"] as Celda[];
  });

  const noEmbarcar = [...sobre].sort((x, y) => y.capital - x.capital).slice(0, 300)
    .map((c) => [...base(c), c.inv, c.tr, r4(c.so), c.costo, cob(c.inv, r4(c.so)), c.exc, Math.round(c.capital)] as Celda[]);

  const resurtir = vista.filter((c) => c.sug > 0).sort((x, y) => y.perdida - x.perdida || y.sug - x.sug).slice(0, 300)
    .map((c) => [...base(c), c.inv, c.tr, r4(c.so), c.precio, c.objetivo, c.sug, c.inv === 0 && c.so > 0.15 ? r4(c.so) * c.precio : 0] as Celda[]);

  const liquidar = [...viejos].sort((x, y) => y.inv * y.costo - x.inv * x.costo).slice(0, 300)
    .map((c) => [...base(c), c.inv, c.edad, c.costo, c.inv * c.costo, c.inv * c.costo * (1 - DESCUENTO), "Sí"] as Celda[]);

  const colecciones = [...agrupar(vista, (c) => c.coleccion.nombre)]
    .map(([n, cs]) => [n, suma(cs.filter(esQuiebre), (c) => c.perdida), Math.round(suma(cs, (c) => c.capital)),
      cs.filter(esQuiebre).length, cs.filter(esSobre).length] as Celda[])
    .sort((x, y) => (y[1] as number) - (x[1] as number));

  const capital = Math.round(ind.capital);
  const viejasCosto = suma(viejos, (c) => c.inv * c.costo);
  return {
    plantilla: "ejecucion",
    sufijo: sufijo(b),
    hojas: {
      Datos: filasExcel(vista), Traslados: filasTraslados, "No embarcar": noEmbarcar, Resurtir: resurtir,
      Liquidar: liquidar, Colecciones: colecciones,
    },
    valores: {
      subtitulo: subtitulo(b),
      umbral: u, flete: PARAMS.costoTraslado, dias: PARAMS.diasObjetivo, tasa: TASA, edad: EDAD, descuento: DESCUENTO,
      sobre: sobre.length,
      capital,
      traslados: mover.length,
      perdida: ind.perdida,
      resurtir: suma(vista, (c) => c.sug),
      inaccion: ind.perdida * 4.3 + (capital * TASA) / 12,
      fleteTotal: suma(mover, (t) => t.piezas * PARAMS.costoTraslado),
      recupera: suma(mover, (t) => t.recupera),
      neto: suma(mover, (t) => t.recupera * 4 - t.piezas * PARAMS.costoTraslado),
      viejas: suma(viejos, (c) => c.inv),
      viejasCosto,
      viejasCaja: viejasCosto * (1 - DESCUENTO),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Detalle por tienda
 * ------------------------------------------------------------------ */
export function libroDetalle(b: Base): Paquete {
  const { vista, filtro } = b;
  const clase = (c: Combo) => (c.sucursal.reporta ? ETIQUETA_CLASE[c.clase] : "Sin reporte");
  const orden = [...vista].sort((x, y) => y.impacto - x.impacto).slice(0, 2500);

  const filas = orden.map((c) => [
    c.sucursal.nombre, cadenaPorId(c.sucursal.cadenaId).nombre, estadoPorId(c.sucursal.estadoId).nombre, c.modelo.sku,
    c.modelo.nombre, c.coleccion.nombre, c.inv, c.tr, r4(c.so), c.precio, c.costo, c.edad, c.sucursal.reporta ? 1 : 0,
    c.sucursal.reporta ? cob(c.inv, r4(c.so)) : null, c.exc, Math.round(c.capital), c.perdida, Math.round(c.impacto),
    clase(c), `${c.sucursal.nombre} · ${c.modelo.sku}`,
  ] as Celda[]);

  const NOMBRES = ["Sano", "Cobertura alta", "Saturado", "Quiebre"];
  const clases = NOMBRES.map((n) => {
    const cs = orden.filter((c) => clase(c) === n);
    return [n, cs.length, Math.round(suma(cs, (c) => Math.round(c.capital))), suma(cs, (c) => c.perdida)] as Celda[];
  });
  const cuenta = (n: string) => orden.filter((c) => clase(c) === n).length;

  return {
    plantilla: "detalle",
    sufijo: sufijo(b),
    hojas: { Detalle: filas, Clases: clases },
    valores: {
      subtitulo: subtitulo(b),
      umbral: filtro.umbral,
      combos: orden.length,
      piezas: suma(orden, (c) => c.inv),
      so: suma(orden, (c) => r4(c.so)),
      capital: suma(orden, (c) => Math.round(c.capital)),
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
  const GASTO = 0.36;
  // Las mismas cuentas que hace la plantilla: piezas ya redondeadas por precio.
  const v = (c: Combo) => enHoja(c).so8 * c.precio;
  const a = (c: Combo) => enHoja(c).ant8 * c.precio;
  const k = (c: Combo) => enHoja(c).so8 * c.costo;
  const tabla = (clave: (c: Combo) => string) =>
    [...agrupar(vista, clave)]
      .map(([n, cs]) => {
        const vv = suma(cs, v), aa = suma(cs, a), mm = vv - suma(cs, k);
        return [n, vv, aa, aa ? vv / aa - 1 : 0, mm, vv ? mm / vv : 0, Math.round(suma(cs, (c) => c.capital))] as Celda[];
      })
      .sort((x, y) => (y[1] as number) - (x[1] as number));

  const venta = suma(vista, v), ant = suma(vista, a), costo = suma(vista, k);
  const margen = venta - costo, capital = Math.round(ind.capital), gasto = venta * GASTO;
  return {
    plantilla: "corte",
    sufijo: sufijo(b),
    hojas: {
      Datos: filasExcel(vista),
      Cadenas: tabla((c) => cadenaPorId(c.sucursal.cadenaId).nombre),
      Colecciones: tabla((c) => c.coleccion.nombre),
    },
    valores: {
      subtitulo: subtitulo(b),
      crecimiento: 0, precio: 0, umbral: filtro.umbral, liquidacion: 0, descuento: DESCUENTO, tasa: TASA, gasto: GASTO,
      venta, variacion: ant ? venta / ant - 1 : 0, margenPct: venta ? margen / venta : 0, capital, liberado: 0,
      ebitda: margen - gasto,
      ventaR: venta, ventaAnt: ant, costoVendido: costo, margen, capitalR: capital, liberadoR: 0, castigo: 0, ahorro: 0,
      gastoOp: gasto, ebitdaR: margen - gasto,
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

  const corrida = new Map<string, number>();
  for (const c of vista) corrida.set(c.coleccion.id, (corrida.get(c.coleccion.id) ?? 0) + c.so * 52);

  const modelo = p.lineas.map((l) => {
    const col = coleccionPorId(l.coleccionId);
    return [
      l.nombre, l.segmento, corrida.get(l.coleccionId) ?? 0, col.precio, col.margen, col.estacionalidad,
      l.precioNeto, col.precio * (1 - col.margen) * (1 + s.costo / 100),
      ...l.unidades, l.totalUnidades, l.totalIngreso, l.totalCosto, l.totalMargen, l.margenPct / 100,
    ] as Celda[];
  });

  const meses = Array.from({ length: 12 }, (_, m) => m);
  const porCol = meses.map((m) => suma(p.lineas, (l) => l.ingreso[m]));
  const conAnual = (nombre: string, xs: number[]) => [nombre, ...xs, suma(xs, (x) => x)] as Celda[];
  const filasMeses = [
    conAnual("Ingreso por colecciones", porCol),
    conAnual("Venta recuperada al cerrar quiebres", meses.map((m) => p.ingresoMes[m] - porCol[m])),
    conAnual("Ingreso neto", p.ingresoMes),
    conAnual("Costo de ventas", p.costoMes),
    conAnual("Margen bruto", p.margenMes),
    conAnual("Gasto total", p.gastoMes),
    conAnual("EBITDA", p.ebitdaMes),
  ];

  const trim = (xs: number[]) => [0, 1, 2, 3].map((q) => xs[q * 3] + xs[q * 3 + 1] + xs[q * 3 + 2]);
  const ing = trim(p.ingresoMes), cst = trim(p.costoMes);
  const fijo = [0, 1, 2, 3].map(() => (s.gastoFijo * 1e6) / 4);
  const vari = ing.map((x) => x * (s.gastoVariable / 100));
  const mkt = [0, 1, 2, 3].map(() => (s.mercadotecnia * 1e6) / 4);
  const fin = [0, 1, 2, 3].map(() => p.costoInventario / 4);
  const gasto = [0, 1, 2, 3].map((q) => fijo[q] + vari[q] + mkt[q] + fin[q]);
  const mb = ing.map((x, q) => x - cst[q]);
  const eb = mb.map((x, q) => x - gasto[q]);
  const resultados = [
    conAnual("Ingreso neto", ing), conAnual("Costo de ventas", cst), conAnual("Margen bruto", mb),
    conAnual("Gasto fijo de operación", fijo), conAnual("Gasto variable", vari), conAnual("Mercadotecnia", mkt),
    conAnual("Costo financiero del inventario y liquidación", fin), conAnual("Gasto operativo total", gasto),
    conAnual("EBITDA", eb),
  ];
  const trimestres = [0, 1, 2, 3].map((q) => [`T${q + 1}`, ing[q], eb[q]] as Celda[]);

  const fila = (nombre: string, q: ReturnType<typeof proyectar>) =>
    [nombre, q.ingreso, q.margenBruto, q.margenPct / 100, q.ebitda, q.ebitdaPct / 100] as Celda[];
  const escenarios = [fila("Este libro, con sus supuestos", p), ...todos.map((e) => fila(e.nombre, proyectar(e, vista, ind.perdida, ind.capital)))];

  const cadenas = p.porCadena.map((c) => [c.nombre, p.ingreso ? c.ingreso / p.ingreso : 0, c.ingreso, c.margen] as Celda[]);

  const liq = s.liquidacion / 100;
  const factor =
    (1 + s.crecimiento / 100) * Math.pow(1 + s.precio / 100, -s.elasticidad) *
    (s.mercadotecnia <= 0 ? 0.94 : 1 + 0.085 * Math.log(s.mercadotecnia / Math.max(1, ref.mercadotecnia))) *
    (s.diasObjetivo < 35 ? 1 - (35 - s.diasObjetivo) * 0.006 : 1) * (1 + liq * 0.14);

  return {
    plantilla: "escenario",
    sufijo: `${CORTE.etiqueta}_${activo.nombre}`,
    hojas: { Modelo: modelo, Meses: filasMeses, Resultados: resultados, Trimestres: trimestres, Escenarios: escenarios, Cadenas: cadenas },
    valores: {
      subtitulo: subtitulo(b, `Escenario: ${activo.nombre}`),
      crecimiento: s.crecimiento / 100, precio: s.precio / 100, costo: s.costo / 100, elasticidad: s.elasticidad,
      servicio: s.servicio / 100, mercadotecnia: s.mercadotecnia, dias: s.diasObjetivo, liquidacion: liq,
      gastoFijo: s.gastoFijo, gastoVariable: s.gastoVariable / 100,
      perdidaSem: ind.perdida, capitalParado: ind.capital, baseMkt: ref.mercadotecnia, baseDias: ref.diasObjetivo,
      ingreso: p.ingreso, margen: p.margenBruto, margenPct: p.margenPct / 100, ebitda: p.ebitda, ebitdaPct: p.ebitdaPct / 100,
      caja: p.cajaLiberada, factor,
      // La VENTA recuperada. La proyección guarda en `recuperado` el margen
      // de esa venta, que es otra cifra; aquí va la que dice la etiqueta.
      recuperado: ind.perdida * 52 * (s.servicio / 100),
      costoInv: p.inventarioPromedio * 0.18,
      perdLiq: ind.capital * liq * 0.45, unidades: p.unidades,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Salud del dato
 * ------------------------------------------------------------------ */
export function libroSalud(b: Base): Paquete {
  const tiendas = [...agrupar(b.vista, (c) => c.sucursal.clave)].map(([, cs]) => ({
    s: cs[0].sucursal, inv: suma(cs, (c) => c.inv), combos: cs.length,
  }));
  tiendas.sort((x, y) => Number(x.s.reporta) - Number(y.s.reporta) || x.s.cadenaId.localeCompare(y.s.cadenaId) || x.s.nombre.localeCompare(y.s.nombre));
  const sucursales = tiendas.map((t) => [
    t.s.nombre, cadenaPorId(t.s.cadenaId).nombre, estadoPorId(t.s.estadoId).nombre, t.s.ciudad,
    t.s.apertura > 0 ? `Abrió en la semana ${t.s.apertura}` : "Antes del periodo", t.s.reporta ? "Sí" : "No", t.inv, t.combos,
  ] as Celda[]);

  const cadenas = [...agrupar(tiendas, (t) => cadenaPorId(t.s.cadenaId).nombre)].map(([n, ts]) => {
    const rep = ts.filter((t) => t.s.reporta).length;
    return [n, ts.length, rep, ts.length - rep, ts.length ? rep / ts.length : 0, suma(ts.filter((t) => !t.s.reporta), (t) => t.inv)] as Celda[];
  }).sort((x, y) => (y[1] as number) - (x[1] as number));

  const sin = tiendas.filter((t) => !t.s.reporta);
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
      combosSin: suma(sin, (t) => t.combos),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Hallazgos del copiloto
 * ------------------------------------------------------------------ */
export function libroHallazgos(b: Base, hallazgos: Hallazgo[]): Paquete {
  const hs = hallazgos.slice(0, 40);
  const filas = hs.map((h, i) => [i + 1, ETIQUETA_SEVERIDAD[h.severidad], h.titulo, h.area, h.cuerpo, h.accion, h.regla, Math.round(h.valor), h.unidad] as Celda[]);
  const areas = [...agrupar(hs, (h) => h.area)]
    .map(([n, xs]) => [n, xs.length, suma(xs, (h) => Math.round(h.valor))] as Celda[])
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
    },
  };
}
