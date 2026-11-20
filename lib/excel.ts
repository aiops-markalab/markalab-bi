/**
 * El contrato del Excel de simulación.
 *
 * Las columnas de aquí tienen que coincidir, en orden y en nombre, con las de
 * la plantilla `public/plantillas/simulador.xlsx`. Si se agrega una columna,
 * se agrega en los dos lados o las fórmulas de la plantilla apuntan a la
 * columna equivocada y nadie se entera hasta que alguien suma mal en una
 * junta.
 */

import { PARAMS, type Combo } from "./engine";
import { marcaPorId, cadenaPorId, estadoPorId } from "./catalog";

/** Una celda: texto o número. `null` deja la celda vacía. */
export type Celda = string | number | null;

export const COLUMNAS_EXCEL = [
  "Cadena",
  "Formato",
  "Estado",
  "Ciudad",
  "Punto de venta",
  "Marca",
  "Segmento",
  "Colección",
  "SKU",
  "Modelo",
  "Género",
  "Material",
  "Precio",
  "Costo",
  "Piezas",
  "Tránsito",
  "Sell-out semanal",
  "Sell-out 8 sem",
  "Sell-out 8 sem ant",
  "Venta $",
  "Venta $ año ant",
  "Costo $",
  "Cobertura sem",
  "Excedente",
  "Capital inmovilizado",
  "Venta perdida sem",
  "Sugerido",
  "Impacto $",
] as const;

const r1 = (n: number) => Math.round(n * 10) / 10;
/* El sell-out semanal va con dos decimales aunque la columna muestre uno: el
   simulador recalcula el excedente como existencia menos desplazamiento por
   umbral, y a 0.3 contra 0.34 esa resta se va varios puntos. */
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Aplana el corte a los renglones que espera la hoja Datos. */
export function filasExcel(combos: Combo[]): Celda[][] {
  return combos.map((c) => {
    const cad = cadenaPorId(c.sucursal.cadenaId);
    const v = c.so * PARAMS.ventana;
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
      r2(c.so),
      Math.round(v),
      Math.round(c.soAnt * PARAMS.ventana),
      Math.round(v * c.precio),
      Math.round(c.soAnt * PARAMS.ventana * c.precio),
      Math.round(v * c.costo),
      // La cobertura de una tienda que no reporta no existe: sin denominador
      // no hay cálculo, y un 99 inventado contamina los promedios de Excel.
      c.sucursal.reporta ? (c.cob > 90 ? null : r1(c.cob)) : null,
      c.exc,
      Math.round(c.capital),
      Math.round(c.perdida),
      c.sug,
      Math.round(c.impacto),
    ];
  });
}

/* ------------------------------------------------------------------ *
 * El puente con el servidor
 * ------------------------------------------------------------------ */

/**
 * Pide el libro al servidor y lo baja. Vive aquí y no en cada pantalla
 * porque son tres botones en tres lugares distintos y la lógica es la misma.
 */
export async function descargarLibro(
  plantilla: "corte" | "resumen" | "escenario" | "reporte",
  hojas: Record<string, Celda[][]>,
  sufijo: string,
  /** Solo para las plantillas cuyas columnas no son fijas, como la de Reportes. */
  encabezados?: Record<string, string[]>
): Promise<void> {
  const r = await fetch("/api/excel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ plantilla, hojas, sufijo, encabezados }),
  });
  if (!r.ok) throw new Error(await r.text());
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    r.headers
      .get("content-disposition")
      ?.match(/filename="([^"]+)"/)?.[1] ?? "MarkaLab_BI.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}
