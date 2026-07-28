import { supabase, supabaseEnabled } from "./supabase";
import { definirChaveLoja } from "./cripto";

export type Papel = "dono" | "gerente" | "tecnico" | "atendente";

export interface Perfil {
  id: string;
  loja_id: string;
  nome?: string | null;
  papel: Papel;
  ativo: boolean;
  /** Administra o sistema inteiro (pode liberar lojas novas), não só uma loja */
  super_admin?: boolean;
}

export interface Convite {
  codigo: string;
  papel: Papel;
  nome?: string | null;
  nova_loja: boolean;
  expira_em: string;
  usado_por?: string | null;
  usado_em?: string | null;
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
    .select("id, loja_id, nome, papel, ativo, super_admin")
    .eq("id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email || "",
    perfil: (perfil as Perfil) || null,
  };
}

/**
 * Busca a chave de criptografia da loja e a entrega ao módulo de cripto.
 * A política de acesso do banco só devolve a linha da própria loja, então
 * uma loja nunca alcança a chave da outra.
 */
export async function carregarChaveLoja(lojaId: string | null): Promise<void> {
  if (!supabase || !lojaId) {
    await definirChaveLoja(null);
    return;
  }
  const { data } = await supabase
    .from("lojas")
    .select("chave_cripto")
    .eq("id", lojaId)
    .maybeSingle();
  await definirChaveLoja((data as { chave_cripto?: string } | null)?.chave_cripto ?? null);
}

/** Deixa registrado quem abriu a senha de um aparelho, e quando */
export async function registrarAcessoSigilo(lojaId: string, osNumero: number): Promise<void> {
  if (!supabase) return;
  const { data } = await supabase.auth.getUser();
  if (!data?.user) return;
  await supabase.from("acessos_sigilo").insert({
    lojaId,
    usuario_id: data.user.id,
    os_numero: osNumero,
  });
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

/* ------------------------------------------------------------------ */
/* Convites — criar conta só é possível com um código válido           */
/* ------------------------------------------------------------------ */

/**
 * Onde guardamos o convite entre "criar conta" e o primeiro login.
 * Quando o Supabase exige confirmação de e-mail, a conta só existe de
 * verdade depois que a pessoa volta pelo link — o código precisa esperar.
 */
export const CONVITE_PENDENTE = "sistema-ti:convite-pendente";

/** Confere o código antes de criar a conta, para não deixar conta órfã */
export async function conferirConvite(codigo: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("convite_valido", {
    p_codigo: codigo.trim().toUpperCase(),
  });
  if (error) {
    // A função não existe: falta rodar supabase-migracao-convites.sql.
    // Sem esta distinção, o dono passaria horas achando que digitou errado.
    if (/function|does not exist|PGRST202|schema cache/i.test(error.message)) {
      throw new Error(
        "O sistema de convites ainda não foi instalado no banco. Rode o arquivo supabase-migracao-convites.sql no Supabase."
      );
    }
    return false;
  }
  return data === true;
}

/** Vincula a conta logada à loja do convite. Devolve o id da loja. */
export async function aceitarConvite(
  codigo: string,
  nome?: string,
  nomeLoja?: string
): Promise<string> {
  if (!supabase) throw new Error("Nuvem não configurada.");
  const { data, error } = await supabase.rpc("aceitar_convite", {
    p_codigo: codigo.trim().toUpperCase(),
    p_nome: nome || null,
    p_nome_loja: nomeLoja || null,
  });
  if (error) throw new Error(traduzErro(error.message));
  return String(data);
}

/** Gera um convite. novaLoja libera uma assistência nova (só super admin). */
export async function criarConvite(
  papel: Papel = "atendente",
  nome?: string,
  novaLoja = false,
  dias = 7
): Promise<string> {
  if (!supabase) throw new Error("Nuvem não configurada.");
  const { data, error } = await supabase.rpc("criar_convite", {
    p_papel: papel,
    p_nome: nome || null,
    p_nova_loja: novaLoja,
    p_dias: dias,
  });
  if (error) throw new Error(traduzErro(error.message));
  return String(data);
}

export async function listarConvites(): Promise<Convite[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("convites")
    .select("codigo, papel, nome, nova_loja, expira_em, usado_por, usado_em")
    .order("criadoEm", { ascending: false });
  return (data as Convite[]) || [];
}

export async function apagarConvite(codigo: string): Promise<void> {
  await supabase?.from("convites").delete().eq("codigo", codigo);
}

/** Link pronto para mandar no WhatsApp, já com o código preenchido */
export const linkConvite = (codigo: string): string =>
  `${window.location.origin}${window.location.pathname}#/entrar?convite=${codigo}`;

export async function sair(): Promise<void> {
  await supabase?.auth.signOut();
}

/**
 * Troca a senha e derruba as sessões dos outros aparelhos.
 *
 * Quem troca a senha quase sempre tem um motivo: desconfiou de alguém,
 * perdeu o celular, demitiu um funcionário. Se as outras sessões
 * continuassem abertas, a troca não protegeria de nada — quem já estava
 * dentro continuaria dentro.
 *
 * A senha atual é conferida antes: sem isso, um aparelho esquecido logado
 * no balcão viraria porta para trocar a senha do dono.
 */
export async function trocarSenha(
  senhaAtual: string,
  novaSenha: string
): Promise<void> {
  if (!supabase) throw new Error("Nuvem não configurada.");

  const { data: atual } = await supabase.auth.getUser();
  const email = atual?.user?.email;
  if (!email) throw new Error("Sessão expirada. Entre novamente.");

  // Confere a senha atual reautenticando
  const { error: erroLogin } = await supabase.auth.signInWithPassword({
    email,
    password: senhaAtual,
  });
  if (erroLogin) throw new Error("A senha atual está incorreta.");

  const { error } = await supabase.auth.updateUser({ password: novaSenha });
  if (error) throw new Error(traduzErro(error.message));

  // Derruba os outros aparelhos, mantendo este conectado
  await supabase.auth.signOut({ scope: "others" });
}

/** Encerra a sessão em TODOS os aparelhos, inclusive este */
export async function sairDeTodosOsAparelhos(): Promise<void> {
  if (!supabase) throw new Error("Nuvem não configurada.");
  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (error) throw new Error(traduzErro(error.message));
}

/**
 * Gera o link de redefinição de senha sem passar por e-mail.
 *
 * Serve para quando o SMTP não está configurado ou o e-mail não chega: o dono
 * do sistema gera o link e manda pelo WhatsApp. Quem valida se você pode
 * fazer isso é o servidor, não esta função — aqui só mandamos o token da
 * sessão junto.
 */
export async function gerarLinkDeSenha(email: string): Promise<string> {
  if (!supabase) throw new Error("Nuvem não configurada.");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Entre de novo.");

  const r = await fetch("/api/recuperar", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ email, redirectTo: window.location.origin }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body?.erro || `Falhou (${r.status}).`);
  return body.link as string;
}

