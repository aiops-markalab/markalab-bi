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
    SEM, TINTA, VERDE, f_alerta, f_exc, f_perdida, f_perdida_pzas, f_quiebre, f_sobre,
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
              "La salud comercial del canal, en piezas y en pesos. Sell-out y sell-in son del periodo elegido en la "
              "plataforma; inventario, cobertura y alertas son del corte. Todo se calcula con fórmulas sobre la hoja "
              "Datos: si editas un renglón o mueves el umbral, el libro se recalcula.")

    so_p, so_m = R("Sell-out periodo"), R("Sell-out periodo $")
    si_p, si_m = R("Sell-in periodo"), R("Sell-in periodo $")
    b.kpi("sellout", "Sell-out del periodo", f"=SUM({so_p})", NUM, "Piezas que las cadenas vendieron al público")
    b.kpi("selloutMonto", "Sell-out del periodo $", f"=SUM({so_m})", MILLONES, "Esas piezas, a precio de lista")
    b.kpi("sellin", "Sell-in del periodo", f"=SUM({si_p})", NUM, "Piezas que la marca resurtió a las cadenas")
    b.kpi("sellinMonto", "Sell-in del periodo $", f"=SUM({si_m})", MILLONES, "Esas piezas, al precio de venta a la cadena")
    b.kpi("indice", "Índice de desplazamiento", f"=IF(SUM({si_p})=0,0,SUM({so_p})/SUM({si_p}))",
          PORC, "Sell-out entre sell-in, en piezas")
    b.kpi("cobertura", "Cobertura del canal", f"=IF(SUM({R('Sell-out semanal')})>0,SUM({R('Piezas')})/SUM({R('Sell-out semanal')}),0)",
          SEM, "Piezas entre desplazamiento semanal")
    b.kpi("piezas", "Piezas en canal", f"=SUM({R('Piezas')})", NUM, "Existencia al corte")
    b.kpi("inventarioMonto", "Inventario en canal $", f"=SUMPRODUCT({R('Piezas')},{R('Costo')})", MILLONES,
          "Al precio de venta a la cadena")
    b.kpi("exc", "Piezas sobre el umbral", "=0", NUM, "Existencia que rebasa la cobertura objetivo", ROJO)
    b.kpi("capital", "Capital inmovilizado", "=0", MILLONES, "Esas piezas, al precio de venta a la cadena", ROJO)
    b.kpi("perdidaPzas", "Venta perdida, piezas", f"=SUMPRODUCT({f_perdida_pzas()})", DEC, "Por semana, en quiebres con desplazamiento vivo", ROJO)
    b.kpi("perdida", "Venta perdida semanal $", f"=SUMPRODUCT({f_perdida()})", MILLONES, "Esas piezas, a precio de lista", ROJO)
    b.kpi("quiebres", "Combinaciones en quiebre", f"=SUMPRODUCT({f_quiebre()})", NUM, "Menos de 2.5 semanas con venta viva")
    b.kpi("sobre", "Combinaciones sobre umbral", "=0", NUM, "Con más cobertura de la objetivo")
    b.kpi("resurtir", "Resurtido sugerido", f"=SUM({R('Sugerido')})", NUM, "Piezas para llegar a los días objetivo")
    b.kpi("resurtirMonto", "Resurtido sugerido $", f"=SUMPRODUCT({R('Sugerido')},{R('Costo')})", MILLONES,
          "Sell-in que representa ese resurtido")
    b.kpi("transito", "Piezas en tránsito", f"=SUM({R('Tránsito')})", NUM, "Ya resurtidas, todavía en camino")
    b.kpi("variacion", "Sell-out contra el año anterior",
          f"=IF(SUM({R('Venta $ año ant')})=0,0,SUM({R('Venta $')})/SUM({R('Venta $ año ant')})-1)",
          "+0.0%;-0.0%", "Últimas 8 semanas contra las mismas del año pasado", VERDE)

    f = b.fila_libre() + 1
    b.seccion(f, "Supuestos  ·  las celdas azules se mueven", "B", "F")
    b.seccion(f, "Lo que resulta", "H", "M")
    u = b.supuesto(f + 1, "umbral", "Umbral de cobertura", 12, SEM)
    tasa = b.supuesto(f + 2, "tasa", "Tasa financiera anual del inventario", 0.18, "0%")
    # Los indicadores que dependen del umbral se escriben ya que existe la celda.
    b.tb[b.celdas["exc"][1]] = f"=SUMPRODUCT({f_exc(u)})"
    b.tb[b.celdas["capital"][1]] = f"=ROUND(SUMPRODUCT({f_exc(u)}*{R('Costo')}),0)"
    b.tb[b.celdas["sobre"][1]] = f"=SUMPRODUCT({f_sobre(u)})"
    b.resultado(f + 1, "financiero", "Costo financiero anual del capital parado", f"={T(b, 'capital')}*{tasa}", MILLONES)
    b.resultado(f + 2, "perdidaAnual", "Venta perdida si los quiebres duran un año", f"={T(b, 'perdida')}*52", MILLONES)
    b.resultado(f + 3, "inaccion", "Costo de no hacer nada un mes más", f"={T(b, 'perdida')}*4.3+{T(b, 'capital')}*{tasa}/12", MILLONES, fuerte=True)

    cad = b.hoja("Cadenas", [
        ("Cadena", 24), ("Sell-out (pzas)", 13), ("Sell-in (pzas)", 13), ("Sell-out $", 15), ("Sell-in $", 15),
        ("Desplazó", 10), ("Piezas en canal", 13), ("Inventario $", 15), ("Cobertura (sem)", 12),
        ("Piezas sobre umbral", 13), ("Capital inmovilizado", 17), ("Quiebres", 10),
        ("Venta perdida (pzas/sem)", 14), ("Venta perdida $/sem", 15),
    ], {2: NUM, 3: NUM, 4: DINERO, 5: DINERO, 6: PORC, 7: NUM, 8: DINERO, 9: DEC, 10: NUM, 11: DINERO, 12: NUM,
        13: DEC, 14: DINERO}, recorte=8)
    for r in range(2, 10):
        g, k = guarda(r), f"({R('Cadena')}=$A{r})"
        so = f"SUMIFS({R('Sell-out semanal')},{R('Cadena')},$A{r})"
        b.fx(cad, "B", r, f"={g}SUMIFS({so_p},{R('Cadena')},$A{r}))")
        b.fx(cad, "C", r, f"={g}SUMIFS({si_p},{R('Cadena')},$A{r}))")
        b.fx(cad, "D", r, f"={g}SUMIFS({so_m},{R('Cadena')},$A{r}))")
        b.fx(cad, "E", r, f"={g}SUMIFS({si_m},{R('Cadena')},$A{r}))")
        b.fx(cad, "F", r, f"={g}IF($C{r}=0,0,$B{r}/$C{r}))")
        b.fx(cad, "G", r, f"={g}SUMIFS({R('Piezas')},{R('Cadena')},$A{r}))")
        b.fx(cad, "H", r, f"={g}SUMPRODUCT({k}*{R('Piezas')}*{R('Costo')}))")
        b.fx(cad, "I", r, f"={g}IF({so}>0.05,$G{r}/{so},0))")
        b.fx(cad, "J", r, f"={g}SUMPRODUCT({k}*{f_exc(u)}))")
        b.fx(cad, "K", r, f"={g}ROUND(SUMPRODUCT({k}*{f_exc(u)}*{R('Costo')}),0))")
        b.fx(cad, "L", r, f"={g}SUMPRODUCT({k}*{f_quiebre()}))")
        b.fx(cad, "M", r, f"={g}SUMPRODUCT({k}*{f_perdida_pzas()}))")
        b.fx(cad, "N", r, f"={g}SUMPRODUCT({k}*{f_perdida()}))")

    tso = b.hoja("Top sell-out", [
        ("SKU", 14), ("Modelo", 34), ("Sell-out (pzas)", 13), ("Sell-out $", 15), ("% de las piezas", 12),
        ("Sell-in (pzas)", 13), ("Piezas en canal", 13), ("Cobertura (sem)", 12),
    ], {3: NUM, 4: DINERO, 5: PORC, 6: NUM, 7: NUM, 8: DEC}, recorte=10)
    for r in range(2, 12):
        g = guarda(r)
        so = f"SUMIFS({R('Sell-out semanal')},{R('SKU')},$A{r})"
        b.fx(tso, "C", r, f"={g}SUMIFS({so_p},{R('SKU')},$A{r}))")
        b.fx(tso, "D", r, f"={g}SUMIFS({so_m},{R('SKU')},$A{r}))")
        b.fx(tso, "E", r, f"={g}IF(SUM({so_p})=0,0,$C{r}/SUM({so_p})))")
        b.fx(tso, "F", r, f"={g}SUMIFS({si_p},{R('SKU')},$A{r}))")
        b.fx(tso, "G", r, f"={g}SUMIFS({R('Piezas')},{R('SKU')},$A{r}))")
        b.fx(tso, "H", r, f"={g}IF({so}>0.05,$G{r}/{so},0))")

    tsi = b.hoja("Top sell-in", [
        ("SKU", 14), ("Modelo", 34), ("Sell-in (pzas)", 13), ("Sell-in $", 15), ("% de las piezas", 12),
        ("Sell-out (pzas)", 13), ("Desplazó", 10), ("Piezas en canal", 13),
    ], {3: NUM, 4: DINERO, 5: PORC, 6: NUM, 7: PORC, 8: NUM}, recorte=10)
    for r in range(2, 12):
        g = guarda(r)
        b.fx(tsi, "C", r, f"={g}SUMIFS({si_p},{R('SKU')},$A{r}))")
        b.fx(tsi, "D", r, f"={g}SUMIFS({si_m},{R('SKU')},$A{r}))")
        b.fx(tsi, "E", r, f"={g}IF(SUM({si_p})=0,0,$C{r}/SUM({si_p})))")
        b.fx(tsi, "F", r, f"={g}SUMIFS({so_p},{R('SKU')},$A{r}))")
        b.fx(tsi, "G", r, f"={g}IF($C{r}=0,0,$F{r}/$C{r}))")
        b.fx(tsi, "H", r, f"={g}SUMIFS({R('Piezas')},{R('SKU')},$A{r}))")

    est = b.hoja("Estados", [
        ("Estado", 22), ("Piezas sobre umbral", 13), ("Capital inmovilizado", 17), ("Venta perdida (pzas/sem)", 14),
        ("Venta perdida $/sem", 15), ("Impacto $", 15), ("Piezas en canal", 12), ("Cobertura (sem)", 12),
    ], {2: NUM, 3: DINERO, 4: DEC, 5: DINERO, 6: DINERO, 7: NUM, 8: DEC}, recorte=10)
    for r in range(2, 12):
        g, k = guarda(r), f"({R('Estado')}=$A{r})"
        so = f"SUMIFS({R('Sell-out semanal')},{R('Estado')},$A{r})"
        b.fx(est, "B", r, f"={g}SUMPRODUCT({k}*{f_exc(u)}))")
        b.fx(est, "C", r, f"={g}ROUND(SUMPRODUCT({k}*{f_exc(u)}*{R('Costo')}),0))")
        b.fx(est, "D", r, f"={g}SUMPRODUCT({k}*{f_perdida_pzas()}))")
        b.fx(est, "E", r, f"={g}SUMPRODUCT({k}*{f_perdida()}))")
        b.fx(est, "F", r, f"={g}$C{r}+$E{r}*4)")
        b.fx(est, "G", r, f"={g}SUMIFS({R('Piezas')},{R('Estado')},$A{r}))")
        b.fx(est, "H", r, f"={g}IF({so}>0.05,$G{r}/{so},0))")

    ser = b.hoja("Serie", [("Semana", 16), ("Sell-in (pzas)", 13), ("Sell-out (pzas)", 13), ("Días que abarca", 16)],
                 {2: NUM, 3: NUM})

    g0 = f + 6
    b.seccion(g0, "Cómo se mueve el canal  ·  piezas")
    b.lineas(b.tb, f"B{g0 + 1}", "Sell-in contra sell-out, las 12 semanas cargadas (piezas)",
             Reference(ser, min_col=2, max_col=3, min_row=1, max_row=13), Reference(ser, min_col=1, min_row=2, max_row=13))
    b.barras(b.tb, f"H{g0 + 1}", "Sell-out y sell-in por cadena, en el periodo (piezas)",
             Reference(cad, min_col=2, max_col=3, min_row=1, max_row=9), Reference(cad, min_col=1, min_row=2, max_row=9),
             horizontal=False, formato=NUM, colores=[ACENTO, NARANJA], leyenda=True)
    b.seccion(g0 + 19, "Los 10 modelos que más se mueven  ·  piezas")
    b.barras(b.tb, f"B{g0 + 20}", "Top 10 de sell-out: lo que más vendieron las cadenas (piezas)",
             Reference(tso, min_col=3, min_row=1, max_row=11), Reference(tso, min_col=2, min_row=2, max_row=11),
             formato=NUM, alto=9.4)
    b.barras(b.tb, f"H{g0 + 20}", "Top 10 de sell-in: lo que más se les resurtió (piezas)",
             Reference(tsi, min_col=3, min_row=1, max_row=11), Reference(tsi, min_col=2, min_row=2, max_row=11),
             formato=NUM, alto=9.4, colores=[NARANJA])
    b.seccion(g0 + 40, "Dónde está el dinero")
    b.barras(b.tb, f"B{g0 + 41}", "Sell-out y sell-in por cadena, en el periodo (pesos)",
             Reference(cad, min_col=4, max_col=5, min_row=1, max_row=9), Reference(cad, min_col=1, min_row=2, max_row=9),
             horizontal=False, formato=MILLONES, colores=[ACENTO, NARANJA], leyenda=True)
    b.barras(b.tb, f"H{g0 + 41}", "Capital inmovilizado: los 10 estados que más pesan",
             Reference(est, min_col=3, min_row=1, max_row=11), Reference(est, min_col=1, min_row=2, max_row=11),
             formato=MILLONES, alto=9.4, colores=[ROJO])
    b.datos()
    return b.guardar()


