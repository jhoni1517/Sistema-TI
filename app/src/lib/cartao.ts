import { txt, normalizar } from "./format";
import { centavos } from "./pdv";
import { soData } from "./contas";
import type { MovimentoCaixa } from "./types";

/**
 * O que vai vir na fatura do cartão.
 *
 * A loja compra no crédito a semana inteira — peça, material de limpeza,
 * combustível — e cada compra vira uma saída no caixa na hora. Só que o
 * dinheiro não saiu naquele dia: ele sai todo de uma vez, no vencimento da
 * fatura. Sem juntar isso em algum lugar, a pergunta que decide o mês
 * ("quanto vem no cartão?") só é respondida quando a fatura chega.
 *
 * ---------------------------------------------------------------------
 * A ARMADILHA, e é a mesma da compra de estoque.
 *
 * Se cada compra no crédito é despesa E o pagamento da fatura também for,
 * o mês conta tudo DUAS VEZES. Um mês com R$ 2.000 no cartão fecharia
 * mostrando R$ 4.000 de despesa e um prejuízo que não existiu.
 *
 * Compra no crédito é a despesa. O pagamento da fatura é só a quitação
 * dela: sai do caixa e NÃO entra no resultado — exatamente como a reposição
 * de estoque, que vira custo quando a peça é vendida, não quando é comprada.
 * ---------------------------------------------------------------------
 */

const n = (v?: number | null): number => Number(v) || 0;

/**
 * Categorias que representam o pagamento da fatura, e não uma despesa nova.
 * Sem acento: a comparação passa por `normalizar`, igual em `calc.ts`.
 */
const CATEGORIAS_FATURA = ["fatura do cartao", "fatura cartao", "fatura"];

/**
 * Esta saída é o pagamento da fatura do cartão?
 *
 * A marcação explícita manda. A categoria decide os lançamentos antigos,
 * feitos antes de o campo existir — assim o histórico também passa a ser
 * calculado direito, que é a mesma escolha feita em `ehCompraEstoque`.
 */
export const ehPagamentoDeFatura = (m: MovimentoCaixa): boolean =>
  m.tipo === "saida" &&
  (m.faturaCartao === true ||
    (m.faturaCartao === undefined &&
      CATEGORIAS_FATURA.includes(normalizar(m.categoria))));

/**
 * Compra no crédito: a despesa de verdade.
 *
 * O pagamento da fatura fica DE FORA mesmo quando lançado no crédito —
 * senão ele entraria na própria conta que veio pagar.
 */
export const ehGastoNoCartao = (m: MovimentoCaixa): boolean =>
  m.tipo === "saida" && txt(m.formaPagamento) === "credito" && !ehPagamentoDeFatura(m);

export interface GastoCartao {
  /** Quanto já foi comprado no crédito no período */
  total: number;
  /** As compras, da mais recente para a mais antiga */
  itens: MovimentoCaixa[];
  /** Quanto já foi pago de fatura no mesmo período */
  pago: number;
}

/**
 * O gasto no cartão dentro de um período.
 *
 * Sem `de`/`ate` conta tudo, que é o que a tela usa quando o mês ainda não
 * foi escolhido.
 */
export function gastoNoCartao(
  movimentos: MovimentoCaixa[],
  { de = "", ate = "" }: { de?: string; ate?: string } = {}
): GastoCartao {
  const noPeriodo = (m: MovimentoCaixa): boolean => {
    const dia = soData(m.data);
    if (de && dia < de) return false;
    if (ate && dia > ate) return false;
    return true;
  };

  const itens = movimentos
    .filter(ehGastoNoCartao)
    .filter(noPeriodo)
    .sort((a, b) => txt(b.data).localeCompare(txt(a.data)));

  return {
    total: centavos(itens.reduce((s, m) => s + n(m.valor), 0)),
    itens,
    pago: centavos(
      movimentos
        .filter(ehPagamentoDeFatura)
        .filter(noPeriodo)
        .reduce((s, m) => s + n(m.valor), 0)
    ),
  };
}

/**
 * Onde o dinheiro do cartão foi parar, por categoria.
 *
 * É o que responde "por que a fatura veio tão alta este mês" sem abrir a
 * lista inteira: o valor costuma estar concentrado em duas ou três coisas.
 */
export function porCategoria(gasto: GastoCartao): { categoria: string; valor: number }[] {
  const mapa = new Map<string, number>();
  for (const m of gasto.itens) {
    const c = txt(m.categoria).trim() || "Sem categoria";
    mapa.set(c, centavos((mapa.get(c) || 0) + n(m.valor)));
  }
  return [...mapa.entries()]
    .map(([categoria, valor]) => ({ categoria, valor }))
    .sort((a, b) => b.valor - a.valor);
}
