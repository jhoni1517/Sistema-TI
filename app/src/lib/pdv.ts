import { txt } from "./format";
import { soData, hojeISO, diasAteVencer } from "./contas";
import { precoEfetivo } from "./promocao";
import type { ItemVenda, Produto, Venda } from "./types";

/**
 * Venda de balcão: carrinho, troco e busca de produto.
 *
 * A conta mora aqui, com teste, porque venda por peso gera dízima e é onde
 * o dinheiro escorre. 0,315 kg a R$ 24,90 dá 7,8435 — e o cliente não paga
 * fração de centavo. Cada linha é arredondada ANTES de somar, que é como a
 * balança e a etiqueta fazem; somar primeiro e arredondar no fim produz um
 * total diferente do que está escrito nos itens, e aí a fila discute.
 */

/** Centavos, sem o -0 e sem a dízima do ponto flutuante */
export const centavos = (v: number): number =>
  Math.round((Number(v) || 0) * 100) / 100 + 0;

/** Quanto custa esta linha do carrinho */
export const subtotalItem = (i: ItemVenda): number =>
  centavos((Number(i.quantidade) || 0) * (Number(i.precoUnit) || 0));

/** Soma das linhas, cada uma já arredondada */
export const subtotalVenda = (itens: ItemVenda[]): number =>
  centavos(itens.reduce((s, i) => s + subtotalItem(i), 0));

/**
 * Total a pagar. Desconto nunca deixa a venda negativa: digitar 100 de
 * desconto numa compra de 30 devolveria dinheiro do caixa.
 */
export const totalVenda = (v: Pick<Venda, "itens" | "desconto">): number => {
  const bruto = subtotalVenda(v.itens);
  const desconto = Math.max(0, Number(v.desconto) || 0);
  return centavos(Math.max(0, bruto - desconto));
};

/** Custo das mercadorias vendidas — é o que vira CMV no resultado */
export const custoVenda = (itens: ItemVenda[]): number =>
  centavos(
    itens.reduce(
      (s, i) => s + centavos((Number(i.quantidade) || 0) * (Number(i.custoUnit) || 0)),
      0
    )
  );

export const lucroVenda = (v: Pick<Venda, "itens" | "desconto">): number =>
  centavos(totalVenda(v) - custoVenda(v.itens));

export const totalItens = (itens: ItemVenda[]): number =>
  itens.reduce((s, i) => s + (Number(i.quantidade) || 0), 0);

/**
 * Troco. Recebido a menos devolve 0, não negativo: "falta R$ 5" é outra
 * informação, e a tela mostra isso pelo total, não por um troco negativo.
 */
export const trocoDe = (total: number, recebido?: number): number => {
  if (typeof recebido !== "number" || Number.isNaN(recebido)) return 0;
  return centavos(Math.max(0, recebido - total));
};

/** Falta dinheiro para fechar a venda? */
export const faltaPara = (total: number, recebido?: number): number => {
  if (typeof recebido !== "number" || Number.isNaN(recebido)) return centavos(total);
  return centavos(Math.max(0, total - recebido));
};

/**
 * O que impede de fechar a venda, em português. Vazio = pode fechar.
 *
 * A quantidade do produto por peso é campo livre — tem que ser, porque é
 * ali que o operador digita 0,315 sem abrir janela nenhuma, com a fila
 * andando. Só que ele aceitava zero e NEGATIVO, e o fechamento conferia
 * apenas o preço.
 *
 * Linha negativa é a pior das duas: ela desconta do total E soma no
 * estoque, porque a baixa é `quantidade - vendida`. Vender "Arroz 2" junto
 * de "Feijão -2" fecha a venda por R$ 0,00 e ainda credita dois quilos de
 * feijão na prateleira. E não sobra nada para a conferência achar: o
 * estoque não fica negativo, o preço não é zero, e lucro inflado ninguém
 * procura.
 *
 * Linha com quantidade zero é mercadoria saindo de graça: total zero e
 * baixa zero.
 *
 * A recusa é por item e diz o nome, porque com dez linhas na tela "tem item
 * sem preço" não diz qual.
 */
export function problemaNoCarrinho(itens: ItemVenda[]): string {
  if (itens.length === 0) return "Carrinho vazio.";

  for (const i of itens) {
    const nome = txt(i.descricao).trim() || "Item";
    const q = Number(i.quantidade) || 0;

    if (q < 0) {
      return (
        `"${nome}" está com quantidade negativa. Isso desconta do total e ` +
        `DEVOLVE mercadoria ao estoque. Se o cliente está devolvendo alguma ` +
        `coisa, feche esta venda e use Devolução.`
      );
    }
    if (q === 0) {
      return `"${nome}" está com quantidade zero. Informe quanto está saindo, ou tire o item do carrinho.`;
    }
    if ((Number(i.precoUnit) || 0) <= 0) {
      return `"${nome}" está sem preço. Informe o valor antes de fechar.`;
    }
  }

  return "";
}

/**
 * Item de carrinho a partir de um produto do estoque.
 *
 * O preço vem de precoEfetivo, nunca de `produto.preco` direto: é aqui que a
 * promoção com prazo entra no caixa. Uma tela lendo o preço cheio faria a
 * etiqueta da gôndola dizer um valor e o caixa cobrar outro — e quem aparece
 * como mentiroso é a loja, não o sistema.
 */
