/**
 * El contenido del centro de ayuda.
 *
 * Vive en código y no en una base porque son guías de producto: cambian
 * cuando cambia el producto, y conviene que viajen en el mismo commit que el
 * cambio que documentan. El día que esto crezca, se mueve a Supabase sin
 * tocar la pantalla.
 */

export type Guia = {
  id: string;
  titulo: string;
  resumen: string;
  /** Para que el buscador encuentre por las palabras que la gente escribe. */
  claves: string[];
  pasos: string[];
  /** A qué pantalla lleva, si aplica. */
  ruta?: string;
};

export const GUIAS: Guia[] = [
  {
    id: "comparativo",
    titulo: "Comparar la venta contra el año pasado",
    resumen:
      "Saber si se vendió más o menos que el mismo corte del año anterior, y en qué cadenas o colecciones está la diferencia.",
    claves: [
      "comparativo",
      "año anterior",
      "variacion",
      "crecimiento",
      "contra el año pasado",
      "ytd",
      "comparar",
    ],
    ruta: "/reportes",
    pasos: [
      "Entra a Reportes y elige la plantilla Comparativo anual.",
      "Cada medida aparece en tres columnas: venta de este corte, venta del año anterior y la variación en porcentaje.",
      "El color ayuda a leer rápido: verde si creció, rojo si cayó.",
      "Para ver dónde está la diferencia, cambia el segundo nivel de las filas. Con Colección ves qué colección se cayó; con Punto de venta, qué tienda.",
    ],
  },
  {
    id: "pivote",
    titulo: "Armar un reporte propio con la tabla dinámica",
    resumen:
      "Cortar el corte por los niveles que te interesan, sin esperar a que alguien arme la pantalla.",
    claves: [
      "tabla dinamica",
      "pivote",
      "power pivot",
      "reporte",
      "armar reporte",
      "excel",
      "cruzar",
      "filas columnas",
    ],
    ruta: "/reportes",
    pasos: [
      "En Reportes, el panel Campos tiene tres partes: Filas, Columna y Valores.",
      "En Filas eliges hasta tres niveles que se anidan. Por ejemplo Cadena, luego Colección, luego Punto de venta.",
      "En Columna eliges una dimensión que se abre a lo ancho. Con columna abierta conviene dejar una sola medida.",
      "En Valores enciendes las medidas que quieres sumar. Se pueden encender varias.",
      "El botón menos a la izquierda de cada renglón pliega su grupo.",
      "Descargar CSV baja la tabla tal como está, lista para Excel.",
    ],
  },
  {
    id: "resurtir",
    titulo: "Qué significan No resurtir y Resurtir",
    resumen:
      "Las dos decisiones que la marca sí controla: a dónde deja de mandar producto y a dónde manda.",
    claves: ["resurtir", "no resurtir", "resurtido", "sugerido", "traslado", "mover", "entre tiendas", "embarque"],
    ruta: "/ejecucion",
    pasos: [
      "No resurtir enlista las combinaciones de tienda y modelo que ya rebasan el umbral: tienen más piezas de las que pueden vender. Mandarles más las satura.",
      "Resurtir enlista las que están en quiebre: el modelo sí se vende ahí y la tienda está en cero o por agotarse. Cada una trae sus piezas sugeridas y su monto.",
      "El sugerido deja a la tienda con 56 días de inventario, descontando lo que ya va en tránsito.",
      "La plataforma no propone mover mercancía entre tiendas. Lo que ya se resurtió es inventario de la cadena, y moverlo es decisión de la cadena.",
    ],
  },
  {
    id: "periodo",
    titulo: "Elegir de qué día a qué día ver",
    resumen: "El calendario de la pastilla Periodo, junto al umbral.",
    claves: ["periodo", "calendario", "fechas", "dia", "semana", "rango", "desde", "hasta", "ayer"],
    pasos: [
      "La pastilla Periodo, junto al umbral, abre un calendario.",
      "Se elige de tres maneras: con un atajo (última semana, últimas 4 semanas), con dos clics en el calendario (el día inicial y el final), o con un clic en el número de semana para tomarla completa.",
      "El periodo cambia las cifras que se suman en el tiempo: sell-out, sell-in y los dos Top 10, en piezas y en monto.",
      "Inventario, cobertura y alertas no cambian con el periodo: son la fotografía del corte.",
      "La carga es semanal. El detalle por día reparte cada semana con el peso que cada día tiene en una tienda departamental.",
    ],
  },
  {
    id: "cortes",
    titulo: "Saber qué alertas se resolvieron contra el corte anterior",
    resumen: "El Mapa de alertas enseña el corte anterior y el actual, lado a lado.",
    claves: ["corte anterior", "resueltas", "nuevas", "comparar cortes", "semana pasada", "versus", "atendida", "pantalla completa", "ampliar", "zoom", "presentar"],
    ruta: "/mapa",
    pasos: [
      "El Mapa de alertas pinta dos mapas con las mismas reglas: el del corte anterior y el del corte actual.",
      "Un clic en cualquiera de los dos lo amplía a pantalla completa, para presentarlo. Ahí, un clic en un estado o en una bandera abre su detalle; los botones de arriba o las flechas del teclado pasan de un corte al otro, y Esc regresa.",
      "Arriba, tres indicadores dicen cuántas alertas se resolvieron, cuántas son nuevas y cuántas siguen, con sus piezas y su monto.",
      "La tabla Qué cambió entre los dos cortes enlista cada combinación con su situación, sus piezas y su monto antes y hoy.",
      "Una alerta se resuelve cuando la combinación regresa al rango. No hay que marcarla a mano: lo dice el siguiente corte.",
    ],
  },
  {
    id: "cobertura",
    titulo: "Por qué un estado sale en rojo si su cobertura se ve sana",
    resumen: "Cómo se decide el color del mapa, y por qué no es el promedio de sus tiendas.",
    claves: ["mapa", "rojo", "semaforo", "cobertura", "promedio", "estado", "color"],
    ruta: "/mapa",
    pasos: [
      "Un estado con la mitad del surtido saturado y la otra mitad en quiebre promedia sano. El promedio esconde las dos cosas que hay que atender.",
      "Por eso el color se decide por dónde está el dinero: capital parado contra venta perdida, no por la cobertura promedio.",
      "Al abrir un estado se ve el desglose: cuánto capital está detenido y cuánta venta se está dejando de hacer.",
    ],
  },
  {
    id: "umbral",
    titulo: "Qué significa el umbral de la barra superior",
    resumen: "Cuántas semanas de cobertura se consideran demasiadas, y por qué se puede mover.",
    claves: ["umbral", "semanas", "cobertura", "saturado", "filtro"],
    pasos: [
      "El umbral son las semanas de cobertura por encima de las cuales una combinación se considera saturada.",
      "Está en 12 semanas por omisión, que es lo que el canal departamental suele aceptar.",
      "Moverlo recalcula las alertas de toda la plataforma en el momento: a 8 semanas salen más alertas, a 16 menos.",
      "No cambia los datos, cambia el criterio. Es la perilla que conviene mover frente al comprador cuando discuta el número.",
    ],
  },
  {
    id: "niveles",
    titulo: "Los niveles por los que se puede cortar",
    resumen: "Marca, segmento, colección, modelo, género y material, y cuándo usar cada uno.",
    claves: ["niveles", "marca", "genero", "material", "coleccion", "modelo", "segmento", "jerarquia"],
    pasos: [
      "Del lado de producto hay seis: Marca, Segmento, Colección, Modelo, Género y Material.",
      "Marca es el primer nivel de negociación: el comprador de la cadena negocia por marca.",
      "Colección y modelo no son lo mismo. Tsuyosa es la colección; CTZ-TS1525 es el modelo, y es el nivel al que se resurte.",
      "Género y material son los niveles con los que compra la cadena, no los que usa la marca para fabricar.",
      "Los tres primeros están en la barra superior. Género y material se despliegan con el botón Más filtros.",
    ],
  },
  {
    id: "escenarios",
    titulo: "Mover un supuesto y ver el efecto en el EBITDA",
    resumen: "Cómo se usa la pantalla de Escenarios y qué se propaga.",
    claves: ["escenario", "supuesto", "ebitda", "planeacion", "proyeccion", "simulacion"],
    ruta: "/planeacion",
    pasos: [
      "El plan se calcula sobre sell-in: lo que la marca le vende a las cadenas. Cada escenario tiene diez supuestos editables: crecimiento, precio, servicio, mercadotecnia, días objetivo, liquidación y el resto.",
      "Al mover uno, el cambio se propaga por el modelo hasta el EBITDA, y la pantalla muestra el resultado contra el escenario base.",
      "El escenario Base está bloqueado a propósito: es la referencia contra la que se compara todo lo demás.",
      "Estado de resultados muestra el P&L trimestral del escenario activo contra el plan comprometido. El sell-out aparece aparte, como lo que cada cadena ya vendió.",
    ],
  },
  {
    id: "copiloto",
    titulo: "Qué hace Argos y qué no",
    resumen: "Las tres capas del copiloto y por qué no puede inventar una cifra.",
    claves: ["argos", "copiloto", "ia", "inteligencia artificial", "chatgpt", "claude", "modelo"],
    ruta: "/copiloto",
    pasos: [
      "Los hallazgos salen de un motor de nueve reglas, determinista y siempre disponible. Cada uno declara la regla que lo disparó y los números que la cumplieron.",
      "Las preguntas las contesta un motor de consulta que calcula sobre el corte: entiende la medida, el periodo y de quién se habla, y da la cifra. Por ejemplo: sell-out de esta semana por cadena.",
      "Cuando hay un modelo de lenguaje conectado, redacta la respuesta con ese cálculo como evidencia. No calcula nada por su cuenta, por eso no puede inventar una cifra.",
      "La memoria: lo que el equipo marca como útil o descarta se guarda como una lección y entra al contexto de la siguiente consulta.",
      "El botón de abajo a la derecha abre a Argos desde cualquier pantalla, y sabe en cuál estás parado.",
      "Si le preguntas algo que no es del tablero, lo dice en una línea: no es un asistente de propósito general.",
    ],
  },
  {
    id: "exportar",
    titulo: "Bajar los datos a Excel",
    resumen: "Cada pantalla baja su propio libro, con indicadores, gráficas y fórmulas.",
    claves: ["exportar", "excel", "descargar", "csv", "bajar", "xlsx", "archivo"],
    ruta: "/reportes",
    pasos: [
      "Al pie de cada pantalla hay una barra de descarga. Baja el libro de esa pantalla con los filtros que tengas puestos: Resumen, Mapa, Qué atender, Detalle, Reportes, Escenarios, Estado de resultados, Copiloto y Salud del dato.",
      "Todo libro abre en una hoja Tablero: los indicadores arriba, los supuestos en celdas azules y las gráficas abajo. El detalle va en hojas aparte.",
      "Las celdas azules se mueven. Al cambiar el umbral, los días objetivo o un supuesto del plan, las fórmulas recalculan el libro completo.",
      "En Reportes, además, el botón CSV baja la tabla cruda, con punto y coma como separador.",
      "Si necesitas el detalle crudo sin agrupar, pon Punto de venta y Modelo como filas y enciende las medidas que ocupes antes de bajar el CSV.",
    ],
  },
  {
    id: "simulador",
    titulo: "Simular en Excel sin tocar la plataforma",
    resumen:
      "El libro que se descarga trae fórmulas vivas y gráficas: se mueve un supuesto y todo se recalcula dentro de Excel.",
    claves: [
      "simulador",
      "simulacion",
      "excel dinamico",
      "graficas",
      "editable",
      "escenario en excel",
      "tabla dinamica de excel",
      "pivote",
    ],
    ruta: "/reportes",
    pasos: [
      "En Reportes, el botón Simulador del corte baja un libro con el corte completo y sus palancas.",
      "La hoja Datos trae el corte completo del alcance filtrado, una línea por tienda y modelo, con filtros puestos en los encabezados. Desde ahí se puede insertar una tabla dinámica de Excel en dos clics.",
      "La hoja Tablero tiene cinco celdas azules: crecimiento del sell-in, cambio de precio, umbral de cobertura, parte del excedente que se liquida y descuento. Al cambiarlas, el sell-in simulado, las piezas sobre el umbral y el capital inmovilizado se recalculan solos.",
      "Las hojas Cadenas y Colecciones traen el sell-in y el sell-out, en piezas y en monto, con dos gráficas que siguen a esas tablas.",
      "Todo lo de abajo son fórmulas de Excel, no valores pegados: si alguien cambia un dato de la hoja Datos, el resto se ajusta.",
      "El umbral del simulador hace lo mismo que el de la plataforma: a 8 semanas sale más excedente, a 16 menos.",
    ],
  },
  {
    id: "salud",
    titulo: "Qué tanto del negocio es realmente visible",
    resumen: "Qué mide la cobertura de reporte y qué decisiones se vuelven inseguras con ella.",
    claves: ["salud del dato", "cobertura de reporte", "sin dato", "no reporta", "confiabilidad"],
    ruta: "/salud",
    pasos: [
      "Una tienda que no entrega sell-out no tiene cobertura calculable: sin denominador no hay cálculo.",
      "Esas sucursales muestran existencia pero aparecen como Sin dato, y quedan fuera del excedente y del resurtido sugerido.",
      "La pantalla Salud del dato dice qué porcentaje de la red entrega información y qué decisiones conviene no tomar por debajo de cierto nivel.",
    ],
  },
];

