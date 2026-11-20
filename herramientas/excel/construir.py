# -*- coding: utf-8 -*-
"""
Construye los libros de Excel de MarkaLab BI, uno por pantalla, y el
manifiesto que le dice al servidor qué celda es cuál.

    python3 construir.py            # todos
    python3 construir.py mapa       # uno

Cada función de aquí abajo es un libro. Se leen de arriba abajo igual que el
libro: indicadores, supuestos, hojas de detalle, gráficas, datos.

Una regla que atraviesa todos: la plataforma manda lo que NO depende de los
supuestos, y lo que SÍ depende es fórmula. Eso es lo que hace que el archivo
simule en vez de traer una foto.
"""

import json
import sys

from openpyxl.chart import Reference
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter as L

from marco import (
    ACENTO, DEC, DINERO, GRIS, Libro, MILLONES, NARANJA, NUM, PORC, R, ROJO,
    SEM, TINTA, VERDE, f_exc, f_perdida, f_quiebre, f_sobre,
)

import os

from marco import RAIZ

MANIFIESTO = os.path.join(RAIZ, "lib", "plantillas.json")
CURVA = [0.74, 0.7, 0.82, 0.88, 1.18, 0.9, 0.86, 0.84, 0.88, 0.96, 1.12, 2.02]
MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]


def guarda(fila):
    """Las fórmulas de tabla no calculan nada en un renglón sin nombre."""
    return f'IF($A{fila}="","",'


def T(b, nombre):
    """La dirección absoluta de una celda con nombre del Tablero."""
    c = b.celdas[nombre][1]
    col = "".join(ch for ch in c if ch.isalpha())
    fila = "".join(ch for ch in c if ch.isdigit())
    return f"Tablero!${col}${fila}"


# ===========================================================================
# RESUMEN  ·  la salud del canal en una pantalla
# ===========================================================================
def resumen():
    b = Libro("resumen", "resumen.xlsx", "Resumen",
              "La salud comercial del canal. Los indicadores y las tablas se calculan con fórmulas sobre la hoja "
              "Datos: si editas un renglón o mueves el umbral, todo el libro se recalcula.")

    b.kpi("sellout8", "Sell-out 8 semanas", f"=SUM({R('Sell-out 8 sem')})", NUM, "Piezas vendidas al consumidor")
    b.kpi("venta", "Venta 8 semanas", f"=SUM({R('Venta $')})", MILLONES, "A precio de lista")
    b.kpi("variacion", "Contra el año anterior", f"=IF(SUM({R('Venta $ año ant')})=0,0,SUM({R('Venta $')})/SUM({R('Venta $ año ant')})-1)",
          "+0.0%;-0.0%", "Mismo periodo del año pasado", VERDE)
    b.kpi("cobertura", "Cobertura del canal", f"=IF(SUM({R('Sell-out semanal')})>0,SUM({R('Piezas')})/SUM({R('Sell-out semanal')}),0)",
          SEM, "Piezas entre desplazamiento semanal")
    b.kpi("capital", "Capital inmovilizado", "=0", MILLONES, "Excedente sobre el umbral, a costo", ROJO)
    b.kpi("perdida", "Venta perdida semanal", f"=SUMPRODUCT({f_perdida()})", MILLONES, "Quiebres con desplazamiento vivo", ROJO)
    b.kpi("piezas", "Piezas en canal", f"=SUM({R('Piezas')})", NUM, "Existencia al corte")
    b.kpi("quiebres", "Combinaciones en quiebre", f"=SUMPRODUCT({f_quiebre()})", NUM, "Menos de 2.5 semanas con venta viva")
    b.kpi("sobre", "Combinaciones sobre umbral", "=0", NUM, "Con más cobertura de la objetivo")
    b.kpi("sellin", "Sell-in 12 semanas", "=SUM(Serie!$B$2:$B$13)", NUM, "Piezas embarcadas al canal")
    b.kpi("indice", "Índice de desplazamiento", "=IF(SUM(Serie!$B$2:$B$13)=0,0,SUM(Serie!$C$2:$C$13)/SUM(Serie!$B$2:$B$13))",
          PORC, "Sell-out entre sell-in, 12 semanas")
    b.kpi("margen", "Margen bruto", f"=IF(SUM({R('Venta $')})=0,0,(SUM({R('Venta $')})-SUM({R('Costo $')}))/SUM({R('Venta $')}))",
          PORC, "Sobre venta a precio de lista")

    f = b.fila_libre() + 1
    b.seccion(f, "Supuestos  ·  las celdas azules se mueven", "B", "F")
    b.seccion(f, "Lo que resulta", "H", "M")
    u = b.supuesto(f + 1, "umbral", "Umbral de cobertura", 12, SEM)
    tasa = b.supuesto(f + 2, "tasa", "Tasa financiera anual del inventario", 0.18, "0%")
    # Los dos indicadores que dependen del umbral se escriben ya que existe la celda.
    b.tb[b.celdas["capital"][1]] = f"=ROUND(SUMPRODUCT({f_exc(u)}*{R('Costo')}),0)"
    b.tb[b.celdas["sobre"][1]] = f"=SUMPRODUCT({f_sobre(u)})"
    b.resultado(f + 1, "financiero", "Costo financiero anual del capital parado", f"={T(b, 'capital')}*{tasa}", MILLONES)
    b.resultado(f + 2, "perdidaAnual", "Venta perdida si los quiebres duran un año", f"={T(b, 'perdida')}*52", MILLONES)
    b.resultado(f + 3, "inaccion", "Costo de no hacer nada un mes más", f"={T(b, 'perdida')}*4.3+{T(b, 'capital')}*{tasa}/12", MILLONES, fuerte=True)

    cad = b.hoja("Cadenas", [
        ("Cadena", 24), ("Venta 8 sem $", 15), ("Venta año anterior $", 17), ("Variación", 11), ("Sell-out 8 sem", 13),
        ("Piezas en canal", 13), ("Cobertura (sem)", 12), ("Capital inmovilizado", 17), ("Quiebres", 10),
    ], {2: DINERO, 3: DINERO, 4: "+0.0%;-0.0%", 5: NUM, 6: NUM, 7: DEC, 8: DINERO, 9: NUM}, recorte=8)
    for r in range(2, 10):
        g, k = guarda(r), f"({R('Cadena')}=$A{r})"
        so = f"SUMIFS({R('Sell-out semanal')},{R('Cadena')},$A{r})"
        b.fx(cad, "B", r, f"={g}SUMIFS({R('Venta $')},{R('Cadena')},$A{r}))")
        b.fx(cad, "C", r, f"={g}SUMIFS({R('Venta $ año ant')},{R('Cadena')},$A{r}))")
        b.fx(cad, "D", r, f"={g}IF($C{r}=0,0,$B{r}/$C{r}-1))")
        b.fx(cad, "E", r, f"={g}SUMIFS({R('Sell-out 8 sem')},{R('Cadena')},$A{r}))")
        b.fx(cad, "F", r, f"={g}SUMIFS({R('Piezas')},{R('Cadena')},$A{r}))")
        b.fx(cad, "G", r, f"={g}IF({so}>0.05,$F{r}/{so},0))")
        b.fx(cad, "H", r, f"={g}ROUND(SUMPRODUCT({k}*{f_exc(u)}*{R('Costo')}),0))")
        b.fx(cad, "I", r, f"={g}SUMPRODUCT({k}*{f_quiebre()}))")

    mod = b.hoja("Modelos", [
        ("SKU", 14), ("Modelo", 34), ("Venta 8 sem $", 15), ("Sell-out 8 sem", 13), ("Variación", 11),
        ("Piezas en canal", 13), ("Cobertura (sem)", 12),
    ], {3: DINERO, 4: NUM, 5: "+0.0%;-0.0%", 6: NUM, 7: DEC}, recorte=10)
    for r in range(2, 12):
        g = guarda(r)
        so = f"SUMIFS({R('Sell-out semanal')},{R('SKU')},$A{r})"
        ant = f"SUMIFS({R('Venta $ año ant')},{R('SKU')},$A{r})"
        b.fx(mod, "C", r, f"={g}SUMIFS({R('Venta $')},{R('SKU')},$A{r}))")
        b.fx(mod, "D", r, f"={g}SUMIFS({R('Sell-out 8 sem')},{R('SKU')},$A{r}))")
        b.fx(mod, "E", r, f"={g}IF({ant}=0,0,$C{r}/{ant}-1))")
        b.fx(mod, "F", r, f"={g}SUMIFS({R('Piezas')},{R('SKU')},$A{r}))")
        b.fx(mod, "G", r, f"={g}IF({so}>0.05,$F{r}/{so},0))")

    est = b.hoja("Estados", [
        ("Estado", 22), ("Capital inmovilizado", 17), ("Venta perdida sem", 15), ("Impacto $", 15), ("Piezas", 11),
        ("Cobertura (sem)", 12),
    ], {2: DINERO, 3: DINERO, 4: DINERO, 5: NUM, 6: DEC}, recorte=10)
    for r in range(2, 12):
        g, k = guarda(r), f"({R('Estado')}=$A{r})"
        so = f"SUMIFS({R('Sell-out semanal')},{R('Estado')},$A{r})"
        b.fx(est, "B", r, f"={g}ROUND(SUMPRODUCT({k}*{f_exc(u)}*{R('Costo')}),0))")
        b.fx(est, "C", r, f"={g}SUMPRODUCT({k}*{f_perdida()}))")
        b.fx(est, "D", r, f"={g}$B{r}+$C{r}*4)")
        b.fx(est, "E", r, f"={g}SUMIFS({R('Piezas')},{R('Estado')},$A{r}))")
        b.fx(est, "F", r, f"={g}IF({so}>0.05,$E{r}/{so},0))")

    ser = b.hoja("Serie", [("Semana", 12), ("Sell-in", 12), ("Sell-out", 12), ("Inventario", 13)],
                 {2: NUM, 3: NUM, 4: NUM})

    g0 = f + 6
    b.seccion(g0, "Cómo se mueve el canal")
    b.lineas(b.tb, f"B{g0 + 1}", "Sell-in contra sell-out, 12 semanas (piezas)",
             Reference(ser, min_col=2, max_col=3, min_row=1, max_row=13), Reference(ser, min_col=1, min_row=2, max_row=13))
    b.barras(b.tb, f"H{g0 + 1}", "Venta por cadena: este año contra el anterior",
             Reference(cad, min_col=2, max_col=3, min_row=1, max_row=9), Reference(cad, min_col=1, min_row=2, max_row=9),
             horizontal=False, formato=MILLONES, colores=[ACENTO, "A9B8CC"], leyenda=True)
    b.seccion(g0 + 19, "Dónde está el dinero")
    b.barras(b.tb, f"B{g0 + 20}", "Los 10 modelos que más venden (8 semanas)",
             Reference(mod, min_col=3, min_row=1, max_row=11), Reference(mod, min_col=2, min_row=2, max_row=11),
             formato=MILLONES, alto=9.4)
    b.barras(b.tb, f"H{g0 + 20}", "Capital inmovilizado: los 10 estados que más pesan",
             Reference(est, min_col=2, min_row=1, max_row=11), Reference(est, min_col=1, min_row=2, max_row=11),
             formato=MILLONES, alto=9.4, colores=[ROJO])
    b.datos()
    return b.guardar()


