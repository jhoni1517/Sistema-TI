import { describe, it, expect } from "vitest";
import {
  totalMercadoria,
  totalDaEntrada,
  custoRateado,
  custoMedio,
  aplicarEntrada,
  problemaNaEntrada,
  avisosDeMargem,
  type Entrada,
} from "./entrada";
import type { Produto } from "./types";

const prod = (p: Partial<Produto>): Produto =>
  ({
    id: "p1",
    nome: "Produto",
    quantidade: 10,
    estoqueMinimo: 1,
    custo: 20,
    preco: 40,
    criadoEm: "2026-01-01",
    ...p,
  }) as Produto;

const entrada = (e: Partial<Entrada>): Entrada => ({ itens: [], ...e });

describe("custo médio ponderado", () => {
  it("sobrou 10 a 20 e chegaram 10 a 30: o custo vira 25", () => {
    // Trocar pelo custo novo reprecificaria o que já estava na prateleira e
    // inventaria prejuízo (ou lucro) que não existiu.
    expect(custoMedio(10, 20, 10, 30)).toBe(25);
  });

  it("pesa pela quantidade, não pela média simples", () => {
    // 90 a 10 e 10 a 20 dá 11, não 15.
    expect(custoMedio(90, 10, 10, 20)).toBe(11);
  });

  it("estoque zerado adota o custo novo", () => {
    expect(custoMedio(0, 999, 5, 30)).toBe(30);
  });

  it("estoque negativo conta como zero", () => {
    // Venda lançada antes da compra deixa saldo negativo. Usar o negativo
    // inverteria a média e daria um custo MAIOR que o da própria nota.
    expect(custoMedio(-5, 20, 10, 30)).toBe(30);
  });

  it("entrada sem quantidade não mexe no custo", () => {
    expect(custoMedio(10, 20, 0, 999)).toBe(20);
  });

  it("aplica no produto somando a quantidade e recalculando o custo", () => {
    const p = aplicarEntrada(prod({ quantidade: 10, custo: 20 }), 10, 30);
    expect(p.quantidade).toBe(20);
    expect(p.custo).toBe(25);
  });
});

describe("frete e desconto entram no custo", () => {
  const e = entrada({
    itens: [
      { produtoId: "a", descricao: "Caro", quantidade: 1, custoUnit: 900 },
      { produtoId: "b", descricao: "Barato", quantidade: 100, custoUnit: 1 },
    ],
    frete: 100,
  });

  it("o total da nota inclui o frete", () => {
    expect(totalMercadoria(e)).toBe(1000);
    expect(totalDaEntrada(e)).toBe(1100);
  });

  it("o rateio é pelo VALOR, não pela quantidade", () => {
    // Mil parafusos e uma placa-mãe não dividem o frete meio a meio. Ratear
    // por quantidade jogaria quase todo o frete nos parafusos.
    const r = custoRateado(e);
    expect(r.a).toBe(990); // 900 + 90% dos 100 de frete
    expect(r.b).toBe(1.1); // 1 + 10% dos 100, dividido por 100 unidades
  });

  it("desconto do fornecedor baixa o custo", () => {
    const r = custoRateado(
      entrada({ itens: [{ produtoId: "a", descricao: "x", quantidade: 10, custoUnit: 10 }], desconto: 20 })
    );
    expect(r.a).toBe(8);
  });

  it("desconto maior que a nota não gera custo negativo", () => {
    const r = custoRateado(
      entrada({ itens: [{ produtoId: "a", descricao: "x", quantidade: 1, custoUnit: 10 }], desconto: 999 })
    );
    expect(r.a).toBe(0);
  });

  it("o que saiu do caixa nunca é negativo", () => {
    expect(totalDaEntrada(entrada({ itens: [], desconto: 500 }))).toBe(0);
  });

  it("nota de itens a custo zero divide o frete igual entre eles", () => {
    const r = custoRateado(
      entrada({
        itens: [
          { produtoId: "a", descricao: "x", quantidade: 1, custoUnit: 0 },
          { produtoId: "b", descricao: "y", quantidade: 1, custoUnit: 0 },
        ],
        frete: 10,
      })
    );
    expect(r.a).toBe(5);
    expect(r.b).toBe(5);
  });
});

