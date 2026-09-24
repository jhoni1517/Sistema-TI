import { txt } from "./format";
import { receitaBruta, custoProdutos, despesasOperacionais } from "./calc";
import type { FormaPagamento, MovimentoCaixa } from "./types";

/**
 * "Quanto sobrou pra você este mês."
 *
 * Faturamento não é o que o dono leva para casa, e "lucro líquido" é
 * palavra de contador. A pergunta de verdade no fim do mês é: tirando a
 * peça que eu vendi, as contas que paguei e o que a maquininha comeu,
 * quanto sobrou pra mim?
 *
 *   sobra = faturamento − custo do que saiu − despesas pagas − taxa do cartão
 *
 * As contas pagas JÁ ESTÃO nas despesas: pagar uma conta lança a saída no
 * caixa (Contas.tsx). Somar a lista de contas de novo contaria o aluguel
 * duas vezes. Compra de estoque e fatura do cartão ficam de fora pelo
 * motivo de sempre (ver despesasOperacionais em lib/calc.ts).
 */

/** Taxa da maquininha, em %, por forma de pagamento */
export type TaxasCartao = Partial<Record<"debito" | "credito" | "pix", number>>;

const pct = (v?: number) => Math.max(0, Math.min(30, Number(v) || 0)) / 100;
const centavos = (v: number) => Math.round(v * 100) / 100;

/** O que a maquininha ficou: só sobre ENTRADAS pagas naquela forma */
export function taxaDoCartao(movs: MovimentoCaixa[], taxas: TaxasCartao = {}): number {
  const porForma: Partial<Record<FormaPagamento, number>> = {
    debito: pct(taxas.debito),
    credito: pct(taxas.credito),
    pix: pct(taxas.pix),
  };
  return centavos(
    movs
      .filter((m) => m.tipo === "entrada")
      .reduce((s, m) => s + (Number(m.valor) || 0) * (porForma[m.formaPagamento] || 0), 0)
  );
}

/**
 * O mês do lançamento no relógio da LOJA. Venda às 22h do dia 31 é do dia
 * 31 aqui, mesmo sendo dia 1º em UTC — senão ela sai do mês em que o dono
 * lembra de ter vendido.
 */
export const mesDoLancamento = (iso?: string | null): string => {
  const d = new Date(txt(iso));
  if (Number.isNaN(d.getTime())) return txt(iso).slice(0, 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export function mesAnterior(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}

export interface Sobra {
  faturamento: number;
  custoMercadoria: number;
  despesas: number;
  taxas: number;
  sobra: number;
}

export function sobraDoMes(
  movs: MovimentoCaixa[],
  mes: string,
  taxas: TaxasCartao = {},
  mesDe: (iso: string) => string = mesDoLancamento
): Sobra {
  const doMes = movs.filter((m) => mesDe(m.data) === mes);
  const faturamento = centavos(receitaBruta(doMes));
  const custoMercadoria = centavos(custoProdutos(doMes));
  const despesas = centavos(despesasOperacionais(doMes));
  const t = taxaDoCartao(doMes, taxas);
  return { faturamento, custoMercadoria, despesas, taxas: t, sobra: centavos(faturamento - custoMercadoria - despesas - t) };
}

/** "R$ 800 a mais que o mês passado". Mês passado zerado não vira %. */
export function comparar(atual: number, anterior: number): { diferenca: number; pct: number | null } {
  const diferenca = centavos(atual - anterior);
  return { diferenca, pct: anterior > 0 ? Math.round((diferenca / anterior) * 100) : null };
}

/** Quanto da meta de pró-labore o mês já cobriu */
export function metaProLabore(sobra: number, meta?: number): { pct: number; falta: number } | null {
  const m = Number(meta) || 0;
  if (m <= 0) return null;
  return { pct: Math.max(0, Math.min(100, Math.round((sobra / m) * 100))), falta: centavos(Math.max(0, m - sobra)) };
}
