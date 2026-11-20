import { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Los Excel de la plataforma.
 *
 * Un navegador no puede escribir gráficas nativas de Excel: ninguna librería
 * de JavaScript del lado del cliente sabe hacerlo. Lo que sí se puede es
 * tomar un archivo que YA trae sus gráficas, sus fórmulas y su formato, y
 * reemplazarle las hojas de datos.
 *
 * Eso hace este endpoint. Abre la plantilla como lo que es --un zip--, cambia
 * únicamente las hojas que se le piden, y vuelve a cerrarlo. Las gráficas, las
 * fórmulas y los formatos sobreviven porque nunca se tocan.
 *
 * Las hojas se buscan por NOMBRE, no por número de archivo: una plantilla con
 * cinco hojas no tiene por qué tener la de datos en el primer lugar, y
 * amarrarse al orden es la clase de detalle que se rompe el día que alguien
 * reordene las pestañas.
 */

const PLANTILLAS: Record<string, { archivo: string; nombre: string }> = {
  corte: { archivo: "simulador.xlsx", nombre: "MarkaLab_BI_Simulador" },
  resumen: { archivo: "resumen.xlsx", nombre: "MarkaLab_BI_Resumen" },
  escenario: { archivo: "escenario.xlsx", nombre: "MarkaLab_BI_Escenario" },
  reporte: { archivo: "reporte.xlsx", nombre: "MarkaLab_BI_Reporte" },
};

const TOPE = 5000;

type Celda = string | number | null;
type Peticion = {
  plantilla?: string;
  /** Hoja por nombre, con sus renglones de datos. El encabezado no se manda. */
  hojas?: Record<string, Celda[][]>;
  /**
   * Encabezados por hoja, para las plantillas cuyas columnas no son fijas.
   * La tabla de Reportes cambia de forma según cómo la configure el usuario,
   * así que sus títulos tampoco se pueden dejar escritos en la plantilla.
   * Lo que sí se conserva es el ESTILO del renglón 1, que se lee del propio
   * archivo y se vuelve a aplicar celda por celda.
   */
  encabezados?: Record<string, string[]>;
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

function renglones(filas: Celda[][], estilos: Map<number, string>): string {
  const partes: string[] = [];
  for (let i = 0; i < filas.length; i++) {
    const r = i + 2; // el 1 son los encabezados
    const celdas: string[] = [];
    const fila = filas[i] ?? [];
    for (let j = 0; j < fila.length; j++) {
      const v = fila[j];
      if (v === null || v === undefined || v === "") continue;
      const s = estilos.get(j + 1);
      const attr = `r="${letra(j + 1)}${r}"${s ? ` s="${s}"` : ""}`;
      if (typeof v === "number" && isFinite(v)) {
        celdas.push(`<c ${attr}><v>${v}</v></c>`);
      } else {
        celdas.push(`<c ${attr} t="inlineStr"><is><t>${esc(String(v))}</t></is></c>`);
      }
    }
    partes.push(`<row r="${r}">${celdas.join("")}</row>`);
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
      m.set(
        nombre.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"),
        `xl/${destino}`
      );
    }
  }
  return m;
}

export async function POST(req: NextRequest) {
  let p: Peticion;
  try {
    p = (await req.json()) as Peticion;
  } catch {
    return new Response("Petición inválida", { status: 400 });
  }

  const def = PLANTILLAS[p.plantilla ?? "corte"];
  if (!def) return new Response("Plantilla desconocida", { status: 400 });
  const hojas = p.hojas ?? {};
  if (!Object.keys(hojas).length)
    return new Response("Sin hojas que rellenar", { status: 400 });

  let bytes: Buffer;
  try {
    bytes = await readFile(
      path.join(process.cwd(), "public", "plantillas", def.archivo)
    );
  } catch {
    return new Response("No se encontró la plantilla", { status: 500 });
  }

  const zip = await JSZip.loadAsync(bytes);
  const mapa = await mapaDeHojas(zip);

  for (const [nombre, filasCrudas] of Object.entries(hojas)) {
    const ruta = mapa.get(nombre);
    if (!ruta) continue; // una hoja que la plantilla no tiene no es motivo de error
    const archivo = zip.file(ruta);
    if (!archivo) continue;

    const filas = (Array.isArray(filasCrudas) ? filasCrudas : []).slice(0, TOPE - 1);
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
      // El estilo se toma de la primera celda del renglón 1 de la plantilla:
      // así el encabezado nuevo se ve igual que el que trae el archivo.
      const sEnc = encabezado.match(/<c\b[^>]*\bs="(\d+)"/)?.[1];
      const celdas = titulos.map(
        (t, i) =>
          `<c r="${letra(i + 1)}1"${sEnc ? ` s="${sEnc}"` : ""} t="inlineStr"><is><t>${esc(
            String(t)
          )}</t></is></c>`
      );
      const attrs = encabezado.match(/<row([^>]*)>/)?.[1] ?? ' r="1"';
      encabezado = `<row${attrs}>${celdas.join("")}</row>`;
    }

    let nuevo = antes + encabezado + renglones(filas, estilos) + despues;
    const anchoMax = filas.reduce((a, f) => Math.max(a, f?.length ?? 0), 1);
    nuevo = nuevo.replace(
      /<dimension ref="[^"]*"\s*\/>/,
      `<dimension ref="A1:${letra(anchoMax)}${filas.length + 1}"/>`
    );
    zip.file(ruta, nuevo);
  }

  /* La gráfica del reporte apunta a un rango fijo de veinte renglones, porque
     una gráfica no puede referirse a un rango de tamaño desconocido. Cuando
     el reporte trae menos --cuatro cadenas, por ejemplo-- esos renglones de
     más quedan como categorías vacías y las barras se amontonan abajo del
     dibujo. Se recorta el rango al número de renglones que de verdad hubo.

     Solo se hace en esta plantilla: las otras tres traen gráficas sobre
     tablas de tamaño conocido y ahí tocar el rango sería romperlas. */
  const grafica = hojas["Gráfica"];
  if (p.plantilla === "reporte" && Array.isArray(grafica)) {
    const hasta = Math.max(2, Math.min(grafica.length, 20) + 1);
    for (const ruta of Object.keys(zip.files)) {
      if (!/^xl\/charts\/chart\d+\.xml$/.test(ruta)) continue;
      const xml = await zip.file(ruta)!.async("string");
      zip.file(
        ruta,
        xml.replace(
          /(<f>'Gráfica'!\$[A-Z]+\$\d+:\$[A-Z]+\$)(\d+)(<\/f>)/g,
          (_m, a, _n, c) => `${a}${hasta}${c}`
        )
      );
    }
  }

  const salida = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const nombre = `${def.nombre}${p.sufijo ? "_" + p.sufijo.replace(/[^\w.-]+/g, "_") : ""}.xlsx`;
  return new Response(new Uint8Array(salida), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${nombre}"`,
      "cache-control": "no-store",
    },
  });
}
