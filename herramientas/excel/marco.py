# -*- coding: utf-8 -*-
"""
El marco común de los libros de Excel de MarkaLab BI.

Cada pantalla del BI baja su propio libro, y todos están hechos con las mismas
piezas. Lo que este archivo fija, de una vez y para todos:

  LA FORMA. Todo libro abre en una hoja `Tablero`: una banda con el título,
  una fila de indicadores, el bloque de supuestos --las celdas azules, las
  únicas que se mueven-- y las gráficas. El detalle vive en hojas aparte y el
  corte completo en `Datos`.

  LAS GRÁFICAS. Título, ejes a la vista, etiquetas de dato, un solo color de
  marca. Las versiones anteriores salían sin nada de eso en Excel de verdad:
  barras de colores distintos, sin nombres y sin cifras. El motivo es una
  rareza de la librería: si no se le dice explícitamente que NO borre los
  ejes, Excel los esconde, y si no se le dice que NO varíe los colores, pinta
  cada barra de uno distinto. LibreOffice lo perdona y por eso no se veía al
  revisar. Aquí queda dicho explícitamente en un solo lugar.

  LAS FÓRMULAS. Los indicadores y las tablas se calculan con fórmulas que
  leen `Datos` a través de las celdas azules. Mover una celda azul vuelve a
  clasificar el corte entero.

  EL MANIFIESTO. Cada libro declara qué celdas llena la plataforma y con qué
  nombre. El servidor lee ese manifiesto en vez de saberse las direcciones de
  memoria: si mañana un indicador cambia de celda, cambia aquí y nada más.
"""

from openpyxl import Workbook
from openpyxl.chart import BarChart, LineChart, Reference
from openpyxl.chart.label import DataLabelList
from openpyxl.chart.layout import Layout, ManualLayout
from openpyxl.chart.shapes import GraphicalProperties
from openpyxl.chart.text import RichText, Text
from openpyxl.chart.title import Title
from openpyxl.drawing.line import LineProperties
from openpyxl.drawing.text import (
    CharacterProperties, Font as FuenteDibujo, Paragraph, ParagraphProperties, RegularTextRun,
)
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.workbook.properties import CalcProperties

import os

# Las rutas salen de dónde está este archivo, no de una máquina en particular.
RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DESTINO = os.path.join(RAIZ, "public", "plantillas") + os.sep
FILAS = 5000
PRIMERA = 2

TINTA = "0C1A2E"
ACENTO = "1F5FD8"
NARANJA = "E07B39"
VERDE = "2E9E6B"
ROJO = "C8443C"
GRIS = "5B6B7C"
PAPEL = "F4F6F9"
HAIR = "D9E0E6"
ENTRADA = "E8F0FE"

NUM = "#,##0"
DEC = "#,##0.0"
DINERO = '"$"#,##0'
MILLONES = '"$"#,##0.0,," M"'
PORC = "0.0%"
SEM = '0.0" sem"'

fino = Side(style="thin", color=HAIR)
azul = Side(style="thin", color=ACENTO)
CAJA = Border(top=fino, bottom=fino, left=fino, right=fino)

# El contrato con lib/excel.ts. Orden y nombre tienen que coincidir.
COLUMNAS_DATOS = [
    ("Cadena", 20), ("Formato", 16), ("Estado", 18), ("Ciudad", 18),
    ("Punto de venta", 28), ("Marca", 11), ("Segmento", 12), ("Colección", 16),
    ("SKU", 13), ("Modelo", 30), ("Género", 10), ("Material", 14),
    ("Precio", 11), ("Costo", 11), ("Piezas", 9), ("Tránsito", 9),
    ("Sell-out semanal", 14), ("Sell-out 8 sem", 13), ("Sell-out 8 sem ant", 15),
    ("Venta $", 14), ("Venta $ año ant", 15), ("Costo $", 14),
    ("Cobertura sem", 12), ("Excedente", 10), ("Capital inmovilizado", 17),
    ("Venta perdida sem", 15), ("Sugerido", 10), ("Impacto $", 13),
    ("Días en canal", 11), ("Sell-out última sem", 15), ("Sell-out 4 sem", 13),
    ("Reporta", 9),
]
D = {n: get_column_letter(i + 1) for i, (n, _) in enumerate(COLUMNAS_DATOS)}