export async function recuperarSenha(email: string): Promise<void> {
  if (!supabase) throw new Error("Nuvem não configurada.");
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: window.location.origin,
  });
  if (error) throw new Error(traduzErro(error.message));
}

/**
 * Mensagens do Supabase em português claro.
 *
 * Cuidado com o excesso de tradução: "E-mail ou senha incorretos" para
 * QUALQUER falha esconde os casos que a pessoa não tem como adivinhar —
 * chave da nuvem trocada, e-mail sem confirmar, projeto pausado. Cada um
 * desses tem uma saída diferente, e o texto precisa dizer qual é.
 */
function traduzErro(msg: string): string {
  const m = (msg || "").toLowerCase();

  // Chave anon inválida/rotacionada: nada a ver com a senha do usuário
  if (m.includes("invalid api key") || m.includes("no api key") || m.includes("jwt")) {
    return (
      "A chave de acesso à nuvem não é mais válida. Se você rotacionou as " +
      "chaves no Supabase, atualize VITE_SUPABASE_ANON_KEY no Vercel e " +
      "publique de novo."
    );
  }
  if (m.includes("email not confirmed") || m.includes("not confirmed")) {
    return "CONFIRMAR_EMAIL";
  }
  if (m.includes("invalid login") || m.includes("invalid credentials")) {
    return (
      "E-mail ou senha incorretos. Se a conta é nova, confirme antes o " +
      "e-mail que enviamos — sem isso o login é recusado."
    );
  }
  if (m.includes("already registered") || m.includes("already been registered"))
    return "Este e-mail já tem conta. Faça login.";
  if (m.includes("password") && m.includes("6"))
    return "A senha precisa ter pelo menos 6 caracteres.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Muitas tentativas. Aguarde um minuto e tente de novo.";
  if (m.includes("failed to fetch") || m.includes("networkerror"))
    return "Sem conexão com a nuvem. Verifique a internet e tente de novo.";
  return msg;
}

/** Reenvia o e-mail de confirmação de cadastro */
export async function reenviarConfirmacao(email: string): Promise<void> {
  if (!supabase) throw new Error("Nuvem não configurada.");
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: email.trim(),
  });
  if (error) throw new Error(traduzErro(error.message));
}

/**
 * Diagnóstico da conexão, para a tela de login poder dizer o que está
 * errado em vez de deixar a pessoa adivinhando de outro computador.
 */
export async function diagnosticar(): Promise<{
  ok: boolean;
  detalhe: string;
}> {
  if (!supabaseEnabled || !supabase) {
    return {
      ok: false,
      detalhe:
        "Este aparelho não está conectado à nuvem. Faltam as variáveis " +
        "VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY na publicação.",
    };
  }
  try {
    const { error } = await supabase.auth.getSession();
    if (error) return { ok: false, detalhe: traduzErro(error.message) };
    return { ok: true, detalhe: "Conectado à nuvem." };
  } catch (e) {
    return { ok: false, detalhe: traduzErro(e instanceof Error ? e.message : String(e)) };
  }
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
