import { NextRequest, NextResponse } from "next/server";
import { VERSION } from "@/lib/version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * El modelo de Argos.
 *
 * La página nunca habla con el modelo: habla con esta ruta, y esta ruta habla
 * con el modelo. Así la llave vive solo en el servidor.
 *
 * Hay dos caminos y se prueban en este orden:
 *
 *   1. DIRECTO. Si existe la llave de un proveedor --DEEPSEEK_API_KEY,
 *      OPENAI_API_KEY o ANTHROPIC_API_KEY-- la ruta llama a su API sin
 *      intermediarios. Es el camino corto: una variable de entorno y Argos
 *      tiene modelo. No depende de n8n, ni de Supabase, ni de que haya un
 *      workflow activo con sus credenciales en orden. Si hay más de una
 *      llave, COPILOTO_PROVEEDOR dice cuál manda.
 *
 *   2. N8N. Si no hay llave directa pero sí N8N_WEBHOOK_URL, se usa el
 *      workflow, que además guarda memoria y bitácora.
 *
 * Si ninguno contesta, se responde `{ fuente: "local" }` y la página usa su
 * motor de consulta, que CALCULA la respuesta sobre el corte. No hay textos
 * de relleno en ningún camino.
 *
 * El motor de consulta corre siempre primero en el navegador y su resultado
 * viaja aquí como `calculo`: el modelo redacta, las cifras salen del cálculo.
 */

const TIEMPO_DIRECTO = Number(process.env.COPILOTO_TIMEOUT_MS ?? 20000);
// Por n8n se da más margen: el modelo del workflow puede venir con el
// razonamiento encendido, y entonces una respuesta tarda bastante más.
const TIEMPO_N8N = Number(process.env.N8N_TIMEOUT_MS ?? 25000);

type Proveedor = "deepseek" | "openai" | "anthropic";

const LLAVE: Record<Proveedor, string | undefined> = {
  deepseek: process.env.DEEPSEEK_API_KEY,
  openai: process.env.OPENAI_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
};

/** Qué proveedor contesta por el camino directo, o ninguno. */
function proveedor(): Proveedor | null {
  const pedido = (process.env.COPILOTO_PROVEEDOR ?? "").toLowerCase() as Proveedor;
  if (LLAVE[pedido]) return pedido;
  return (["deepseek", "openai", "anthropic"] as Proveedor[]).find((p) => LLAVE[p]) ?? null;
}

/* El modelo de omisión de cada proveedor; COPILOTO_MODELO lo cambia sin
   tocar código. Los nombres caducan: `deepseek-chat` y `claude-sonnet-4-5`
   ya fueron retirados por sus proveedores, y por eso no están aquí. */
const MODELO_OMISION: Record<Proveedor, string> = {
  deepseek: "deepseek-flash",
  openai: "gpt-6.2-sol",
  anthropic: "claude-sonnet-5-5",
};
const modeloDe = (p: Proveedor) => process.env.COPILOTO_MODELO || MODELO_OMISION[p];

