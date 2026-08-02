import { hojeISO, soData, diasAteVencer } from "./contas";
import { saidasDeEstoque, type SaidaDeEstoque } from "./consumo";
import type { Produto, Venda, OrdemServico } from "./types";

/**
 * O que vale a pena repor, e o que está só ocupando prateleira.
 *
 * A tela de estoque respondia "quanto eu tenho". Não respondia a pergunta
 * que decide o dinheiro do mês: **o que eu paro de comprar?** Numa loja de
 * bairro o capital é curto, e cada item parado é dinheiro que já foi gasto e
 * não voltou.
 *
 * Duas listas, com uma conta cada:
 *
 * - **Curva ABC**: os poucos itens que fazem a maior parte do faturamento.
 *   Faltar um item A é perder venda; faltar um item C não muda o mês.
 * - **Parados**: o que não vende há tempo. É onde a promoção com prazo entra
 *   antes de o produto vencer ou virar prejuízo puro.
 */

const n = (v?: number | null): number => Number(v) || 0;

/**
 * Dias corridos entre duas datas puras.
 *
 * Reaproveita a conta do contas.ts, que é em UTC de propósito: somar hora
 * local desloca o dia inteiro conforme o fuso, e isso já aconteceu aqui.
 */
const diasDesdeData = (de: string, ate: string): number => -diasAteVencer(de, ate);

export interface GiroProduto {
  produtoId: string;
  nome: string;
  /** Unidades (ou quilos) vendidas no período */
  quantidade: number;
  /** Faturamento gerado */
  receita: number;
  /** Lucro depois do custo da mercadoria */
  lucro: number;
  /** Quantas vendas diferentes levaram este item */
  vendas: number;
  /** Data da última saída, ou vazio se nunca saiu */
  ultimaVenda: string;
  /** Dias desde a última saída. Nunca vendido = dias desde o cadastro. */
  diasParado: number;
  /** Dinheiro parado na prateleira agora */
  valorEmEstoque: number;
}

/** Casa a saída com o produto: por id, e pelo nome quando falta id */
const chaveDaSaida = (i: SaidaDeEstoque): string =>
  i.produtoId || `nome:${(i.descricao || "").trim().toLowerCase()}`;

const chaveDoProduto = (p: Produto): string[] => [
  p.id,
  `nome:${(p.nome || "").trim().toLowerCase()}`,
];

/**
 * Giro de cada produto no período.
 *
 * Serviço fica de fora: não tem prateleira, não empata capital e apareceria
 * eternamente como "parado" só por não ter estoque.
 *
 * `ordens` não é enfeite: na assistência técnica a peça sai por OS, não por
 * venda. Sem elas, a curva ABC vinha vazia e o estoque INTEIRO era listado
 * como capital parado, no mesmo mês em que a loja trocou trinta telas.
 */
export function giroDosProdutos(
  produtos: Produto[],
  vendas: Venda[],
  hoje = hojeISO(),
  ordens: OrdemServico[] = []
): GiroProduto[] {
  const somas = new Map<
    string,
    { quantidade: number; receita: number; lucro: number; vendas: number; ultima: string }
  >();

  for (const saida of saidasDeEstoque(vendas, ordens)) {
    const chave = chaveDaSaida(saida);
    const atual = somas.get(chave) || {
      quantidade: 0,
      receita: 0,
      lucro: 0,
      vendas: 0,
      ultima: "",
    };
    const q = n(saida.quantidade);
    const receita = q * n(saida.precoUnit);
    atual.quantidade += q;
    atual.receita += receita;
    atual.lucro += receita - q * n(saida.custoUnit);
    atual.vendas += 1;
    if (saida.dia > atual.ultima) atual.ultima = saida.dia;
    somas.set(chave, atual);
  }

  return produtos
    .filter((p) => !p.servico)
    .map((p) => {
      const achado = chaveDoProduto(p)
        .map((k) => somas.get(k))
        .find(Boolean);
      const ultimaVenda = achado?.ultima || "";
      const base = ultimaVenda || soData(p.criadoEm) || hoje;
      return {
        produtoId: p.id,
        nome: p.nome,
        quantidade: achado?.quantidade || 0,
        receita: achado?.receita || 0,
        lucro: achado?.lucro || 0,
        vendas: achado?.vendas || 0,
        ultimaVenda,
        diasParado: Math.max(0, diasDesdeData(base, hoje)),
        valorEmEstoque: n(p.custo) * n(p.quantidade),
      };
    });
}

export type Classe = "A" | "B" | "C";

export interface ItemABC extends GiroProduto {
  classe: Classe;
  /** Fatia deste item no faturamento, de 0 a 1 */
  fatia: number;
  /** Fatia acumulada até aqui */
  acumulado: number;
}

/**
 * Curva ABC pelo faturamento.
 *
 * A até 80% do faturamento acumulado, B até 95%, C o resto. É a régua que
 * todo sistema de estoque usa, e ela serve porque quase sempre uns poucos
 * itens carregam o mês.
 *
 * O item que ENTRA no acumulado ainda pertence à classe daquela faixa: sem
 * isso o produto que sozinho cruza os 80% cairia em B, e ele é justamente o
 * que não pode faltar.
 */
export function curvaABC(giro: GiroProduto[]): ItemABC[] {
  const vendidos = giro.filter((g) => g.receita > 0).sort((a, b) => b.receita - a.receita);
  const total = vendidos.reduce((s, g) => s + g.receita, 0);

  // Sem venda nenhuma no período não existe curva: classificar tudo como A
  // (ou tudo como C) seria inventar informação.
  if (total <= 0) return [];

  let acumulado = 0;
  return vendidos.map((g) => {
    const anterior = acumulado;
    const fatia = g.receita / total;
    acumulado += fatia;
    const classe: Classe = anterior < 0.8 ? "A" : anterior < 0.95 ? "B" : "C";
    return { ...g, classe, fatia, acumulado };
  });
}

/**
 * O que está parado há tempo demais, do mais parado para o menos.
 *
 * Só entra o que tem estoque: item zerado e sem venda não ocupa prateleira
 * nem dinheiro, e listá-lo só faria a tela pedir atenção à toa.
 */
export function produtosParados(
  giro: GiroProduto[],
  produtos: Produto[],
  diasLimite = 60
): GiroProduto[] {
  const temEstoque = new Set(
    produtos.filter((p) => !p.servico && n(p.quantidade) > 0).map((p) => p.id)
  );
  return giro
    .filter((g) => temEstoque.has(g.produtoId) && g.diasParado >= diasLimite)
    .sort((a, b) => b.valorEmEstoque - a.valorEmEstoque || b.diasParado - a.diasParado);
}

/** Quanto dinheiro está preso no que não gira */
export const capitalParado = (parados: GiroProduto[]): number =>
  parados.reduce((s, g) => s + g.valorEmEstoque, 0);
