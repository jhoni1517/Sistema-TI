import { supabase } from "./supabase";
import { negrito } from "./format";

/**
 * Assinatura das lojas.
 *
 * A regra de verdade vive no banco (funções situacao_loja e
 * loja_pode_gravar, usadas pelas políticas de escrita). O que existe aqui é
 * só para a tela avisar antes de o usuário esbarrar na trava — nunca como
 * defesa, porque tudo que roda no navegador pode ser contornado.
 */

export type Situacao = "ativa" | "tolerancia" | "leitura" | "bloqueada";

export interface Loja {
  id: string;
  nome: string;
  venceEm?: string | null;
  valor_mensal?: number | null;
  bloqueada?: boolean | null;
  observacoes?: string | null;
  whatsapp?: string | null;
  /** Isenta de mensalidade (a loja de quem administra o sistema) */
  isento?: boolean | null;
  /**
   * Ramo CONTRATADO: é o que a loja pagou e o que ela consegue usar.
   * Só o administrador do sistema altera — um gatilho no banco recusa a
   * troca vinda da própria loja.
   */
  ramo?: string | null;
  ultimoPagamento?: string | null;
  criadoEm?: string | null;
  /**
   * Até quando o prazo desta loja é CORTESIA.
   *
   * `venceEm` sozinho não separa teste de assinatura paga — os dois são uma
   * data no futuro. Sem essa separação o robô manda "sua mensalidade venceu"
   * para quem nunca contratou nada, e o recado que deveria virar venda chega
   * como carta de caloteiro.
   *
   * Ver `emTeste`: a conta é `venceEm <= testeAte`, e pagar desfaz isso
   * sozinho porque `registrar_pagamento` empurra `venceEm` para além.
   */
  testeAte?: string | null;
}

export interface SistemaConfig {
  chave_pix?: string | null;
  titular_pix?: string | null;
  whatsapp_suporte?: string | null;
  valor_padrao?: number | null;
  dias_teste?: number | null;
  dias_tolerancia?: number | null;
  mensagem_vencimento?: string | null;
}

export const SITUACAO_META: Record<Situacao, { label: string; color: string }> = {
  ativa: { label: "Em dia", color: "bg-emerald-100 text-emerald-700" },
  tolerancia: { label: "Vencida (tolerância)", color: "bg-amber-100 text-amber-700" },
  leitura: { label: "Somente leitura", color: "bg-red-100 text-red-700" },
  bloqueada: { label: "Bloqueada", color: "bg-slate-200 text-slate-700" },
};

/** Dias que faltam para vencer (negativo = já venceu) */
export const diasParaVencer = (venceEm?: string | null): number | null => {
  if (!venceEm) return null;
  const ms = new Date(venceEm).getTime() - Date.now();
  return Math.ceil(ms / 86400000);
};

/**
 * Calcula a situação a partir da data — mesma regra do banco.
 * Usada para exibir a lista de lojas no painel sem uma consulta por linha.
 */
export function situacaoDe(loja: Loja, diasTolerancia = 5): Situacao {
  if (loja.bloqueada) return "bloqueada";
  // Loja isenta (a sua) nunca vence — não faz sentido cobrar de si mesmo
  if (loja.isento) return "ativa";
  if (!loja.venceEm) return "ativa";
  const dias = diasParaVencer(loja.venceEm) ?? 0;
  if (dias >= 0) return "ativa";
  if (dias >= -diasTolerancia) return "tolerancia";
  return "leitura";
}

/**
 * Esta loja usa o sistema de graça e para sempre?
 *
 * `situacao_loja()` no banco diz `if v_vence is null then return 'ativa'`, e
 * a lista do administrador mostra "Em dia" — que é verdade e é justamente o
 * que engana. Loja sem prazo não é loja em dia: é loja que nunca vai vencer,
 * e era assim que TODA loja nova nascia.
 *
 * A isenta fica de fora: é a de quem administra o sistema, e não faz sentido
 * cobrar de si mesmo.
 */
