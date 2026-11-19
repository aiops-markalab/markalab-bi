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
  traslados,
  type Combo,
  type Filtro,
  type Indicadores,
} from "./engine";
import type { Hallazgo } from "./copiloto";

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
  const p: string[] = [];
  if (f.ciudad) p.push(f.ciudad);
  else if (f.estado) p.push(f.estado);
  if (f.cadena) p.push(f.cadena);
  if (f.modelo) p.push(f.modelo);
  else if (f.coleccion) p.push(f.coleccion);
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
          "¿Qué estado atiendo primero y por qué?",
          "¿Por qué este estado está en rojo si su cobertura promedio se ve sana?",
          "Dame el guion para hablar de este mapa con el comprador.",
        ],
      };
    }

    case "/ejecucion": {
      const t = traslados(vista, vista);
      // El traslado se mide por lo que deja de perderse en doce meses, menos
      // lo que cuesta moverlo. Es la cifra honesta, no la bruta.
      const recupera = t.reduce((a, x) => a + x.recupera * 52 - x.costo, 0);
      return {
        clave: "ejecucion",
        titulo: "Qué atender",
        saludo: t.length
          ? `Estás en las decisiones de la semana sobre ${donde}. Hay ${fmt(t.length)} traslados posibles que mueven ${moneyCorto(recupera)} sin comprometer dinero nuevo. ¿Los reviso contigo en orden?`
          : `Estás en las decisiones de la semana sobre ${donde}. Con estos filtros no hay traslados posibles: o no hay excedente, o no coincide el modelo. ¿Te explico qué más se puede hacer?`,
        sugeridas: [
          "¿Qué tres cosas haría esta semana si solo pudiera hacer tres?",
          "¿Por qué no puedo mover esta pieza a la otra cadena?",
          "Escríbeme el correo para pedir el traslado.",
        ],
      };
    }

    case "/detalle": {
      return {
        clave: "detalle",
        titulo: "Detalle por tienda",
        saludo: `Estás en el detalle crudo: ${fmt(vista.length)} combinaciones de tienda y modelo sobre ${donde}. Aquí no hay interpretación, son los números tal cual. ¿Quieres que te diga qué buscar en ellos?`,
        sugeridas: [
          "¿Qué tiendas se ven sanas en promedio pero están mal por dentro?",
          "¿Qué modelos conviene dejar de embarcar y cuáles resurtir?",
          "¿Qué hago con las tiendas que no reportan sell-out?",
        ],
      };
    }

    case "/planeacion": {
      return {
        clave: "planeacion",
        titulo: "Escenarios",
        saludo: `Estás moviendo supuestos${d.escenario ? ` en el escenario «${d.escenario}»` : ""}. Lo que cambies aquí se propaga hasta EBITDA. ¿Quieres que te diga qué supuesto mueve más el resultado?`,
        sugeridas: [
          "¿Qué supuesto mueve más el EBITDA y cuál casi no lo mueve?",
          "¿Qué tan realista es este escenario contra lo que se ve en piso?",
          "Explícame la diferencia entre este escenario y el plan comprometido.",
        ],
      };
    }

    case "/resultados": {
      return {
        clave: "resultados",
        titulo: "Estado de resultados",
        saludo: `Estás en el estado de resultados proyectado${d.escenario ? ` del escenario «${d.escenario}»` : ""}. ¿Quieres que te arme la lectura trimestre por trimestre, como se la contarías al consejo?`,
        sugeridas: [
          "Resume este P&L en tres frases para el consejo.",
          "¿De dónde sale la diferencia contra el plan comprometido?",
          "¿Cuánto de este margen depende de que el canal se destrabe?",
        ],
      };
    }

    case "/salud": {
      return {
        clave: "salud",
        titulo: "Salud del dato",
        saludo: `Estás viendo qué tanto del negocio es realmente visible. Hoy reporta sell-out el ${fmt(ind.coberturaReporte, 1)}% de la red. ¿Te explico qué decisiones se vuelven inseguras con ese porcentaje?`,
        sugeridas: [
          "¿Qué decisiones no debería tomar con esta cobertura de dato?",
          "¿Cómo le pido a la cadena que reporte lo que falta?",
          "¿Cuánto vale cerrar esa brecha de información?",
        ],
      };
    }

    case "/reportes": {
      return {
        clave: "reportes",
        titulo: "Reportes",
        saludo: `Estás armando un reporte sobre ${donde}: ${fmt(vista.length)} combinaciones dentro del alcance. Dime qué quieres saber y te digo por qué niveles cortarlo.`,
        sugeridas: [
          "¿Cómo veo qué colección se está cayendo contra el año pasado?",
          "¿Qué niveles uso para enseñarle esto al comprador de Liverpool?",
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
          "¿Qué pasa con las tiendas que no reportan?",
          "¿Qué haría falta para conectar los datos reales de las cadenas?",
          "¿Cómo le explico al cliente que los datos de esta demostración son simulados?",
        ],
      };
    }

    case "/ayuda": {
      return {
        clave: "ayuda",
        titulo: "Centro de ayuda",
        saludo: `Pregúntame lo que necesites de la plataforma. Si hay una guía escrita te la doy, y si no, te contesto con las cifras del corte ${corteEtiqueta(vista)}.`,
        sugeridas: [
          "¿Cómo armo un reporte comparativo?",
          "¿Por qué no puedo mover una pieza de Liverpool a Sears?",
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
          "¿Qué pregunta debería hacerle al equipo que no me estoy haciendo?",
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
          "¿Qué le enseño primero al director comercial?",
        ],
      };
    }
  }
}
