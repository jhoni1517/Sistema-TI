import { centavos, subtotalItem } from "./pdv";
import type { FormaPagamento, ItemVenda, Venda } from "./types";

/**
 * Devolução e troca de mercadoria.
 *
 * Antes disto não existia caminho: quem devolvia um produto obrigava o
 * atendente a lançar uma sangria "devolução" na mão e a corrigir o estoque
 * por fora. Duas oportunidades de errar, e o cupom original continuava
 * dizendo que a venda inteira aconteceu.
 *
 * Três regras que a conta precisa respeitar:
 *
 * 1. **O desconto volta na proporção.** Numa venda de R$ 100 com R$ 10 de
 *    desconto, quem devolve metade recebe R$ 45, não R$ 50 — senão devolver
 *    item por item devolveria mais dinheiro do que entrou.
 * 2. **Não se devolve mais do que foi comprado.** Nem duas vezes o mesmo
 *    item: a soma das devoluções anteriores entra na conta.
 * 3. **O custo volta junto.** Sem isso a mercadoria voltava para a
 *    prateleira e o CMV continuava contando a venda que foi desfeita.
 */

const n = (v?: number | null): number => Number(v) || 0;

/** Quanto de cada item está sendo devolvido, pelo índice na venda */
export type Devolvidos = Record<number, number>;

export interface ResumoDevolucao {
  /** Dinheiro a devolver, já com o desconto proporcional aplicado */
  valor: number;
  /** Custo das mercadorias que voltam ao estoque (estorna o CMV) */
  custo: number;
  /** Itens que voltam, para repor o estoque */
  itens: ItemVenda[];
  /** Quanto da venda está sendo devolvido, de 0 a 1 */
  proporcao: number;
  /** Devolveu tudo? Muda o texto do comprovante. */
  total: boolean;
}

/** Quanto já foi devolvido desta venda, item por item */
export function jaDevolvido(venda: Venda): Devolvidos {
  const soma: Devolvidos = {};
  for (const d of venda.devolucoes || []) {
    for (const [i, q] of Object.entries(d.itens || {})) {
      soma[Number(i)] = (soma[Number(i)] || 0) + n(q);
    }
  }
  return soma;
}

/** Quanto ainda pode ser devolvido de cada item */
export function disponivelParaDevolver(venda: Venda): number[] {
  const feito = jaDevolvido(venda);
  return (venda.itens || []).map((item, i) =>
    Math.max(0, centavos(n(item.quantidade) - n(feito[i])))
  );
}

/** Sobrou alguma coisa desta venda para devolver? */
export const podeDevolver = (venda: Venda): boolean =>
  disponivelParaDevolver(venda).some((q) => q > 0);

/**
 * Recusa em português, ou vazio quando a devolução pode ser feita.
 *
 * Devolver mais do que foi vendido tira dinheiro do caixa por um item que
 * nunca saiu — e o furo só aparece na conferência da gaveta.
 */
export function problemaNaDevolucao(venda: Venda, escolha: Devolvidos): string {
  const disponivel = disponivelParaDevolver(venda);
  const itens = venda.itens || [];

  let algum = false;
  for (const [chave, quantidade] of Object.entries(escolha)) {
    const i = Number(chave);
    const q = n(quantidade);
    if (q <= 0) continue;
    algum = true;
    if (!itens[i]) return "Item que não existe nesta venda.";
    if (q > disponivel[i] + 0.0001) {
      const nome = itens[i].descricao || "item";
      return disponivel[i] <= 0
        ? `"${nome}" já foi devolvido por inteiro.`
        : `De "${nome}" só restam ${disponivel[i]} para devolver.`;
    }
  }
  if (!algum) return "Escolha o que está sendo devolvido.";
  return "";
}

/**
 * A conta da devolução.
 *
 * O desconto da venda entra proporcionalmente: quem pagou menos pelo
 * conjunto recebe menos de volta pela parte.
 */