// Se puede apuntar a una pasarela propia; por omisión, la API de cada quien.
const sinBarra = (s: string) => s.replace(/\/+$/, "");
const DESTINO: Record<Proveedor, string> = {
  deepseek: sinBarra(process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com") + "/chat/completions",
  openai: sinBarra(process.env.OPENAI_BASE_URL ?? "https://api.openai.com") + "/v1/chat/completions",
  anthropic: sinBarra(process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com") + "/v1/messages",
};

const SISTEMA = `Eres Argos, el copiloto de MarkaLab BI: especialista en inteligencia comercial y planeación para marcas que venden a través de canal departamental en México (Liverpool, El Palacio de Hierro, Sears, Sanborns).

QUIÉN TE LEE
Directores de la marca proveedora. No son analistas. Quieren la respuesta a lo que preguntaron, en pesos y en decisiones.

REGLAS QUE NO SE ROMPEN
1. Contesta exactamente lo que se preguntó. Si piden el sell-out de la semana, das el sell-out de la semana, no el resumen del corte. La primera frase es la respuesta; lo demás es contexto breve.
2. Nunca inventes una cifra. Usa solo los números de CALCULO y de DATOS. CALCULO es la respuesta ya calculada por el motor de la plataforma sobre el corte: si existe y contesta la pregunta, tus cifras son esas, tal cual. Si un dato no está, dilo en una línea en vez de estimarlo.
3. Tu alcance empieza y termina en este tablero: el corte, el sell-out, el inventario en canal, los quiebres, los traslados, la calidad del dato y el plan del año. Si preguntan cualquier otra cosa —política, deportes, cultura general, recetas, código— responde en una línea que eso queda fuera de tu alcance y di con qué sí puedes ayudar. No eres un asistente de propósito general.
4. Habla en pesos y en decisiones, no en adjetivos. Cuando recomiendes algo, di qué hacer y cuánto vale.
5. Sé breve: de 40 a 140 palabras salvo que pidan un documento (un correo, un guion). En español de México, en prosa, sin emoji y sin encabezados. Listas numeradas solo para rankings.
6. Un traslado solo existe entre tiendas de la misma cadena y con el mismo modelo. Entre cadenas distintas no hay traslado, hay renegociación de embarque.
7. No prometas lo que la plataforma no hace: no mandas órdenes a ningún ERP ni ejecutas nada. Recomiendas.
8. El corte es semanal. "Este mes" son las últimas 4 semanas; dilo así.
9. Si PANTALLA indica dónde está parado quien pregunta, da preferencia a lo que esa pantalla muestra.

TONO
El de un consultor senior que ya revisó los números y va al grano. Directo, específico, sin relleno ni preámbulo.`;

type Cuerpo = Record<string, unknown>;

/** Qué camino hay configurado. La página lo pregunta una vez, al abrir. */
export async function GET() {
  const p = proveedor();
  return NextResponse.json({
    version: VERSION,
    modelo: p ? "directo" : process.env.N8N_WEBHOOK_URL ? "n8n" : null,
    // Qué proveedor y qué modelo, nunca la llave: sirve para confirmar desde
    // el navegador que la variable de Vercel sí llegó al despliegue.
    proveedor: p,
    nombre: p ? modeloDe(p) : null,
  });
}

export async function POST(req: NextRequest) {
  let cuerpo: Cuerpo;
  try {
    cuerpo = (await req.json()) as Cuerpo;
  } catch {
    return NextResponse.json({ fuente: "local", motivo: "peticion-invalida", ms: 0 }, { status: 400 });
  }

  const quien = proveedor();
  if (quien) {
    const r = await directo(cuerpo, quien);
    // Si el camino directo falla y hay n8n, se intenta n8n antes de rendirse.
    if (r.fuente !== "local" || !process.env.N8N_WEBHOOK_URL) return NextResponse.json(r);
  }
  if (process.env.N8N_WEBHOOK_URL) return NextResponse.json(await porN8n(cuerpo, process.env.N8N_WEBHOOK_URL));

  return NextResponse.json({ fuente: "local", motivo: "sin-configurar", detalle: "Sin modelo conectado en este ambiente.", ms: 0 });
}

/* ------------------------------------------------------------------ *
 * Camino 1 · directo
 * ------------------------------------------------------------------ */

async function directo(c: Cuerpo, quien: Proveedor) {
  const inicio = Date.now();
  const MODELO = modeloDe(quien);
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), TIEMPO_DIRECTO);

  const pantalla = (c.pantalla as { titulo?: string } | undefined)?.titulo ?? "";
  const contexto = {
    CORTE: c.corte,
    PANTALLA: pantalla,
    ESCENARIO: c.escenario ?? null,
    CALCULO: c.calculo ?? null,
    DATOS: c.datos ?? null,
    INDICADORES: c.indicadores ?? null,
    HALLAZGOS: c.hallazgos ?? [],
    DECISIONES_DEL_EQUIPO: c.bitacora ?? [],
  };

  // La conversación previa viaja para que "¿y en Sears?" se entienda.
  const previos = Array.isArray(c.historial)
    ? (c.historial as { de: string; texto: string }[])
        .slice(-6)
        .filter((t) => t && typeof t.texto === "string" && t.texto.trim())
        .map((t) => ({ role: t.de === "usuario" ? "user" : "assistant", content: t.texto }))
    : [];
  // La API exige que la conversación empiece con el usuario.
  while (previos.length && previos[0].role !== "user") previos.shift();

  const mensaje = {
    role: "user",
    content:
      `CONTEXTO DEL TABLERO (JSON):\n${JSON.stringify(contexto)}\n\n` +
      `PREGUNTA:\n${String(c.pregunta ?? "").slice(0, 1200)}`,
  };

  try {
    const cabeceras: Record<string, string> =
      quien === "anthropic"
        ? { "content-type": "application/json", "x-api-key": LLAVE.anthropic ?? "", "anthropic-version": "2023-06-01" }
        : { "content-type": "application/json", authorization: `Bearer ${LLAVE[quien]}` };
    const llamar = (cuerpo: Record<string, unknown>) =>
      fetch(DESTINO[quien], { method: "POST", headers: cabeceras, body: JSON.stringify(cuerpo), signal: ctrl.signal, cache: "no-store" });

    const conSistema = [{ role: "system", content: SISTEMA }, ...previos, mensaje];
    const pedido: Record<string, unknown> =
      quien === "anthropic"
        ? { model: MODELO, max_tokens: 900, temperature: 0.2, system: SISTEMA, messages: [...previos, mensaje] }
        : quien === "deepseek"
          ? /* DeepSeek trae el razonamiento encendido de fábrica, y con él una
               respuesta tarda diez veces más. Argos no lo necesita: las cifras
               ya vienen calculadas y el modelo solo redacta. */
            { model: MODELO, max_tokens: 900, temperature: 0.2, reasoning_effort: "none", messages: conSistema }
          : /* En OpenAI no se manda temperatura: los modelos de razonamiento la
               rechazan. El tope va holgado porque razonar también gasta de ahí. */
            { model: MODELO, max_completion_tokens: 2500, messages: conSistema };

    let r = await llamar(pedido);
    // Si el proveedor no conoce alguno de los parámetros opcionales contesta
    // 400. Se reintenta una vez con lo mínimo antes de darlo por caído.
    if (quien !== "anthropic" && r.status === 400) r = await llamar({ model: MODELO, messages: conSistema });
    clearTimeout(reloj);

    if (!r.ok) {
      const cuerpoError = await r.text().catch(() => "");
      return {
        fuente: "local" as const,
        motivo: "modelo-error",
        detalle: `El modelo respondió ${r.status}. ${cuerpoError.slice(0, 180)}`,
        ms: Date.now() - inicio,
      };
    }
    const d = (await r.json()) as {
      content?: { type: string; text?: string }[];
      choices?: { message?: { content?: string | null } }[];
    };
    const respuesta = (
      quien === "anthropic"
        ? (d.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("")
        : d.choices?.[0]?.message?.content ?? ""
    ).trim();
    if (!respuesta) return { fuente: "local" as const, motivo: "modelo-vacio", ms: Date.now() - inicio };
    return { fuente: "modelo" as const, respuesta, modelo: MODELO, ms: Date.now() - inicio };
  } catch (e) {
    clearTimeout(reloj);
    const abortado = e instanceof Error && e.name === "AbortError";
    return {
      fuente: "local" as const,
      motivo: abortado ? "tiempo-agotado" : "sin-conexion",
      detalle: abortado ? `El modelo no respondió en ${TIEMPO_DIRECTO} ms.` : "No se pudo alcanzar la API del modelo.",
      ms: Date.now() - inicio,
    };
  }
}

/* ------------------------------------------------------------------ *
 * Camino 2 · n8n
 * ------------------------------------------------------------------ */

async function porN8n(recibido: Cuerpo, url: string) {
  const inicio = Date.now();
  // El identificador de cliente se pone aquí, no en el navegador: así un
  // mismo despliegue puede servir a varias marcas sin que la página sepa
  // de cuál se trata, y la memoria de cada una queda separada en Supabase.
  const cuerpo = { ...recibido, cliente_id: Number(process.env.BI_CLIENTE_ID ?? 0) };

  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), TIEMPO_N8N);

  try {
    const cabeceras: Record<string, string> = { "content-type": "application/json" };
    if (process.env.N8N_WEBHOOK_TOKEN) cabeceras.authorization = `Bearer ${process.env.N8N_WEBHOOK_TOKEN}`;

    const r = await fetch(url, {
      method: "POST",
      headers: cabeceras,
      body: JSON.stringify(cuerpo),
      signal: ctrl.signal,
      cache: "no-store",
    });
    clearTimeout(reloj);

    if (!r.ok) {
      return { fuente: "local" as const, motivo: "n8n-error", detalle: `n8n respondió ${r.status}`, ms: Date.now() - inicio };
    }

    const texto = await r.text();
    let datos: unknown;
    try {
      datos = JSON.parse(texto);
    } catch {
      datos = { respuesta: texto };
    }

    // n8n a veces devuelve [{ json: {...} }] según cómo termine el flujo.
    let n: Record<string, unknown> = {};
    if (Array.isArray(datos)) {
      const p = datos[0] as Record<string, unknown> | undefined;
      n = (p?.json as Record<string, unknown>) ?? p ?? {};
    } else if (datos && typeof datos === "object") {
      n = datos as Record<string, unknown>;
    }

    const respuesta = (n.respuesta as string) ?? (n.output as string) ?? (n.text as string) ?? (n.message as string) ?? "";
    if (!String(respuesta).trim()) {
      return {
        fuente: "local" as const,
        motivo: typeof n.motivo === "string" ? n.motivo : "n8n-vacio",
        detalle: "El flujo contestó sin texto utilizable.",
        ms: Date.now() - inicio,
      };
    }
    return {
      fuente: "n8n" as const,
      respuesta: String(respuesta),
      modelo: typeof n.modelo === "string" ? n.modelo : undefined,
      ms: Date.now() - inicio,
    };
  } catch (e) {
    clearTimeout(reloj);
    const abortado = e instanceof Error && e.name === "AbortError";
    return {
      fuente: "local" as const,
      motivo: abortado ? "tiempo-agotado" : "sin-conexion",
      detalle: abortado ? `n8n no respondió en ${TIEMPO_N8N} ms.` : "No se pudo alcanzar el webhook de n8n.",
      ms: Date.now() - inicio,
    };
  }
}
