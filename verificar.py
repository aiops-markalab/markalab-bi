# -*- coding: utf-8 -*-
"""
Verifica los libros que bajan de la plataforma.

Cada libro trae fórmulas, y junto a cada fórmula el resultado que calculó la
plataforma. La promesa es que los dos son el mismo número. Esto lo comprueba:

  1. Lee de cada celda con fórmula el resultado que mandó la plataforma.
  2. Hace una copia del libro SIN esos resultados, para que no haya de dónde
     copiarlos, y la manda a recalcular.
  3. Compara celda por celda.

Si una fórmula de la plantilla y una cuenta de la plataforma dejan de decir lo
mismo, aquí sale con nombre y apellido.

    python3 verificar.py /carpeta/con/los/xlsx
"""

import glob
import os
import re
import shutil
import subprocess
import sys
import zipfile

import openpyxl

TOL_REL = 0.005   # medio punto porcentual
TOL_ABS = 1.0     # o un peso, lo que sea mayor


def sin_resultados(origen, destino):
    with zipfile.ZipFile(origen) as z:
        piezas = {n: z.read(n) for n in z.namelist()}
    for n in list(piezas):
        if n.startswith("xl/worksheets/sheet"):
            xml = piezas[n].decode("utf-8")
            xml = re.sub(r"(<c\b[^>]*>)(<f\b[^>]*>[\s\S]*?</f>)<v>[\s\S]*?</v>(</c>)", r"\1\2\3", xml)
            xml = re.sub(r'(<c\b[^>]*?) t="str"(>)(<f)', r"\1\2\3", xml)
            piezas[n] = xml.encode("utf-8")
    with zipfile.ZipFile(destino, "w", zipfile.ZIP_DEFLATED) as z:
        for n, b in piezas.items():
            z.writestr(n, b)


def recalcular(ruta, carpeta):
    subprocess.run(["soffice", "--headless", "--convert-to", "xlsx", "--outdir", carpeta, ruta],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=300)
    return os.path.join(carpeta, os.path.basename(ruta))


def igual(a, b):
    if a is None or a == "":
        return b is None or b == "" or b == 0
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return abs(a - b) <= max(TOL_ABS, TOL_REL * max(abs(a), abs(b)))
    return str(a).strip() == str(b).strip()


def revisar(ruta, trabajo):
    nombre = os.path.basename(ruta)
    formulas = openpyxl.load_workbook(ruta)
    guardado = openpyxl.load_workbook(ruta, data_only=True)

    limpio = os.path.join(trabajo, "limpio", nombre)
    os.makedirs(os.path.dirname(limpio), exist_ok=True)
    sin_resultados(ruta, limpio)
    recalc = openpyxl.load_workbook(recalcular(limpio, os.path.join(trabajo, "recalc")), data_only=True)

    total = sin_dato = errores = 0
    fallas = []
    for ws in formulas.worksheets:
        for fila in ws.iter_rows():
            for c in fila:
                if not (isinstance(c.value, str) and c.value.startswith("=")):
                    continue
                total += 1
                a = guardado[ws.title][c.coordinate].value
                b = recalc[ws.title][c.coordinate].value
                if isinstance(b, str) and b.startswith("#"):
                    errores += 1
                    fallas.append((ws.title, c.coordinate, a, b))
                    continue
                if a is None and b not in (None, "", 0):
                    sin_dato += 1
                    continue
                if not igual(a, b):
                    fallas.append((ws.title, c.coordinate, a, b))

    graficas = len([n for n in zipfile.ZipFile(ruta).namelist() if n.startswith("xl/charts/chart")])
    estado = "BIEN" if not fallas else "REVISAR"
    print(f"{estado:8} {nombre:16} hojas {len(formulas.sheetnames):2} · gráficas {graficas} · fórmulas {total:6} · "
          f"sin resultado guardado {sin_dato:5} · errores {errores} · no cuadran {len(fallas)}")
    for hoja, celda, a, b in fallas[:10]:
        print(f"           {hoja}!{celda}: plataforma={a!r}  fórmula={b!r}")
    return not fallas


if __name__ == "__main__":
    carpeta = sys.argv[1]
    trabajo = os.path.join(carpeta, "_verificacion")
    shutil.rmtree(trabajo, ignore_errors=True)
    todo = True
    for ruta in sorted(glob.glob(os.path.join(carpeta, "*.xlsx"))):
        todo = revisar(ruta, trabajo) and todo
    print("\nTodo cuadra." if todo else "\nHay diferencias que revisar.")