def R(col: str) -> str:
    """El rango completo de una columna de Datos, en absoluto."""
    return f"Datos!${D[col]}${PRIMERA}:${D[col]}${FILAS}"


# --- Los pedazos de fórmula que se repiten. La regla vive en UN lugar. ------

def f_exc(u: str) -> str:
    """Piezas sobre el umbral, por renglón, solo donde hay sell-out reportado."""
    base = f"ROUND({R('Piezas')}-{R('Sell-out semanal')}*{u},0)"
    return f"({base}*({base}>0)*({R('Reporta')}=1))"


def f_perdida() -> str:
    """Venta perdida semanal: existencia en cero con desplazamiento vivo."""
    return (f"(({R('Reporta')}=1)*({R('Piezas')}=0)*({R('Sell-out semanal')}>0.15)"
            f"*{R('Sell-out semanal')}*{R('Precio')})")


def f_quiebre() -> str:
    return (f"(({R('Reporta')}=1)*({R('Sell-out semanal')}>0.15)"
            f"*({R('Piezas')}<2.5*{R('Sell-out semanal')}))")


def f_sobre(u: str) -> str:
    return (f"(({R('Reporta')}=1)*({R('Piezas')}>0)"
            f"*({R('Piezas')}>{u}*{R('Sell-out semanal')}))")


# ---------------------------------------------------------------------------
# El libro
# ---------------------------------------------------------------------------