export const semPrazo = (loja: Loja): boolean =>
  !loja?.isento && !loja?.bloqueada && !loja?.venceEm;

/**
 * Quando o teste termina, contado de HOJE.
 *
 * De hoje e não do vencimento anterior: liberar teste para quem está vencido
 * há três meses não pode virar três meses de crédito.
 */
export function fimDoTeste(dias: number, hoje = new Date()): Date {
  const d = Math.max(0, Math.floor(Number(dias) || 0));
  return new Date(hoje.getTime() + d * 86400000);
}

/**
 * Esta loja está usando um TESTE, e não uma assinatura paga?
 *
 * A conta é uma comparação, e não um campo que alguém precisa lembrar de
 * apagar: enquanto o vencimento não passar do fim do teste, o prazo que ela
 * tem é cortesia. `registrar_pagamento` empurra `venceEm` um mês para frente
 * do maior entre o vencimento atual e hoje — no instante do pagamento a
 * conta vira falsa sozinha, sem nenhuma tela precisar limpar nada.
 *
 * Por que isso importa mais do que parece: sem separar, a loja em teste cai
 * na régua de mensalidade e recebe "sua mensalidade venceu há 2 dias". Ela
 * nunca contratou mensalidade nenhuma. O recado que era para virar venda
 * chega como cobrança, e quem estava gostando do sistema fecha a porta.
 *
 * Vale tanto para o teste correndo quanto para o que já acabou: ela continua
 * sendo uma loja que testou e não pagou. Quem separa é `testeAcabou`.
 */
export const emTeste = (loja: Loja): boolean => {
  if (!loja || loja.isento || !loja.testeAte || !loja.venceEm) return false;
  const vence = new Date(loja.venceEm).getTime();
  const teste = new Date(loja.testeAte).getTime();
  if (Number.isNaN(vence) || Number.isNaN(teste)) return false;
  return vence <= teste;
};

/** Teste que chegou ao fim sem virar pagamento */
export const testeAcabou = (loja: Loja): boolean =>
  emTeste(loja) && (diasParaVencer(loja.venceEm) ?? 0) < 0;

/** Dias que ainda faltam de teste (negativo = acabou faz tempo) */
export const diasDeTeste = (loja: Loja): number | null =>
  emTeste(loja) ? diasParaVencer(loja.venceEm) : null;

/**
 * Dá para liberar teste para esta loja?
 *
 * Só para quem NUNCA pagou. `liberar_teste` conta a partir de hoje: chamada
 * numa loja que pagou o ano inteiro, ela jogaria o vencimento de dezembro
 * para a semana que vem. A mesma trava existe no banco — esta aqui é só para
 * o botão não aparecer onde não deve.
 */
export const podeLiberarTeste = (loja: Loja): boolean =>
  !!loja && !loja.isento && !loja.bloqueada && !loja.ultimoPagamento && !emTeste(loja);

/**
 * Libera o teste grátis de uma loja.
 *
 * Passa pela função do banco de propósito: quem pode mexer em prazo de
 * assinatura é só quem administra o sistema, e essa trava não pode depender
 * de a tela esconder o botão.
 */
export async function liberarTeste(lojaId: string, dias?: number): Promise<string> {
  if (!supabase) throw new Error("Sem conexão com a nuvem.");
  const { data, error } = await supabase.rpc("liberar_teste", {
    p_loja: lojaId,
    p_dias: dias ?? null,
  });
  if (error) {
    throw new Error(
      error.message +
        "\n\nSe você ainda não rodou o supabase-migracao-teste-gratis.sql, é isso."
    );
  }
  return String(data);
}

/**
 * Estica (positivo) ou encurta (negativo) o teste que já está correndo.
 *
 * Move as duas datas juntas — `venceEm` e `testeAte` — e é isso que mantém a
 * loja como teste. Mexer só no vencimento faria ela virar "pagante" ao ganhar
 * um dia a mais, e passar a receber cobrança de mensalidade.
 */