# ===========================================================================
# MAPA  ·  la geografía del canal y lo que cambió contra el corte anterior
# ===========================================================================
def mapa():
    b = Libro("mapa", "mapa.xlsx", "Mapa de alertas",
              "Dónde está parado el inventario y qué cambió contra el corte anterior: qué alertas se resolvieron, "
              "cuáles son nuevas y cuáles siguen. Mueve el umbral y los dos cortes se vuelven a clasificar con la "
              "misma regla.")
    N = 43
    E = lambda col: f"Estados!${col}$2:${col}${N}"

    b.kpi("estados", "Estados con presencia", f"=COUNTA({E('A')})", NUM, "Con al menos una tienda en el alcance")
    b.kpi("alerta", "Estados en alerta",
          f'=COUNTIF({E("N")},"Saturado")+COUNTIF({E("N")},"Cobertura alta")+COUNTIF({E("N")},"Quiebre")',
          NUM, "Saturados, con cobertura alta o en quiebre", ROJO)
    b.kpi("exc", "Piezas sobre el umbral", f"=SUM({E('G')})", NUM, "Existencia que rebasa la cobertura objetivo", ROJO)
    b.kpi("capital", "Capital inmovilizado", f"=SUM({E('H')})", MILLONES, "Esas piezas, al precio de venta a la cadena", ROJO)
    b.kpi("perdidaPzas", "Venta perdida, piezas", f"=SUM({E('O')})", DEC, "Por semana, en quiebres con desplazamiento vivo", ROJO)
    b.kpi("perdida", "Venta perdida semanal $", f"=SUM({E('I')})", MILLONES, "Esas piezas, a precio de lista", ROJO)
    b.kpi("alertasAntes", "Alertas, corte anterior", "=0", NUM, "Combinaciones en quiebre o sobre el umbral")
    b.kpi("alertasHoy", "Alertas, corte actual", "=0", NUM, "Con la misma regla y el mismo umbral")
    b.kpi("resueltas", "Alertas resueltas", "=0", NUM, "Estaban en alerta y ya no", VERDE)
    b.kpi("nuevas", "Alertas nuevas", "=0", NUM, "No estaban en alerta y ahora sí", ROJO)
    b.kpi("vigentes", "Siguen en alerta", "=0", NUM, "En alerta en los dos cortes", NARANJA)
    b.kpi("impacto", "Impacto total", f"=SUM({E('J')})", MILLONES, "Capital parado más 4 semanas de venta perdida")

    f = b.fila_libre() + 1
    b.seccion(f, "Supuestos  ·  las celdas azules se mueven", "B", "F")
    b.seccion(f, "Lo que resulta", "H", "M")
    u = b.supuesto(f + 1, "umbral", "Umbral de cobertura", 12, SEM)
    tasa = b.supuesto(f + 2, "tasa", "Tasa financiera anual del inventario", 0.18, "0%")
    ah, an = f_alerta(u), f_alerta(u, True)
    b.tb[b.celdas["alertasAntes"][1]] = f"=SUMPRODUCT({an})"
    b.tb[b.celdas["alertasHoy"][1]] = f"=SUMPRODUCT({ah})"
    b.tb[b.celdas["resueltas"][1]] = f"=SUMPRODUCT({an}*(1-{ah}))"
    b.tb[b.celdas["nuevas"][1]] = f"=SUMPRODUCT((1-{an})*{ah})"
    b.tb[b.celdas["vigentes"][1]] = f"=SUMPRODUCT({an}*{ah})"
    ca = b.resultado(f + 1, "capitalAnt", "Capital inmovilizado en el corte anterior",
                     f"=ROUND(SUMPRODUCT({f_exc(u, True)}*{R('Costo')}),0)", MILLONES)
    b.resultado(f + 2, "capitalCambio", "Cambio de capital contra el corte anterior", f"={T(b, 'capital')}-{ca}", MILLONES, fuerte=True)
    b.resultado(f + 3, "excAnt", "Piezas sobre el umbral en el corte anterior", f"=SUMPRODUCT({f_exc(u, True)})", NUM)
    b.resultado(f + 4, "perdidaAnt", "Venta perdida semanal en el corte anterior", f"=SUMPRODUCT({f_perdida(True)})", MILLONES)
    b.resultado(f + 5, "financiero", "Costo financiero anual del capital inmovilizado", f"={T(b, 'capital')}*{tasa}", MILLONES)
    b.resultado(f + 6, "perdidaAnual", "Venta perdida si el quiebre dura un año", f"={T(b, 'perdida')}*52", MILLONES)
    b.leyenda(f + 9, "Una alerta es una combinación de tienda y modelo en quiebre o sobre el umbral. Los dos cortes "
                     "se clasifican con la misma regla; la hoja Cambio de corte lista una por una las que se "
                     "resolvieron, las nuevas y las que siguen.")

    es = b.hoja("Estados", [
        ("Estado", 22), ("Sucursales", 11), ("Combinaciones", 13), ("Piezas", 10), ("Sell-out 8 sem", 13),
        ("Venta 8 sem $", 15), ("Piezas sobre umbral", 12), ("Capital inmovilizado", 17), ("Venta perdida $/sem", 15),
        ("Impacto $", 15), ("Cobertura (sem)", 12), ("Combinaciones sobre umbral", 15), ("Quiebres", 10),
        ("Estado del inventario", 19), ("Venta perdida (pzas/sem)", 14), ("Alertas corte anterior", 13),
        ("Alertas corte actual", 13), ("Resueltas", 11), ("Nuevas", 10),
    ], {2: NUM, 3: NUM, 4: NUM, 5: NUM, 6: DINERO, 7: NUM, 8: DINERO, 9: DINERO, 10: DINERO, 11: DEC, 12: NUM, 13: NUM,
        15: DEC, 16: NUM, 17: NUM, 18: NUM, 19: NUM},
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
        b.fx(es, "O", r, f"={g}SUMPRODUCT({k}*{f_perdida_pzas()}))")
        b.fx(es, "P", r, f"={g}SUMPRODUCT({k}*{an}))")
        b.fx(es, "Q", r, f"={g}SUMPRODUCT({k}*{ah}))")
        b.fx(es, "R", r, f"={g}SUMPRODUCT({k}*{an}*(1-{ah})))")
        b.fx(es, "S", r, f"={g}SUMPRODUCT({k}*(1-{an})*{ah}))")

    su = b.hoja("Sucursales", [
        ("Punto de venta", 32), ("Cadena", 20), ("Estado", 18), ("Ciudad", 18), ("Combinaciones", 13),
        ("Piezas", 10), ("Sell-out semanal", 13), ("Cobertura (sem)", 12), ("Piezas sobre umbral", 12),
        ("Capital inmovilizado", 17), ("Quiebres", 10), ("Venta perdida $/sem", 15), ("Estado del inventario", 19),
        ("Venta perdida (pzas/sem)", 14), ("Alertas corte anterior", 13), ("Alertas corte actual", 13),
    ], {5: NUM, 6: NUM, 7: DEC, 8: DEC, 9: NUM, 10: DINERO, 11: NUM, 12: DINERO, 14: DEC, 15: NUM, 16: NUM})
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
        b.fx(su, "N", r, f"={g}SUMPRODUCT({k}*{f_perdida_pzas()}))")
        b.fx(su, "O", r, f"={g}SUMPRODUCT({k}*{an}))")
        b.fx(su, "P", r, f"={g}SUMPRODUCT({k}*{ah}))")

    # Combinación por combinación: cómo estaba y cómo está.
    cc = b.hoja("Cambio de corte", [
        ("Punto de venta", 30), ("Cadena", 20), ("Estado", 17), ("SKU", 13), ("Modelo", 30),
        ("Piezas corte anterior", 12), ("Sell-out sem corte anterior", 13), ("Piezas corte actual", 12),
        ("Sell-out sem corte actual", 13), ("Costo", 11), ("Situación anterior", 16), ("Situación actual", 16),
        ("Qué cambió", 15), ("Piezas sobre umbral antes", 13), ("Piezas sobre umbral hoy", 13),
        ("Capital antes", 14), ("Capital hoy", 14),
    ], {6: NUM, 7: DEC, 8: NUM, 9: DEC, 10: DINERO, 14: NUM, 15: NUM, 16: DINERO, 17: DINERO}, sobrantes="quitar")

    def situacion(pz, so):
        cob = f"IF({so}>0.05,{pz}/{so},IF({pz}>0,99,0))"
        return (f'IF(AND({cob}<2.5,{so}>0.15),"Quiebre",IF({cob}<={u},"Sano",'
                f'IF({cob}<={u}*1.45,"Cobertura alta","Saturado")))')

    for r in range(2, 402):
        g = guarda(r)
        b.fx(cc, "K", r, f"={g}{situacion(f'$F{r}', f'$G{r}')})")
        b.fx(cc, "L", r, f"={g}{situacion(f'$H{r}', f'$I{r}')})")
        b.fx(cc, "M", r, f'={g}IF(AND($K{r}<>"Sano",$L{r}="Sano"),"Resuelta",IF(AND($K{r}="Sano",$L{r}<>"Sano"),"Nueva",'
                         f'IF(AND($K{r}<>"Sano",$L{r}<>"Sano"),"Sigue en alerta","Sin alerta"))))')
        b.fx(cc, "N", r, f"={g}MAX(0,ROUND($F{r}-$G{r}*{u},0)))")
        b.fx(cc, "O", r, f"={g}MAX(0,ROUND($H{r}-$I{r}*{u},0)))")
        b.fx(cc, "P", r, f"={g}ROUND($N{r}*$J{r},0))")
        b.fx(cc, "Q", r, f"={g}ROUND($O{r}*$J{r},0))")

    g0 = f + 11
    b.seccion(g0, "Los 15 estados de mayor impacto")
    b.barras(b.tb, f"B{g0 + 1}", "Capital inmovilizado por estado",
             Reference(es, min_col=8, min_row=1, max_row=16), Reference(es, min_col=1, min_row=2, max_row=16),
             formato=MILLONES, alto=10.5, colores=[ROJO])
    b.barras(b.tb, f"H{g0 + 1}", "Alertas por estado: corte anterior contra corte actual",
             Reference(es, min_col=16, max_col=17, min_row=1, max_row=16), Reference(es, min_col=1, min_row=2, max_row=16),
             formato=NUM, alto=10.5, colores=["A9B8CC", ACENTO], leyenda=True)
    b.datos()
    return b.guardar()


# ===========================================================================
# QUÉ ATENDER  ·  las decisiones de la semana
# ===========================================================================
def ejecucion():
    b = Libro("ejecucion", "ejecucion.xlsx", "Qué atender",
              "Las decisiones de la semana, en piezas y en pesos: qué no resurtir y qué resurtir. "
              "El umbral y los días objetivo son celdas vivas.")
    b.kpi("sobre", "No resurtir", "=0", NUM, "Combinaciones sobre el umbral", ROJO)
    b.kpi("exc", "Piezas sobre el umbral", "=0", NUM, "Lo que sobra en esas combinaciones", ROJO)
    b.kpi("capital", "Capital parado", "=0", MILLONES, "Esas piezas, al precio de venta a la cadena", ROJO)
    b.kpi("quiebres", "Combinaciones en quiebre", f"=SUMPRODUCT({f_quiebre()})", NUM, "Menos de 2.5 semanas con venta viva")
    b.kpi("perdidaPzas", "Venta perdida, piezas", f"=SUMPRODUCT({f_perdida_pzas()})", DEC, "Por semana, por quiebres", ROJO)
    b.kpi("perdida", "Venta perdida semanal $", f"=SUMPRODUCT({f_perdida()})", MILLONES, "Esas piezas, a precio de lista", ROJO)
    b.kpi("resurtir", "Piezas a resurtir", "=0", NUM, "Para llegar a los días objetivo", VERDE)
    b.kpi("resurtirMonto", "Resurtido sugerido $", "=0", MILLONES, "Sell-in que representa ese resurtido", VERDE)
    b.kpi("transito", "Tránsito hacia saturadas", "=0", NUM, "Piezas en camino a combinaciones sobre el umbral")
    b.kpi("inaccion", "Costo de no hacer nada", "=0", MILLONES, "Un mes más como está", ROJO)

    f = b.fila_libre() + 1
    b.seccion(f, "Supuestos  ·  las celdas azules se mueven", "B", "F")
    b.seccion(f, "Lo que resulta", "H", "M")
    u = b.supuesto(f + 1, "umbral", "Umbral de cobertura", 12, SEM)
    dias = b.supuesto(f + 2, "dias", "Días de inventario objetivo al resurtir", 56, '0" días"')
    tasa = b.supuesto(f + 3, "tasa", "Tasa financiera anual del inventario", 0.18, "0%")

    sug = (f"ROUND({R('Sell-out semanal')}*{dias}/7,0)-{R('Piezas')}-{R('Tránsito')}")
    b.tb[b.celdas["sobre"][1]] = f"=SUMPRODUCT({f_sobre(u)})"
    b.tb[b.celdas["exc"][1]] = f"=SUMPRODUCT({f_exc(u)})"
    b.tb[b.celdas["capital"][1]] = f"=ROUND(SUMPRODUCT({f_exc(u)}*{R('Costo')}),0)"
    b.tb[b.celdas["resurtir"][1]] = f"=SUMPRODUCT(({R('Reporta')}=1)*(({sug})>0)*({sug}))"
    b.tb[b.celdas["resurtirMonto"][1]] = f"=SUMPRODUCT(({R('Reporta')}=1)*(({sug})>0)*({sug})*{R('Costo')})"
    b.tb[b.celdas["transito"][1]] = f"=SUMPRODUCT({f_sobre(u)}*{R('Tránsito')})"
    b.tb[b.celdas["inaccion"][1]] = f"={T(b, 'perdida')}*4.3+{T(b, 'capital')}*{tasa}/12"

    b.resultado(f + 1, "transitoMonto", "Valor del tránsito hacia combinaciones sobre el umbral",
                f"=SUMPRODUCT({f_sobre(u)}*{R('Tránsito')}*{R('Costo')})", MILLONES)
    b.resultado(f + 2, "financiero", "Costo financiero anual del capital parado", f"={T(b, 'capital')}*{tasa}", MILLONES)
    b.resultado(f + 3, "perdidaAnual", "Venta perdida si los quiebres duran un año", f"={T(b, 'perdida')}*52", MILLONES)
    b.leyenda(f + 7, "No resurtir no es un castigo a la tienda: es no mandar más piezas a donde ya sobran. Mover "
                     "mercancía entre tiendas lo decide cada cadena; aquí solo está lo que la marca sí controla.")

    ne = b.hoja("No resurtir", [
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
        ("Sell-out semanal", 13), ("Precio de lista", 11), ("Costo", 11), ("Inventario objetivo", 13),
        ("Resurtido sugerido (pzas)", 13), ("Resurtido sugerido $", 14), ("Venta perdida (pzas/sem)", 13),
        ("Venta perdida $/sem", 15),
    ], {5: NUM, 6: NUM, 7: DEC, 8: DINERO, 9: DINERO, 10: NUM, 11: NUM, 12: DINERO, 13: DEC, 14: DINERO},
        sobrantes="quitar")
    for r in range(2, 302):
        g = guarda(r)
        b.fx(rs, "J", r, f"={g}ROUND($G{r}*{dias}/7,0))")
        b.fx(rs, "K", r, f"={g}MAX(0,$J{r}-$E{r}-$F{r}))")
        b.fx(rs, "L", r, f"={g}$K{r}*$I{r})")
        b.fx(rs, "M", r, f"={g}IF(AND($E{r}=0,$G{r}>0.15),$G{r},0))")
        b.fx(rs, "N", r, f"={g}$M{r}*$H{r})")

    co = b.hoja("Colecciones", [
        ("Colección", 20), ("Venta perdida (pzas/sem)", 14), ("Venta perdida $/sem", 16), ("Piezas sobre umbral", 13),
        ("Capital parado", 15), ("Quiebres", 10), ("Combinaciones sobre umbral", 15),
    ], {2: DEC, 3: DINERO, 4: NUM, 5: DINERO, 6: NUM, 7: NUM}, recorte=12)
    for r in range(2, 14):
        g, k = guarda(r), f"({R('Colección')}=$A{r})"
        b.fx(co, "B", r, f"={g}SUMPRODUCT({k}*{f_perdida_pzas()}))")
        b.fx(co, "C", r, f"={g}SUMPRODUCT({k}*{f_perdida()}))")
        b.fx(co, "D", r, f"={g}SUMPRODUCT({k}*{f_exc(u)}))")
        b.fx(co, "E", r, f"={g}ROUND(SUMPRODUCT({k}*{f_exc(u)}*{R('Costo')}),0))")
        b.fx(co, "F", r, f"={g}SUMPRODUCT({k}*{f_quiebre()}))")
        b.fx(co, "G", r, f"={g}SUMPRODUCT({k}*{f_sobre(u)}))")

    g0 = f + 9
    b.seccion(g0, "Dónde duele, por colección")
    b.barras(b.tb, f"B{g0 + 1}", "Venta perdida por semana ($)",
             Reference(co, min_col=3, min_row=1, max_row=13), Reference(co, min_col=1, min_row=2, max_row=13),
             formato=DINERO, alto=9.4, colores=[ROJO])
    b.barras(b.tb, f"H{g0 + 1}", "Piezas sobre el umbral",
             Reference(co, min_col=4, min_row=1, max_row=13), Reference(co, min_col=1, min_row=2, max_row=13),
             formato=NUM, alto=9.4, colores=[NARANJA])
    b.datos()
    return b.guardar()


# ===========================================================================
# DETALLE  ·  combinación por combinación
# ===========================================================================
def detalle():
    b = Libro("detalle", "detalle.xlsx", "Detalle por tienda",
              "Cada combinación de tienda y modelo, en piezas y en pesos, clasificada con fórmula. Mueve el umbral "
              "y la columna Estado del inventario, las piezas de más y el capital de cada renglón cambian con él.")
    N = 2501
    Dt = lambda col: f"Detalle!${col}$2:${col}${N}"
    b.kpi("combos", "Combinaciones", f"=COUNTA({Dt('A')})", NUM, "Tienda por modelo, en el alcance")
    b.kpi("piezas", "Piezas en canal", f"=SUM({Dt('G')})", NUM, "Existencia al corte")
    b.kpi("invMonto", "Inventario en canal $", f"=SUM({Dt('Y')})", MILLONES, "Al precio de venta a la cadena")
    b.kpi("so", "Desplazamiento semanal", f"=SUM({Dt('I')})", DEC, "Promedio de 8 semanas, en piezas")
    b.kpi("exc", "Piezas sobre el umbral", f"=SUM({Dt('O')})", NUM, "Lo que sobra", ROJO)
    b.kpi("capital", "Capital inmovilizado", f"=SUM({Dt('P')})", MILLONES, "Esas piezas, al precio de venta a la cadena", ROJO)
    b.kpi("sellout", "Sell-out del periodo", f"=SUM({Dt('U')})", NUM, "Piezas vendidas al público")
    b.kpi("selloutMonto", "Sell-out del periodo $", f"=SUM({Dt('V')})", MILLONES, "A precio de lista")
    b.kpi("sellin", "Sell-in del periodo", f"=SUM({Dt('W')})", NUM, "Piezas resurtidas a las cadenas")
    b.kpi("sellinMonto", "Sell-in del periodo $", f"=SUM({Dt('X')})", MILLONES, "Al precio de venta a la cadena")
    b.kpi("perdidaPzas", "Venta perdida, piezas", f"=SUMPRODUCT(({Dt('Q')}>0)*{Dt('I')})", DEC, "Por semana, por quiebres", ROJO)
    b.kpi("perdida", "Venta perdida semanal $", f"=SUM({Dt('Q')})", MILLONES, "Esas piezas, a precio de lista", ROJO)
    b.kpi("sanas", "Sanas", f'=COUNTIF({Dt("S")},"Sano")', NUM, "Dentro del umbral", VERDE)
    b.kpi("altas", "Cobertura alta", f'=COUNTIF({Dt("S")},"Cobertura alta")', NUM, "Sobre el umbral", NARANJA)
    b.kpi("saturadas", "Saturadas", f'=COUNTIF({Dt("S")},"Saturado")', NUM, "Más de 1.45 veces el umbral", ROJO)
    b.kpi("quiebres", "En quiebre", f'=COUNTIF({Dt("S")},"Quiebre")', NUM, "Menos de 2.5 semanas con venta viva", ROJO)
    b.kpi("sinReporte", "Sin reporte", f'=COUNTIF({Dt("S")},"Sin reporte")', NUM, "La tienda no entrega sell-out")
    b.kpi("impacto", "Impacto acumulado", f"=SUM({Dt('R')})", MILLONES, "Capital más 4 semanas de venta perdida")

    f = b.fila_libre() + 1
    b.seccion(f, "Supuestos  ·  las celdas azules se mueven", "B", "F")
    u = b.supuesto(f + 1, "umbral", "Umbral de cobertura", 12, SEM)

    dt = b.hoja("Detalle", [
        ("Punto de venta", 30), ("Cadena", 20), ("Estado", 17), ("SKU", 13), ("Modelo", 30), ("Colección", 15),
        ("Piezas", 9), ("Tránsito", 9), ("Sell-out semanal", 12), ("Precio", 11), ("Costo", 11), ("Días en canal", 10),
        ("Reporta", 9), ("Cobertura (sem)", 11), ("Piezas de más", 10), ("Capital inmovilizado", 14),
        ("Venta perdida $/sem", 14), ("Impacto $", 13), ("Estado del inventario", 17), ("Tienda · modelo", 40),
        ("Sell-out periodo (pzas)", 13), ("Sell-out periodo $", 14), ("Sell-in periodo (pzas)", 13),
        ("Sell-in periodo $", 14), ("Existencia $", 13),
    ], {7: NUM, 8: NUM, 9: DEC, 10: DINERO, 11: DINERO, 12: NUM, 13: NUM, 14: DEC, 15: NUM, 16: DINERO, 17: DINERO,
        18: DINERO, 21: DEC, 22: DINERO, 23: DEC, 24: DINERO, 25: DINERO},
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
        b.fx(dt, "Y", r, f"={g}$G{r}*$K{r})")

    cl = b.hoja("Clases", [("Estado del inventario", 22), ("Combinaciones", 14), ("Piezas en canal", 14),
                           ("Piezas de más", 13), ("Capital inmovilizado", 18), ("Venta perdida $/sem", 16)],
                {2: NUM, 3: NUM, 4: NUM, 5: DINERO, 6: DINERO}, recorte=4)
    for r in range(2, 6):
        g = guarda(r)
        b.fx(cl, "B", r, f"={g}COUNTIF({Dt('S')},$A{r}))")
        b.fx(cl, "C", r, f"={g}SUMIF({Dt('S')},$A{r},{Dt('G')}))")
        b.fx(cl, "D", r, f"={g}SUMIF({Dt('S')},$A{r},{Dt('O')}))")
        b.fx(cl, "E", r, f"={g}SUMIF({Dt('S')},$A{r},{Dt('P')}))")
        b.fx(cl, "F", r, f"={g}SUMIF({Dt('S')},$A{r},{Dt('Q')}))")

    g0 = f + 4
    b.seccion(g0, "Cómo está repartido el inventario")
    b.barras(b.tb, f"B{g0 + 1}", "Piezas en canal por estado del inventario",
             Reference(cl, min_col=3, min_row=1, max_row=5), Reference(cl, min_col=1, min_row=2, max_row=5),
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
# SIMULADOR  ·  el corte completo con palancas sobre el sell-in
# ===========================================================================
def corte():
    b = Libro("corte", "simulador.xlsx", "Simulador del corte",
              "El corte completo con sus palancas. Todo lo que se simula es sell-in: lo que la marca le vende a las "
              "cadenas. El sell-out aparece solo como lo que cada cadena ya vendió. Mueve el crecimiento, el precio, "
              "o el umbral y mira qué les pasa a las piezas y a los pesos.")
    b.kpi("sellin", "Sell-in simulado", "=0", NUM, "Piezas, con el crecimiento que pusiste")
    b.kpi("sellinMonto", "Sell-in simulado $", "=0", MILLONES, "Con el crecimiento y el precio que pusiste")
    b.kpi("sellout", "Sell-out del periodo", f"=SUM({R('Sell-out periodo')})", NUM, "Piezas que las cadenas ya vendieron")
    b.kpi("selloutMonto", "Sell-out del periodo $", f"=SUM({R('Sell-out periodo $')})", MILLONES, "Esas piezas, a precio de lista")
    b.kpi("indice", "Índice de desplazamiento", "=0", PORC, "Sell-out entre sell-in simulado, en piezas")
    b.kpi("exc", "Piezas sobre el umbral", "=0", NUM, "Existencia que rebasa la cobertura objetivo", ROJO)
    b.kpi("capital", "Capital inmovilizado", "=0", MILLONES, "Esas piezas, al precio de venta a la cadena", ROJO)
    b.kpi("perdidaPzas", "Venta perdida, piezas", f"=SUMPRODUCT({f_perdida_pzas()})", DEC, "Por semana, por quiebres", ROJO)
    b.kpi("perdida", "Venta perdida semanal $", f"=SUMPRODUCT({f_perdida()})", MILLONES, "Esas piezas, a precio de lista", ROJO)

    f = b.fila_libre() + 1
    b.seccion(f, "Supuestos  ·  las celdas azules se mueven", "B", "F")
    b.seccion(f, "Lo que resulta", "H", "M")
    crec = b.supuesto(f + 1, "crecimiento", "Crecimiento del sell-in en piezas", 0, "+0.0%;-0.0%;0.0%")
    prec = b.supuesto(f + 2, "precio", "Cambio del precio de venta a la cadena", 0, "+0.0%;-0.0%;0.0%")
    u = b.supuesto(f + 3, "umbral", "Umbral de cobertura", 12, SEM)

    si_p, si_m = R("Sell-in periodo"), R("Sell-in periodo $")
    so_p, so_m = R("Sell-out periodo"), R("Sell-out periodo $")
    b0 = b.resultado(f + 1, "sellinBase", "Sell-in del periodo, sin supuestos (pzas)", f"=SUM({si_p})", NUM)
    m0 = b.resultado(f + 2, "sellinBaseMonto", "Sell-in del periodo, sin supuestos ($)", f"=SUM({si_m})", DINERO)
    p1 = b.resultado(f + 3, "sellinR", "Sell-in simulado (pzas)", f"={b0}*(1+{crec})", NUM, fuerte=True)
    m1 = b.resultado(f + 4, "sellinMontoR", "Sell-in simulado ($)", f"={m0}*(1+{crec})*(1+{prec})", DINERO, fuerte=True)
    b.resultado(f + 5, "difPzas", "Diferencia contra el periodo (pzas)", f"={p1}-{b0}", NUM)
    b.resultado(f + 6, "difMonto", "Diferencia contra el periodo ($)", f"={m1}-{m0}", DINERO)
    x = b.resultado(f + 7, "excR", "Piezas sobre el umbral", f"=SUMPRODUCT({f_exc(u)})", NUM)
    k = b.resultado(f + 8, "capitalR", "Capital inmovilizado sobre el umbral", f"=ROUND(SUMPRODUCT({f_exc(u)}*{R('Costo')}),0)", DINERO)

    b.tb[b.celdas["sellin"][1]] = f"={p1}"
    b.tb[b.celdas["sellinMonto"][1]] = f"={m1}"
    b.tb[b.celdas["indice"][1]] = f"=IF({p1}=0,0,{T(b, 'sellout')}/{p1})"
    b.tb[b.celdas["exc"][1]] = f"={x}"
    b.tb[b.celdas["capital"][1]] = f"={k}"

    def tabla(nombre, titulo, columna, filas):
        ws = b.hoja(nombre, [
            (titulo, 24), ("Sell-in simulado (pzas)", 14), ("Sell-out (pzas)", 13), ("Sell-in simulado $", 16),
            ("Sell-out $", 15), ("Desplazó", 10), ("Piezas en canal", 13), ("Piezas sobre umbral", 13),
            ("Capital inmovilizado", 17),
        ], {2: NUM, 3: NUM, 4: DINERO, 5: DINERO, 6: PORC, 7: NUM, 8: NUM, 9: DINERO}, recorte=filas)
        for r in range(2, filas + 2):
            g, q = guarda(r), f"({R(columna)}=$A{r})"
            b.fx(ws, "B", r, f"={g}SUMIFS({si_p},{R(columna)},$A{r})*(1+{crec}))")
            b.fx(ws, "C", r, f"={g}SUMIFS({so_p},{R(columna)},$A{r}))")
            b.fx(ws, "D", r, f"={g}SUMIFS({si_m},{R(columna)},$A{r})*(1+{crec})*(1+{prec}))")
            b.fx(ws, "E", r, f"={g}SUMIFS({so_m},{R(columna)},$A{r}))")
            b.fx(ws, "F", r, f"={g}IF($B{r}=0,0,$C{r}/$B{r}))")
            b.fx(ws, "G", r, f"={g}SUMIFS({R('Piezas')},{R(columna)},$A{r}))")
            b.fx(ws, "H", r, f"={g}SUMPRODUCT({q}*{f_exc(u)}))")
            b.fx(ws, "I", r, f"={g}ROUND(SUMPRODUCT({q}*{f_exc(u)}*{R('Costo')}),0))")
        return ws

    cad = tabla("Cadenas", "Cadena", "Cadena", 8)
    col = tabla("Colecciones", "Colección", "Colección", 12)

    g0 = f + 10
    b.seccion(g0, "El efecto de tus supuestos")
    b.barras(b.tb, f"B{g0 + 1}", "Sell-in simulado contra sell-out, por cadena (piezas)",
             Reference(cad, min_col=2, max_col=3, min_row=1, max_row=9), Reference(cad, min_col=1, min_row=2, max_row=9),
             horizontal=False, formato=NUM, colores=[NARANJA, ACENTO], leyenda=True)
    b.barras(b.tb, f"H{g0 + 1}", "Sell-in simulado por colección ($)",
             Reference(col, min_col=4, min_row=1, max_row=13), Reference(col, min_col=1, min_row=2, max_row=13),
             formato=MILLONES, alto=9.4, colores=[NARANJA])
    b.datos()
    return b.guardar()


# ===========================================================================
# ESCENARIO  ·  el plan del año sobre sell-in, con su modelo entero en fórmulas
# ===========================================================================
def escenario():
    b = Libro("escenario", "escenario.xlsx", "Escenario y estado de resultados",
              "El modelo del plan, completo y en fórmulas, sobre sell-in: lo que la marca le vende a las cadenas. Los "
              "nueve supuestos de la pantalla son las celdas azules. Muévelos y se recalculan las piezas por mes, el "
              "estado de resultados por trimestre y el EBITDA. El sell-out va aparte, en la hoja Lo ya vendido.")
    b.kpi("ingreso", "Sell-in proyectado $", "=Meses!$N$4", MILLONES, "Doce meses, a precio de venta a la cadena")
    b.kpi("unidades", "Sell-in proyectado", "=Meses!$N$9", NUM, "Piezas, doce meses")
    b.kpi("margen", "Margen sobre sell-in", "=Meses!$N$6", MILLONES, "Sell-in menos costo del producto")
    b.kpi("margenPct", "Margen %", "=IF(Meses!$N$4=0,0,Meses!$N$6/Meses!$N$4)", PORC, "Sobre el sell-in")
    b.kpi("ebitda", "EBITDA", "=Meses!$N$8", MILLONES, "Después de gasto e inventario", VERDE)
    b.kpi("ebitdaPct", "EBITDA %", "=IF(Meses!$N$4=0,0,Meses!$N$8/Meses!$N$4)", PORC, "Sobre el sell-in", VERDE)
    b.kpi("recuperadoPzas", "Quiebres que se cierran", "=0", NUM, "Piezas de sell-in que se recuperan")
    b.kpi("recuperado", "Quiebres que se cierran $", "=0", MILLONES, "Esas piezas, a precio de venta a la cadena")
    b.kpi("caja", "Caja liberada", "=0", MILLONES, "Por bajar los días de inventario objetivo")

    f = b.fila_libre() + 1
    b.seccion(f, "Supuestos del escenario  ·  las celdas azules se mueven", "B", "F")
    b.seccion(f, "Más supuestos", "H", "M")
    crec = b.supuesto(f + 1, "crecimiento", "Crecimiento del sell-in", 0, "+0.0%;-0.0%;0.0%")
    prec = b.supuesto(f + 2, "precio", "Movimiento de precio", 0, "+0.0%;-0.0%;0.0%")
    cost = b.supuesto(f + 3, "costo", "Movimiento de costo", 0, "+0.0%;-0.0%;0.0%")
    elas = b.supuesto(f + 4, "elasticidad", "Elasticidad precio", 1.1, "0.0")
    serv = b.supuesto(f + 5, "servicio", "Nivel de servicio: quiebres que se cierran", 0, "0%")
    mkt = b.supuesto(f + 1, "mercadotecnia", "Inversión en mercadotecnia", 28, '"$"0.0" M"', col="H")
    dias = b.supuesto(f + 2, "dias", "Días de inventario objetivo", 56, '0" días"', col="H")
    fijo = b.supuesto(f + 3, "gastoFijo", "Gasto operativo fijo", 98, '"$"0.0" M"', col="H")
    var = b.supuesto(f + 4, "gastoVariable", "Gasto variable sobre ingreso", 0.095, "0.0%", col="H")

    h = f + 7
    b.seccion(h, "Lo que viene del corte  ·  no se mueve aquí", "B", "F")
    b.seccion(h, "Lo que resulta", "H", "M")
    # Se usan celdas azules atenuadas: son datos del corte, no palancas.
    per = b.supuesto(h + 1, "perdidaSem", "Venta perdida semanal por quiebres, a precio de lista", 0, DINERO)
    pzs = b.supuesto(h + 2, "perdidaPzasSem", "Esa venta perdida, en piezas por semana", 0, DEC)
    capp = b.supuesto(h + 3, "capitalParado", "Capital inmovilizado en el canal", 0, DINERO)
    bmk = b.supuesto(h + 4, "baseMkt", "Mercadotecnia de referencia", 28, '"$"0.0" M"')
    bdi = b.supuesto(h + 5, "baseDias", "Días de inventario de referencia", 56, '0" días"')
    mm = b.supuesto(h + 6, "margenMarca", "Margen de la marca sobre su precio a la cadena", 0.42, "0.0%")
    mc = b.supuesto(h + 7, "margenCadena", "Margen medio con que la cadena marca el precio de lista", 0.417, "0.0%")
    for k in ("perdidaSem", "perdidaPzasSem", "capitalParado", "baseMkt", "baseDias", "margenMarca", "margenCadena"):
        b.tb[b.celdas[k][1]].font = Font(name="Calibri", size=10, bold=True, color=GRIS)

    fac = b.resultado(h + 1, "factor", "Factor de volumen que aplican los supuestos",
                      f"=(1+{crec})*(1+{prec})^(-{elas})*IF({mkt}<=0,0.94,1+0.085*LN({mkt}/MAX(1,{bmk})))"
                      f"*IF({dias}<35,1-(35-{dias})*0.006,1)", "0.000")
    cinv = b.resultado(h + 2, "costoInv", "Costo financiero del inventario", f"=Meses!$N$5/365*{dias}*0.18", MILLONES)
    rec = T(b, "recuperado")
    rpz = T(b, "recuperadoPzas")
    # Lo que se recupera es sell-in: las piezas perdidas, al precio de venta a la cadena.
    b.tb[b.celdas["recuperado"][1]] = f"={per}*52*{serv}*(1-{mc})"
    b.tb[b.celdas["recuperadoPzas"][1]] = f"={pzs}*52*{serv}"
    b.tb[b.celdas["caja"][1]] = f"=Meses!$N$5/365*({bdi}-{dias})"

    # --- el modelo, colección por colección y mes por mes -------------------
    mo = b.hoja("Modelo", [
        ("Colección", 18), ("Segmento", 12), ("Sell-in anual base (pzas)", 13), ("Precio de lista", 12),
        ("Margen de la cadena", 11), ("Estacionalidad", 11), ("Precio de sell-in", 12), ("Costo unitario", 12),
        *[(m, 9) for m in MESES],
        ("Piezas año", 12), ("Sell-in $", 15), ("Costo $", 15), ("Margen $", 15), ("Margen %", 10),
    ], {3: NUM, 4: DINERO, 5: PORC, 6: "0.00", 7: DINERO, 8: DINERO, **{i: NUM for i in range(9, 22)},
        22: DINERO, 23: DINERO, 24: DINERO, 25: PORC})
    for r in range(2, 14):
        g = guarda(r)
        b.fx(mo, "G", r, f"={g}$D{r}*(1-$E{r})*(1+{prec}))")
        b.fx(mo, "H", r, f"={g}$D{r}*(1-$E{r})*(1-{mm})*(1+{cost}))")
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

    me = b.hoja("Meses", [("Concepto", 34), *[(m, 13) for m in MESES], ("Año", 15)],
                {i: DINERO for i in range(2, 15)})
    for i in range(12):
        c, m = L(2 + i), L(9 + i)
        peso = f"Modelo!{m}$16/SUM(Modelo!$I$16:$T$16)"
        b.fx(me, c, 2, f'={guarda(2)}SUMPRODUCT(Modelo!{m}$2:{m}$13,Modelo!$G$2:$G$13))')
        b.fx(me, c, 3, f"={guarda(3)}{rec}*{peso})")
        b.fx(me, c, 4, f"={guarda(4)}{c}2+{c}3)")
        b.fx(me, c, 5, f'={guarda(5)}SUMPRODUCT(Modelo!{m}$2:{m}$13,Modelo!$H$2:$H$13)+{c}3*(1-{mm}))')
        b.fx(me, c, 6, f"={guarda(6)}{c}4-{c}5)")
        b.fx(me, c, 7, f"={guarda(7)}{fijo}*1000000/12+{c}4*{var}+{mkt}*1000000/12+{cinv}/12)")
        b.fx(me, c, 8, f"={guarda(8)}{c}6-{c}7)")
        b.fx(me, c, 9, f"={guarda(9)}SUM(Modelo!{m}$2:{m}$13)+{rpz}*{peso})")
        me[f"{c}9"].number_format = NUM
    for r in range(2, 10):
        b.fx(me, "N", r, f"={guarda(r)}SUM($B{r}:$M{r}))")
    me["N9"].number_format = NUM

    rs = b.hoja("Resultados", [("Concepto", 38), ("T1", 15), ("T2", 15), ("T3", 15), ("T4", 15), ("Año", 16)],
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
        b.fx(rs, c, 8, f"={guarda(8)}{cinv}/4)")
        b.fx(rs, c, 9, f"={guarda(9)}SUM({c}5:{c}8))")
        b.fx(rs, c, 10, f"={guarda(10)}{c}4-{c}9)")
        b.fx(rs, c, 11, f"={guarda(11)}SUM(Meses!{a}$9:{z}$9))")
        rs[f"{c}11"].number_format = NUM
    for r in range(2, 12):
        b.fx(rs, "F", r, f"={guarda(r)}SUM($B{r}:$E{r}))")
    rs["F11"].number_format = NUM

    # La gráfica trimestral necesita sell-in y EBITDA uno junto al otro.
    tr = b.hoja("Trimestres", [("Trimestre", 12), ("Sell-in $", 15), ("EBITDA", 15), ("Sell-in (pzas)", 14)],
                {2: DINERO, 3: DINERO, 4: NUM}, recorte=4)
    for q in range(4):
        c = L(2 + q)
        b.fx(tr, "B", 2 + q, f"={guarda(2 + q)}Resultados!{c}$2)")
        b.fx(tr, "C", 2 + q, f"={guarda(2 + q)}Resultados!{c}$10)")
        b.fx(tr, "D", 2 + q, f"={guarda(2 + q)}Resultados!{c}$11)")

    es = b.hoja("Escenarios", [("Escenario", 30), ("Sell-in (pzas)", 14), ("Sell-in $", 16), ("Margen $", 16),
                               ("Margen %", 11), ("EBITDA $", 16), ("EBITDA %", 11)],
                {2: NUM, 3: DINERO, 4: DINERO, 5: PORC, 6: DINERO, 7: PORC}, recorte=8)
    # El primer renglón es este mismo libro, con lo que tenga puesto en las celdas azules.
    b.fx(es, "B", 2, f"={guarda(2)}{T(b, 'unidades')})")
    b.fx(es, "C", 2, f"={guarda(2)}{T(b, 'ingreso')})")
    b.fx(es, "D", 2, f"={guarda(2)}{T(b, 'margen')})")
    b.fx(es, "E", 2, f"={guarda(2)}{T(b, 'margenPct')})")
    b.fx(es, "F", 2, f"={guarda(2)}{T(b, 'ebitda')})")
    b.fx(es, "G", 2, f"={guarda(2)}{T(b, 'ebitdaPct')})")

    cd = b.hoja("Cadenas", [("Cadena", 24), ("Participación", 13), ("Sell-in (pzas)", 14), ("Sell-in $", 16),
                            ("Margen $", 16)],
                {2: PORC, 3: NUM, 4: DINERO, 5: DINERO}, recorte=8)
    for r in range(2, 10):
        b.fx(cd, "C", r, f"={guarda(r)}{T(b, 'unidades')}*$B{r})")
        b.fx(cd, "D", r, f"={guarda(r)}{T(b, 'ingreso')}*$B{r})")
        b.fx(cd, "E", r, f"={guarda(r)}{T(b, 'margen')}*$B{r})")

    # El sell-out no entra al plan. Va aquí, como lo que cada cadena ya vendió.
    lv = b.hoja("Lo ya vendido", [("Cadena", 24), ("Sell-out (pzas)", 14), ("Sell-in (pzas)", 14), ("Sell-out $", 16),
                                  ("Sell-in $", 16), ("Diferencia (pzas)", 14), ("Desplazó", 11)],
                {2: NUM, 3: NUM, 4: DINERO, 5: DINERO, 6: NUM, 7: PORC}, recorte=8)
    for r in range(2, 10):
        b.fx(lv, "F", r, f"={guarda(r)}$C{r}-$B{r})")
        b.fx(lv, "G", r, f"={guarda(r)}IF($C{r}=0,0,$B{r}/$C{r}))")

    g0 = h + 9
    b.seccion(g0, "El año, trimestre por trimestre")
    b.barras(b.tb, f"B{g0 + 1}", "Sell-in y EBITDA por trimestre",
             Reference(tr, min_col=2, max_col=3, min_row=1, max_row=5), Reference(tr, min_col=1, min_row=2, max_row=5),
             horizontal=False, formato=MILLONES, colores=[NARANJA, VERDE], leyenda=True)
    b.barras(b.tb, f"H{g0 + 1}", "EBITDA por escenario",
             Reference(es, min_col=6, min_row=1, max_row=9), Reference(es, min_col=1, min_row=2, max_row=9),
             formato=MILLONES, colores=[VERDE])
    b.seccion(g0 + 19, "De dónde sale  ·  piezas y pesos")
    b.barras(b.tb, f"B{g0 + 20}", "Sell-in por colección (piezas)",
             Reference(mo, min_col=21, min_row=1, max_row=13), Reference(mo, min_col=1, min_row=2, max_row=13),
             formato=NUM, alto=9.4, colores=[NARANJA])
    b.barras(b.tb, f"H{g0 + 20}", "Sell-in por cadena ($)",
             Reference(cd, min_col=4, min_row=1, max_row=9), Reference(cd, min_col=1, min_row=2, max_row=9),
             formato=MILLONES, alto=9.4, colores=[NARANJA])
    b.seccion(g0 + 40, "Referencia  ·  lo que cada cadena ya vendió")
    b.barras(b.tb, f"B{g0 + 41}", "Sell-out contra sell-in por cadena, en el periodo (piezas)",
             Reference(lv, min_col=2, max_col=3, min_row=1, max_row=9), Reference(lv, min_col=1, min_row=2, max_row=9),
             horizontal=False, formato=NUM, colores=[ACENTO, NARANJA], leyenda=True)
    b.hojas["Modelo"]["recorte"] = 12
    return b.guardar()


# ===========================================================================
# SALUD DEL DATO  ·  qué tanto se puede confiar en el corte
# ===========================================================================
def salud():
    b = Libro("salud", "salud.xlsx", "Salud del dato",
              "Qué parte de la red entrega sell-out. Sin ese dato no hay cobertura ni excedente que calcular, así "
              "que esta hoja dice cuánto del canal se está viendo de verdad, en tiendas, en piezas y en pesos.")
    S = lambda col: f"Sucursales!${col}$2:${col}$301"
    b.kpi("sucursales", "Sucursales en la red", f"=COUNTA({S('A')})", NUM, "En el alcance de los filtros")
    b.kpi("reportan", "Entregan sell-out", f'=COUNTIF({S("F")},"Sí")', NUM, "Con dato de venta al consumidor", VERDE)
    b.kpi("pct", "Cobertura de reporte", f'=IF(COUNTA({S("A")})=0,0,COUNTIF({S("F")},"Sí")/COUNTA({S("A")}))', PORC,
          "Sucursales que reportan entre el total")
    b.kpi("sin", "Sin reporte", f'=COUNTIF({S("F")},"No")', NUM, "Tiendas que no se están viendo", ROJO)
    b.kpi("piezasSin", "Piezas sin visibilidad", f'=SUMIF({S("F")},"No",{S("G")})', NUM, "Inventario en tiendas que no reportan", ROJO)
    b.kpi("montoSin", "Inventario sin visibilidad $", f'=SUMIF({S("F")},"No",{S("I")})', MILLONES,
          "Esas piezas, al precio de venta a la cadena", ROJO)
    b.kpi("combosSin", "Combinaciones sin dato", f'=SUMIF({S("F")},"No",{S("H")})', NUM, "Tienda por modelo sin sell-out")
    b.kpi("piezasCon", "Piezas con visibilidad", f'=SUMIF({S("F")},"Sí",{S("G")})', NUM, "Inventario en tiendas que sí reportan", VERDE)
    b.kpi("montoCon", "Inventario con visibilidad $", f'=SUMIF({S("F")},"Sí",{S("I")})', MILLONES,
          "Esas piezas, al precio de venta a la cadena", VERDE)

    cd = b.hoja("Cadenas", [("Cadena", 24), ("Sucursales", 12), ("Reportan", 12), ("Sin reporte", 12),
                            ("Cobertura de reporte", 15), ("Piezas sin visibilidad", 16),
                            ("Inventario sin visibilidad $", 18), ("Piezas en canal", 14), ("Inventario $", 16)],
                {2: NUM, 3: NUM, 4: NUM, 5: PORC, 6: NUM, 7: DINERO, 8: NUM, 9: DINERO}, recorte=8)
    for r in range(2, 10):
        g = guarda(r)
        b.fx(cd, "B", r, f"={g}COUNTIF({S('B')},$A{r}))")
        b.fx(cd, "C", r, f'={g}COUNTIFS({S("B")},$A{r},{S("F")},"Sí"))')
        b.fx(cd, "D", r, f"={g}$B{r}-$C{r})")
        b.fx(cd, "E", r, f"={g}IF($B{r}=0,0,$C{r}/$B{r}))")
        b.fx(cd, "F", r, f'={g}SUMIFS({S("G")},{S("B")},$A{r},{S("F")},"No"))')
        b.fx(cd, "G", r, f'={g}SUMIFS({S("I")},{S("B")},$A{r},{S("F")},"No"))')
        b.fx(cd, "H", r, f"={g}SUMIFS({S('G')},{S('B')},$A{r}))")
        b.fx(cd, "I", r, f"={g}SUMIFS({S('I')},{S('B')},$A{r}))")

    b.hoja("Sucursales", [("Punto de venta", 32), ("Cadena", 22), ("Estado", 18), ("Ciudad", 18), ("Apertura", 20),
                          ("Reporta", 10), ("Piezas", 10), ("Combinaciones", 13), ("Inventario $", 15)],
           {7: NUM, 8: NUM, 9: DINERO}, sobrantes="quitar")

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
              "Lo que Argos encontró en el corte, ordenado por impacto, en piezas y en pesos. Cada hallazgo trae la "
              "regla que lo disparó y los números que la cumplieron: nada sale de una caja negra.")
    H = lambda col: f"Hallazgos!${col}$2:${col}$41"
    b.kpi("total", "Hallazgos", f"=COUNTA({H('C')})", NUM, "En el corte y con los filtros puestos")
    b.kpi("criticos", "Críticos", f'=COUNTIF({H("B")},"Crítica")', NUM, "Para atender esta semana", ROJO)
    b.kpi("liberable", "Capital liberable", f'=SUMIF({H("I")},"liberable",{H("H")})', MILLONES, "Dejando de resurtir donde ya sobra")
    b.kpi("recuperable", "Venta recuperable", f'=SUMIF({H("I")},"recuperable",{H("H")})', MILLONES, "Cerrando quiebres con resurtido", VERDE)
    b.kpi("riesgo", "En riesgo", f'=SUMIF({H("I")},"en riesgo",{H("H")})', MILLONES, "Si no se actúa", ROJO)
    b.kpi("valor", "Valor total", f"=SUM({H('H')})", MILLONES, "Suma del impacto de los hallazgos")
    b.kpi("piezas", "Piezas involucradas", f"=SUM({H('J')})", NUM, "Las piezas detrás de esos montos")

    hz = b.hoja("Hallazgos", [("#", 5), ("Severidad", 12), ("Hallazgo", 40), ("Área", 13), ("Qué pasa", 60),
                              ("Qué hacer", 60), ("Regla que lo disparó", 50), ("Valor $", 15), ("Tipo de valor", 13),
                              ("Piezas", 11)],
                {1: NUM, 8: DINERO, 10: NUM}, sobrantes="quitar", recorte=12)
    ar = b.hoja("Áreas", [("Área", 18), ("Hallazgos", 12), ("Valor $", 16), ("Piezas", 12)],
                {2: NUM, 3: DINERO, 4: NUM}, recorte=6)
    for r in range(2, 8):
        g = guarda(r)
        b.fx(ar, "B", r, f"={g}COUNTIF({H('D')},$A{r}))")
        b.fx(ar, "C", r, f"={g}SUMIF({H('D')},$A{r},{H('H')}))")
        b.fx(ar, "D", r, f"={g}SUMIF({H('D')},$A{r},{H('J')}))")

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
