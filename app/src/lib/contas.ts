import { txt } from "./format";
import {
  RECORRENCIA_META,
  type ContaPagar,
  type Meta,
  type MovimentoCaixa,
  type OrdemServico,
  type Recorrencia,
  type TipoMeta,
} from "./types";
import { receitaBruta, lucroLiquido, despesasOperacionais } from "./calc";

/**
 * Contas fixas e a pagar.
 *
 * O cuidado maior aqui é com data. Conta de aluguel que vence dia 31 não
 * pode sumir em fevereiro, e conta paga adiantada não pode pular um mês.
 * Toda a aritmética de vencimento vive neste arquivo, com teste, em vez de
 * espalhada pelas telas.
 */

const n = (v?: number | null): number => Number(v) || 0;

/** Só a data, sem hora — comparar horários faz "vence hoje" virar "atrasada" */
export const soData = (iso?: string | null): string => txt(iso).slice(0, 10);

/**
 * O dia de HOJE, no relógio de quem está no balcão.
 *
 * A regra da casa — data é texto AAAA-MM-DD e a conta é em UTC — vale para a
 * ARITMÉTICA: somar um mês, virar o ano, dia 31 em fevereiro. Ela nunca quis
 * dizer que o dia de hoje fosse o de Greenwich, e era isso que acontecia:
 * `toISOString()` devolve a data em UTC, então no Brasil (UTC-3) o sistema
 * inteiro virava o dia às 21h. Três horas por dia, todo dia, e justamente as
 * horas cheias de uma pizzaria ou de uma loja de bebidas.
 *
 * Das 21h em diante: promoção que termina hoje parava de valer (a gôndola
 * dizia um preço e o caixa cobrava outro), produto que vence amanhã já
 * entrava como vencido no PDV, e conta que vence hoje aparecia atrasada.
 *
 * Deslocar pelo fuso antes de cortar devolve a data LOCAL como texto puro —
 * e daí para a frente toda a aritmética continua em UTC, como sempre foi.
 */
export const hojeISO = (): string => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

/**
 * Dias até o vencimento. Negativo = atrasada.
 * Calculado em UTC a partir da data pura, para o fuso não deslocar um dia.
 */
