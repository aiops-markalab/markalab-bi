"use client";

/**
 * Argos, de un solo lado.
 *
 * Había tres lugares que le hablaban al copiloto --el botón flotante, la
 * pantalla Copiloto y el centro de ayuda-- y cada uno traía su propia copia de
 * la lógica. Tres copias son tres comportamientos, y eso es justo lo que no
 * puede pasar con algo que se presenta como una sola voz.
 *
 * El orden de trabajo es siempre el mismo:
 *
 *   1. El motor de consulta calcula la respuesta sobre el corte. Es
 *      instantáneo y no depende de nada externo.
 *   2. Si hay un modelo conectado y está sano, la pregunta viaja con ese
 *      cálculo como evidencia y el modelo redacta.
 *   3. Si el modelo falla, se entrega el cálculo y se deja de intentar por
 *      unos minutos. Nadie espera cuatro segundos por pregunta a un servicio
 *      que ya se sabe que no está contestando.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBI } from "./store";
import { CORTE } from "./engine";
import { analizar, construirContexto } from "./copiloto";
import { alcance } from "./pantallas";
import { proyectar } from "./plan";
import { responder, resumenDatos, type Entorno, type Hilo, type PlanActivo, type TipoRespuesta } from "./consulta";

export type Fuente = "modelo" | "calculo";
export type Turno = { de: "agente" | "usuario"; texto: string; fuente?: Fuente; ms?: number; tipo?: TipoRespuesta };
export type Contestacion = { texto: string; fuente: Fuente; ms: number; tipo?: TipoRespuesta };

/* Lo que se sabe del modelo se guarda fuera de React: es un hecho del
   ambiente, no de un componente, y los tres puntos de entrada lo comparten. */
let camino: "directo" | "n8n" | null | undefined;
let caidoHasta = 0;
const PAUSA = 3 * 60 * 1000;

export function useArgos() {
  const { data, vista, ind, filtro, bitacora, escenarios, escenarioId, periodo } = useBI();
  const [modelo, setModelo] = useState<"directo" | "n8n" | null>(camino ?? null);
  const hilo = useRef<Hilo | undefined>(undefined);

  useEffect(() => {
    if (camino !== undefined) return;
    fetch("/api/copiloto")
      .then((r) => r.json())
      .then((d) => {
        camino = d.modelo ?? null;
        setModelo(camino ?? null);
      })
      .catch(() => {
        camino = null;
      });
  }, []);

  const hallazgos = useMemo(
    () => analizar(vista, ind, filtro.umbral, bitacora),
    [vista, ind, filtro.umbral, bitacora]
  );

  const plan: PlanActivo | undefined = useMemo(() => {
    const todas = escenarios.map((e) => ({ e, p: proyectar(e, vista, ind.perdida, ind.capital) }));
    const a = todas.find((t) => t.e.id === escenarioId) ?? todas[0];
    if (!a) return undefined;
    return {
      nombre: a.e.nombre,
      unidades: a.p.unidades,
      ingreso: a.p.ingreso,
      margenBruto: a.p.margenBruto,
      margenPct: a.p.margenPct,
      ebitda: a.p.ebitda,
      ebitdaPct: a.p.ebitdaPct,
      otros: todas
        .filter((t) => t !== a)
        .map((t) => ({ nombre: t.e.nombre, ebitda: t.p.ebitda, ebitdaPct: t.p.ebitdaPct, ingreso: t.p.ingreso, unidades: t.p.unidades })),
    };
  }, [escenarios, escenarioId, vista, ind.perdida, ind.capital]);

  const entorno: Entorno = useMemo(
    () => ({
      vista,
      todos: data.combos,
      data,
      hallazgos,
      umbral: filtro.umbral,
      alcance: alcance(filtro),
      plan,
      periodo,
    }),
    [vista, data, hallazgos, filtro, plan, periodo]
  );

  const preguntar = useCallback(
    async (
      pregunta: string,
      extra?: { pantalla?: { clave: string; titulo: string }; historial?: Turno[]; sesion?: string }
    ): Promise<Contestacion> => {
      // De qué se venía hablando, para entender un "¿y en Sears?".
      const local = responder(pregunta, entorno, hilo.current);
      if (local.hilo) hilo.current = local.hilo;
      const directa: Contestacion = { texto: local.texto, fuente: "calculo", ms: 0, tipo: local.tipo };

      if (!camino || Date.now() < caidoHasta) return directa;

      try {
        const ctx = construirContexto(hallazgos, ind, filtro.umbral, CORTE.etiqueta, bitacora, pregunta);
        const r = await fetch("/api/copiloto", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...ctx,
            sesion: extra?.sesion,
            pantalla: extra?.pantalla,
            escenario: plan?.nombre,
            // El cálculo viaja como evidencia: el modelo redacta, las cifras
            // salen de aquí.
            calculo: { tipo: local.tipo, texto: local.texto },
            datos: resumenDatos(entorno),
            historial: (extra?.historial ?? []).map((t) => ({ de: t.de, texto: t.texto })),
          }),
        });
        const d = await r.json();
        if ((d.fuente === "modelo" || d.fuente === "n8n") && d.respuesta) {
          return { texto: String(d.respuesta), fuente: "modelo", ms: Number(d.ms ?? 0), tipo: local.tipo };
        }
        caidoHasta = Date.now() + PAUSA;
        return directa;
      } catch {
        caidoHasta = Date.now() + PAUSA;
        return directa;
      }
    },
    [entorno, hallazgos, ind, filtro.umbral, bitacora, plan]
  );

  return { preguntar, hallazgos, modelo, entorno };
}

/** El pie de cada respuesta: de dónde salió, sin tecnicismos. */
export function pieDe(t: { fuente?: Fuente; ms?: number; tipo?: TipoRespuesta }): string {
  if (t.fuente === "modelo") return `Argos · ${((t.ms ?? 0) / 1000).toFixed(1)} s`;
  // Solo lo que es una cifra lleva sello de cálculo. Un saludo o un "eso no
  // me toca" no se calculó sobre nada.
  if (t.tipo === "dato" || t.tipo === "prioridad") return `Calculado sobre el corte ${CORTE.etiqueta}`;
  return "";
}
