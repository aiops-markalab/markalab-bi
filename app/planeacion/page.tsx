"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useBI } from "@/lib/store";
import { Descarga, useBase } from "@/components/descarga";
import { libroEscenario } from "@/lib/libros";
import { Tile } from "@/components/ui";
import { ReferenciaSellOut } from "@/components/referencia";
import { Treemap, Columnas } from "@/components/charts";
import { fmt, money, moneyCorto, pct } from "@/lib/engine";
import { proyectar, CAMPOS_SUPUESTO, MESES, ESCENARIOS_BASE } from "@/lib/plan";

export default function Planeacion() {
  const {
    vista,
    ind,
    escenarios,
    escenarioId,
    setEscenarioId,
    actualizarEscenario,
    reiniciarEscenario,
  } = useBI();
  const alcanceLibro = useBase();

  const activo = escenarios.find((e) => e.id === escenarioId) ?? escenarios[0];
  const base = escenarios.find((e) => e.id === "base")!;

  const p = useMemo(
    () => proyectar(activo, vista, ind.perdida, ind.capital),
    [activo, vista, ind.perdida, ind.capital]
  );
  const pBase = useMemo(
    () => proyectar(base, vista, ind.perdida, ind.capital),
    [base, vista, ind.perdida, ind.capital]
  );

  const d = {
    ingreso: p.ingreso - pBase.ingreso,
    margen: p.margenBruto - pBase.margenBruto,
    ebitda: p.ebitda - pBase.ebitda,
    caja: p.cajaLiberada - pBase.cajaLiberada,
  };

  const baldosas = p.lineas.slice(0, 10).map((l) => {
    const maxM = Math.max(...p.lineas.map((x) => x.margenPct));
    const minM = Math.min(...p.lineas.map((x) => x.margenPct));
    return {
      nombre: l.nombre,
      valor: l.totalIngreso,
      pzas: Math.round(l.totalUnidades),
      intensidad: maxM > minM ? (l.margenPct - minM) / (maxM - minM) : 0.5,
      nota: `${fmt(Math.round(l.totalUnidades))} pzas · margen ${pct(l.margenPct)}`,
    };
  });

  const trimestres = [0, 1, 2, 3].map((i) => ({
    et: `Q${i + 1}`,
    v: p.ebitdaMes.slice(i * 3, i * 3 + 3).reduce((a, b) => a + b, 0),
  }));

  return (
    <div className="view">
      {/* Selector de escenario */}
      <div className="card" style={{ paddingBottom: 14 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 320px" }}>
            <h3>Escenario activo</h3>
            <p className="sub">{activo.descripcion}</p>
          </div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {escenarios.map((e) => (
              <button
                key={e.id}
                className={`btn ${e.id === escenarioId ? "on" : "ghost"} sm`}
                onClick={() => setEscenarioId(e.id)}
              >
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 3,
                    background: e.color,
                    display: "inline-block",
                  }}
                />
                {e.nombre}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="tiles">
        <Tile
          k="Sell-in proyectado"
          v={moneyCorto(p.ingreso)}
          s={`${fmt(p.unidades)} pzas`}
          n="Doce meses, a precio de venta a la cadena"
          delta={
            activo.id !== "base"
              ? { valor: moneyCorto(Math.abs(d.ingreso)), arriba: d.ingreso >= 0 }
              : undefined
          }
        />
        <Tile
          k="Margen sobre sell-in"
          v={moneyCorto(p.margenBruto)}
          s={pct(p.margenPct)}
          n="Sell-in menos el costo del producto"
          delta={
            activo.id !== "base"
              ? { valor: moneyCorto(Math.abs(d.margen)), arriba: d.margen >= 0 }
              : undefined
          }
        />
        <Tile
          k="EBITDA"
          v={moneyCorto(p.ebitda)}
          s={pct(p.ebitdaPct)}
          tono={p.ebitda >= pBase.ebitda ? "ok" : "flag"}
          n="Margen menos gastos, sobre el sell-in"
          delta={
            activo.id !== "base"
              ? { valor: moneyCorto(Math.abs(d.ebitda)), arriba: d.ebitda >= 0 }
              : undefined
          }
        />
        <Tile
          k="Quiebres que se cierran"
          v={moneyCorto(p.recuperado)}
          s={`${fmt(p.recuperadoPzas)} pzas`}
          tono="accent"
          n={`Sell-in que se recupera con servicio al ${fmt(activo.supuestos.servicio, 0)}%`}
        />
        <Tile
          k="Caja liberada"
          v={moneyCorto(p.cajaLiberada)}
          tono="accent"
          n="Por bajar los días de inventario objetivo"
        />
        <Tile
          k="Inventario promedio"
          v={moneyCorto(p.inventarioPromedio)}
          s={`${fmt(activo.supuestos.diasObjetivo, 0)} días`}
          n="Inventario de la marca que sostiene ese sell-in"
        />
      </div>

      <ReferenciaSellOut proyeccion={p.porCadena} />

      <div className="cols-2">
        {/* Hoja de supuestos */}
        <div className="card">
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 auto" }}>
              <h3>Supuestos</h3>
              <p className="sub">
                Todo el plan corre sobre sell-in. Mueve cualquiera y observa cómo se propaga por
                el modelo completo, hasta EBITDA.
              </p>
            </div>
            {!activo.bloqueado ? (
              <button className="btn ghost sm" onClick={() => reiniciarEscenario(activo.id)}>
                Reiniciar
              </button>
            ) : null}
          </div>

          {activo.bloqueado ? (
            <p className="note" style={{ marginTop: 10 }}>
              <strong>{activo.nombre}</strong> es un escenario de referencia y no se edita. Para
              probar cambios, usa <em>Canal corregido</em>, <em>Conservador</em> o{" "}
              <em>Mi escenario</em>.
            </p>
          ) : null}

          <div style={{ display: "flex", flexDirection: "column", gap: 13, marginTop: 14 }}>
            {CAMPOS_SUPUESTO.map((c) => {
              const v = activo.supuestos[c.k];
              const vBase = ESCENARIOS_BASE[0].supuestos[c.k];
              const cambiado = Math.abs(v - vBase) > 1e-9;
              return (
                <div key={c.k}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      alignItems: "baseline",
                    }}
                  >
                    <label
                      htmlFor={`sup-${c.k}`}
                      style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}
                    >
                      {c.etiqueta}
                    </label>
                    <span
                      className="num"
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: cambiado ? "var(--accent-ink)" : "var(--ink-2)",
                      }}
                    >
                      {c.unidad === "M$" ? "$" : ""}
                      {fmt(v, c.paso < 1 ? 1 : 0)}
                      {c.unidad === "M$" ? " M" : c.unidad === "%" ? "%" : ` ${c.unidad}`}
                    </span>
                  </div>
                  <input
                    id={`sup-${c.k}`}
                    type="range"
                    min={c.min}
                    max={c.max}
                    step={c.paso}
                    value={v}
                    disabled={activo.bloqueado}
                    onChange={(e) =>
                      actualizarEscenario(activo.id, { [c.k]: Number(e.target.value) })
                    }
                    style={{ width: "100%", accentColor: "var(--accent)", marginTop: 4 }}
                  />
                  <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{c.ayuda}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Cómo se propaga */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <h3>Cómo se propaga el cambio</h3>
            <p className="sub">
              La cadena completa, del supuesto al resultado. Es el mismo orden en que recalcula el
              modelo.
            </p>
            <div className="rows">
              {[
                { k: "Piezas de sell-in", v: fmt(Math.round(p.unidades)) + " pzas", b: fmt(Math.round(pBase.unidades)) + " pzas" },
                { k: "Ingreso por sell-in", v: moneyCorto(p.ingreso), b: moneyCorto(pBase.ingreso) },
                { k: "Costo del producto", v: moneyCorto(-p.costo), b: moneyCorto(-pBase.costo) },
                { k: "Margen sobre sell-in", v: moneyCorto(p.margenBruto), b: moneyCorto(pBase.margenBruto) },
                { k: "Gasto operativo", v: moneyCorto(-p.gastoOperativo), b: moneyCorto(-pBase.gastoOperativo) },
                { k: "Costo del inventario", v: moneyCorto(-p.costoInventario), b: moneyCorto(-pBase.costoInventario) },
                { k: "EBITDA", v: moneyCorto(p.ebitda), b: moneyCorto(pBase.ebitda) },
              ].map((r, i, arr) => (
                <div
                  className="row"
                  key={r.k}
                  style={
                    i === arr.length - 1
                      ? { borderTop: "2px solid var(--axis)", fontWeight: 700 }
                      : undefined
                  }
                >
                  <div className="who">
                    <strong style={{ fontWeight: i === arr.length - 1 ? 700 : 600 }}>{r.k}</strong>
                    {activo.id !== "base" ? <span>Base: {r.b}</span> : null}
                  </div>
                  <div className="val num">{r.v}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3>EBITDA por trimestre</h3>
            <p className="sub">
              La estacionalidad del portafolio concentra el resultado en el último trimestre.
            </p>
            <Columnas datos={trimestres} />
            <div className="tfoot">
              <span>Escenario {activo.nombre}</span>
              <Link className="btn ghost sm" href="/resultados">
                Ver el estado de resultados
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="cols-2">
        <div className="card">
          <h3>Sell-in por colección</h3>
          <p className="sub">
            El tamaño es el sell-in proyectado en pesos; la intensidad, el porcentaje de margen.
            Cada recuadro dice también sus piezas.
          </p>
          <Treemap datos={baldosas} />
        </div>

        <div className="card">
          <h3>Proyección por colección</h3>
          <p className="sub">Doce meses bajo el escenario {activo.nombre}.</p>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Colección</th>
                  <th>Segmento</th>
                  <th className="n">Sell-in (pzas)</th>
                  <th className="n">Sell-in $</th>
                  <th className="n">Margen $</th>
                  <th className="n">Margen %</th>
                </tr>
              </thead>
              <tbody>
                {p.lineas.map((l) => (
                  <tr key={l.coleccionId}>
                    <td className="name">
                      <strong>{l.nombre}</strong>
                    </td>
                    <td>{l.segmento}</td>
                    <td className="n">{fmt(Math.round(l.totalUnidades))}</td>
                    <td className="n">{moneyCorto(l.totalIngreso)}</td>
                    <td className="n">{moneyCorto(l.totalMargen)}</td>
                    <td className="n">{pct(l.margenPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Sell-in mes a mes</h3>
        <p className="sub">
          Piezas y pesos de sell-in del escenario {activo.nombre}. Diciembre concentra el doble de
          un mes promedio.
        </p>
        <div className="tablewrap" style={{ maxHeight: "none" }}>
          <table>
            <thead>
              <tr>
                <th>Concepto</th>
                {MESES.map((m) => (
                  <th key={m} className="n">
                    {m}
                  </th>
                ))}
                <th className="n">Año</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="name">
                  <strong>Sell-in (pzas)</strong>
                </td>
                {p.unidadesMes.map((v, i) => (
                  <td key={i} className="n">
                    {fmt(v)}
                  </td>
                ))}
                <td className="n">
                  <strong>{fmt(p.unidades)}</strong>
                </td>
              </tr>
              <tr>
                <td className="name">
                  <strong>Sell-in $</strong>
                </td>
                {p.ingresoMes.map((v, i) => (
                  <td key={i} className="n">
                    {moneyCorto(v)}
                  </td>
                ))}
                <td className="n">
                  <strong>{moneyCorto(p.ingreso)}</strong>
                </td>
              </tr>
              <tr>
                <td className="name">Margen sobre sell-in</td>
                {p.margenMes.map((v, i) => (
                  <td key={i} className="n">
                    {moneyCorto(v)}
                  </td>
                ))}
                <td className="n">
                  <strong>{moneyCorto(p.margenBruto)}</strong>
                </td>
              </tr>
              <tr>
                <td className="name">EBITDA</td>
                {p.ebitdaMes.map((v, i) => (
                  <td key={i} className="n" style={{ color: v < 0 ? "var(--crit-ink)" : undefined }}>
                    {moneyCorto(v)}
                  </td>
                ))}
                <td className="n">
                  <strong>{moneyCorto(p.ebitda)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="note">
          Cifras de demostración. Las fórmulas de propagación están declaradas en el código y son
          discutibles renglón por renglón: piezas de sell-in = sell-in actual × crecimiento × efecto
          precio × servicio × mercadotecnia. El margen de la marca sobre su precio de venta a la
          cadena es un supuesto de la demostración.
        </p>
      </div>
      <Descarga
        titulo="El escenario en Excel"
        contenido="El modelo del plan sobre sell-in, en fórmulas: los nueve supuestos son celdas vivas y recalculan piezas por mes, P&L por trimestre y EBITDA."
        armar={() => libroEscenario(alcanceLibro, activo, escenarios)}
      />
    </div>
  );
}
