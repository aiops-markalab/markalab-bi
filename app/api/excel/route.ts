import { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import MANIFIESTO from "@/lib/plantillas.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Los Excel de la plataforma.
 *
 * Un navegador no puede escribir gráficas nativas de Excel. Lo que sí se
 * puede es tomar un archivo que YA trae sus gráficas, sus fórmulas y su
 * formato, y rellenarlo. Eso hace esta ruta: abre la plantilla como lo que
 * es --un zip--, cambia lo que la plataforma manda y lo vuelve a cerrar.
 *
 * Lo que la plataforma puede mandar:
 *
 *   hojas        renglones para una hoja, por nombre. Si la plantilla trae
 *                una FÓRMULA en una celda de ese renglón, la fórmula se queda
 *                y el valor que manda la plataforma entra como su resultado
 *                guardado. Así el archivo se ve completo aun en la Vista
 *                protegida de Excel, donde nada se recalcula, y en cuanto se
 *                habilita la edición mandan las fórmulas.
 *
 *   valores      indicadores sueltos, por nombre. El manifiesto de la
 *                plantilla dice en qué celda vive cada uno.
 *
 *   encabezados  títulos de columna, para las hojas cuya forma no es fija.
 *
 * El manifiesto (lib/plantillas.json) lo genera el mismo script que construye
 * las plantillas: las direcciones de celda nunca se escriben a mano aquí.
 */

type Celda = string | number | null;
type OpcionHoja = { sobrantes?: string; recorte?: number };
type Entrada = { archivo: string; celdas: Record<string, string[]>; hojas: Record<string, OpcionHoja> };

const LIBROS = MANIFIESTO as unknown as Record<string, Entrada>;

/** El nombre con el que se baja cada libro. */
const NOMBRES: Record<string, string> = {
  resumen: "MarkaLab_BI_Resumen",
  mapa: "MarkaLab_BI_Mapa",
  ejecucion: "MarkaLab_BI_Que_atender",
  detalle: "MarkaLab_BI_Detalle",
  reporte: "MarkaLab_BI_Reporte",
  corte: "MarkaLab_BI_Simulador",
  escenario: "MarkaLab_BI_Escenario",
  hallazgos: "MarkaLab_BI_Hallazgos",
  salud: "MarkaLab_BI_Salud_del_dato",
};

const TOPE = 5000;

type Peticion = {
  plantilla?: string;
  hojas?: Record<string, Celda[][]>;
  encabezados?: Record<string, string[]>;
  valores?: Record<string, Celda>;
  sufijo?: string;
};

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

function letra(n: number): string {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function numero(ref: string): number {
  let n = 0;
  for (const ch of ref) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/** El estilo de cada columna, leído del `<cols>` de la propia hoja. */
function estilosDeColumna(xml: string): Map<number, string> {
  const m = new Map<number, string>();
  const cols = xml.match(/<cols>([\s\S]*?)<\/cols>/);
  if (!cols) return m;
  for (const col of cols[1].matchAll(/<col\b[^>]*\/>/g)) {
    const t = col[0];
    const min = Number(t.match(/\bmin="(\d+)"/)?.[1] ?? 0);
    const max = Number(t.match(/\bmax="(\d+)"/)?.[1] ?? 0);
    const estilo = t.match(/\bstyle="(\d+)"/)?.[1];
    if (!estilo || !min) continue;
    for (let i = min; i <= max; i++) m.set(i, estilo);
  }
  return m;
}

type DePlantilla = { col: number; xml: string };

/** Las celdas que la plantilla ya trae, renglón por renglón. */
function celdasDePlantilla(cuerpo: string): Map<number, DePlantilla[]> {
  const m = new Map<number, DePlantilla[]>();
  for (const row of cuerpo.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const celdas: DePlantilla[] = [];
    for (const c of row[2].matchAll(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)) {
      const ref = c[0].match(/\br="([A-Z]+)\d+"/)?.[1];
      if (ref) celdas.push({ col: numero(ref), xml: c[0] });
    }
    if (celdas.length) m.set(Number(row[1]), celdas);
  }
  return m;
}

/**
 * Una celda con fórmula y su resultado guardado.
 *
 * La fórmula es la de la plantilla; el resultado es el que calculó la
 * plataforma. Excel enseña el resultado guardado mientras no recalcule --en
 * la Vista protegida, en la vista previa del correo, en el teléfono-- y al
 * habilitar la edición lo sustituye por el suyo, que tiene que ser el mismo.
 */
function conResultado(plantilla: string, v: Celda): string {
  const f = plantilla.match(/<f\b[^>]*>[\s\S]*?<\/f>/)?.[0];
  if (!f) return plantilla;
  const r = plantilla.match(/\br="([A-Z]+\d+)"/)?.[1] ?? "";
  const s = plantilla.match(/\bs="(\d+)"/)?.[1];
  const attr = `r="${r}"${s ? ` s="${s}"` : ""}`;
  if (v === null || v === undefined || v === "") return `<c ${attr}>${f}</c>`;
  if (typeof v === "number" && isFinite(v)) return `<c ${attr}>${f}<v>${v}</v></c>`;
  return `<c ${attr} t="str">${f}<v>${esc(String(v))}</v></c>`;
}

function celdaSimple(ref: string, estilo: string | undefined, v: Celda): string {
  const attr = `r="${ref}"${estilo ? ` s="${estilo}"` : ""}`;
  if (v === null || v === undefined || v === "") return estilo ? `<c ${attr}/>` : "";
  if (typeof v === "number" && isFinite(v)) return `<c ${attr}><v>${v}</v></c>`;
  return `<c ${attr} t="inlineStr"><is><t>${esc(String(v))}</t></is></c>`;
}

function renglones(
  filas: Celda[][],
  estilos: Map<number, string>,
  plantilla: Map<number, DePlantilla[]>,
  quitarSobrantes: boolean
): string {
  const partes: string[] = [];
  for (let i = 0; i < filas.length; i++) {
    const r = i + 2; // el 1 son los encabezados
    const fila = filas[i] ?? [];
    const propias = new Map<number, string>();
    for (const c of plantilla.get(r) ?? []) propias.set(c.col, c.xml);

    const celdas: string[] = [];
    const ancho = Math.max(fila.length, ...[...propias.keys()]);
    for (let j = 1; j <= ancho; j++) {
      const v = j <= fila.length ? fila[j - 1] : null;
      const propia = propias.get(j);
      if (propia && propia.includes("<f")) {
        celdas.push(conResultado(propia, v));
      } else if (j <= fila.length) {
        const x = celdaSimple(`${letra(j)}${r}`, estilos.get(j), v);
        if (x && !(v === null || v === "")) celdas.push(x);
      } else if (propia) {
        celdas.push(propia);
      }
    }
    partes.push(`<row r="${r}">${celdas.join("")}</row>`);
  }
  if (!quitarSobrantes) {
    // Las fórmulas que quedaron debajo del último dato se conservan: van
    // guardadas con IF(A="","") y no estorban.
    const ultimo = filas.length + 1;
    for (const [r, celdas] of [...plantilla].sort((a, b) => a[0] - b[0])) {
      if (r <= ultimo) continue;
      partes.push(`<row r="${r}">${celdas.map((c) => c.xml).join("")}</row>`);
    }
  }
  return partes.join("");
}

/** Nombre de hoja -> archivo XML dentro del zip. */
async function mapaDeHojas(zip: JSZip): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  const wbXml = await zip.file("xl/workbook.xml")?.async("string");
  const relsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (!wbXml || !relsXml) return m;

  const destinos = new Map<string, string>();
  for (const rel of relsXml.matchAll(/<Relationship\b[^>]*\/>/g)) {
    const id = rel[0].match(/\bId="([^"]+)"/)?.[1];
    const target = rel[0].match(/\bTarget="([^"]+)"/)?.[1];
    if (id && target) destinos.set(id, target.replace(/^\/?xl\//, ""));
  }
  for (const hoja of wbXml.matchAll(/<sheet\b[^>]*\/>/g)) {
    const nombre = hoja[0].match(/\bname="([^"]+)"/)?.[1];
    const rid = hoja[0].match(/r:id="([^"]+)"/)?.[1];
    const destino = rid ? destinos.get(rid) : undefined;
    if (nombre && destino) {
      m.set(nombre.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"), `xl/${destino}`);
    }
  }
  return m;
}

const paraRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function POST(req: NextRequest) {
  let p: Peticion;
  try {
    p = (await req.json()) as Peticion;
  } catch {
    return new Response("Petición inválida", { status: 400 });
  }

  const clave = p.plantilla ?? "";
  const libro = LIBROS[clave];
  if (!libro) return new Response("Plantilla desconocida", { status: 400 });
  const hojas = p.hojas ?? {};

  let bytes: Buffer;
  try {
    bytes = await readFile(path.join(process.cwd(), "public", "plantillas", libro.archivo));
  } catch {
    return new Response("No se encontró la plantilla", { status: 500 });
  }

  const zip = await JSZip.loadAsync(bytes);
  const mapa = await mapaDeHojas(zip);
  const filasPorHoja = new Map<string, number>();

  /* 1 · Las hojas de renglones */
  for (const [nombre, filasCrudas] of Object.entries(hojas)) {
    const ruta = mapa.get(nombre);
    const archivo = ruta ? zip.file(ruta) : null;
    if (!ruta || !archivo) continue; // una hoja que la plantilla no tiene no es motivo de error

    const filas = (Array.isArray(filasCrudas) ? filasCrudas : []).slice(0, TOPE - 1);
    filasPorHoja.set(nombre, filas.length);
    const xml = await archivo.async("string");
    const i = xml.indexOf("<sheetData>");
    const j = xml.indexOf("</sheetData>");
    if (i < 0 || j < 0) continue;

    const antes = xml.slice(0, i + "<sheetData>".length);
    const cuerpo = xml.slice(i + "<sheetData>".length, j);
    const despues = xml.slice(j);
    let encabezado = cuerpo.match(/<row[^>]*\br="1"[^>]*>[\s\S]*?<\/row>/)?.[0] ?? "";
    const estilos = estilosDeColumna(xml);

    const titulos = p.encabezados?.[nombre];
    if (Array.isArray(titulos) && titulos.length) {
      // El estilo se toma de la primera celda del renglón 1 de la plantilla.
      const sEnc = encabezado.match(/<c\b[^>]*\bs="(\d+)"/)?.[1];
      const celdas = titulos.map(
        (t, k) => `<c r="${letra(k + 1)}1"${sEnc ? ` s="${sEnc}"` : ""} t="inlineStr"><is><t>${esc(String(t))}</t></is></c>`
      );
      const attrs = encabezado.match(/<row([^>]*)>/)?.[1] ?? ' r="1"';
      encabezado = `<row${attrs}>${celdas.join("")}</row>`;
    }

    const dePlantilla = celdasDePlantilla(cuerpo);
    dePlantilla.delete(1);
    const quitar = libro.hojas?.[nombre]?.sobrantes === "quitar";

    let nuevo = antes + encabezado + renglones(filas, estilos, dePlantilla, quitar) + despues;

    let anchoMax = filas.reduce((a, f) => Math.max(a, f?.length ?? 0), 1);
    let altoMax = filas.length + 1;
    for (const [r, celdas] of dePlantilla) {
      if (!quitar) altoMax = Math.max(altoMax, r);
      for (const c of celdas) anchoMax = Math.max(anchoMax, c.col);
    }
    nuevo = nuevo.replace(/<dimension ref="[^"]*"\s*\/>/, `<dimension ref="A1:${letra(anchoMax)}${altoMax}"/>`);
    // El filtro de la tabla tiene que abarcar los renglones que de verdad hay.
    nuevo = nuevo.replace(
      /<autoFilter ref="A1:([A-Z]+)\d+"/,
      (_m, col) => `<autoFilter ref="A1:${col}${Math.max(2, filas.length + 1)}"`
    );
    zip.file(ruta, nuevo);
  }

  /* 2 · Los indicadores sueltos, por nombre */
  const porHoja = new Map<string, [string, Celda][]>();
  for (const [nombre, v] of Object.entries(p.valores ?? {})) {
    const destino = libro.celdas?.[nombre];
    if (!destino) continue;
    if (!porHoja.has(destino[0])) porHoja.set(destino[0], []);
    porHoja.get(destino[0])!.push([destino[1], v]);
  }
  for (const [hoja, lista] of porHoja) {
    const ruta = mapa.get(hoja);
    const archivo = ruta ? zip.file(ruta) : null;
    if (!ruta || !archivo) continue;
    let xml = await archivo.async("string");
    for (const [ref, v] of lista) {
      const re = new RegExp(`<c\\b[^>]*\\br="${ref}"[^>]*?(?:/>|>[\\s\\S]*?</c>)`);
      const actual = xml.match(re)?.[0];
      if (!actual) continue;
      const estilo = actual.match(/\bs="(\d+)"/)?.[1];
      xml = xml.replace(re, actual.includes("<f") ? conResultado(actual, v) : celdaSimple(ref, estilo, v) || actual);
    }
    zip.file(ruta, xml);
  }

  /* 3 · Las gráficas se recortan a los renglones que de verdad hubo.
        Una gráfica apunta a un rango fijo; si la tabla trae menos renglones,
        los de sobra quedan como categorías vacías y las barras se amontonan. */
  const recortes: [string, number][] = [];
  for (const [hoja, opciones] of Object.entries(libro.hojas ?? {})) {
    const n = filasPorHoja.get(hoja);
    if (opciones.recorte && n !== undefined) recortes.push([hoja, Math.max(1, Math.min(n, opciones.recorte))]);
  }
  if (recortes.length) {
    for (const ruta of Object.keys(zip.files)) {
      if (!/^xl\/charts\/chart\d+\.xml$/.test(ruta)) continue;
      let xml = await zip.file(ruta)!.async("string");
      for (const [hoja, n] of recortes) {
        const h = paraRegex(hoja);
        const re = new RegExp(`(<f>(?:'${h}'|${h})!\\$[A-Z]+\\$)(\\d+)(:\\$[A-Z]+\\$)(\\d+)(</f>)`, "g");
        xml = xml.replace(re, (_m, a, ini, b, _fin, c) => `${a}${ini}${b}${Number(ini) + n - 1}${c}`);
      }
      zip.file(ruta, xml);
    }
  }

  /* 4 · El nombre oculto del filtro, en el libro, tiene que decir lo mismo
        que el filtro de la hoja. */
  const wbRuta = "xl/workbook.xml";
  let wb = await zip.file(wbRuta)!.async("string");
  for (const [hoja, n] of filasPorHoja) {
    const h = paraRegex(hoja);
    const re = new RegExp(`((?:'${h}'|${h})!\\$A\\$1:\\$[A-Z]+\\$)1(</definedName>)`, "g");
    wb = wb.replace(re, (_m, a, c) => `${a}${Math.max(2, n + 1)}${c}`);
  }
  zip.file(wbRuta, wb);

  const salida = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  const base = NOMBRES[clave] ?? `MarkaLab_BI_${clave}`;
  const nombre = `${base}${p.sufijo ? "_" + p.sufijo.replace(/[^\w.-]+/g, "_") : ""}.xlsx`;
  return new Response(new Uint8Array(salida), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${nombre}"`,
      "cache-control": "no-store",
    },
  });
}
