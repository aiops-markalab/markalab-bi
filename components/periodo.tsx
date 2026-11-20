"use client";

/**
 * El periodo de análisis.
 *
 * El umbral contesta "cuántas semanas son demasiadas". Esto contesta la otra
 * mitad: "de qué día a qué día estoy viendo". Sell-out, sell-in y los Top 10
 * se suman dentro del periodo; el inventario y la cobertura no, porque son una
 * fotografía del corte y no se pueden sumar por fechas.
 *
 * Se elige de tres maneras, porque cada quien lo pide distinto: un atajo, dos
 * clics en el calendario, o la semana completa con un clic en su número.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useBI } from "@/lib/store";
import {
  CORTE,
  DIAS_HISTORIA,
  PARAMS,
  PRIMER_DIA,
  ULTIMO_DIA,
  diaDeFecha,
  diasDe,
  esPeriodoCompleto,
  etiquetaPeriodo,
  fechaCorta,
  fechaDeDia,
} from "@/lib/engine";

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];
const ULTIMO = DIAS_HISTORIA - 1;

type Mes = { anio: number; mes: number; semanas: (number | null)[][] };

/** Los meses que toca la historia cargada, cada uno partido en semanas de lunes a domingo. */
function mesesDeLaHistoria(): Mes[] {
  const salida: Mes[] = [];
  const [a0, m0] = PRIMER_DIA.split("-").map(Number);
  const [a1, m1] = ULTIMO_DIA.split("-").map(Number);
  for (let a = a0, m = m0; a < a1 || (a === a1 && m <= m1); m === 12 ? (a++, (m = 1)) : m++) {
    const dias = new Date(Date.UTC(a, m, 0)).getUTCDate();
    const semanas: (number | null)[][] = [];
    let fila: (number | null)[] = [];
    // getUTCDay: 0 es domingo. Aquí la semana empieza en lunes.
    const hueco = (new Date(Date.UTC(a, m - 1, 1)).getUTCDay() + 6) % 7;
    for (let i = 0; i < hueco; i++) fila.push(null);
    for (let d = 1; d <= dias; d++) {
      const iso = `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      fila.push(diaDeFecha(iso));
      if (fila.length === 7) {
        semanas.push(fila);
        fila = [];
      }
    }
    if (fila.length) {
      while (fila.length < 7) fila.push(null);
      semanas.push(fila);
    }
    salida.push({ anio: a, mes: m, semanas });
  }
  return salida;
}

const dentro = (d: number | null): d is number => d !== null && d >= 0 && d <= ULTIMO;
const semanaDe = (d: number) => CORTE.semana - (PARAMS.historia - 1 - Math.floor(d / 7));

export function Periodo() {
  const { periodo, setPeriodo } = useBI();
  const [abierto, setAbierto] = useState(false);
  /** El primer clic de un rango que todavía no se cierra. */
  const [ancla, setAncla] = useState<number | null>(null);
  const [sobre, setSobre] = useState<number | null>(null);
  const meses = useMemo(mesesDeLaHistoria, []);
  /** Se ven dos meses; este es el primero. Abre en los dos más recientes. */
  const [primero, setPrimero] = useState(Math.max(0, meses.length - 2));
  const caja = useRef<HTMLDivElement>(null);
  const completo = esPeriodoCompleto(periodo);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [abierto]);

  const fijar = (a: number, b: number) => {
    const d = Math.max(0, Math.min(a, b));
    const h = Math.min(ULTIMO, Math.max(a, b));
    if (d === 0 && h === ULTIMO) setPeriodo("", "");
    else setPeriodo(fechaDeDia(d), fechaDeDia(h));
    setAncla(null);
    setSobre(null);
  };

  const clicDia = (d: number) => {
    if (ancla === null) {
      // Primer clic: el periodo es ese día, y queda esperando el otro extremo.
      setPeriodo(fechaDeDia(d), fechaDeDia(d));
      setAncla(d);
    } else {
      fijar(ancla, d);
    }
  };

  const clicSemana = (s: number) => {
    const ini = s * 7;
    const fin = ini + 6;
    if (ancla === null) fijar(ini, fin);
    else fijar(Math.min(ancla, ini), Math.max(ancla, fin));
  };

  // Lo que se pinta: el rango puesto, o el que se está armando con el cursor.
  const vista =
    ancla !== null && sobre !== null
      ? { desde: Math.min(ancla, sobre), hasta: Math.max(ancla, sobre) }
      : periodo;

  const atajos: { t: string; a: number; b: number }[] = [
    { t: "Todo lo cargado", a: 0, b: ULTIMO },
    { t: "Últimas 8 semanas", a: ULTIMO - 55, b: ULTIMO },
    { t: "Últimas 4 semanas", a: ULTIMO - 27, b: ULTIMO },
    { t: "Última semana", a: ULTIMO - 6, b: ULTIMO },
    { t: "Último día", a: ULTIMO, b: ULTIMO },
  ];

  return (
    <div className="periodo" ref={caja}>
      <button
        className={`puesto periodo-btn ${abierto || !completo ? "on" : ""}`}
        onClick={() => setAbierto(!abierto)}
        aria-expanded={abierto}
        title="Elegir de qué día a qué día se suman sell-out y sell-in"
      >
        <b>Periodo</b>
        {etiquetaPeriodo(periodo)}
      </button>

      {abierto ? (
        <div className="panel-periodo" role="dialog" aria-label="Periodo de análisis">
          <div className="pp-atajos">
            {atajos.map((x) => (
              <button
                key={x.t}
                className={`btn sm ${periodo.desde === x.a && periodo.hasta === x.b ? "on" : "ghost"}`}
                onClick={() => fijar(x.a, x.b)}
              >
                {x.t}
              </button>
            ))}
          </div>

          <div className="pp-fechas">
            <label className="sel">
              <span>Del día</span>
              <input
                type="date"
                min={PRIMER_DIA}
                max={ULTIMO_DIA}
                value={fechaDeDia(periodo.desde)}
                onChange={(e) => e.target.value && fijar(diaDeFecha(e.target.value), periodo.hasta)}
              />
            </label>
            <label className="sel">
              <span>Al día</span>
              <input
                type="date"
                min={PRIMER_DIA}
                max={ULTIMO_DIA}
                value={fechaDeDia(periodo.hasta)}
                onChange={(e) => e.target.value && fijar(periodo.desde, diaDeFecha(e.target.value))}
              />
            </label>
            <div className="pp-nav">
              <button
                className="btn ghost sm"
                onClick={() => setPrimero(Math.max(0, primero - 1))}
                disabled={primero === 0}
                aria-label="Mes anterior"
              >
                ‹
              </button>
              <button
                className="btn ghost sm"
                onClick={() => setPrimero(Math.min(meses.length - 2, primero + 1))}
                disabled={primero >= meses.length - 2}
                aria-label="Mes siguiente"
              >
                ›
              </button>
            </div>
          </div>

          <div className="pp-meses" onMouseLeave={() => setSobre(null)}>
            {meses.slice(primero, primero + 2).map((m) => (
              <div className="pp-mes" key={`${m.anio}-${m.mes}`}>
                <div className="pp-mes-tit">
                  {MESES[m.mes - 1]} {m.anio}
                </div>
                <div className="pp-rejilla">
                  <span className="pp-cab">Sem</span>
                  {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
                    <span className="pp-cab" key={i}>
                      {d}
                    </span>
                  ))}
                  {m.semanas.map((fila, i) => {
                    const validos = fila.filter(dentro);
                    const s = validos.length ? Math.floor(validos[0] / 7) : -1;
                    return [
                      s >= 0 ? (
                        <button
                          key={`s${i}`}
                          className="pp-sem"
                          onClick={() => clicSemana(s)}
                          title={`Semana ${semanaDe(s * 7)} completa`}
                        >
                          S{semanaDe(s * 7)}
                        </button>
                      ) : (
                        <span key={`s${i}`} className="pp-sem vacia" />
                      ),
                      ...fila.map((d, j) => {
                        if (d === null) return <span key={`${i}-${j}`} className="pp-dia hueco" />;
                        if (!dentro(d)) {
                          return (
                            <span key={`${i}-${j}`} className="pp-dia fuera">
                              {Number(fechaDeDia(d).slice(8))}
                            </span>
                          );
                        }
                        const en = d >= vista.desde && d <= vista.hasta;
                        const extremo = d === vista.desde || d === vista.hasta;
                        return (
                          <button
                            key={`${i}-${j}`}
                            className={`pp-dia ${en ? "en" : ""} ${extremo ? "extremo" : ""}`}
                            onClick={() => clicDia(d)}
                            onMouseEnter={() => ancla !== null && setSobre(d)}
                            title={fechaCorta(fechaDeDia(d))}
                          >
                            {Number(fechaDeDia(d).slice(8))}
                          </button>
                        );
                      }),
                    ];
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="pp-pie">
            <span>
              {ancla !== null ? (
                <>Elige el otro extremo del periodo, o deja solo ese día.</>
              ) : (
                <>
                  <strong>{etiquetaPeriodo(periodo)}</strong>
                  {diasDe(periodo) < 7 ? " · periodo de menos de una semana" : ""}
                </>
              )}
            </span>
            <button className="btn sm" onClick={() => setAbierto(false)}>
              Listo
            </button>
          </div>
          <p className="note" style={{ margin: "8px 0 0" }}>
            El periodo suma sell-out, sell-in y los Top 10. Inventario, cobertura y alertas son
            del corte {CORTE.etiqueta}. Hay historia del {fechaCorta(PRIMER_DIA)} al{" "}
            {fechaCorta(ULTIMO_DIA)}.
          </p>
        </div>
      ) : null}
    </div>
  );
}