# ===========================================================================
# MAPA  ·  la geografía del canal
# ===========================================================================
def mapa():
    b = Libro("mapa", "mapa.xlsx", "Mapa de alertas",
              "Dónde está parado el inventario. Mueve el umbral y los estados se vuelven a clasificar: las fórmulas "
              "recorren cada combinación del corte, no una tabla ya resumida.")
    N = 43
    E = lambda col: f"Estados!${col}$2:${col}${N}"

    b.kpi("estados", "Estados con presencia", f"=COUNTA({E('A')})", NUM, "Con al menos una tienda en el alcance")
    b.kpi("alerta", "Estados en alerta",
          f'=COUNTIF({E("N")},"Saturado")+COUNTIF({E("N")},"Cobertura alta")+COUNTIF({E("N")},"Quiebre")',
          NUM, "Saturados, con cobertura alta o en quiebre", ROJO)
    b.kpi("capital", "Capital inmovilizado", f"=SUM({E('H')})", MILLONES, "Excedente sobre el umbral, a costo", ROJO)
    b.kpi("exc", "Piezas sobre el umbral", f"=SUM({E('G')})", NUM, "Existencia que rebasa la cobertura objetivo")
    b.kpi("perdida", "Venta perdida semanal", f"=SUM({E('I')})", MILLONES, "Quiebres con desplazamiento vivo", ROJO)
    b.kpi("impacto", "Impacto total", f"=SUM({E('J')})", MILLONES, "Capital parado más 4 semanas de venta perdida")

    f = b.fila_libre() + 1
    b.seccion(f, "Supuestos  ·  las celdas azules se mueven", "B", "F")
    b.seccion(f, "Lo que resulta", "H", "M")
    u = b.supuesto(f + 1, "umbral", "Umbral de cobertura", 12, SEM)
    desc = b.supuesto(f + 2, "descuento", "Descuento al liquidar el excedente", 0.35, "0%")
    tasa = b.supuesto(f + 3, "tasa", "Tasa financiera anual del inventario", 0.18, "0%")
    lib = b.resultado(f + 1, "liberado", "Caja que se libera al liquidar el excedente", f"={T(b, 'capital')}*(1-{desc})", MILLONES, fuerte=True)
    b.resultado(f + 2, "castigo", "Castigo de margen por liquidar", f"={T(b, 'capital')}*{desc}", MILLONES)
    b.resultado(f + 3, "ahorro", "Ahorro financiero anual", f"={lib}*{tasa}", MILLONES)
    b.resultado(f + 4, "perdidaAnual", "Venta perdida si el quiebre dura un año", f"={T(b, 'perdida')}*52", MILLONES)
    b.leyenda(f + 6, "La caja liberada ya trae descontado el castigo de margen. El ahorro financiero es lo que deja de "
                     "costar tener ese dinero detenido un año: no es venta, es costo que no ocurre.")

    es = b.hoja("Estados", [
        ("Estado", 22), ("Sucursales", 11), ("Combinaciones", 13), ("Piezas", 10), ("Sell-out 8 sem", 13),
        ("Venta 8 sem $", 15), ("Excedente", 11), ("Capital inmovilizado", 17), ("Venta perdida sem", 15),
        ("Impacto $", 15), ("Cobertura (sem)", 12), ("Combinaciones sobre umbral", 15), ("Quiebres", 10),
        ("Estado del inventario", 19),
    ], {2: NUM, 3: NUM, 4: NUM, 5: NUM, 6: DINERO, 7: NUM, 8: DINERO, 9: DINERO, 10: DINERO, 11: DEC, 12: NUM, 13: NUM},
        recorte=15)
    for r in range(2, N + 1):
        g, k = guarda(r), f"({R('Estado')}=$A{r})"
        so = f"SUMIFS({R('Sell-out semanal')},{R('Estado')},$A{r})"
        b.fx(es, "F", r, f"={g}SUMIFS({R('Venta $')},{R('Estado')},$A{r}))")
        b.fx(es, "G", r, f"={g}SUMPRODUCT({k}*{f_exc(u)}))")
        b.fx(es, "H", r, f"={g}ROUND(SUMPRODUCT({k}*{f_exc(u)}*{R('Costo')}),0))")
        b.fx(es, "I", r, f"={g}SUMPRODUCT({k}*{f_perdida()}))")
        b.fx(es, "J", r, f"={g}$H{r}+$I{r}*4)")
        b.fx(es, "K", r, f"={g}IF({so}>0.05,$D{r}/{so},IF($D{r}>0,99,0)))")
        b.fx(es, "L", r, f"={g}SUMPRODUCT({k}*{f_sobre(u)}))")
        b.fx(es, "M", r, f"={g}SUMPRODUCT({k}*{f_quiebre()}))")
        # La misma regla del mapa: el estado se clasifica por dónde está su
        # dinero, no por su promedio.
        qm = f"AND($M{r}>=2,$M{r}/MAX(1,$C{r})>=0.05)"
        b.fx(es, "N", r, f'={g}IF(AND({qm},$I{r}*4>$H{r}),"Quiebre",'
                         f'IF(OR($K{r}>{u}*1.45,$L{r}/MAX(1,$C{r})>0.5),"Saturado",'
                         f'IF(OR($K{r}>{u},$L{r}/MAX(1,$C{r})>0.3),"Cobertura alta",'
                         f'IF({qm},"Quiebre","Sano")))))')

    su = b.hoja("Sucursales", [
        ("Punto de venta", 32), ("Cadena", 20), ("Estado", 18), ("Ciudad", 18), ("Combinaciones", 13),
        ("Piezas", 10), ("Sell-out semanal", 13), ("Cobertura (sem)", 12), ("Excedente", 11),
        ("Capital inmovilizado", 17), ("Quiebres", 10), ("Venta perdida sem", 15), ("Estado del inventario", 19),
    ], {5: NUM, 6: NUM, 7: DEC, 8: DEC, 9: NUM, 10: DINERO, 11: NUM, 12: DINERO})
    for r in range(2, 122):
        g, k = guarda(r), f"({R('Punto de venta')}=$A{r})"
        b.fx(su, "F", r, f"={g}SUMIFS({R('Piezas')},{R('Punto de venta')},$A{r}))")
        b.fx(su, "G", r, f"={g}SUMIFS({R('Sell-out semanal')},{R('Punto de venta')},$A{r}))")
        b.fx(su, "H", r, f"={g}IF($G{r}>0.05,$F{r}/$G{r},IF($F{r}>0,99,0)))")
        b.fx(su, "I", r, f"={g}SUMPRODUCT({k}*{f_exc(u)}))")
        b.fx(su, "J", r, f"={g}ROUND(SUMPRODUCT({k}*{f_exc(u)}*{R('Costo')}),0))")
        b.fx(su, "K", r, f"={g}SUMPRODUCT({k}*{f_quiebre()}))")
        b.fx(su, "L", r, f"={g}SUMPRODUCT({k}*{f_perdida()}))")
        b.fx(su, "M", r, f'={g}IF(SUMIFS({R("Reporta")},{R("Punto de venta")},$A{r})=0,"Sin reporte",'
                         f'IF($H{r}>{u}*1.45,"Saturado",IF($H{r}>{u},"Cobertura alta",'
                         f'IF($K{r}>=MAX(1,ROUND($E{r}*0.12,0)),"Quiebre","Sano")))))')

    g0 = f + 8
    b.seccion(g0, "Los 15 estados de mayor impacto")
    b.barras(b.tb, f"B{g0 + 1}", "Capital inmovilizado por estado",
             Reference(es, min_col=8, min_row=1, max_row=16), Reference(es, min_col=1, min_row=2, max_row=16),
             formato=MILLONES, alto=10.5, colores=[ROJO])
    b.barras(b.tb, f"H{g0 + 1}", "Semanas de cobertura por estado",
             Reference(es, min_col=11, min_row=1, max_row=16), Reference(es, min_col=1, min_row=2, max_row=16),
             formato="0.0", alto=10.5)
    b.datos()
    return b.guardar()


