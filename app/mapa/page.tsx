"use client";

import { useMemo, useState } from "react";
import { useBI } from "@/lib/store";
import { Descarga, useBase } from "@/components/descarga";
import { libroMapa } from "@/lib/libros";
import { MapaMexico } from "@/components/mapa";
import { Tile, Chip, Mono, Drawer, Accion, Tabla, type Col } from "@/components/ui";
import { Sparkline } from "@/components/charts";
import {
  CORTE,
  CORTE_ANTERIOR,
  cambioDeCorte,
  comoEnCorteAnterior,
  fmt,
  money,
  moneyCorto,
  porEstado,
  porSucursal,
  type Combo,
  type ResumenEstado,
} from "@/lib/engine";
import { cadenaPorId } from "@/lib/catalog";

type Foco =
  | { tipo: "estado"; id: string }
  | { tipo: "sucursal"; clave: string }
  | null;

type Pestana = "resueltas" | "nuevas" | "vigentes";

/** Una diferencia con su signo, o "sin cambio". */
const dif = (hoy: number, antes: number, f: (n: number) => string) =>
  Math.round(hoy - antes) === 0
    ? "sin cambio"
    : `${hoy > antes ? "+" : "−"}${f(Math.abs(hoy - antes))}`;

export default function Mapa() {
  const { vista, filtro, setEstado } = useBI();
  const base = useBase();
  const [foco, setFoco] = useState<Foco>(null);
  const [tab, setTab] = useState<Pestana>("resueltas");

  /* El mapa de hoy y el de hace una semana, con las mismas reglas y el mismo
     umbral. Lo que cambia entre uno y otro es lo que se resolvió y lo nuevo. */
  const antesCombos = useMemo(() => comoEnCorteAnterior(vista), [vista]);
  const estados = useMemo(() => porEstado(vista, filtro.umbral), [vista, filtro.umbral]);
  const sucursales = useMemo(() => porSucursal(vista, filtro.umbral), [vista, filtro.umbral]);
  const estadosAnt = useMemo(() => porEstado(antesCombos, filtro.umbral), [antesCombos, filtro.umbral]);
  const sucursalesAnt = useMemo(
    () => porSucursal(antesCombos, filtro.umbral),
    [antesCombos, filtro.umbral]
  );
  const cambio = useMemo(() => cambioDeCorte(vista), [vista]);

  const conAlerta = sucursales.filter((s) => s.clase !== "sano");
  const conAlertaAnt = sucursalesAnt.filter((s) => s.clase !== "sano");
  const saturados = estados.filter((e) => e.clase === "saturado");
  const saturadosAnt = estadosAnt.filter((e) => e.clase === "saturado");

  /** Resueltas y nuevas por estado, para la tabla. */
  const porEstadoCambio = useMemo(() => {
    const m = new Map<string, { res: number; nue: number; antes: number; perdidaPzas: number }>();
    const de = (id: string) => {
      if (!m.has(id)) m.set(id, { res: 0, nue: 0, antes: 0, perdidaPzas: 0 });
      return m.get(id)!;
    };
    for (const c of vista) if (c.perdida > 0) de(c.sucursal.estadoId).perdidaPzas += c.so;
    for (const c of cambio.resueltas) de(c.sucursal.estadoId).res++;
    for (const c of cambio.nuevas) de(c.sucursal.estadoId).nue++;
    for (const e of estadosAnt) de(e.estado.id).antes = e.sobreUmbral + e.quiebres;
    return m;
  }, [cambio, estadosAnt, vista]);

  // Combinaciones del foco actual
  const combosFoco = useMemo(() => {
    if (!foco) return [];
    return foco.tipo === "estado"
      ? vista.filter((c) => c.sucursal.estadoId === foco.id)
      : vista.filter((c) => c.sucursal.clave === foco.clave);
  }, [foco, vista]);

  const tituloFoco = useMemo(() => {
    if (!foco) return "";
    if (foco.tipo === "estado")
      return estados.find((e) => e.estado.id === foco.id)?.estado.nombre ?? "";
    return sucursales.find((s) => s.sucursal.clave === foco.clave)?.sucursal.nombre ?? "";
  }, [foco, estados, sucursales]);

  const resumenFoco = useMemo(() => {
    const inv = combosFoco.reduce((a, c) => a + c.inv, 0);
    const so = combosFoco.reduce((a, c) => a + c.so, 0);
    const qui = combosFoco.filter((c) => c.clase === "quiebre");
    const sobre = combosFoco.filter((c) => c.clase === "alto" || c.clase === "saturado");
    const cf = cambioDeCorte(combosFoco);
    return {
      inv,
      invAnt: combosFoco.reduce((a, c) => a + c.invAnt, 0),
      invMonto: combosFoco.reduce((a, c) => a + c.inv * c.costo, 0),
      so,
      cob: so > 0.05 ? inv / so : inv > 0 ? 99 : 0,
      exc: combosFoco.reduce((a, c) => a + c.exc, 0),
      capital: combosFoco.reduce((a, c) => a + c.capital, 0),
      perdida: qui.reduce((a, c) => a + c.perdida, 0),
      perdidaPzas: qui.reduce((a, c) => a + (c.perdida > 0 ? c.so : 0), 0),
      qui,
      sobre,
      cf,
      pdv: new Set(combosFoco.map((c) => c.sucursal.clave)).size,
    };
  }, [combosFoco]);

  const colsEstado: Col<ResumenEstado>[] = [
    {
      t: "Estado",
      cls: "name",
      f: (e) => (
        <>
          <strong>{e.estado.nombre}</strong>
          {e.sinReporte > 0 ? <span> · {e.sinReporte} sin reporte</span> : null}
        </>
      ),
    },
    { t: "Sucursales", n: true, f: (e) => fmt(e.sucursales) },
    { t: "Piezas en canal", n: true, f: (e) => fmt(e.inv) },
    { t: "Cobertura", n: true, f: (e) => (e.cob > 50 ? "∞" : fmt(e.cob, 1)) },
    { t: "Sobre umbral (pzas)", n: true, f: (e) => fmt(e.exc) },
    { t: "Capital parado", n: true, f: (e) => moneyCorto(e.capital) },
    { t: "Quiebres", n: true, f: (e) => fmt(e.quiebres) },
    { t: "Venta perdida (pzas/sem)", n: true, f: (e) => fmt(porEstadoCambio.get(e.estado.id)?.perdidaPzas ?? 0) },
    { t: "Venta perdida $/sem", n: true, f: (e) => moneyCorto(e.perdida) },
    { t: "Alertas antes", n: true, f: (e) => fmt(porEstadoCambio.get(e.estado.id)?.antes ?? 0) },
    { t: "Alertas hoy", n: true, f: (e) => <strong>{fmt(e.sobreUmbral + e.quiebres)}</strong> },
    {
      t: "Resueltas",
      n: true,
      f: (e) => {
        const v = porEstadoCambio.get(e.estado.id)?.res ?? 0;
        return <span style={{ color: v ? "var(--good-ink)" : "var(--ink-3)" }}>{fmt(v)}</span>;
      },
    },
    {
      t: "Nuevas",
      n: true,
      f: (e) => {
        const v = porEstadoCambio.get(e.estado.id)?.nue ?? 0;
        return <span style={{ color: v ? "var(--crit-ink)" : "var(--ink-3)" }}>{fmt(v)}</span>;
      },
    },
    { t: "Impacto", n: true, f: (e) => <strong>{moneyCorto(e.impacto)}</strong> },
    { t: "Situación", f: (e) => <Chip clase={e.clase} /> },
  ];

  const sucursalYModelo: Col<Combo>[] = [
    {
      t: "Sucursal",
      cls: "name",
      f: (c) => (
        <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
          <Mono cadenaId={c.sucursal.cadenaId} />
          <span>
            <strong>{c.sucursal.plaza}</strong>
            <br />
            <span>{cadenaPorId(c.sucursal.cadenaId).nombre}</span>
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
  ];

  const colsCombo: Col<Combo>[] = [
    ...sucursalYModelo,
    { t: "12 sem", f: (c) => <Sparkline valores={c.hist} /> },
    { t: "Exist.", n: true, f: (c) => fmt(c.inv) },
    { t: "Sem.", n: true, f: (c) => (c.cob > 50 ? "∞" : fmt(c.cob, 1)) },
    { t: "Sobre umbral", n: true, f: (c) => fmt(c.exc) },
    { t: "Impacto", n: true, f: (c) => moneyCorto(c.impacto) },
    { t: "Antes", f: (c) => <Chip clase={c.claseAnt} /> },
    { t: "Hoy", f: (c) => <Chip clase={c.clase} /> },
  ];

  const colsCambio: Col<Combo>[] = [
    ...sucursalYModelo,
    { t: `Antes · S${CORTE_ANTERIOR.semana}`, f: (c) => <Chip clase={c.claseAnt} /> },
    { t: `Hoy · S${CORTE.semana}`, f: (c) => <Chip clase={c.clase} /> },
    { t: "Exist. antes", n: true, f: (c) => fmt(c.invAnt) },
    { t: "Exist. hoy", n: true, f: (c) => <strong>{fmt(c.inv)}</strong> },
    { t: "Sobre umbral antes", n: true, f: (c) => fmt(c.excAnt) },
    { t: "Sobre umbral hoy", n: true, f: (c) => <strong>{fmt(c.exc)}</strong> },
    {
      t: "Monto antes",
      n: true,
      f: (c) => moneyCorto(c.capitalAnt + c.perdidaAnt * 4),
    },
    { t: "Monto hoy", n: true, f: (c) => <strong>{moneyCorto(c.impacto)}</strong> },
  ];

  const unaSucursal = resumenFoco.pdv === 1;
  const lista = cambio[tab];
  const sumaTab = {
    pzasAntes: lista.reduce((a, c) => a + c.excAnt, 0),
    pzasHoy: lista.reduce((a, c) => a + c.exc, 0),
    montoAntes: lista.reduce((a, c) => a + c.capitalAnt + c.perdidaAnt * 4, 0),
    montoHoy: lista.reduce((a, c) => a + c.impacto, 0),
  };

  const leyenda = (
    <div className="legend">
      <span>
        <i style={{ background: "var(--good)" }} />
        En rango
      </span>
      <span>
        <i style={{ background: "var(--warn)" }} />
        Con quiebres
      </span>
      <span>
        <i style={{ background: "var(--serious)" }} />
        Cobertura alta
      </span>
      <span>
        <i style={{ background: "var(--crit)" }} />
        Saturado
      </span>
      <span style={{ marginLeft: "auto", color: "var(--ink-3)" }}>
        La intensidad del relleno es proporcional al impacto en pesos del estado.
      </span>
    </div>
  );

  return (
    <div className="view">
      <div className="tiles">
        <Tile
          k="Alertas resueltas"
          v={fmt(cambio.resueltas.length)}
          s={`${fmt(cambio.resueltas.reduce((a, c) => a + c.excAnt, 0))} pzas`}
          tono={cambio.resueltas.length ? "ok" : undefined}
          n={`${moneyCorto(cambio.resueltas.reduce((a, c) => a + c.capitalAnt + c.perdidaAnt * 4, 0))} que ya no están en alerta`}
        />
        <Tile
          k="Alertas nuevas"
          v={fmt(cambio.nuevas.length)}
          s={`${fmt(cambio.nuevas.reduce((a, c) => a + c.exc + (c.clase === "quiebre" ? c.sug : 0), 0))} pzas`}
          tono={cambio.nuevas.length ? "flag" : undefined}
          n={`${moneyCorto(
            cambio.nuevas.reduce((a, c) => a + (c.clase === "quiebre" ? c.sug * c.costo : c.capital), 0)
          )} entre resurtido pendiente y piezas de más. No estaban en el corte anterior`}
        />
        <Tile
          k="Alertas del corte actual"
          v={fmt(cambio.hoy.alertas)}
          s={`antes ${fmt(cambio.antes.alertas)}`}
          n={`${fmt(cambio.vigentes.length)} siguen en alerta · ${fmt(conAlerta.length)} sucursales hoy, ${fmt(conAlertaAnt.length)} antes`}
        />
        <Tile
          k="Capital inmovilizado"
          v={moneyCorto(cambio.hoy.capital)}
          s={`${fmt(cambio.hoy.excedente)} pzas`}
          tono="flag"
          n={`${dif(cambio.hoy.excedente, cambio.antes.excedente, (n) => fmt(n) + " pzas")} y ${dif(cambio.hoy.capital, cambio.antes.capital, moneyCorto)} contra S${CORTE_ANTERIOR.semana}`}
        />
        <Tile
          k="Venta perdida semanal"
          v={moneyCorto(cambio.hoy.perdida)}
          s={`${fmt(cambio.hoy.perdidaPzas)} pzas`}
          tono="flag"
          n={`${dif(cambio.hoy.perdidaPzas, cambio.antes.perdidaPzas, (n) => fmt(n) + " pzas")} y ${dif(cambio.hoy.perdida, cambio.antes.perdida, moneyCorto)} contra S${CORTE_ANTERIOR.semana}`}
        />
        <Tile
          k="Estados saturados"
          v={fmt(saturados.length)}
          s={`antes ${fmt(saturadosAnt.length)}`}
          tono={saturados.length ? "flag" : undefined}
          n={`${estados.filter((e) => e.clase === "quiebre").length} en quiebre · ${estados.filter((e) => e.clase === "sano").length} en rango`}
        />
      </div>

      <div className="card">
        <h3>Corte anterior contra corte actual</h3>
        <p className="sub">
          El mismo mapa en dos semanas, con las mismas reglas y el mismo umbral. El color del estado
          resume su situación y cada bandera es una sucursal con alerta. Clic en un estado o en una
          bandera para ver su detalle.
        </p>
        <div className="mapas-2">
          <div className="mapa-corte">
            <div className="mapa-tit">
              <b>Corte anterior</b> {CORTE_ANTERIOR.etiqueta}
              <span>
                {fmt(cambio.antes.alertas)} alertas · {fmt(cambio.antes.excedente)} pzas sobre umbral ·{" "}
                {moneyCorto(cambio.antes.capital)}
              </span>
            </div>
            <MapaMexico
              estados={estadosAnt}
              sucursales={sucursalesAnt}
              maxBanderas={16}
              onEstado={(id) => setFoco({ tipo: "estado", id })}
              onSucursal={(clave) => setFoco({ tipo: "sucursal", clave })}
            />
          </div>
          <div className="mapa-corte actual">
            <div className="mapa-tit">
              <b>Corte actual</b> {CORTE.etiqueta}
              <span>
                {fmt(cambio.hoy.alertas)} alertas · {fmt(cambio.hoy.excedente)} pzas sobre umbral ·{" "}
                {moneyCorto(cambio.hoy.capital)}
              </span>
            </div>
            <MapaMexico
              estados={estados}
              sucursales={sucursales}
              maxBanderas={16}
              onEstado={(id) => setFoco({ tipo: "estado", id })}
              onSucursal={(clave) => setFoco({ tipo: "sucursal", clave })}
            />
          </div>
        </div>
        {leyenda}
      </div>

      <div className="card">
        <h3>Qué cambió entre los dos cortes</h3>
        <p className="sub">
          Cada combinación de tienda y modelo, como estaba en {CORTE_ANTERIOR.etiqueta} y como está en{" "}
          {CORTE.etiqueta}. Una alerta se resuelve cuando la combinación regresa al rango.
        </p>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", margin: "10px 0" }}>
          {(
            [
              ["resueltas", "Resueltas"],
              ["nuevas", "Nuevas"],
              ["vigentes", "Siguen en alerta"],
            ] as [Pestana, string][]
          ).map(([k, t]) => (
            <button
              key={k}
              className={`btn ${tab === k ? "on" : "ghost"} sm`}
              onClick={() => setTab(k)}
            >
              {t}
              <span className="cuenta-tab">{fmt(cambio[k].length)}</span>
            </button>
          ))}
        </div>
        <div className="tablewrap">
          <Tabla cols={colsCambio} filas={lista} limite={60} />
        </div>
        <div className="tfoot">
          <span>
            {fmt(lista.length)} combinaciones · sobre umbral: {fmt(sumaTab.pzasAntes)} pzas antes,{" "}
            {fmt(sumaTab.pzasHoy)} pzas hoy · monto: {moneyCorto(sumaTab.montoAntes)} antes,{" "}
            {moneyCorto(sumaTab.montoHoy)} hoy
          </span>
        </div>
      </div>

      <div className="card">
        <h3>Detalle por estado</h3>
        <p className="sub">
          Piezas y monto de cada estado en el corte actual, con sus alertas del corte anterior.
          Ordenado por impacto: capital parado más cuatro semanas de venta perdida.
        </p>
        <div className="tablewrap">
          <Tabla
            cols={colsEstado}
            filas={estados}
            onFila={(e) => setFoco({ tipo: "estado", id: e.estado.id })}
          />
        </div>
        <div className="tfoot">
          <span>
            {fmt(estados.length)} estados con presencia · clic en un renglón para ver su detalle
          </span>
        </div>
      </div>

      <Drawer
        abierto={!!foco}
        onCerrar={() => setFoco(null)}
        eyebrow={
          foco?.tipo === "estado"
            ? `Estado · corte ${CORTE.etiqueta} contra ${CORTE_ANTERIOR.etiqueta}`
            : `Sucursal · corte ${CORTE.etiqueta} contra ${CORTE_ANTERIOR.etiqueta}`
        }
        titulo={tituloFoco}
        pie={
          <>
            {foco?.tipo === "estado" ? (
              <button
                className="btn ghost sm"
                onClick={() => {
                  setEstado(foco.id);
                  setFoco(null);
                }}
              >
                Filtrar toda la plataforma por este estado
              </button>
            ) : null}
            <div className="spacer" />
            <button className="btn ghost sm" onClick={() => setFoco(null)}>
              Cerrar
            </button>
          </>
        }
      >
        <div className="mini">
          <div>
            <div className="k">Piezas en canal</div>
            <div className="v">
              {fmt(resumenFoco.inv)}
              <small> pzas</small>
            </div>
            <div className="m">{moneyCorto(resumenFoco.invMonto)} · antes {fmt(resumenFoco.invAnt)}</div>
          </div>
          <div>
            <div className="k">Cobertura</div>
            <div className="v">
              {resumenFoco.cob > 50 ? "∞" : fmt(resumenFoco.cob, 1)}
              <small> sem</small>
            </div>
            <div className="m">umbral de {filtro.umbral}</div>
          </div>
          <div>
            <div className="k">Sobre umbral</div>
            <div className="v">
              {fmt(resumenFoco.exc)}
              <small> pzas</small>
            </div>
            <div className="m">
              {moneyCorto(resumenFoco.capital)} · antes {fmt(resumenFoco.cf.antes.excedente)}
            </div>
          </div>
          <div>
            <div className="k">Venta perdida</div>
            <div className="v">
              {moneyCorto(resumenFoco.perdida)}
              <small> /sem</small>
            </div>
            <div className="m">
              {fmt(resumenFoco.perdidaPzas)} pzas · antes {moneyCorto(resumenFoco.cf.antes.perdida)}
            </div>
          </div>
        </div>

        <div className="cambio-foco">
          <span className="res">
            <b>{fmt(resumenFoco.cf.resueltas.length)}</b>{" "}
            {resumenFoco.cf.resueltas.length === 1 ? "resuelta" : "resueltas"}
          </span>
          <span className="nue">
            <b>{fmt(resumenFoco.cf.nuevas.length)}</b>{" "}
            {resumenFoco.cf.nuevas.length === 1 ? "nueva" : "nuevas"}
          </span>
          <span>
            <b>{fmt(resumenFoco.cf.vigentes.length)}</b>{" "}
            {resumenFoco.cf.vigentes.length === 1 ? "sigue en alerta" : "siguen en alerta"}
          </span>
          <span className="contra">contra el corte {CORTE_ANTERIOR.etiqueta}</span>
        </div>

        <p style={{ fontSize: 13, lineHeight: 1.55, margin: 0 }}>
          <strong>{tituloFoco}</strong> concentra <strong>{fmt(resumenFoco.inv)} piezas</strong> en{" "}
          {resumenFoco.pdv} {resumenFoco.pdv === 1 ? "sucursal" : "sucursales"}, equivalentes a{" "}
          <strong>
            {resumenFoco.cob > 50 ? "inventario sin desplazamiento" : `${fmt(resumenFoco.cob, 1)} semanas`}
          </strong>{" "}
          contra un umbral de {filtro.umbral}.
          {resumenFoco.exc > 0 ? (
            <>
              {" "}
              Hay <strong>{fmt(resumenFoco.exc)} piezas por encima del umbral</strong>,{" "}
              {money(resumenFoco.capital)} de capital parado, a precio de venta a la cadena.
            </>
          ) : null}
          {resumenFoco.qui.length ? (
            <>
              {" "}
              Al mismo tiempo{" "}
              <strong>
                {resumenFoco.qui.length}{" "}
                {resumenFoco.qui.length === 1 ? "combinación está" : "combinaciones están"} en quiebre
              </strong>
              {resumenFoco.perdida > 0
                ? `: ${fmt(resumenFoco.perdidaPzas)} piezas y ${money(resumenFoco.perdida)} de venta perdida por semana.`
                : ": les quedan menos de 2.5 semanas de inventario y todavía no pierden venta."}
            </>
          ) : null}
          {resumenFoco.exc > 0 && resumenFoco.qui.length ? (
            <> No es un problema de volumen, es de a dónde se resurte.</>
          ) : null}
        </p>

        {resumenFoco.sobre.length ? (
          <Accion
            tipo="no"
            titulo="No resurtir"
            nota={`${resumenFoco.sobre.length} combinaciones sobre el umbral`}
          >
            {resumenFoco.sobre
              .slice()
              .sort((a, b) => b.capital - a.capital)
              .slice(0, 6)
              .map((c) => (
                <li key={c.id}>
                  {unaSucursal ? (
                    <b>{c.modelo.sku}</b>
                  ) : (
                    <>
                      <b>{c.sucursal.plaza}</b> · {c.modelo.sku}
                    </>
                  )}{" "}
                  <span style={{ color: "var(--ink-3)" }}>({c.coleccion.nombre})</span>{" "}
                  — <em>{fmt(c.inv)} pzas</em>, {c.cob > 50 ? "∞" : fmt(c.cob, 1)} semanas,{" "}
                  <em>{fmt(c.exc)} pzas</em> por encima del umbral ({moneyCorto(c.capital)})
                  {c.tr ? ` · ojo: ${c.tr} pzas ya van en tránsito` : ""}
                </li>
              ))}
          </Accion>
        ) : null}

        {resumenFoco.qui.length ? (
          <Accion
            tipo="re"
            titulo="Resurtir"
            nota={`${resumenFoco.qui.length} combinaciones en quiebre con desplazamiento`}
          >
            {resumenFoco.qui
              .slice()
              .sort((a, b) => b.perdida - a.perdida)
              .slice(0, 6)
              .map((c) => (
                <li key={c.id}>
                  {unaSucursal ? (
                    <b>{c.modelo.sku}</b>
                  ) : (
                    <>
                      <b>{c.sucursal.plaza}</b> · {c.modelo.sku}
                    </>
                  )}{" "}
                  <span style={{ color: "var(--ink-3)" }}>({c.coleccion.nombre})</span>{" "}
                  — sugerido <em>{fmt(c.sug)} pzas</em> ({moneyCorto(c.sug * c.costo)} de sell-in), venta
                  perdida de <em>{fmt(c.so, 1)} pzas</em> y <em>{money(c.perdida)}</em> por semana
                  {c.tr ? ` · ${c.tr} pzas en tránsito, verifica antes de duplicar` : ""}
                </li>
              ))}
          </Accion>
        ) : null}

        {!resumenFoco.sobre.length && !resumenFoco.qui.length ? (
          <Accion tipo="ok" titulo="Sin acción pendiente" nota="dentro de rango">
            <li>
              Ninguna combinación de este alcance rebasa el umbral ni está en quiebre con
              desplazamiento. Mantener el ritmo de resurtido actual.
            </li>
          </Accion>
        ) : null}

        <div>
          <h3 style={{ fontSize: 13, fontWeight: 600, margin: "4px 0 2px" }}>
            Combinaciones detrás de esta alerta
          </h3>
          <p className="sub" style={{ marginBottom: 0 }}>
            Ordenadas por impacto en pesos, con su situación en los dos cortes.
          </p>
          <div className="tablewrap" style={{ maxHeight: "none" }}>
            <Tabla
              cols={colsCombo}
              filas={combosFoco.slice().sort((a, b) => b.impacto - a.impacto)}
              limite={40}
            />
          </div>
        </div>
      </Drawer>
      <Descarga
        titulo="El mapa en Excel"
        contenido="Tablero con indicadores en piezas y en monto, los estados y las sucursales clasificados con fórmula, la comparación contra el corte anterior y el corte completo. El umbral y el descuento de liquidación son celdas vivas."
        armar={() => libroMapa(base)}
      />
    </div>
  );
}
