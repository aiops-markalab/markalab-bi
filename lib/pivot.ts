/**
 * La tabla dinámica.
 *
 * Es la pieza que convierte un tablero en una herramienta de análisis. Un
 * tablero contesta las preguntas que alguien previó; una tabla dinámica
 * contesta la que al director se le ocurre en la junta.
 *
 * Tres decisiones de diseño que conviene conocer:
 *
 *  1. Las medidas se agregan de formas distintas. Las piezas y los pesos se
 *     suman; la cobertura NO se promedia, se recalcula como existencia entre
 *     desplazamiento del grupo. Promediar coberturas es el error clásico: un
 *     grupo con la mitad saturada y la mitad en quiebre promedia «sano».
 *
 *  2. Todo sale de los mismos combos que la plataforma ya calculó. La tabla
 *     no tiene cifras propias, así que no puede contradecir a las otras
 *     pantallas.
 *
 *  3. Las filas se anidan hasta tres niveles y las columnas abren una sola
 *     dimensión. Más que eso se vuelve ilegible en pantalla y nadie lo usa.
 */

import { marcaPorId, cadenaPorId, estadoPorId } from "./catalog";
import { PARAMS, type Combo } from "./engine";

/* ------------------------------------------------------------------ *
 * Dimensiones: por dónde se puede cortar
 * ------------------------------------------------------------------ */

export type DimensionId =
  | "cadena"
  | "formato"
  | "estado"
  | "ciudad"
  | "sucursal"
  | "marca"
  | "segmento"
  | "coleccion"
  | "modelo"
  | "genero"
  | "material";

export type Dimension = {
  id: DimensionId;
  nombre: string;
  grupo: "Tienda" | "Producto";
  /** Con qué valor se agrupa. */
  clave: (c: Combo) => string;
  /** Cómo se escribe en la tabla. */
  etiqueta: (c: Combo) => string;
};

export const DIMENSIONES: Dimension[] = [
  {
    id: "cadena",
    nombre: "Cadena",
    grupo: "Tienda",
    clave: (c) => c.sucursal.cadenaId,
    etiqueta: (c) => cadenaPorId(c.sucursal.cadenaId).nombre,
  },
  {
    id: "formato",
    nombre: "Formato de tienda",
    grupo: "Tienda",
    clave: (c) => cadenaPorId(c.sucursal.cadenaId).formato,
    etiqueta: (c) => cadenaPorId(c.sucursal.cadenaId).formato,
  },
  {
    id: "estado",
    nombre: "Estado",
    grupo: "Tienda",
    clave: (c) => c.sucursal.estadoId,
    etiqueta: (c) => estadoPorId(c.sucursal.estadoId).nombre,
  },
  {
    id: "ciudad",
    nombre: "Ciudad",
    grupo: "Tienda",
    clave: (c) => c.sucursal.ciudad,
    etiqueta: (c) => c.sucursal.ciudad,
  },
  {
    id: "sucursal",
    nombre: "Punto de venta",
    grupo: "Tienda",
    clave: (c) => c.sucursal.clave,
    etiqueta: (c) => c.sucursal.nombre,
  },
  {
    id: "marca",
    nombre: "Marca",
    grupo: "Producto",
    clave: (c) => c.coleccion.marcaId,
    etiqueta: (c) => marcaPorId(c.coleccion.marcaId).nombre,
  },
  {
    id: "segmento",
    nombre: "Segmento",
    grupo: "Producto",
    clave: (c) => c.coleccion.segmento,
    etiqueta: (c) => c.coleccion.segmento,
  },
  {
    id: "coleccion",
    nombre: "Colección",
    grupo: "Producto",
    clave: (c) => c.coleccion.id,
    etiqueta: (c) => c.coleccion.nombre,
  },
  {
    id: "modelo",
    nombre: "Modelo",
    grupo: "Producto",
    clave: (c) => c.modelo.sku,
    etiqueta: (c) => `${c.modelo.sku} · ${c.modelo.nombre}`,
  },
  {
    id: "genero",
    nombre: "Género",
    grupo: "Producto",
    clave: (c) => c.modelo.genero,
    etiqueta: (c) => c.modelo.genero,
  },
  {
    id: "material",
    nombre: "Material",
    grupo: "Producto",
    clave: (c) => c.modelo.material,
    etiqueta: (c) => c.modelo.material,
  },
];

