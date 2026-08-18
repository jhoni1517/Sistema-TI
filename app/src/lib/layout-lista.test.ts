import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/*
 * ============================================================
 *  O BUG DAS LETRAS, E POR QUE ELE VOLTOU
 * ============================================================
 *
 * Medido num celular de 375px, na lista de OS:
 *
 *   coluna do nome ......  26px de largura
 *   crachá de status ....  vazava 43px POR CIMA do valor
 *
 * Na tela: "Lucas Ferreira da Silva" virava "Lu" numa linha e "S." na outra,
 * com "R$ 180,00" escrito em cima da palavra "Aprovada". Quem abre a lista no
 * balcão não consegue ler de quem é o conserto.
 *
 * POR QUE ACONTECIA
 *
 * O bloco do meio era `min-w-0 flex-1` — o que faz o texto comprido caber com
 * reticências, e também o que autoriza ele a encolher até ZERO. Os vizinhos
 * (valor, botões) não tinham `shrink-0`, então ninguém segurava tamanho
 * nenhum, e os crachás lá de dentro, que não quebram linha, vazavam para fora
 * do bloco de largura zero.
 *
 * O `flex-wrap` estava lá e não salvava: item de flex só quebra para a linha
 * de baixo quando NÃO PODE mais encolher. Com `flex-1` ele sempre pode.
 *
 * POR QUE ISTO É UM TESTE E NÃO UM CONSERTO
 *
 * O mesmo padrão estava em QUATRO telas: Ordens de serviço, Fechamentos do
 * caixa, Lojas e o carrinho do PDV. Consertar as quatro à mão é esperar a
 * quinta aparecer. A regra virou `.linha-card` no index.css, e este teste lê
 * as telas do disco para cobrar que elas usem — e que ninguém volte a escrever
 * a mão o arranjo que quebra.
 */

const raiz = new URL("../", import.meta.url);
const ler = (rel: string): string => readFileSync(new URL(rel, raiz), "utf8");

/** Comentário que fala do problema não pode contar como o problema */
const semComentarios = (fonte: string): string =>
  fonte
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/** As telas que têm linha de lista com valor e botões do lado */
const TELAS = [
  "pages/OrdensServico.tsx",
  "pages/Caixa.tsx",
  "pages/Lojas.tsx",
  "pages/PDV.tsx",
];

describe("a regra mora em um lugar só", () => {
  /*
   * Sem os comentários. O comentário do index.css EXPLICA o bug e cita
   * `.linha-card-fim` e `flex-1` para dizer por que não usar — e o teste
   * casava com a explicação em vez da regra. Já aconteceu duas vezes nesta
   * base: uma no teste do Dashboard, outra no do SQL do estoque.
   */
  const css = ler("index.css").replace(/\/\*[\s\S]*?\*\//g, "");

  it("index.css define as três classes", () => {
    expect(css).toMatch(/\.linha-card\s*\{/);
    expect(css).toMatch(/\.linha-card-info\s*\{/);
    expect(css).toMatch(/\.linha-card-fim\s*\{/);
  });

  it("o bloco do meio tem piso de largura, e não encolhe até zero", () => {
    const regra = css.slice(css.indexOf(".linha-card-info"));
    const corpo = regra.slice(0, regra.indexOf("}"));
    // `basis-56` é o piso: chegando nele, o bloco quebra para a linha de
    // baixo em vez de continuar espremendo.
    expect(corpo).toMatch(/basis-56/);
    // `grow` e NÃO `flex-1`: `flex-1` é atalho para `flex: 1 1 0%`, e o `0%`
    // no fim apaga o piso. Foi exatamente isso que fez a primeira tentativa
    // de conserto não mudar nada.
    expect(corpo).not.toMatch(/flex-1/);
    expect(corpo).toMatch(/\bgrow\b/);
    // `min-w-0` continua, senão o texto comprido para de ganhar reticências.
    expect(corpo).toMatch(/min-w-0/);
  });

  it("valor e botões não encolhem", () => {
    const regra = css.slice(css.indexOf(".linha-card-fim"));
    expect(regra.slice(0, regra.indexOf("}"))).toMatch(/shrink-0/);
  });
});

describe("as telas usam a regra, e não o arranjo escrito à mão", () => {
  for (const tela of TELAS) {
    const fonte = semComentarios(ler(tela));

    it(`${tela} usa linha-card na linha de lista`, () => {
      expect(fonte).toContain("linha-card");
    });

    it(`${tela} não escreve o arranjo que quebra`, () => {
      /*
       * `card flex flex-wrap` é a assinatura exata do bug: a faixa que
       * quebra, com o bloco do meio livre para sumir. Quem precisar de uma
       * linha de lista nova usa `card linha-card`.
       */
      expect(fonte).not.toMatch(/className="card flex flex-wrap/);
    });

    it(`${tela} não põe truncate num contêiner flex`, () => {
      /*
       * `truncate` num elemento `flex` não corta nada: ele corta o TEXTO de
       * um bloco, e num flex os filhos são caixas. Era o que fazia o nome
       * comprido quebrar em pedaços de duas letras por linha em vez de sair
       * com reticências. O `truncate` vai no <span> de dentro.
       */
      const erradas = [...fonte.matchAll(/className="([^"]*\btruncate\b[^"]*)"/g)]
        .map((m) => m[1])
        .filter((c) => /(^|\s)flex(\s|$)/.test(c));
      expect(erradas, `truncate junto de flex em ${tela}`).toEqual([]);
    });
  }
});
