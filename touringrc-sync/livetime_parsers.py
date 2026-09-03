"""
Parsers para los reportes exportados de LiveTime ScoringEngine.

Cada reporte .xls tiene un layout pensado para imprimir, no para leer como
datos. Estas funciones lo convierten a listas de dicts limpios, listos para
hacer upsert en Supabase.

Requiere: pandas, xlrd (para leer .xls viejos)
    pip install pandas xlrd --break-system-packages
"""
import re
import pandas as pd

# ---------------------------------------------------------------
# Utilidades de parsing de texto
# ---------------------------------------------------------------

# "Bruno Bonetta ARG [TQ]" -> nombre="Bruno Bonetta", pais="ARG", flags=["TQ"]
NOMBRE_RE = re.compile(
    r"^(?P<nombre>.+?)\s+(?P<pais>[A-Z]{3})(?P<flags>(?:\s*\[[A-Z]+\])*)\s*$"
)
FLAG_RE = re.compile(r"\[([A-Z]+)\]")


def parse_nombre_crudo(texto):
    """Separa 'Bruno Bonetta ARG [TQ]' en sus partes."""
    texto = str(texto).strip()
    m = NOMBRE_RE.match(texto)
    if not m:
        # fallback: no vino con país (no debería pasar, pero por las dudas)
        return {
            "texto_crudo": texto,
            "first_name": texto.split(" ")[0] if texto else "",
            "last_name": " ".join(texto.split(" ")[1:]) if texto else "",
            "country": None,
            "flags": [],
        }
    nombre_completo = m.group("nombre").strip()
    partes = nombre_completo.split(" ")
    first_name = partes[0]
    last_name = " ".join(partes[1:]) if len(partes) > 1 else ""
    flags = FLAG_RE.findall(m.group("flags") or "")
    return {
        "texto_crudo": texto,
        "first_name": first_name,
        "last_name": last_name,
        "country": m.group("pais"),
        "flags": flags,  # ej ['TQ']
    }


# "[3] 26/10:13.500" -> posicion_calculo=3, vueltas=26, tiempo='10:13.500'
# "0/0.000 (DNS)"     -> vueltas=0, tiempo='0.000', status='DNS'
# "7/2:59.944 (DNF)"  -> vueltas=7, tiempo='2:59.944', status='DNF'
RESULTADO_RE = re.compile(
    r"^(?:\[(?P<orden>\d+)\]\s*)?"
    r"(?P<vueltas>\d+)/(?P<tiempo>[\d:.]+)"
    r"(?:\s*\((?P<status>DNS|DNF|DQ)\))?\s*$"
)


def parse_resultado_crudo(texto):
    """Separa el texto de resultado tipo '[3] 26/10:13.500' o '0/0.000 (DNS)'."""
    if texto is None or (isinstance(texto, float) and pd.isna(texto)):
        return None
    texto = str(texto).strip()
    m = RESULTADO_RE.match(texto)
    if not m:
        return {"texto_crudo": texto, "vueltas": None, "tiempo": None, "status": None}
    return {
        "texto_crudo": texto,
        "orden_calculo": int(m.group("orden")) if m.group("orden") else None,
        "vueltas": int(m.group("vueltas")),
        "tiempo": m.group("tiempo"),
        "status": m.group("status"),
    }


