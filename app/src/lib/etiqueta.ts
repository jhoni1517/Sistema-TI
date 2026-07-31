import { brl, txt } from "./format";
import { precoEfetivo, promocaoValendo } from "./promocao";
import { digitoVerificadorEAN13 } from "./balanca";
import { hojeISO } from "./contas";
import type { Produto } from "./types";

/**
 * Etiqueta de gôndola e código de barras interno.
 *
 * Dois problemas de prateleira que o sistema não resolvia:
 *
 * 1. **Produto sem código de fábrica.** Granel, fracionado, peça avulsa,
 *    doce da caixa. Sem código, o balcão digita o nome — e digitar nome com
 *    fila é onde o item errado entra no carrinho.
 * 2. **Preço escrito à mão na prateleira.** Ele nunca acompanha a promoção,
 *    e a diferença entre a etiqueta e o caixa aparece na frente do cliente.
 *
 * O código interno usa o prefixo **2**, que a GS1 reserva para uso da própria
 * loja e nenhum fabricante emite. Sem esse prefixo, um código inventado pode
 * colidir com o de um produto de verdade e o leitor traria a mercadoria
 * errada.
 *
 * Formato: `2` + 11 dígitos do produto + verificador. Ele NÃO é o formato de
 * balança (`2 CCCCCC VVVVV D`), que carrega peso no meio — misturar os dois
 * faria a frente de caixa ler um preço onde está um código.
 */

/** Prefixo reservado à loja. Nenhum fabricante emite código começando assim. */
const PREFIXO_INTERNO = "2";

/**
 * Código de barras interno a partir de um número sequencial.
 *
 * A sequência vira o corpo do código; o verificador fecha o EAN-13. Números
 * pequenos entram com zeros à esquerda, que é o que faz o código ter sempre
 * 13 dígitos e o leitor aceitar.
 */
export function codigoInterno(sequencial: number): string {
  const n = Math.max(0, Math.floor(Number(sequencial) || 0));
  const corpo = PREFIXO_INTERNO + String(n).padStart(11, "0").slice(-11);
  return corpo + digitoVerificadorEAN13(corpo);
}

/**
 * Próximo código livre, olhando o que já existe.
 *
 * Repetir um código faz o leitor trazer o produto errado — e o operador não
 * tem como perceber, porque o bipe é o mesmo.
 */
export function proximoCodigoInterno(produtos: Produto[]): string {
  let maior = 0;
  for (const p of produtos) {
    const c = txt(p.codigoBarras).trim();
    if (c.length !== 13 || !c.startsWith(PREFIXO_INTERNO)) continue;
    const n = Number(c.slice(1, 12));
    if (Number.isFinite(n) && n > maior) maior = n;
  }
  return codigoInterno(maior + 1);
}

/** É um código emitido pela própria loja? */
export const ehCodigoInterno = (codigo: string): boolean => {
  const c = txt(codigo).trim();
  return c.length === 13 && c.startsWith(PREFIXO_INTERNO);
};

export interface Etiqueta {
  nome: string;
  codigo: string;
  /** Preço que vai na etiqueta — o promocional quando a promoção está valendo */
  preco: number;
  /** Preço cheio, para sair riscado ao lado. Zero quando não há promoção. */
  precoDe: number;
  /** "kg" quando o produto é vendido por peso */
  unidade: string;
}

/**
 * Monta as etiquetas de uma lista de produtos.
 *
 * O preço vem de precoEfetivo, como no caixa. Uma etiqueta impressa com o
 * preço cheio durante a promoção é pior do que não ter etiqueta: ela
 * contradiz o próprio caixa da loja na frente do cliente.
 */
export function etiquetasDe(
  produtos: Produto[],
  quantidades: Record<string, number> = {},
  hoje = hojeISO()
): Etiqueta[] {
  const out: Etiqueta[] = [];
  for (const p of produtos) {
    const vezes = Math.max(1, Math.floor(Number(quantidades[p.id]) || 1));
    const etiqueta: Etiqueta = {
      nome: txt(p.nome),
      codigo: txt(p.codigoBarras).trim(),
      preco: precoEfetivo(p, hoje),
      precoDe: promocaoValendo(p, hoje) ? Number(p.preco) || 0 : 0,
      unidade: p.porPeso ? "kg" : "un",
    };
    for (let i = 0; i < vezes; i++) out.push(etiqueta);
  }
  return out;
}

/**
 * Desenha um EAN-13 em SVG.
 *
 * Vai em SVG e não em imagem porque etiqueta impressa em baixa resolução não
 * é lida pelo leitor: o vetor sai nítido em qualquer impressora, inclusive na
 * jato de tinta velha do balcão.
 *
 * Código inválido devolve vazio — melhor etiqueta sem barras do que barras
 * que o leitor recusa e ninguém testou antes de colar em cem produtos.
 */
const ESQUERDA_A = [
  "0001101", "0011001", "0010011", "0111101", "0100011",
  "0110001", "0101111", "0111011", "0110111", "0001011",
];
const ESQUERDA_B = [
  "0100111", "0110011", "0011011", "0100001", "0011101",
  "0111001", "0000101", "0010001", "0001001", "0010111",
];
const DIREITA = [
  "1110010", "1100110", "1101100", "1000010", "1011100",
  "1001110", "1010000", "1000100", "1001000", "1110100",
];
/** Qual metade da tabela cada dígito da esquerda usa, conforme o 1º dígito */
const PARIDADE = [
  "AAAAAA", "AABABB", "AABBAB", "AABBBA", "ABAABB",
  "ABBAAB", "ABBBAA", "ABABAB", "ABABBA", "ABBABA",
];

export function barrasEAN13(codigo: string, altura = 34): string {
  const c = txt(codigo).trim();
  if (!/^\d{13}$/.test(c)) return "";
  if (Number(c[12]) !== digitoVerificadorEAN13(c.slice(0, 12))) return "";

  const paridade = PARIDADE[Number(c[0])];
  let bits = "101";
  for (let i = 1; i <= 6; i++) {
    const d = Number(c[i]);
    bits += paridade[i - 1] === "A" ? ESQUERDA_A[d] : ESQUERDA_B[d];
  }
  bits += "01010";
  for (let i = 7; i <= 12; i++) bits += DIREITA[Number(c[i])];
  bits += "101";

  const barras: string[] = [];
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === "1") barras.push(`<rect x="${i}" y="0" width="1" height="${altura}" />`);
  }
  return (
    `<svg viewBox="0 0 ${bits.length} ${altura}" width="100%" height="${altura}" ` +
    `preserveAspectRatio="none" shape-rendering="crispEdges" fill="#000">` +
    barras.join("") +
    `</svg>`
  );
}

/** O texto do preço, já com a unidade que a mercearia usa */
export const precoDaEtiqueta = (e: Etiqueta): string =>
  e.unidade === "kg" ? `${brl(e.preco)} /kg` : brl(e.preco);