# ===========================================================================
# QUÉ ATENDER  ·  las decisiones de la semana
# ===========================================================================
def ejecucion():
    b = Libro("ejecucion", "ejecucion.xlsx", "Qué atender",
              "Las decisiones de la semana, con sus palancas: qué dejar de embarcar, qué trasladar, qué resurtir y "
              "qué liquidar. El flete, el umbral y los días objetivo son celdas vivas.")
    b.kpi("sobre", "No embarcar", "=0", NUM, "Combinaciones sobre el umbral", ROJO)
    b.kpi("capital", "Capital parado", "=0", MILLONES, "Excedente a costo", ROJO)
    b.kpi("traslados", "Traslados propuestos", "=COUNTA(Traslados!$A$2:$A$61)", NUM, "Mismo modelo, misma cadena")
    b.kpi("perdida", "Venta perdida semanal", f"=SUMPRODUCT({f_perdida()})", MILLONES, "Por quiebres", ROJO)
    b.kpi("resurtir", "Piezas a resurtir", "=0", NUM, "Para llegar a los días objetivo")
    b.kpi("inaccion", "Costo de no hacer nada", "=0", MILLONES, "Un mes más como está", ROJO)

    f = b.fila_libre() + 1
    b.seccion(f, "Supuestos  ·  las celdas azules se mueven", "B", "F")
    b.seccion(f, "Lo que resulta", "H", "M")
    u = b.supuesto(f + 1, "umbral", "Umbral de cobertura", 12, SEM)
    flete = b.supuesto(f + 2, "flete", "Flete de un traslado, por pieza", 38, DINERO)
    dias = b.supuesto(f + 3, "dias", "Días de inventario objetivo al resurtir", 56, '0" días"')
    tasa = b.supuesto(f + 4, "tasa", "Tasa financiera anual del inventario", 0.18, "0%")
    edad = b.supuesto(f + 5, "edad", "Antigüedad para liquidar", 360, '0" días"')
    desc = b.supuesto(f + 6, "descuento", "Descuento de liquidación", 0.35, "0%")

    sug = (f"ROUND({R('Sell-out semanal')}*{dias}/7,0)-{R('Piezas')}-{R('Tránsito')}")
    b.tb[b.celdas["sobre"][1]] = f"=SUMPRODUCT({f_sobre(u)})"
    b.tb[b.celdas["capital"][1]] = f"=ROUND(SUMPRODUCT({f_exc(u)}*{R('Costo')}),0)"
    b.tb[b.celdas["resurtir"][1]] = f"=SUMPRODUCT(({R('Reporta')}=1)*(({sug})>0)*({sug}))"
    b.tb[b.celdas["inaccion"][1]] = f"={T(b, 'perdida')}*4.3+{T(b, 'capital')}*{tasa}/12"

    b.resultado(f + 1, "fleteTotal", "Flete de todos los traslados", "=SUM(Traslados!$I$2:$I$61)", DINERO)
    b.resultado(f + 2, "recupera", "Venta que recuperan por semana", "=SUM(Traslados!$H$2:$H$61)", DINERO)
    b.resultado(f + 3, "neto", "Neto de los traslados a 4 semanas", "=SUM(Traslados!$J$2:$J$61)", DINERO, fuerte=True)
    b.resultado(f + 4, "viejas", "Piezas con más antigüedad que el límite",
                f"=SUMPRODUCT(({R('Días en canal')}>{edad})*{R('Piezas')})", NUM)
    b.resultado(f + 5, "viejasCosto", "Valor a costo de ese inventario",
                f"=SUMPRODUCT(({R('Días en canal')}>{edad})*{R('Piezas')}*{R('Costo')})", MILLONES)
    b.resultado(f + 6, "viejasCaja", "Caja que entra al liquidarlo",
                f"=SUMPRODUCT(({R('Días en canal')}>{edad})*{R('Piezas')}*{R('Costo')})*(1-{desc})", MILLONES, fuerte=True)

    tr = b.hoja("Traslados", [
        ("Cadena", 20), ("SKU", 13), ("Modelo", 30), ("Sale de", 26), ("Llega a", 26), ("Piezas", 9),
        ("Semanas que cubre", 12), ("Venta recuperada por semana", 16), ("Flete", 11), ("Neto a 4 semanas", 14),
        ("¿Paga el flete?", 12),
    ], {6: NUM, 7: DEC, 8: DINERO, 9: DINERO, 10: DINERO})
    for r in range(2, 62):
        g = guarda(r)
        b.fx(tr, "I", r, f"={g}$F{r}*{flete})")
        b.fx(tr, "J", r, f"={g}$H{r}*4-$I{r})")
        b.fx(tr, "K", r, f'={g}IF($J{r}>0,"Sí","No"))')

    ne = b.hoja("No embarcar", [
        ("Punto de venta", 30), ("Cadena", 20), ("SKU", 13), ("Modelo", 30), ("Piezas", 9), ("Tránsito", 9),
        ("Sell-out semanal", 13), ("Costo", 11), ("Cobertura (sem)", 12), ("Piezas de más", 11), ("Capital parado", 14),
    ], {5: NUM, 6: NUM, 7: DEC, 8: DINERO, 9: DEC, 10: NUM, 11: DINERO}, sobrantes="quitar")
    for r in range(2, 302):
        g = guarda(r)
        b.fx(ne, "I", r, f"={g}IF($G{r}>0.05,$E{r}/$G{r},IF($E{r}>0,99,0)))")
        b.fx(ne, "J", r, f"={g}MAX(0,ROUND($E{r}-$G{r}*{u},0)))")
        b.fx(ne, "K", r, f"={g}ROUND($J{r}*$H{r},0))")

    rs = b.hoja("Resurtir", [
        ("Punto de venta", 30), ("Cadena", 20), ("SKU", 13), ("Modelo", 30), ("Piezas", 9), ("Tránsito", 9),
        ("Sell-out semanal", 13), ("Precio", 11), ("Inventario objetivo", 13), ("Resurtido sugerido", 13),
        ("Venta perdida por semana", 15),
    ], {5: NUM, 6: NUM, 7: DEC, 8: DINERO, 9: NUM, 10: NUM, 11: DINERO}, sobrantes="quitar")
    for r in range(2, 302):
        g = guarda(r)
        b.fx(rs, "I", r, f"={g}ROUND($G{r}*{dias}/7,0))")
        b.fx(rs, "J", r, f"={g}MAX(0,$I{r}-$E{r}-$F{r}))")
        b.fx(rs, "K", r, f"={g}IF(AND($E{r}=0,$G{r}>0.15),$G{r}*$H{r},0))")

    lq = b.hoja("Liquidar", [
        ("Punto de venta", 30), ("Cadena", 20), ("SKU", 13), ("Modelo", 30), ("Piezas", 9), ("Días en canal", 11),
        ("Costo", 11), ("Valor a costo", 14), ("Caja al liquidar", 14), ("¿Rebasa el límite?", 13),
    ], {5: NUM, 6: NUM, 7: DINERO, 8: DINERO, 9: DINERO}, sobrantes="quitar")
    for r in range(2, 302):
        g = guarda(r)
        b.fx(lq, "H", r, f"={g}$E{r}*$G{r})")
        b.fx(lq, "I", r, f"={g}$H{r}*(1-{desc}))")
        b.fx(lq, "J", r, f'={g}IF($F{r}>{edad},"Sí","No"))')

    co = b.hoja("Colecciones", [
        ("Colección", 20), ("Venta perdida por semana", 16), ("Capital parado", 15), ("Quiebres", 10),
        ("Combinaciones sobre umbral", 15),
    ], {2: DINERO, 3: DINERO, 4: NUM, 5: NUM}, recorte=12)
    for r in range(2, 14):
        g, k = guarda(r), f"({R('Colección')}=$A{r})"
        b.fx(co, "B", r, f"={g}SUMPRODUCT({k}*{f_perdida()}))")
        b.fx(co, "C", r, f"={g}ROUND(SUMPRODUCT({k}*{f_exc(u)}*{R('Costo')}),0))")
        b.fx(co, "D", r, f"={g}SUMPRODUCT({k}*{f_quiebre()}))")
        b.fx(co, "E", r, f"={g}SUMPRODUCT({k}*{f_sobre(u)}))")

    g0 = f + 9
    b.seccion(g0, "Dónde duele, por colección")
    b.barras(b.tb, f"B{g0 + 1}", "Venta perdida por semana",
             Reference(co, min_col=2, min_row=1, max_row=13), Reference(co, min_col=1, min_row=2, max_row=13),
             formato=DINERO, alto=9.4, colores=[ROJO])
    b.barras(b.tb, f"H{g0 + 1}", "Capital parado",
             Reference(co, min_col=3, min_row=1, max_row=13), Reference(co, min_col=1, min_row=2, max_row=13),
             formato=MILLONES, alto=9.4, colores=[NARANJA])
    b.datos()
    return b.guardar()


