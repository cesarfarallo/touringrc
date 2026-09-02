"""
Carga masiva del roster de pilotos ya cargado en Live Timing hacia
`pilotos` en Supabase, a partir de un export EventVerification-*.xls
(el que muestra quiénes están registrados/verificados en un evento, con
Name/Email/Car/Tx por clase). No toca resultados ni eventos, solo
pilotos -- pensado para correr una vez, antes de la Fase C, así el
trigger de login (touringrc-sync/sql/migrations/0002_admin_y_vinculo_por_nombre.sql)
tiene contra qué matchear por nombre.

Uso:
    python cargar_roster.py --archivo EventVerification-Event30.xls

Variables de entorno necesarias (mismas que sync_evento.py):
    SUPABASE_URL
    SUPABASE_SERVICE_KEY
"""
import argparse
import os
import sys

from supabase import create_client

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from livetime_parsers import parse_event_verification


def get_client():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        sys.exit("Faltan las variables de entorno SUPABASE_URL y/o SUPABASE_SERVICE_KEY")
    return create_client(url, key)


def separar_nombre(texto):
    """'Pablo Franco Yabra' -> ('Pablo Franco', 'Yabra'). Con nombres
    compuestos es una heurística, no siempre va a acertar el apellido
    -- si hace falta corregirlo, se edita el piloto a mano después."""
    partes = texto.strip().split()
    if len(partes) == 1:
        return partes[0], ""
    return " ".join(partes[:-1]), partes[-1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--archivo", required=True, help="Ruta al EventVerification-*.xls")
    args = ap.parse_args()

    sb = get_client()
    filas = parse_event_verification(args.archivo)
    if not filas:
        sys.exit("No se encontraron pilotos en el archivo.")

    nuevos, actualizados, omitidos = 0, 0, 0

    for f in filas:
        first, last = separar_nombre(f["piloto_crudo"])
        if not first or not last:
            print(f"  (omitido, nombre incompleto: {f['piloto_crudo']!r})")
            omitidos += 1
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
        }
        if f["permanent_number"]:
            campos["permanent_number"] = f["permanent_number"]
        if f["transponder_number"]:
            campos["transponder_number"] = f["transponder_number"]
        if f["email"]:
            campos["email"] = f["email"]

        if existente.data:
            sb.table("pilotos").update(campos).eq("id", existente.data[0]["id"]).execute()
            actualizados += 1
            print(f"  actualizado: {first} {last} ({f['clase']})")
        else:
            sb.table("pilotos").insert(campos).execute()
            nuevos += 1
            print(f"  nuevo: {first} {last} ({f['clase']})")

    print(f"\nListo: {nuevos} pilotos nuevos, {actualizados} actualizados, {omitidos} omitidos ({len(filas)} filas leídas).")


if __name__ == "__main__":
    main()
