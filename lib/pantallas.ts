/**
 * Lo que el copiloto sabe de la pantalla en la que estás parado.
 *
 * Un copiloto que contesta igual en el mapa que en el estado de resultados no
 * es un copiloto, es un buscador con buenos modales. Aquí se arma, con las
 * cifras vivas del corte y los filtros puestos, la frase con la que abre y las
 * tres preguntas que valen la pena en esa pantalla y no en otra.
 *
 * Todo lo de este archivo es determinista: sale de los mismos cálculos que la
 * pantalla está mostrando. El modelo recibe esto como contexto, no lo inventa.
 */

import {
  fmt,
  moneyCorto,
  porEstado,
  type Combo,
  type Filtro,
  type Indicadores,
} from "./engine";
import type { Hallazgo } from "./copiloto";
import { CADENAS, COLECCIONES, ESTADOS, MARCAS } from "./catalog";

export type ContextoPantalla = {
  clave: string;
  titulo: string;
  /** Lo que el copiloto dice al abrirse, con las cifras de lo que se ve. */
  saludo: string;
  /** Las tres preguntas que tienen sentido aquí. */
  sugeridas: string[];
};

type Entrada = {
  vista: Combo[];
  ind: Indicadores;
  hallazgos: Hallazgo[];
  filtro: Filtro;
  escenario?: string;
};

/** El alcance que los filtros dejan puesto, dicho como lo diría una persona. */
export function alcance(f: Filtro): string {
  // Los filtros guardan claves --LIV, NL, tsuyosa-- y aquí se dice el nombre:
  // esto se lee en el saludo de Argos y en el encabezado de cada Excel.
  const p: string[] = [];
  if (f.ciudad) p.push(f.ciudad);
  else if (f.estado) p.push(ESTADOS.find((e) => e.id === f.estado)?.nombre ?? f.estado);
  if (f.cadena) p.push(CADENAS.find((c) => c.id === f.cadena)?.nombre ?? f.cadena);
  if (f.modelo) p.push(f.modelo);
  else if (f.coleccion) p.push(COLECCIONES.find((c) => c.id === f.coleccion)?.nombre ?? f.coleccion);
  else if (f.marca) p.push(MARCAS.find((m) => m.id === f.marca)?.nombre ?? f.marca);
  if (f.genero) p.push(f.genero);
  if (f.material) p.push(f.material);
  return p.length ? p.join(" · ") : "todo el canal";
}

/** El corte es fijo en toda la plataforma; se lee del primer combo. */
const corteEtiqueta = (_v: Combo[]) => "vigente";