# ===========================================================================
# DETALLE  ·  combinación por combinación
# ===========================================================================
def detalle():
    b = Libro("detalle", "detalle.xlsx", "Detalle por tienda",
              "Cada combinación de tienda y modelo, clasificada con fórmula. Mueve el umbral y la columna Estado "
              "del inventario, el excedente y el capital de cada renglón cambian con él.")
    N = 2501
    Dt = lambda col: f"Detalle!${col}$2:${col}${N}"
    b.kpi("combos", "Combinaciones", f"=COUNTA({Dt('A')})", NUM, "Tienda por modelo, en el alcance")
    b.kpi("piezas", "Piezas en canal", f"=SUM({Dt('G')})", NUM, "Existencia al corte")
    b.kpi("so", "Desplazamiento semanal", f"=SUM({Dt('I')})", DEC, "Promedio de 8 semanas, en piezas")
    b.kpi("capital", "Capital inmovilizado", f"=SUM({Dt('P')})", MILLONES, "Excedente a costo", ROJO)
    b.kpi("perdida", "Venta perdida semanal", f"=SUM({Dt('Q')})", MILLONES, "Por quiebres", ROJO)
    b.kpi("impacto", "Impacto acumulado", f"=SUM({Dt('R')})", MILLONES, "Capital más 4 semanas de venta perdida")
    b.kpi("sanas", "Sanas", f'=COUNTIF({Dt("S")},"Sano")', NUM, "Dentro del umbral", VERDE)
    b.kpi("altas", "Cobertura alta", f'=COUNTIF({Dt("S")},"Cobertura alta")', NUM, "Sobre el umbral", NARANJA)
    b.kpi("saturadas", "Saturadas", f'=COUNTIF({Dt("S")},"Saturado")', NUM, "Más de 1.45 veces el umbral", ROJO)
    b.kpi("quiebres", "En quiebre", f'=COUNTIF({Dt("S")},"Quiebre")', NUM, "Menos de 2.5 semanas con venta viva", ROJO)
    b.kpi("sinReporte", "Sin reporte", f'=COUNTIF({Dt("S")},"Sin reporte")', NUM, "La tienda no entrega sell-out")

    f = b.fila_libre() + 1
    b.seccion(f, "Supuestos  ·  las celdas azules se mueven", "B", "F")
    u = b.supuesto(f + 1, "umbral", "Umbral de cobertura", 12, SEM)

    dt = b.hoja("Detalle", [
        ("Punto de venta", 30), ("Cadena", 20), ("Estado", 17), ("SKU", 13), ("Modelo", 30), ("Colección", 15),
        ("Piezas", 9), ("Tránsito", 9), ("Sell-out semanal", 12), ("Precio", 11), ("Costo", 11), ("Días en canal", 10),
        ("Reporta", 9), ("Cobertura (sem)", 11), ("Piezas de más", 10), ("Capital inmovilizado", 14),
        ("Venta perdida sem", 14), ("Impacto $", 13), ("Estado del inventario", 17), ("Tienda · modelo", 40),
    ], {7: NUM, 8: NUM, 9: DEC, 10: DINERO, 11: DINERO, 12: NUM, 13: NUM, 14: DEC, 15: NUM, 16: DINERO, 17: DINERO, 18: DINERO},
        sobrantes="quitar", recorte=15)
    for r in range(2, N + 1):
        g = guarda(r)
        b.fx(dt, "N", r, f'={g}IF($M{r}=0,"",IF($I{r}>0.05,$G{r}/$I{r},IF($G{r}>0,99,0))))')
        b.fx(dt, "O", r, f"={g}IF($M{r}=0,0,MAX(0,ROUND($G{r}-$I{r}*{u},0))))")
        b.fx(dt, "P", r, f"={g}ROUND($O{r}*$K{r},0))")
        b.fx(dt, "Q", r, f"={g}IF(AND($M{r}=1,$G{r}=0,$I{r}>0.15),$I{r}*$J{r},0))")
        b.fx(dt, "R", r, f"={g}ROUND($P{r}+$Q{r}*4,0))")
        b.fx(dt, "S", r, f'={g}IF($M{r}=0,"Sin reporte",IF(AND($N{r}<2.5,$I{r}>0.15),"Quiebre",'
                         f'IF($N{r}<={u},"Sano",IF($N{r}<={u}*1.45,"Cobertura alta","Saturado")))))')
        b.fx(dt, "T", r, f'={g}$A{r}&" · "&$D{r})')

    cl = b.hoja("Clases", [("Estado del inventario", 22), ("Combinaciones", 14), ("Capital inmovilizado", 18),
                           ("Venta perdida sem", 16)], {2: NUM, 3: DINERO, 4: DINERO}, recorte=4)
    for r in range(2, 6):
        g = guarda(r)
        b.fx(cl, "B", r, f"={g}COUNTIF({Dt('S')},$A{r}))")
        b.fx(cl, "C", r, f"={g}SUMIF({Dt('S')},$A{r},{Dt('P')}))")
        b.fx(cl, "D", r, f"={g}SUMIF({Dt('S')},$A{r},{Dt('Q')}))")

    g0 = f + 4
    b.seccion(g0, "Cómo está repartido el inventario")
    b.barras(b.tb, f"B{g0 + 1}", "Combinaciones por estado del inventario",
             Reference(cl, min_col=2, min_row=1, max_row=5), Reference(cl, min_col=1, min_row=2, max_row=5),
             horizontal=False, formato=NUM)
    b.barras(b.tb, f"H{g0 + 1}", "Las 15 combinaciones de mayor impacto",
             Reference(dt, min_col=18, min_row=1, max_row=16), Reference(dt, min_col=20, min_row=2, max_row=16),
             formato=DINERO, alto=10.5, colores=[ROJO])
    return b.guardar()