export const dimensionPorId = (id: DimensionId) =>
  DIMENSIONES.find((d) => d.id === id)!;

/* ------------------------------------------------------------------ *
 * Medidas: qué se puede sumar
 * ------------------------------------------------------------------ */

export type MedidaId =
  | "piezas"
  | "transito"
  | "soSemana"
  | "soVentana"
  | "ventaMXN"
  | "ventaAntMXN"
  | "varMXN"
  | "costoMXN"
  | "cobertura"
  | "excedente"
  | "capital"
  | "perdida"
  | "sugerido"
  | "impacto"
  | "tiendas"
  | "skus";

export type Medida = {
  id: MedidaId;
  nombre: string;
  grupo: "Venta" | "Inventario" | "Alerta" | "Conteo";
  formato: "entero" | "decimal" | "dinero" | "porcentaje";
  /** Lo que se acumula por combinación. Las medidas derivadas devuelven 0. */
  suma?: (c: Combo) => number;
  /**
   * Medidas que no se suman: se recalculan sobre los acumulados del grupo.
   * Es lo que evita el promedio de promedios.
   */
  deriva?: (a: Acumulado) => number;
};

export type Acumulado = {
  n: number;
  piezas: number;
  transito: number;
  soSemana: number;
  soAntSemana: number;
  ventaMXN: number;
  ventaAntMXN: number;
  costoMXN: number;
  excedente: number;
  capital: number;
  perdida: number;
  sugerido: number;
  tiendas: Set<string>;
  skus: Set<string>;
};

export const MEDIDAS: Medida[] = [
  {
    id: "soSemana",
    nombre: "Sell-out semanal",
    grupo: "Venta",
    formato: "decimal",
    suma: (c) => c.so,
  },
  {
    id: "soVentana",
    nombre: `Sell-out ${PARAMS.ventana} semanas`,
    grupo: "Venta",
    formato: "entero",
    suma: (c) => c.so * PARAMS.ventana,
  },
  {
    id: "ventaMXN",
    nombre: "Venta $",
    grupo: "Venta",
    formato: "dinero",
    suma: (c) => c.so * PARAMS.ventana * c.precio,
  },
  {
    id: "ventaAntMXN",
    nombre: "Venta $ año anterior",
    grupo: "Venta",
    formato: "dinero",
    suma: (c) => c.soAnt * PARAMS.ventana * c.precio,
  },
  {
    id: "varMXN",
    nombre: "Variación %",
    grupo: "Venta",
    formato: "porcentaje",
    deriva: (a) =>
      a.ventaAntMXN > 0 ? ((a.ventaMXN - a.ventaAntMXN) / a.ventaAntMXN) * 100 : 0,
  },
  {
    id: "costoMXN",
    nombre: "Costo $",
    grupo: "Venta",
    formato: "dinero",
    suma: (c) => c.so * PARAMS.ventana * c.costo,
  },
  {
    id: "piezas",
    nombre: "Piezas en canal",
    grupo: "Inventario",
    formato: "entero",
    suma: (c) => c.inv,
  },
  {
    id: "transito",
    nombre: "En tránsito",
    grupo: "Inventario",
    formato: "entero",
    suma: (c) => c.tr,
  },
  {
    id: "cobertura",
    nombre: "Cobertura (semanas)",
    grupo: "Inventario",
    formato: "decimal",
    // Recalculada, nunca promediada: existencia del grupo entre
    // desplazamiento del grupo.
    deriva: (a) => (a.soSemana > 0.05 ? a.piezas / a.soSemana : a.piezas > 0 ? 99 : 0),
  },
  {
    id: "sugerido",
    nombre: "Resurtido sugerido",
    grupo: "Inventario",
    formato: "entero",
    suma: (c) => c.sug,
  },
  {
    id: "excedente",
    nombre: "Piezas sobre umbral",
    grupo: "Alerta",
    formato: "entero",
    suma: (c) => c.exc,
  },
  {
    id: "capital",
    nombre: "Capital inmovilizado",
    grupo: "Alerta",
    formato: "dinero",
    suma: (c) => c.capital,
  },
  {
    id: "perdida",
    nombre: "Venta perdida semanal",
    grupo: "Alerta",
    formato: "dinero",
    suma: (c) => c.perdida,
  },
  {
    id: "impacto",
    nombre: "Impacto en pesos",
    grupo: "Alerta",
    formato: "dinero",
    suma: (c) => c.impacto,
  },
  {
    id: "tiendas",
    nombre: "Tiendas",
    grupo: "Conteo",
    formato: "entero",
    deriva: (a) => a.tiendas.size,
  },
  {
    id: "skus",
    nombre: "Modelos",
    grupo: "Conteo",
    formato: "entero",
    deriva: (a) => a.skus.size,
  },
];

