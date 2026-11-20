"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useBI } from "@/lib/store";
import { Tile, Chip, Mono } from "@/components/ui";
import { Lineas, Barras, Sparkline } from "@/components/charts";
import {
  CORTE,
  fmt,
  money,
  moneyCorto,
  pct,
  porEstado,
  clasificar,
  SITUACIONES,
  PARAMS,
  top,
  serieDe,
  etiquetaPeriodo,
  esPeriodoCompleto,
  type Combo,
  type Top,
} from "@/lib/engine";
import { proyectar, ESCENARIOS_BASE } from "@/lib/plan";
import { Descarga, useBase } from "@/components/descarga";
import { libroResumen } from "@/lib/libros";

export default function Resumen() {
  const { data, vista, ind, filtro, periodo, setEstado } = useBI();
  const base = useBase();

  const indice = ind.sellIn > 0 ? (ind.sellOut / ind.sellIn) * 100 : 0;
  const brecha = ind.sellIn - ind.sellOut;
  const rotulo = etiquetaPeriodo(periodo);
  const completo = esPeriodoCompleto(periodo);

  /* Los diez modelos que más se venden y los diez que más se resurten, dentro
     del periodo. Se agrupa por SKU porque es el nivel al que se resurte: una
     colección puede verse bien mientras una de sus referencias se cae sola.
     Las dos listas juntas enseñan lo que una sola esconde: el modelo que se
     resurte mucho y se vende poco. */
  const topOut = useMemo(() => top(vista, periodo, "out"), [vista, periodo]);
  const topIn = useMemo(() => top(vista, periodo, "in"), [vista, periodo]);

  const serie = useMemo(
    () =>
      serieDe(vista, periodo).map((s) => ({
        et: s.etiqueta,
        pie: s.etiqueta.startsWith("S") ? `Semana ${s.etiqueta.slice(1)} de ${CORTE.anio}` : s.etiqueta,
        a: Math.round(s.sellIn),
        b: Math.round(s.sellOut),
      })),
    [vista, periodo]
  );
  const porDia = serie.length > 0 && !serie[0].et.startsWith("S");

  const porCadena = useMemo(() => {
    return data.cadenas
      .map((cd) => {
        const f = vista.filter((c) => c.sucursal.cadenaId === cd.id);
        const inv = f.reduce((a, c) => a + c.inv, 0);
        const so = f.reduce((a, c) => a + c.so, 0);
        const cob = so > 0.05 ? inv / so : 0;
        const sobre = f.filter((c) => c.clase === "alto" || c.clase === "saturado").length;
        const cl = clasificar({ cob, so, inv, sucursal: { reporta: true } } as Combo, filtro.umbral);
        return {
          n: cd.nombre,
          v: cob,
          c:
            cl === "saturado"
              ? "var(--crit)"
              : cl === "alto"
                ? "var(--serious)"
                : cl === "quiebre"
                  ? "var(--warn)"
                  : "var(--good)",
          lbl: `${fmt(cob, 1)} sem · ${fmt(inv)} pzas`,
          tip: (
            <>
              <div className="r">
                <span>Inventario</span>
                <b>{fmt(inv)} pzas</b>
              </div>
              <div className="r">
                <span>Valor del inventario</span>
                <b>{moneyCorto(f.reduce((a, c) => a + c.inv * c.costo, 0))}</b>
              </div>
              <div className="r">
                <span>Combinaciones sobre umbral</span>
                <b>
                  {sobre} de {f.length}
                </b>
              </div>
              <div className="r">
                <span>Piezas sobre umbral</span>
                <b>{fmt(f.reduce((a, c) => a + c.exc, 0))} pzas</b>
              </div>
              <div className="r">
                <span>Capital parado</span>
                <b>{moneyCorto(f.reduce((a, c) => a + c.capital, 0))}</b>
              </div>
            </>
          ),
        };
      })
      .filter((x) => x.v > 0)
      .sort((a, b) => b.v - a.v);
  }, [data.cadenas, vista, filtro.umbral]);

  const estados = useMemo(() => porEstado(vista, filtro.umbral), [vista, filtro.umbral]);
  const peores = estados.slice(0, 5);

  const atender = useMemo(() => {
    const sat = vista
      .filter((c) => c.clase === "saturado")
      .sort((a, b) => b.capital - a.capital)
      .slice(0, 4);
    const qui = vista
      .filter((c) => c.clase === "quiebre")
      .sort((a, b) => b.perdida - a.perdida)
      .slice(0, 4);
    return [...sat, ...qui].sort((a, b) => b.impacto - a.impacto);
  }, [vista]);

  const corregido = useMemo(() => {
    const base = proyectar(ESCENARIOS_BASE[0], vista, ind.perdida, ind.capital);
    const corr = proyectar(ESCENARIOS_BASE[2], vista, ind.perdida, ind.capital);
    return { base, corr, delta: corr.ebitda - base.ebitda };
  }, [vista, ind.perdida, ind.capital]);

  return (
    <div className="view">
      <div className="tiles">
        <Tile
          k="Sell-out del periodo"
          v={fmt(ind.sellOut)}
          u="pzas"
          s={moneyCorto(ind.sellOutMonto)}
          n={`Vendido al consumidor · ${rotulo}`}
        />
        <Tile
          k="Sell-in del periodo"
          v={fmt(ind.sellIn)}
          u="pzas"
          s={moneyCorto(ind.sellInMonto)}
          n={`Resurtido a las cadenas · ${rotulo}`}
        />
        <Tile
          k="Índice de desplazamiento"
          v={fmt(indice, 1)}
          u="%"
          s={`${brecha >= 0 ? "+" : "−"}${fmt(Math.abs(brecha))} pzas`}
          tono={indice < 90 ? "flag" : "ok"}
          n={
            brecha > 0
              ? `Se resurtieron ${fmt(brecha)} piezas más de las que se vendieron`
              : `Se vendieron ${fmt(-brecha)} piezas más de las que se resurtieron`
          }
        />
        <Tile
          k="Cobertura promedio"
          v={fmt(ind.cobertura, 1)}
          u="sem"
          s={`${fmt(ind.inventario)} pzas`}
          tono={ind.cobertura > filtro.umbral ? "flag" : undefined}
          n={`${moneyCorto(ind.inventarioMonto)} en canal · umbral de ${filtro.umbral} semanas`}
        />
        <Tile
          k="Capital inmovilizado"
          v={moneyCorto(ind.capital)}
          s={`${fmt(ind.excedente)} pzas`}
          tono="flag"
          n={`Piezas sobre el umbral, en ${fmt(ind.saturadas)} combinaciones`}
        />
        <Tile
          k="Venta perdida semanal"
          v={moneyCorto(ind.perdida)}
          s={`${fmt(ind.perdidaPzas)} pzas`}
          tono="flag"
          n={`Por semana, en ${fmt(ind.quiebres)} combinaciones en quiebre`}
        />
      </div>

      <div className="cols-2">
        <div className="card">
          <h3>Sell-in contra sell-out por {porDia ? "día" : "semana"}</h3>
          <p className="sub">
            {brecha > 0
              ? `En el periodo se resurtieron ${fmt(ind.sellIn)} piezas y se vendieron ${fmt(ind.sellOut)}: ${fmt(brecha)} piezas de más, que son las que saturan el anaquel.`
              : `En el periodo se vendieron ${fmt(ind.sellOut)} piezas y se resurtieron ${fmt(ind.sellIn)}: el desplazamiento va por delante del resurtido.`}
          </p>
          <Lineas datos={serie} etiquetaA="Sell-in" etiquetaB="Sell-out" alto={260} />
          <div className="legend">
            <span>
              <i style={{ background: "var(--s1)" }} />
              Sell-in · resurtido a las cadenas
            </span>
            <span>
              <i style={{ background: "var(--s2)" }} />
              Sell-out · vendido al consumidor
            </span>
          </div>
          <p className="note">
            {porDia
              ? "La carga es semanal. El detalle por día reparte cada semana con el peso que cada día tiene en una tienda departamental."
              : completo
                ? "Los picos de la línea azul son los resurtidos de cierre de mes. Ninguno corresponde a un repunte de la demanda."
                : "Las semanas que el periodo corta a la mitad cuentan solo por sus días dentro del periodo."}
          </p>
        </div>

        <div className="card">
          <h3>Semanas de cobertura por cadena</h3>
          <p className="sub">
            Inventario en canal dividido entre el desplazamiento semanal.
            {porCadena.length
              ? ` ${porCadena[0].n} es la cadena con más semanas sobre el anaquel.`
              : ""}
          </p>
          <Barras
            datos={porCadena}
            referencia={filtro.umbral}
            etiquetaRef={`umbral ${filtro.umbral} semanas`}
            anchoEtiqueta={168}
          />
        </div>
      </div>

      <Top10
        titulo="Top 10 de sell-out"
        sub={`Los diez modelos que más piezas vendieron al consumidor · ${rotulo}. El ancho de la barra son las piezas.`}
        datos={topOut}
        medida="out"
        totalPzas={ind.sellOut}
        totalMonto={ind.sellOutMonto}
      />
      <Top10
        titulo="Top 10 de sell-in"
        sub={`Los diez modelos que más piezas se resurtieron a las cadenas · ${rotulo}. Junto a cada uno, lo que de ese modelo sí se vendió.`}
        datos={topIn}
        medida="in"
        totalPzas={ind.sellIn}
        totalMonto={ind.sellInMonto}
      />

      <div className="cols-2">
        <div className="card">
          <h3>Qué atender esta semana</h3>
          <p className="sub">
            Las combinaciones de mayor impacto en pesos: capital parado más venta perdida de las
            próximas cuatro semanas.
          </p>
          <div className="rows">
            {atender.length === 0 ? (
              <div className="empty">Sin alertas con los filtros actuales.</div>
            ) : (
              atender.map((c) => (
                <div className="row" key={c.id}>
                  <div className="who" style={{ display: "flex", gap: 9, alignItems: "center" }}>
                    <Mono cadenaId={c.sucursal.cadenaId} />
                    <div style={{ minWidth: 0 }}>
                      <strong>{c.sucursal.nombre}</strong>
                      <span>
                        {c.modelo.sku} · {c.coleccion.nombre} · {c.sucursal.ciudad}
                      </span>
                    </div>
                  </div>
                  <Sparkline
                    valores={c.hist}
                    color={c.clase === "quiebre" ? "var(--warn)" : "var(--s1)"}
                  />
                  <Chip clase={c.clase} />
                  <div className="val num">
                    {moneyCorto(c.impacto)}
                    <small>
                      {c.clase === "quiebre"
                        ? `faltan ${fmt(c.sug)} pzas`
                        : `sobran ${fmt(c.exc)} pzas`}
                    </small>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="tfoot">
            <span>Ordenado por impacto en pesos, con sus piezas</span>
            <Link className="btn ghost sm" href="/ejecucion">
              Ver todo
            </Link>
          </div>
        </div>

        <div className="card">
          <h3>Estados con mayor impacto</h3>
          <p className="sub">Clic en un estado para filtrar toda la plataforma por esa plaza.</p>
          <div className="rows">
            {peores.map((e) => (
              <div
                className="row clic"
                key={e.estado.id}
                onClick={() => setEstado(e.estado.id)}
                tabIndex={0}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter") setEstado(e.estado.id);
                }}
              >
                <div className="who">
                  <strong>{e.estado.nombre}</strong>
                  <span>
                    {fmt(e.sucursales)} sucursales · {fmt(e.inv)} pzas en canal
                  </span>
                </div>
                <Chip clase={e.clase} />
                <div className="val num">
                  {moneyCorto(e.impacto)}
                  <small>
                    {fmt(e.exc)} pzas de más · {fmt(e.quiebres)} quiebres
                  </small>
                </div>
              </div>
            ))}
          </div>
          <div className="tfoot">
            <span>
              {estados.filter((e) => e.clase === "sano").length} estados operando dentro del umbral
            </span>
            <Link className="btn ghost sm" href="/mapa">
              Abrir el mapa
            </Link>
          </div>
        </div>
      </div>

      <div className="card" style={{ borderColor: "color-mix(in srgb, var(--accent) 35%, var(--hair))" }}>
        <h3>Lo que vale corregir el canal</h3>
        <p className="sub">
          Comparación entre dejar la operación como está y el escenario que ataca la saturación.
          Los dos proyectan doce meses de sell-in, que es lo que la marca le vende a las cadenas.
        </p>
        <div className="tiles" style={{ marginTop: 12 }}>
          <Tile
            k="Sell-in sin cambiar nada"
            v={moneyCorto(corregido.base.ingreso)}
            s={`${fmt(corregido.base.unidades)} pzas`}
            n={`EBITDA de ${moneyCorto(corregido.base.ebitda)}, ${pct(corregido.base.ebitdaPct)} del ingreso`}
          />
          <Tile
            k="Sell-in con el canal corregido"
            v={moneyCorto(corregido.corr.ingreso)}
            s={`${fmt(corregido.corr.unidades)} pzas`}
            tono="ok"
            n={`EBITDA de ${moneyCorto(corregido.corr.ebitda)}, ${pct(corregido.corr.ebitdaPct)} del ingreso`}
          />
          <Tile
            k="Diferencia"
            v={moneyCorto(corregido.corr.ingreso - corregido.base.ingreso)}
            s={`${fmt(corregido.corr.unidades - corregido.base.unidades)} pzas`}
            tono="accent"
            n={`${moneyCorto(corregido.delta)} más de EBITDA en doce meses`}
          />
          <Tile
            k="Quiebres que se cierran"
            v={moneyCorto(corregido.corr.recuperado)}
            s={`${fmt(corregido.corr.recuperadoPzas)} pzas`}
            tono="accent"
            n="Sell-in que hoy no ocurre porque la tienda está en cero"
          />
        </div>
        <p className="note">
          El argumento no es empujar más producto. Es dejar de resurtir a las plazas que ya no
          pueden desplazar y resurtir donde hoy se pierde venta por quiebre.{" "}
          <Link href="/planeacion" style={{ color: "var(--accent-ink)" }}>
            Ver el modelo completo
          </Link>
          .
        </p>
      </div>

      <div className="card">
        <h3>Situaciones visibles en estos datos</h3>
        <p className="sub">
          Cada una es comprobable en la plataforma. No son ejemplos: salen del mismo corte.
        </p>
        <div className="rows">
          {SITUACIONES.slice(0, 6).map((s) => (
            <div className="row" key={s.id}>
              <div className="who" style={{ flex: "1 1 100%" }}>
                <strong>{s.titulo}</strong>
                <span>{s.resumen}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="note">
          Corte {PARAMS.ventana} semanas de promedio · cifras de demostración construidas con la
          estructura real del canal departamental mexicano.
        </p>
      </div>
      <Descarga
        titulo="El resumen en Excel"
        contenido="Tablero con indicadores en piezas y en monto, gráficas, sell-out y sell-in por cadena, modelo y estado, y el corte completo. El umbral es una celda viva."
        armar={() => libroResumen(base)}
      />
    </div>
  );
}

/** Una de las dos listas: la de lo más vendido o la de lo más resurtido. */
function Top10({
  titulo,
  sub,
  datos,
  medida,
  totalPzas,
  totalMonto,
}: {
  titulo: string;
  sub: string;
  datos: Top;
  medida: "out" | "in";
  totalPzas: number;
  totalMonto: number;
}) {
  const mayor = datos.filas[0]?.piezas ?? 1;
  const pzas10 = datos.filas.reduce((a, f) => a + f.piezas, 0);
  const monto10 = datos.filas.reduce((a, f) => a + f.monto, 0);
  return (
    <div className="card">
      <h3>{titulo}</h3>
      <p className="sub">{sub}</p>
      {datos.filas.length === 0 ? (
        <div className="empty">Sin movimiento en el periodo con los filtros actuales.</div>
      ) : (
        <>
          <div className="top10">
            <div className="t10 cab">
              <span />
              <span>Modelo</span>
              <span>{medida === "out" ? "Piezas vendidas" : "Piezas resurtidas"}</span>
              <span>Piezas</span>
              <span>Monto</span>
              <span>% pzas</span>
              <span>{medida === "out" ? "Resurtido" : "Vendido"}</span>
              <span>{medida === "out" ? "Vs año ant." : "Desplazó"}</span>
            </div>
            {datos.filas.map((t, i) => {
              const despl = t.piezas > 0 ? (t.otras / t.piezas) * 100 : 0;
              return (
                <div className="t10" key={t.sku}>
                  <span className="t10-pos">{i + 1}</span>
                  <span className="t10-nom">
                    <strong>{t.nombre}</strong>
                    <span>
                      {t.sku} · {t.coleccion} · {fmt(t.tiendas)} tiendas
                    </span>
                  </span>
                  <span className={`t10-barra ${medida}`}>
                    <span style={{ width: `${(t.piezas / mayor) * 100}%` }} />
                  </span>
                  <span className="t10-pzas num">{fmt(t.piezas)} pzas</span>
                  <span className="t10-val num">{moneyCorto(t.monto)}</span>
                  <span className="t10-part num">{fmt(t.parte, 1)}%</span>
                  <span className="t10-otra num">{fmt(t.otras)} pzas</span>
                  {medida === "out" ? (
                    <span
                      className="t10-var num"
                      style={{
                        color:
                          t.variacion === null
                            ? "var(--ink-3)"
                            : t.variacion >= 0
                              ? "var(--good-ink)"
                              : "var(--crit-ink)",
                      }}
                    >
                      {t.variacion === null
                        ? "s/d"
                        : `${t.variacion >= 0 ? "+" : "−"}${fmt(Math.abs(t.variacion), 1)}%`}
                    </span>
                  ) : (
                    <span
                      className="t10-var num"
                      style={{ color: despl < 80 ? "var(--crit-ink)" : "var(--good-ink)" }}
                    >
                      {fmt(despl, 0)}%
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="t10-tot">
            <span>
              Ítems: <b>{datos.filas.length}</b> de <b>{fmt(datos.modelos)}</b> modelos con movimiento
            </span>
            <span>
              Piezas de los diez: <b>{fmt(pzas10)}</b> de <b>{fmt(totalPzas)}</b>
            </span>
            <span>
              Monto de los diez: <b>{moneyCorto(monto10)}</b> de <b>{moneyCorto(totalMonto)}</b>
            </span>
            <span>
              Concentran el <b>{fmt(totalPzas > 0 ? (pzas10 / totalPzas) * 100 : 0, 1)}%</b> de las piezas
            </span>
          </div>
        </>
      )}
      <p className="note">
        {medida === "out"
          ? "Monto a precio de lista. La columna Resurtido son las piezas de ese modelo que entraron a las cadenas en el mismo periodo."
          : "Monto a precio de venta a la cadena. Desplazó es lo vendido entre lo resurtido: debajo de 80% el modelo se está acumulando en el anaquel."}
      </p>
    </div>
  );
}
