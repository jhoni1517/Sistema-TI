import { describe, it, expect } from "vitest";
import {
  sugestaoDeCompra,
  custoDaReposicao,
  minimoSugerido,
  mensagemDePedido,
} from "./reposicao";
import type { Produto, Venda } from "./types";

const prod = (p: Partial<Produto>): Produto =>
  ({
    id: "p1",
    nome: "Arroz",
    quantidade: 10,
    estoqueMinimo: 2,
    custo: 20,
    preco: 30,
    criadoEm: "2026-01-01",
    ...p,
  }) as Produto;

/** Uma venda por dia, para simular consumo constante */
const vendasDiarias = (produtoId: string, porDia: number, dias: number): Venda[] =>
  Array.from({ length: dias }, (_, i) => ({
    id: `v${i}`,
    numero: i,
    itens: [{ produtoId, descricao: "x", quantidade: porDia, precoUnit: 30, custoUnit: 20 }],
    desconto: 0,
    formaPagamento: "dinheiro" as const,
    criadoEm: new Date(Date.UTC(2026, 5, 11 + i, 10)).toISOString(),
  })) as Venda[];

describe("sugestão de compra pelo consumo real", () => {
  it("calcula a saída por dia e quanto falta para a cobertura", () => {
    // 2 por dia durante 30 dias = 60 no período. Cobertura de 15 dias pede
    // 30 unidades; com 10 em estoque, faltam 20.
    const produtos = [prod({ id: "a", quantidade: 10 })];
    const [r] = sugestaoDeCompra(produtos, vendasDiarias("a", 2, 30), {
      diasObservados: 30,
      coberturaDias: 15,
      hoje: "2026-07-10",
    });
    expect(r.porDia).toBe(2);
    expect(r.sugerido).toBe(20);
    expect(r.custo).toBe(400);
  });

  it("o que não sai NÃO entra na sugestão", () => {
    // Girar zero e ainda pedir reposição é exatamente como o estoque encalha
    // — e o estoque mínimo do cadastro avisa os dois do mesmo jeito.
    const produtos = [prod({ id: "parado", quantidade: 1, estoqueMinimo: 50 })];
    expect(sugestaoDeCompra(produtos, [], { hoje: "2026-07-10" })).toEqual([]);
  });

  it("prateleira vazia de coisa que ninguém pede NÃO é falta", () => {
    // É acerto. Esse item pertence a "produtos parados" (lib/giro.ts), não à
    // lista de compras. Foi este caso que revelou um ramo de código morto:
    // ele tentava tratar "zerado que já vendeu" como exceção, e era
    // inalcançável — se vendeu na janela, porDia nunca é zero.
    const produtos = [prod({ id: "a", quantidade: 0, estoqueMinimo: 5 })];
    const vendaAntiga = vendasDiarias("a", 1, 1);
    expect(
      sugestaoDeCompra(produtos, vendaAntiga, { diasObservados: 5, hoje: "2026-08-30" })
    ).toEqual([]);
  });

  it("mas item zerado que SAIU na janela é o mais urgente de todos", () => {
    const produtos = [prod({ id: "a", quantidade: 0 })];
    const [r] = sugestaoDeCompra(produtos, vendasDiarias("a", 2, 30), {
      diasObservados: 30,
      coberturaDias: 15,
      hoje: "2026-07-10",
    });
    expect(r.zerado).toBe(true);
    expect(r.urgente).toBe(true);
    expect(r.diasAteAcabar).toBe(0);
  });

  it("estoque suficiente para a cobertura não aparece", () => {
    const produtos = [prod({ id: "a", quantidade: 1000 })];
    expect(
      sugestaoDeCompra(produtos, vendasDiarias("a", 1, 30), { hoje: "2026-07-10" })
    ).toEqual([]);
  });

  it("zerado primeiro, depois o que acaba antes", () => {
    const produtos = [
      prod({ id: "sobrando", quantidade: 20 }),
      prod({ id: "zerado", quantidade: 0 }),
      prod({ id: "acabando", quantidade: 2 }),
    ];
    const vendas = [
      ...vendasDiarias("sobrando", 2, 30),
      ...vendasDiarias("zerado", 2, 30),
      ...vendasDiarias("acabando", 2, 30),
    ];
    const r = sugestaoDeCompra(produtos, vendas, {
      diasObservados: 30,
      coberturaDias: 15,
      hoje: "2026-07-10",
    });
    expect(r[0].produtoId).toBe("zerado");
    expect(r[1].produtoId).toBe("acabando");
  });

  it("não existe comprar 2,3 unidades — arredonda para cima", () => {
    const produtos = [prod({ id: "a", quantidade: 0 })];
    const vendas = vendasDiarias("a", 1, 7);
    const r = sugestaoDeCompra(produtos, vendas, {
      diasObservados: 30,
      coberturaDias: 15,
      hoje: "2026-07-10",
    });
    expect(Number.isInteger(r[0].sugerido)).toBe(true);
  });

  it("produto por quilo aceita fração", () => {
    const produtos = [prod({ id: "a", quantidade: 0, porPeso: true })];
    const vendas = vendasDiarias("a", 0.5, 10);
    const [r] = sugestaoDeCompra(produtos, vendas, {
      diasObservados: 30,
      coberturaDias: 15,
      hoje: "2026-07-10",
    });
    expect(Number.isInteger(r.sugerido)).toBe(false);
  });

  it("serviço fica de fora: não tem prateleira para repor", () => {
    const produtos = [prod({ id: "s", servico: true, quantidade: 0 })];
    expect(sugestaoDeCompra(produtos, vendasDiarias("s", 5, 30), { hoje: "2026-07-10" })).toEqual(
      []
    );
  });

  it("venda fora da janela observada não conta", () => {
    const produtos = [prod({ id: "a", quantidade: 0 })];
    const antigas = vendasDiarias("a", 5, 5); // junho
    expect(
      sugestaoDeCompra(produtos, antigas, { diasObservados: 3, hoje: "2026-12-01" })
    ).toEqual([]);
  });

  it("marca como urgente o que acaba antes da metade da cobertura", () => {
    const produtos = [prod({ id: "a", quantidade: 4 })]; // 2 dias a 2/dia
    const [r] = sugestaoDeCompra(produtos, vendasDiarias("a", 2, 30), {
      diasObservados: 30,
      coberturaDias: 15,
      hoje: "2026-07-10",
    });
    expect(r.diasAteAcabar).toBe(2);
    expect(r.urgente).toBe(true);
  });

  it("soma quanto custa a compra inteira", () => {
    const produtos = [
      prod({ id: "a", quantidade: 0, custo: 10 }),
      prod({ id: "b", quantidade: 0, custo: 5 }),
    ];
    const vendas = [...vendasDiarias("a", 1, 30), ...vendasDiarias("b", 1, 30)];
    const r = sugestaoDeCompra(produtos, vendas, {
      diasObservados: 30,
      coberturaDias: 10,
      hoje: "2026-07-10",
    });
    expect(custoDaReposicao(r)).toBe(150); // 10 unidades de cada
  });
});

