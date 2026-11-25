"use client";

/**
 * Reportes: la tabla dinámica.
 *
 * La configuración vive en un panel lateral, como en cualquier herramienta
 * seria de análisis, y no repartida en botones por toda la pantalla. El
 * centro es la tabla, que es lo que la gente vino a ver; el panel se usa dos
 * minutos al principio y después estorba, así que se puede cerrar.
 *
 * Los niveles y las medidas se eligen con casillas en listas agrupadas. El
 * orden en que se marcan es el orden en que salen, y cada uno aparece como
 * una pastilla en su casillero, que se puede quitar o mover a columnas.
 */

import { useMemo, useState } from "react";
import { useBI } from "@/lib/store";
import { CORTE, etiquetaPeriodo, fmt } from "@/lib/engine";
import { Descarga, useBase } from "@/components/descarga";
import { descargar } from "@/lib/excel";
import { libroReporte, libroSimulador } from "@/lib/libros";
import {
  DIMENSIONES,
  MEDIDAS,
  pivotar,
  valor,
  formatear,
  medidaPorId,
  dimensionPorId,
  aCSV,
  aExcel,
  type Config,
  type DimensionId,
  type MedidaId,
  type Acumulado,
} from "@/lib/pivot";

type Plantilla = { id: string; nombre: string; cfg: Config };

const PLANTILLAS: Plantilla[] = [
  {
    id: "ejecutivo",
    nombre: "Resumen ejecutivo",
    cfg: {
      filas: ["cadena"],
      valores: ["outPzas", "outMXN", "inPzas", "inMXN", "piezas", "cobertura", "excedente", "capital"],
    },
  },
  {
    id: "comparativo",
    nombre: "Comparativo anual",
    cfg: {
      filas: ["cadena", "coleccion"],
      valores: ["soVentana", "ventaMXN", "ventaAntMXN", "varMXN"],
    },
  },
  {
    id: "reposicion",
    nombre: "Reposición y quiebres",
    cfg: {
      filas: ["cadena", "sucursal"],
      valores: ["piezas", "soSemana", "cobertura", "sugerido", "perdidaPzas", "perdida"],
    },
  },
  {
    id: "mix",
    nombre: "Mix por marca",
    cfg: { filas: ["marca", "genero"], columna: "cadena", valores: ["outPzas", "outMXN"] },
  },
];