export const diasAteVencer = (vencimento?: string | null, hoje = hojeISO()): number => {
  const a = Date.parse(soData(vencimento) + "T00:00:00Z");
  const b = Date.parse(soData(hoje) + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((a - b) / 86400000);
};

/**
 * Avança um vencimento conforme a recorrência.
 *
 * O detalhe que quebra sistemas: dia 31 + 1 mês. Fevereiro não tem 31, e a
 * soma ingênua joga a conta para março. Aqui o dia é preso ao último dia do
 * mês de destino, e o dia original é preservado para os meses seguintes.
 */
export function proximoVencimento(
  vencimento: string,
  recorrencia: Recorrencia,
  diaOriginal?: number
): string {
  const meta = RECORRENCIA_META[recorrencia];
  if (!meta || (meta.meses === 0 && meta.dias === 0)) return soData(vencimento);

  const base = new Date(soData(vencimento) + "T00:00:00Z");
  if (Number.isNaN(base.getTime())) return soData(vencimento);

  if (meta.dias > 0) {
    base.setUTCDate(base.getUTCDate() + meta.dias);
    return base.toISOString().slice(0, 10);
  }

  const dia = diaOriginal || base.getUTCDate();
  const ano = base.getUTCFullYear();
  const mes = base.getUTCMonth() + meta.meses;

  // Dia 0 do mês seguinte = último dia do mês desejado
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const alvo = new Date(Date.UTC(ano, mes, Math.min(dia, ultimoDia)));
  return alvo.toISOString().slice(0, 10);
}

export type SituacaoConta = "paga" | "atrasada" | "vence_hoje" | "proxima" | "futura" | "inativa";

export const SITUACAO_CONTA_META: Record<SituacaoConta, { label: string; cor: string }> = {
  atrasada: { label: "Atrasada", cor: "bg-red-100 text-red-700" },
  vence_hoje: { label: "Vence hoje", cor: "bg-amber-100 text-amber-700" },
  proxima: { label: "Vence em breve", cor: "bg-blue-100 text-blue-700" },
  futura: { label: "Em dia", cor: "bg-slate-100 text-slate-600" },
  paga: { label: "Paga", cor: "bg-emerald-100 text-emerald-700" },
  inativa: { label: "Desligada", cor: "bg-slate-100 text-slate-500" },
};

/** Uma conta única já quitada não volta a cobrar */
export const contaQuitada = (c: ContaPagar): boolean =>
  c.recorrencia === "unica" && (c.pagamentos || []).length > 0;

export function situacaoConta(c: ContaPagar, hoje = hojeISO()): SituacaoConta {
  if (!c.ativo) return "inativa";
  if (contaQuitada(c)) return "paga";
  const dias = diasAteVencer(c.vencimento, hoje);
  if (dias < 0) return "atrasada";
  if (dias === 0) return "vence_hoje";
  if (dias <= (c.lembreteDias ?? 3)) return "proxima";
  return "futura";
}

/** Contas que merecem aviso agora: atrasadas, vencendo hoje ou dentro do lembrete */
export const contasParaAvisar = (contas: ContaPagar[], hoje = hojeISO()): ContaPagar[] =>
  contas
    .filter((c) => ["atrasada", "vence_hoje", "proxima"].includes(situacaoConta(c, hoje)))
    .sort((a, b) => diasAteVencer(a.vencimento, hoje) - diasAteVencer(b.vencimento, hoje));

/** Quanto ainda vai sair no mês corrente considerando o que não foi pago */
export const totalAPagarNoMes = (contas: ContaPagar[], hoje = hojeISO()): number => {
  const mes = soData(hoje).slice(0, 7);
  return contas
    .filter((c) => c.ativo && !contaQuitada(c) && soData(c.vencimento).slice(0, 7) === mes)
    .reduce((s, c) => s + n(c.valor), 0);
};

export const totalAtrasado = (contas: ContaPagar[], hoje = hojeISO()): number =>
  contas
    .filter((c) => situacaoConta(c, hoje) === "atrasada")
    .reduce((s, c) => s + n(c.valor), 0);

/** Soma das contas fixas (recorrentes) ativas, normalizada para o mês */
export const custoFixoMensal = (contas: ContaPagar[]): number =>
  contas
    .filter((c) => c.ativo && c.recorrencia !== "unica")
    .reduce((s, c) => {
      const meta = RECORRENCIA_META[c.recorrencia];
      if (meta.dias === 7) return s + n(c.valor) * (52 / 12); // semanal
      if (meta.meses > 0) return s + n(c.valor) / meta.meses;
      return s;
    }, 0);

/**
 * Registra o pagamento e devolve a conta já com o próximo vencimento.
 * A recorrente nunca "fecha": ela apenas anda para o ciclo seguinte.
 */
export function pagarConta(
  c: ContaPagar,
  dados: { valor: number; formaPagamento: PagamentoFormas; data?: string }
): ContaPagar {
  const data = dados.data || new Date().toISOString();
  const pagamento = {
    data,
    valor: n(dados.valor),
    formaPagamento: dados.formaPagamento,
    referencia: soData(c.vencimento),
  };
  const pagamentos = [...(c.pagamentos || []), pagamento];

  if (c.recorrencia === "unica") return { ...c, pagamentos };

  // O dia original vem do primeiro vencimento cadastrado, para que uma conta
  // do dia 31 volte a cair no dia 31 depois de passar por fevereiro.
  const diaOriginal = new Date(
    soData(pagamentos[0].referencia) + "T00:00:00Z"
  ).getUTCDate();

  return {
    ...c,
    pagamentos,
    vencimento: proximoVencimento(c.vencimento, c.recorrencia, diaOriginal),
  };
}

type PagamentoFormas = ContaPagar["pagamentos"][number]["formaPagamento"];

/* ------------------------------------------------------------------ */
/* Relatório de gastos                                                 */
/* ------------------------------------------------------------------ */

export interface GastoCategoria {
  categoria: string;
  valor: number;
  fatia: number; // % do total
}

/** Para onde o dinheiro foi, do maior para o menor */
export function gastosPorCategoria(
  movs: MovimentoCaixa[],
  filtroMes?: string
): GastoCategoria[] {
  const saidas = movs.filter(
    (m) => m.tipo === "saida" && (!filtroMes || soData(m.data).slice(0, 7) === filtroMes)
  );
  const total = saidas.reduce((s, m) => s + n(m.valor), 0);
  if (total === 0) return [];

  const mapa = new Map<string, number>();
  for (const m of saidas) {
    const cat = txt(m.categoria).trim() || "Sem categoria";
    mapa.set(cat, (mapa.get(cat) || 0) + n(m.valor));
  }

  return [...mapa.entries()]
    .map(([categoria, valor]) => ({
      categoria,
      valor,
      fatia: (valor / total) * 100,
    }))
    .sort((a, b) => b.valor - a.valor);
}

/* ------------------------------------------------------------------ */
/* Objetivos                                                           */
/* ------------------------------------------------------------------ */

export interface ProgressoMeta {
  atual: number;
  alvo: number;
  percentual: number;
  atingida: boolean;
  /** No teto de gasto, passar do alvo é ruim */
  estourou: boolean;
}

const dentroDoPeriodo = (data: string | undefined, meta: Meta, hoje: string): boolean => {
  const d = soData(data);
  if (!d) return false;
  return meta.periodo === "mensal"
    ? d.slice(0, 7) === soData(hoje).slice(0, 7)
    : d.slice(0, 4) === soData(hoje).slice(0, 4);
};

export function progressoMeta(
  meta: Meta,
  movimentos: MovimentoCaixa[],
  ordens: OrdemServico[],
  hoje = hojeISO()
): ProgressoMeta {
  const movs = movimentos.filter((m) => dentroDoPeriodo(m.data, meta, hoje));

  let atual = 0;
  switch (meta.tipo) {
    case "faturamento":
      atual = receitaBruta(movs);
      break;
    case "lucro":
      atual = lucroLiquido(movs);
      break;
    case "teto_gasto":
      atual = despesasOperacionais(movs);
      break;
    case "os":
      atual = ordens.filter(
        (o) => o.status === "entregue" && dentroDoPeriodo(o.entregueEm || o.atualizadoEm, meta, hoje)
      ).length;
      break;
  }

  const alvo = n(meta.alvo);
  const percentual = alvo > 0 ? Math.max(0, (atual / alvo) * 100) : 0;
  const tetoDeGasto = meta.tipo === "teto_gasto";

  return {
    atual,
    alvo,
    percentual,
    // No teto de gasto, "atingir" é ficar abaixo do limite
    atingida: tetoDeGasto ? atual <= alvo : atual >= alvo,
    estourou: tetoDeGasto && atual > alvo,
  };
}

export const CORES_META: Record<TipoMeta, string> = {
  faturamento: "#3b82f6",
  lucro: "#10b981",
  os: "#8b5cf6",
  teto_gasto: "#f59e0b",
};
