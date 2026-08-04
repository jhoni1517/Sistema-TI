/**
 * Preferências de LEITURA, deste aparelho.
 *
 * Não são dado da loja e não sobem para a nuvem: quem lê o caixa no celular
 * do balcão quer a tela enxuta, e quem confere no computador quer tudo
 * aberto. Subir isso faria uma escolha mandar na outra.
 *
 * Pela mesma razão elas sobrevivem ao logout: são do aparelho, como o tema
 * e a cor de destaque.
 */

const PREFIXO = "sistema-ti:pref:";

/** O resumo do Caixa começa aberto? */
export const LEMBRAR_DETALHES = "caixa-detalhes";

export function lerPreferencia(chave: string, padrao: boolean): boolean {
  try {
    const v = localStorage.getItem(PREFIXO + chave);
    return v === null ? padrao : v === "1";
  } catch {
    // Aparelho sem armazenamento: a preferência só não sobrevive ao F5.
    return padrao;
  }
}

export function gravarPreferencia(chave: string, valor: boolean): void {
  try {
    localStorage.setItem(PREFIXO + chave, valor ? "1" : "0");
  } catch {
    /* enfeite a menos, não tela de erro */
  }
}

/**
 * O resumo do Caixa nasce FECHADO.
 *
 * Eram quatro cartões, mais até cinco de forma de pagamento, mais três
 * botões antes da primeira movimentação: no celular dava meia tela de
 * rolagem para chegar no que a pessoa veio ver. Os dois números que decidem
 * o dia — saldo e o que está na gaveta — continuam sempre à vista.
 */
export const lerDetalhes = (): boolean => lerPreferencia(LEMBRAR_DETALHES, false);
export const gravarDetalhes = (v: boolean): void => gravarPreferencia(LEMBRAR_DETALHES, v);
