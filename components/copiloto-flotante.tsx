"use client";

/**
 * El copiloto, disponible desde cualquier pantalla.
 *
 * La pestaña Copiloto sigue existiendo y es donde se revisan los hallazgos con
 * calma. Esto es otra cosa: el botón que se queda a la mano mientras alguien
 * está mirando el mapa y le surge una duda sobre el mapa.
 *
 * Lo que lo hace distinto de un chat pegado en una esquina es que sabe dónde
 * está parado el usuario. Al abrirse no dice «hola, ¿en qué puedo ayudarte?»:
 * dice qué ve en esa pantalla, con las cifras de los filtros que están puestos,
 * y ofrece las tres preguntas que tienen sentido ahí y no en otro lado.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useBI } from "@/lib/store";
import { useArgos, pieDe, type Turno } from "@/lib/argos";
import { contextoPantalla } from "@/lib/pantallas";
import { fmt } from "@/lib/engine";
import { AGENTE, CaraAgente } from "./agente";

export function CopilotoFlotante() {
  const ruta = usePathname();
  const { vista, ind, filtro, escenarios, escenarioId } = useBI();
  const { preguntar: consultar, hallazgos } = useArgos();

  const [abierto, setAbierto] = useState(false);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(false);
  const [sesion, setSesion] = useState("");
  const fondo = useRef<HTMLDivElement>(null);

  const escenario = escenarios.find((e) => e.id === escenarioId)?.nombre;
  const pantalla = useMemo(
    () => contextoPantalla(ruta, { vista, ind, hallazgos, filtro, escenario }),
    [ruta, vista, ind, hallazgos, filtro, escenario]
  );

  useEffect(() => {
    setSesion(`f-${Date.now().toString(36)}`);
  }, []);

  /* Al cambiar de pantalla con el panel abierto, el copiloto vuelve a
     presentarse con lo que se ve ahora. Si se dejara la conversación anterior,
     estaría contestando sobre algo que ya no está en la pantalla. */
  useEffect(() => {
    setTurnos([{ de: "agente", texto: pantalla.saludo }]);
    // Solo la pantalla, no cada recálculo de cifras: si no, el panel se
    // reiniciaría cada vez que alguien mueve un filtro mientras escribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pantalla.clave]);

  useEffect(() => {
    if (abierto) fondo.current?.scrollTo({ top: fondo.current.scrollHeight, behavior: "smooth" });
  }, [turnos, abierto]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  async function preguntar(q: string) {
    const pregunta = q.trim();
    if (!pregunta || cargando) return;
    setTexto("");
    const previos = turnos;
    setTurnos((t) => [...t, { de: "usuario", texto: pregunta }]);
    setCargando(true);
    const r = await consultar(pregunta, {
      // Esto es lo que vuelve consciente al copiloto de dónde está parado.
      pantalla: { clave: pantalla.clave, titulo: pantalla.titulo },
      // Y esto, lo que le deja entender un "¿y en Sears?".
      historial: previos.slice(1),
      sesion,
    });
    setTurnos((t) => [...t, { de: "agente", texto: r.texto, fuente: r.fuente, ms: r.ms, tipo: r.tipo }]);
    setCargando(false);
  }

  /* La chinche cuenta hallazgos críticos, no combinaciones con alerta. Son
     951 combinaciones contra 3 cosas que de verdad hay que decidir esta
     semana, y un 951 en rojo permanente deja de significar algo al tercer
     minuto. */
  const criticos = hallazgos.filter((h) => h.severidad === "critica").length;

  return (
    <>
      {!abierto ? (
        <button
          className="flota"
          onClick={() => setAbierto(true)}
          aria-label={`Abrir ${AGENTE.nombre}, el copiloto`}
          title={`${AGENTE.nombre} · ${AGENTE.oficio}`}
        >
          <CaraAgente tamano={30} />
          <span className="flota-txt">
            <strong>{AGENTE.nombre}</strong>
            <span>Pregúntame de esta pantalla</span>
          </span>
          {criticos > 0 ? <span className="flota-pip">{fmt(criticos)}</span> : null}
        </button>
      ) : null}

      <aside className={`argos-panel ${abierto ? "on" : ""}`} aria-hidden={!abierto}>
        <header className="panel-top">
          <CaraAgente tamano={32} />
          <div className="panel-id">
            <strong>{AGENTE.nombre}</strong>
            <span>{pantalla.titulo}</span>
          </div>
          <button className="btn ghost sm" onClick={() => setAbierto(false)} aria-label="Cerrar">
            Cerrar
          </button>
        </header>

        <div className="panel-hilo" ref={fondo}>
          {turnos.map((t, i) => (
            <div key={i} className={`burbuja ${t.de}`}>
              {t.de === "agente" ? (
                <span className="burbuja-cara">
                  <CaraAgente tamano={22} />
                </span>
              ) : null}
              <div>
                <p>{t.texto}</p>
                {t.fuente && pieDe(t) ? <span className="burbuja-pie">{pieDe(t)}</span> : null}
              </div>
            </div>
          ))}
          {cargando ? (
            <div className="burbuja agente">
              <span className="burbuja-cara">
                <CaraAgente tamano={22} />
              </span>
              <div>
                <p className="pensando">Revisando el corte</p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="panel-sug">
          {pantalla.sugeridas.map((s) => (
            <button key={s} className="btn ghost sm" onClick={() => preguntar(s)} disabled={cargando}>
              {s}
            </button>
          ))}
        </div>

        <form
          className="panel-caja"
          onSubmit={(e) => {
            e.preventDefault();
            preguntar(texto);
          }}
        >
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={`Pregúntale a ${AGENTE.nombre} sobre ${pantalla.titulo.toLowerCase()}`}
            aria-label="Tu pregunta"
          />
          <button className="btn sm" type="submit" disabled={cargando || !texto.trim()}>
            Enviar
          </button>
        </form>
      </aside>
    </>
  );
}
