import { brl, negrito, txt, normalizar } from "./format";
import type {
  Cotacao,
  Fornecedor,
  ItemCotacao,
  PrecoFornecedor,
  Produto,
} from "./types";

/**
 * Regras da cotação com fornecedor.
 *
 * O ponto que faz diferença no balcão é o "último valor pago": sem essa
 * referência, quem pede a peça não tem como saber se o preço que voltou é
 * bom ou se subiu 40% desde a última compra. É a informação que evita
 * comprar caro por pressa.
 */

/** O registro é do mesmo item? (por id quando há, senão pelo nome) */
const mesmoItem = (
  p: PrecoFornecedor,
  item: { produtoId?: string; descricao: string }
): boolean =>
  item.produtoId && p.produtoId
    ? p.produtoId === item.produtoId
    : // Sem acento: o preço anterior foi gravado com o nome digitado naquele
      // dia, e hoje se digita de outro jeito. Não casando, o histórico do
      // fornecedor some e a cotação parece a primeira.
      normalizar(p.descricao) === normalizar(item.descricao);

const maisRecentePrimeiro = (a: PrecoFornecedor, b: PrecoFornecedor) =>
  txt(b.data).localeCompare(txt(a.data));

/**
 * Último preço EFETIVAMENTE PAGO por um item.
 * Cotações recusadas ficam de fora: o que ancora a negociação é o que a
 * loja pagou, não o que alguém pediu e não fechou.
 */
export function ultimoPreco(
  precos: PrecoFornecedor[],
  item: { produtoId?: string; descricao: string },
  fornecedorId?: string
): PrecoFornecedor | null {
  const candidatos = precos
    .filter((p) => {
      if (fornecedorId && p.fornecedorId !== fornecedorId) return false;
      if (p.comprado === false) return false; // só compra de verdade
      return mesmoItem(p, item);
    })
    .sort(maisRecentePrimeiro);
  return candidatos[0] || null;
}

/**
 * Última referência conhecida — comprada OU só cotada.
 * Serve para itens que a loja nunca comprou mas já pediu preço: continua
 * valendo como base de comparação na cotação seguinte.
 */
export function ultimaReferencia(
  precos: PrecoFornecedor[],
  item: { produtoId?: string; descricao: string },
  fornecedorId?: string
): PrecoFornecedor | null {
  const candidatos = precos
    .filter((p) => (fornecedorId ? p.fornecedorId === fornecedorId : true))
    .filter((p) => mesmoItem(p, item))
    .sort(maisRecentePrimeiro);
  return candidatos[0] || null;
}

/** Melhor preço já pago (entre todos os fornecedores) — serve de piso na negociação */
export function melhorPreco(
  precos: PrecoFornecedor[],
  item: { produtoId?: string; descricao: string }
): PrecoFornecedor | null {
  const candidatos = precos
    .filter((p) => p.comprado !== false && mesmoItem(p, item))
    .sort((a, b) => (a.preco || 0) - (b.preco || 0));
  return candidatos[0] || null;
}

/** Variação percentual entre o preço respondido e o último pago */
export function variacao(precoNovo: number, precoAntigo: number): number | null {
  if (!precoAntigo || !precoNovo) return null;
  return ((precoNovo - precoAntigo) / precoAntigo) * 100;
}

export const totalCotacao = (c: Cotacao): number =>
  (c.itens || []).reduce(
    (s, i) => s + (Number(i.precoUnit) || 0) * (Number(i.quantidade) || 0),
    0
  );

/**
 * Mensagem enviada ao fornecedor.
 * Pergunta as duas coisas que importam — tem em estoque e por quanto — e
 * já mostra o que a loja pagou da última vez, o que ancora a negociação.
 */
export function mensagemFornecedor(
  cotacao: Cotacao,
  fornecedor: Fornecedor | undefined,
  precos: PrecoFornecedor[],
  nomeLoja: string
): string {
  const partes: string[] = [];
  const nome = txt(fornecedor?.contato) || txt(fornecedor?.nome);

  partes.push(negrito(txt(nomeLoja).trim() || "Assistência Técnica"));
  partes.push(
    `${nome ? `Olá, ${nome.split(/\s+/)[0]}!` : "Olá!"} Preciso de uma cotação, por favor.`
  );

  const linhas = (cotacao.itens || [])
    .filter((i) => txt(i.descricao).trim())
    .map((i, idx) => {
      const qtd = Number(i.quantidade) || 1;
      const ref = ultimaReferencia(precos, i, cotacao.fornecedorId);
      const nota = ref
        ? `\n   _(${ref.comprado === false ? "cotado antes" : "última compra"}: ${brl(ref.preco)})_`
        : "";
      return `${idx + 1}. ${txt(i.descricao).trim()} — *${qtd} un.*${nota}`;
    });

  if (linhas.length > 0) {
    partes.push(`*Itens:*\n${linhas.join("\n")}`);
  }

  if (txt(cotacao.observacoes).trim()) {
    partes.push(`*Observações:*\n${txt(cotacao.observacoes).trim()}`);
  }

  // Lista objetiva, sem perguntas soltas: o fornecedor responde item a item
  partes.push(
    "Me confirme, por favor:\n" +
      "- Disponibilidade em estoque\n" +
      "- Valor unitário\n" +
      "- Prazo de entrega"
  );

  partes.push("Obrigado!");

  return partes.join("\n\n");
}

/**
 * Converte um item de cotação comprada em produto de estoque.
 * Quando o item já existe, soma a quantidade e atualiza o custo; quando não
 * existe, nasce um produto novo com preço de venda sugerido.
 */
export function aplicarCompra(
  item: ItemCotacao,
  existente: Produto | undefined,
  margemPadrao = 1.8
): Produto | null {
  const qtd = Number(item.quantidade) || 0;
  const custo = Number(item.precoUnit) || 0;
  if (qtd <= 0) return null;

  if (existente) {
    return {
      ...existente,
      quantidade: (Number(existente.quantidade) || 0) + qtd,
      custo: custo || existente.custo,
      // Mantém o preço de venda que a loja já definiu
      preco: existente.preco || Math.round(custo * margemPadrao * 100) / 100,
    };
  }

  return {
    id: "",
    nome: txt(item.descricao).trim(),
    quantidade: qtd,
    estoqueMinimo: 1,
    custo,
    preco: Math.round(custo * margemPadrao * 100) / 100,
    criadoEm: new Date().toISOString(),
  };
}