export const medidaPorId = (id: MedidaId) => MEDIDAS.find((m) => m.id === id)!;

/* ------------------------------------------------------------------ *
 * El cálculo
 * ------------------------------------------------------------------ */

function vacio(): Acumulado {
  return {
    n: 0,
    piezas: 0,
    transito: 0,
    soSemana: 0,
    soAntSemana: 0,
    ventaMXN: 0,
    ventaAntMXN: 0,
    costoMXN: 0,
    excedente: 0,
    capital: 0,
    perdida: 0,
    sugerido: 0,
    tiendas: new Set(),
    skus: new Set(),
  };
}

function acumular(a: Acumulado, c: Combo) {
  a.n += 1;
  a.piezas += c.inv;
  a.transito += c.tr;
  a.soSemana += c.so;
  a.soAntSemana += c.soAnt;
  a.ventaMXN += c.so * PARAMS.ventana * c.precio;
  a.ventaAntMXN += c.soAnt * PARAMS.ventana * c.precio;
  a.costoMXN += c.so * PARAMS.ventana * c.costo;
  a.excedente += c.exc;
  a.capital += c.capital;
  a.perdida += c.perdida;
  a.sugerido += c.sug;
  a.tiendas.add(c.sucursal.clave);
  a.skus.add(c.modelo.sku);
}

/** El valor de una medida sobre un acumulado. */
export function valor(m: Medida, a: Acumulado): number {
  if (m.deriva) return m.deriva(a);
  switch (m.id) {
    case "piezas":
      return a.piezas;
    case "transito":
      return a.transito;
    case "soSemana":
      return a.soSemana;
    case "soVentana":
      return a.soSemana * PARAMS.ventana;
    case "ventaMXN":
      return a.ventaMXN;
    case "ventaAntMXN":
      return a.ventaAntMXN;
    case "costoMXN":
      return a.costoMXN;
    case "excedente":
      return a.excedente;
    case "capital":
      return a.capital;
    case "perdida":
      return a.perdida;
    case "sugerido":
      return a.sugerido;
    default:
      return 0;
  }
}

export type Fila = {
  /** Una etiqueta por nivel de anidamiento. */
  ruta: string[];
  /** Profundidad: 0 es el nivel más alto. */
  nivel: number;
  /** Clave estable para abrir y cerrar. */
  clave: string;
  /** Acumulado por columna. La clave "" es el total de la fila. */
  celdas: Map<string, Acumulado>;
  /** Si tiene hijos, se puede plegar. */
  tieneHijos: boolean;
};

export type Resultado = {
  columnas: { clave: string; etiqueta: string }[];
  filas: Fila[];
  total: Map<string, Acumulado>;
};

export type Config = {
  filas: DimensionId[];
  columna?: DimensionId;
  valores: MedidaId[];
};

/**
 * Arma la tabla. Devuelve las filas ya aplanadas en el orden en que se
 * dibujan, con su nivel, para que la pantalla solo tenga que pintarlas.
 */
