/**
 * El contrato de la hoja Datos.
 *
 * Las columnas de aquí tienen que coincidir, en orden y en nombre, con las de
 * `COLUMNAS_DATOS` en el script que construye las plantillas. Si se agrega una
 * columna, se agrega en los dos lados y al final, o las fórmulas de las
 * plantillas apuntan a la columna equivocada y nadie se entera hasta que
 * alguien suma mal en una junta.
 */

import { PARAMS, type Combo } from "./engine";
import { marcaPorId, cadenaPorId, estadoPorId } from "./catalog";

/** Una celda: texto o número. `null` deja la celda vacía. */
export type Celda = string | number | null;

export const COLUMNAS_EXCEL = [
  "Cadena", "Formato", "Estado", "Ciudad", "Punto de venta", "Marca", "Segmento", "Colección", "SKU", "Modelo",
  "Género", "Material", "Precio", "Costo", "Piezas", "Tránsito", "Sell-out semanal", "Sell-out 8 sem",
  "Sell-out 8 sem ant", "Venta $", "Venta $ año ant", "Costo $", "Cobertura sem", "Excedente",
  "Capital inmovilizado", "Venta perdida sem", "Sugerido", "Impacto $", "Días en canal", "Sell-out última sem",
  "Sell-out 4 sem", "Reporta",
] as const;

export const r1 = (n: number) => Math.round(n * 10) / 10;
/* El sell-out semanal viaja con cuatro decimales: las fórmulas recalculan el
   excedente como existencia menos desplazamiento por umbral, y con menos
   decimales esa resta se va de lado justo en las combinaciones chicas. */
export const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Las cifras de una combinación tal como quedan escritas en la hoja Datos. */
export function enHoja(c: Combo) {
  // Con un decimal y no redondeadas a pieza entera: mil ochocientos redondeos
  // sumados mueven el total unas piezas, y entonces el Excel dice 10,686
  // donde la pantalla dice 10,683.
  const so8 = r1(c.so * PARAMS.ventana);
  const ant8 = r1(c.soAnt * PARAMS.ventana);
  return {
    so: r4(c.so),
    so8,
    ant8,
    venta: Math.round(c.so * PARAMS.ventana * c.precio),
    ventaAnt: Math.round(c.soAnt * PARAMS.ventana * c.precio),
    costo: Math.round(c.so * PARAMS.ventana * c.costo),
  };
}

/** Aplana el corte a los renglones que espera la hoja Datos. */
export function filasExcel(combos: Combo[]): Celda[][] {
  return combos.map((c) => {
    const cad = cadenaPorId(c.sucursal.cadenaId);
    const x = enHoja(c);
    const h = c.hist;
    return [
      cad.nombre,
      cad.formato,
      estadoPorId(c.sucursal.estadoId).nombre,
      c.sucursal.ciudad,
      c.sucursal.nombre,
      marcaPorId(c.coleccion.marcaId).nombre,
      c.coleccion.segmento,
      c.coleccion.nombre,
      c.modelo.sku,
      c.modelo.nombre,
      c.modelo.genero,
      c.modelo.material,
      c.precio,
      c.costo,
      c.inv,
      c.tr,
      x.so,
      x.so8,
      x.ant8,
      x.venta,
      x.ventaAnt,
      x.costo,
      // La cobertura de una tienda que no reporta no existe: sin denominador
      // no hay cálculo, y un 99 inventado contamina cualquier promedio.
      c.sucursal.reporta ? (c.cob > 90 ? null : r1(c.cob)) : null,
      c.exc,
      Math.round(c.capital),
      Math.round(c.perdida),
      c.sug,
      Math.round(c.impacto),
      c.edad,
      r1(h[h.length - 1] ?? 0),
      r1(h.slice(-4).reduce((a, b) => a + b, 0)),
      // Reporta va explícito, con 1 y 0: las fórmulas lo usan para no calcular
      // excedente donde no hay sell-out.
      c.sucursal.reporta ? 1 : 0,
    ];
  });
}

/* ------------------------------------------------------------------ *
 * El puente con el servidor
 * ------------------------------------------------------------------ */

/** Lo que una pantalla le manda al servidor para armar su libro. */
export type Paquete = {
  plantilla: string;
  /** Lo que va después del nombre del archivo: el corte, el escenario. */
  sufijo: string;
  /** Renglones por hoja. Donde la plantilla trae fórmula, el valor entra como su resultado guardado. */
  hojas: Record<string, Celda[][]>;
  /** Indicadores sueltos, por el nombre que les da el manifiesto. */
  valores?: Record<string, Celda>;
  /** Títulos de columna, para las hojas cuya forma no es fija. */
  encabezados?: Record<string, string[]>;
};

/**
 * Pide el libro al servidor y lo baja. Vive aquí y no en cada pantalla porque
 * la lógica es la misma para todas.
 */
export async function descargar(p: Paquete): Promise<void> {
  const r = await fetch("/api/excel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(p),
  });
  if (!r.ok) throw new Error(await r.text());
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = r.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "MarkaLab_BI.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}
