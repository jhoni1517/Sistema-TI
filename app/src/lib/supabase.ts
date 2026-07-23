import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase (nuvem).
 * As credenciais podem vir de:
 *  1. Variáveis de ambiente (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) — recomendado em produção
 *  2. Configuração salva pelo próprio usuário na tela de Configurações (localStorage)
 *
 * Enquanto não houver credenciais, o sistema opera 100% local (offline).
 */

const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

function readLocalCreds(): { url?: string; key?: string } {
  try {
    const raw = localStorage.getItem("sistema-ti:config");
    if (!raw) return {};
    const cfg = JSON.parse(raw);
    return { url: cfg.supabaseUrl, key: cfg.supabaseKey };
  } catch {
    return {};
  }
}

const local = readLocalCreds();
const URL = envUrl || local.url;
const KEY = envKey || local.key;

export const supabaseEnabled = Boolean(URL && KEY);

export const supabase: SupabaseClient | null = supabaseEnabled
  ? createClient(URL as string, KEY as string)
  : null;
