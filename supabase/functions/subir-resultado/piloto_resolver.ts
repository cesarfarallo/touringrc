// Port a TypeScript de touringrc-sync/piloto_resolver.py -- misma lógica,
// pero usando el cliente JS de Supabase (con la service_role key, corre
// server-side en la Edge Function).
import { parseNombreCrudo } from "./parsers.ts";

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export class PilotoResolver {
  private cache = new Map<string, string | null>();
  private sb: SupabaseClient;

  constructor(sb: SupabaseClient) {
    this.sb = sb;
  }

  /** Devuelve piloto_id o null si quedó encolado para revisión manual. */
  async resolver(textoCrudoOriginal: string): Promise<string | null> {
    const textoCrudo = textoCrudoOriginal.trim();
    if (this.cache.has(textoCrudo)) return this.cache.get(textoCrudo)!;

    const { data: alias } = await this.sb
      .from("piloto_alias")
      .select("piloto_id")
      .eq("texto_crudo", textoCrudo)
      .maybeSingle();
    if (alias) {
      this.cache.set(textoCrudo, alias.piloto_id);
      return alias.piloto_id;
    }

    const { firstName, lastName, country } = parseNombreCrudo(textoCrudo);
    const { data: candidatos } = await this.sb
      .from("pilotos")
      .select("id")
      .ilike("first_name", firstName)
      .ilike("last_name", lastName);

    // deno-lint-ignore no-explicit-any
    const ids: string[] = (candidatos ?? []).map((c: any) => c.id);

    if (ids.length === 1) {
      await this.crearAlias(textoCrudo, ids[0]);
      this.cache.set(textoCrudo, ids[0]);
      return ids[0];
    }

    if (ids.length === 0) {
      const { data: nuevo, error } = await this.sb
        .from("pilotos")
        .insert({ first_name: firstName, last_name: lastName, country })
        .select("id")
        .single();
      if (error) throw error;
      await this.crearAlias(textoCrudo, nuevo.id);
      this.cache.set(textoCrudo, nuevo.id);
      return nuevo.id;
    }

    // 2+ candidatos: ambiguo, no lo resolvemos solos.
    await this.sb.from("alias_pendientes").upsert(
      { texto_crudo: textoCrudo, candidatos: ids },
      { onConflict: "texto_crudo" }
    );
    this.cache.set(textoCrudo, null);
    return null;
  }

  private async crearAlias(textoCrudo: string, pilotoId: string) {
    await this.sb.from("piloto_alias").insert({
      texto_crudo: textoCrudo,
      piloto_id: pilotoId,
      resuelto_manualmente: false,
    });
  }

  async resolverOAvisar(textoCrudo: string): Promise<string | null> {
    const pilotoId = await this.resolver(textoCrudo);
    if (pilotoId === null) {
      console.warn(`Nombre ambiguo, encolado para revisión manual: ${textoCrudo}`);
    }
    return pilotoId;
  }
}
