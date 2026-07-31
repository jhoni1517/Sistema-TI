import { describe, it, expect } from "vitest";
import { aposBaixa, aposRetorno, faltaNoEstoque, avisoDeFalta } from "./estoque";
import type { Produto } from "./types";

const prod = (p: Partial<Produto>): Produto =>
  ({
    id: "p1",
    nome: "Fonte 500W",
    quantidade: 5,
    estoqueMinimo: 1,
    custo: 100,
    preco: 200,
    criadoEm: "",
    ...p,
  }) as Produto;

describe("baixa de estoque", () => {
  it("desconta o que saiu", () => {
    expect(aposBaixa(prod({ quantidade: 5 }), 2)).toBe(3);
  });

  it("DEIXA ficar negativo: o zero apagava a prova de que falta uma entrada", () => {
    // Vender 3 de um item que o sistema acha que tem 1 significa que 2
    // unidades entraram sem ninguém lançar. Com o saldo em 0 não há nada
    // para procurar; com -2 a contagem acha.
    expect(aposBaixa(prod({ quantidade: 1 }), 3)).toBe(-2);
  });

  it("serviço não tem estoque para mexer", () => {
    expect(aposBaixa(prod({ servico: true, quantidade: 0 }), 99)).toBe(0);
  });

  it("quilo não vira dízima: 0.3 - 0.1 tem que dar 0.2", () => {
    // Sem arredondar dá 0.19999999999999998, e a tela mostra o lixo inteiro.
    expect(aposBaixa(prod({ quantidade: 0.3, porPeso: true }), 0.1)).toBe(0.2);
  });

  it("estoque zerado por peso fica exatamente zero", () => {
    expect(aposBaixa(prod({ quantidade: 0.3, porPeso: true }), 0.3)).toBe(0);
  });

  it("quantidade inválida não estraga o saldo", () => {
    expect(aposBaixa(prod({ quantidade: 5 }), NaN)).toBe(5);
    expect(aposBaixa(prod({ quantidade: 5 }), undefined as unknown as number)).toBe(5);
  });
});

describe("retorno ao estoque", () => {
  it("devolução soma de volta", () => {
    expect(aposRetorno(prod({ quantidade: 3 }), 2)).toBe(5);
  });

  it("negativo volta a subir, não pula para o valor devolvido", () => {
    expect(aposRetorno(prod({ quantidade: -2 }), 1)).toBe(-1);
  });

  it("serviço continua sem estoque", () => {
    expect(aposRetorno(prod({ servico: true, quantidade: 0 }), 5)).toBe(0);
  });
});

describe("o que vai ficar negativo se fechar agora", () => {
  const estoque = [prod({ id: "p1", quantidade: 5 }), prod({ id: "p2", nome: "SSD", quantidade: 0 })];

  it("carrinho dentro do estoque não acusa nada", () => {
    expect(faltaNoEstoque([{ produtoId: "p1", quantidade: 5 }], estoque)).toEqual([]);
  });

  it("acusa o que estoura, com o saldo que vai sobrar", () => {
    const f = faltaNoEstoque([{ produtoId: "p2", quantidade: 2 }], estoque);
    expect(f).toHaveLength(1);
    expect(f[0].saida).toBe(2);
    expect(f[0].sobra).toBe(-2);
  });

  it("SOMA as linhas do mesmo produto: 3 + 3 num estoque de 5 estoura", () => {
    // Conferir item a item deixava passar, que é o caso mais comum no
    // balcão — o mesmo produto entra duas vezes no carrinho.
    const f = faltaNoEstoque(
      [
        { produtoId: "p1", quantidade: 3 },
        { produtoId: "p1", quantidade: 3 },
      ],
      estoque
    );
    expect(f).toHaveLength(1);
    expect(f[0].sobra).toBe(-1);
  });

  it("item avulso sem produto não acusa nada", () => {
    expect(faltaNoEstoque([{ quantidade: 99 }], estoque)).toEqual([]);
  });

  it("serviço nunca acusa falta", () => {
    const so = [prod({ id: "s1", servico: true, quantidade: 0 })];
    expect(faltaNoEstoque([{ produtoId: "s1", quantidade: 10 }], so)).toEqual([]);
  });
});

describe("o texto do aviso", () => {
  it("sem falta, não tem aviso", () => {
    expect(avisoDeFalta([])).toBe("");
  });

  it("diz o nome, quanto sai e quanto fica, e o que fazer", () => {
    const t = avisoDeFalta([{ produto: prod({ quantidade: 1 }), saida: 3, sobra: -2 }]);
    expect(t).toContain("Fonte 500W");
    expect(t).toContain("saem 3");
    expect(t).toContain("fica -2");
    expect(t).toContain("Contagem");
  });

  it("sem emoji: em alguns aparelhos chega como interrogação", () => {
    const t = avisoDeFalta([{ produto: prod({}), saida: 3, sobra: -2 }]);
    expect(t).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
