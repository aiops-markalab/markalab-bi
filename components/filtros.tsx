"use client";

/**
 * La barra de filtros.
 *
 * Ocho controles siempre a la vista convertían la cabecera en un muro, y en
 * una pantalla angosta se descolgaban en dos renglones. Lo que hay ahora es
 * lo que usan las herramientas serias: un botón que abre el panel completo, y
 * a la vista solo lo que está puesto, como pastillas que se quitan de una.
 *
 * Con el corte sin filtrar, la cabecera son dos controles. Con tres filtros
 * puestos, son cinco cosas y todas dicen algo.
 */

import { useEffect, useRef, useState } from "react";
import { useBI } from "@/lib/store";
import { filtrosActivos } from "@/lib/engine";
import {
  CIUDADES,
  MARCAS,
  MODELOS,
  GENEROS,
  MATERIALES,
  modelosDe,
  marcaPorId,
  cadenaPorId,
  estadoPorId,
  modeloPorSku,
  COLECCIONES,
} from "@/lib/catalog";

export function Filtros() {
  const {
    data,
    filtro,
    setEstado,
    setCiudad,
    setCadena,
    setMarca,
    setColeccion,
    setModelo,
    setGenero,
    setMaterial,
    setUmbral,
    limpiar,
  } = useBI();

  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const activos = filtrosActivos(filtro);

  /* Se cierra al hacer clic fuera o con Escape, como cualquier menú. */
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

  const estadosConPresencia = data.estados.filter((e) =>
    data.sucursales.some((s) => s.estadoId === e.id)
  );
  const ciudades = CIUDADES.filter((c) => !filtro.estado || c.estadoId === filtro.estado);
  const colecciones = filtro.marca
    ? COLECCIONES.filter((c) => c.marcaId === filtro.marca)
    : COLECCIONES;
  const modelos = filtro.coleccion
    ? modelosDe(filtro.coleccion)
    : filtro.marca
      ? MODELOS.filter((m) => colecciones.some((c) => c.id === m.coleccionId))
      : MODELOS;

  /* Lo puesto, en el orden en que se lee: dónde, qué marca, qué pieza. */
  const puestos: { et: string; valor: string; quitar: () => void }[] = [];
  if (filtro.estado)
    puestos.push({
      et: "Estado",
      valor: estadoPorId(filtro.estado).nombre,
      quitar: () => setEstado(""),
    });
  if (filtro.ciudad)
    puestos.push({ et: "Ciudad", valor: filtro.ciudad, quitar: () => setCiudad("") });
  if (filtro.cadena)
    puestos.push({
      et: "Cadena",
      valor: cadenaPorId(filtro.cadena).nombre,
      quitar: () => setCadena(""),
    });
  if (filtro.marca)
    puestos.push({
      et: "Marca",
      valor: marcaPorId(filtro.marca).nombre,
      quitar: () => setMarca(""),
    });
  if (filtro.coleccion)
    puestos.push({
      et: "Colección",
      valor: COLECCIONES.find((c) => c.id === filtro.coleccion)?.nombre ?? "",
      quitar: () => setColeccion(""),
    });
  if (filtro.modelo)
    puestos.push({
      et: "Modelo",
      valor: modeloPorSku(filtro.modelo)?.sku ?? filtro.modelo,
      quitar: () => setModelo(""),
    });
  if (filtro.genero)
    puestos.push({ et: "Género", valor: filtro.genero, quitar: () => setGenero("") });
  if (filtro.material)
    puestos.push({ et: "Material", valor: filtro.material, quitar: () => setMaterial("") });

  return (
    <div className="barra" ref={caja}>
      <button
        className={`btn ghost sm filtro-btn ${abierto || activos ? "on" : ""}`}
        onClick={() => setAbierto(!abierto)}
        aria-expanded={abierto}
      >
        Filtros
        {activos ? <span className="cuenta">{activos}</span> : null}
      </button>

      <span className="puesto umbral" title="Semanas de cobertura sobre las que una combinación se considera saturada">
        <b>Umbral</b>
        {filtro.umbral} semanas
      </span>

      {puestos.map((p) => (
        <span className="puesto" key={p.et}>
          <b>{p.et}</b>
          {p.valor}
          <button onClick={p.quitar} aria-label={`Quitar ${p.et}`}>
            ×
          </button>
        </span>
      ))}

      {activos > 1 ? (
        <button className="limpiar" onClick={limpiar}>
          Quitar todos
        </button>
      ) : null}

      {abierto ? (
        <div className="panel-filtros">
          <div className="pf-grupo">
            <div className="pf-tit">Tienda</div>
            <div className="pf-campos">
              <label className="sel">
                <span>Estado</span>
                <select value={filtro.estado ?? ""} onChange={(e) => setEstado(e.target.value)}>
                  <option value="">Todos</option>
                  {estadosConPresencia.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sel">
                <span>Ciudad</span>
                <select value={filtro.ciudad ?? ""} onChange={(e) => setCiudad(e.target.value)}>
                  <option value="">
                    {filtro.estado ? `Todas (${ciudades.length})` : "Todas"}
                  </option>
                  {ciudades.map((c) => (
                    <option key={`${c.estadoId}-${c.ciudad}`} value={c.ciudad}>
                      {c.ciudad}
                      {!filtro.estado ? ` · ${c.estadoId}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sel">
                <span>Cadena</span>
                <select value={filtro.cadena ?? ""} onChange={(e) => setCadena(e.target.value)}>
                  <option value="">Todas</option>
                  {data.cadenas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="pf-grupo">
            <div className="pf-tit">Producto</div>
            <div className="pf-campos">
              <label className="sel">
                <span>Marca</span>
                <select value={filtro.marca ?? ""} onChange={(e) => setMarca(e.target.value)}>
                  <option value="">Todas</option>
                  {MARCAS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sel">
                <span>Colección</span>
                <select
                  value={filtro.coleccion ?? ""}
                  onChange={(e) => setColeccion(e.target.value)}
                >
                  <option value="">
                    {filtro.marca ? `Todas (${colecciones.length})` : "Todas"}
                  </option>
                  {colecciones.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sel">
                <span>Modelo</span>
                <select value={filtro.modelo ?? ""} onChange={(e) => setModelo(e.target.value)}>
                  <option value="">
                    {filtro.coleccion ? `Todos (${modelos.length})` : "Todos"}
                  </option>
                  {modelos.map((m) => (
                    <option key={m.sku} value={m.sku}>
                      {m.sku} · {m.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sel">
                <span>Género</span>
                <select value={filtro.genero ?? ""} onChange={(e) => setGenero(e.target.value)}>
                  <option value="">Todos</option>
                  {GENEROS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sel">
                <span>Material</span>
                <select
                  value={filtro.material ?? ""}
                  onChange={(e) => setMaterial(e.target.value)}
                >
                  <option value="">Todos</option>
                  {MATERIALES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="pf-grupo">
            <div className="pf-tit">Criterio</div>
            <div className="pf-campos">
              <label className="sel">
                <span>Umbral de cobertura</span>
                <select
                  value={filtro.umbral}
                  onChange={(e) => setUmbral(Number(e.target.value))}
                >
                  {[8, 10, 12, 14, 16].map((u) => (
                    <option key={u} value={u}>
                      {u} semanas
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="note" style={{ marginTop: 8 }}>
              El umbral no cambia los datos, cambia el criterio: a 8 semanas salen más
              alertas, a 16 menos.
            </p>
          </div>

          <div className="pf-pie">
            <button className="btn ghost sm" onClick={limpiar} disabled={!activos}>
              Quitar filtros
            </button>
            <button className="btn sm" onClick={() => setAbierto(false)}>
              Listo
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
