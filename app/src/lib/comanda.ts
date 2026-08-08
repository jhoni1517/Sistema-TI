import { centavos } from "./pdv";
import { txt, normalizar } from "./format";
import type { ItemComanda, Comanda, PreparoItem } from "./types";

/**
 * Comanda de mesa.
 *
 * É um pedido que fica ABERTO e vai recebendo item ao longo do tempo — a
 * mesa 5 pede duas cervejas, meia hora depois pede a pizza, e só no fim
 * tudo vira uma venda só.
 *
 * Por que não reaproveitar a venda do PDV: a venda do balcão nasce e morre
 * no mesmo minuto, com o cliente na frente. A comanda vive uma hora, muda
 * de mão entre garçons e precisa dizer à cozinha o que já saiu e o que
 * falta. É o mesmo desenho de estado da OS, não o do caixa.
 *
 * ---------------------------------------------------------------------
 * A COMANDA NÃO É DINHEIRO ATÉ SER FECHADA.
 *
 * Nada entra no caixa enquanto ela está aberta, e nada baixa do estoque.
 * Fechar é que gera a venda e o movimento — e ali vale a regra de sempre,
 * dinheiro primeiro. Lançar no caixa a cada item faria o fechamento do dia
 * contar a mesa 5 seis vezes, e cancelar um item viraria estorno.
 * ---------------------------------------------------------------------
 */

/** Em que pé está o preparo de um item, para a cozinha */
export const PREPARO_META: Record<
  PreparoItem,
  { label: string; cor: string; ordem: number }
> = {
  pendente: { label: "Na fila", cor: "bg-slate-100 text-slate-700", ordem: 0 },
  preparando: { label: "Preparando", cor: "bg-amber-100 text-amber-700", ordem: 1 },
  pronto: { label: "Pronto", cor: "bg-emerald-100 text-emerald-700", ordem: 2 },
  entregue: { label: "Entregue", cor: "bg-slate-100 text-slate-500", ordem: 3 },
};

export const preparoDe = (p?: string | null): PreparoItem =>
  p === "preparando" || p === "pronto" || p === "entregue" ? p : "pendente";

/** Quanto custa uma linha da comanda */
export const subtotalDoItem = (i: ItemComanda): number =>
  centavos((Number(i.quantidade) || 0) * (Number(i.precoUnit) || 0));

/**
 * Quanto a mesa deve.
 *
 * Item cancelado não entra: ele fica na comanda de propósito, para a
 * cozinha saber que aquilo foi pedido e desfeito, mas ninguém paga por
 * comida que não saiu.
 */
export const totalComanda = (c: Comanda): number =>
  centavos(
    (c?.itens || [])
      .filter((i) => !i.cancelado)
      .reduce((s, i) => s + subtotalDoItem(i), 0)
  );

/** Quantos itens contam para a conta */
export const quantosItens = (c: Comanda): number =>
  (c?.itens || []).filter((i) => !i.cancelado).length;

/**
 * Há quantos minutos este item está esperando.
 *
 * A cozinha decide o que fazer primeiro pelo tempo de espera, não pela
 * ordem em que a tela desenhou. Item pronto para de contar: o relógio é da
 * COZINHA, e depois de pronto a demora é do salão.
 */
export function minutosEsperando(i: ItemComanda, agora = new Date()): number {
  const inicio = new Date(txt(i.pedidoEm)).getTime();
  if (!Number.isFinite(inicio)) return 0;
  const fim =
    preparoDe(i.preparo) === "pendente" || preparoDe(i.preparo) === "preparando"
      ? agora.getTime()
      : new Date(txt(i.prontoEm) || txt(i.pedidoEm)).getTime();
  if (!Number.isFinite(fim)) return 0;
  return Math.max(0, Math.floor((fim - inicio) / 60000));
}

/**
 * A comanda pode ser fechada?
 *
 * Devolve o motivo em texto, vazio quando pode. Motivo em texto e não um
 * booleano porque quem está no salão precisa saber O QUE fazer para poder
 * fechar — "não pode fechar" sozinho manda a pessoa adivinhar.
 */
export function problemaParaFechar(c: Comanda): string {
  if (!c) return "Comanda não encontrada.";
  if (c.status === "fechada") return "Esta comanda já foi fechada.";
  if (c.status === "cancelada") return "Esta comanda foi cancelada.";
  if (quantosItens(c) === 0) {
    return "A comanda está vazia. Cancele em vez de fechar: comanda fechada com zero vira venda de R$ 0,00 no caixa.";
  }
  /*
   * Item ainda na cozinha não impede fechar, e é de propósito.
   *
   * A pessoa pede a conta, paga e vai embora enquanto a sobremesa está
   * saindo — travar o fechamento por isso prenderia o caixa numa fila que
   * não é dele. Quem cobra a cozinha é a tela da cozinha.
   */
  return "";
}