# ===========================================================================
# REPORTE  ·  la tabla dinámica que está en pantalla
# ===========================================================================
def reporte():
    b = Libro("reporte", "reporte.xlsx", "Reporte",
              "La tabla tal como estaba en pantalla, con el corte y los filtros puestos. La gráfica y los "
              "indicadores leen la hoja Gráfica: si editas un valor ahí, se mueven.")
    G = lambda col: f"'Gráfica'!${col}$2:${col}$21"
    b.kpi("total", "Total del reporte", 0, "#,##0.##", "De la medida graficada")
    b.kpi("renglones", "Renglones", 0, NUM, "En la tabla del reporte")
    b.kpi("mayorNombre", "El mayor", f'=IFERROR(INDEX({G("A")},MATCH(MAX({G("B")}),{G("B")},0)),"")', "@", "Concepto con el valor más alto")
    b.kpi("mayor", "Valor del mayor", f"=MAX({G('B')})", "#,##0.##", "De los renglones graficados")
    b.kpi("parte", "Lo que pesa el mayor", f"=IF(SUM({G('B')})=0,0,MAX({G('B')})/SUM({G('B')}))", PORC, "Sobre lo graficado")
    b.kpi("promedio", "Promedio por renglón", f"=IFERROR(AVERAGE({G('B')}),0)", "#,##0.##", "De los renglones graficados")
    # El nombre del mayor es texto largo: letra más chica para que quepa.
    b.tb[b.celdas["mayorNombre"][1]].font = Font(name="Calibri", size=12, bold=True, color=TINTA)

    rp = b.hoja("Reporte", [(f"Columna {i}", 26 if i == 1 else 20 if i < 4 else 16) for i in range(1, 21)],
                {i: "#,##0.##" for i in range(2, 21)}, sobrantes="quitar")
    gr = b.hoja("Gráfica", [("Concepto", 40), ("Valor", 18)], {2: "#,##0.##"}, recorte=20)

    f = b.fila_libre() + 1
    b.seccion(f, "Lo que muestra la tabla")
    b.barras(b.tb, f"B{f + 1}", "Los renglones de mayor valor",
             Reference(gr, min_col=2, min_row=1, max_row=21), Reference(gr, min_col=1, min_row=2, max_row=21),
             formato="#,##0", alto=12.5, ancho=33.6)
    del rp
    return b.guardar()


# ===========================================================================
# SIMULADOR  ·  el corte completo con palancas de venta y margen
# ===========================================================================
def corte():
    b = Libro("corte", "simulador.xlsx", "Simulador del corte",
              "El corte completo con sus palancas. Mueve el crecimiento, el precio, el umbral o la liquidación y "
              "mira qué le pasa a la venta, al margen y al EBITDA de las próximas ocho semanas.")
    b.kpi("venta", "Venta simulada, 8 semanas", "=0", MILLONES, "Con el crecimiento y el precio que pusiste")
    b.kpi("variacion", "Contra el año anterior", "=0", "+0.0%;-0.0%", "Mismo periodo del año pasado", VERDE)
    b.kpi("margenPct", "Margen bruto", "=0", PORC, "Sobre la venta simulada")
    b.kpi("capital", "Capital inmovilizado", "=0", MILLONES, "Excedente sobre el umbral, a costo", ROJO)
    b.kpi("liberado", "Caja por liquidar", "=0", MILLONES, "Lo que entra al liquidar el excedente")
    b.kpi("ebitda", "EBITDA del periodo", "=0", MILLONES, "Ocho semanas, con tus supuestos", VERDE)

    f = b.fila_libre() + 1
    b.seccion(f, "Supuestos  ·  las celdas azules se mueven", "B", "F")
    b.seccion(f, "Lo que resulta", "H", "M")
    crec = b.supuesto(f + 1, "crecimiento", "Crecimiento de la venta en piezas", 0, "+0.0%;-0.0%;0.0%")
    prec = b.supuesto(f + 2, "precio", "Cambio de precio", 0, "+0.0%;-0.0%;0.0%")
    u = b.supuesto(f + 3, "umbral", "Umbral de cobertura", 12, SEM)
    liq = b.supuesto(f + 4, "liquidacion", "Parte del excedente que se liquida", 0, "0%")
    desc = b.supuesto(f + 5, "descuento", "Descuento de liquidación", 0.35, "0%")
    tasa = b.supuesto(f + 6, "tasa", "Tasa financiera anual del inventario", 0.18, "0%")
    gasto = b.supuesto(f + 7, "gasto", "Gasto operativo sobre venta", 0.36, "0%")

    venta = f"SUMPRODUCT({R('Sell-out 8 sem')},{R('Precio')})*(1+{crec})*(1+{prec})"
    ant = f"SUMPRODUCT({R('Sell-out 8 sem ant')},{R('Precio')})"
    costo = f"SUMPRODUCT({R('Sell-out 8 sem')},{R('Costo')})*(1+{crec})"
    capital = f"ROUND(SUMPRODUCT({f_exc(u)}*{R('Costo')}),0)"
    v = b.resultado(f + 1, "ventaR", "Venta de 8 semanas", f"={venta}", DINERO)
    a = b.resultado(f + 2, "ventaAnt", "Venta del mismo periodo, año anterior", f"={ant}", DINERO)
    c = b.resultado(f + 3, "costoVendido", "Costo de lo vendido", f"={costo}", DINERO)
    m = b.resultado(f + 4, "margen", "Margen bruto", f"={v}-{c}", DINERO, fuerte=True)
    k = b.resultado(f + 5, "capitalR", "Capital inmovilizado sobre el umbral", f"={capital}", DINERO)
    lb = b.resultado(f + 6, "liberadoR", "Caja que entra al liquidar", f"={k}*{liq}*(1-{desc})", DINERO)
    cs = b.resultado(f + 7, "castigo", "Castigo de margen por liquidar", f"={k}*{liq}*{desc}", DINERO)
    ah = b.resultado(f + 8, "ahorro", "Ahorro financiero de 8 semanas", f"={k}*{liq}*{tasa}*8/52", DINERO)
    go = b.resultado(f + 9, "gastoOp", "Gasto operativo", f"={v}*{gasto}", DINERO)
    eb = b.resultado(f + 10, "ebitdaR", "EBITDA del periodo", f"={m}-{cs}+{ah}-{go}", DINERO, fuerte=True)

    b.tb[b.celdas["venta"][1]] = f"={v}"
    b.tb[b.celdas["variacion"][1]] = f"=IF({a}=0,0,{v}/{a}-1)"
    b.tb[b.celdas["margenPct"][1]] = f"=IF({v}=0,0,{m}/{v})"
    b.tb[b.celdas["capital"][1]] = f"={k}"
    b.tb[b.celdas["liberado"][1]] = f"={lb}"
    b.tb[b.celdas["ebitda"][1]] = f"={eb}"

    cad = b.hoja("Cadenas", [
        ("Cadena", 24), ("Venta simulada $", 16), ("Venta año anterior $", 17), ("Variación", 11), ("Margen bruto $", 15),
        ("Margen %", 10), ("Capital inmovilizado", 17),
    ], {2: DINERO, 3: DINERO, 4: "+0.0%;-0.0%", 5: DINERO, 6: PORC, 7: DINERO}, recorte=8)
    for r in range(2, 10):
        g, q = guarda(r), f"({R('Cadena')}=$A{r})"
        b.fx(cad, "B", r, f"={g}SUMPRODUCT({q}*{R('Sell-out 8 sem')}*{R('Precio')})*(1+{crec})*(1+{prec}))")
        b.fx(cad, "C", r, f"={g}SUMPRODUCT({q}*{R('Sell-out 8 sem ant')}*{R('Precio')}))")
        b.fx(cad, "D", r, f"={g}IF($C{r}=0,0,$B{r}/$C{r}-1))")
        b.fx(cad, "E", r, f"={g}$B{r}-SUMPRODUCT({q}*{R('Sell-out 8 sem')}*{R('Costo')})*(1+{crec}))")
        b.fx(cad, "F", r, f"={g}IF($B{r}=0,0,$E{r}/$B{r}))")
        b.fx(cad, "G", r, f"={g}ROUND(SUMPRODUCT({q}*{f_exc(u)}*{R('Costo')}),0))")

    col = b.hoja("Colecciones", [
        ("Colección", 20), ("Venta simulada $", 16), ("Venta año anterior $", 17), ("Variación", 11), ("Margen bruto $", 15),
        ("Margen %", 10), ("Capital inmovilizado", 17),
    ], {2: DINERO, 3: DINERO, 4: "+0.0%;-0.0%", 5: DINERO, 6: PORC, 7: DINERO}, recorte=12)
    for r in range(2, 14):
        g, q = guarda(r), f"({R('Colección')}=$A{r})"
        b.fx(col, "B", r, f"={g}SUMPRODUCT({q}*{R('Sell-out 8 sem')}*{R('Precio')})*(1+{crec})*(1+{prec}))")
        b.fx(col, "C", r, f"={g}SUMPRODUCT({q}*{R('Sell-out 8 sem ant')}*{R('Precio')}))")
        b.fx(col, "D", r, f"={g}IF($C{r}=0,0,$B{r}/$C{r}-1))")
        b.fx(col, "E", r, f"={g}$B{r}-SUMPRODUCT({q}*{R('Sell-out 8 sem')}*{R('Costo')})*(1+{crec}))")
        b.fx(col, "F", r, f"={g}IF($B{r}=0,0,$E{r}/$B{r}))")
        b.fx(col, "G", r, f"={g}ROUND(SUMPRODUCT({q}*{f_exc(u)}*{R('Costo')}),0))")

    g0 = f + 12
    b.seccion(g0, "El efecto de tus supuestos")
    b.barras(b.tb, f"B{g0 + 1}", "Venta simulada por cadena, contra el año anterior",
             Reference(cad, min_col=2, max_col=3, min_row=1, max_row=9), Reference(cad, min_col=1, min_row=2, max_row=9),
             horizontal=False, formato=MILLONES, colores=[ACENTO, "A9B8CC"], leyenda=True)
    b.barras(b.tb, f"H{g0 + 1}", "Margen bruto por colección",
             Reference(col, min_col=5, min_row=1, max_row=13), Reference(col, min_col=1, min_row=2, max_row=13),
             formato=MILLONES, alto=9.4, colores=[VERDE])
    b.datos()
    return b.guardar()


