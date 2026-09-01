"""
Sync de una fecha: LiveTime (exports) -> Supabase

Uso:
    python sync_evento.py --evento-id <uuid-del-evento-en-supabase> --carpeta ./exports/fecha7

La carpeta debe contener los archivos exportados de LiveTime para esa
fecha, con estos nombres exactos (los que ya vimos):
    GenericImport.csv
    FinalResults.xls
    RoundResult-*.xls        (puede haber varios, uno por round)
    RoundTopTimes-*.xls      (uno por round, o el que uses para vuelta rápida)
    SeriesResultReport.xls   (campeonato acumulado — opcional, se sincroniza
                              solo si pasás también --campeonato-id)

Para sincronizar el campeonato acumulado (solo hace falta hacerlo con el
SeriesResultReport.xls más reciente que tengas, no en cada fecha):
    python sync_evento.py --evento-id <uuid> --carpeta ./exports/fecha7 --campeonato-id <uuid-del-torneo>

Variables de entorno necesarias:
    SUPABASE_URL
    SUPABASE_SERVICE_KEY   (la service_role key, NUNCA la anon key acá,
                             porque este script escribe en la base)
"""
import argparse
import glob
import os
import re
import sys

from supabase import create_client

try:
    from dotenv import load_dotenv
    load_dotenv()  # busca un archivo .env en la carpeta actual y carga SUPABASE_URL / SUPABASE_SERVICE_KEY
except ImportError:
    pass  # si no está python-dotenv instalado, las variables se pueden exportar a mano igual

from livetime_parsers import (
    parse_generic_import,
    parse_final_results,
    parse_round_result,
    parse_top_times,
    parse_series_result,
)
from piloto_resolver import PilotoResolver


def get_client():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        sys.exit("Faltan las variables de entorno SUPABASE_URL y/o SUPABASE_SERVICE_KEY")
    return create_client(url, key)


def get_or_create_clase(sb, nombre):
    r = sb.table("clases").select("id").eq("nombre", nombre).execute()
    if r.data:
        return r.data[0]["id"]
    nuevo = sb.table("clases").insert({"nombre": nombre}).execute()
    return nuevo.data[0]["id"]


def marcar_archivo(sb, evento_id, tipo, subido=True):
    """Registra en el evento qué tipo de archivo ya se cargó (para el
    checklist del panel admin). Asume una columna jsonb 'archivos' en
    'eventos' con la forma {"pilotos": true, "resultadosFinales": true, ...}
    — si preferís una tabla evento_archivos aparte, este es el único
    lugar del script que hay que tocar."""
    ev = sb.table("eventos").select("archivos").eq("id", evento_id).execute()
    archivos = (ev.data[0].get("archivos") or {}) if ev.data else {}
    archivos[tipo] = subido
    sb.table("eventos").update({"archivos": archivos}).eq("id", evento_id).execute()


def sync_pilotos(sb, carpeta, evento_id):
    path = os.path.join(carpeta, "GenericImport.csv")
    if not os.path.exists(path):
        print("  (sin GenericImport.csv, se omite)")
        return
    pilotos = parse_generic_import(path)
    for p in pilotos:
        first, last = p.get("FirstName"), p.get("LastName")
        if not first or not last:
            continue
        existente = (
            sb.table("pilotos")
            .select("id")
            .ilike("first_name", first)
            .ilike("last_name", last)
            .execute()
        )
        campos = {
            "first_name": first,
            "last_name": last,
            "phonetic_name": p.get("PhoneticName"),
            "country": p.get("Country"),
            "permanent_number": str(p.get("PermanentNumber")) if p.get("PermanentNumber") else None,
            "transponder_number": str(p.get("TransponderNumber")) if p.get("TransponderNumber") else None,
            "chassis_manufacturer": p.get("ChassisManufacturer"),
        }
        if existente.data:
            sb.table("pilotos").update(campos).eq("id", existente.data[0]["id"]).execute()
        else:
            sb.table("pilotos").insert(campos).execute()
    print(f"  {len(pilotos)} pilotos sincronizados")
    marcar_archivo(sb, evento_id, "pilotos")


def sync_final_results(sb, carpeta, evento_id, resolver):
    path = os.path.join(carpeta, "FinalResults.xls")
    if not os.path.exists(path):
        print("  (sin FinalResults.xls, se omite)")
        return
    filas = parse_final_results(path)
    for f in filas:
        piloto_id = resolver.resolver_o_avisar(f["piloto_crudo"])
        if not piloto_id:
            continue
        clase_id = get_or_create_clase(sb, f["clase"])
        partes = parse_nombre_crudo_flags(f["piloto_crudo"])
        sb.table("resultados_finales").upsert(
            {
                "evento_id": evento_id,
                "clase_id": clase_id,
                "piloto_id": piloto_id,
                "posicion": f["posicion"],
                "resultado": f["resultado_crudo"],
                "heat": f["heat"],
                "tq": "TQ" in partes["flags"],
            },
            on_conflict="evento_id,clase_id,piloto_id",
        ).execute()
    print(f"  {len(filas)} resultados finales sincronizados")
    marcar_archivo(sb, evento_id, "resultadosFinales")


