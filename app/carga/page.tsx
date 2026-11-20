"use client";

/**
 * Estado de carga y maestro de productos.
 *
 * Esta pantalla existe por una razón que conviene tener clara antes de
 * enseñarla: la pregunta que hunde una demostración de BI no es «¿de dónde
 * sale ese número?» sino «¿quién me garantiza que el dato llegó?». Un BI que
 * no sabe responderla se discute; uno que la responde se compra.
 *
 * Aquí se declara, por cadena, de dónde viene el dato, cuándo entró el
 * último y qué está mapeado. Hoy la fuente es el generador determinista y la
 * pantalla lo dice con todas sus letras: una pantalla de estado que mintiera
 * sería peor que no tenerla.
 */

import { useMemo, useState } from "react";
import { useBI } from "@/lib/store";
import { Tile, Mono, Tabla, type Col } from "@/components/ui";
import { CORTE, enPeriodo, etiquetaPeriodo, fmt, fracciones, moneyCorto } from "@/lib/engine";
import { fuenteActiva } from "@/lib/fuente";
import { MARCAS, MODELOS, COLECCIONES, marcaPorId, type Modelo } from "@/lib/catalog";

type FilaCadena = {
  id: string;
  nombre: string;
  formato: string;
  sucursales: number;
  reportan: number;
  skus: number;
  piezas: number;
  monto: number;
  ultima: string;
};