/** A comanda com o item novo dentro, já na fila da cozinha */
export function comItem(c: Comanda, item: ItemComanda): Comanda {
  return { ...c, itens: [...(c.itens || []), item] };
}

/**
 * Cancela um item SEM apagá-lo.
 *
 * Apagar a linha esconderia da cozinha que aquilo chegou a ser pedido — e
 * se ela já tinha começado, alguém precisa saber que o prato vai voltar.
 * Cancelado não soma na conta e sai da fila.
 */
export function cancelarItem(c: Comanda, itemId: string, motivo = ""): Comanda {
  return {
    ...c,
    itens: (c.itens || []).map((i) =>
      i.id === itemId ? { ...i, cancelado: true, motivoCancelamento: motivo } : i
    ),
  };
}

/** Muda a etapa de preparo de um item */
export function comPreparo(
  c: Comanda,
  itemId: string,
  preparo: PreparoItem,
  agora = new Date()
): Comanda {
  return {
    ...c,
    itens: (c.itens || []).map((i) =>
      i.id === itemId
        ? {
            ...i,
            preparo,
            // O relógio da cozinha para quando fica pronto, e não quando o
            // garçom leva: depois de pronto a demora é do salão.
            prontoEm: preparo === "pronto" ? agora.toISOString() : i.prontoEm,
          }
        : i
    ),
  };
}

/** Comandas ainda abertas, da mais antiga para a mais nova */
export const comandasAbertas = (comandas: Comanda[]): Comanda[] =>
  (comandas || [])
    .filter((c) => c.status === "aberta")
    .sort((a, b) => txt(a.abertaEm).localeCompare(txt(b.abertaEm)));

/**
 * Uma mesa só tem uma comanda aberta por vez.
 *
 * Duas comandas na mesma mesa é o jeito mais fácil de a conta sair pela
 * metade: o garçom lança na que achou primeiro e a outra fecha sozinha
 * com três itens.
 */
export const comandaDaMesa = (comandas: Comanda[], mesa: string): Comanda | undefined =>
  comandasAbertas(comandas).find(
    // Sem acento: "Salão 1" e "salao 1" são a mesma mesa. Comparando cru,
    // abre uma segunda comanda e a conta sai pela metade.
    (c) => normalizar(c.mesa) === normalizar(mesa)
  );

/**
 * A fila da cozinha: item por item, do que espera há mais tempo.
 *
 * Vem de TODAS as comandas abertas porque a cozinha não trabalha por mesa,
 * trabalha por ordem de chegada. Pronto e entregue saem da fila; cancelado
 * também, mas ele fica na comanda para o histórico.
 */
export interface ItemNaFila {
  comandaId: string;
  numero: number;
  mesa: string;
  item: ItemComanda;
  minutos: number;
}

export function filaDaCozinha(comandas: Comanda[], agora = new Date()): ItemNaFila[] {
  const fila: ItemNaFila[] = [];
  for (const c of comandasAbertas(comandas)) {
    for (const item of c.itens || []) {
      if (item.cancelado) continue;
      const p = preparoDe(item.preparo);
      if (p === "pronto" || p === "entregue") continue;
      fila.push({
        comandaId: c.id,
        numero: c.numero,
        mesa: txt(c.mesa),
        item,
        minutos: minutosEsperando(item, agora),
      });
    }
  }
  // Quem espera há mais tempo aparece em cima. Empate desempata pela mesa,
  // para a lista não dançar na tela a cada atualização.
  return fila.sort((a, b) => b.minutos - a.minutos || txt(a.mesa).localeCompare(txt(b.mesa)));
}

/**
 * A cor do atraso na tela da cozinha.
 *
 * Os limites são generosos de propósito: pizza leva 20 minutos no forno, e
 * uma tela que fica vermelha aos 10 vira uma tela toda vermelha — que não
 * diz mais nada a ninguém.
 */
export const corDaEspera = (minutos: number): string =>
  minutos >= 30
    ? "bg-red-600 text-white"
    : minutos >= 20
      ? "bg-amber-500 text-white"
      : "bg-slate-100 text-slate-700";
