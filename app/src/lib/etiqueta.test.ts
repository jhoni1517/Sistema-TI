import { describe, it, expect } from "vitest";
import {
  codigoInterno,
  proximoCodigoInterno,
  ehCodigoInterno,
  etiquetasDe,
  barrasEAN13,
  precoDaEtiqueta,
} from "./etiqueta";
import { ean13Valido } from "./balanca";
import type { Produto } from "./types";

const prod = (p: Partial<Produto>): Produto =>
  ({
    id: "p1",
    nome: "Doce",
    quantidade: 10,
    estoqueMinimo: 1,
    custo: 1,
    preco: 3,
    criadoEm: "2026-01-01",
    ...p,
  }) as Produto;

describe("código de barras da própria loja", () => {
  it("gera um EAN-13 que o leitor aceita", () => {
    const c = codigoInterno(1);
    expect(c).toHaveLength(13);
    expect(ean13Valido(c)).toBe(true);
  });

  it("começa com 2, que é a faixa reservada à loja", () => {
    // Sem esse prefixo, um código inventado pode colidir com o de um produto
    // de fábrica e o leitor traz a mercadoria errada — com o mesmo bipe.
    expect(codigoInterno(1).startsWith("2")).toBe(true);
    expect(codigoInterno(99999).startsWith("2")).toBe(true);
  });

  it("números diferentes geram códigos diferentes", () => {
    const vistos = new Set([1, 2, 3, 10, 500, 99999].map(codigoInterno));
    expect(vistos.size).toBe(6);
  });

  it("continua a partir do maior código interno já usado", () => {
    const produtos = [
      prod({ id: "a", codigoBarras: codigoInterno(1) }),
      prod({ id: "b", codigoBarras: codigoInterno(7) }),
      prod({ id: "c", codigoBarras: "7891234567895" }), // de fábrica, ignorado
    ];
    expect(proximoCodigoInterno(produtos)).toBe(codigoInterno(8));
  });

  it("a primeira loja do mundo começa no 1", () => {
    expect(proximoCodigoInterno([])).toBe(codigoInterno(1));
  });

  it("código de fábrica não é confundido com interno", () => {
    expect(ehCodigoInterno("7891234567895")).toBe(false);
    expect(ehCodigoInterno(codigoInterno(5))).toBe(true);
    expect(ehCodigoInterno("")).toBe(false);
    expect(ehCodigoInterno("212")).toBe(false);
  });

  it("código torto no cadastro não trava a geração do próximo", () => {
    const produtos = [prod({ codigoBarras: "abc" }), prod({ id: "z", codigoBarras: "2" })];
    expect(() => proximoCodigoInterno(produtos)).not.toThrow();
    expect(ean13Valido(proximoCodigoInterno(produtos))).toBe(true);
  });
});

describe("o que sai impresso na etiqueta", () => {
  it("usa o preço promocional quando a promoção está valendo", () => {
    // Etiqueta com o preço cheio durante a promoção é pior do que etiqueta
    // nenhuma: ela contradiz o próprio caixa na frente do cliente.
    const p = prod({ preco: 10, precoPromocional: 7, promocaoFim: "2026-12-31" });
    const [e] = etiquetasDe([p], {}, "2026-07-15");
    expect(e.preco).toBe(7);
    expect(e.precoDe).toBe(10);
  });

  it("sem promoção não mostra preço riscado", () => {
    const [e] = etiquetasDe([prod({ preco: 10 })], {}, "2026-07-15");
    expect(e.preco).toBe(10);
    expect(e.precoDe).toBe(0);
  });

  it("promoção vencida imprime o preço cheio", () => {
    const p = prod({ preco: 10, precoPromocional: 7, promocaoFim: "2026-06-30" });
    expect(etiquetasDe([p], {}, "2026-07-15")[0].preco).toBe(10);
  });

  it("repete a etiqueta quantas vezes o dono pedir", () => {
    // Uma etiqueta por gôndola: o mesmo produto costuma estar em dois pontos.
    expect(etiquetasDe([prod({ id: "a" })], { a: 3 })).toHaveLength(3);
  });

  it("sem quantidade, imprime uma", () => {
    expect(etiquetasDe([prod({ id: "a" })], {})).toHaveLength(1);
  });

  it("quantidade estragada não some com a etiqueta", () => {
    expect(etiquetasDe([prod({ id: "a" })], { a: 0 })).toHaveLength(1);
    expect(etiquetasDe([prod({ id: "a" })], { a: -5 })).toHaveLength(1);
  });

  it("produto por quilo mostra o preço com a unidade certa", () => {
    const [e] = etiquetasDe([prod({ porPeso: true, preco: 24.9 })], {}, "2026-07-15");
    expect(e.unidade).toBe("kg");
    expect(precoDaEtiqueta(e)).toContain("/kg");
  });
});

