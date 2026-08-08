import type { OrdemServico, MovimentoCaixa, Fiado } from "./types";
import { normalizar } from "./format";
import { ehPagamentoDeFatura } from "./cartao";
import {
  pecasEfetivas,
  subtotalPeca,
  custoDaPeca,
  nomesDasOpcoes,
  escolhaConfirmada,
  comOpcao,
} from "./orcamento";

/** Número seguro: a nuvem devolve nulo em coluna vazia */
const n = (v?: number | null): number => (Number(v) || 0);

/**
 * Só as peças do orçamento escolhido contam.
 *
 * Quando a OS oferece caminhos diferentes — fonte de 500W mais SSD, ou só a
 * fonte de 200W — somar todos cobrava do cliente um conserto que ele não vai
 * levar. Ver lib/orcamento.ts.
 */
export const totalPecas = (o: OrdemServico): number =>
  pecasEfetivas(o).reduce((s, p) => s + subtotalPeca(p), 0);

export const custoPecas = (o: OrdemServico): number =>
  pecasEfetivas(o).reduce((s, p) => s + custoDaPeca(p), 0);

export const totalOS = (o: OrdemServico): number =>
  totalPecas(o) + n(o.maoDeObra) - n(o.desconto);

/** Quanto sai o serviço inteiro com este orçamento */
export const totalComOpcao = (o: OrdemServico, nome: string): number =>
  totalOS(comOpcao(o, nome));

/** Custo da loja com este orçamento — é o que decide se a opção dá lucro */
export const custoComOpcao = (o: OrdemServico, nome: string): number =>
  custoPecas(comOpcao(o, nome));

/**
 * Do mais barato ao mais caro entre os orçamentos oferecidos.
 *
 * Serve para dizer "o serviço sai de X a Y" enquanto o cliente não responde.
 * `definido` conta se a escolha já foi confirmada — sem isso a loja cobrava
 * pela sugestão achando que era decisão do cliente.
 */
export const faixaOS = (
  o: OrdemServico
): { minimo: number; maximo: number; definido: boolean } => {
  const nomes = nomesDasOpcoes(o);
  const definido = escolhaConfirmada(o);
  if (nomes.length < 2) {
    const t = totalOS(o);
    return { minimo: t, maximo: t, definido };
  }
  const totais = nomes.map((nome) => totalComOpcao(o, nome));
  return { minimo: Math.min(...totais), maximo: Math.max(...totais), definido };
};

export const lucroOS = (o: OrdemServico): number =>
  totalOS(o) - custoPecas(o);

/** Receita bruta = todas as entradas (não sangria/saída) */
export const receitaBruta = (movs: MovimentoCaixa[]): number =>
  movs.filter((m) => m.tipo === "entrada").reduce((s, m) => s + n(m.valor), 0);

/**
 * Categorias que representam reposição de estoque, não despesa do mês.
 *
 * Escritas sem acento porque a comparação passa por `normalizar`. Antes a
 * lista trazia "compra de peça" E "compra de peca", que é o remendo à mão do
 * mesmo problema — e que só cobre as grafias que alguém lembrou de escrever:
 * "Compra de Peças" no plural ficava de fora e virava despesa do mês, com o
 * custo contado duas vezes e o lucro aparecendo negativo numa venda lucrativa.
 */
const CATEGORIAS_ESTOQUE = ["compra de peca", "compra de pecas", "fornecedor"];

/**
 * A saída é compra de estoque?
 * Lançamentos antigos não têm a marcação, então a categoria decide — assim
 * o histórico já existente também passa a ser calculado direito.
 */
export const ehCompraEstoque = (m: MovimentoCaixa): boolean =>
  m.tipo === "saida" &&
  (m.compraEstoque === true ||
    (m.compraEstoque === undefined &&
      CATEGORIAS_ESTOQUE.includes(normalizar(m.categoria))));

/** Despesas = todas as saídas. É o que realmente sai do caixa. */
export const totalDespesas = (movs: MovimentoCaixa[]): number =>
  movs.filter((m) => m.tipo === "saida").reduce((s, m) => s + n(m.valor), 0);

/**
 * Despesas que pesam no RESULTADO: aluguel, energia, salário...
 *
 * Duas coisas ficam de fora, pelo mesmo motivo — elas já foram contadas em
 * outro momento, e contar de novo mostra prejuízo onde não houve:
 *
 * - **Compra de peça**: o custo dela entra no resultado quando a peça é
 *   vendida. Contar nos dois lugares descontava a mesma peça duas vezes.
 * - **Pagamento da fatura do cartão**: cada compra no crédito já virou
 *   despesa no dia em que aconteceu. Um mês com R$ 2.000 no cartão fecharia
 *   mostrando R$ 4.000 de despesa. Ver lib/cartao.ts.
 */
export const despesasOperacionais = (movs: MovimentoCaixa[]): number =>
  movs
    .filter((m) => m.tipo === "saida" && !ehCompraEstoque(m) && !ehPagamentoDeFatura(m))
    .reduce((s, m) => s + n(m.valor), 0);

/** Quanto foi investido em reposição de estoque no período */
export const comprasEstoque = (movs: MovimentoCaixa[]): number =>
  movs.filter(ehCompraEstoque).reduce((s, m) => s + n(m.valor), 0);

export const totalSangrias = (movs: MovimentoCaixa[]): number =>
  movs.filter((m) => m.tipo === "sangria").reduce((s, m) => s + n(m.valor), 0);

/** Custo das peças embutido nas vendas (CMV) */
export const custoProdutos = (movs: MovimentoCaixa[]): number =>
  movs.reduce((s, m) => s + n(m.custoRelacionado), 0);

/** Lucro líquido = receita - custo do que foi vendido - despesas do mês */
export const lucroLiquido = (movs: MovimentoCaixa[]): number =>
  receitaBruta(movs) - custoProdutos(movs) - despesasOperacionais(movs);

/** Total já pago de um fiado */
export const pagoFiado = (f: Fiado): number =>
  (f.pagamentos || []).reduce((s, p) => s + n(p.valor), 0);

/** Saldo devedor de um fiado */
export const saldoFiado = (f: Fiado): number =>
  Math.max(0, n(f.valor) - pagoFiado(f));

/** Dias corridos entre uma data e hoje */
export const diasDesde = (iso?: string): number => {
  if (!iso) return 0;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
};

/** Há quantos dias o aparelho está na loja (aberta -> entregue) */
export const diasEmPosse = (o: OrdemServico): number =>
  o.status === "entregue" || o.status === "cancelada"
    ? 0
    : diasDesde(o.criadoEm);

/**
 * Taxa de armazenamento acumulada: começa a contar depois que a OS ficou
 * pronta e o prazo de retirada expirou.
 */
export const taxaArmazenamento = (
  o: OrdemServico,
  taxaDia: number,
  prazoDias: number
): { diasParado: number; diasExcedidos: number; valor: number } => {
  const base = o.prontaEm;
  if (!base || o.status !== "pronta" || !taxaDia) {
    return { diasParado: base ? diasDesde(base) : 0, diasExcedidos: 0, valor: 0 };
  }
  const diasParado = diasDesde(base);
  const diasExcedidos = Math.max(0, diasParado - (prazoDias || 0));
  return { diasParado, diasExcedidos, valor: diasExcedidos * taxaDia };
};

/** Saldo em caixa considerando abertura */
export const saldoCaixa = (
  movs: MovimentoCaixa[],
  aberturas: number
): number =>
  aberturas +
  receitaBruta(movs) -
  totalDespesas(movs) -
  totalSangrias(movs);
