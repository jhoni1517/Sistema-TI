import type { OrdemServico, PecaOS } from "./types";

/**
 * Alternativas dentro do orçamento da OS.
 *
 * O mesmo conserto costuma ter mais de um caminho: fonte de 500W ou de 200W,
 * tela original ou paralela, bateria nova ou recondicionada. Antes disto as
 * duas peças ficavam na mesma lista e o sistema SOMAVA as duas — o cliente
 * recebia um orçamento cobrando as duas fontes de uma vez, e a loja parecia
 * estar tentando empurrar o dobro.
 *
 * A regra é uma só, aqui e no banco: peça com `opcao` preenchida entra num
 * grupo, e **só a marcada como `escolhida` conta** em dinheiro e baixa do
 * estoque. Sem exceção — o mesmo cálculo existe em SQL, na função pública
 * consultar_os, e duas regras diferentes acabariam mostrando dois valores
 * para o mesmo orçamento.
 *
 * Peça sem `opcao` é fixa: entra sempre, dê no que der a escolha.
 *
 * Não há coluna nova no banco: `ordens.pecas` é jsonb e carrega os campos
 * junto. Por isso o esquema.test.ts não cobre este caso — quem cobre é o
 * orcamento.test.ts aqui do lado.
 */

const n = (v?: number | null): number => Number(v) || 0;

export const subtotalPeca = (p: PecaOS): number => n(p.precoUnit) * n(p.quantidade);

export const custoDaPeca = (p: PecaOS): number => n(p.custoUnit) * n(p.quantidade);

/** Nome do grupo de alternativas, ou "" quando a peça é fixa */
export const grupoDaPeca = (p: PecaOS): string => (p.opcao || "").trim();

export interface GrupoOpcao {
  nome: string;
  itens: PecaOS[];
  /** A alternativa que vale. Vazio enquanto ninguém decidiu. */
  escolhida?: PecaOS;
}

/** Grupos de alternativa, na ordem em que aparecem na OS */
export function gruposDeOpcao(o: OrdemServico): GrupoOpcao[] {
  const mapa = new Map<string, PecaOS[]>();
  for (const p of o.pecas || []) {
    const g = grupoDaPeca(p);
    if (!g) continue;
    const lista = mapa.get(g);
    if (lista) lista.push(p);
    else mapa.set(g, [p]);
  }
  return [...mapa].map(([nome, itens]) => ({
    nome,
    itens,
    // Duas marcadas é dado estragado (edição em dois aparelhos ao mesmo
    // tempo): vale a primeira. O que não pode, em hipótese alguma, é somar
    // as duas — foi exatamente disso que este arquivo nasceu.
    escolhida: itens.find((p) => p.escolhida),
  }));
}

/**
 * As peças que valem de verdade: as fixas mais a escolhida de cada grupo.
 *
 * É esta lista que vira dinheiro no total e baixa do estoque na entrega.
 * Alternativa recusada não custa nada e não sai da prateleira.
 */
export function pecasEfetivas(o: OrdemServico): PecaOS[] {
  const grupos = gruposDeOpcao(o);
  return (o.pecas || []).filter((p) => {
    const g = grupoDaPeca(p);
    if (!g) return true;
    return grupos.find((x) => x.nome === g)?.escolhida === p;
  });
}

/**
 * Grupos que são de fato uma escolha do cliente: dois ou mais caminhos.
 *
 * Grupo de um item só não é escolha, é item. Ele aparece no orçamento como
 * qualquer outra peça — pedir para o cliente "escolher" entre uma coisa e
 * nada é confuso e não ajuda ninguém a decidir.
 */
export const escolhasDoCliente = (o: OrdemServico): GrupoOpcao[] =>
  gruposDeOpcao(o).filter((g) => g.itens.length >= 2);

/** Itens que entram no serviço em qualquer cenário de escolha */
export function itensInclusos(o: OrdemServico): PecaOS[] {
  const escolhas = escolhasDoCliente(o);
  return pecasEfetivas(o).filter(
    (p) => !escolhas.some((g) => g.nome === grupoDaPeca(p))
  );
}

/** Grupos em que ninguém escolheu ainda */
export const opcoesPendentes = (o: OrdemServico): GrupoOpcao[] =>
  gruposDeOpcao(o).filter((g) => !g.escolhida);

/** Falta escolher alguma coisa antes de fechar a conta? */
export const temEscolhaPendente = (o: OrdemServico): boolean =>
  opcoesPendentes(o).length > 0;

/**
 * A OS como ficaria se esta alternativa fosse a escolhida.
 *
 * Serve para mostrar "total com esta opção" sem recalcular a conta à mão em
 * cada tela — a conta de dinheiro continua sendo uma só, a do calc.ts.
 */
export function comOpcaoEscolhida(o: OrdemServico, escolha: PecaOS): OrdemServico {
  const grupo = grupoDaPeca(escolha);
  if (!grupo) return o;
  return {
    ...o,
    pecas: (o.pecas || []).map((p) =>
      grupoDaPeca(p) === grupo ? { ...p, escolhida: p === escolha } : p
    ),
  };
}

/**
 * Marca uma alternativa como escolhida, desmarcando as concorrentes.
 *
 * Recebe o índice na lista porque é assim que a escolha viaja para o banco:
 * peça não tem identificador próprio dentro do jsonb, e casar por descrição
 * erra quando duas alternativas têm o mesmo nome.
 */
export function escolherOpcao(o: OrdemServico, indice: number): OrdemServico {
  const alvo = (o.pecas || [])[indice];
  if (!alvo || !grupoDaPeca(alvo)) return o;
  return comOpcaoEscolhida(o, alvo);
}

/** Índices das alternativas escolhidas — o formato que o banco recebe */
export const indicesEscolhidos = (o: OrdemServico): number[] =>
  (o.pecas || [])
    .map((p, i) => (grupoDaPeca(p) && p.escolhida ? i : -1))
    .filter((i) => i >= 0);
