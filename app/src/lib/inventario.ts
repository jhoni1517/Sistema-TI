import { centavos } from "./pdv";
import { txt } from "./format";
import type { Produto } from "./types";

/**
 * Contagem de estoque: comparar o que o sistema acha com o que existe.
 *
 * Todo estoque descola da realidade — quebra, furto, venda lançada errada,
 * item que saiu para amostra e não voltou. Sem contagem, o descolamento só
 * aparece quando falta mercadoria na hora da venda, e aí já é tarde.
 *
 * Duas coisas que a tela precisa deixar claras e a conta garante:
 *
 * 1. **Contado zero é diferente de não contado.** Sem essa distinção, abrir
 *    a contagem e salvar zeraria o estoque inteiro de tudo que não foi
 *    conferido naquele dia. É o tipo de acidente que não tem desfazer.
 * 2. **A diferença tem preço.** "Faltam 3 unidades" não move ninguém;
 *    "faltam R$ 240 em mercadoria" move.
 */

const n = (v?: number | null): number => Number(v) || 0;

/** Produto -> quantidade contada na prateleira. Ausente = não contado. */
export type Contagem = Record<string, number>;

export interface LinhaInventario {
  produtoId: string;
  nome: string;
  sistema: number;
  contado: number;
  /** contado - sistema. Negativo = falta mercadoria. */
  diferenca: number;
  /** Diferença em dinheiro, a custo */
  valor: number;
}

export interface ResumoInventario {
  linhas: LinhaInventario[];
  /** Quantos itens foram conferidos */
  conferidos: number;
  /** Quantos ainda faltam conferir */
  pendentes: number;
  /** Só os que não bateram */
  divergentes: LinhaInventario[];
  /** Dinheiro que sumiu (negativo) ou apareceu (positivo) */
  saldo: number;
  /** Quanto sumiu, em valor absoluto — é o número que dói */
  faltando: number;
  sobrando: number;
}

/**
 * Compara a contagem com o sistema.
 *
 * Serviço fica de fora: não tem prateleira para contar.
 */
export function conferirInventario(
  produtos: Produto[],
  contagem: Contagem
): ResumoInventario {
  const fisicos = produtos.filter((p) => !p.servico);
  const linhas: LinhaInventario[] = [];

  for (const p of fisicos) {
    // A chave PRECISA ser testada por presença, não por valor: contado zero
    // é uma informação ("não tem nenhum na prateleira"), e tratá-lo como
    // "não contado" esconderia justamente o item que sumiu inteiro.
    if (!(p.id in contagem)) continue;
    const contado = n(contagem[p.id]);
    const sistema = n(p.quantidade);
    const diferenca = centavos(contado - sistema);
    linhas.push({
      produtoId: p.id,
      nome: txt(p.nome),
      sistema,
      contado,
      diferenca,
      valor: centavos(diferenca * n(p.custo)),
    });
  }

  const divergentes = linhas
    .filter((l) => Math.abs(l.diferenca) > 0.0001)
    .sort((a, b) => a.valor - b.valor);

  const faltando = centavos(
    divergentes.filter((l) => l.valor < 0).reduce((s, l) => s + Math.abs(l.valor), 0)
  );
  const sobrando = centavos(
    divergentes.filter((l) => l.valor > 0).reduce((s, l) => s + l.valor, 0)
  );

  return {
    linhas,
    conferidos: linhas.length,
    pendentes: fisicos.length - linhas.length,
    divergentes,
    saldo: centavos(sobrando - faltando),
    faltando,
    sobrando,
  };
}

/**
 * Os produtos com a quantidade corrigida, prontos para gravar.
 *
 * Só o que foi contado E divergiu: regravar o que já estava certo gera
 * escrita à toa no banco e, com assinatura vencida, um monte de erro de
 * gravação por nada.
 */
export function ajustesDoInventario(
  produtos: Produto[],
  contagem: Contagem
): Produto[] {
  const resumo = conferirInventario(produtos, contagem);
  const porId = new Map(produtos.map((p) => [p.id, p]));
  return resumo.divergentes
    .map((l) => {
      const p = porId.get(l.produtoId);
      return p ? { ...p, quantidade: l.contado } : null;
    })
    .filter((p): p is Produto => p !== null);
}

/**
 * Descrição do ajuste para o lançamento no caixa.
 *
 * A perda de inventário é despesa do mês, não compra de estoque: a
 * mercadoria não vai voltar. Contar como compra esconderia o buraco dentro
 * de um número que o dono já espera ver grande.
 */
export const descricaoDoAjuste = (r: ResumoInventario): string =>
  `Ajuste de inventário: ${r.divergentes.length} item(ns), ` +
  `${r.faltando > 0 ? `falta ${r.faltando.toFixed(2)}` : "sem falta"}` +
  `${r.sobrando > 0 ? `, sobra ${r.sobrando.toFixed(2)}` : ""}`;