export function contextoPantalla(ruta: string, d: Entrada): ContextoPantalla {
  const { vista, ind, hallazgos, filtro } = d;
  const donde = alcance(filtro);
  const criticos = hallazgos.filter((h) => h.severidad === "critica");
  const peor = hallazgos[0];

  switch (ruta) {
    case "/mapa": {
      const estados = porEstado(vista, filtro.umbral);
      const rojos = estados.filter((e) => e.clase === "saturado" || e.clase === "quiebre");
      const top = [...estados].sort(
        (a, b) => b.capital + b.perdida * 4 - (a.capital + a.perdida * 4)
      )[0];
      return {
        clave: "mapa",
        titulo: "Mapa de alertas",
        saludo: top
          ? `Estás viendo el mapa sobre ${donde}. De ${fmt(estados.length)} estados con presencia, ${fmt(rojos.length)} están en alerta, y el de mayor impacto es ${top.estado.nombre} con ${moneyCorto(top.capital + top.perdida * 4)} entre capital parado y venta en riesgo. ¿Te digo por dónde empezar?`
          : `Estás viendo el mapa sobre ${donde}, y con estos filtros no queda ningún estado con alerta. ¿Quieres que lo revise sin filtros?`,
        sugeridas: [
          "¿Qué cambió respecto de la semana pasada?",
          "¿Qué estados tienen más capital parado?",
          "¿Cuántos quiebres hay por estado?",
        ],
      };
    }

    case "/ejecucion": {
      const sobre = vista.filter((c) => c.clase === "alto" || c.clase === "saturado");
      const qui = vista.filter((c) => c.clase === "quiebre");
      const exc = sobre.reduce((a, c) => a + c.exc, 0);
      const sug = qui.reduce((a, c) => a + c.sug, 0);
      return {
        clave: "ejecucion",
        titulo: "Qué atender",
        saludo:
          sobre.length || qui.length
            ? `Estás en las decisiones de la semana sobre ${donde}. Hay ${fmt(sobre.length)} combinaciones a las que no conviene resurtir, con ${fmt(exc)} piezas de más, y ${fmt(qui.length)} en quiebre que piden ${fmt(sug)} piezas. ¿Las reviso contigo en orden?`
            : `Estás en las decisiones de la semana sobre ${donde}. Con estos filtros nada rebasa el umbral ni está en quiebre. ¿Reviso otro alcance?`,
        sugeridas: [
          "¿Qué tres cosas haría esta semana si solo pudiera hacer tres?",
          "¿Cuánto resurtido se sugiere por colección?",
          "¿Qué modelos tienen más piezas sobre el umbral?",
        ],
      };
    }

    case "/detalle": {
      return {
        clave: "detalle",
        titulo: "Detalle por tienda",
        saludo: `Estás en el detalle crudo: ${fmt(vista.length)} combinaciones de tienda y modelo sobre ${donde}. Aquí no hay interpretación, son los números tal cual. ¿Quieres que te diga qué buscar en ellos?`,
        sugeridas: [
          "¿Cuál es la tienda con menos cobertura?",
          "¿Qué modelos tienen más quiebres?",
          "¿Cuántas tiendas no reportan sell-out?",
        ],
      };
    }

    case "/planeacion": {
      return {
        clave: "planeacion",
        titulo: "Escenarios",
        saludo: `Estás moviendo supuestos${d.escenario ? ` en el escenario «${d.escenario}»` : ""}. El plan se calcula sobre sell-in, y lo que cambies aquí se propaga hasta EBITDA. ¿Quieres que te diga cómo queda el escenario?`,
        sugeridas: [
          "¿Cuál es el EBITDA del escenario?",
          "Compara los escenarios.",
          "Sell-in de las últimas 12 semanas por cadena.",
        ],
      };
    }

    case "/resultados": {
      return {
        clave: "resultados",
        titulo: "Estado de resultados",
        saludo: `Estás en el estado de resultados proyectado${d.escenario ? ` del escenario «${d.escenario}»` : ""}. ¿Quieres que te arme la lectura trimestre por trimestre, como se la contarías al consejo?`,
        sugeridas: [
          "¿Cuál es el EBITDA del escenario?",
          "Compara los escenarios.",
          "¿Cuánto cuesta no hacer nada un mes más?",
        ],
      };
    }

    case "/salud": {
      return {
        clave: "salud",
        titulo: "Salud del dato",
        saludo: `Estás viendo qué tanto del negocio es realmente visible. Hoy reporta sell-out el ${fmt(ind.coberturaReporte, 1)}% de la red. ¿Te explico qué decisiones se vuelven inseguras con ese porcentaje?`,
        sugeridas: [
          "¿Cuántas tiendas no reportan?",
          "¿Qué es la venta perdida?",
          "¿Cómo se calcula la cobertura?",
        ],
      };
    }

    case "/reportes": {
      return {
        clave: "reportes",
        titulo: "Reportes",
        saludo: `Estás armando un reporte sobre ${donde}: ${fmt(vista.length)} combinaciones dentro del alcance. Dime qué quieres saber y te digo por qué niveles cortarlo.`,
        sugeridas: [
          "¿Qué colección se está cayendo contra el año pasado?",
          "Sell-out de esta semana por cadena.",
          "¿Por qué la cobertura del total no es el promedio de los renglones?",
        ],
      };
    }

    case "/carga": {
      return {
        clave: "carga",
        titulo: "Estado de carga",
        saludo: `Estás viendo de dónde viene el dato. Hoy reporta sell-out el ${fmt(ind.coberturaReporte, 1)}% de la red. ¿Te digo qué se puede y qué no se puede decidir con eso?`,
        sugeridas: [
          "¿Cuántas tiendas no reportan?",
          "¿Qué es el sell-out y el sell-in?",
          "¿Cuál fue el sell-out de este mes?",
        ],
      };
    }

    case "/ayuda": {
      return {
        clave: "ayuda",
        titulo: "Centro de ayuda",
        saludo: `Pregúntame lo que necesites de la plataforma. Si hay una guía escrita te la doy, y si no, te contesto con las cifras del corte ${corteEtiqueta(vista)}.`,
        sugeridas: [
          "¿Cómo se calcula la cobertura?",
          "¿Qué es el sell-in y el sell-out?",
          "¿Qué hace Argos exactamente?",
        ],
      };
    }

    case "/copiloto": {
      return {
        clave: "copiloto",
        titulo: "Copiloto",
        saludo: `Tengo ${fmt(hallazgos.length)} hallazgos del corte sobre ${donde}, ${fmt(criticos.length)} de ellos críticos. ¿Por cuál empezamos?`,
        sugeridas: [
          "¿Qué tres cosas haría esta semana si solo pudiera hacer tres?",
          "¿Cuánto cuesta no hacer nada durante un mes más?",
          "¿Qué cadena tiene más capital parado?",
        ],
      };
    }

    default: {
      return {
        clave: "resumen",
        titulo: "Resumen",
        saludo: peor
          ? `Estás en el resumen de ${donde}. Lo más urgente del corte es "${peor.titulo}", con ${moneyCorto(peor.valor)} de impacto. ¿Te lo explico?`
          : `Estás en el resumen de ${donde} y el corte no trae hallazgos. ¿Quieres revisar otro alcance?`,
        sugeridas: [
          "Resúmeme el corte en tres frases.",
          "¿Qué cambió respecto de la semana pasada?",
          "Sell-out de este mes por cadena.",
        ],
      };
    }
  }
}
