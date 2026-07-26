import { supabase, supabaseEnabled } from "./supabase";

export type Papel = "dono" | "gerente" | "tecnico" | "atendente";

export interface Perfil {
  id: string;
  loja_id: string;
  nome?: string | null;
  papel: Papel;
  ativo: boolean;
}

export interface Sessao {
  userId: string;
  email: string;
  perfil: Perfil | null;
}

/**
 * O que cada papel pode fazer.
 * A tela usa isto para esconder botões; o banco aplica as regras de verdade
 * pelas políticas de acesso (RLS) — a interface é só conveniência.
 */
export const PERMISSOES: Record<Papel, string[]> = {
  dono: ["*"],
  gerente: [
    "os", "clientes", "estoque", "caixa", "fiado", "relatorios", "config",
  ],
  tecnico: ["os", "clientes", "estoque"],
  atendente: ["os", "clientes", "caixa", "fiado"],
};

export const pode = (papel: Papel | undefined, recurso: string): boolean => {
  if (!papel) return false;
  const lista = PERMISSOES[papel] || [];
  return lista.includes("*") || lista.includes(recurso);
};

export const NOME_PAPEL: Record<Papel, string> = {
  dono: "Dono",
  gerente: "Gerente",
  tecnico: "Técnico",
  atendente: "Atendente",
};

/** Sessão atual (usuário logado + perfil/loja) */
export async function carregarSessao(): Promise<Sessao | null> {
  if (!supabaseEnabled || !supabase) return null;
  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user) return null;

  const { data: perfil } = await supabase
    .from("perfis")
    .select("id, loja_id, nome, papel, ativo")
    .eq("id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email || "",
    perfil: (perfil as Perfil) || null,
  };
}

export async function entrar(email: string, senha: string): Promise<void> {
  if (!supabase) throw new Error("Nuvem não configurada.");
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password: senha,
  });
  if (error) throw new Error(traduzErro(error.message));
}

export async function criarConta(
  email: string,
  senha: string
): Promise<{ precisaConfirmar: boolean }> {
  if (!supabase) throw new Error("Nuvem não configurada.");
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password: senha,
  });
  if (error) throw new Error(traduzErro(error.message));
  return { precisaConfirmar: !data.session };
}

export async function sair(): Promise<void> {
  await supabase?.auth.signOut();
}

export async function recuperarSenha(email: string): Promise<void> {
  if (!supabase) throw new Error("Nuvem não configurada.");
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: window.location.origin,
  });
  if (error) throw new Error(traduzErro(error.message));
}

/** Mensagens do Supabase em português claro */
function traduzErro(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed"))
    return "Confirme seu e-mail antes de entrar (veja a caixa de entrada).";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "Este e-mail já tem conta. Faça login.";
  if (m.includes("password") && m.includes("6"))
    return "A senha precisa ter pelo menos 6 caracteres.";
  if (m.includes("rate limit")) return "Muitas tentativas. Aguarde um minuto.";
  return msg;
}

/** Força mínima da senha, para orientar o usuário na criação da conta */
export function forcaSenha(s: string): { nivel: 0 | 1 | 2 | 3; texto: string } {
  if (s.length < 6) return { nivel: 0, texto: "Muito curta (mínimo 6)" };
  let pontos = 0;
  if (s.length >= 10) pontos++;
  if (/[a-z]/.test(s) && /[A-Z]/.test(s)) pontos++;
  if (/\d/.test(s)) pontos++;
  if (/[^A-Za-z0-9]/.test(s)) pontos++;
  if (pontos <= 1) return { nivel: 1, texto: "Fraca" };
  if (pontos <= 2) return { nivel: 2, texto: "Média" };
  return { nivel: 3, texto: "Forte" };
}
