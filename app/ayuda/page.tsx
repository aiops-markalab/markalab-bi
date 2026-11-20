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
import { useBI } from "@/lib/store";
import { Tile } from "@/components/ui";
import { CaraAgente, AGENTE } from "@/components/agente";
import { analizar, construirContexto, resumenDeterminista } from "@/lib/copiloto";
import { CORTE, fmt } from "@/lib/engine";
import { GUIAS, NOVEDADES, buscarGuias } from "@/lib/ayuda";

export default function Ayuda() {
  const { vista, ind, filtro, bitacora } = useBI();
  const [q, setQ] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [respuesta, setRespuesta] = useState("");
  const [fuente, setFuente] = useState<"n8n" | "local" | null>(null);
  const [cargando, setCargando] = useState(false);

  const resultados = useMemo(() => buscarGuias(q), [q]);
  const hallazgos = useMemo(
    () => analizar(vista, ind, filtro.umbral, bitacora),
    [vista, ind, filtro.umbral, bitacora]
  );

  async function preguntar() {
    if (!q.trim() || cargando) return;
    setCargando(true);
    setRespuesta("");
    const ctx = construirContexto(hallazgos, ind, filtro.umbral, CORTE.etiqueta, bitacora, q);
    try {
      const r = await fetch("/api/copiloto", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...ctx,
          pantalla: { clave: "ayuda", titulo: "Centro de ayuda" },
        }),
      });
      const d = await r.json();
      if (d.fuente === "n8n" && d.respuesta) {
        setFuente("n8n");
        setRespuesta(d.respuesta);
      } else {
        setFuente("local");
        setRespuesta(resumenDeterminista(hallazgos, ind, q));
      }
    } catch {
      setFuente("local");
      setRespuesta(resumenDeterminista(hallazgos, ind, q));
    } finally {
      setCargando(false);
    }
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
                  <span className={`chip ${fuente === "n8n" ? "sano" : "neutro"}`}>
                    <b aria-hidden>●</b>
                    {fuente === "n8n" ? "Modelo vía n8n" : "Motor de reglas"}
                  </span>
                </div>
                <p>{respuesta}</p>
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
