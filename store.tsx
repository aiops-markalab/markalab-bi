"use client";

/**
 * Estado global de la plataforma.
 *
 * El conjunto de datos se genera una sola vez en el navegador: el generador es
 * determinista, así que todos ven exactamente las mismas cifras.
 */

import {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { cargarCorte } from "./fuente";
import {
  derivar,
  filtrar,
  indicadores,
  periodoDe,
  PARAMS,
  type Combo,
  type Dataset,
  type Filtro,
  type Indicadores,
  type Periodo,
} from "./engine";
import { ESCENARIOS_BASE, type Escenario } from "./plan";

type Ctx = {
  data: Dataset;
  /** Combinaciones tras aplicar los filtros globales. */
  vista: Combo[];
  ind: Indicadores;
  filtro: Filtro;
  setEstado: (v: string) => void;
  setCiudad: (v: string) => void;
  setCadena: (v: string) => void;
  setMarca: (v: string) => void;
  setColeccion: (v: string) => void;
  setGenero: (v: string) => void;
  setMaterial: (v: string) => void;
  setModelo: (v: string) => void;
  setUmbral: (v: number) => void;
  /** El periodo de análisis ya resuelto a días de la historia. */
  periodo: Periodo;
  /** Fechas ISO; las dos vacías regresan a toda la historia cargada. */
  setPeriodo: (desde: string, hasta: string) => void;
  limpiar: () => void;
  /** Escenario de planeación activo. */
  escenarios: Escenario[];
  escenarioId: string;
  setEscenarioId: (v: string) => void;
  actualizarEscenario: (id: string, cambios: Partial<Escenario["supuestos"]>) => void;
  reiniciarEscenario: (id: string) => void;
  tema: "auto" | "light" | "dark";
  setTema: (t: "auto" | "light" | "dark") => void;
  /** Decisiones tomadas sobre alertas: alimenta al copiloto. */
  bitacora: Decision[];
  registrar: (d: Omit<Decision, "sello">) => void;
};

export type Decision = {
  alertaId: string;
  titulo: string;
  accion: "aceptada" | "descartada" | "pospuesta";
  motivo?: string;
  valor: number;
  sello: number;
};

const C = createContext<Ctx | null>(null);

export function Proveedor({ children }: { children: ReactNode }) {
  /* La fuente se decide en lib/fuente.ts, que es la única costura entre la
     demostración y un cliente real. Aquí no se sabe de dónde vienen los datos
     ni hace falta saberlo. */
  const data = useMemo(() => cargarCorte(), []);
  const [cadena, setCadenaRaw] = useState("");
  const [marca, setMarcaRaw] = useState("");
  const [coleccion, setColeccionRaw] = useState("");
  const [genero, setGenero] = useState("");
  const [material, setMaterial] = useState("");
  const [estado, setEstadoRaw] = useState("");
  const [ciudad, setCiudadRaw] = useState("");
  const [modelo, setModelo] = useState("");
  const [umbral, setUmbralRaw] = useState(PARAMS.umbral);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [escenarioId, setEscenarioId] = useState("base");
  const [escenarios, setEscenarios] = useState<Escenario[]>(ESCENARIOS_BASE);
  const [tema, setTemaRaw] = useState<"auto" | "light" | "dark">("auto");
  const [bitacora, setBitacora] = useState<Decision[]>([]);

  // El umbral reclasifica todas las combinaciones en el momento.
  const combos = useMemo(() => {
    for (const c of data.combos) derivar(c, umbral);
    return data.combos;
  }, [data, umbral]);

  const filtro: Filtro = useMemo(
    () => ({
      estado,
      ciudad,
      cadena,
      marca,
      coleccion,
      modelo,
      genero,
      material,
      umbral,
      desde: desde || undefined,
      hasta: hasta || undefined,
    }),
    [estado, ciudad, cadena, marca, coleccion, modelo, genero, material, umbral, desde, hasta]
  );
  const periodo = useMemo(() => periodoDe({ desde: desde || undefined, hasta: hasta || undefined }), [desde, hasta]);
  const setPeriodo = useCallback((d: string, h: string) => {
    setDesde(d);
    setHasta(h);
  }, []);

  /* Los filtros son jerárquicos: cambiar el padre limpia al hijo para que
     nunca quede una combinación imposible, como Jalisco + Cancún. */
  const setEstado = useCallback((v: string) => {
    setEstadoRaw(v);
    setCiudadRaw("");
  }, []);
  const setCiudad = useCallback((v: string) => setCiudadRaw(v), []);
  const setCadena = useCallback((v: string) => setCadenaRaw(v), []);
  const setMarca = useCallback((v: string) => {
    setMarcaRaw(v);
    setColeccionRaw("");
    setModelo("");
  }, []);
  const setColeccion = useCallback((v: string) => {
    setColeccionRaw(v);
    setModelo("");
  }, []);

  const vista = useMemo(() => filtrar(combos, filtro), [combos, filtro]);
  const ind = useMemo(() => indicadores(vista, periodo), [vista, periodo]);

  const setUmbral = useCallback((v: number) => setUmbralRaw(v), []);
  const limpiar = useCallback(() => {
    setEstadoRaw("");
    setCiudadRaw("");
    setCadenaRaw("");
    setMarcaRaw("");
    setColeccionRaw("");
    setModelo("");
    setGenero("");
    setMaterial("");
    setDesde("");
    setHasta("");
  }, []);

  const actualizarEscenario = useCallback(
    (id: string, cambios: Partial<Escenario["supuestos"]>) => {
      setEscenarios((prev) =>
        prev.map((e) =>
          e.id === id ? { ...e, supuestos: { ...e.supuestos, ...cambios } } : e
        )
      );
    },
    []
  );

  const reiniciarEscenario = useCallback((id: string) => {
    setEscenarios((prev) =>
      prev.map((e) => {
        const base = ESCENARIOS_BASE.find((b) => b.id === id);
        return e.id === id && base ? { ...base, supuestos: { ...base.supuestos } } : e;
      })
    );
  }, []);

  const registrar = useCallback((d: Omit<Decision, "sello">) => {
    setBitacora((prev) => [{ ...d, sello: Date.now() }, ...prev].slice(0, 60));
  }, []);

  const setTema = useCallback((t: "auto" | "light" | "dark") => {
    setTemaRaw(t);
    try {
      if (t === "auto") document.documentElement.removeAttribute("data-theme");
      else document.documentElement.setAttribute("data-theme", t);
      localStorage.setItem("mlbi-tema", t);
    } catch {
      /* almacenamiento bloqueado: el tema sigue el sistema */
    }
  }, []);

  useEffect(() => {
    try {
      const g = localStorage.getItem("mlbi-tema");
      if (g === "light" || g === "dark") {
        setTemaRaw(g);
        document.documentElement.setAttribute("data-theme", g);
      }
    } catch {
      /* sin almacenamiento, el tema sigue el sistema */
    }
  }, []);

  const valor: Ctx = {
    data,
    vista,
    ind,
    filtro,
    setEstado,
    setCiudad,
    setCadena,
    setMarca,
    setColeccion,
    setGenero,
    setMaterial,
    setModelo,
    setUmbral,
    periodo,
    setPeriodo,
    limpiar,
    escenarios,
    escenarioId,
    setEscenarioId,
    actualizarEscenario,
    reiniciarEscenario,
    tema,
    setTema,
    bitacora,
    registrar,
  };

  return <C.Provider value={valor}>{children}</C.Provider>;
}

export function useBI() {
  const v = useContext(C);
  if (!v) throw new Error("useBI debe usarse dentro de <Proveedor>");
  return v;
}
