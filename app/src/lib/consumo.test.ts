import { describe, it, expect } from "vitest";
import { saidasDeEstoque } from "./consumo";
import { giroDosProdutos, curvaABC, produtosParados, capitalParado } from "./giro";
import { sugestaoDeCompra } from "./reposicao";
import type { OrdemServico, Produto, Venda } from "./types";

const prod = (p: Partial<Produto> = {}): Produto =>
  ({
    id: "p1",
    nome: "Tela iPhone 11",
    quantidade: 2,
    estoqueMinimo: 1,
    custo: 200,
    preco: 450,
    criadoEm: "2026-01-01T00:00:00.000Z",
    ...p,
  }) as Produto;

const os = (o: Partial<OrdemServico> = {}): OrdemServico =>
  ({
    id: "o1",
    numero: 1,
    status: "entregue",
    entregueEm: "2026-07-20T14:00:00.000Z",
    criadoEm: "2026-07-10T09:00:00.000Z",
    atualizadoEm: "2026-07-20T14:00:00.000Z",
    maoDeObra: 100,
    desconto: 0,
    pecas: [
      { descricao: "Tela iPhone 11", produtoId: "p1", quantidade: 1, precoUnit: 450, custoUnit: 200 },
    ],
    historico: [],
    ...o,
  }) as OrdemServico;

const venda = (v: Partial<Venda> = {}): Venda =>
  ({
    id: "v1",
    numero: 1,
    itens: [{ produtoId: "p2", descricao: "Película", quantidade: 1, precoUnit: 30, custoUnit: 10 }],
    desconto: 0,
    formaPagamento: "dinheiro",
    criadoEm: "2026-07-20T10:00:00.000Z",
    ...v,
  }) as Venda;

/**
 * Peça de assistência técnica não sai por venda, sai por ordem de serviço.
 *
 * O giro, a curva ABC, os parados e a sugestão de compra olhavam só as
 * vendas do PDV. Numa mercearia isso é o mundo inteiro; na assistência —
 * que é o nicho em que este sistema nasceu — era zero.
 */
describe("o que sai pela ordem de serviço também é saída de estoque", () => {
  it("junta as saídas das vendas e das OS entregues", () => {
    const s = saidasDeEstoque([venda()], [os()]);
    expect(s).toHaveLength(2);
    expect(s.find((x) => x.produtoId === "p1")?.dia).toBe("2026-07-20");
  });

  it("OS que ainda está na bancada não conta", () => {
    // Enquanto o aparelho não saiu, a peça pode voltar para a prateleira.
    for (const status of ["aberta", "em_reparo", "pronta", "cancelada"] as const) {
      expect(saidasDeEstoque([], [os({ status })])).toHaveLength(0);
    }
  });

  it("só as peças do orçamento escolhido", () => {
    // Somar a fonte de 500W e a de 200W pediria reposição das duas.
    const o = os({
      opcaoEscolhida: "Opção 2",
      pecas: [
        { descricao: "Fonte 500W", produtoId: "a", quantidade: 1, precoUnit: 300, custoUnit: 180, opcao: "Opção 1" },
        { descricao: "Fonte 200W", produtoId: "b", quantidade: 1, precoUnit: 150, custoUnit: 90, opcao: "Opção 2" },
        { descricao: "Pasta térmica", produtoId: "c", quantidade: 1, precoUnit: 20, custoUnit: 5 },
      ],
    });
    const ids = saidasDeEstoque([], [o]).map((s) => s.produtoId).sort();
    expect(ids).toEqual(["b", "c"]);
  });

  it("sem data de entrega, cai na última mexida na OS", () => {
    const s = saidasDeEstoque([], [os({ entregueEm: undefined })]);
    expect(s[0].dia).toBe("2026-07-20");
  });
});

describe("giro e curva ABC contam a assistência técnica", () => {
  const hoje = "2026-07-25";

  it("a peça entregue na OS aparece no giro", () => {
    const g = giroDosProdutos([prod()], [], hoje, [os()]);
    expect(g[0].quantidade).toBe(1);
    expect(g[0].receita).toBe(450);
    expect(g[0].lucro).toBe(250);
    expect(g[0].ultimaVenda).toBe("2026-07-20");
  });

  it("sem as OS, a mesma peça aparecia zerada e parada há meses", () => {
    // É o estado antigo: a tela dizia que a peça trocada na semana passada
    // estava parada desde o cadastro.
    const g = giroDosProdutos([prod()], [], hoje);
    expect(g[0].quantidade).toBe(0);
    expect(g[0].diasParado).toBeGreaterThan(180);
  });

  it("a curva ABC deixa de vir vazia numa loja que só faz conserto", () => {
    const g = giroDosProdutos([prod()], [], hoje, [os()]);
    expect(curvaABC(g)).toHaveLength(1);
    expect(curvaABC(g)[0].classe).toBe("A");
  });

  it("a peça que gira não é mais listada como capital parado", () => {
    const g = giroDosProdutos([prod()], [], hoje, [os()]);
    expect(produtosParados(g, [prod()], 60)).toHaveLength(0);
    expect(capitalParado(produtosParados(g, [prod()], 60))).toBe(0);
  });
});

describe("sugestão de compra conta a assistência técnica", () => {
  const hoje = "2026-07-25";

  it("peça consumida em OS entra na sugestão", () => {
    // 2 telas em 30 dias, cobertura de 15 dias, 0 em estoque: pede 1.
    const p = prod({ quantidade: 0 });
    const ordens = [
      os({ id: "o1", entregueEm: "2026-07-05T10:00:00.000Z" }),
      os({ id: "o2", entregueEm: "2026-07-20T10:00:00.000Z" }),
    ];
    const s = sugestaoDeCompra([p], [], { hoje, ordens });
    expect(s).toHaveLength(1);
    expect(s[0].sugerido).toBe(1);
    expect(s[0].zerado).toBe(true);
  });

  it("sem as OS, a sugestão vinha vazia mesmo com a prateleira zerada", () => {
    const p = prod({ quantidade: 0 });
    expect(sugestaoDeCompra([p], [], { hoje })).toHaveLength(0);
  });

  it("OS fora da janela observada não puxa reposição", () => {
    const antiga = os({ entregueEm: "2026-01-10T10:00:00.000Z" });
    expect(sugestaoDeCompra([prod({ quantidade: 0 })], [], { hoje, ordens: [antiga] })).toHaveLength(0);
  });
});
