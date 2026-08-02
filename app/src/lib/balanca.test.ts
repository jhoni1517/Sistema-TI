import { describe, it, expect } from "vitest";
import {
  digitoVerificadorEAN13,
  ean13Valido,
  ehEtiquetaBalanca,
  ehLeituraDeBalanca,
  lerEtiqueta,
  produtoDaEtiqueta,
  quantidadeDaEtiqueta,
  montarEtiqueta,
} from "./balanca";
import { codigoInterno } from "./etiqueta";
import type { Produto } from "./types";

const prod = (p: Partial<Produto> = {}): Produto => ({
  id: "p1",
  nome: "Queijo mussarela",
  quantidade: 10,
  estoqueMinimo: 1,
  custo: 18,
  preco: 24.9,
  porPeso: true,
  criadoEm: "2026-01-01T00:00:00.000Z",
  ...p,
});

describe("dígito verificador EAN-13", () => {
  it("confere um código de fábrica conhecido", () => {
    // 7891000315507 (Nescau) — dígito verificador 7
    expect(digitoVerificadorEAN13("789100031550")).toBe(7);
    expect(ean13Valido("7891000315507")).toBe(true);
  });

  it("recusa código com um dígito trocado", () => {
    expect(ean13Valido("7891000315508")).toBe(false);
  });

  it("recusa o que não tem 13 dígitos", () => {
    expect(ean13Valido("789100031550")).toBe(false);
    expect(ean13Valido("")).toBe(false);
  });
});

describe("reconhecer etiqueta de balança", () => {
  it("é etiqueta quando começa com 2 e tem 13 dígitos", () => {
    expect(ehEtiquetaBalanca(montarEtiqueta(1, 0.5))).toBe(true);
  });

  it("código de fábrica não é etiqueta de balança", () => {
    expect(ehEtiquetaBalanca("7891000315507")).toBe(false);
  });

  it("tolera espaço e hífen que o leitor às vezes manda junto", () => {
    const e = montarEtiqueta(123, 0.315);
    const sujo = `${e.slice(0, 4)} ${e.slice(4, 8)}-${e.slice(8)}`;
    expect(ehEtiquetaBalanca(sujo)).toBe(true);
    expect(lerEtiqueta(sujo)?.codigo).toBe("123");
  });
});

describe("ler etiqueta de peso", () => {
  it("tira o código do produto e o peso em quilos", () => {
    const e = montarEtiqueta(123, 0.315);
    expect(lerEtiqueta(e, "peso")).toEqual({ codigo: "123", peso: 0.315 });
  });

  it("zero à esquerda no código é enchimento, não faz parte", () => {
    // A balança grava 000123; o produto cadastrado é o 123.
    expect(lerEtiqueta(montarEtiqueta("000123", 1), "peso")?.codigo).toBe("123");
  });

  it("peso de mais de um quilo também sai certo", () => {
    expect(lerEtiqueta(montarEtiqueta(45, 2.5), "peso")?.peso).toBe(2.5);
  });

  it("etiqueta amassada, com o verificador errado, é recusada", () => {
    // Ler errado viraria outro produto ou um peso absurdo. Melhor pedir
    // para passar de novo do que vender o item errado.
    const e = montarEtiqueta(123, 0.315);
    const errada = e.slice(0, 12) + ((Number(e[12]) + 1) % 10);
    expect(lerEtiqueta(errada)).toBeNull();
  });

  it("código de fábrica não é lido como etiqueta", () => {
    expect(lerEtiqueta("7891000315507")).toBeNull();
  });
});

describe("ler etiqueta de preço", () => {
  it("tira o total a pagar em reais", () => {
    const e = montarEtiqueta(123, 7.84, "preco");
    expect(lerEtiqueta(e, "preco")).toEqual({ codigo: "123", preco: 7.84 });
  });

  it("o mesmo código lido no formato errado dá outro número", () => {
    // Por isso o formato é escolhido pela loja e não adivinhado: R$ 7,84 e
    // 784 gramas são a MESMA sequência de dígitos. Ler no formato errado
    // não dá erro — dá um número plausível e errado, que é pior.
    const e = montarEtiqueta(123, 7.84, "preco");
    expect(lerEtiqueta(e, "preco")?.preco).toBe(7.84);
    expect(lerEtiqueta(e, "peso")?.peso).toBe(0.784);
  });
});

describe("achar o produto pela etiqueta", () => {
  const lista = [
    prod({ id: "a", nome: "Queijo", codigoBalanca: "123" }),
    prod({ id: "b", nome: "Presunto", codigoBalanca: "000045" }),
    prod({ id: "c", nome: "Arroz", codigoBalanca: "" }),
  ];

  it("acha pelo código curto da balança", () => {
    const e = lerEtiqueta(montarEtiqueta(123, 0.3))!;
    expect(produtoDaEtiqueta(lista, e)?.id).toBe("a");
  });

  it("zero à esquerda no cadastro não atrapalha", () => {
    const e = lerEtiqueta(montarEtiqueta(45, 0.3))!;
    expect(produtoDaEtiqueta(lista, e)?.id).toBe("b");
  });

  it("produto sem código de balança nunca é escolhido por engano", () => {
    // Sem esta guarda, o campo vazio casaria com qualquer código.
    const e = lerEtiqueta(montarEtiqueta(999, 0.3))!;
    expect(produtoDaEtiqueta(lista, e)).toBeUndefined();
  });
});

