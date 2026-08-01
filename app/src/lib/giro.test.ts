import { describe, it, expect } from "vitest";
import {
  giroDosProdutos,
  curvaABC,
  produtosParados,
  capitalParado,
} from "./giro";
import type { Produto, Venda, ItemVenda } from "./types";

const prod = (p: Partial<Produto>): Produto =>
  ({
    id: "p1",
    nome: "Produto",
    quantidade: 10,
    estoqueMinimo: 1,
    custo: 5,
    preco: 10,
    criadoEm: "2026-01-01T00:00:00.000Z",
    ...p,
  }) as Produto;

const item = (i: Partial<ItemVenda>): ItemVenda => ({
  descricao: "Item",
  quantidade: 1,
  precoUnit: 10,
  custoUnit: 5,
  ...i,
});

const venda = (itens: ItemVenda[], criadoEm: string): Venda =>
  ({
    id: `v-${criadoEm}`,
    numero: 1,
    itens,
    desconto: 0,
    formaPagamento: "dinheiro",
    criadoEm,
    ...{},
  }) as Venda;

describe("giro do produto", () => {
  it("soma quantidade, receita e lucro de cada produto", () => {
    const produtos = [prod({ id: "a", nome: "Arroz", custo: 20, preco: 30 })];
    const vendas = [
      venda([item({ produtoId: "a", quantidade: 2, precoUnit: 30, custoUnit: 20 })], "2026-07-01T10:00:00Z"),
      venda([item({ produtoId: "a", quantidade: 1, precoUnit: 30, custoUnit: 20 })], "2026-07-05T10:00:00Z"),
    ];
    const [g] = giroDosProdutos(produtos, vendas, "2026-07-10");
    expect(g.quantidade).toBe(3);
    expect(g.receita).toBe(90);
    expect(g.lucro).toBe(30);
    expect(g.vendas).toBe(2);
    expect(g.ultimaVenda).toBe("2026-07-05");
    expect(g.diasParado).toBe(5);
  });

  it("item lançado à mão casa pelo nome, senão o produto some do relatório", () => {
    // Item avulso não tem produtoId. Sem casar pelo nome, o produto ficaria
    // eternamente como "nunca vendido".
    const produtos = [prod({ id: "a", nome: "Arroz" })];
    const vendas = [venda([item({ descricao: "arroz", quantidade: 1 })], "2026-07-01T10:00:00Z")];
    expect(giroDosProdutos(produtos, vendas, "2026-07-02")[0].quantidade).toBe(1);
  });

  it("produto nunca vendido conta os dias desde o cadastro", () => {
    const produtos = [prod({ id: "a", criadoEm: "2026-05-01T00:00:00.000Z" })];
    const [g] = giroDosProdutos(produtos, [], "2026-07-01");
    expect(g.quantidade).toBe(0);
    expect(g.ultimaVenda).toBe("");
    expect(g.diasParado).toBe(61);
  });

  it("serviço fica de fora: não ocupa prateleira nem empata capital", () => {
    const produtos = [prod({ id: "a" }), prod({ id: "s", servico: true })];
    expect(giroDosProdutos(produtos, [], "2026-07-01").map((g) => g.produtoId)).toEqual(["a"]);
  });

  it("mostra o dinheiro parado na prateleira, a custo", () => {
    // A preço de venda o número fica bonito e mente: o que a loja perde se
    // aquilo não sair é o que ela pagou.
    const [g] = giroDosProdutos([prod({ custo: 8, quantidade: 25 })], [], "2026-07-01");
    expect(g.valorEmEstoque).toBe(200);
  });
});