export function calcularDevolucao(venda: Venda, escolha: Devolvidos): ResumoDevolucao {
  const itens = venda.itens || [];

  const devolvidos: ItemVenda[] = [];
  let bruto = 0;
  let custo = 0;

  for (const [chave, quantidade] of Object.entries(escolha)) {
    const i = Number(chave);
    const q = n(quantidade);
    const item = itens[i];
    if (!item || q <= 0) continue;
    const parte: ItemVenda = { ...item, quantidade: q };
    devolvidos.push(parte);
    bruto += subtotalItem(parte);
    custo += centavos(q * n(item.custoUnit));
  }

  const brutoVenda = itens.reduce((s, i) => s + subtotalItem(i), 0);
  const proporcao = brutoVenda > 0 ? bruto / brutoVenda : 0;
  const descontoProporcional = centavos(Math.max(0, n(venda.desconto)) * proporcao);

  // Nunca negativo: um desconto maior que a parte devolvida faria o cliente
  // pagar para devolver.
  const valor = centavos(Math.max(0, centavos(bruto) - descontoProporcional));

  // Devolveu tudo o que ainda podia? Compara com o que sobrava, não com a
  // venda original: a segunda devolução parcial também fecha a venda.
  const restante = disponivelParaDevolver(venda);
  const fechou = restante.every((disponivel, i) => n(escolha[i]) >= disponivel - 0.0001);

  return {
    valor,
    custo: centavos(custo),
    itens: devolvidos,
    proporcao,
    total: fechou,
  };
}

/** Descrição do lançamento no caixa — é o que o dono lê no fechamento */
export const descricaoDaDevolucao = (venda: Venda, resumo: ResumoDevolucao): string =>
  `Devolução ${resumo.total ? "total" : "parcial"} da venda ${venda.numero}`;

/* ------------------------------------------------------------------ */
/* Por onde o dinheiro volta                                           */
/* ------------------------------------------------------------------ */

export interface FormaDevolvida {
  forma: FormaPagamento;
  valor: number;
}

/**
 * Como repartir o valor devolvido entre as formas em que a venda foi paga.
 *
 * A venda dividida já grava um lançamento POR FORMA — é isso que faz o
 * fechamento separar o que está na gaveta do que caiu na maquininha. A
 * devolução não fazia: ela lançava tudo pela forma PRINCIPAL da venda.
 *
 * Numa venda de R$ 200 com R$ 190 no crédito e R$ 10 em espécie, devolver
 * tudo lançava R$ 200 de saída no crédito. O caixa passa a dizer que a
 * maquininha estornou R$ 200 quando estornou R$ 190, e os R$ 10 que saíram
 * da gaveta de verdade não saem de lugar nenhum — falta de R$ 10 no papel,
 * todo dia em que alguém devolve uma compra dividida.
 *
 * A proporção é a única repartição que não precisa de decisão do atendente
 * com fila esperando, e é a que sobrevive a duas devoluções parciais: a
 * soma delas nunca estoura o que cada forma pagou.
 */
export function formasDaDevolucao(venda: Venda, valor: number): FormaDevolvida[] {
  const pagos = (venda.pagamentos || []).filter((p) => n(p.valor) > 0);
  const total = centavos(pagos.reduce((s, p) => s + n(p.valor), 0));

  // Venda de uma forma só (a esmagadora maioria) ou venda antiga, gravada
  // antes de existir pagamento dividido: continua com um lançamento.
  if (pagos.length < 2 || total <= 0 || n(valor) <= 0) {
    return [{ forma: venda.formaPagamento, valor: centavos(Math.max(0, n(valor))) }];
  }

  const alvo = centavos(n(valor));
  const partes = pagos.map((p) => ({
    forma: p.forma,
    valor: centavos((alvo * n(p.valor)) / total),
  }));

  /*
   * O centavo que sobra do arredondamento vai para quem mais pagou.
   *
   * Sem isto, devolver R$ 10 de uma venda paga em três formas iguais lança
   * R$ 9,99 no caixa: a saída não bate com a nota que saiu da gaveta, e a
   * diferença de um centavo aparece na conferência sem origem.
   */
  const sobra = centavos(alvo - partes.reduce((s, p) => s + p.valor, 0));
  if (sobra !== 0) {
    // Quem mais PAGOU, não quem tem a maior fatia arredondada: as fatias
    // empatam justamente no caso que gera sobra, e aí o centavo cairia na
    // primeira linha da lista, que não quer dizer nada.
    let maior = 0;
    for (let i = 1; i < pagos.length; i++) {
      if (n(pagos[i].valor) > n(pagos[maior].valor)) maior = i;
    }
    partes[maior].valor = centavos(partes[maior].valor + sobra);
  }

  return partes;
}