/**
 * O código do cadastro ganha do palpite da balança.
 *
 * "É etiqueta de balança" era só a forma: 13 dígitos começando com 2. Só
 * que o código interno que o PRÓPRIO sistema gera para produto sem código
 * de fábrica é 2 + 11 dígitos + verificador — a mesma forma, dígito por
 * dígito. O `lib/etiqueta.ts` já avisava que misturar os dois "faria a
 * frente de caixa ler um preço onde está um código", e era exatamente
 * isso que acontecia.
 *
 * O operador passa no leitor a etiqueta que a loja imprimiu e o sistema
 * responde que o produto não existe. Quando existe um produto com aquele
 * código de balança, é pior: entra no carrinho o produto errado, com um
 * peso inventado a partir do meio do código.
 *
 * O critério certo não é a forma, é a origem: código que está no cadastro
 * foi a loja que escreveu. Etiqueta de balança é única por pacote e nunca
 * vai estar cadastrada.
 */
describe("o cadastro ganha do palpite da balança", () => {
  const interno = () => codigoInterno(123456);

  it("mostra o estrago: o código interno lido como balança vira 23 kg de outro produto", () => {
    const e = lerEtiqueta(interno(), "peso")!;
    expect(e.codigo).toBe("1");
    expect(e.peso).toBe(23.456);
  });

  it("o código interno que o sistema gera não é lido como etiqueta", () => {
    const doce = prod({ id: "d", nome: "Doce da caixa", porPeso: false, codigoBarras: interno() });
    const queijo = prod({ id: "q", nome: "Queijo", codigoBalanca: "1" });
    // A forma continua sendo a de uma etiqueta: é o cadastro que desempata.
    expect(ehEtiquetaBalanca(interno())).toBe(true);
    expect(ehLeituraDeBalanca(interno(), [doce, queijo])).toBe(false);
  });

  it("etiqueta de balança de verdade continua sendo etiqueta", () => {
    const lista = [prod({ id: "q", codigoBalanca: "123" })];
    expect(ehLeituraDeBalanca(montarEtiqueta(123, 0.315), lista)).toBe(true);
  });

  it("sem nada casando no cadastro, o palpite da balança continua valendo", () => {
    // Produto de balança não cadastrado precisa cair no aviso da balança,
    // que diz onde cadastrar o código — e não em "nada encontrado".
    expect(ehLeituraDeBalanca(montarEtiqueta(777, 0.5), [])).toBe(true);
  });

  it("código de fábrica nunca é etiqueta de balança", () => {
    expect(ehLeituraDeBalanca("7891000315507", [])).toBe(false);
  });

  it("o SKU também é cadastro: quem digitou ali foi a loja", () => {
    const p = prod({ id: "x", sku: montarEtiqueta(99, 1.5) });
    expect(ehLeituraDeBalanca(montarEtiqueta(99, 1.5), [p])).toBe(false);
  });

  it("código interno com verificador quebrado também não vira etiqueta ilegível", () => {
    // Sem o cadastro na frente, este caía em "etiqueta ilegível, passe de
    // novo" — e passar de novo nunca ia resolver.
    const torto = "2" + "00000123456";
    const p = prod({ id: "y", codigoBarras: torto + "9" });
    expect(ehLeituraDeBalanca(torto + "9", [p])).toBe(false);
  });
});

describe("quantidade a lançar", () => {
  it("etiqueta de peso entra como está", () => {
    expect(quantidadeDaEtiqueta({ codigo: "1", peso: 0.315 }, 24.9)).toBe(0.315);
  });

  it("etiqueta de preço vira peso pela divisão, sem arredondar", () => {
    // Arredondar o peso e recalcular mudaria o total e ele deixaria de bater
    // com o valor impresso no pacote — que é o que o cliente vai conferir.
    const q = quantidadeDaEtiqueta({ codigo: "1", preco: 7.84 }, 24.9);
    expect(q * 24.9).toBeCloseTo(7.84, 10);
  });

  it("produto sem preço por quilo não gera divisão por zero", () => {
    expect(quantidadeDaEtiqueta({ codigo: "1", preco: 7.84 }, 0)).toBe(0);
  });
});

describe("montar etiqueta", () => {
  it("o que é montado é lido de volta igual", () => {
    for (const [cod, val] of [
      ["1", 0.001],
      ["999999", 99.999],
      ["50", 1],
    ] as const) {
      const e = montarEtiqueta(cod, val);
      expect(ean13Valido(e), e).toBe(true);
      expect(lerEtiqueta(e)?.peso).toBeCloseTo(val, 3);
    }
  });

  it("sempre devolve 13 dígitos", () => {
    expect(montarEtiqueta(1, 0.5)).toHaveLength(13);
    expect(montarEtiqueta("123456", 12.345)).toHaveLength(13);
  });
});
