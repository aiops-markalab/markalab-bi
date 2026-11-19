"use client";

/**
 * Reportes: la tabla dinámica.
 *
 * Un tablero contesta las preguntas que alguien previó. Esta pantalla
 * contesta la que al director se le ocurre en la junta, que casi nunca es la
 * misma. Se eligen los niveles por los que cortar, la dimensión que abre
 * columnas y las medidas a mostrar, y la tabla se arma sola.
 *
 * Las plantillas de arriba son atajos: dejan la configuración puesta para las
 * cuatro preguntas que el canal departamental hace siempre.
 */

import { useMemo, useState } from "react";
import { useBI } from "@/lib/store";
import { CORTE, fmt } from "@/lib/engine";
import {
  DIMENSIONES,
  MEDIDAS,
  pivotar,
  valor,
  formatear,
  medidaPorId,
  dimensionPorId,
  aCSV,
  type Config,
  type DimensionId,
  type MedidaId,
  type Acumulado,
} from "@/lib/pivot";

type Plantilla = {
  id: string;
  nombre: string;
  nota: string;
  cfg: Config;
};

const PLANTILLAS: Plantilla[] = [
  {
    id: "ejecutivo",
    nombre: "Resumen ejecutivo",
    nota: "Qué vendió cada cadena y cuánto inventario sostiene",
    cfg: {
      filas: ["cadena"],
      valores: ["soVentana", "ventaMXN", "piezas", "cobertura", "capital"],
    },
  },
  {
    id: "comparativo",
    nombre: "Comparativo anual",
    nota: "Este corte contra el mismo del año pasado",
    cfg: {
      filas: ["cadena", "coleccion"],
      valores: ["ventaMXN", "ventaAntMXN", "varMXN", "soVentana"],
    },
  },
  {
    id: "reposicion",
    nombre: "Reposición y quiebres",
    nota: "Dónde falta y dónde sobra, por tienda",
    cfg: {
      filas: ["cadena", "sucursal"],
      valores: ["piezas", "soSemana", "cobertura", "sugerido", "perdida"],
    },
  },
  {
    id: "mix",
    nombre: "Mix por marca y género",
    nota: "De qué se compone la venta, abierta por cadena",
    cfg: {
      filas: ["marca", "genero"],
      columna: "cadena",
      valores: ["ventaMXN"],
    },
  },
];

export default function Reportes() {
  const { vista, filtro } = useBI();
  const [cfg, setCfg] = useState<Config>(PLANTILLAS[0].cfg);
  const [plantilla, setPlantilla] = useState("ejecutivo");
  const [cerrados, setCerrados] = useState<Set<string>>(new Set());
  const [limite, setLimite] = useState(120);

  const r = useMemo(() => pivotar(vista, cfg), [vista, cfg]);
  const medidas = cfg.valores.map(medidaPorId);
  const dimsFila = cfg.filas.slice(0, 3).map(dimensionPorId);

  /* Una fila se esconde si alguno de sus padres está plegado. */
  const visibles = r.filas.filter((f) => {
    const partes = f.clave.split("|");
    for (let i = 1; i < partes.length; i++) {
      if (cerrados.has(partes.slice(0, i).join("|"))) return false;
    }
    return true;
  });

  const aplicar = (p: Plantilla) => {
    setPlantilla(p.id);
    setCfg(p.cfg);
    setCerrados(new Set());
  };

  const cambiarFila = (i: number, v: string) => {
    const nuevas = [...cfg.filas];
    if (v === "") nuevas.splice(i, 1);
    else nuevas[i] = v as DimensionId;
    setCfg({ ...cfg, filas: nuevas });
    setPlantilla("");
    setCerrados(new Set());
  };

  const alternarMedida = (id: MedidaId) => {
    const hay = cfg.valores.includes(id);
    if (hay && cfg.valores.length === 1) return;
    setCfg({
      ...cfg,
      valores: hay ? cfg.valores.filter((v) => v !== id) : [...cfg.valores, id],
    });
    setPlantilla("");
  };

  const descargar = () => {
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

  return (
    <div className="view">
      <div className="card">
        <h3>Plantillas</h3>
        <p className="sub">
          Las cuatro preguntas que el canal departamental hace siempre, con la
          configuración ya puesta. Desde cualquiera se puede seguir moviendo.
        </p>
        <div className="plantillas">
          {PLANTILLAS.map((p) => (
            <button
              key={p.id}
              className={`plantilla ${plantilla === p.id ? "on" : ""}`}
              onClick={() => aplicar(p)}
            >
              <strong>{p.nombre}</strong>
              <span>{p.nota}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Campos</h3>
        <p className="sub">
          Las filas se anidan hasta tres niveles. La columna abre una dimensión a lo
          ancho. Los valores son lo que se suma en cada celda.
        </p>

        <div className="campos">
          <div>
            <div className="campos-tit">Filas</div>
            {[0, 1, 2].map((i) => (
              <label className="sel" key={i} style={{ marginBottom: 6 }}>
                <span>{["Primer nivel", "Segundo nivel", "Tercer nivel"][i]}</span>
                <select value={cfg.filas[i] ?? ""} onChange={(e) => cambiarFila(i, e.target.value)}>
                  <option value="">{i === 0 ? "Sin agrupar" : "Ninguno"}</option>
                  {DIMENSIONES.filter(
                    (d) => d.id === cfg.filas[i] || !cfg.filas.includes(d.id)
                  ).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.grupo} · {d.nombre}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div>
            <div className="campos-tit">Columna</div>
            <label className="sel">
              <span>Abre a lo ancho</span>
              <select
                value={cfg.columna ?? ""}
                onChange={(e) => {
                  setCfg({ ...cfg, columna: (e.target.value || undefined) as DimensionId });
                  setPlantilla("");
                }}
              >
                <option value="">Ninguna</option>
                {DIMENSIONES.filter((d) => !cfg.filas.includes(d.id)).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.grupo} · {d.nombre}
                  </option>
                ))}
              </select>
            </label>
            <p className="note" style={{ marginTop: 10 }}>
              Con columna abierta, cada medida se repite por cada valor de esa
              dimensión. Conviene dejar una sola medida.
            </p>
          </div>

          <div style={{ gridColumn: "span 2" }}>
            <div className="campos-tit">Valores</div>
            <div className="medidas">
              {MEDIDAS.map((m) => (
                <button
                  key={m.id}
                  className={`btn ghost sm ${cfg.valores.includes(m.id) ? "on" : ""}`}
                  onClick={() => alternarMedida(m.id)}
                  title={m.grupo}
                >
                  {m.nombre}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div
          style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}
        >
          <h3 style={{ marginRight: "auto" }}>
            {dimsFila.length ? dimsFila.map((d) => d.nombre).join(" › ") : "Total del alcance"}
          </h3>
          <span className="note" style={{ margin: 0 }}>
            {fmt(r.filas.length)} renglones · corte {CORTE.etiqueta}
          </span>
          <button className="btn ghost sm" onClick={descargar}>
            Descargar CSV
          </button>
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
            Mostrando {fmt(Math.min(limite, visibles.length))} de {fmt(visibles.length)} renglones
            visibles
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
    </div>
  );
}
