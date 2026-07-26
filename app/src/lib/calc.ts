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
