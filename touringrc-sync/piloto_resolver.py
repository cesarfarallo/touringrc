"""
Resolver de pilotos.

Dado un texto crudo tal cual aparece en un reporte de LiveTime
("Bruno Bonetta ARG", "Bruno Bonetta ARG [TQ]", etc.), devuelve el
piloto_id correspondiente en Supabase, creando el piloto o encolando
para revisión manual según corresponda. Ver diseno-plataforma-touringrc.md
sección 5 para la lógica completa.
"""
from livetime_parsers import parse_nombre_crudo


class PilotoResolver:
    def __init__(self, supabase_client):
        self.sb = supabase_client
        # cache en memoria de alias ya resueltos en esta corrida, para no
        # pegarle a la base por cada fila si el mismo nombre se repite
        # muchas veces dentro del mismo sync (normal: aparece en varios
        # reportes del mismo evento)
        self._cache = {}

    def resolver(self, texto_crudo):
        """
        Devuelve piloto_id (str) o None si quedó encolado para revisión
        manual (nombre ambiguo, dos o más candidatos).
        """
        texto_crudo = texto_crudo.strip()
        if texto_crudo in self._cache:
            return self._cache[texto_crudo]

        # 1. Buscar alias ya resuelto en la base
        r = self.sb.table("piloto_alias").select("piloto_id").eq("texto_crudo", texto_crudo).execute()
        if r.data:
            piloto_id = r.data[0]["piloto_id"]
            self._cache[texto_crudo] = piloto_id
            return piloto_id

        # 2. No hay alias todavía: parsear y buscar candidatos por nombre
        partes = parse_nombre_crudo(texto_crudo)
        r = (
            self.sb.table("pilotos")
            .select("id")
            .ilike("first_name", partes["first_name"])
            .ilike("last_name", partes["last_name"])
            .execute()
        )
        candidatos = [row["id"] for row in r.data]

        if len(candidatos) == 1:
            piloto_id = candidatos[0]
            self._crear_alias(texto_crudo, piloto_id, resuelto_manualmente=False)
            self._cache[texto_crudo] = piloto_id
            return piloto_id

        if len(candidatos) == 0:
            # piloto nuevo, no vino de un GenericImport todavía
            nuevo = (
                self.sb.table("pilotos")
                .insert(
                    {
                        "first_name": partes["first_name"],
                        "last_name": partes["last_name"],
                        "country": partes["country"],
                    }
                )
                .execute()
            )
            piloto_id = nuevo.data[0]["id"]
            self._crear_alias(texto_crudo, piloto_id, resuelto_manualmente=False)
            self._cache[texto_crudo] = piloto_id
            return piloto_id

        # 2+ candidatos: nombre ambiguo, no lo resolvemos solos
        self.sb.table("alias_pendientes").upsert(
            {"texto_crudo": texto_crudo, "candidatos": candidatos}
        ).execute()
        return None

    def _crear_alias(self, texto_crudo, piloto_id, resuelto_manualmente):
        self.sb.table("piloto_alias").insert(
            {
                "texto_crudo": texto_crudo,
                "piloto_id": piloto_id,
                "resuelto_manualmente": resuelto_manualmente,
            }
        ).execute()

    def resolver_o_avisar(self, texto_crudo):
        """Variante que imprime un aviso legible cuando algo queda pendiente."""
        piloto_id = self.resolver(texto_crudo)
        if piloto_id is None:
            print(f"  ⚠ Nombre ambiguo, encolado para revisión manual: {texto_crudo!r}")
        return piloto_id