# ===========================================================================
# ESCENARIO  ·  el plan del año, con su modelo entero en fórmulas
# ===========================================================================
def escenario():
    b = Libro("escenario", "escenario.xlsx", "Escenario y estado de resultados",
              "El modelo del plan, completo y en fórmulas: los diez supuestos de la pantalla son las celdas azules. "
              "Muévelos y se recalculan las unidades por mes, el estado de resultados por trimestre y el EBITDA.")
    b.kpi("ingreso", "Ingreso proyectado", "=Meses!$N$4", MILLONES, "Doce meses")
    b.kpi("margen", "Margen bruto", "=Meses!$N$6", MILLONES, "Ingreso menos costo de ventas")
    b.kpi("margenPct", "Margen bruto %", "=IF(Meses!$N$4=0,0,Meses!$N$6/Meses!$N$4)", PORC, "Sobre ingreso")
    b.kpi("ebitda", "EBITDA", "=Meses!$N$8", MILLONES, "Después de gasto, inventario y liquidación", VERDE)
    b.kpi("ebitdaPct", "EBITDA %", "=IF(Meses!$N$4=0,0,Meses!$N$8/Meses!$N$4)", PORC, "Sobre ingreso", VERDE)
    b.kpi("caja", "Caja liberada", "=0", MILLONES, "Por bajar días de inventario y liquidar")

    f = b.fila_libre() + 1
    b.seccion(f, "Supuestos del escenario  ·  las celdas azules se mueven", "B", "F")
    b.seccion(f, "Más supuestos", "H", "M")
    crec = b.supuesto(f + 1, "crecimiento", "Crecimiento de volumen", 0, "+0.0%;-0.0%;0.0%")
    prec = b.supuesto(f + 2, "precio", "Movimiento de precio", 0, "+0.0%;-0.0%;0.0%")
    cost = b.supuesto(f + 3, "costo", "Movimiento de costo", 0, "+0.0%;-0.0%;0.0%")
    elas = b.supuesto(f + 4, "elasticidad", "Elasticidad precio", 1.1, "0.0")
    serv = b.supuesto(f + 5, "servicio", "Nivel de servicio: quiebres que se cierran", 0, "0%")
    mkt = b.supuesto(f + 1, "mercadotecnia", "Inversión en mercadotecnia", 38, '"$"0.0" M"', col="H")
    dias = b.supuesto(f + 2, "dias", "Días de inventario objetivo", 56, '0" días"', col="H")
    liq = b.supuesto(f + 3, "liquidacion", "Liquidación del envejecido", 0, "0%", col="H")
    fijo = b.supuesto(f + 4, "gastoFijo", "Gasto operativo fijo", 138, '"$"0.0" M"', col="H")
    var = b.supuesto(f + 5, "gastoVariable", "Gasto variable sobre ingreso", 0.095, "0.0%", col="H")

    h = f + 7
    b.seccion(h, "Lo que viene del corte  ·  no se mueve aquí", "B", "F")
    b.seccion(h, "Lo que resulta", "H", "M")
    # Se usan celdas azules atenuadas: son datos del corte, no palancas.
    per = b.supuesto(h + 1, "perdidaSem", "Venta perdida semanal por quiebres", 0, DINERO)
    capp = b.supuesto(h + 2, "capitalParado", "Capital inmovilizado en el canal", 0, DINERO)
    bmk = b.supuesto(h + 3, "baseMkt", "Mercadotecnia de referencia", 38, '"$"0.0" M"')
    bdi = b.supuesto(h + 4, "baseDias", "Días de inventario de referencia", 56, '0" días"')
    for k in ("perdidaSem", "capitalParado", "baseMkt", "baseDias"):
        b.tb[b.celdas[k][1]].font = Font(name="Calibri", size=10, bold=True, color=GRIS)

    fac = b.resultado(h + 1, "factor", "Factor de volumen que aplican los supuestos",
                      f"=(1+{crec})*(1+{prec})^(-{elas})*IF({mkt}<=0,0.94,1+0.085*LN({mkt}/MAX(1,{bmk})))"
                      f"*IF({dias}<35,1-(35-{dias})*0.006,1)*(1+{liq}*0.14)", "0.000")
    rec = b.resultado(h + 2, "recuperado", "Venta recuperada al cerrar quiebres", f"={per}*52*{serv}", MILLONES)
    cinv = b.resultado(h + 3, "costoInv", "Costo financiero del inventario", f"=Meses!$N$5/365*{dias}*0.18", MILLONES)
    pliq = b.resultado(h + 4, "perdLiq", "Castigo de margen por liquidar", f"={capp}*{liq}*0.45", MILLONES)
    b.resultado(h + 5, "unidades", "Unidades proyectadas", "=SUM(Modelo!$U$2:$U$13)", NUM)
    b.tb[b.celdas["caja"][1]] = f"=Meses!$N$5/365*({bdi}-{dias})+{capp}*{liq}"

    # --- el modelo, colección por colección y mes por mes -------------------
    mo = b.hoja("Modelo", [
        ("Colección", 18), ("Segmento", 12), ("Corrida anual (pzas)", 13), ("Precio de lista", 12), ("Margen objetivo", 11),
        ("Estacionalidad", 11), ("Precio neto", 12), ("Costo unitario", 12),
        *[(m, 9) for m in MESES],
        ("Unidades año", 12), ("Ingreso $", 15), ("Costo $", 15), ("Margen $", 15), ("Margen %", 10),
    ], {3: NUM, 4: DINERO, 5: PORC, 6: "0.00", 7: DINERO, 8: DINERO, **{i: NUM for i in range(9, 22)},
        22: DINERO, 23: DINERO, 24: DINERO, 25: PORC})
    for r in range(2, 14):
        g = guarda(r)
        b.fx(mo, "G", r, f"={g}$D{r}*(1+{prec}))")
        b.fx(mo, "H", r, f"={g}$D{r}*(1-$E{r})*(1+{cost}))")
        for i in range(12):
            c = L(9 + i)
            b.fx(mo, c, r, f"={g}$C{r}/12*(1+({c}$16-1)*($F{r}-1)*2.1)*{fac})")
        b.fx(mo, "U", r, f"={g}SUM($I{r}:$T{r}))")
        b.fx(mo, "V", r, f"={g}$U{r}*$G{r})")
        b.fx(mo, "W", r, f"={g}$U{r}*$H{r})")
        b.fx(mo, "X", r, f"={g}$V{r}-$W{r})")
        b.fx(mo, "Y", r, f"={g}IF($V{r}=0,0,$X{r}/$V{r}))")
    mo["A16"] = "Curva estacional del año"
    mo["A16"].font = Font(name="Calibri", size=9, bold=True, color=GRIS)
    for i, v in enumerate(CURVA):
        mo[f"{L(9 + i)}16"] = v
        mo[f"{L(9 + i)}16"].number_format = "0.00"
        mo[f"{L(9 + i)}16"].font = Font(name="Calibri", size=9, color=GRIS)

    me = b.hoja("Meses", [("Concepto", 30), *[(m, 13) for m in MESES], ("Año", 15)],
                {i: DINERO for i in range(2, 15)})
    for i in range(12):
        c, m = L(2 + i), L(9 + i)
        b.fx(me, c, 2, f'={guarda(2)}SUMPRODUCT(Modelo!{m}$2:{m}$13,Modelo!$G$2:$G$13))')
        b.fx(me, c, 3, f"={guarda(3)}{rec}*Modelo!{m}$16/SUM(Modelo!$I$16:$T$16))")
        b.fx(me, c, 4, f"={guarda(4)}{c}2+{c}3)")
        b.fx(me, c, 5, f'={guarda(5)}SUMPRODUCT(Modelo!{m}$2:{m}$13,Modelo!$H$2:$H$13)+{c}3*0.48)')
        b.fx(me, c, 6, f"={guarda(6)}{c}4-{c}5)")
        b.fx(me, c, 7, f"={guarda(7)}{fijo}*1000000/12+{c}4*{var}+{mkt}*1000000/12+{cinv}/12+{pliq}/12)")
        b.fx(me, c, 8, f"={guarda(8)}{c}6-{c}7)")
    for r in range(2, 9):
        b.fx(me, "N", r, f"={guarda(r)}SUM($B{r}:$M{r}))")

    rs = b.hoja("Resultados", [("Concepto", 34), ("T1", 15), ("T2", 15), ("T3", 15), ("T4", 15), ("Año", 16)],
                {i: DINERO for i in range(2, 7)}, recorte=4)
    for q in range(4):
        c = L(2 + q)
        a, z = L(2 + q * 3), L(4 + q * 3)
        b.fx(rs, c, 2, f"={guarda(2)}SUM(Meses!{a}$4:{z}$4))")
        b.fx(rs, c, 3, f"={guarda(3)}SUM(Meses!{a}$5:{z}$5))")
        b.fx(rs, c, 4, f"={guarda(4)}{c}2-{c}3)")
        b.fx(rs, c, 5, f"={guarda(5)}{fijo}*1000000/4)")
        b.fx(rs, c, 6, f"={guarda(6)}{c}2*{var})")
        b.fx(rs, c, 7, f"={guarda(7)}{mkt}*1000000/4)")
        b.fx(rs, c, 8, f"={guarda(8)}({cinv}+{pliq})/4)")
        b.fx(rs, c, 9, f"={guarda(9)}SUM({c}5:{c}8))")
        b.fx(rs, c, 10, f"={guarda(10)}{c}4-{c}9)")
    for r in range(2, 11):
        b.fx(rs, "F", r, f"={guarda(r)}SUM($B{r}:$E{r}))")

    # La gráfica trimestral necesita ingreso y EBITDA uno junto al otro.
    tr = b.hoja("Trimestres", [("Trimestre", 12), ("Ingreso", 15), ("EBITDA", 15)], {2: DINERO, 3: DINERO}, recorte=4)
    for q in range(4):
        c = L(2 + q)
        b.fx(tr, "B", 2 + q, f"={guarda(2 + q)}Resultados!{c}$2)")
        b.fx(tr, "C", 2 + q, f"={guarda(2 + q)}Resultados!{c}$10)")

    es = b.hoja("Escenarios", [("Escenario", 30), ("Ingreso $", 16), ("Margen bruto $", 16), ("Margen %", 11),
                               ("EBITDA $", 16), ("EBITDA %", 11)],
                {2: DINERO, 3: DINERO, 4: PORC, 5: DINERO, 6: PORC}, recorte=8)
    # El primer renglón es este mismo libro, con lo que tenga puesto en las celdas azules.
    b.fx(es, "B", 2, f"={guarda(2)}{T(b, 'ingreso')})")
    b.fx(es, "C", 2, f"={guarda(2)}{T(b, 'margen')})")
    b.fx(es, "D", 2, f"={guarda(2)}{T(b, 'margenPct')})")
    b.fx(es, "E", 2, f"={guarda(2)}{T(b, 'ebitda')})")
    b.fx(es, "F", 2, f"={guarda(2)}{T(b, 'ebitdaPct')})")

    cd = b.hoja("Cadenas", [("Cadena", 24), ("Participación", 13), ("Ingreso $", 16), ("Margen bruto $", 16)],
                {2: PORC, 3: DINERO, 4: DINERO}, recorte=8)
    for r in range(2, 10):
        b.fx(cd, "C", r, f"={guarda(r)}{T(b, 'ingreso')}*$B{r})")
        b.fx(cd, "D", r, f"={guarda(r)}{T(b, 'margen')}*$B{r})")

    g0 = h + 8
    b.seccion(g0, "El año, trimestre por trimestre")
    b.barras(b.tb, f"B{g0 + 1}", "Ingreso y EBITDA por trimestre",
             Reference(tr, min_col=2, max_col=3, min_row=1, max_row=5), Reference(tr, min_col=1, min_row=2, max_row=5),
             horizontal=False, formato=MILLONES, colores=[ACENTO, VERDE], leyenda=True)
    b.barras(b.tb, f"H{g0 + 1}", "EBITDA por escenario",
             Reference(es, min_col=5, min_row=1, max_row=9), Reference(es, min_col=1, min_row=2, max_row=9),
             formato=MILLONES, colores=[VERDE])
    b.seccion(g0 + 19, "De dónde sale")
    b.barras(b.tb, f"B{g0 + 20}", "Margen bruto por colección",
             Reference(mo, min_col=24, min_row=1, max_row=13), Reference(mo, min_col=1, min_row=2, max_row=13),
             formato=MILLONES, alto=9.4)
    b.barras(b.tb, f"H{g0 + 20}", "Ingreso por cadena",
             Reference(cd, min_col=3, min_row=1, max_row=9), Reference(cd, min_col=1, min_row=2, max_row=9),
             formato=MILLONES, alto=9.4)
    b.hojas["Modelo"]["recorte"] = 12
    return b.guardar()