def sync_round_results(sb, carpeta, evento_id, resolver):
    archivos = glob.glob(os.path.join(carpeta, "RoundResult-*.xls"))
    if not archivos:
        print("  (sin RoundResult-*.xls, se omite)")
        return
    total = 0
    for path in archivos:
        filas = parse_round_result(path)
        for f in filas:
            piloto_id = resolver.resolver_o_avisar(f["piloto_crudo"])
            if not piloto_id:
                continue
            clase_id = get_or_create_clase(sb, f["clase"])
            r = parse_resultado_crudo_seguro(f["laps_time_crudo"])
            sb.table("resultados_ronda").upsert(
                {
                    "evento_id": evento_id,
                    "clase_id": clase_id,
                    "ronda": f"{f['ronda']}-heat{f['heat']}",
                    "piloto_id": piloto_id,
                    "posicion": f["posicion"],
                    "vueltas": r["vueltas"] if r else None,
                    "fastest_lap": to_float(f.get("fast_lap")),
                    "avg_lap": to_float(f.get("avg_lap")),
                    "top5_avg": to_float(f.get("top5_avg")),
                    "top10_avg": to_float(f.get("top10_avg")),
                    "top15_avg": to_float(f.get("top15_avg")),
                    "top3_consecutive": to_float(f.get("top3_consecutive")),
                    "status": r["status"] if r else None,
                },
                on_conflict="evento_id,clase_id,ronda,piloto_id",
            ).execute()
            total += 1
    print(f"  {total} filas de detalle de ronda sincronizadas ({len(archivos)} archivos)")
    marcar_archivo(sb, evento_id, "detalleRondas")


def sync_top_times(sb, carpeta, evento_id, resolver):
    archivos = glob.glob(os.path.join(carpeta, "RoundTopTimes-*.xls")) + glob.glob(
        os.path.join(carpeta, "*Top Times*.xls")
    )
    if not archivos:
        print("  (sin archivo de Top Times, se omite)")
        return
    for path in archivos:
        filas = parse_top_times(path)
        for f in filas:
            if not f["vuelta_rapida"]:
                continue
            piloto_id = resolver.resolver_o_avisar(f["piloto_crudo"])
            if not piloto_id:
                continue
            clase_id = get_or_create_clase(sb, f["clase"])
            # marca vuelta_rapida=true en el resultado final ya cargado de ese piloto/clase/evento
            sb.table("resultados_finales").update({"vuelta_rapida": True}).eq(
                "evento_id", evento_id
            ).eq("clase_id", clase_id).eq("piloto_id", piloto_id).execute()
    print(f"  Vuelta rápida marcada ({len(archivos)} archivos)")
    marcar_archivo(sb, evento_id, "vueltaRapida")


def sync_campeonato(sb, carpeta, campeonato_id, resolver):
    path = os.path.join(carpeta, "SeriesResultReport.xls")
    if not os.path.exists(path):
        print("  (sin SeriesResultReport.xls en esa carpeta, se omite)")
        return
    nombre_torneo, filas = parse_series_result(path)
    if not filas:
        print("  Sin filas en el reporte de campeonato")
        return
    for f in filas:
        piloto_id = resolver.resolver_o_avisar(f["piloto_crudo"])
        if not piloto_id:
            continue
        clase_id = get_or_create_clase(sb, f["clase"])
        sb.table("campeonato_puntos").upsert(
            {
                "campeonato_id": campeonato_id,
                "clase_id": clase_id,
                "piloto_id": piloto_id,
                "posicion": f["posicion"],
                "puntos": f["puntos"],
                "puntos_sin_descartes": f["puntos_sin_descartes"],
                "ajuste_puntos": f["ajuste_puntos"],
                "eventos_registrados": f["eventos_registrados"],
                "tqs": f["tqs"],
                "wins_1ro": f["wins_1ro"],
                "wins_2do": f["wins_2do"],
                "wins_3ro": f["wins_3ro"],
                "detalle_por_fecha": f["detalle_por_fecha"],
            },
            on_conflict="campeonato_id,clase_id,piloto_id",
        ).execute()
    print(f"  {len(filas)} filas de campeonato sincronizadas ({nombre_torneo})")


# ---------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------

def to_float(v):
    if v is None:
        return None
    try:
        if ":" in str(v):  # "1:05.130" -> segundos
            m, s = str(v).split(":")
            return float(m) * 60 + float(s)
        return float(v)
    except (ValueError, TypeError):
        return None


def parse_resultado_crudo_seguro(texto):
    from livetime_parsers import parse_resultado_crudo

    try:
        return parse_resultado_crudo(texto)
    except Exception:
        return None


def parse_nombre_crudo_flags(texto):
    from livetime_parsers import parse_nombre_crudo

    return parse_nombre_crudo(texto)


# ---------------------------------------------------------------
# Main
# ---------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--evento-id", required=True, help="UUID del evento en la tabla 'eventos' de Supabase")
    ap.add_argument("--carpeta", required=True, help="Carpeta con los archivos exportados de esa fecha")
    ap.add_argument(
        "--campeonato-id",
        help="UUID del campeonato. Si se pasa, además sincroniza campeonato_puntos leyendo "
        "SeriesResultReport.xls DESDE LA MISMA --carpeta (no hace falta indicar el archivo aparte).",
    )
    args = ap.parse_args()

    sb = get_client()
    resolver = PilotoResolver(sb)

    print(f"Sincronizando evento {args.evento_id} desde {args.carpeta}")
    print("1. Pilotos...")
    sync_pilotos(sb, args.carpeta, args.evento_id)
    print("2. Resultados finales...")
    sync_final_results(sb, args.carpeta, args.evento_id, resolver)
    print("3. Detalle de rondas...")
    sync_round_results(sb, args.carpeta, args.evento_id, resolver)
    print("4. Vuelta rápida...")
    sync_top_times(sb, args.carpeta, args.evento_id, resolver)

    if args.campeonato_id:
        print("5. Campeonato...")
        sync_campeonato(sb, args.carpeta, args.campeonato_id, resolver)

    print("Listo.")


if __name__ == "__main__":
    main()