class Libro:
    def __init__(self, clave, archivo, titulo, bajada):
        self.clave = clave
        self.archivo = archivo
        self.wb = Workbook()
        self.wb.calculation = CalcProperties(fullCalcOnLoad=True)
        self.celdas = {}      # nombre lógico -> [hoja, celda]
        self.hojas = {}       # hoja -> opciones para el servidor
        self.tb = self.wb.active
        self.tb.title = "Tablero"
        self._tablero(titulo, bajada)
        self._kpi = 0
        self._sup = None

    # -- la hoja de entrada ------------------------------------------------
    def _tablero(self, titulo, bajada):
        tb = self.tb
        tb.sheet_view.showGridLines = False
        tb.sheet_view.zoomScale = 90
        tb.column_dimensions["A"].width = 2.5
        for i in range(2, 14):
            tb.column_dimensions[get_column_letter(i)].width = 14.5
        tb.column_dimensions["N"].width = 2.5

        tb.merge_cells("B1:M1")
        tb["B1"] = f"MarkaLab BI  ·  {titulo}"
        tb["B1"].font = Font(name="Calibri", size=16, bold=True, color="FFFFFF")
        tb["B1"].alignment = Alignment(vertical="center", indent=1)
        for col in range(1, 15):
            tb.cell(row=1, column=col).fill = PatternFill("solid", fgColor=TINTA)
        tb.row_dimensions[1].height = 34

        tb.merge_cells("B2:M2")
        tb["B2"] = "Corte"
        tb["B2"].font = Font(name="Calibri", size=10, color="FFFFFF")
        tb["B2"].alignment = Alignment(vertical="center", indent=1)
        for col in range(1, 15):
            tb.cell(row=2, column=col).fill = PatternFill("solid", fgColor="16294A")
        tb.row_dimensions[2].height = 20
        self.celdas["subtitulo"] = ["Tablero", "B2"]

        tb.merge_cells("B3:M3")
        tb["B3"] = bajada
        tb["B3"].font = Font(name="Calibri", size=9, italic=True, color=GRIS)
        tb["B3"].alignment = Alignment(vertical="center", indent=1, wrap_text=True)
        tb.row_dimensions[3].height = 30

        tb.page_setup.orientation = "landscape"
        tb.page_setup.fitToWidth = 1
        tb.page_setup.fitToHeight = 0
        tb.sheet_properties.pageSetUpPr.fitToPage = True

    def kpi(self, nombre, etiqueta, formula, formato=NUM, nota="", tono=TINTA):
        """Una tarjeta de indicador. Seis por fila, dos columnas cada una."""
        tb = self.tb
        i = self._kpi
        self._kpi += 1
        fila = 5 + (i // 6) * 4
        c0 = 2 + (i % 6) * 2
        a, b = get_column_letter(c0), get_column_letter(c0 + 1)
        for r in range(fila, fila + 3):
            for c in (c0, c0 + 1):
                tb.cell(row=r, column=c).fill = PatternFill("solid", fgColor=PAPEL)
        for r, alto in ((fila, 16), (fila + 1, 30), (fila + 2, 26)):
            tb.merge_cells(f"{a}{r}:{b}{r}")
            tb.row_dimensions[r].height = alto
        tb[f"{a}{fila}"] = etiqueta.upper()
        tb[f"{a}{fila}"].font = Font(name="Calibri", size=8, bold=True, color=GRIS)
        tb[f"{a}{fila}"].alignment = Alignment(indent=1, vertical="bottom")
        tb[f"{a}{fila + 1}"] = formula
        tb[f"{a}{fila + 1}"].font = Font(name="Calibri", size=18, bold=True, color=tono)
        tb[f"{a}{fila + 1}"].number_format = formato
        tb[f"{a}{fila + 1}"].alignment = Alignment(horizontal="left", indent=1, vertical="center")
        tb[f"{a}{fila + 2}"] = nota
        tb[f"{a}{fila + 2}"].font = Font(name="Calibri", size=8, color=GRIS)
        tb[f"{a}{fila + 2}"].alignment = Alignment(indent=1, vertical="top", wrap_text=True)
        # El borde de la tarjeta: arriba una línea del color de la marca.
        for c in (c0, c0 + 1):
            tb.cell(row=fila, column=c).border = Border(top=Side(style="medium", color=ACENTO))
        self.celdas[nombre] = ["Tablero", f"{a}{fila + 1}"]
        return f"Tablero!${a}${fila + 1}"

    def fila_libre(self):
        """El primer renglón debajo de las tarjetas."""
        return 5 + ((self._kpi + 5) // 6) * 4

    def seccion(self, fila, texto, col="B", hasta="M"):
        tb = self.tb
        tb[f"{col}{fila}"] = texto
        tb[f"{col}{fila}"].font = Font(name="Calibri", size=11, bold=True, color=TINTA)
        c0, c1 = tb[f"{col}{fila}"].column, tb[f"{hasta}{fila}"].column
        for c in range(c0, c1 + 1):
            tb.cell(row=fila, column=c).border = Border(bottom=Side(style="thin", color=TINTA))
        tb.row_dimensions[fila].height = 20

    def supuesto(self, fila, nombre, etiqueta, valor, formato=NUM, nota="", col="B"):
        """Una celda azul. Etiqueta en tres columnas, valor en la cuarta."""
        tb = self.tb
        c0 = tb[f"{col}{fila}"].column
        v = get_column_letter(c0 + 3)
        tb.merge_cells(start_row=fila, start_column=c0, end_row=fila, end_column=c0 + 2)
        tb[f"{col}{fila}"] = etiqueta
        tb[f"{col}{fila}"].font = Font(name="Calibri", size=10, color=TINTA)
        tb[f"{col}{fila}"].alignment = Alignment(indent=1, vertical="center")
        tb[f"{v}{fila}"] = valor
        tb[f"{v}{fila}"].fill = PatternFill("solid", fgColor=ENTRADA)
        tb[f"{v}{fila}"].font = Font(name="Calibri", size=11, bold=True, color=ACENTO)
        tb[f"{v}{fila}"].number_format = formato
        tb[f"{v}{fila}"].border = Border(top=azul, bottom=azul, left=azul, right=azul)
        tb[f"{v}{fila}"].alignment = Alignment(horizontal="right", vertical="center")
        if nota:
            n = get_column_letter(c0 + 4)
            tb[f"{n}{fila}"] = nota
            tb[f"{n}{fila}"].font = Font(name="Calibri", size=8, italic=True, color=GRIS)
            tb[f"{n}{fila}"].alignment = Alignment(vertical="center", indent=1)
        tb.row_dimensions[fila].height = 19
        self.celdas[nombre] = ["Tablero", f"{v}{fila}"]
        return f"Tablero!${v}${fila}"

    def resultado(self, fila, nombre, etiqueta, formula, formato=NUM, col="H", fuerte=False):
        """Una salida calculada, a la derecha de los supuestos."""
        tb = self.tb
        c0 = tb[f"{col}{fila}"].column
        v = get_column_letter(c0 + 4)
        tb.merge_cells(start_row=fila, start_column=c0, end_row=fila, end_column=c0 + 3)
        tb[f"{col}{fila}"] = etiqueta
        tb[f"{col}{fila}"].font = Font(name="Calibri", size=10, bold=fuerte, color=TINTA)
        tb[f"{col}{fila}"].alignment = Alignment(indent=1, vertical="center")
        tb.merge_cells(start_row=fila, start_column=c0 + 4, end_row=fila, end_column=c0 + 5)
        tb[f"{v}{fila}"] = formula
        tb[f"{v}{fila}"].number_format = formato
        tb[f"{v}{fila}"].font = Font(name="Calibri", size=11 if fuerte else 10, bold=True, color=TINTA)
        tb[f"{v}{fila}"].alignment = Alignment(horizontal="right", vertical="center")
        for c in range(c0, c0 + 6):
            tb.cell(row=fila, column=c).border = Border(bottom=fino)
        tb.row_dimensions[fila].height = 19
        if nombre:
            self.celdas[nombre] = ["Tablero", f"{v}{fila}"]
        return f"Tablero!${v}${fila}"

    def leyenda(self, fila, texto):
        tb = self.tb
        tb.merge_cells(f"B{fila}:M{fila}")
        tb[f"B{fila}"] = texto
        tb[f"B{fila}"].font = Font(name="Calibri", size=8, italic=True, color=GRIS)
        tb[f"B{fila}"].alignment = Alignment(indent=1, wrap_text=True, vertical="top")
        tb.row_dimensions[fila].height = 26

    # -- hojas de detalle --------------------------------------------------
    def hoja(self, nombre, columnas, formatos=None, sobrantes="conservar", recorte=None):
        """
        Una hoja de tabla. `columnas` es [(título, ancho)]; `formatos` es
        {número de columna: formato}. El formato va en la COLUMNA porque el
        servidor reescribe los renglones y les pone el estilo de la columna.
        """
        ws = self.wb.create_sheet(nombre)
        for i, (t, ancho) in enumerate(columnas, start=1):
            c = ws.cell(row=1, column=i, value=t)
            c.font = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
            c.fill = PatternFill("solid", fgColor=TINTA)
            c.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
            ws.column_dimensions[get_column_letter(i)].width = ancho
        ws.row_dimensions[1].height = 30
        for col, fmt in (formatos or {}).items():
            ws.column_dimensions[get_column_letter(col)].number_format = fmt
        ws.freeze_panes = "B2"
        ws.auto_filter.ref = f"A1:{get_column_letter(len(columnas))}1"
        ws.print_title_rows = "1:1"
        ws.page_setup.orientation = "landscape"
        ws.page_setup.fitToWidth = 1
        ws.page_setup.fitToHeight = 0
        ws.sheet_properties.pageSetUpPr.fitToPage = True
        ws._formatos = formatos or {}
        opciones = {"sobrantes": sobrantes}
        if recorte:
            opciones["recorte"] = recorte
        self.hojas[nombre] = opciones
        return ws

    def fx(self, ws, col, fila, formula):
        """
        Una fórmula de tabla, con el formato de su columna. El formato se pone
        también en la celda: el servidor conserva el estilo de las celdas con
        fórmula tal como vienen en la plantilla.
        """
        from openpyxl.utils import column_index_from_string
        c = ws[f"{col}{fila}"]
        c.value = formula
        fmt = ws._formatos.get(column_index_from_string(col))
        if fmt:
            c.number_format = fmt

    def datos(self):
        ws = self.wb.create_sheet("Datos")
        for i, (nombre, ancho) in enumerate(COLUMNAS_DATOS, start=1):
            c = ws.cell(row=1, column=i, value=nombre)
            c.font = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
            c.fill = PatternFill("solid", fgColor=TINTA)
            c.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
            ws.column_dimensions[get_column_letter(i)].width = ancho
        ws.row_dimensions[1].height = 30
        for i in range(13, len(COLUMNAS_DATOS) + 1):
            ws.column_dimensions[get_column_letter(i)].number_format = "#,##0.##"
        ws.freeze_panes = "A2"
        ws.auto_filter.ref = f"A1:{get_column_letter(len(COLUMNAS_DATOS))}1"
        self.hojas["Datos"] = {"sobrantes": "conservar"}
        return ws

    # -- gráficas ----------------------------------------------------------
    def barras(self, ws, ancla, titulo, valores, categorias, *, horizontal=True,
               formato=NUM, alto=8.2, ancho=16.6, colores=None, leyenda=False,
               etiquetas=True, maximo=None):
        """
        Barras con título, nombres y cifras.

        `valores` es una Reference que incluye el renglón de encabezado: de
        ahí sale el nombre de cada serie. Puede traer varias columnas.
        """
        g = BarChart()
        g.type = "bar" if horizontal else "col"
        g.grouping = "clustered"
        g.varyColors = False            # un solo color por serie, no uno por barra
        g.gapWidth = 55
        g.height, g.width = alto, ancho
        g.title = _titulo(titulo)
        g.add_data(valores, titles_from_data=True)
        g.set_categories(categorias)
        _series(g, colores or [ACENTO, NARANJA, VERDE], formato, etiquetas)
        _ejes(g, formato)
        if horizontal:
            # El primero de la tabla arriba, que es como se lee un ranking.
            g.x_axis.scaling.orientation = "maxMin"
            # Con la cifra sobre cada barra, el eje de valores sale sobrando.
            g.y_axis.delete = etiquetas
            g.y_axis.majorGridlines = None
        if maximo is not None:
            # Un porcentaje no pasa de 100: sin tope, el eje se va a 120%.
            g.y_axis.scaling.max = maximo
            g.y_axis.scaling.min = 0
        g.legend = None
        if leyenda:
            from openpyxl.chart.legend import Legend
            g.legend = Legend()
            g.legend.position = "b"
        ws.add_chart(g, ancla)
        return g

    def lineas(self, ws, ancla, titulo, valores, categorias, *, formato=NUM,
               alto=8.2, ancho=16.6, colores=None):
        g = LineChart()
        g.height, g.width = alto, ancho
        g.title = _titulo(titulo)
        g.add_data(valores, titles_from_data=True)
        g.set_categories(categorias)
        for s, color in zip(g.series, colores or [NARANJA, ACENTO, VERDE]):
            s.graphicalProperties = GraphicalProperties()
            s.graphicalProperties.line = LineProperties(solidFill=color, w=28575)
            s.marker.symbol = "circle"
            s.marker.size = 5
            s.marker.graphicalProperties = GraphicalProperties(solidFill=color)
            s.marker.graphicalProperties.line = LineProperties(solidFill=color)
            s.smooth = False
        _ejes(g, formato)
        from openpyxl.chart.legend import Legend
        g.legend = Legend()
        g.legend.position = "b"
        ws.add_chart(g, ancla)
        return g

    # -- cierre ------------------------------------------------------------
    def guardar(self):
        ruta = DESTINO + self.archivo
        self.wb.save(ruta)
        _categorias_como_texto(ruta)
        return {
            "archivo": self.archivo,
            "celdas": self.celdas,
            "hojas": self.hojas,
        }


# ---------------------------------------------------------------------------
# El detalle de las gráficas
# ---------------------------------------------------------------------------

def _letra(tam, negrita=False, color=TINTA):
    return CharacterProperties(sz=tam, b=negrita, solidFill=color,
                               latin=FuenteDibujo(typeface="Calibri"))


def _titulo(texto):
    cp = _letra(1200, True)
    p = Paragraph(pPr=ParagraphProperties(defRPr=cp), r=[RegularTextRun(rPr=cp, t=texto)])
    t = Title(tx=Text(rich=RichText(p=[p])), overlay=False)
    return t


def _texto_eje(color=GRIS, tam=900):
    cp = _letra(tam, False, color)
    # `r=[]` a propósito: si no se le pasa, la librería mete una corrida de
    # texto vacía dentro de las propiedades, y eso no es válido ahí.
    return RichText(p=[Paragraph(pPr=ParagraphProperties(defRPr=cp), endParaRPr=cp, r=[])])


def _ejes(g, formato):
    for eje in (g.x_axis, g.y_axis):
        eje.delete = False               # sin esto, Excel esconde el eje
        eje.txPr = _texto_eje()
        eje.title = None
        eje.graphicalProperties = GraphicalProperties()
        eje.graphicalProperties.line = LineProperties(solidFill="BFC8D2")
    g.y_axis.numFmt = formato
    g.y_axis.number_format = formato
    if g.y_axis.majorGridlines is not None:
        g.y_axis.majorGridlines.spPr = GraphicalProperties()
        g.y_axis.majorGridlines.spPr.line = LineProperties(solidFill="E6EAEF")
    g.x_axis.majorGridlines = None
    g.x_axis.tickLblPos = "low"          # los nombres abajo aunque haya negativos


def _series(g, colores, formato, etiquetas):
    for s, color in zip(g.series, colores):
        s.graphicalProperties = GraphicalProperties(solidFill=color)
        s.graphicalProperties.line = LineProperties(solidFill=color)
        s.invertIfNegative = False
        if etiquetas:
            d = DataLabelList()
            d.showVal = True
            d.showSerName = False
            d.showCatName = False
            d.showLegendKey = False
            d.showPercent = False
            d.numFmt = formato
            d.position = "outEnd"
            d.txPr = _texto_eje(TINTA, 900)
            s.dLbls = d


def _categorias_como_texto(ruta):
    """
    openpyxl declara las categorías como `numRef` aunque sean texto, y algunos
    visores dibujan 1, 2, 3 en vez de los nombres. Se corrige sobre el archivo.
    De paso se le pone `sourceLinked="0"` al formato de las etiquetas: sin eso
    Excel ignora el formato y enseña el número crudo.
    """
    import re
    import zipfile

    with zipfile.ZipFile(ruta) as z:
        piezas = {n: z.read(n) for n in z.namelist()}
    for n in list(piezas):
        if not n.startswith("xl/charts/chart"):
            continue
        xml = piezas[n].decode("utf-8")
        xml = re.sub(r"<cat><numRef>(<f>[^<]*</f>)</numRef></cat>",
                     r"<cat><strRef>\1</strRef></cat>", xml)
        xml = re.sub(r'<numFmt formatCode="([^"]*)"\s*/>',
                     r'<numFmt formatCode="\1" sourceLinked="0"/>', xml)
        piezas[n] = xml.encode("utf-8")
    with zipfile.ZipFile(ruta, "w", zipfile.ZIP_DEFLATED) as z:
        for n, b in piezas.items():
            z.writestr(n, b)