def _clean(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    return str(v).strip()


# ---------------------------------------------------------------
# FinalResults.xls
# ---------------------------------------------------------------

def parse_final_results(path):
    """
    Devuelve lista de dicts:
    {clase, posicion, piloto_crudo (nombre+pais+flags), resultado, heat}
    """
    df = pd.read_excel(path, sheet_name=0, header=None, engine="xlrd")
    out = []
    clase_actual = None
    for _, row in df.iterrows():
        vals = [_clean(v) for v in row.tolist()]
        vals_no_none = [v for v in vals if v]
        if not vals_no_none:
            continue
        # Header de sección: una sola celda con el nombre de la clase
        if len(vals_no_none) == 1 and vals_no_none[0] not in (
            "Final Results",
        ) and "www." not in vals_no_none[0]:
            clase_actual = vals_no_none[0]
            continue
        # Header de columnas
        if vals_no_none[0] == "Driver Name":
            continue
        # Fila de datos: posicion, nombre, clase, resultado, heat
        # (usamos vals_no_none: el excel tiene columnas vacías de por medio
        # por el formato de impresión, así que compactamos)
        if clase_actual and re.match(r"^\d+(\.0)?$", str(vals_no_none[0])):
            posicion = int(float(vals_no_none[0]))
            piloto_crudo = vals_no_none[1]
            resultado = vals_no_none[3] if len(vals_no_none) > 3 else None
            heat = vals_no_none[4] if len(vals_no_none) > 4 else None
            out.append({
                "clase": clase_actual,
                "posicion": posicion,
                "piloto_crudo": piloto_crudo,
                "resultado_crudo": resultado,
                "heat": heat,
            })
    return out


# ---------------------------------------------------------------
# RoundResult-*.xls / RoundTopTimes-*.xls
# (mismo layout: secciones por clase+round, con posibles heats repetidos)
# ---------------------------------------------------------------

SECCION_RE = re.compile(r"^(?P<clase>.+?)\nRound:\s*(?P<ronda>.+)$")


def parse_round_result(path):
    """
    Devuelve lista de dicts con el detalle por vuelta de cada piloto en cada
    heat. Como el mismo Round puede repetirse para distintos grupos/heats de
    la misma clase, se numera automáticamente cada bloque como heat 1, 2, 3...
    """
    df = pd.read_excel(path, sheet_name=0, header=None, engine="xlrd")
    out = []
    clase_actual = None
    ronda_actual = None
    heat_num = 0
    columnas = None
    vista_multi_final = False

    for _, row in df.iterrows():
        vals = [_clean(v) for v in row.tolist()]
        vals_no_none = [v for v in vals if v]
        if not vals_no_none:
            continue

        # Header de sección tipo "Touring Eco 1:10 Stock\nRound: M"
        if len(vals_no_none) == 1:
            m = SECCION_RE.match(vals_no_none[0])
            if m:
                clase_actual = m.group("clase")
                ronda_actual = m.group("ronda")
                heat_num += 1
                vista_multi_final = False
                columnas = None
                continue

        # Header de la vista "Multi Final Results" -> la ignoramos,
        # ya sacamos el detalle de la tabla principal de arriba
        if vals_no_none[0] == "Multi Final Results":
            vista_multi_final = True
            continue
        if vista_multi_final:
            continue

        # Header de columnas de la tabla principal
        if vals_no_none[0] == "Driver Name":
            columnas = vals_no_none
            continue
        if vals_no_none[0] == "Fin":  # header de la tabla Multi Final, ignorar
            continue

        # Fila de datos: primera celda es la posición (entero).
        # vals_no_none compacta las columnas vacías del formato de impresión:
        # [pos, nombre, laps/time, fast_lap, avg_lap, top5, top10, top15, top3con]
        if columnas and re.match(r"^\d+$", str(vals_no_none[0])):
            piloto_crudo = vals_no_none[1]
            resto = vals_no_none[2:]
            laps_time = resto[0] if len(resto) > 0 else None
            fast_lap = resto[1] if len(resto) > 1 else None
            avg_lap = resto[2] if len(resto) > 2 else None
            top5 = resto[3] if len(resto) > 3 else None
            top10 = resto[4] if len(resto) > 4 else None
            top15 = resto[5] if len(resto) > 5 else None
            top3con = resto[6] if len(resto) > 6 else None
            out.append({
                "clase": clase_actual,
                "ronda": ronda_actual,
                "heat": heat_num,
                "posicion": int(vals_no_none[0]),
                "piloto_crudo": piloto_crudo,
                "laps_time_crudo": laps_time,
                "fast_lap": fast_lap,
                "avg_lap": avg_lap,
                "top5_avg": top5,
                "top10_avg": top10,
                "top15_avg": top15,
                "top3_consecutive": top3con,
            })
    return out


def parse_top_times(path):
    """
    Parsea RoundTopTimes-*.xls / 'M Top Times' — reporte ordenado por vuelta
    más rápida. El piloto en posicion=1 de cada clase es quien se lleva el
    badge de vuelta rápida en esa clase/evento.
    """
    df = pd.read_excel(path, sheet_name=0, header=None, engine="xlrd")
    out = []
    clase_actual = None
    columnas = None

    for _, row in df.iterrows():
        vals = [_clean(v) for v in row.tolist()]
        vals_no_none = [v for v in vals if v]
        if not vals_no_none:
            continue

        # Header de sección: una sola celda con el nombre de la clase
        if len(vals_no_none) == 1 and "Sorted by" not in vals_no_none[0] and "www." not in vals_no_none[0]:
            clase_actual = vals_no_none[0]
            columnas = None
            continue

        # Header de columnas
        if vals_no_none[0] == "Driver Name":
            columnas = vals_no_none
            continue

        # Fila de datos: [pos, piloto, ronda, laps/time, fast, 2ndFast, 3rdFast, top2con, top3con, avg, top5avg]
        if columnas and clase_actual and re.match(r"^\d+(\.0)?$", str(vals_no_none[0])):
            resto = vals_no_none[3:]
            out.append({
                "clase": clase_actual,
                "ronda": vals_no_none[2],
                "posicion": int(float(vals_no_none[0])),  # ranking por vuelta rápida, no posición de carrera
                "piloto_crudo": vals_no_none[1],
                "laps_time_crudo": resto[0] if len(resto) > 0 else None,
                "fast_lap": resto[1] if len(resto) > 1 else None,
                "second_fast_lap": resto[2] if len(resto) > 2 else None,
                "third_fast_lap": resto[3] if len(resto) > 3 else None,
                "top2_consecutive": resto[4] if len(resto) > 4 else None,
                "top3_consecutive": resto[5] if len(resto) > 5 else None,
                "avg_lap": resto[6] if len(resto) > 6 else None,
                "top5_avg": resto[7] if len(resto) > 7 else None,
                "vuelta_rapida": int(float(vals_no_none[0])) == 1,
            })
    return out


def parse_leaderboard(path):
    """Parsea Leaderboard-Event*.xls, que puede traer una clase por hoja."""
    libro = pd.ExcelFile(path, engine="xlrd")
    out = []
    for hoja in libro.sheet_names:
        df = pd.read_excel(path, sheet_name=hoja, header=None, engine="xlrd")
        clase_actual = None
        col_pos = col_driver = col_result = col_tie = -1
        cols_rondas = []
        for _, row in df.iterrows():
            raw = [_clean(v) for v in row.tolist()]
            vals = [v for v in raw if v]
            if not vals:
                continue
            if len(vals) == 1 and "\n" not in vals[0] and "www." not in vals[0]:
                clase_actual = vals[0]
                col_pos = col_driver = col_result = col_tie = -1
                cols_rondas = []
                continue
            if "Driver Name" in raw:
                col_pos = raw.index("Pos") if "Pos" in raw else -1
                col_driver = raw.index("Driver Name")
                col_result = raw.index("Result") if "Result" in raw else -1
                col_tie = raw.index("Tie Breaker") if "Tie Breaker" in raw else -1
                cols_rondas = [i for i, value in enumerate(raw) if value and re.match(r"^Round \d+$", value)]
                continue
            if not clase_actual or col_pos < 0 or col_pos >= len(raw):
                continue
            posicion = raw[col_pos]
            if not posicion or not re.match(r"^\d+(\.0)?$", posicion):
                continue
            out.append({
                "clase": clase_actual,
                "posicion": int(float(posicion)),
                "piloto_crudo": raw[col_driver] if col_driver < len(raw) else "",
                "resultado_crudo": raw[col_result] if col_result >= 0 and col_result < len(raw) else None,
                "tie_breaker": raw[col_tie] if col_tie >= 0 and col_tie < len(raw) else None,
                "rondas": [raw[i] if i < len(raw) else None for i in cols_rondas],
            })
    return out


# ---------------------------------------------------------------
# SeriesResultReport.xls (campeonato acumulado)
# ---------------------------------------------------------------

def parse_series_result(path):
    """
    Devuelve (nombre_torneo, lista_de_dicts) con el campeonato acumulado.
    Cada dict: clase, posicion, piloto_crudo, puntos, puntos_sin_descartes,
    ajuste_puntos, eventos_registrados, tqs, wins_1,2,3, detalle_por_fecha (dict fecha->{"pos":..,"pts":..})
    """
    df = pd.read_excel(path, sheet_name=0, header=None, engine="xlrd")
    nombre_torneo = None
    out = []
    clase_actual = None
    fechas_cols = None  # lista de (col_index, fecha_str)

    for i, row in df.iterrows():
        vals = [_clean(v) for v in row.tolist()]
        vals_no_none = [v for v in vals if v]
        if not vals_no_none:
            continue

        if nombre_torneo is None and vals_no_none[0] and "\n" in vals_no_none[0]:
            nombre_torneo = vals_no_none[0].split("\n")[0]
            continue

        # Header de clase: una sola celda, no es fila de encabezado de columnas
        if len(vals_no_none) == 1 and vals_no_none[0] not in ("Driver Name",) and "www." not in vals_no_none[0]:
            clase_actual = vals_no_none[0]
            fechas_cols = None
            continue

        # Header de columnas: contiene 'Driver Name' y fechas tipo MM/DD
        if "Driver Name" in vals:
            fechas_cols = []
            for idx, v in enumerate(vals):
                if v and re.match(r"^\d{2}/\d{2}$", v):
                    fechas_cols.append((idx, v))
            continue

        # Fila de datos: primera celda numérica = posición
        # (nota: acá SÍ usamos posiciones de columna fijas del df original,
        # no vals_no_none, porque necesitamos los índices de fechas_cols
        # detectados en el header para leer 'detalle_por_fecha' correctamente)
        if clase_actual and vals_no_none[0] and re.match(r"^\d+(\.0)?$", str(vals_no_none[0])):
            posicion = int(float(vals_no_none[0]))
            piloto_crudo = vals[4] if len(vals) > 4 else None  # col 'Driver Name'
            puntos = vals[9]
            puntos_sin_descartes = vals[11]
            ajuste = vals[12]
            eventos_reg = vals[13]
            tqs = vals[14]
            w1, w2, w3 = vals[15], vals[16], vals[17]
            detalle = {}
            if fechas_cols:
                for idx, fecha in fechas_cols:
                    v = vals[idx] if idx < len(vals) else None
                    if v:
                        detalle[fecha] = v  # ej '(2nd) 48'
            out.append({
                "clase": clase_actual,
                "posicion": posicion,
                "piloto_crudo": piloto_crudo,
                "puntos": int(float(puntos)) if puntos else None,
                "puntos_sin_descartes": int(float(puntos_sin_descartes)) if puntos_sin_descartes else None,
                "ajuste_puntos": int(float(ajuste)) if ajuste else None,
                "eventos_registrados": int(float(eventos_reg)) if eventos_reg else None,
                "tqs": int(float(tqs)) if tqs else None,
                "wins_1ro": int(float(w1)) if w1 else 0,
                "wins_2do": int(float(w2)) if w2 else 0,
                "wins_3ro": int(float(w3)) if w3 else 0,
                "detalle_por_fecha": detalle,
            })
    return nombre_torneo, out


# ---------------------------------------------------------------
# EventVerification-*.xls (roster de pilotos verificados/registrados
# en un evento, por clase -- Name, Email, Car, Tx, Verified). A
# diferencia de GenericImport.csv, este SÍ lo exporta la herramienta
# local (no es para importar). Se usa para volcar el roster ya
# cargado en Live Timing a `pilotos`, ver cargar_roster.py.
# ---------------------------------------------------------------

def parse_event_verification(path):
    """
    Devuelve lista de dicts: {clase, posicion, piloto_crudo, email,
    permanent_number, transponder_number, verificado}.

    Columnas fijas del export (0-indexed): 2=posición, 3=Name,
    6=Email, 7=Car, 8=Tx, 9=Verified (un caracter tipo checkmark si
    está verificado, vacío si no).
    """
    df = pd.read_excel(path, sheet_name=0, header=None, engine="xlrd")
    out = []
    clase_actual = None

    for _, row in df.iterrows():
        col2, col3 = row[2] if len(row) > 2 else None, row[3] if len(row) > 3 else None

        if _clean(col3) == "Name":
            continue

        # Header de sección: sin posición, con nombre de clase en col3
        if pd.isna(col2) and _clean(col3):
            clase_actual = _clean(col3)
            continue

        # Fila de datos: posición numérica + nombre
        if pd.notna(col2) and _clean(col3):
            car = row[7] if len(row) > 7 else None
            tx = row[8] if len(row) > 8 else None
            verificado = row[9] if len(row) > 9 else None
            out.append({
                "clase": clase_actual,
                "posicion": int(col2),
                "piloto_crudo": _clean(col3),
                "email": _clean(row[6]) if len(row) > 6 else None,
                "permanent_number": str(int(car)) if pd.notna(car) else None,
                "transponder_number": str(int(tx)) if pd.notna(tx) else None,
                "verificado": pd.notna(verificado),
            })
    return out


# ---------------------------------------------------------------
# GenericImport.csv (ya viene limpio, solo lo leemos)
# ---------------------------------------------------------------

def parse_generic_import(path):
    df = pd.read_csv(path, encoding="utf-8-sig")
    df = df.where(pd.notna(df), None)
    return df.to_dict(orient="records")


if __name__ == "__main__":
    import sys
    import json

    base = sys.argv[1] if len(sys.argv) > 1 else "/mnt/user-data/uploads"

    print("=== FinalResults ===")
    fr = parse_final_results(f"{base}/FinalResults.xls")
    for r in fr[:5]:
        print(r)
    print(f"Total filas: {len(fr)}\n")

    print("=== RoundResult ===")
    rr = parse_round_result(f"{base}/RoundResult-Round4.xls")
    for r in rr[:5]:
        print(r)
    print(f"Total filas: {len(rr)}\n")

    print("=== TopTimes (vuelta rápida) ===")
    tt = parse_top_times(f"{base}/RoundTopTimes-RoundM.xls")
    for r in tt:
        if r["vuelta_rapida"]:
            print(f"  Vuelta rápida en {r['clase']}: {r['piloto_crudo']} ({r['fast_lap']}s)")
    print(f"Total filas: {len(tt)}\n")

    print("=== SeriesResultReport ===")
    nombre, sr = parse_series_result(f"{base}/SeriesResultReport.xls")
    print("Torneo:", nombre)
    for r in sr[:3]:
        print(r)
    print(f"Total filas: {len(sr)}\n")

    print("=== GenericImport ===")
    gi = parse_generic_import(f"{base}/GenericImport.csv")
    print(gi[0])
    print(f"Total pilotos: {len(gi)}")