describe("estoque mínimo sugerido", () => {
  it("diz quanto o mínimo deveria ser pelo consumo", () => {
    // Sai 2 por dia; para cobrir uma semana, o mínimo é 14.
    const p = prod({ id: "a" });
    expect(minimoSugerido(p, vendasDiarias("a", 2, 30), {
      diasObservados: 30,
      coberturaDias: 7,
      hoje: "2026-07-10",
    })).toBe(14);
  });

  it("produto que não sai não precisa de mínimo", () => {
    expect(minimoSugerido(prod({ id: "a" }), [], { hoje: "2026-07-10" })).toBe(0);
  });
});

describe("mensagem para o fornecedor", () => {
  it("lista o que pedir, com a quantidade", () => {
    const produtos = [prod({ id: "a", nome: "Arroz 5kg", quantidade: 0 })];
    const r = sugestaoDeCompra(produtos, vendasDiarias("a", 1, 30), {
      diasObservados: 30,
      coberturaDias: 10,
      hoje: "2026-07-10",
    });
    const texto = mensagemDePedido(r, "Mercado do Zé");
    expect(texto).toContain("Mercado do Zé");
    expect(texto).toContain("- Arroz 5kg: 10");
  });

  it("lista vazia não gera mensagem", () => {
    expect(mensagemDePedido([], "Loja")).toBe("");
  });

  it("não sai emoji: pedido sujo vira mercadoria errada na entrega", () => {
    const produtos = [prod({ id: "a", quantidade: 0 })];
    const r = sugestaoDeCompra(produtos, vendasDiarias("a", 1, 30), {
      diasObservados: 30,
      hoje: "2026-07-10",
    });
    expect(/\p{Extended_Pictographic}/u.test(mensagemDePedido(r, "Loja"))).toBe(false);
  });
});
