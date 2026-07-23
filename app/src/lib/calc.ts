import type { OrdemServico, MovimentoCaixa, Fiado } from "./types";

export const totalPecas = (o: OrdemServico): number =>
  o.pecas.reduce((s, p) => s + p.precoUnit * p.quantidade, 0);

export const custoPecas = (o: OrdemServico): number =>
  o.pecas.reduce((s, p) => s + p.custoUnit * p.quantidade, 0);

export const totalOS = (o: OrdemServico): number =>
  totalPecas(o) + (o.maoDeObra || 0) - (o.desconto || 0);

export const lucroOS = (o: OrdemServico): number =>
  totalOS(o) - custoPecas(o);

/** Receita bruta = todas as entradas (não sangria/saída) */
export const receitaBruta = (movs: MovimentoCaixa[]): number =>
  movs.filter((m) => m.tipo === "entrada").reduce((s, m) => s + m.valor, 0);

/** Despesas = saídas (não inclui sangria, que é retirada de dinheiro) */
export const totalDespesas = (movs: MovimentoCaixa[]): number =>
  movs.filter((m) => m.tipo === "saida").reduce((s, m) => s + m.valor, 0);

export const totalSangrias = (movs: MovimentoCaixa[]): number =>
  movs.filter((m) => m.tipo === "sangria").reduce((s, m) => s + m.valor, 0);

/** Custo de produtos/peças embutido nas entradas */
export const custoProdutos = (movs: MovimentoCaixa[]): number =>
  movs.reduce((s, m) => s + (m.custoRelacionado || 0), 0);

/** Lucro líquido = receita - custo dos produtos - despesas */
export const lucroLiquido = (movs: MovimentoCaixa[]): number =>
  receitaBruta(movs) - custoProdutos(movs) - totalDespesas(movs);

/** Total já pago de um fiado */
export const pagoFiado = (f: Fiado): number =>
  f.pagamentos.reduce((s, p) => s + p.valor, 0);

/** Saldo devedor de um fiado */
export const saldoFiado = (f: Fiado): number =>
  Math.max(0, f.valor - pagoFiado(f));

/** Saldo em caixa considerando abertura */
export const saldoCaixa = (
  movs: MovimentoCaixa[],
  aberturas: number
): number =>
  aberturas +
  receitaBruta(movs) -
  totalDespesas(movs) -
  totalSangrias(movs);