# ===========================================================================
# SALUD DEL DATO  ·  qué tanto se puede confiar en el corte
# ===========================================================================
def salud():
    b = Libro("salud", "salud.xlsx", "Salud del dato",
              "Qué parte de la red entrega sell-out. Sin ese dato no hay cobertura ni excedente que calcular, así "
              "que esta hoja dice cuánto del canal se está viendo de verdad.")
    S = lambda col: f"Sucursales!${col}$2:${col}$301"
    b.kpi("sucursales", "Sucursales en la red", f"=COUNTA({S('A')})", NUM, "En el alcance de los filtros")
    b.kpi("reportan", "Entregan sell-out", f'=COUNTIF({S("F")},"Sí")', NUM, "Con dato de venta al consumidor", VERDE)
    b.kpi("pct", "Cobertura de reporte", f'=IF(COUNTA({S("A")})=0,0,COUNTIF({S("F")},"Sí")/COUNTA({S("A")}))', PORC,
          "Sucursales que reportan entre el total")
    b.kpi("sin", "Sin reporte", f'=COUNTIF({S("F")},"No")', NUM, "Tiendas que no se están viendo", ROJO)
    b.kpi("piezasSin", "Piezas sin visibilidad", f'=SUMIF({S("F")},"No",{S("G")})', NUM, "Inventario en tiendas que no reportan", ROJO)
    b.kpi("combosSin", "Combinaciones sin dato", f'=SUMIF({S("F")},"No",{S("H")})', NUM, "Tienda por modelo sin sell-out")

    cd = b.hoja("Cadenas", [("Cadena", 24), ("Sucursales", 12), ("Reportan", 12), ("Sin reporte", 12),
                            ("Cobertura de reporte", 15), ("Piezas sin visibilidad", 16)],
                {2: NUM, 3: NUM, 4: NUM, 5: PORC, 6: NUM}, recorte=8)
    for r in range(2, 10):
        g = guarda(r)
        b.fx(cd, "B", r, f"={g}COUNTIF({S('B')},$A{r}))")
        b.fx(cd, "C", r, f'={g}COUNTIFS({S("B")},$A{r},{S("F")},"Sí"))')
        b.fx(cd, "D", r, f"={g}$B{r}-$C{r})")
        b.fx(cd, "E", r, f"={g}IF($B{r}=0,0,$C{r}/$B{r}))")
        b.fx(cd, "F", r, f'={g}SUMIFS({S("G")},{S("B")},$A{r},{S("F")},"No"))')

    b.hoja("Sucursales", [("Punto de venta", 32), ("Cadena", 22), ("Estado", 18), ("Ciudad", 18), ("Apertura", 20),
                          ("Reporta", 10), ("Piezas", 10), ("Combinaciones", 13)], {7: NUM, 8: NUM}, sobrantes="quitar")

    f = b.fila_libre() + 1
    b.seccion(f, "Quién está entregando el dato")
    b.barras(b.tb, f"B{f + 1}", "Cobertura de reporte por cadena",
             Reference(cd, min_col=5, min_row=1, max_row=9), Reference(cd, min_col=1, min_row=2, max_row=9),
             horizontal=False, formato="0%", colores=[VERDE], maximo=1)
    b.barras(b.tb, f"H{f + 1}", "Sucursales que reportan y que no, por cadena",
             Reference(cd, min_col=3, max_col=4, min_row=1, max_row=9), Reference(cd, min_col=1, min_row=2, max_row=9),
             horizontal=False, formato=NUM, colores=[VERDE, ROJO], leyenda=True)
    return b.guardar()


