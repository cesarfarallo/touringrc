import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "Faltan VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY. Copiá .env.example a .env.local y completá los valores del proyecto en Supabase (Settings -> API Keys -> anon/publishable)."
  );
}

// createClient tira una excepción sincrónica si supabaseUrl no es una URL
// válida (ej. undefined) -- eso rompe el render de toda la app en vez de
// dejar que el banner de error de App.jsx avise qué pasó. Si faltan las env
// vars, usamos una URL con formato válido pero inexistente: los pedidos van
// a fallar igual, pero de forma prolija (los hooks capturan el error) en vez
// de un crash total.
export const supabase = createClient(supabaseUrl || "https://env-vars-faltantes.supabase.co", supabaseAnonKey || "missing-anon-key");