describe("recusas antes de gravar", () => {
  const produtos = [prod({ id: "a" })];

  it("recusa nota sem item", () => {
    expect(problemaNaEntrada(entrada({}), produtos)).toContain("Nenhum item");
  });

  it("recusa produto que não está cadastrado", () => {
    const e = entrada({
      itens: [{ produtoId: "z", descricao: "Fantasma", quantidade: 1, custoUnit: 5 }],
    });
    expect(problemaNaEntrada(e, produtos)).toContain("Fantasma");
  });

  it("recusa custo e frete negativos", () => {
    expect(
      problemaNaEntrada(
        entrada({ itens: [{ produtoId: "a", descricao: "x", quantidade: 1, custoUnit: -1 }] }),
        produtos
      )
    ).toContain("negativo");
    expect(
      problemaNaEntrada(
        entrada({
          itens: [{ produtoId: "a", descricao: "x", quantidade: 1, custoUnit: 1 }],
          frete: -5,
        }),
        produtos
      )
    ).toContain("Frete negativo");
  });

  it("recusa desconto maior que a nota", () => {
    const e = entrada({
      itens: [{ produtoId: "a", descricao: "x", quantidade: 1, custoUnit: 10 }],
      desconto: 50,
    });
    expect(problemaNaEntrada(e, produtos)).toContain("maior que o valor");
  });

  it("nota certa não gera recusa", () => {
    const e = entrada({
      itens: [{ produtoId: "a", descricao: "x", quantidade: 5, custoUnit: 10 }],
    });
    expect(problemaNaEntrada(e, produtos)).toBe("");
  });
});

describe("aviso de margem quando o fornecedor sobe o preço", () => {
  it("aponta o item que ficou com margem apertada", () => {
    // A loja só descobre isso no relatório do mês seguinte, depois de vender
    // o lote inteiro apertado.
    const produtos = [prod({ id: "a", quantidade: 0, custo: 20, preco: 40 })];
    const e = entrada({
      itens: [{ produtoId: "a", descricao: "x", quantidade: 10, custoUnit: 38 }],
    });
    const [aviso] = avisosDeMargem(e, produtos, 10);
    expect(aviso.custoDepois).toBe(38);
    expect(aviso.margemDepois).toBe(5);
    expect(aviso.noPrejuizo).toBe(false);
  });

  it("marca prejuízo quando o custo passa do preço de venda", () => {
    const produtos = [prod({ id: "a", quantidade: 0, custo: 20, preco: 40 })];
    const e = entrada({
      itens: [{ produtoId: "a", descricao: "x", quantidade: 1, custoUnit: 45 }],
    });
    expect(avisosDeMargem(e, produtos, 10)[0].noPrejuizo).toBe(true);
  });

  it("custo que baixou não vira aviso", () => {
    const produtos = [prod({ id: "a", quantidade: 0, custo: 30, preco: 40 })];
    const e = entrada({
      itens: [{ produtoId: "a", descricao: "x", quantidade: 1, custoUnit: 10 }],
    });
    expect(avisosDeMargem(e, produtos, 10)).toEqual([]);
  });

  it("margem confortável não vira aviso", () => {
    const produtos = [prod({ id: "a", quantidade: 0, custo: 20, preco: 100 })];
    const e = entrada({
      itens: [{ produtoId: "a", descricao: "x", quantidade: 1, custoUnit: 25 }],
    });
    expect(avisosDeMargem(e, produtos, 10)).toEqual([]);
  });

  it("o pior caso aparece primeiro", () => {
    const produtos = [
      prod({ id: "a", quantidade: 0, custo: 10, preco: 40 }),
      prod({ id: "b", quantidade: 0, custo: 10, preco: 40 }),
    ];
    const e = entrada({
      itens: [
        { produtoId: "a", descricao: "x", quantidade: 1, custoUnit: 38 },
        { produtoId: "b", descricao: "y", quantidade: 1, custoUnit: 45 },
      ],
    });
    expect(avisosDeMargem(e, produtos, 10).map((x) => x.produtoId)).toEqual(["b", "a"]);
  });
});