export function itemDoProduto(p: Produto, quantidade = 1, hoje = hojeISO()): ItemVenda {
  return {
    produtoId: p.id,
    descricao: txt(p.nome),
    quantidade,
    precoUnit: precoEfetivo(p, hoje),
    custoUnit: Number(p.custo) || 0,
    porPeso: p.porPeso === true,
  };
}

/**
 * Acrescenta ao carrinho somando à linha que já existe.
 *
 * Passar o mesmo produto duas vezes no leitor tem que virar "2x", e não
 * duas linhas iguais — senão o cupom fica ilegível e conferir o carrinho na
 * frente do cliente vira discussão.
 *
 * Produto por peso é exceção: cada pesagem é uma pesagem, e somar 0,300 com
 * 0,450 apagaria a informação de que foram dois pacotes.
 */
export function adicionar(itens: ItemVenda[], novo: ItemVenda): ItemVenda[] {
  if (novo.porPeso || !novo.produtoId) return [...itens, novo];
  /*
   * Linha com recado nunca se junta a outra.
   *
   * Somar por produtoId é certo no balcão da mercearia: dois pães são dois
   * pães. Numa lanchonete não é. "X-Burger sem cebola" e um X-Burger normal
   * são o MESMO produtoId, e juntá-los daria quantidade 2 com o "sem cebola"
   * valendo para os dois — a cozinha faz os dois sem cebola e uma das duas
   * pessoas recebe o lanche errado. O contrário é igualmente ruim: o recado
   * da segunda linha sobrescreveria o da primeira e alguém comeria cebola.
   */
  const temRecado = (x: ItemVenda) => !!(x.observacao || "").trim();
  if (temRecado(novo)) return [...itens, novo];
  const i = itens.findIndex(
    (x) => x.produtoId === novo.produtoId && !x.porPeso && !temRecado(x)
  );
  if (i < 0) return [...itens, novo];
  const copia = [...itens];
  copia[i] = { ...copia[i], quantidade: copia[i].quantidade + novo.quantidade };
  return copia;
}

/**
 * Acha o produto pelo que foi digitado ou lido.
 *
 * O leitor de código de barras se comporta como teclado: ele "digita" o
 * código e dá Enter. Por isso a busca por código exata vem PRIMEIRO — se o
 * nome ganhasse, um produto chamado "789" roubaria a leitura do código.
 */
export function buscarProduto(produtos: Produto[], termo: string): Produto | undefined {
  const t = txt(termo).trim();
  if (!t) return undefined;
  const exato = produtos.find(
    (p) => txt(p.codigoBarras).trim() === t || txt(p.sku).trim().toLowerCase() === t.toLowerCase()
  );
  if (exato) return exato;
  const alvo = t.toLowerCase();
  return produtos.find((p) => txt(p.nome).toLowerCase() === alvo);
}

/** Sugestões para quem digita o nome em vez de ler o código */
export function sugerirProdutos(produtos: Produto[], termo: string, limite = 8): Produto[] {
  const t = txt(termo).trim().toLowerCase();
  if (!t) return [];
  return produtos
    .filter(
      (p) =>
        txt(p.nome).toLowerCase().includes(t) ||
        txt(p.sku).toLowerCase().includes(t) ||
        txt(p.codigoBarras).includes(t)
    )
    .slice(0, limite);
}

/* ------------------------------------------------------------------ */
/* Validade                                                            */
/* ------------------------------------------------------------------ */

export type SituacaoValidade = "sem_validade" | "ok" | "vence_perto" | "vencido";

export const VALIDADE_META: Record<SituacaoValidade, { label: string; cor: string }> = {
  sem_validade: { label: "Sem validade", cor: "bg-slate-100 text-slate-600" },
  ok: { label: "No prazo", cor: "bg-emerald-100 text-emerald-700" },
  vence_perto: { label: "Vence logo", cor: "bg-amber-100 text-amber-700" },
  vencido: { label: "Vencido", cor: "bg-red-100 text-red-700" },
};

/**
 * Como está a validade do produto.
 *
 * O prazo de alerta é generoso de propósito: descobrir no dia do vencimento
 * não serve para nada. Com uma semana ainda dá para promover e vender.
 */
export function situacaoValidade(
  p: Pick<Produto, "validade">,
  diasAlerta = 7,
  hoje = hojeISO()
): SituacaoValidade {
  const v = soData(p.validade);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "sem_validade";
  const dias = diasAteVencer(v, hoje);
  if (dias < 0) return "vencido";
  if (dias <= diasAlerta) return "vence_perto";
  return "ok";
}

/** Produtos que precisam de atenção, do mais urgente para o menos */
export function produtosVencendo(
  produtos: Produto[],
  diasAlerta = 7,
  hoje = hojeISO()
): Produto[] {
  return produtos
    .filter((p) => {
      const s = situacaoValidade(p, diasAlerta, hoje);
      return s === "vencido" || s === "vence_perto";
    })
    .sort((a, b) => soData(a.validade).localeCompare(soData(b.validade)));
}
