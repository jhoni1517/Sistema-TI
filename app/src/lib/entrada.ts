import { centavos } from "./pdv";
import { txt } from "./format";
import type { Produto } from "./types";

/**
 * Entrada de mercadoria: a nota do fornecedor virando estoque.
 *
 * Hoje repor estoque é abrir produto por produto, somar a quantidade na mão
 * e ajustar o custo de cabeça. Com uma nota de trinta itens isso é meia hora
 * e pelo menos um erro — e o erro mais comum é o pior: **esquecer de
 * atualizar o custo**. O produto continua com o custo de seis meses atrás, o
 * relatório mostra uma margem que não existe, e a loja acha que está ganhando
 * onde está empatando.
 *
 * Duas regras que a conta precisa respeitar:
 *
 * 1. **Custo é média ponderada.** Sobraram 10 peças a R$ 20 e chegaram 10 a
 *    R$ 30: o custo passa a ser R$ 25, não R$ 30. Trocar pelo custo novo
 *    reprecificaria o que já estava na prateleira e inventaria prejuízo (ou
 *    lucro) que não existiu.
 * 2. **Frete e desconto da nota entram no custo.** Rateados pelo valor de
 *    cada item, que é como o contador faz. Frete fora do custo é margem
 *    fantasma: ele foi pago do mesmo jeito.
 */

const n = (v?: number | null): number => Number(v) || 0;

export interface ItemEntrada {
  produtoId: string;
  /** Só para a tela mostrar; a gravação usa o produtoId */
  descricao: string;
  quantidade: number;
  /** Custo unitário na nota, antes do rateio de frete e desconto */
  custoUnit: number;
}

export interface Entrada {
  itens: ItemEntrada[];
  /** Frete pago na nota. Entra no custo. */
  frete?: number;
  /** Desconto dado pelo fornecedor. Sai do custo. */
  desconto?: number;
}

/** Valor da mercadoria, sem frete nem desconto */
export const totalMercadoria = (e: Entrada): number =>
  centavos(
    (e.itens || []).reduce((s, i) => s + centavos(n(i.quantidade) * n(i.custoUnit)), 0)
  );

/** O que realmente saiu do caixa por causa desta nota */
export const totalDaEntrada = (e: Entrada): number =>
  centavos(Math.max(0, totalMercadoria(e) + n(e.frete) - n(e.desconto)));

/**
 * Custo unitário de cada item já com o rateio de frete e desconto.
 *
 * O rateio é pelo VALOR do item, não pela quantidade: mil parafusos e uma
 * placa-mãe não dividem o frete meio a meio, e ratear por quantidade jogaria
 * quase todo o frete nos parafusos.
 */
export function custoRateado(e: Entrada): Record<string, number> {
  const base = totalMercadoria(e);
  const ajuste = n(e.frete) - n(e.desconto);
  const out: Record<string, number> = {};

  for (const i of e.itens || []) {
    const qtd = n(i.quantidade);
    if (qtd <= 0) continue;
    const valor = centavos(qtd * n(i.custoUnit));
    // Sem base não há como ratear proporcionalmente (nota só de frete, ou
    // itens a custo zero): divide igual entre os itens.
    const fatia =
      base > 0 ? valor / base : 1 / Math.max(1, (e.itens || []).filter((x) => n(x.quantidade) > 0).length);
    out[i.produtoId] = centavos(Math.max(0, (valor + ajuste * fatia) / qtd));
  }
  return out;
}

/**
 * Custo médio ponderado depois da entrada.
 *
 * Sobraram 10 a R$ 20 e chegaram 10 a R$ 30 → R$ 25. Estoque negativo (venda
 * lançada antes da compra) conta como zero: usar o negativo inverteria a
 * média e produziria um custo maior que o da própria nota.
 */
export function custoMedio(
  estoqueAtual: number,
  custoAtual: number,
  quantidadeNova: number,
  custoNovo: number
): number {
  const q0 = Math.max(0, n(estoqueAtual));
  const q1 = Math.max(0, n(quantidadeNova));
  if (q1 <= 0) return centavos(n(custoAtual));
  if (q0 <= 0) return centavos(n(custoNovo));
  return centavos((q0 * n(custoAtual) + q1 * n(custoNovo)) / (q0 + q1));
}

/** O produto já com quantidade somada e custo médio recalculado */
export function aplicarEntrada(
  produto: Produto,
  quantidade: number,
  custoUnitFinal: number
): Produto {
  return {
    ...produto,
    quantidade: centavos(n(produto.quantidade) + n(quantidade)),
    custo: custoMedio(produto.quantidade, produto.custo, quantidade, custoUnitFinal),
  };
}

/**
 * O que impede de lançar a entrada, em português. Vazio = pode gravar.
 */
export function problemaNaEntrada(e: Entrada, produtos: Produto[]): string {
  const validos = (e.itens || []).filter((i) => n(i.quantidade) > 0);
  if (validos.length === 0) return "Nenhum item com quantidade.";

  for (const i of validos) {
    if (!produtos.some((p) => p.id === i.produtoId)) {
      return `"${txt(i.descricao) || "item"}" não está cadastrado no estoque.`;
    }
    if (n(i.custoUnit) < 0) return "Custo negativo num dos itens.";
  }
  if (n(e.frete) < 0) return "Frete negativo.";
  if (n(e.desconto) > totalMercadoria(e) + n(e.frete)) {
    return "O desconto é maior que o valor da nota.";
  }
  return "";
}

/**
 * Quanto a margem de cada item muda com o custo novo.
 *
 * É o aviso que faltava: fornecedor subiu o preço, o custo sobe, e o preço
 * de venda continua o mesmo. A loja só descobre no relatório do mês
 * seguinte, depois de vender o lote inteiro apertado.
 */
export interface AvisoMargem {
  produtoId: string;
  nome: string;
  custoAntes: number;
  custoDepois: number;
  preco: number;
  /** Margem em % sobre o preço de venda, depois do custo novo */
  margemDepois: number;
  /** O preço de venda ficou abaixo do custo novo? */
  noPrejuizo: boolean;
}

export function avisosDeMargem(
  e: Entrada,
  produtos: Produto[],
  margemMinima = 10
): AvisoMargem[] {
  const rateado = custoRateado(e);
  const out: AvisoMargem[] = [];

  for (const i of e.itens || []) {
    const p = produtos.find((x) => x.id === i.produtoId);
    if (!p || n(i.quantidade) <= 0) continue;
    const depois = custoMedio(p.quantidade, p.custo, i.quantidade, rateado[i.produtoId] ?? i.custoUnit);
    const preco = n(p.preco);
    const margem = preco > 0 ? ((preco - depois) / preco) * 100 : -100;
    if (depois <= n(p.custo) || margem >= margemMinima) continue;
    out.push({
      produtoId: p.id,
      nome: txt(p.nome),
      custoAntes: centavos(n(p.custo)),
      custoDepois: depois,
      preco,
      margemDepois: Math.round(margem * 10) / 10,
      noPrejuizo: preco > 0 && depois >= preco,
    });
  }
  return out.sort((a, b) => a.margemDepois - b.margemDepois);
}