describe("curva ABC", () => {
  const cenario = () => {
    const produtos = [
      prod({ id: "a", nome: "Campeão" }),
      prod({ id: "b", nome: "Médio" }),
      prod({ id: "c", nome: "Cauda" }),
      prod({ id: "d", nome: "Sobra" }),
    ];
    const vendas = [
      venda([item({ produtoId: "a", quantidade: 80, precoUnit: 10, custoUnit: 5 })], "2026-07-01T10:00:00Z"),
      venda([item({ produtoId: "b", quantidade: 15, precoUnit: 10, custoUnit: 5 })], "2026-07-01T10:00:00Z"),
      venda([item({ produtoId: "c", quantidade: 4, precoUnit: 10, custoUnit: 5 })], "2026-07-01T10:00:00Z"),
      venda([item({ produtoId: "d", quantidade: 1, precoUnit: 10, custoUnit: 5 })], "2026-07-01T10:00:00Z"),
    ];
    return curvaABC(giroDosProdutos(produtos, vendas, "2026-07-02"));
  };

  it("classifica do que mais fatura para o que menos fatura", () => {
    expect(cenario().map((i) => i.produtoId)).toEqual(["a", "b", "c", "d"]);
  });

  it("o item que cruza os 80% ainda é A: é o que não pode faltar", () => {
    const abc = cenario();
    expect(abc[0].classe).toBe("A"); // 80% sozinho
    expect(abc[1].classe).toBe("B"); // entra em 80%, acumula 95%
    expect(abc[2].classe).toBe("C");
  });

  it("as fatias somam o faturamento inteiro", () => {
    const abc = cenario();
    expect(abc[abc.length - 1].acumulado).toBeCloseTo(1, 10);
    expect(abc.reduce((s, i) => s + i.fatia, 0)).toBeCloseTo(1, 10);
  });

  it("produto sem venda no período fica fora da curva", () => {
    const produtos = [prod({ id: "a" }), prod({ id: "z" })];
    const vendas = [venda([item({ produtoId: "a", quantidade: 1 })], "2026-07-01T10:00:00Z")];
    const abc = curvaABC(giroDosProdutos(produtos, vendas, "2026-07-02"));
    expect(abc.map((i) => i.produtoId)).toEqual(["a"]);
  });

  it("sem venda nenhuma não existe curva, e o relatório não inventa uma", () => {
    expect(curvaABC(giroDosProdutos([prod({})], [], "2026-07-01"))).toEqual([]);
  });

  it("produto único é A: sozinho ele é o faturamento inteiro", () => {
    const vendas = [venda([item({ produtoId: "p1", quantidade: 1 })], "2026-07-01T10:00:00Z")];
    expect(curvaABC(giroDosProdutos([prod({})], vendas, "2026-07-02"))[0].classe).toBe("A");
  });
});

describe("o que está parado", () => {
  it("lista o que tem estoque e não vende há tempo, do mais caro para o mais barato", () => {
    const produtos = [
      prod({ id: "caro", custo: 100, quantidade: 5, criadoEm: "2026-01-01T00:00:00.000Z" }),
      prod({ id: "barato", custo: 2, quantidade: 5, criadoEm: "2026-01-01T00:00:00.000Z" }),
    ];
    const giro = giroDosProdutos(produtos, [], "2026-07-01");
    expect(produtosParados(giro, produtos, 60).map((g) => g.produtoId)).toEqual([
      "caro",
      "barato",
    ]);
  });

  it("produto zerado não é problema de prateleira", () => {
    // Ele não ocupa espaço nem dinheiro. Listá-lo só pede atenção à toa.
    const produtos = [prod({ id: "a", quantidade: 0, criadoEm: "2026-01-01T00:00:00.000Z" })];
    expect(produtosParados(giroDosProdutos(produtos, [], "2026-07-01"), produtos, 60)).toEqual(
      []
    );
  });

  it("o que vendeu ontem não é parado", () => {
    const produtos = [prod({ id: "a" })];
    const vendas = [venda([item({ produtoId: "a", quantidade: 1 })], "2026-06-30T10:00:00Z")];
    const giro = giroDosProdutos(produtos, vendas, "2026-07-01");
    expect(produtosParados(giro, produtos, 60)).toEqual([]);
  });

  it("o limite de dias é ajustável e conta a partir dele", () => {
    const produtos = [prod({ id: "a", criadoEm: "2026-06-01T00:00:00.000Z" })];
    const giro = giroDosProdutos(produtos, [], "2026-07-01"); // 30 dias
    expect(produtosParados(giro, produtos, 30)).toHaveLength(1);
    expect(produtosParados(giro, produtos, 31)).toHaveLength(0);
  });

  it("soma o capital preso no que não gira", () => {
    const produtos = [
      prod({ id: "a", custo: 10, quantidade: 3, criadoEm: "2026-01-01T00:00:00.000Z" }),
      prod({ id: "b", custo: 20, quantidade: 2, criadoEm: "2026-01-01T00:00:00.000Z" }),
    ];
    const parados = produtosParados(giroDosProdutos(produtos, [], "2026-07-01"), produtos, 60);
    expect(capitalParado(parados)).toBe(70);
  });
});
