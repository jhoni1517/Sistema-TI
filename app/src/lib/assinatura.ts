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
  /**
   * Por que o teste não virou assinatura.
   *
   * Lista fechada (`MOTIVOS_TESTE`) e não campo livre: motivo escrito à mão
   * vira depoimento que ninguém soma. Três meses de lista dizem se o problema
   * é preço ou é uma tela faltando; três meses de texto livre não dizem nada.
   */
  motivoTeste?: string | null;
  /** Quantas cortesias esta loja já levou. A primeira é venda; a terceira é outra conversa. */
  testesDados?: number | null;
}

/** Quantos clientes, produtos, ordens e vendas uma loja tem. Só contagem. */
export interface UsoDaLoja {
  loja: string;
  clientes: number;
  produtos: number;
  ordens: number;
  vendas: number;
}

export interface SistemaConfig {
  chave_pix?: string | null;
  titular_pix?: string | null;
  whatsapp_suporte?: string | null;
  valor_padrao?: number | null;
  dias_teste?: number | null;
  dias_tolerancia?: number | null;
  mensagem_vencimento?: string | null;
  /** Dias ao REABRIR um teste para quem já testou. Menor que o primeiro. */
  dias_reteste?: number | null;
  /** A tolerância vale durante o teste? Nasce falsa — ver a migração. */
  tolerancia_no_teste?: boolean | null;
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
/** O recado que aparece quando a função do banco ainda não existe */
const AVISO_MIGRACAO =
  "\n\nSe você ainda não rodou o supabase-migracao-teste-controle.sql, é isso.";

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
 * Dá para REABRIR o teste desta loja?
 *
 * Só para quem já testou e o prazo acabou. Reabrir teste que ainda corre
 * daria dias de graça a quem já os tem — para esse o caminho é o "+3/+7/+15".
 */
export const podeReabrirTeste = (loja: Loja): boolean =>
  !!loja && !loja.ultimoPagamento && !loja.bloqueada && testeAcabou(loja);

/**
 * Por que o teste não virou assinatura.
 *
 * Lista fechada de propósito. Motivo escrito à mão vira depoimento que
 * ninguém soma; lista fechada, em três meses, diz se o que falta é preço ou
 * é uma tela. A ordem é a das respostas mais comuns primeiro, porque quem
 * anota isso está com o telefone na orelha.
 */
export const MOTIVOS_TESTE = [
  { k: "caro", nome: "Achou caro" },
  { k: "faltou", nome: "Faltou algo no sistema" },
  { k: "sumiu", nome: "Sumiu, não respondeu" },
  { k: "outro_sistema", nome: "Já tem outro sistema" },
  { k: "fechou", nome: "A loja fechou / desistiu" },
  { k: "so_olhando", nome: "Só estava olhando" },
] as const;

export const nomeDoMotivo = (k?: string | null): string => {
  const chave = String(k ?? "").trim();
  if (!chave) return "";
  return MOTIVOS_TESTE.find((m) => m.k === chave)?.nome ?? chave;
};

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
      error.message + AVISO_MIGRACAO
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
      error.message + AVISO_MIGRACAO
    );
  }
  return String(data);
}

/** Encerra o teste hoje. A loja continua consultando e imprimindo. */
export async function encerrarTeste(lojaId: string, motivo?: string): Promise<string> {
  if (!supabase) throw new Error("Sem conexão com a nuvem.");
  const { data, error } = await supabase.rpc("encerrar_teste", {
    p_loja: lojaId,
    p_motivo: motivo || null,
  });
  if (error) {
    throw new Error(
      error.message + AVISO_MIGRACAO
    );
  }
  return String(data);
}

/**
 * Reabre o teste de quem já testou, com o prazo menor de `dias_reteste`.
 *
 * Separado de `ajustarTeste` porque é outra coisa: esticar é para o teste que
 * está correndo; reabrir é para quem sumiu e voltou. O mesmo botão para os
 * dois esconderia justamente o que interessa — quantas vezes aquela loja já
 * usou de graça (`testesDados`).
 */
export async function reabrirTeste(lojaId: string, dias?: number): Promise<string> {
  if (!supabase) throw new Error("Sem conexão com a nuvem.");
  const { data, error } = await supabase.rpc("reabrir_teste", {
    p_loja: lojaId,
    p_dias: dias ?? null,
  });
  if (error) throw new Error(error.message + AVISO_MIGRACAO);
  return String(data);
}

/**
 * Anota o motivo sem encerrar nada.
 *
 * O motivo quase nunca aparece no momento em que o teste acaba: aparece três
 * dias depois, no telefonema. Sem um jeito de anotar fora do encerramento, a
 * informação se perde exatamente quando ela existe.
 */
export async function anotarMotivoTeste(lojaId: string, motivo: string): Promise<void> {
  if (!supabase) throw new Error("Sem conexão com a nuvem.");
  const { error } = await supabase.rpc("anotar_motivo_teste", {
    p_loja: lojaId,
    p_motivo: motivo,
  });
  if (error) throw new Error(error.message + AVISO_MIGRACAO);
}

/**
 * O que cada loja construiu lá dentro. SÓ CONTAGEM.
 *
 * Quantos produtos a loja cadastrou é da sua relação comercial com ela;
 * QUAIS produtos, o nome dos clientes e o valor das vendas não são, e não
 * passam por aqui. A função do banco também não devolve isso.
 *
 * Falhar aqui não pode derrubar a lista de lojas: sem a migração nova, a
 * tela continua inteira e só não mostra este pedaço.
 */
export async function resumoUsoLojas(): Promise<Record<string, UsoDaLoja>> {
  if (!supabase) return {};
  const { data, error } = await supabase.rpc("resumo_uso_lojas");
  if (error || !Array.isArray(data)) return {};
  const mapa: Record<string, UsoDaLoja> = {};
  for (const l of data as UsoDaLoja[]) {
    mapa[String(l.loja)] = {
      loja: String(l.loja),
      clientes: Number(l.clientes) || 0,
      produtos: Number(l.produtos) || 0,
      ordens: Number(l.ordens) || 0,
      vendas: Number(l.vendas) || 0,
    };
  }
  return mapa;
}

/**
 * A loja mexeu no sistema durante o teste?
 *
 * Quem cadastrou 200 produtos e sumiu esbarrou em alguma coisa concreta; quem
 * cadastrou 3 nunca começou. São dois telefonemas diferentes, e sem isto os
 * dois recebem o mesmo.
 */
export const usouDeVerdade = (u?: UsoDaLoja | null): boolean =>
  !!u && u.produtos + u.clientes + u.ordens + u.vendas >= 10;

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
    .select('id, nome, "venceEm", "testeAte", "motivoTeste", "testesDados", valor_mensal, bloqueada, isento, ramo, observacoes, whatsapp, "ultimoPagamento", "criadoEm"')
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
