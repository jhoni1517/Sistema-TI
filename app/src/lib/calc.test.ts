import { describe, it, expect } from "vitest";
import {
  totalOS,
  totalPecas,
  custoPecas,
  lucroOS,
  receitaBruta,
  totalDespesas,
  despesasOperacionais,
  comprasEstoque,
  custoProdutos,
  lucroLiquido,
  saldoCaixa,
  ehCompraEstoque,
  totalSangrias,
  pagoFiado,
  saldoFiado,
  taxaArmazenamento,
} from "./calc";
import type { MovimentoCaixa, OrdemServico } from "./types";

/**
 * Contas de dinheiro.
 *
 * Este arquivo existe por um motivo específico: o sistema já mostrou
 * PREJUÍZO de R$ 100 num serviço que deu R$ 200 de lucro, porque a mesma
 * peça era descontada duas vezes. Enquanto estes testes passarem, aquele
 * erro não volta sem alguém perceber.
 */

const mov = (m: Partial<MovimentoCaixa>): MovimentoCaixa =>
  ({
    id: "x",
    tipo: "entrada",
    categoria: "Venda",
    descricao: "",
    valor: 0,
    formaPagamento: "pix",
    data: "2026-07-01",
    ...m,
  }) as MovimentoCaixa;

describe("lucro: compra de estoque não pode ser descontada duas vezes", () => {
  // Compra uma peça por 300 e vende o serviço por 500
  const movs = [
    mov({ tipo: "saida", valor: 300, categoria: "Compra de peça", compraEstoque: true }),
    mov({ tipo: "entrada", valor: 500, custoRelacionado: 300 }),
  ];

  it("o lucro é 200, não -100", () => {
    expect(lucroLiquido(movs)).toBe(200);
  });

  it("o saldo do caixa continua refletindo o dinheiro que saiu", () => {
    expect(saldoCaixa(movs, 0)).toBe(200);
  });

  it("a compra aparece separada, como investimento em estoque", () => {
    expect(comprasEstoque(movs)).toBe(300);
    expect(despesasOperacionais(movs)).toBe(0);
  });

  it("mas continua contando como saída de caixa", () => {
    expect(totalDespesas(movs)).toBe(300);
  });

  it("uma despesa de verdade desconta do lucro normalmente", () => {
    const comAluguel = [...movs, mov({ tipo: "saida", valor: 1000, categoria: "Aluguel" })];
    expect(lucroLiquido(comAluguel)).toBe(-800);
  });
});

describe("reconhecimento de compra de estoque", () => {
  it("lançamento antigo, sem a marca, é reconhecido pela categoria", () => {
    expect(ehCompraEstoque(mov({ tipo: "saida", categoria: "Compra de peça" }))).toBe(true);
    expect(ehCompraEstoque(mov({ tipo: "saida", categoria: "Fornecedor" }))).toBe(true);
  });

  it("aluguel nunca é compra de estoque", () => {
    expect(ehCompraEstoque(mov({ tipo: "saida", categoria: "Aluguel" }))).toBe(false);
  });

  it("a marcação explícita vence a categoria", () => {
    expect(
      ehCompraEstoque(mov({ tipo: "saida", categoria: "Compra de peça", compraEstoque: false }))
    ).toBe(false);
  });

  it("entrada nunca é compra de estoque, mesmo com a categoria parecida", () => {
    expect(ehCompraEstoque(mov({ tipo: "entrada", categoria: "Compra de peça" }))).toBe(false);
  });
});

describe("sangria", () => {
  const movs = [
    mov({ tipo: "entrada", valor: 500 }),
    mov({ tipo: "sangria", valor: 200, categoria: "Sangria" }),
  ];

  it("não mexe no lucro: é retirada, não despesa", () => {
    expect(lucroLiquido(movs)).toBe(500);
  });

  it("mas reduz o dinheiro em caixa", () => {
    expect(saldoCaixa(movs, 0)).toBe(300);
    expect(totalSangrias(movs)).toBe(200);
  });
});

describe("valores da ordem de serviço", () => {
  const os = (o: Partial<OrdemServico>): OrdemServico => ({ pecas: [], ...o }) as OrdemServico;

  it("soma peças, mão de obra e desconta o desconto", () => {
    const o = os({
      pecas: [{ descricao: "Tela", quantidade: 2, precoUnit: 100, custoUnit: 60 }],
      maoDeObra: 80,
      desconto: 30,
    });
    expect(totalPecas(o)).toBe(200);
    expect(totalOS(o)).toBe(250);
    expect(custoPecas(o)).toBe(120);
    expect(lucroOS(o)).toBe(130);
  });

  it("aguenta OS sem peças vinda da nuvem", () => {
    expect(totalOS(os({ pecas: null as never, maoDeObra: 80 }))).toBe(80);
  });

  it("aguenta valores nulos dentro das peças", () => {
    const o = os({
      pecas: [{ descricao: "x", quantidade: null, precoUnit: null, custoUnit: null }] as never,
    });
    expect(totalPecas(o)).toBe(0);
    expect(custoPecas(o)).toBe(0);
  });
});

describe("robustez contra dados nulos da nuvem", () => {
  it("movimento com valor nulo não vira NaN", () => {
    expect(receitaBruta([mov({ tipo: "entrada", valor: null as never })])).toBe(0);
  });

  it("fiado sem lista de pagamentos", () => {
    expect(pagoFiado({ pagamentos: null } as never)).toBe(0);
    expect(saldoFiado({ valor: 100, pagamentos: null } as never)).toBe(100);
  });

  it("saldo devedor nunca fica negativo", () => {
    expect(
      saldoFiado({ valor: 100, pagamentos: [{ valor: 150, data: "", formaPagamento: "pix" }] } as never)
    ).toBe(0);
  });

  it("custo embutido soma só o que existe", () => {
    expect(custoProdutos([mov({ custoRelacionado: 50 }), mov({})])).toBe(50);
  });
});

describe("taxa de armazenamento", () => {
  const base = (o: Partial<OrdemServico>): OrdemServico =>
    ({ status: "pronta", pecas: [], ...o }) as OrdemServico;

  it("não cobra enquanto está dentro do prazo", () => {
    const ontem = new Date(Date.now() - 86400000).toISOString();
    expect(taxaArmazenamento(base({ prontaEm: ontem }), 5, 90).valor).toBe(0);
  });

  it("cobra só os dias que passaram do prazo", () => {
    const dezDias = new Date(Date.now() - 10 * 86400000).toISOString();
    const t = taxaArmazenamento(base({ prontaEm: dezDias }), 5, 7);
    expect(t.diasExcedidos).toBe(3);
    expect(t.valor).toBe(15);
  });

  it("não cobra quando a taxa está zerada", () => {
    const dezDias = new Date(Date.now() - 10 * 86400000).toISOString();
    expect(taxaArmazenamento(base({ prontaEm: dezDias }), 0, 7).valor).toBe(0);
  });

  it("não cobra OS que ainda não ficou pronta", () => {
    expect(taxaArmazenamento(base({ status: "em_reparo" }), 5, 7).valor).toBe(0);
  });
});
