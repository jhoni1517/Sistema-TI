import { soData } from "./contas";
import { pecasEfetivas } from "./orcamento";
import { txt } from "./format";
import type { ItemVenda, OrdemServico, Venda } from "./types";

/**
 * Tudo que saiu da prateleira, venha de onde vier.
 *
 * O giro, a curva ABC, a lista de parados e a sugestão de compra olhavam
 * SÓ as vendas do PDV. Numa mercearia isso é o mundo inteiro. Numa
 * assistência técnica — que é o nicho em que este sistema nasceu — peça
 * não sai por venda, sai por ORDEM DE SERVIÇO.
 *
 * O resultado era pior do que "não funciona", porque não parecia quebrado:
 *
 * - A sugestão de compra nunca sugeria nada. Ela pula tudo que girou zero,
 *   e para a assistência tudo girava zero.
 * - A curva ABC vinha vazia: sem faturamento, não há curva.
 * - E os parados listavam o estoque INTEIRO, com o valor de tudo somado em
 *   "capital parado" — a tela dizia ao dono que cada peça da loja era
 *   dinheiro morto, no mesmo mês em que ele trocou trinta telas.
 *
 * Contar as duas fontes num lugar só é o que impede as quatro contas de
 * divergirem no dia em que alguém arrumar uma delas.
 */

const n = (v?: number | null): number => Number(v) || 0;

export interface SaidaDeEstoque {
  produtoId?: string;
  descricao?: string;
  quantidade: number;
  precoUnit: number;
  custoUnit: number;
  /** AAAA-MM-DD do dia em que a mercadoria saiu */
  dia: string;
  /** Documento de origem, para contar saídas diferentes sem somar linhas */
  documento: string;
}

const daVenda = (v: Venda, i: ItemVenda): SaidaDeEstoque => ({
  produtoId: i.produtoId,
  descricao: i.descricao,
  quantidade: n(i.quantidade),
  precoUnit: n(i.precoUnit),
  custoUnit: n(i.custoUnit),
  dia: soData(v.criadoEm),
  documento: `v:${v.id}`,
});

/**
 * Saídas de mercadoria no período, das vendas e das ordens de serviço.
 *
 * Da OS entram só as **entregues**: enquanto o aparelho está na bancada, a
 * peça pode voltar para a prateleira, e contar antes da entrega inventaria
 * consumo que ainda não aconteceu. É a mesma hora em que a baixa acontece
 * de verdade.
 *
 * E só as peças do orçamento ESCOLHIDO. Somar a fonte de 500W e a de 200W
 * pediria reposição das duas — a loja compraria uma peça que ninguém levou.
 */
export function saidasDeEstoque(
  vendas: Venda[],
  ordens: OrdemServico[] = []
): SaidaDeEstoque[] {
  const out: SaidaDeEstoque[] = [];

  for (const v of vendas || []) {
    for (const i of v.itens || []) out.push(daVenda(v, i));
  }

  for (const o of ordens || []) {
    if (o.status !== "entregue") continue;
    // A entrega é quando a peça sai. Sem a data, cai na última mexida na
    // OS, que é o mais perto disso que existe.
    const dia = soData(o.entregueEm) || soData(o.atualizadoEm) || soData(o.criadoEm);
    for (const p of pecasEfetivas(o)) {
      out.push({
        produtoId: p.produtoId,
        descricao: txt(p.descricao),
        quantidade: n(p.quantidade),
        precoUnit: n(p.precoUnit),
        custoUnit: n(p.custoUnit),
        dia,
        documento: `o:${o.id}`,
      });
    }
  }

  return out;
}
