"use client";

/**
 * El sell-out como referencia.
 *
 * El plan se calcula sobre sell-in, que es lo que la marca le vende a las
 * cadenas. El sell-out no entra a la proyección: aquí solo se dice lo que cada
 * cadena ya le vendió al consumidor, para verlo junto a lo que se le resurtió.
 */

import { useMemo } from "react";
import { useBI } from "@/lib/store";
import { etiquetaPeriodo, fmt, moneyCorto, porCadena } from "@/lib/engine";

export function ReferenciaSellOut({
  proyeccion,
}: {
  /** Sell-in proyectado a doce meses por cadena, del escenario activo. */
  proyeccion?: { id: string; unidades: number; ingreso: number }[];
}) {
  const { vista, periodo } = useBI();
  const filas = useMemo(() => porCadena(vista, periodo), [vista, periodo]);
  const t = filas.reduce(
    (a, f) => ({
      outPzas: a.outPzas + f.outPzas,
      outMonto: a.outMonto + f.outMonto,
      inPzas: a.inPzas + f.inPzas,
      inMonto: a.inMonto + f.inMonto,
    }),
    { outPzas: 0, outMonto: 0, inPzas: 0, inMonto: 0 }
  );
  const py = (id: string) => proyeccion?.find((x) => x.id === id);
  const pyT = proyeccion?.reduce(
    (a, x) => ({ unidades: a.unidades + x.unidades, ingreso: a.ingreso + x.ingreso }),
    { unidades: 0, ingreso: 0 }
  );
  const indice = (o: number, i: number) => (i > 0.5 ? `${fmt((o / i) * 100, 1)}%` : "—");

  return (
    <div className="card">
      <h3>Lo que cada cadena ya vendió</h3>
      <p className="sub">
        Sell-out y sell-in reales de cada cadena · {etiquetaPeriodo(periodo)}. El sell-out no entra a
        la proyección: es la referencia de lo que el consumidor sí se llevó, junto a lo que la marca
        le resurtió a esa cadena.
      </p>
      <div className="tablewrap" style={{ maxHeight: "none" }}>
        <table>
          <thead>
            <tr>
              <th>Cadena</th>
              <th className="n">Sell-out (pzas)</th>
              <th className="n">Sell-out $</th>
              <th className="n">Sell-in (pzas)</th>
              <th className="n">Sell-in $</th>
              <th className="n">Diferencia (pzas)</th>
              <th className="n">Desplazó</th>
              {proyeccion ? (
                <>
                  <th className="n">Sell-in 12 meses (pzas)</th>
                  <th className="n">Sell-in 12 meses $</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id}>
                <td className="name">
                  <strong>{f.nombre}</strong>
                </td>
                <td className="n">
                  <strong>{fmt(f.outPzas)}</strong>
                </td>
                <td className="n">{moneyCorto(f.outMonto)}</td>
                <td className="n">
                  <strong>{fmt(f.inPzas)}</strong>
                </td>
                <td className="n">{moneyCorto(f.inMonto)}</td>
                <td className="n">{fmt(f.inPzas - f.outPzas)}</td>
                <td className="n">{indice(f.outPzas, f.inPzas)}</td>
                {proyeccion ? (
                  <>
                    <td className="n">{fmt(py(f.id)?.unidades ?? 0)}</td>
                    <td className="n">{moneyCorto(py(f.id)?.ingreso ?? 0)}</td>
                  </>
                ) : null}
              </tr>
            ))}
            <tr className="gran">
              <td className="name">
                <strong>Total</strong>
              </td>
              <td className="n">
                <strong>{fmt(t.outPzas)}</strong>
              </td>
              <td className="n">{moneyCorto(t.outMonto)}</td>
              <td className="n">
                <strong>{fmt(t.inPzas)}</strong>
              </td>
              <td className="n">{moneyCorto(t.inMonto)}</td>
              <td className="n">{fmt(t.inPzas - t.outPzas)}</td>
              <td className="n">{indice(t.outPzas, t.inPzas)}</td>
              {proyeccion && pyT ? (
                <>
                  <td className="n">{fmt(pyT.unidades)}</td>
                  <td className="n">{moneyCorto(pyT.ingreso)}</td>
                </>
              ) : null}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="note">
        Sell-out a precio de lista; sell-in a precio de venta a la cadena. Desplazó es lo vendido
        entre lo resurtido en el mismo periodo.
      </p>
    </div>
  );
}
