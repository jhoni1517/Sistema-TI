import { supabase } from "./supabase";

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
  ultimoPagamento?: string | null;
  criadoEm?: string | null;
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
    .select('id, nome, "venceEm", valor_mensal, bloqueada, isento, observacoes, whatsapp, "ultimoPagamento", "criadoEm"')
    .order("criadoEm", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as Loja[]) || [];
}

/** Minha própria loja (para a tela de assinatura do lojista) */
export async function minhaLoja(lojaId: string): Promise<Loja | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from("lojas")
    .select('id, nome, "venceEm", valor_mensal, bloqueada, isento, "ultimoPagamento", "criadoEm"')
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
  `Olá! Sou da loja *${nomeLoja}* e acabei de pagar a mensalidade do sistema` +
  (valor ? ` (${valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})` : "") +
  `. Segue o comprovante.`;