export function pivotar(combos: Combo[], cfg: Config): Resultado {
  const dimsFila = cfg.filas.slice(0, 3).map(dimensionPorId);
  const dimCol = cfg.columna ? dimensionPorId(cfg.columna) : null;

  // Columnas: se descubren recorriendo una vez, y se ordenan por su peso.
  const pesoCol = new Map<string, { etiqueta: string; peso: number }>();
  if (dimCol) {
    for (const c of combos) {
      const k = dimCol.clave(c);
      const prev = pesoCol.get(k);
      const peso = (prev?.peso ?? 0) + c.so * c.precio;
      pesoCol.set(k, { etiqueta: prev?.etiqueta ?? dimCol.etiqueta(c), peso });
    }
  }
  const columnas = dimCol
    ? [...pesoCol.entries()]
        .sort((a, b) => b[1].peso - a[1].peso)
        .map(([clave, v]) => ({ clave, etiqueta: v.etiqueta }))
    : [{ clave: "", etiqueta: "" }];

  // Nodo del árbol de filas.
  type Nodo = {
    etiqueta: string;
    clave: string;
    celdas: Map<string, Acumulado>;
    hijos: Map<string, Nodo>;
    peso: number;
  };
  const raiz: Nodo = {
    etiqueta: "",
    clave: "",
    celdas: new Map(),
    hijos: new Map(),
    peso: 0,
  };

  const meter = (n: Nodo, c: Combo) => {
    const kc = dimCol ? dimCol.clave(c) : "";
    for (const k of kc === "" ? [""] : [kc, ""]) {
      let a = n.celdas.get(k);
      if (!a) {
        a = vacio();
        n.celdas.set(k, a);
      }
      acumular(a, c);
    }
    n.peso += c.so * c.precio;
  };

  for (const c of combos) {
    meter(raiz, c);
    let actual = raiz;
    let rutaClave = "";
    for (const d of dimsFila) {
      const k = d.clave(c);
      rutaClave = rutaClave ? `${rutaClave}|${k}` : k;
      let hijo = actual.hijos.get(k);
      if (!hijo) {
        hijo = {
          etiqueta: d.etiqueta(c),
          clave: rutaClave,
          celdas: new Map(),
          hijos: new Map(),
          peso: 0,
        };
        actual.hijos.set(k, hijo);
      }
      meter(hijo, c);
      actual = hijo;
    }
  }

  // Aplanado, ordenando cada nivel por peso: lo que más vende, arriba.
  const filas: Fila[] = [];
  const recorrer = (n: Nodo, nivel: number, ruta: string[]) => {
    const hijos = [...n.hijos.values()].sort((a, b) => b.peso - a.peso);
    for (const h of hijos) {
      filas.push({
        ruta: [...ruta, h.etiqueta],
        nivel,
        clave: h.clave,
        celdas: h.celdas,
        tieneHijos: h.hijos.size > 0,
      });
      recorrer(h, nivel + 1, [...ruta, h.etiqueta]);
    }
  };
  recorrer(raiz, 0, []);

  return { columnas, filas, total: raiz.celdas };
}

/* ------------------------------------------------------------------ *
 * Formato y exportación
 * ------------------------------------------------------------------ */

export function formatear(m: Medida, v: number): string {
  const neg = v < 0;
  const abs = Math.abs(v);
  const miles = (n: number, d = 0) => {
    const [ent, dec] = n.toFixed(d).split(".");
    return ent.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (dec ? "." + dec : "");
  };
  if (m.formato === "dinero") {
    if (abs >= 1_000_000) return `${neg ? "−" : ""}$${miles(abs / 1_000_000, 1)} M`;
    if (abs >= 1_000) return `${neg ? "−" : ""}$${miles(abs / 1_000, 1)} k`;
    return `${neg ? "−" : ""}$${miles(abs)}`;
  }
  if (m.formato === "porcentaje") return `${neg ? "−" : "+"}${miles(abs, 1)}%`;
  if (m.formato === "decimal") {
    if (abs > 90) return "∞";
    return `${neg ? "−" : ""}${miles(abs, 1)}`;
  }
  return `${neg ? "−" : ""}${miles(abs)}`;
}

/** El mismo número, sin formato, para la exportación. */
export const crudo = (m: Medida, v: number) =>
  m.formato === "decimal" || m.formato === "porcentaje"
    ? Number(v.toFixed(2))
    : Math.round(v);