describe("desenho das barras", () => {
  it("desenha o código válido em SVG", () => {
    const svg = barrasEAN13(codigoInterno(42));
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("<rect");
  });

  it("código com verificador errado não vira barras", () => {
    // Melhor etiqueta sem barras do que barras que o leitor recusa e ninguém
    // testou antes de colar em cem produtos.
    expect(barrasEAN13("7891234567890")).toBe("");
  });

  it("código com tamanho errado não vira barras", () => {
    expect(barrasEAN13("789123")).toBe("");
    expect(barrasEAN13("")).toBe("");
    expect(barrasEAN13("abcdefghijklm")).toBe("");
  });

  it("o desenho tem a largura padrão do EAN-13", () => {
    // 3 + 42 + 5 + 42 + 3 = 95 módulos. Errar isso faz o leitor não ler.
    expect(barrasEAN13(codigoInterno(1))).toContain('viewBox="0 0 95');
  });

  it("respeita a altura pedida", () => {
    expect(barrasEAN13(codigoInterno(1), 50)).toContain('height="50"');
  });
});

/**
 * Trava das tabelas do EAN-13.
 *
 * Os testes acima só olham a estrutura: um dígito trocado dentro das tabelas
 * de codificação passaria por eles e produziria uma etiqueta que o leitor
 * simplesmente não lê — descoberto depois de colar cem delas na prateleira.
 *
 * Aqui o desenho de um código conhecido é comparado bit a bit com o que a
 * norma manda. O código 5901234123457 é o exemplo padrão do EAN-13.
 */
describe("as tabelas do EAN-13 estão certas", () => {
  /** Reconstrói a sequência de barras a partir dos retângulos do SVG */
  const bitsDe = (svg: string, largura: number): string => {
    const marcados = new Set([...svg.matchAll(/x="(\d+)"/g)].map((m) => Number(m[1])));
    return Array.from({ length: largura }, (_, i) => (marcados.has(i) ? "1" : "0")).join("");
  };

  it("desenha 5901234123457 exatamente como a norma manda", () => {
    // Primeiro dígito 5 -> paridade ABBAAB na metade esquerda.
    const esperado =
      "101" +
      "0001011" + // 9 tabela A
      "0100111" + // 0 tabela B
      "0110011" + // 1 tabela B
      "0010011" + // 2 tabela A
      "0111101" + // 3 tabela A
      "0011101" + // 4 tabela B
      "01010" +
      "1100110" + // 1 direita
      "1101100" + // 2
      "1000010" + // 3
      "1011100" + // 4
      "1001110" + // 5
      "1000100" + // 7
      "101";

    expect(esperado).toHaveLength(95);
    expect(bitsDe(barrasEAN13("5901234123457"), 95)).toBe(esperado);
  });

  it("o dígito verificador do exemplo padrão fecha", () => {
    expect(ean13Valido("5901234123457")).toBe(true);
  });

  it("guardas de início, meio e fim nas posições exatas", () => {
    // Fora do lugar, o leitor não acha onde o código começa.
    const bits = bitsDe(barrasEAN13(codigoInterno(7)), 95);
    expect(bits.slice(0, 3)).toBe("101");
    expect(bits.slice(45, 50)).toBe("01010");
    expect(bits.slice(92)).toBe("101");
  });

  it("a metade esquerda sempre começa com zero e a direita com um", () => {
    // É essa diferença que deixa o leitor descobrir se o código passou de
    // trás para frente.
    const bits = bitsDe(barrasEAN13(codigoInterno(123)), 95);
    for (let i = 0; i < 6; i++) expect(bits[3 + i * 7]).toBe("0");
    for (let i = 0; i < 6; i++) expect(bits[50 + i * 7]).toBe("1");
  });
});
