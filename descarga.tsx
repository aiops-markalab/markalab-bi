"use client";

/**
 * La descarga de cada pantalla.
 *
 * Va al final de la página, siempre en el mismo lugar y con la misma forma:
 * quien ya la usó en una pantalla sabe dónde está en las demás. Baja el libro
 * de Excel de ESA pantalla, con lo que esté filtrado en ese momento: su
 * tablero de indicadores, sus gráficas y sus fórmulas.
 */

import { useState, type ReactNode } from "react";
import { descargar, type Paquete } from "@/lib/excel";
import { useBI } from "@/lib/store";
import type { Base } from "@/lib/libros";

/** Lo que todo libro necesita del tablero: el alcance, el corte y los filtros. */
export function useBase(): Base {
  const { vista, data, ind, filtro } = useBI();
  return { vista, data, ind, filtro };
}

export function Descarga({
  titulo,
  contenido,
  armar,
  etiqueta = "Descargar en Excel",
  extra,
}: {
  /** Qué libro es: "El mapa en Excel". */
  titulo: string;
  /** Qué trae adentro, en una línea. */
  contenido: string;
  /** Arma el paquete en el momento del clic, con los filtros que haya. */
  armar: () => Paquete;
  etiqueta?: string;
  /** Otros botones de la misma barra. */
  extra?: ReactNode;
}) {
  const [estado, setEstado] = useState<"" | "armando" | "listo" | "error">("");

  async function bajar() {
    if (estado === "armando") return;
    setEstado("armando");
    try {
      await descargar(armar());
      setEstado("listo");
      setTimeout(() => setEstado(""), 2600);
    } catch {
      setEstado("error");
    }
  }

  return (
    <section className="descarga" aria-label="Descargar esta pantalla en Excel">
      <div className="descarga-ico" aria-hidden>
        <svg viewBox="0 0 24 24" width="22" height="22" style={{ width: 22, height: 22, flex: "none" }}>
          <path d="M6 3h8l4 4v14H6z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M14 3v4h4M9 12l5 6M14 12l-5 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </div>
      <div className="descarga-txt">
        <strong>{titulo}</strong>
        <span>{contenido}</span>
        {estado === "error" ? (
          <span className="descarga-error">No se pudo generar el archivo. Vuelve a intentarlo.</span>
        ) : null}
      </div>
      <div className="descarga-acc">
        {extra}
        <button className="btn" onClick={bajar} disabled={estado === "armando"}>
          {estado === "armando" ? "Armando el libro" : estado === "listo" ? "Descargado" : etiqueta}
        </button>
      </div>
    </section>
  );
}
