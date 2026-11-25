"use client";

/**
 * Centro de ayuda.
 *
 * Dos capas, igual que el copiloto. Primero las guías escritas, que son
 * deterministas y siempre están. Si ninguna coincide con lo que la persona
 * escribió, Argos contesta con el contexto del corte.
 *
 * La diferencia con un manual en PDF es que esto vive al lado de los datos:
 * cada guía lleva a la pantalla donde se hace lo que explica.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Tile } from "@/components/ui";
import { CaraAgente, AGENTE } from "@/components/agente";
import { useArgos, pieDe, type Fuente } from "@/lib/argos";
import type { TipoRespuesta } from "@/lib/consulta";
import { fmt } from "@/lib/engine";
import { GUIAS, NOVEDADES, buscarGuias } from "@/lib/ayuda";

export default function Ayuda() {
  const { preguntar: consultar } = useArgos();
  const [q, setQ] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [respuesta, setRespuesta] = useState("");
  const [fuente, setFuente] = useState<Fuente | null>(null);
  const [tipo, setTipo] = useState<TipoRespuesta | undefined>();
  const [ms, setMs] = useState(0);
  const [cargando, setCargando] = useState(false);

  const resultados = useMemo(() => buscarGuias(q), [q]);
  async function preguntar() {
    if (!q.trim() || cargando) return;
    setCargando(true);
    setRespuesta("");
    const r = await consultar(q, { pantalla: { clave: "ayuda", titulo: "Centro de ayuda" } });
    setFuente(r.fuente);
    setTipo(r.tipo);
    setMs(r.ms);
    setRespuesta(r.texto);
    setCargando(false);
  }

  return (
    <div className="view">
      <div className="tiles">
        <Tile k="Guías publicadas" v={fmt(GUIAS.length)} n="Escritas para quien abre la plataforma por primera vez" />
        <Tile k="Novedades" v={fmt(NOVEDADES.length)} n="Cambios y correcciones con fecha" />
        <Tile
          k="Respuestas de Argos"
          v="Siempre"
          tono="accent"
          n="Si ninguna guía coincide, contesta con el corte vigente"
        />
      </div>

      <div className="ayuda">
        <div>
          <div className="card">
            <h3>Centro de ayuda</h3>
            <p className="sub">
              Una ruta paso a paso para que armes tus propios reportes y encuentres
              tus respuestas.
            </p>

            <form
              className="buscar"
              onSubmit={(e) => {
                e.preventDefault();
                preguntar();
              }}
            >
              <input
                type="search"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setRespuesta("");
                }}
                placeholder="¿Cómo armo un reporte comparativo?"
                aria-label="Buscar en las guías"
              />
              <button className="btn sm" type="submit" disabled={!q.trim() || cargando}>
                {cargando ? "Pensando" : `Preguntar a ${AGENTE.nombre}`}
              </button>
            </form>

            {q.trim() && !resultados.length && !respuesta ? (
              <p className="note">
                Ninguna guía contiene esas palabras. Pulsa <b>Preguntar a {AGENTE.nombre}</b> y
                la buscará por su significado, con las cifras del corte vigente.
              </p>
            ) : null}

            {respuesta ? (
              <div className="respuesta">
                <div className="respuesta-top">
                  <CaraAgente tamano={22} />
                  <strong>Respuesta de {AGENTE.nombre}</strong>
                  <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                    {pieDe({ fuente: fuente ?? undefined, ms, tipo })}
                  </span>
                </div>
                <p style={{ whiteSpace: "pre-line" }}>{respuesta}</p>
              </div>
            ) : null}

            <div className="guias">
              {resultados.map((g) => (
                <div className="guia" key={g.id}>
                  <button
                    className="guia-tit"
                    onClick={() => setAbierta(abierta === g.id ? null : g.id)}
                    aria-expanded={abierta === g.id}
                  >
                    <span>
                      <strong>{g.titulo}</strong>
                      <span>{g.resumen}</span>
                    </span>
                    <span className="guia-mas">{abierta === g.id ? "−" : "+"}</span>
                  </button>
                  {abierta === g.id ? (
                    <div className="guia-cuerpo">
                      <ol>
                        {g.pasos.map((p, i) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ol>
                      {g.ruta ? (
                        <Link className="btn ghost sm" href={g.ruta}>
                          Ir a la pantalla
                        </Link>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <h3>Últimas novedades</h3>
          <p className="sub">Lo que cambió, con fecha. Lo más nuevo arriba.</p>
          <div className="novedades">
            {NOVEDADES.map((n, i) => (
              <div className="novedad" key={i}>
                <div className="novedad-top">
                  <span className={`chip ${n.tipo === "Novedad" ? "sano" : "neutro"}`}>
                    <b aria-hidden>●</b>
                    {n.tipo}
                  </span>
                  <span>{n.fecha}</span>
                </div>
                <strong>{n.titulo}</strong>
                <p>{n.cuerpo}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
