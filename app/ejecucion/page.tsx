"use client";

import { useMemo, useState } from "react";
import { useBI } from "@/lib/store";
import { Descarga, useBase } from "@/components/descarga";
import { libroEjecucion } from "@/lib/libros";
import { Tile, Chip, Mono, Accion, Tabla, type Col } from "@/components/ui";
import { Sparkline, Barras } from "@/components/charts";
import { fmt, money, moneyCorto, PARAMS, type Combo } from "@/lib/engine";

type Pestana = "todo" | "noresurtir" | "resurtir";

export default function Ejecucion() {
  const { vista, filtro } = useBI();
  const base = useBase();
  const [tab, setTab] = useState<Pestana>("todo");

  const sobre = useMemo(
    () => vista.filter((c) => c.clase === "alto" || c.clase === "saturado"),
    [vista]
  );
  const quiebres = useMemo(() => vista.filter((c) => c.clase === "quiebre"), [vista]);

  const capital = sobre.reduce((a, c) => a + c.capital, 0);
  const excedente = sobre.reduce((a, c) => a + c.exc, 0);
  const perdida = quiebres.reduce((a, c) => a + c.perdida, 0);
  const perdidaPzas = quiebres.reduce((a, c) => a + (c.perdida > 0 ? c.so : 0), 0);
  const sugerido = quiebres.reduce((a, c) => a + c.sug, 0);
  const sugeridoMonto = quiebres.reduce((a, c) => a + c.sug * c.costo, 0);

  const porColeccion = useMemo(() => {
    const m = new Map<string, { n: string; perdida: number; pzas: number; sug: number; quiebres: number }>();
    for (const c of quiebres) {
      const k = c.coleccion.id;
      if (!m.has(k)) m.set(k, { n: c.coleccion.nombre, perdida: 0, pzas: 0, sug: 0, quiebres: 0 });
      const r = m.get(k)!;
      r.perdida += c.perdida;
      r.pzas += c.perdida > 0 ? c.so : 0;
      r.sug += c.sug;
      r.quiebres++;
    }
    return [...m.values()]
      .sort((a, b) => b.perdida - a.perdida)
      .slice(0, 7)
      .map((r) => ({
        n: r.n,
        v: r.perdida,
        c: "var(--warn)",
        lbl: `${moneyCorto(r.perdida)} · ${fmt(r.pzas)} pzas`,
        tip: (
          <>
            <div className="r">
              <span>Combinaciones en quiebre</span>
              <b>{r.quiebres}</b>
            </div>
            <div className="r">
              <span>Piezas perdidas por semana</span>
              <b>{fmt(r.pzas)} pzas</b>
            </div>
            <div className="r">
              <span>Resurtido sugerido</span>
              <b>{fmt(r.sug)} pzas</b>
            </div>
          </>
        ),
      }));
  }, [quiebres]);

  const colsCombo = (modo: "sat" | "qui"): Col<Combo>[] => [
    {
      t: "Sucursal",
      cls: "name",
      f: (c) => (
        <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
          <Mono cadenaId={c.sucursal.cadenaId} />
          <span>
            <strong>{c.sucursal.plaza}</strong>
            <br />
            <span>{c.sucursal.nombre.split(" ")[0]}</span>
          </span>
        </span>
      ),
    },
    {
      t: "Modelo",
      cls: "name",
      f: (c) => (
        <>
          <strong>{c.modelo.sku}</strong>
          <br />
          <span>{c.coleccion.nombre}</span>
        </>
      ),
    },
    { t: "12 sem", f: (c) => <Sparkline valores={c.hist} color={modo === "qui" ? "var(--warn)" : "var(--s1)"} /> },
    { t: "Exist. (pzas)", n: true, f: (c) => fmt(c.inv) },
    { t: "Sell-out/sem", n: true, f: (c) => fmt(c.so, 1) },
    ...(modo === "sat"
      ? ([
          { t: "Cobertura", n: true, f: (c: Combo) => (c.cob > 50 ? "∞" : fmt(c.cob, 1)) },
          { t: "Sobre umbral (pzas)", n: true, f: (c: Combo) => <strong>{fmt(c.exc)}</strong> },
          { t: "Capital parado", n: true, f: (c: Combo) => moneyCorto(c.capital) },
          { t: "Tránsito (pzas)", n: true, f: (c: Combo) => fmt(c.tr) },
        ] as Col<Combo>[])
      : ([
          { t: "Tránsito (pzas)", n: true, f: (c: Combo) => fmt(c.tr) },
          { t: "Sugerido (pzas)", n: true, f: (c: Combo) => <strong>{fmt(c.sug)}</strong> },
          { t: "Sugerido en sell-in", n: true, f: (c: Combo) => moneyCorto(c.sug * c.costo) },
          { t: "Venta perdida/sem", n: true, f: (c: Combo) => money(c.perdida) },
        ] as Col<Combo>[])),
    { t: "Estado", f: (c) => <Chip clase={c.clase} /> },
  ];

  const pestanas: { k: Pestana; t: string; n: number }[] = [
    { k: "todo", t: "Resumen", n: 0 },
    { k: "noresurtir", t: "No resurtir", n: sobre.length },
    { k: "resurtir", t: "Resurtir", n: quiebres.length },
  ];

  return (
    <div className="view">
      <div className="tiles">
        <Tile
          k="No resurtir"
          v={fmt(sobre.length)}
          s={`${fmt(excedente)} pzas`}
          tono="flag"
          n={`${moneyCorto(capital)} de capital parado sobre el umbral`}
        />
        <Tile
          k="Resurtir"
          v={fmt(quiebres.length)}
          s={`${fmt(sugerido)} pzas`}
          tono="flag"
          n={`${moneyCorto(sugeridoMonto)} de sell-in sugerido para cerrar quiebres`}
        />
        <Tile
          k="Venta perdida semanal"
          v={moneyCorto(perdida)}
          s={`${fmt(perdidaPzas)} pzas`}
          tono="flag"
          n="Lo que el consumidor no encuentra cada semana"
        />
        <Tile
          k="Costo de no hacer nada"
          v={moneyCorto(perdida * 4.3 + (capital * PARAMS.costoCapitalAnual) / 12)}
          s={`${fmt(perdidaPzas * 4.3)} pzas`}
          tono="flag"
          n="Piezas y venta que se pierden en un mes más igual"
        />
        <Tile
          k="Piezas en tránsito"
          v={fmt(vista.reduce((a, c) => a + c.tr, 0))}
          u="pzas"
          s={moneyCorto(vista.reduce((a, c) => a + c.tr * c.costo, 0))}
          n={`${fmt(sobre.reduce((a, c) => a + c.tr, 0))} pzas van a combinaciones que ya rebasan el umbral`}
        />
      </div>

      <div className="card" style={{ paddingTop: 12, paddingBottom: 12 }}>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {pestanas.map((x) => (
            <button
              key={x.k}
              className={`btn ${tab === x.k ? "on" : "ghost"} sm`}
              onClick={() => setTab(x.k)}
            >
              {x.t}
              {x.n ? <span className="cuenta-tab">{fmt(x.n)}</span> : null}
            </button>
          ))}
        </div>
      </div>

      {tab === "todo" ? (
        <div className="cols-2">
          <div className="card">
            <h3>El orden de las decisiones</h3>
            <p className="sub">
              Primero dejar de resurtir lo que ya rebasa el umbral, y después resurtir solo lo que
              está en quiebre y sí se vende.
            </p>
            <Accion
              tipo="no"
              titulo="1. No resurtir"
              nota={`${fmt(sobre.length)} combinaciones · ${fmt(excedente)} pzas sobre el umbral`}
            >
              {sobre
                .slice()
                .sort((a, b) => b.capital - a.capital)
                .slice(0, 5)
                .map((c) => (
                  <li key={c.id}>
                    <b>{c.sucursal.plaza}</b> · {c.modelo.sku} — <em>{fmt(c.inv)} pzas</em>,{" "}
                    {c.cob > 50 ? "∞" : fmt(c.cob, 1)} semanas, <em>{fmt(c.exc)} pzas</em> de más (
                    {moneyCorto(c.capital)})
                    {c.tr ? ` · ${c.tr} pzas ya van en tránsito` : ""}
                  </li>
                ))}
              {sobre.length === 0 ? <li>Ninguna combinación rebasa el umbral con estos filtros.</li> : null}
            </Accion>
            <div style={{ height: 10 }} />
            <Accion
              tipo="re"
              titulo="2. Resurtir"
              nota={`${fmt(quiebres.length)} en quiebre · ${fmt(sugerido)} pzas sugeridas`}
            >
              {quiebres
                .slice()
                .sort((a, b) => b.perdida - a.perdida)
                .slice(0, 5)
                .map((c) => (
                  <li key={c.id}>
                    <b>{c.sucursal.plaza}</b> · {c.modelo.sku} — sugerido{" "}
                    <em>{fmt(c.sug)} pzas</em> ({moneyCorto(c.sug * c.costo)}),{" "}
                    {c.perdida > 0 ? (
                      <>
                        venta perdida de <em>{fmt(c.so, 1)} pzas</em> y{" "}
                        <em>{money(c.perdida)}</em> por semana
                      </>
                    ) : (
                      <>
                        le quedan <em>{fmt(c.inv)} pzas</em>, todavía sin venta perdida
                      </>
                    )}
                    {c.tr ? ` · ${c.tr} pzas en tránsito` : ""}
                  </li>
                ))}
              {quiebres.length === 0 ? <li>Sin quiebres con estos filtros.</li> : null}
            </Accion>
          </div>

          <div className="card">
            <h3>Venta perdida por colección</h3>
            <p className="sub">
              Dónde duele más el quiebre, en pesos y en piezas por semana. Es la lista que decide la
              prioridad del siguiente resurtido.
            </p>
            {porColeccion.length ? (
              <Barras datos={porColeccion} anchoEtiqueta={140} />
            ) : (
              <div className="empty">Sin quiebres con los filtros actuales.</div>
            )}
            <p className="note">
              Estimada a precio de lista sobre el desplazamiento promedio de {PARAMS.ventana}{" "}
              semanas. Es un techo, no una cifra contable.
            </p>
          </div>
        </div>
      ) : null}

      {tab === "noresurtir" ? (
        <div className="card">
          <h3>Combinaciones sobre el umbral</h3>
          <p className="sub">
            Ordenadas por capital parado. Estas son las que no deberían recibir una pieza más hasta
            que bajen del umbral de {filtro.umbral} semanas.
          </p>
          <div className="tablewrap">
            <Tabla
              cols={colsCombo("sat")}
              filas={sobre.slice().sort((a, b) => b.capital - a.capital)}
            />
          </div>
          <div className="tfoot">
            <span>
              {fmt(sobre.length)} combinaciones · {fmt(excedente)} pzas sobre el umbral ·{" "}
              {moneyCorto(capital)} a precio de venta a la cadena
            </span>
          </div>
        </div>
      ) : null}

      {tab === "resurtir" ? (
        <div className="card">
          <h3>Combinaciones en quiebre</h3>
          <p className="sub">
            Modelos que sí se venden en la tienda y están en cero o por agotarse. El sugerido deja
            a la tienda con {PARAMS.diasObjetivo} días de inventario, descontando lo que ya va en
            tránsito.
          </p>
          <div className="tablewrap">
            <Tabla
              cols={colsCombo("qui")}
              filas={quiebres.slice().sort((a, b) => b.perdida - a.perdida)}
            />
          </div>
          <div className="tfoot">
            <span>
              {fmt(quiebres.length)} combinaciones · {fmt(sugerido)} pzas sugeridas ·{" "}
              {moneyCorto(sugeridoMonto)} de sell-in · {fmt(perdidaPzas)} pzas y {moneyCorto(perdida)}{" "}
              de venta perdida por semana
            </span>
          </div>
        </div>
      ) : null}

      <Descarga
        titulo="Las decisiones de la semana en Excel"
        contenido="No resurtir y resurtir, cada uno en su hoja, con piezas, monto y fórmulas. El umbral y los días objetivo son celdas vivas."
        armar={() => libroEjecucion(base)}
      />
    </div>
  );
}
