import type { OrdemServico, MovimentoCaixa, Fiado } from "./types";

/** Número seguro: a nuvem devolve nulo em coluna vazia */
const n = (v?: number | null): number => (Number(v) || 0);

export const totalPecas = (o: OrdemServico): number =>
  (o.pecas || []).reduce((s, p) => s + n(p.precoUnit) * n(p.quantidade), 0);

export const custoPecas = (o: OrdemServico): number =>
  (o.pecas || []).reduce((s, p) => s + n(p.custoUnit) * n(p.quantidade), 0);

export const totalOS = (o: OrdemServico): number =>
  totalPecas(o) + n(o.maoDeObra) - n(o.desconto);

export const lucroOS = (o: OrdemServico): number =>
  totalOS(o) - custoPecas(o);

/** Receita bruta = todas as entradas (não sangria/saída) */
export const receitaBruta = (movs: MovimentoCaixa[]): number =>
  movs.filter((m) => m.tipo === "entrada").reduce((s, m) => s + n(m.valor), 0);

/** Categorias que representam reposição de estoque, não despesa do mês */
const CATEGORIAS_ESTOQUE = ["compra de peça", "compra de peca", "fornecedor"];

/**
 * A saída é compra de estoque?
 * Lançamentos antigos não têm a marcação, então a categoria decide — assim
 * o histórico já existente também passa a ser calculado direito.
 */
export const ehCompraEstoque = (m: MovimentoCaixa): boolean =>
  m.tipo === "saida" &&
  (m.compraEstoque === true ||
    (m.compraEstoque === undefined &&
      CATEGORIAS_ESTOQUE.includes((m.categoria || "").trim().toLowerCase())));

/** Despesas = todas as saídas. É o que realmente sai do caixa. */
export const totalDespesas = (movs: MovimentoCaixa[]): number =>
  movs.filter((m) => m.tipo === "saida").reduce((s, m) => s + n(m.valor), 0);

/**
 * Despesas que pesam no RESULTADO: aluguel, energia, salário...
 * Compra de peça fica de fora porque o custo dela entra no resultado quando
 * a peça é vendida. Contar nos dois lugares descontava a mesma peça duas
 * vezes e chegava a mostrar prejuízo em serviço lucrativo.
 */
export const despesasOperacionais = (movs: MovimentoCaixa[]): number =>
  movs
    .filter((m) => m.tipo === "saida" && !ehCompraEstoque(m))
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