# ===========================================================================
# HALLAZGOS  ·  lo que el copiloto encontró en el corte
# ===========================================================================
def hallazgos():
    b = Libro("hallazgos", "hallazgos.xlsx", "Hallazgos del copiloto",
              "Lo que Argos encontró en el corte, ordenado por impacto. Cada hallazgo trae la regla que lo disparó "
              "y los números que la cumplieron: nada sale de una caja negra.")
    H = lambda col: f"Hallazgos!${col}$2:${col}$41"
    b.kpi("total", "Hallazgos", f"=COUNTA({H('C')})", NUM, "En el corte y con los filtros puestos")
    b.kpi("criticos", "Críticos", f'=COUNTIF({H("B")},"Crítica")', NUM, "Para atender esta semana", ROJO)
    b.kpi("liberable", "Capital liberable", f'=SUMIF({H("I")},"liberable",{H("H")})', MILLONES, "Dejando de embarcar y liquidando")
    b.kpi("recuperable", "Venta recuperable", f'=SUMIF({H("I")},"recuperable",{H("H")})', MILLONES, "Cerrando quiebres y trasladando", VERDE)
    b.kpi("riesgo", "En riesgo", f'=SUMIF({H("I")},"en riesgo",{H("H")})', MILLONES, "Si no se actúa", ROJO)
    b.kpi("valor", "Valor total", f"=SUM({H('H')})", MILLONES, "Suma del impacto de los hallazgos")

    hz = b.hoja("Hallazgos", [("#", 5), ("Severidad", 12), ("Hallazgo", 40), ("Área", 13), ("Qué pasa", 60),
                              ("Qué hacer", 60), ("Regla que lo disparó", 50), ("Valor $", 15), ("Tipo de valor", 13)],
                {1: NUM, 8: DINERO}, sobrantes="quitar", recorte=12)
    ar = b.hoja("Áreas", [("Área", 18), ("Hallazgos", 12), ("Valor $", 16)], {2: NUM, 3: DINERO}, recorte=6)
    for r in range(2, 8):
        g = guarda(r)
        b.fx(ar, "B", r, f"={g}COUNTIF({H('D')},$A{r}))")
        b.fx(ar, "C", r, f"={g}SUMIF({H('D')},$A{r},{H('H')}))")

    f = b.fila_libre() + 1
    b.seccion(f, "Cuánto vale cada hallazgo")
    b.barras(b.tb, f"B{f + 1}", "Impacto por hallazgo",
             Reference(hz, min_col=8, min_row=1, max_row=13), Reference(hz, min_col=3, min_row=2, max_row=13),
             formato=MILLONES, alto=10.5, ancho=18.8, colores=[ROJO])
    b.barras(b.tb, f"I{f + 1}", "Impacto por área",
             Reference(ar, min_col=3, min_row=1, max_row=7), Reference(ar, min_col=1, min_row=2, max_row=7),
             horizontal=False, formato=MILLONES, alto=10.5, ancho=13.8)
    return b.guardar()


LIBROS = {
    "resumen": resumen, "mapa": mapa, "ejecucion": ejecucion, "detalle": detalle, "reporte": reporte,
    "corte": corte, "escenario": escenario, "salud": salud, "hallazgos": hallazgos,
}

if __name__ == "__main__":
    pedidos = sys.argv[1:] or list(LIBROS)
    try:
        manifiesto = json.load(open(MANIFIESTO, encoding="utf-8"))
    except Exception:
        manifiesto = {}
    for k in pedidos:
        manifiesto[k] = LIBROS[k]()
        print("listo:", k.ljust(10), "->", manifiesto[k]["archivo"].ljust(16), "| celdas:", len(manifiesto[k]["celdas"]),
              "| hojas:", ", ".join(manifiesto[k]["hojas"]))
    json.dump(manifiesto, open(MANIFIESTO, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