export async function ajustarTeste(lojaId: string, dias: number): Promise<string> {
  if (!supabase) throw new Error("Sem conexão com a nuvem.");
  const { data, error } = await supabase.rpc("ajustar_teste", {
    p_loja: lojaId,
    p_dias: Math.trunc(Number(dias) || 0),
  });
  if (error) {
    throw new Error(
      error.message +
        "\n\nSe você ainda não rodou o supabase-migracao-teste-gratis.sql de novo, é isso."
    );
  }
  return String(data);
}

/** Encerra o teste hoje. A loja continua consultando e imprimindo. */
export async function encerrarTeste(lojaId: string): Promise<string> {
  if (!supabase) throw new Error("Sem conexão com a nuvem.");
  const { data, error } = await supabase.rpc("encerrar_teste", { p_loja: lojaId });
  if (error) {
    throw new Error(
      error.message +
        "\n\nSe você ainda não rodou o supabase-migracao-teste-gratis.sql de novo, é isso."
    );
  }
  return String(data);
}

/** Situação da loja logada, direto do banco (é a resposta que vale) */
export async function minhaSituacao(): Promise<Situacao> {
  if (!supabase) return "ativa";
  const { data, error } = await supabase.rpc("situacao_loja");
  // Sem a migração aplicada, não faz sentido travar ninguém
  if (error || !data) return "ativa";
  return data as Situacao;
}

export async function carregarSistemaConfig(): Promise<SistemaConfig | null> {
  if (!supabase) return null;
  const { data } = await supabase.from("sistema_config").select("*").maybeSingle();
  return (data as SistemaConfig) || null;
}

export async function salvarSistemaConfig(c: SistemaConfig): Promise<void> {
  if (!supabase) throw new Error("Nuvem não configurada.");
  const { error } = await supabase.from("sistema_config").update(c).eq("id", true);
  if (error) throw new Error(error.message);
}

export async function listarLojas(): Promise<Loja[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("lojas")
    .select('id, nome, "venceEm", "testeAte", valor_mensal, bloqueada, isento, ramo, observacoes, whatsapp, "ultimoPagamento", "criadoEm"')
    .order("criadoEm", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as Loja[]) || [];
}

/** Minha própria loja (para a tela de assinatura do lojista) */
export async function minhaLoja(lojaId: string): Promise<Loja | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from("lojas")
    .select('id, nome, "venceEm", "testeAte", valor_mensal, bloqueada, isento, "ultimoPagamento", "criadoEm"')
    .eq("id", lojaId)
    .maybeSingle();
  return (data as Loja) || null;
}

/** Renova a assinatura. A conta dos dias fica no banco, num lugar só. */
export async function registrarPagamento(
  lojaId: string,
  meses = 1,
  valor?: number
): Promise<string> {
  if (!supabase) throw new Error("Nuvem não configurada.");
  const { data, error } = await supabase.rpc("registrar_pagamento", {
    p_loja: lojaId,
    p_meses: meses,
    p_valor: valor ?? null,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function definirBloqueio(lojaId: string, bloqueada: boolean): Promise<void> {
  if (!supabase) throw new Error("Nuvem não configurada.");
  const { error } = await supabase.from("lojas").update({ bloqueada }).eq("id", lojaId);
  if (error) throw new Error(error.message);
}

export async function atualizarLoja(lojaId: string, campos: Partial<Loja>): Promise<void> {
  if (!supabase) throw new Error("Nuvem não configurada.");
  const { error } = await supabase.from("lojas").update(campos).eq("id", lojaId);
  if (error) throw new Error(error.message);
}

/** Mensagem que o lojista manda ao pagar, já identificando a loja */
export const mensagemComprovante = (nomeLoja: string, valor?: number | null): string =>
  `Olá! Sou da loja ${negrito(nomeLoja)} e acabei de pagar a mensalidade do sistema` +
  (valor ? ` (${valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})` : "") +
  `. Segue o comprovante.`;