export type Novedad = {
  fecha: string;
  tipo: "Novedad" | "Corrección";
  titulo: string;
  cuerpo: string;
};

export const NOVEDADES: Novedad[] = [
  {
    fecha: "2026-11-20",
    tipo: "Novedad",
    titulo: "El mapa a pantalla completa",
    cuerpo:
      "En Mapa de alertas, un clic en cualquiera de los dos mapas lo amplía a toda la pantalla, con un acercamiento que sale desde donde estaba. Ya ampliado, un clic en un estado o en una bandera abre su detalle, y arriba se pasa del corte anterior al actual sin salir. Se cierra con Esc o con un clic fuera.",
  },
  {
    fecha: "2026-11-20",
    tipo: "Novedad",
    titulo: "Las semanas dicen sus fechas",
    cuerpo:
      "Donde antes solo decía S35 o S46 ahora también dice de qué día a qué día va esa semana: en la gráfica de sell-in contra sell-out, en los dos mapas, en la barra lateral, en las respuestas de Argos y en los libros de Excel.",
  },
  {
    fecha: "2026-11-20",
    tipo: "Novedad",
    titulo: "Calendario de periodo",
    cuerpo:
      "Junto al umbral hay una pastilla Periodo que abre un calendario. Se elige de qué día a qué día, o de qué semana a qué semana, y el sell-out, el sell-in y los Top 10 se suman dentro de ese periodo.",
  },
  {
    fecha: "2026-11-20",
    tipo: "Novedad",
    titulo: "Corte anterior contra corte actual",
    cuerpo:
      "El Mapa de alertas enseña los dos cortes lado a lado y enlista qué alertas se resolvieron, cuáles son nuevas y cuáles siguen, con piezas y monto. Sustituye al botón de marcar como atendida.",
  },
  {
    fecha: "2026-11-20",
    tipo: "Novedad",
    titulo: "Top 10 de sell-in y piezas en todo",
    cuerpo:
      "El Resumen trae dos Top 10: el de sell-out y el de sell-in, con piezas, monto y número de ítems. Todas las pantallas muestran piezas y monto, no solo porcentaje.",
  },
  {
    fecha: "2026-11-20",
    tipo: "Novedad",
    titulo: "Resurtir en lugar de embarcar, y sin traslados",
    cuerpo:
      "Las decisiones ahora son No resurtir y Resurtir. Se quitaron los traslados entre tiendas, porque mover la mercancía ya resurtida es decisión de la cadena. Los escenarios y el estado de resultados se calculan sobre sell-in.",
  },
  {
    fecha: "2026-11-20",
    tipo: "Novedad",
    titulo: "Los libros de Excel, al día",
    cuerpo:
      "Los libros que se descargan traen lo mismo que las pantallas: piezas y monto, sell-out y sell-in del periodo elegido, los dos Top 10, la comparación contra el corte anterior en el libro del mapa y el plan sobre sell-in. Ya no hay hoja de traslados y la de No embarcar ahora es No resurtir.",
  },
  {
    fecha: "2026-11-20",
    tipo: "Novedad",
    titulo: "Cada pantalla baja su propio Excel",
    cuerpo:
      "Al pie de cada pantalla hay una barra de descarga. Baja un libro con el tablero de indicadores, las gráficas y las fórmulas de esa pantalla, con los filtros que tengas puestos. Las celdas azules son supuestos: al moverlas se recalcula el libro completo.",
  },
  {
    fecha: "2026-11-20",
    tipo: "Novedad",
    titulo: "Argos contesta con el dato exacto",
    cuerpo:
      "Argos ya calcula lo que se le pregunta: sell-out, sell-in, inventario, cobertura, capital, quiebres o resurtido; por cadena, colección, estado, tienda o modelo; de la semana, del mes o de las últimas 8 y 12 semanas. Si la pregunta no es del tablero, lo dice en una línea.",
  },
  {
    fecha: "2026-11-20",
    tipo: "Corrección",
    titulo: "El mapa vuelve a abrir el detalle",
    cuerpo:
      "Al dar clic en un estado o en una bandera la pantalla se oscurecía y no aparecía nada. El cajón con el resumen de la incidencia ya abre: qué pasa, dónde no resurtir y dónde resurtir.",
  },
  {
    fecha: "2026-11-19",
    tipo: "Novedad",
    titulo: "Excel con simulador y gráficas",
    cuerpo:
      "Desde Reportes ya se baja un libro de Excel con tres hojas: el corte completo, un simulador de siete supuestos que recalcula hasta el EBITDA, y un resumen con dos gráficas. Son fórmulas vivas, no valores pegados.",
  },
  {
    fecha: "2026-11-19",
    tipo: "Novedad",
    titulo: "Reportes con tabla dinámica",
    cuerpo:
      "Ya puedes armar tu propio reporte eligiendo hasta tres niveles de filas, una dimensión de columnas y las medidas que ocupes. Trae cuatro plantillas listas y descarga a CSV.",
  },
  {
    fecha: "2026-11-19",
    tipo: "Novedad",
    titulo: "Comparativo contra el año anterior",
    cuerpo:
      "Cada medida de venta tiene ahora su columna del mismo corte del año pasado y su variación en porcentaje, con color: verde si creció, rojo si cayó.",
  },
  {
    fecha: "2026-11-19",
    tipo: "Novedad",
    titulo: "Marca, género y material",
    cuerpo:
      "Tres niveles nuevos para cortar y filtrar. Marca está en la barra superior; género y material se despliegan con Más filtros.",
  },
  {
    fecha: "2026-11-19",
    tipo: "Novedad",
    titulo: "Argos, disponible desde cualquier pantalla",
    cuerpo:
      "El copiloto dejó de vivir solo en su pestaña. El botón de abajo a la derecha lo abre encima de la pantalla en la que estés, y sabe en cuál estás: al abrirse dice qué ve ahí, con las cifras de los filtros que tengas puestos.",
  },
  {
    fecha: "2026-11-19",
    tipo: "Corrección",
    titulo: "El menú se lee en bloques",
    cuerpo:
      "Las ocho pantallas corridas no dejaban ver dónde terminaba la ejecución de la semana y dónde empezaba la planeación del año. Cada grupo quedó en su propio cuadro, con su color.",
  },
  {
    fecha: "2026-11-18",
    tipo: "Novedad",
    titulo: "El copiloto aprende de lo que descartas",
    cuerpo:
      "Cuando marcas una recomendación como útil o la descartas, eso se guarda como una lección y entra al contexto de la siguiente consulta. Un hallazgo descartado deja de proponerse.",
  },
];

/** Busca por título, resumen y palabras clave. Sin magia: coincidencia simple. */
export function buscarGuias(q: string): Guia[] {
  const t = q.trim().toLowerCase();
  if (!t) return GUIAS;
  const palabras = t.split(/\s+/).filter((w) => w.length > 2);
  if (!palabras.length) return GUIAS;
  const puntua = (g: Guia) => {
    const heno = `${g.titulo} ${g.resumen} ${g.claves.join(" ")} ${g.pasos.join(" ")}`
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
    return palabras.filter((w) =>
      heno.includes(w.normalize("NFD").replace(/[̀-ͯ]/g, ""))
    ).length;
  };
  return GUIAS.map((g) => ({ g, p: puntua(g) }))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p)
    .map((x) => x.g);
}