/**
 * La tabla como CSV, con BOM para que Excel en Windows abra los acentos
 * bien y con punto y coma, que es el separador que espera Excel en español.
 */
export function aCSV(r: Resultado, cfg: Config): string {
  const dims = cfg.filas.slice(0, 3).map(dimensionPorId);
  const meds = cfg.valores.map(medidaPorId);
  const sep = ";";
  const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

  const enc = [...dims.map((d) => d.nombre)];
  for (const col of r.columnas) {
    for (const m of meds) {
      enc.push(col.etiqueta ? `${col.etiqueta} · ${m.nombre}` : m.nombre);
    }
  }
  const lineas = [enc.map(esc).join(sep)];

  const linea = (ruta: string[], celdas: Map<string, Acumulado>) => {
    const campos = dims.map((_, i) => ruta[i] ?? "");
    for (const col of r.columnas) {
      const a = celdas.get(col.clave) ?? vacio();
      for (const m of meds) campos.push(String(crudo(m, valor(m, a))));
    }
    return campos.map(esc).join(sep);
  };

  for (const f of r.filas) lineas.push(linea(f.ruta, f.celdas));
  lineas.push(linea(dims.map(() => "Total"), r.total));

  return "﻿" + lineas.join("\r\n");
}

/* ------------------------------------------------------------------ *
 * La tabla a Excel
 * ------------------------------------------------------------------ */

/**
 * La misma tabla, pero en la forma que espera la plantilla `reporte.xlsx`.
 *
 * Un CSV no es una salida para un director: es un archivo de texto con punto
 * y coma. Esto devuelve lo que hace falta para armar un libro con la tabla
 * formateada y una gráfica nativa.
 *
 * La gráfica se alimenta de una tabla aparte, de dos columnas y veinte
 * renglones fijos, porque el reporte cambia de forma según cómo lo configure
 * el usuario y una gráfica no puede apuntar a un rango que no sabe de qué
 * tamaño es. Veinte es lo que cabe en una lámina sin que las barras se
 * conviertan en rayas.
 */
export function aExcel(
  r: Resultado,
  cfg: Config
): {
  encabezados: string[];
  filas: (string | number | null)[][];
  grafica: (string | number | null)[][];
  medida: string;
} {
  const dims = cfg.filas.slice(0, 3).map(dimensionPorId);
  const meds = cfg.valores.map(medidaPorId);

  const encabezados = [...dims.map((d) => d.nombre)];
  for (const col of r.columnas) {
    for (const m of meds) {
      encabezados.push(col.etiqueta ? `${col.etiqueta} · ${m.nombre}` : m.nombre);
    }
  }

  const renglon = (ruta: string[], celdas: Map<string, Acumulado>) => {
    const campos: (string | number | null)[] = dims.map((_, i) => ruta[i] ?? "");
    for (const col of r.columnas) {
      const a = celdas.get(col.clave) ?? vacio();
      for (const m of meds) campos.push(crudo(m, valor(m, a)));
    }
    return campos;
  };

  const filas = r.filas.map((f) => renglon(f.ruta, f.celdas));
  filas.push(renglon(dims.map(() => "Total"), r.total));

  // La gráfica toma la primera medida en pesos que haya, y si no hay ninguna,
  // la primera que sea. Un director mira el dinero antes que las piezas, y un
  // reporte ejecutivo suele traer las dos cosas: graficar las piezas porque
  // quedaron a la izquierda es dejar la decisión al azar del orden.
  const primera = meds.find((m) => m.formato === "dinero") ?? meds[0];
  const col0 = r.columnas[0];
  const hojas = r.filas.filter((f) => !f.tieneHijos);
  const base = hojas.length ? hojas : r.filas;
  const grafica = base
    .map((f) => {
      const a = f.celdas.get(col0?.clave ?? "") ?? f.celdas.get("") ?? vacio();
      return [f.ruta.filter(Boolean).join(" · "), crudo(primera, valor(primera, a))] as [
        string,
        number,
      ];
    })
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 20);

  return {
    encabezados,
    filas,
    grafica,
    medida: col0?.etiqueta ? `${col0.etiqueta} · ${primera.nombre}` : primera.nombre,
  };
}
