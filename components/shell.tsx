"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";
import { useBI } from "@/lib/store";
import { CORTE, fmt } from "@/lib/engine";
import { Filtros } from "./filtros";
import { CopilotoFlotante } from "./copiloto-flotante";

/* Cada grupo lleva su color. No es decoración: en el rail hay ocho pantallas
   seguidas y sin separación visual uno no sabe dónde termina la ejecución del
   día y dónde empieza la planeación del año, que son dos conversaciones
   distintas con dos personas distintas de la mesa. */
const SECCIONES = [
  {
    tono: "ejecucion",
    grupo: "Ejecución",
    items: [
      { href: "/", etiqueta: "Resumen", clave: "resumen" },
      { href: "/mapa", etiqueta: "Mapa de alertas", clave: "mapa" },
      { href: "/ejecucion", etiqueta: "Qué atender", clave: "ejecucion" },
      { href: "/detalle", etiqueta: "Detalle por tienda", clave: "detalle" },
    ],
  },
  {
    tono: "analisis",
    grupo: "Análisis",
    items: [{ href: "/reportes", etiqueta: "Reportes", clave: "reportes" }],
  },
  {
    tono: "planeacion",
    grupo: "Planeación",
    items: [
      { href: "/planeacion", etiqueta: "Escenarios", clave: "planeacion" },
      { href: "/resultados", etiqueta: "Estado de resultados", clave: "resultados" },
    ],
  },
  {
    tono: "inteligencia",
    grupo: "Inteligencia",
    items: [
      { href: "/copiloto", etiqueta: "Copiloto", clave: "copiloto" },
      { href: "/salud", etiqueta: "Salud del dato", clave: "salud" },
    ],
  },
  {
    tono: "sistema",
    grupo: "Datos",
    items: [
      { href: "/carga", etiqueta: "Estado de carga", clave: "carga" },
      { href: "/ayuda", etiqueta: "Centro de ayuda", clave: "ayuda" },
    ],
  },
];

const TITULOS: Record<string, [string, string]> = {
  "/": ["Resumen", "Salud comercial del canal en una pantalla"],
  "/mapa": ["Mapa de alertas", "Semáforo por estado y bandera por sucursal"],
  "/ejecucion": ["Qué atender", "Las decisiones de esta semana, ordenadas por impacto"],
  "/detalle": ["Detalle por tienda", "Inventario y desplazamiento por sucursal y modelo"],
  "/reportes": ["Reportes", "Tabla dinámica: corta el corte por donde haga falta"],
  "/planeacion": ["Escenarios", "Mueve un supuesto y observa cómo se propaga hasta EBITDA"],
  "/resultados": ["Estado de resultados", "Proyección del escenario activo, por trimestre"],
  "/copiloto": ["Copiloto", "Especialista en inteligencia comercial y planeación"],
  "/salud": ["Salud del dato", "Qué porcentaje del negocio es realmente visible"],
  "/carga": ["Estado de carga", "De dónde viene cada dato y qué está mapeado"],
  "/ayuda": ["Centro de ayuda", "Guías paso a paso y respuestas sobre el corte vigente"],
};

export function Shell({ children }: { children: ReactNode }) {
  const ruta = usePathname();
  const { data, vista, ind, tema, setTema } = useBI();

  const [titulo, sub] = TITULOS[ruta] ?? ["MarkaLab BI", ""];
  const alertas = vista.filter((c) => c.clase !== "sano").length;

  const badge = (clave: string) => {
    if (clave === "mapa" || clave === "ejecucion")
      return alertas > 0 ? <span className="badge alert">{fmt(alertas)}</span> : null;
    if (clave === "salud")
      return ind.coberturaReporte < 97 ? <span className="badge">{fmt(ind.coberturaReporte, 0)}%</span> : null;
    return null;
  };

  return (
    <div className="shell">
      <nav className="rail" aria-label="Secciones">
        <div className="wordmark">
          <span>MarkaLab</span>
          <span className="bi">BI</span>
        </div>
        {SECCIONES.map((s) => (
          <div key={s.grupo} className="bloque" data-tono={s.tono}>
            <div className="grp">{s.grupo}</div>
            {s.items.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                className="nav"
                aria-current={ruta === i.href ? "page" : undefined}
              >
                {i.etiqueta}
                {badge(i.clave)}
              </Link>
            ))}
          </div>
        ))}
        <div className="foot">
          <div>
            Corte <strong style={{ color: "var(--chrome-ink)" }}>{CORTE.etiqueta}</strong>
          </div>
          <div>
            {fmt(data.sucursales.length)} sucursales · {data.colecciones.length} colecciones
          </div>
          <button
            className="btn ghost sm"
            style={{
              background: "transparent",
              color: "var(--chrome-ink-2)",
              borderColor: "rgba(255,255,255,.15)",
            }}
            onClick={() => setTema(tema === "dark" ? "light" : "dark")}
          >
            {tema === "dark" ? "Tema claro" : "Tema oscuro"}
          </button>
        </div>
      </nav>

      <div className="main">
        <header className="topbar">
          <div className="titulo">
            <h2>{titulo}</h2>
            <div className="sub">{sub}</div>
          </div>
          <Filtros />
        </header>

        {children}
      </div>

      {/* Disponible desde cualquier pantalla, y consciente de en cuál está. */}
      <CopilotoFlotante />
    </div>
  );
}
