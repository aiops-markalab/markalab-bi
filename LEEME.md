# Las plantillas de Excel

Los libros que baja la plataforma no se generan desde cero: se rellenan
plantillas que ya traen sus gráficas, sus fórmulas y su formato. Estos tres
archivos son los que construyen y revisan esas plantillas.

    marco.py        las piezas comunes: tablero, indicadores, supuestos, gráficas
    construir.py    un libro por pantalla; escribe public/plantillas/ y lib/plantillas.json
    verificar.py    recalcula los libros descargados y los compara contra la plataforma

## Cambiar un libro

    pip install openpyxl
    python3 herramientas/excel/construir.py            # todos
    python3 herramientas/excel/construir.py mapa       # uno

Si se agrega una columna a la hoja Datos, se agrega AL FINAL y en los dos
lados: `COLUMNAS_DATOS` en marco.py y `COLUMNAS_EXCEL` en lib/excel.ts.

## Comprobar que las fórmulas dicen lo mismo que la plataforma

Baja los libros desde la plataforma a una carpeta y corre:

    python3 herramientas/excel/verificar.py /carpeta/con/los/xlsx

Necesita LibreOffice instalado (`soffice`), que es quien recalcula. Tiene que
terminar en "Todo cuadra".
