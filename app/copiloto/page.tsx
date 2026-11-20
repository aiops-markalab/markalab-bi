"use client";

import { useEffect, useMemo, useState } from "react";
import { useBI } from "@/lib/store";
import { Descarga, useBase } from "@/components/descarga";
import { libroHallazgos } from "@/lib/libros";
import { Tile } from "@/components/ui";
import { ETIQUETA_SEVERIDAD, type Hallazgo, type Severidad } from "@/lib/copiloto";
import { useArgos, pieDe, type Fuente } from "@/lib/argos";
import type { TipoRespuesta } from "@/lib/consulta";
import { fmt, moneyCorto } from "@/lib/engine";

const TONO: Record<Severidad, string> = {
  critica: "crit",
  alta: "serious",
  media: "warn",
  oportunidad: "good",
};

const SUGERIDAS = [
  "¿Qué tres cosas haría esta semana si solo pudiera hacer tres?",
  "¿Cuánto cuesta no hacer nada durante un mes más?",
  "¿Qué cadena tiene más capital parado?",
  "Sell-out de este mes por cadena.",
];

export default function Copiloto() {
  const { bitacora, registrar } = useBI();
  const alcanceLibro = useBase();
  const { preguntar: consultar, hallazgos } = useArgos();
  const [pregunta, setPregunta] = useState("");
  const [cargando, setCargando] = useState(false);
  const [respuesta, setRespuesta] = useState<string>("");
  const [fuente, setFuente] = useState<Fuente | null>(null);
  const [tipo, setTipo] = useState<TipoRespuesta | undefined>();
  const [ms, setMs] = useState<number>(0);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [sesion, setSesion] = useState<string>("");
  const [aprendido, setAprendido] = useState<string>("");

  /* El identificador de sesión se genera en el navegador, después del montaje:
     generarlo durante el render daría un valor distinto en el servidor y en el
     cliente, y eso rompe la hidratación de React. */
  useEffect(() => {
    setSesion(`s-${Date.now().toString(36)}`);
  }, []);

  const recuperable = hallazgos
    .filter((h) => h.unidad === "recuperable")
    .reduce((a, h) => a + h.valor, 0);
  const liberable = hallazgos
    .filter((h) => h.unidad === "liberable")
    .reduce((a, h) => a + h.valor, 0);
  const criticas = hallazgos.filter((h) => h.severidad === "critica").length;

  async function preguntar(texto: string) {
    setCargando(true);
    setRespuesta("");
    setAprendido("");
    const r = await consultar(texto, { pantalla: { clave: "copiloto", titulo: "Copiloto" }, sesion });
    setMs(r.ms);
    setFuente(r.fuente);
    setTipo(r.tipo);
    setRespuesta(r.texto);
    setCargando(false);
  }

  /* Lo que hace autodidacta al copiloto. Cada señal que deja el equipo se
     destila en una lección de una línea que entra al contexto de la próxima
     consulta. Si el flujo de aprendizaje no está conectado se dice en pantalla:
     la memoria se queda en esta sesión y nada más. */
  async function enseñar(payload: {
    tipo: "util" | "rechazo" | "decision";
    hallazgo?: string;
    area?: string;
    comentario?: string;
  }) {
    setAprendido("Guardando la lección…");
    try {
      const r = await fetch("/api/copiloto/aprender", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, sesion }),
      });
      const d = await r.json();
      setAprendido(
        d.guardado
          ? "Aprendido. Entra al contexto de la siguiente consulta."
          : "Memoria de esta sesión: el flujo de aprendizaje no está conectado."
      );
    } catch {
      setAprendido("Memoria de esta sesión: el flujo de aprendizaje no está conectado.");
    }
  }

  return (
    <div className="view">
      <div className="tiles">
        <Tile
          k="Hallazgos del corte"
          v={fmt(hallazgos.length)}
          tono={criticas ? "flag" : undefined}
          n={`${criticas} críticos`}
        />
        <Tile k="Capital liberable" v={moneyCorto(liberable)} tono="accent" n="Dejando de embarcar y liquidando" />
        <Tile
          k="Venta recuperable"
          v={moneyCorto(recuperable)}
          tono="ok"
          n="Doce meses, cerrando quiebres y trasladando"
        />
        <Tile
          k="Decisiones registradas"
          v={fmt(bitacora.length)}
          n="Alimentan la priorización siguiente"
        />
      </div>

      <div className="card">
        <h3>Preguntar al copiloto</h3>
        <p className="sub">
          El copiloto recibe los hallazgos ya calculados con sus cifras. No inventa números: redacta,
          prioriza y contesta sobre ellos.
        </p>
        <div style={{ display: "flex", gap: 9, marginTop: 12, flexWrap: "wrap" }}>
          <input
            type="text"
            value={pregunta}
            onChange={(e) => setPregunta(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && pregunta.trim()) preguntar(pregunta);
            }}
            placeholder="Escribe una pregunta sobre el canal, el inventario o el plan"
            style={{ flex: "1 1 340px", minHeight: 38 }}
          />
          <button
            className="btn"
            disabled={cargando || !pregunta.trim()}
            onClick={() => preguntar(pregunta)}
          >
            {cargando ? "Pensando…" : "Preguntar"}
          </button>
          <button
            className="btn ghost"
            disabled={cargando}
            onClick={() => preguntar("Resúmeme el corte.")}
          >
            Resumen ejecutivo
          </button>
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 10 }}>
          {SUGERIDAS.map((s) => (
            <button
              key={s}
              className="btn ghost sm"
              disabled={cargando}
              onClick={() => {
                setPregunta(s);
                preguntar(s);
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {respuesta ? (
          <div
            style={{
              marginTop: 14,
              padding: "14px 16px",
              background: "var(--surface-2)",
              border: "1px solid var(--hair)",
              borderRadius: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                marginBottom: 8,
                flexWrap: "wrap",
              }}
            >
              <span className="chip sano">
                <b aria-hidden>●</b>
                Argos
              </span>
              <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                {pieDe({ fuente: fuente ?? undefined, ms, tipo })}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {respuesta}
            </p>
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
                marginTop: 12,
                paddingTop: 10,
                borderTop: "1px solid var(--hair)",
              }}
            >
              <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                ¿Esto le sirvió al equipo?
              </span>
              <button
                className="btn ghost sm"
                onClick={() =>
                  enseñar({
                    tipo: "util",
                    hallazgo: hallazgos[0]?.id,
                    area: hallazgos[0]?.area,
                    comentario: pregunta,
                  })
                }
              >
                Sí, priorizar esto
              </button>
              <button
                className="btn ghost sm"
                onClick={() =>
                  enseñar({
                    tipo: "rechazo",
                    hallazgo: hallazgos[0]?.id,
                    area: hallazgos[0]?.area,
                    comentario: pregunta,
                  })
                }
              >
                No aplica aquí
              </button>
              {aprendido ? (
                <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{aprendido}</span>
              ) : null}
            </div>
          </div>
        ) : null}

        <p className="note">
          Argos calcula cada respuesta sobre el corte: entiende la medida, el periodo y de quién
          se habla. Prueba con «sell-out de este mes por cadena» o «qué colección tiene más capital parado».
        </p>
      </div>

      <div className="card">
        <h3>Hallazgos priorizados</h3>
        <p className="sub">
          Cada uno declara la regla que lo disparó. Abrir un hallazgo muestra la regla y el número
          que la cumplió.
        </p>
        <div className="rows">
          {hallazgos.map((h) => (
            <HallazgoFila
              key={h.id}
              h={h}
              abierto={abierto === h.id}
              onAbrir={() => setAbierto(abierto === h.id ? null : h.id)}
              onDecidir={(accion) => {
                registrar({ alertaId: h.id, titulo: h.titulo, accion, valor: h.valor });
                setAbierto(null);
                // La decisión es la señal más fuerte que deja el equipo: un
                // hallazgo descartado no se vuelve a proponer, y uno aceptado
                // sube de prioridad en los cortes siguientes.
                if (accion !== "pospuesta") {
                  enseñar({
                    tipo: accion === "descartada" ? "rechazo" : "decision",
                    hallazgo: h.id,
                    area: h.area,
                    comentario:
                      accion === "descartada"
                        ? `descartó "${h.titulo}"`
                        : `ejecutar "${h.titulo}" (${h.accion})`,
                  });
                }
              }}
            />
          ))}
        </div>
      </div>

      {bitacora.length ? (
        <div className="card">
          <h3>Bitácora de decisiones</h3>
          <p className="sub">
            Esto es lo que vuelve útil al copiloto con el uso: un hallazgo descartado deja de
            proponerse, y la bitácora viaja como contexto en la siguiente consulta.
          </p>
          <div className="rows">
            {bitacora.map((d) => (
              <div className="row" key={d.sello}>
                <div className="who">
                  <strong>{d.titulo}</strong>
                  <span>
                    {d.accion === "aceptada"
                      ? "Aceptada"
                      : d.accion === "descartada"
                        ? "Descartada"
                        : "Pospuesta"}
                    {d.motivo ? ` · ${d.motivo}` : ""}
                  </span>
                </div>
                <div className="val num">{d.valor ? moneyCorto(d.valor) : "—"}</div>
              </div>
            ))}
          </div>
          <p className="note">
            En producción esta bitácora se guarda y es la que permite responder, al tercer mes,
            cuántas recomendaciones se atendieron y qué pasó con las que no.
          </p>
        </div>
      ) : null}
      <Descarga
        titulo="Los hallazgos en Excel"
        contenido="Cada hallazgo con su regla, su acción y su impacto en pesos, más el tablero con el valor por hallazgo y por área."
        armar={() => libroHallazgos(alcanceLibro, hallazgos)}
      />
    </div>
  );
}

function HallazgoFila({
  h,
  abierto,
  onAbrir,
  onDecidir,
}: {
  h: Hallazgo;
  abierto: boolean;
  onAbrir: () => void;
  onDecidir: (a: "aceptada" | "descartada" | "pospuesta") => void;
}) {
  return (
    <div className="row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
      <div
        style={{ display: "flex", gap: 12, alignItems: "center", cursor: "pointer", flexWrap: "wrap" }}
        onClick={onAbrir}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onAbrir();
          }
        }}
      >
        <span className={`chip ${TONO[h.severidad]}`}>
          <b aria-hidden>●</b>
          {ETIQUETA_SEVERIDAD[h.severidad]}
        </span>
        <div className="who" style={{ flex: "1 1 240px" }}>
          <strong>{h.titulo}</strong>
          <span>
            {h.area}
            {h.valor > 0
              ? ` · ${moneyCorto(h.valor)} ${
                  h.unidad === "recuperable"
                    ? "recuperables"
                    : h.unidad === "liberable"
                      ? "liberables"
                      : "en riesgo"
                }`
              : ""}
          </span>
        </div>
        <span style={{ color: "var(--ink-3)", fontSize: 12 }}>{abierto ? "Cerrar" : "Ver"}</span>
      </div>

      {abierto ? (
        <div
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--hair)",
            borderRadius: 9,
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }}>{h.cuerpo}</p>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }}>
            <strong>Qué hacer: </strong>
            {h.accion}
          </p>
          <p style={{ margin: 0, fontSize: 11.5, color: "var(--ink-3)" }}>
            <strong style={{ color: "var(--ink-2)" }}>Regla: </strong>
            <code>{h.regla}</code>
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn sm" onClick={() => onDecidir("aceptada")}>
              Aceptar
            </button>
            <button className="btn ghost sm" onClick={() => onDecidir("pospuesta")}>
              Posponer
            </button>
            <button className="btn ghost sm" onClick={() => onDecidir("descartada")}>
              Descartar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
