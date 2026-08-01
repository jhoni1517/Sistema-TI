import { soData, hojeISO } from "./contas";
import type { Produto } from "./types";

/**
 * Promoção com data para acabar.
 *
 * Sem isto, promover era editar o preço na mão e lembrar de destrocar depois.
 * Ninguém lembra: a promoção de Natal continuava valendo em março, e a loja
 * descobria pela margem do mês, quando já tinha vendido tudo mais barato.
 *
 * A promoção não apaga o preço normal — ela convive com ele. Quando o prazo
 * termina, o preço cheio volta sozinho, sem ninguém precisar fazer nada.
 *
 * Datas em AAAA-MM-DD e comparadas como texto, que é a regra da casa: somar
 * hora local desloca o dia inteiro conforme o fuso.
 */

const n = (v?: number | null): number => Number(v) || 0;

/** A promoção deste produto está valendo hoje? */
export function promocaoValendo(p: Produto, hoje = hojeISO()): boolean {
  const preco = n(p.precoPromocional);
  // Promoção que não é mais barata não é promoção — é engano na digitação.
  if (preco <= 0 || preco >= n(p.preco)) return false;

  const inicio = soData(p.promocaoInicio);
  const fim = soData(p.promocaoFim);
  // Sem data de início vale desde já; sem data de fim vale até tirarem.
  if (inicio && hoje < inicio) return false;
  if (fim && hoje > fim) return false;
  return true;
}

/**
 * O preço que o cliente paga hoje.
 *
 * TODA tela de venda passa por aqui. Deixar uma delas lendo `produto.preco`
 * direto faria a etiqueta dizer um valor e o caixa cobrar outro — e quem
 * aparece como mentiroso é a loja, não o sistema.
 */
export const precoEfetivo = (p: Produto, hoje = hojeISO()): number =>
  promocaoValendo(p, hoje) ? n(p.precoPromocional) : n(p.preco);

/** Quanto o cliente economiza. Zero quando não há promoção valendo. */
export const descontoDaPromocao = (p: Produto, hoje = hojeISO()): number =>
  promocaoValendo(p, hoje) ? n(p.preco) - n(p.precoPromocional) : 0;

/** Quantos por cento a menos, arredondado — é o número que vai no cartaz */
export function percentualDaPromocao(p: Produto, hoje = hojeISO()): number {
  const cheio = n(p.preco);
  if (!promocaoValendo(p, hoje) || cheio <= 0) return 0;
  return Math.round((descontoDaPromocao(p, hoje) / cheio) * 100);
}

/** O que está em promoção hoje, do maior desconto para o menor */
export const emPromocao = (produtos: Produto[], hoje = hojeISO()): Produto[] =>
  produtos
    .filter((p) => promocaoValendo(p, hoje))
    .sort((a, b) => percentualDaPromocao(b, hoje) - percentualDaPromocao(a, hoje));

/**
 * Promoções que já terminaram e continuam cadastradas.
 *
 * Aparecem na tela para o dono limpar: promoção vencida pendurada no produto
 * confunde quem for editar o preço depois.
 */
export const promocoesVencidas = (produtos: Produto[], hoje = hojeISO()): Produto[] =>
  produtos.filter((p) => {
    const fim = soData(p.promocaoFim);
    return n(p.precoPromocional) > 0 && !!fim && hoje > fim;
  });

/**
 * Erro na promoção, em português, ou vazio se estiver tudo certo.
 *
 * Vale a pena barrar na hora: promoção mais cara que o preço normal só
 * aparece quando o cliente reclama no balcão.
 */
export function problemaNaPromocao(p: Produto): string {
  const preco = n(p.precoPromocional);
  if (preco <= 0) return "";
  if (preco >= n(p.preco)) {
    return "O preço promocional precisa ser MENOR que o preço normal.";
  }
  if (preco < n(p.custo)) {
    return `Atenção: ${preco.toFixed(2)} está abaixo do custo. A cada venda a loja perde dinheiro.`;
  }
  const inicio = soData(p.promocaoInicio);
  const fim = soData(p.promocaoFim);
  if (inicio && fim && fim < inicio) {
    return "A promoção termina antes de começar. Confira as datas.";
  }
  return "";
}
