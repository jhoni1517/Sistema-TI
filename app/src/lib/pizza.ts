import { centavos } from "./pdv";

/**
 * Pizza com mais de um sabor.
 *
 * Metade calabresa (R$ 45) com metade portuguesa (R$ 52) pode sair R$ 52 ou
 * R$ 48,50 dependendo da casa. Não é desconto nem promoção: é REGRA DE
 * PREÇO, e regra de preço é dinheiro — por isso mora aqui, com teste, e não
 * dentro da tela do PDV.
 *
 * ---------------------------------------------------------------------
 * SÓ EXISTEM DUAS REGRAS, e isto merece explicação.
 *
 * O levantamento em NICHOS.md listava três: o sabor mais caro, a média, e
 * "a soma das metades" — dizendo que a terceira coincide com a média em
 * dois sabores mas difere em três ou quatro. Não difere. Nunca.
 *
 * Somar as frações é somar preco/N de cada sabor, e isso é (Σ preco)/N,
 * que é a definição de média. Com 45 e 52: 22,50 + 26,00 = 48,50, e a
 * média também é 48,50. Com 45, 52 e 60: 15,00 + 17,33 + 20,00 = 52,33, e
 * a média também. A igualdade não é coincidência de exemplo, é álgebra.
 *
 * Oferecer as duas na tela de Configurações seria pedir para a loja
 * escolher entre duas opções idênticas — e ela escolheria "soma" achando
 * que muda alguma coisa. `mesmaConta` no teste guarda isso.
 * ---------------------------------------------------------------------
 */

export type RegraMeioAMeio = "maior" | "media";

export const REGRA_MEIO_A_MEIO_META: Record<
  RegraMeioAMeio,
  { label: string; explicacao: string }
> = {
  maior: {
    label: "O sabor mais caro",
    explicacao:
      "Meia calabresa (R$ 45) com meia portuguesa (R$ 52) sai R$ 52. É o mais usado, e o que menos gera discussão no balcão.",
  },
  media: {
    label: "A média dos sabores",
    explicacao:
      "O mesmo pedido sai R$ 48,50. É a mesma conta de somar as metades — meia de cada preço dá no mesmo.",
  },
};

/** Regra da loja, com o mais caro como padrão de quem nunca escolheu */
export const regraDe = (r?: string | null): RegraMeioAMeio =>
  r === "media" ? "media" : "maior";

/** Um sabor escolhido, com o preço que ele tem sozinho */
export interface Sabor {
  nome: string;
  preco: number;
}

const precoDoSabor = (s: Sabor): number => Number(s.preco) || 0;

/**
 * Quanto custa a pizza montada com estes sabores.
 *
 * Um sabor só não é meio a meio: é a pizza inteira, e vale o preço dela —
 * qualquer outra conta aqui faria a pizza de um sabor mudar de preço só por
 * ter passado pelo montador.
 */
export function precoDosSabores(sabores: Sabor[], regra: RegraMeioAMeio): number {
  const precos = (sabores || []).map(precoDoSabor);
  if (precos.length === 0) return 0;
  if (precos.length === 1) return centavos(precos[0]);
  if (regra === "maior") return centavos(Math.max(...precos));
  return centavos(precos.reduce((s, p) => s + p, 0) / precos.length);
}

/**
 * Como a pizza aparece no cupom e na cozinha.
 *
 * A cozinha precisa da ordem em que os sabores foram escolhidos, porque é
 * ela que diz de que lado cada um vai. "1/2 Calabresa + 1/2 Portuguesa"
 * lê-se em voz alta sem tradução; "Calabresa, Portuguesa" não diz se é uma
 * pizza de dois sabores ou duas pizzas.
 */
export function descricaoDosSabores(sabores: Sabor[]): string {
  const nomes = (sabores || []).map((s) => (s.nome || "").trim()).filter(Boolean);
  if (nomes.length === 0) return "";
  if (nomes.length === 1) return nomes[0];
  return nomes.map((n) => `1/${nomes.length} ${n}`).join(" + ");
}
