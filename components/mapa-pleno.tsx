"use client";

/**
 * El mapa a pantalla completa.
 *
 * Dos mapas lado a lado sirven para comparar; para presentar uno frente a una
 * sala hace falta que ocupe la pantalla. Un clic en cualquiera de los dos lo
 * amplía, y la ampliación sale desde el lugar donde estaba el mapa: el ojo
 * no pierde de vista qué fue lo que creció.
 *
 * Ya ampliado, el mapa se comporta como siempre: clic en un estado o en una
 * bandera abre su detalle. Arriba se puede pasar del corte anterior al actual
 * sin salir, que es justo lo que se quiere enseñar en una junta.
 */

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { MapaMexico } from "@/components/mapa";
import { LIENZO } from "@/lib/geo";
import { fmt, moneyCorto, type ResumenEstado, type ResumenSucursal } from "@/lib/engine";

export type Cual = "antes" | "hoy";

/** Desde qué rectángulo de la pantalla crece el mapa. */
export type Origen = { x: number; y: number; w: number; h: number };

export type CorteMapa = {
  titulo: string;
  /** "2026-S46". */
  etiqueta: string;
  /** "9–15 nov". */
  rango: string;
  estados: ResumenEstado[];
  sucursales: ResumenSucursal[];
  alertas: number;
  excedente: number;
  capital: number;
  quiebres: number;
  perdida: number;
  perdidaPzas: number;
};

const SALIDA_MS = 240;

export function MapaPleno({
  cual,
  origen,
  cortes,
  leyenda,
  detalleAbierto,
  onCambiar,
  onCerrar,
  onEstado,
  onSucursal,
}: {
  cual: Cual;
  origen: Origen;
  cortes: Record<Cual, CorteMapa>;
  leyenda: ReactNode;
  /** Con el detalle encima, Escape y las flechas son del detalle, no del mapa. */
  detalleAbierto: boolean;
  onCambiar: (c: Cual) => void;
  onCerrar: () => void;
  onEstado: (id: string) => void;
  onSucursal: (clave: string) => void;
}) {
  const [saliendo, setSaliendo] = useState(false);
  const c = cortes[cual];

  // El mapa regresa a su lugar antes de desaparecer.
  const cerrar = useCallback(() => {
    setSaliendo(true);
    window.setTimeout(onCerrar, SALIDA_MS);
  }, [onCerrar]);

  useEffect(() => {
    const t = (e: KeyboardEvent) => {
      if (detalleAbierto) return;
      if (e.key === "Escape") cerrar();
      if (e.key === "ArrowLeft") onCambiar("antes");
      if (e.key === "ArrowRight") onCambiar("hoy");
    };
    document.addEventListener("keydown", t);
    return () => document.removeEventListener("keydown", t);
  }, [cerrar, onCambiar, detalleAbierto]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  /* De dónde sale: la caja final ocupa la ventana menos su margen, así que el
     punto de partida es el rectángulo del mapa chico expresado contra ella. */
  const margen = typeof window !== "undefined" && window.innerWidth < 720 ? 8 : 22;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1440;
  const vh = typeof window !== "undefined" ? window.innerHeight : 900;
  const estilo = {
    "--mp-margen": `${margen}px`,
    "--mp-dx": `${Math.round(origen.x - margen)}px`,
    "--mp-dy": `${Math.round(origen.y - margen)}px`,
    "--mp-sx": (origen.w / Math.max(1, vw - margen * 2)).toFixed(4),
    "--mp-sy": (origen.h / Math.max(1, vh - margen * 2)).toFixed(4),
    "--mp-ar": (LIENZO.w / LIENZO.h).toFixed(4),
  } as CSSProperties;

  return (
    <div
      className={`mapa-pleno ${saliendo ? "sale" : ""}`}
      style={estilo}
      role="dialog"
      aria-modal="true"
      aria-label={`${c.titulo} ${c.etiqueta}, a pantalla completa`}
      onClick={cerrar}
    >
      <div className="mp-caja" onClick={(e) => e.stopPropagation()}>
        <header className="mp-cab">
          <div className="mp-tit">
            <h2>
              {c.titulo} <span>{c.etiqueta}</span>
            </h2>
            <p>Semana del {c.rango}</p>
          </div>

          <div className="mp-cifras">
            <div>
              <b>{fmt(c.alertas)}</b>
              <span>alertas</span>
            </div>
            <div>
              <b>{fmt(c.excedente)} pzas</b>
              <span>sobre el umbral · {moneyCorto(c.capital)}</span>
            </div>
            <div>
              <b>{fmt(c.perdidaPzas)} pzas</b>
              <span>venta perdida por semana · {moneyCorto(c.perdida)}</span>
            </div>
          </div>

          <div className="mp-acciones">
            <div className="mp-cambio" role="tablist" aria-label="Qué corte se ve">
              {(["antes", "hoy"] as Cual[]).map((k) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={cual === k}
                  className={`btn sm ${cual === k ? "on" : "ghost"}`}
                  onClick={() => onCambiar(k)}
                  title={k === "antes" ? "Flecha izquierda" : "Flecha derecha"}
                >
                  {cortes[k].titulo}
                  <small>{cortes[k].rango}</small>
                </button>
              ))}
            </div>
            <button className="btn ghost sm mp-x" onClick={cerrar} aria-label="Cerrar la pantalla completa">
              ✕ <small>Esc</small>
            </button>
          </div>
        </header>

        <div className="mp-mapa" key={cual}>
          <MapaMexico estados={c.estados} sucursales={c.sucursales} onEstado={onEstado} onSucursal={onSucursal} />
        </div>

        <footer className="mp-pie">
          {leyenda}
          <p className="note">Clic en un estado o en una bandera para ver su detalle. Clic fuera del mapa o Esc para regresar.</p>
        </footer>
      </div>
    </div>
  );
}
