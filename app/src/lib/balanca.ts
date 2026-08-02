import { txt } from "./format";
import { buscarProduto } from "./pdv";
import type { Produto } from "./types";

/**
 * Etiqueta de balança: o código de barras que carrega o peso dentro dele.
 *
 * É isto que separa um sistema com cara de mercearia de um sistema de
 * mercearia. A balança do açougue e do frios imprime uma etiqueta EAN-13
 * começando com 2, e dentro dela vai o código do produto E quanto aquele
 * pacote pesou (ou custou). Cada etiqueta é única — o mesmo queijo pesado
 * duas vezes gera dois códigos diferentes.
 *
 * Sem decodificar isso, o operador tem que digitar o peso na mão a cada
 * pacote, e aí a balança não serve para nada.
 *
 * Formato brasileiro mais comum (13 dígitos):
 *
 *   2 CCCCCC VVVVV D
 *   │ │      │     └─ dígito verificador
 *   │ │      └─────── peso em gramas, ou preço em centavos
 *   │ └────────────── código do produto cadastrado na balança
 *   └──────────────── prefixo fixo de produto pesado
 *
 * A balança é configurada para gravar PESO ou PREÇO nos cinco dígitos, e as
 * duas formas existem no mercado — por isso a loja escolhe qual usa.
 */

export type FormatoBalanca = "peso" | "preco";

export interface EtiquetaBalanca {
  /** Código do produto na balança (6 dígitos, sem zeros à esquerda) */
  codigo: string;
  /** Quilos, quando a balança grava peso */
  peso?: number;
  /** Reais, quando a balança grava o total a pagar */
  preco?: number;
}

/** Só os dígitos, para tolerar espaço e hífen que o leitor às vezes manda */
export const apenasDigitos = (v: string): string => txt(v).replace(/\D/g, "");
const digitos = apenasDigitos;

/**
 * Dígito verificador do EAN-13.
 *
 * Conferir isto não é preciosismo: leitura torta e etiqueta amassada
 * acontecem o dia inteiro no balcão, e um código lido errado viraria outro
 * produto ou um peso absurdo. Melhor recusar e pedir para passar de novo.
 */
export function digitoVerificadorEAN13(doze: string): number {
  let soma = 0;
  for (let i = 0; i < 12; i++) {
    soma += Number(doze[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (soma % 10)) % 10;
}

export const ean13Valido = (codigo: string): boolean => {
  const d = digitos(codigo);
  if (d.length !== 13) return false;
  return digitoVerificadorEAN13(d.slice(0, 12)) === Number(d[12]);
};

/**
 * Tem a FORMA de uma etiqueta de balança, e não a de um código de fábrica.
 *
 * Só a forma. Quem decide o que fazer com o código lido é
 * `ehLeituraDeBalanca` — ver o porquê lá.
 */
export const ehEtiquetaBalanca = (codigo: string): boolean => {
  const d = digitos(codigo);
  return d.length === 13 && d[0] === "2";
};

/**
 * O código que acabou de ser lido deve ser tratado como etiqueta de balança?
 *
 * A forma sozinha não serve, e isso custou caro: o código interno que o
 * PRÓPRIO sistema gera para produto sem código de fábrica (`codigoInterno`,
 * em lib/etiqueta.ts) é `2` + 11 dígitos + verificador — a mesma forma que
 * a etiqueta de balança `2 CCCCCC VVVVV D`, dígito por dígito. O arquivo de
 * etiquetas já avisava que misturar os dois "faria a frente de caixa ler um
 * preço onde está um código", e era exatamente o que a frente de caixa
 * fazia, porque perguntava só pela forma.
 *
 * Resultado no balcão: o operador passa no leitor a etiqueta que a própria
 * loja imprimiu e o sistema responde que aquele produto não existe. Quando
 * existe algum produto com o código de balança que sai do meio do código
 * interno, é pior — entra no carrinho o produto errado, com um peso
 * inventado. O código interno de sequência 123456 vira "produto 1,
 * 23,456 kg", com o mesmo bipe de sempre.
 *
 * O critério certo não é a forma, é a ORIGEM: código que está no cadastro
 * foi a loja que escreveu ali, e cadastro é decisão, não palpite. A etiqueta
 * de balança é única por pacote — o mesmo queijo pesado duas vezes gera dois
 * códigos diferentes —, então ela nunca vai estar cadastrada, e olhar o
 * cadastro primeiro não tira nada dela.
 */
export function ehLeituraDeBalanca(codigo: string, produtos: Produto[]): boolean {
  if (!ehEtiquetaBalanca(codigo)) return false;
  return !buscarProduto(produtos, digitos(codigo));
}

/**
 * Lê a etiqueta. Devolve null quando não é etiqueta de balança ou quando o
 * dígito verificador não fecha.
 */
export function lerEtiqueta(
  codigo: string,
  formato: FormatoBalanca = "peso"
): EtiquetaBalanca | null {
  const d = digitos(codigo);
  if (!ehEtiquetaBalanca(d) || !ean13Valido(d)) return null;

  // Zeros à esquerda são de enchimento: o produto 000123 é o 123.
  const codigoProduto = String(Number(d.slice(1, 7)));
  const valor = Number(d.slice(7, 12));

  return formato === "preco"
    ? { codigo: codigoProduto, preco: valor / 100 }
    : { codigo: codigoProduto, peso: valor / 1000 };
}

/** Acha o produto pelo código curto que está cadastrado na balança */
export function produtoDaEtiqueta(
  produtos: Produto[],
  etiqueta: EtiquetaBalanca
): Produto | undefined {
  const alvo = String(Number(etiqueta.codigo));
  return produtos.find((p) => {
    const c = digitos(txt(p.codigoBalanca));
    return c !== "" && String(Number(c)) === alvo;
  });
}

/**
 * Quantidade a lançar no carrinho a partir da etiqueta.
 *
 * Quando a balança grava o PREÇO, o peso vem por divisão — e é aí que mora
 * a diferença de centavo: R$ 7,84 a R$ 24,90/kg dá 0,314859... kg. Se o
 * sistema arredondasse o peso e recalculasse, o total mudaria e deixaria de
 * bater com a etiqueta que está colada no pacote. Então o peso fica com as
 * casas que precisar, e quem manda é o valor impresso.
 */
export function quantidadeDaEtiqueta(
  etiqueta: EtiquetaBalanca,
  precoPorKg: number
): number {
  if (typeof etiqueta.peso === "number") return etiqueta.peso;
  const preco = Number(precoPorKg) || 0;
  if (preco <= 0 || typeof etiqueta.preco !== "number") return 0;
  return etiqueta.preco / preco;
}

/**
 * Monta uma etiqueta — serve para testar a leitura e para conferir o
 * cadastro do produto sem precisar da balança na mesa.
 */
export function montarEtiqueta(
  codigoProduto: string | number,
  valor: number,
  formato: FormatoBalanca = "peso"
): string {
  const cod = digitos(String(codigoProduto)).padStart(6, "0").slice(-6);
  const bruto = formato === "preco" ? Math.round(valor * 100) : Math.round(valor * 1000);
  const val = String(Math.max(0, bruto)).padStart(5, "0").slice(-5);
  const doze = `2${cod}${val}`;
  return doze + digitoVerificadorEAN13(doze);
}
