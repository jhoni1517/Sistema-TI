import { isToday, txt } from "./format";
import { receitaBruta, totalDespesas, totalSangrias } from "./calc";
import type { MovimentoCaixa, SessaoCaixa } from "./types";

/**
 * Sessões de caixa: o que entrou, o que saiu e se bate com a gaveta.
 *
 * A conta do fechamento vive aqui, e não na tela, porque é dinheiro. E
 * porque agora ela é usada em três lugares — o resumo do dia, o histórico
 * de fechamentos e o recibo impresso — e três cópias divergem.
 */

export interface ResumoCaixa {
  abertura: number;
  entradas: number;
  saidas: number;
  sangrias: number;
  /** Quanto deveria haver na gaveta */
  saldo: number;
  /**
   * Só o que está em papel na gaveta: abertura + entradas em dinheiro, menos
   * saídas e sangrias. O saldo soma cartão e Pix, que nunca passam por lá.
   */
  emEspecie: number;
  /** Quanto foi contado de fato (undefined = ninguém contou) */
  contado?: number;
  /**
   * contado - saldo. Positivo sobrou, negativo faltou.
   * undefined quando não houve contagem: zero aqui seria mentira, porque
   * "não conferido" não é a mesma coisa que "conferido e bateu".
   */
  diferenca?: number;
  quantidade: number;
  /** Entradas separadas por forma de pagamento */
  porForma: Record<string, number>;
}

/** Movimentos que pertencem a esta sessão */
export const movimentosDaSessao = (
  sessao: SessaoCaixa | null,
  movimentos: MovimentoCaixa[]
): MovimentoCaixa[] =>
  sessao
    ? movimentos.filter((m) => m.sessaoId === sessao.id)
    : // Sem sessão aberta a tela mostra o dia, para o caixa não parecer vazio
      movimentos.filter((m) => isToday(m.data));

export function resumoCaixa(
  sessao: SessaoCaixa | null,
  movimentos: MovimentoCaixa[]
): ResumoCaixa {
  const entradas = receitaBruta(movimentos);
  const saidas = totalDespesas(movimentos);
  const sangrias = totalSangrias(movimentos);
  const abertura = Number(sessao?.valorAbertura) || 0;
  const saldo = abertura + entradas - saidas - sangrias;

  const porForma: Record<string, number> = {};
  for (const m of movimentos) {
    if (m.tipo !== "entrada") continue;
    const f = txt(m.formaPagamento) || "outro";
    porForma[f] = (porForma[f] || 0) + (Number(m.valor) || 0);
  }

  /*
   * Quanto está em ESPÉCIE na gaveta.
   *
   * Diferente do saldo: o saldo soma cartão e Pix, que nunca passam pela
   * gaveta. Um dia com R$ 3.000 no cartão fazia o aviso de sangria disparar
   * sem ter um centavo a mais em papel — e o aviso que dispara sem motivo é
   * o aviso que a pessoa aprende a ignorar.
   *
   * Saída e sangria entram porque saem da gaveta de verdade. Saída paga no
   * cartão da loja não deveria descontar daqui, mas ela é rara e descontar a
   * mais só faz o aviso ser conservador — o erro seguro é para este lado.
   */
  const emEspecie = arredonda(
    abertura + (porForma.dinheiro || 0) - saidas - sangrias
  );

  const contado = typeof sessao?.valorContado === "number" ? sessao.valorContado : undefined;

  return {
    abertura,
    entradas,
    saidas,
    sangrias,
    saldo,
    emEspecie,
    contado,
    diferenca: contado === undefined ? undefined : arredonda(contado - saldo),
    quantidade: movimentos.length,
    porForma,
  };
}

/**
 * Centavos não podem virar 0.30000000000000004 na comparação da gaveta.
 * O "+ 0" no fim mata o -0 do JavaScript, que sairia impresso como
 * "- R$ 0,00" e faria a pessoa procurar um erro que não existe.
 */
const arredonda = (v: number): number => Math.round(v * 100) / 100 + 0;

/** Sessões já fechadas, da mais recente para a mais antiga */
export const sessoesFechadas = (sessoes: SessaoCaixa[]): SessaoCaixa[] =>
  sessoes
    .filter((s) => !!s.fechadoEm)
    .sort((a, b) => txt(b.abertoEm).localeCompare(txt(a.abertoEm)));

/** A sessão em aberto, se houver */
export const sessaoAberta = (sessoes: SessaoCaixa[]): SessaoCaixa | null =>
  sessoes.find((s) => !s.fechadoEm) || null;

/**
 * Como classificar a diferença encontrada.
 *
 * A tolerância existe porque troco de moeda gera centavo de diferença todo
 * dia, e um alerta que aparece sempre deixa de ser lido.
 */
export type Conferencia = "nao_conferido" | "certo" | "sobra" | "falta";

export function conferencia(r: ResumoCaixa, tolerancia = 0.5): Conferencia {
  if (r.diferenca === undefined) return "nao_conferido";
  if (Math.abs(r.diferenca) <= Math.abs(tolerancia)) return "certo";
  return r.diferenca > 0 ? "sobra" : "falta";
}

export const CONFERENCIA_META: Record<
  Conferencia,
  { label: string; cor: string }
> = {
  nao_conferido: { label: "Sem conferência", cor: "bg-slate-100 text-slate-600" },
  certo: { label: "Bateu", cor: "bg-emerald-100 text-emerald-700" },
  sobra: { label: "Sobrou", cor: "bg-amber-100 text-amber-700" },
  falta: { label: "Faltou", cor: "bg-red-100 text-red-700" },
};