export default function Reportes() {
  const { vista, periodo } = useBI();
  const base = useBase();
  const [cfg, setCfg] = useState<Config>(PLANTILLAS[0].cfg);
  const [plantilla, setPlantilla] = useState("ejecutivo");
  const [cerrados, setCerrados] = useState<Set<string>>(new Set());
  const [limite, setLimite] = useState(120);
  const [panel, setPanel] = useState(true);
  const [busca, setBusca] = useState("");

  const r = useMemo(() => pivotar(vista, cfg, periodo), [vista, cfg, periodo]);
  const medidas = cfg.valores.map(medidaPorId);
  const dimsFila = cfg.filas.slice(0, 3).map(dimensionPorId);

  const visibles = r.filas.filter((f) => {
    const partes = f.clave.split("|");
    for (let i = 1; i < partes.length; i++) {
      if (cerrados.has(partes.slice(0, i).join("|"))) return false;
    }
    return true;
  });

  const tocar = (c: Config) => {
    setCfg(c);
    setPlantilla("");
    setCerrados(new Set());
  };

  const alternarDim = (id: DimensionId) => {
    if (cfg.columna === id) return tocar({ ...cfg, columna: undefined });
    if (cfg.filas.includes(id))
      return tocar({ ...cfg, filas: cfg.filas.filter((f) => f !== id) });
    if (cfg.filas.length >= 3) return;
    tocar({ ...cfg, filas: [...cfg.filas, id] });
  };

  const aColumnas = (id: DimensionId) =>
    tocar({ ...cfg, filas: cfg.filas.filter((f) => f !== id), columna: id });

  const aFilas = (id: DimensionId) => {
    if (cfg.filas.length >= 3) return;
    tocar({ ...cfg, columna: undefined, filas: [...cfg.filas, id] });
  };

  const alternarMedida = (id: MedidaId) => {
    const hay = cfg.valores.includes(id);
    if (hay && cfg.valores.length === 1) return;
    tocar({
      ...cfg,
      valores: hay ? cfg.valores.filter((v) => v !== id) : [...cfg.valores, id],
    });
  };

  const bajarCSV = () => {
    const csv = aCSV(r, cfg);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `MarkaLab_BI_${CORTE.etiqueta}_${plantilla || "reporte"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const celda = (a: Acumulado | undefined, mi: number) => {
    const m = medidas[mi];
    if (!a) return <span style={{ color: "var(--ink-3)" }}>—</span>;
    const v = valor(m, a);
    if (m.formato === "porcentaje") {
      const tono = v > 0 ? "var(--good-ink)" : v < 0 ? "var(--crit-ink)" : "var(--ink-3)";
      return <span style={{ color: tono, fontWeight: 600 }}>{formatear(m, v)}</span>;
    }
    return formatear(m, v);
  };

  /* El buscador del panel filtra las dos listas a la vez. */
  const q = busca.trim().toLowerCase();
  const coincide = (t: string) => !q || t.toLowerCase().includes(q);
  const gruposDim = ["Tienda", "Producto"] as const;
  const gruposMed = ["Periodo", "Venta", "Inventario", "Alerta", "Conteo"] as const;

  return (
    <div className={`reportes ${panel ? "" : "sinpanel"}`}>
      <div className="rep-col">
      <div className="card rep-tabla">
        <div className="rep-top">
          <div className="rep-tabs" role="tablist" aria-label="Plantillas">
            {PLANTILLAS.map((p) => (
              <button
                key={p.id}
                role="tab"
                aria-selected={plantilla === p.id}
                className={plantilla === p.id ? "on" : ""}
                onClick={() => {
                  setPlantilla(p.id);
                  setCfg(p.cfg);
                  setCerrados(new Set());
                }}
              >
                {p.nombre}
              </button>
            ))}
          </div>
          <div className="rep-acc">
            <span className="note" style={{ margin: 0 }}>
              {fmt(r.filas.length)} renglones · corte {CORTE.etiqueta} · periodo {etiquetaPeriodo(periodo)}
            </span>
            <button
              className={`btn ghost sm ${panel ? "on" : ""}`}
              onClick={() => setPanel(!panel)}
              aria-expanded={panel}
            >
              Campos
            </button>
          </div>
        </div>

        <div className="tablewrap">
          <table className="pivote">
            <thead>
              {r.columnas.length > 1 ? (
                <tr>
                  <th />
                  {r.columnas.map((c) => (
                    <th key={c.clave} colSpan={medidas.length} className="grupo">
                      {c.etiqueta}
                    </th>
                  ))}
                </tr>
              ) : null}
              <tr>
                <th className="name">
                  {dimsFila.map((d) => d.nombre).join(" › ") || "Alcance"}
                </th>
                {r.columnas.map((c) =>
                  medidas.map((m) => (
                    <th key={`${c.clave}-${m.id}`} className="num">
                      {m.nombre}
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {visibles.slice(0, limite).map((f) => (
                <tr key={f.clave} className={`n${f.nivel}`}>
                  <td className="name" style={{ paddingLeft: 10 + f.nivel * 18 }}>
                    {f.tieneHijos ? (
                      <button
                        className="plegar"
                        onClick={() => {
                          const n = new Set(cerrados);
                          n.has(f.clave) ? n.delete(f.clave) : n.add(f.clave);
                          setCerrados(n);
                        }}
                        aria-label={cerrados.has(f.clave) ? "Abrir" : "Cerrar"}
                      >
                        {cerrados.has(f.clave) ? "+" : "−"}
                      </button>
                    ) : (
                      <span className="plegar vacio" />
                    )}
                    {f.ruta[f.nivel]}
                  </td>
                  {r.columnas.map((c) =>
                    medidas.map((m, mi) => (
                      <td key={`${c.clave}-${m.id}`} className="num">
                        {celda(f.celdas.get(c.clave), mi)}
                      </td>
                    ))
                  )}
                </tr>
              ))}
              <tr className="gran">
                <td className="name">Gran total</td>
                {r.columnas.map((c) =>
                  medidas.map((m, mi) => (
                    <td key={`t-${c.clave}-${m.id}`} className="num">
                      {celda(r.total.get(c.clave), mi)}
                    </td>
                  ))
                )}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="tfoot">
          <span>
            Mostrando {fmt(Math.min(limite, visibles.length))} de {fmt(visibles.length)}{" "}
            renglones
            {visibles.length > limite ? (
              <>
                {" · "}
                <button className="btn ghost sm" onClick={() => setLimite(limite + 300)}>
                  Mostrar más
                </button>
              </>
            ) : null}
          </span>
          <span>
            La cobertura no se promedia: se recalcula como existencia del grupo entre
            desplazamiento del grupo.
          </span>
        </div>
      </div>
      <Descarga
        titulo="Este reporte en Excel"
        contenido="La tabla tal como está en pantalla, con sus indicadores y su gráfica. El simulador trae el corte completo con palancas sobre el sell-in: crecimiento, precio y umbral."
        armar={() => libroReporte(base, r, cfg, plantilla)}
        extra={
          <>
            <button className="btn ghost" onClick={bajarCSV} title="Datos crudos, sin formato ni gráficas">
              CSV
            </button>
            <button
              className="btn ghost"
              onClick={() => descargar(libroSimulador(base)).catch(() => alert("No se pudo generar el Excel."))}
            >
              Simulador del corte
            </button>
          </>
        }
      />
      </div>

      {panel ? (
        <aside className="card rep-panel" aria-label="Campos del reporte">
          <div className="pan-cfg">
            <div className="pan-well">
              <span className="pan-et">Filas</span>
              {cfg.filas.length ? (
                cfg.filas.map((id) => {
                  const d = dimensionPorId(id);
                  return (
                    <span className="pastilla" key={id}>
                      {d.nombre}
                      <button
                        className="mover"
                        onClick={() => aColumnas(id)}
                        title="Mover a columnas"
                      >
                        col
                      </button>
                      <button onClick={() => alternarDim(id)} title="Quitar">
                        ×
                      </button>
                    </span>
                  );
                })
              ) : (
                <span className="pan-vacio">Sin agrupar</span>
              )}
            </div>

            <div className="pan-well">
              <span className="pan-et">Columnas</span>
              {cfg.columna ? (
                <span className="pastilla">
                  {dimensionPorId(cfg.columna).nombre}
                  <button
                    className="mover"
                    onClick={() => aFilas(cfg.columna!)}
                    title="Mover a filas"
                  >
                    fila
                  </button>
                  <button
                    onClick={() => tocar({ ...cfg, columna: undefined })}
                    title="Quitar"
                  >
                    ×
                  </button>
                </span>
              ) : (
                <span className="pan-vacio">Ninguna</span>
              )}
            </div>

            <div className="pan-well">
              <span className="pan-et">Valores</span>
              {cfg.valores.map((id) => (
                <span className="pastilla med" key={id}>
                  {medidaPorId(id).nombre}
                  <button onClick={() => alternarMedida(id)} title="Quitar">
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          <input
            className="pan-buscar"
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar un campo"
            aria-label="Buscar un campo"
          />

          <div className="pan-lista">
            <div className="pan-tit">Niveles</div>
            {gruposDim.map((g) => {
              const items = DIMENSIONES.filter((d) => d.grupo === g && coincide(d.nombre));
              if (!items.length) return null;
              return (
                <div key={g}>
                  <div className="pan-sub">{g}</div>
                  {items.map((d) => {
                    const enFilas = cfg.filas.includes(d.id);
                    const enCols = cfg.columna === d.id;
                    const tope = !enFilas && !enCols && cfg.filas.length >= 3;
                    return (
                      <label
                        className={`pan-fila ${tope ? "tope" : ""}`}
                        key={d.id}
                        title={tope ? "Las filas admiten hasta tres niveles" : undefined}
                      >
                        <input
                          type="checkbox"
                          checked={enFilas || enCols}
                          disabled={tope}
                          onChange={() => alternarDim(d.id)}
                        />
                        <span>{d.nombre}</span>
                        {enCols ? <em>columna</em> : null}
                      </label>
                    );
                  })}
                </div>
              );
            })}

            <div className="pan-tit" style={{ marginTop: 14 }}>
              Métricas
            </div>
            {gruposMed.map((g) => {
              const items = MEDIDAS.filter((m) => m.grupo === g && coincide(m.nombre));
              if (!items.length) return null;
              return (
                <div key={g}>
                  <div className="pan-sub">{g}</div>
                  {items.map((m) => (
                    <label className="pan-fila" key={m.id}>
                      <input
                        type="checkbox"
                        checked={cfg.valores.includes(m.id)}
                        onChange={() => alternarMedida(m.id)}
                      />
                      <span>{m.nombre}</span>
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
        </aside>
      ) : null}
    </div>
  );
}