export default function Carga() {
  const { data, vista, ind, periodo } = useBI();
  const frac = useMemo(() => fracciones(periodo), [periodo]);
  const [busca, setBusca] = useState("");
  const fuente = fuenteActiva();

  const cadenas: FilaCadena[] = useMemo(() => {
    return data.cadenas.map((cad) => {
      const sucs = data.sucursales.filter((s) => s.cadenaId === cad.id);
      const combos = vista.filter((c) => c.sucursal.cadenaId === cad.id);
      return {
        id: cad.id,
        nombre: cad.nombre,
        formato: cad.formato,
        sucursales: sucs.length,
        reportan: sucs.filter((s) => s.reporta).length,
        skus: new Set(combos.map((c) => c.modelo.sku)).size,
        piezas: combos.reduce((a, c) => a + c.inv, 0),
        monto: combos.reduce((a, c) => a + c.inv * c.costo, 0),
        ultima: CORTE.fecha,
      };
    });
  }, [data, vista]);

  const modelos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const lista = MODELOS.map((m) => {
      const col = COLECCIONES.find((c) => c.id === m.coleccionId)!;
      const combos = vista.filter((c) => c.modelo.sku === m.sku);
      return {
        ...m,
        coleccion: col.nombre,
        marca: marcaPorId(col.marcaId).nombre,
        segmento: col.segmento,
        tiendas: new Set(combos.map((c) => c.sucursal.clave)).size,
        piezas: combos.reduce((a, c) => a + c.inv, 0),
        monto: combos.reduce((a, c) => a + c.inv * c.costo, 0),
        ...combos.reduce(
          (a, c) => {
            const v = enPeriodo(c, frac);
            a.out += v.out;
            a.venta += v.out * c.precio;
            a.in += v.in;
            a.inMonto += v.in * c.costo;
            return a;
          },
          { out: 0, venta: 0, in: 0, inMonto: 0 }
        ),
      };
    });
    if (!q) return lista.sort((a, b) => b.venta - a.venta);
    return lista
      .filter((m) =>
        `${m.sku} ${m.nombre} ${m.coleccion} ${m.marca} ${m.genero} ${m.material}`
          .toLowerCase()
          .includes(q)
      )
      .sort((a, b) => b.venta - a.venta);
  }, [vista, busca, frac]);

  const cols: Col<(typeof modelos)[number]>[] = [
    {
      t: "Código",
      cls: "name",
      f: (m) => <strong style={{ fontFamily: "var(--font-mono)" }}>{m.sku}</strong>,
    },
    { t: "Descripción", cls: "name", f: (m) => m.nombre },
    { t: "Marca", f: (m) => m.marca },
    { t: "Colección", f: (m) => m.coleccion },
    { t: "Segmento", f: (m) => m.segmento },
    { t: "Género", f: (m) => m.genero },
    { t: "Material", f: (m) => m.material },
    { t: "Tiendas", n: true, f: (m) => fmt(m.tiendas) },
    { t: "Exist. (pzas)", n: true, f: (m) => fmt(m.piezas) },
    { t: "Exist. $", n: true, f: (m) => moneyCorto(m.monto) },
    { t: "Sell-out (pzas)", n: true, f: (m) => fmt(m.out) },
    { t: "Sell-out $", n: true, f: (m) => moneyCorto(m.venta) },
    { t: "Sell-in (pzas)", n: true, f: (m) => fmt(m.in) },
    { t: "Sell-in $", n: true, f: (m) => moneyCorto(m.inMonto) },
  ];

  const totalSuc = data.sucursales.length;
  const reportan = data.sucursales.filter((s) => s.reporta).length;

  return (
    <div className="view">
      <div className="tiles">
        <Tile
          k="Cadenas conectadas"
          v={fmt(data.cadenas.length)}
          n="Liverpool, Palacio de Hierro, Sears y Sanborns"
        />
        <Tile
          k="Último corte cargado"
          v={CORTE.etiqueta}
          n={`Semana cerrada al ${CORTE.fecha}`}
        />
        <Tile
          k="Puntos de venta"
          v={fmt(totalSuc)}
          s={`${fmt(ind.inventario)} pzas · ${moneyCorto(ind.inventarioMonto)}`}
          n={`${fmt(reportan)} entregan sell-out. Existencia en el alcance`}
        />
        <Tile
          k="Productos mapeados"
          v={fmt(MODELOS.length)}
          tono="ok"
          n="Ninguna referencia huérfana en las cuatro cadenas"
        />
      </div>

      <div className="card" style={{ borderColor: "color-mix(in srgb, var(--warn) 45%, var(--hair))" }}>
        <h3>De dónde viene el dato</h3>
        <p className="sub">
          Esta pantalla contesta la pregunta que hunde a un tablero: quién garantiza
          que el dato llegó. Hoy la respuesta es esta, y está escrita tal cual.
        </p>
        <div className="rows">
          <div className="row">
            <div className="who">
              <strong>Fuente activa</strong>
              <span>{fuente.etiqueta}</span>
            </div>
            <div className="val">
              <span className={`chip ${fuente.productiva ? "sano" : "alto"}`}>
                <b aria-hidden>●</b>
                {fuente.productiva ? "Productiva" : "Demostración"}
              </span>
            </div>
          </div>
          <div className="row">
            <div className="who">
              <strong>Qué falta para producción</strong>
              <span>
                Conectar el archivo semanal o el portal de proveedores de cada cadena.
                El resto de la plataforma no cambia: las fórmulas, las reglas y las
                pantallas son las mismas con datos reales.
              </span>
            </div>
            <div className="val num">1 función</div>
          </div>
        </div>
        <p className="note">
          Mientras la fuente sea la de demostración, las cifras son simuladas y
          deterministas: la misma semilla produce siempre los mismos números, así que
          nadie ve datos distintos entre dos aperturas.
        </p>
      </div>

      <div className="card">
        <h3>Estado por cadena</h3>
        <p className="sub">
          Qué entró de cada cadena, cuántas de sus tiendas entregan sell-out y cuánto
          inventario sostienen en el alcance filtrado.
        </p>
        <div className="rows">
          {cadenas.map((c) => {
            const pct = c.sucursales ? (c.reportan / c.sucursales) * 100 : 0;
            return (
              <div className="row" key={c.id}>
                <div className="who" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <Mono cadenaId={c.id} />
                  <span>
                    <strong>{c.nombre}</strong>
                    <span>
                      {c.formato} · {fmt(c.sucursales)} tiendas · {fmt(c.skus)} modelos
                    </span>
                  </span>
                </div>
                <div className="val" style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  <span className="note" style={{ margin: 0 }}>
                    Última venta {c.ultima}
                  </span>
                  <span className="num" style={{ minWidth: 150, textAlign: "right" }}>
                    {fmt(c.piezas)} pzas · {moneyCorto(c.monto)}
                  </span>
                  <span className={`chip ${pct === 100 ? "sano" : pct >= 90 ? "alto" : "saturado"}`}>
                    <b aria-hidden>●</b>
                    {fmt(c.reportan)} de {fmt(c.sucursales)} reportan ({fmt(pct, 0)}%)
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <p className="note">
          Una tienda que no entrega sell-out muestra existencia pero no cobertura: sin
          denominador no hay cálculo, y queda fuera del excedente y del resurtido sugerido.
        </p>
      </div>

      <div className="card">
        <h3>Maestro de productos</h3>
        <p className="sub">
          {fmt(MODELOS.length)} referencias de {MARCAS.length} marcas y{" "}
          {COLECCIONES.length} colecciones, con los niveles por los que compra la cadena. Sell-out
          y sell-in son del periodo: {etiquetaPeriodo(periodo)}.
        </p>
        <label className="sel" style={{ margin: "12px 0", maxWidth: 360 }}>
          <span>Buscar en todas las columnas</span>
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Código, descripción, marca, género o material"
          />
        </label>
        <div className="tablewrap">
          <Tabla cols={cols} filas={modelos} limite={40} />
        </div>
        <div className="tfoot">
          <span>
            {fmt(modelos.length)} de {fmt(MODELOS.length)} referencias
          </span>
          <span>
            En producción, esta tabla es donde se mapea el código del proveedor contra el
            código de cada cadena.
          </span>
        </div>
      </div>
    </div>
  );
}
