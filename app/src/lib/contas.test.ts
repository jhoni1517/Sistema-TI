import { describe, it, expect } from "vitest";
import {
  proximoVencimento,
  diasAteVencer,
  situacaoConta,
  pagarConta,
  contasParaAvisar,
  totalAPagarNoMes,
  totalAtrasado,
  custoFixoMensal,
  gastosPorCategoria,
  progressoMeta,
} from "./contas";
import type { ContaPagar, Meta } from "./types";

/**
 * Contas fixas e objetivos.
 * A aritmética de vencimento é o ponto frágil: conta do dia 31 não pode
 * sumir em fevereiro nem ficar presa no dia 28 para sempre.
 */

const C = (o: Partial<ContaPagar>): ContaPagar =>
  ({
    id: "1",
    descricao: "Aluguel",
    categoria: "Aluguel",
    valor: 1500,
    vencimento: "2026-07-27",
    recorrencia: "mensal",
    lembreteDias: 3,
    ativo: true,
    pagamentos: [],
    criadoEm: "",
    ...o,
  }) as ContaPagar;

describe("próximo vencimento", () => {
  it("31/01 vira 28/02, não pula para março", () => {
    expect(proximoVencimento("2026-01-31", "mensal")).toBe("2026-02-28");
  });

  it("e volta para o dia 31 no mês seguinte", () => {
    expect(proximoVencimento("2026-02-28", "mensal", 31)).toBe("2026-03-31");
  });

  it("respeita ano bissexto", () => {
    expect(proximoVencimento("2028-01-31", "mensal")).toBe("2028-02-29");
  });

  it("vira o ano corretamente", () => {
    expect(proximoVencimento("2026-12-31", "mensal")).toBe("2027-01-31");
  });

  it("29/02 + 1 ano cai em 28/02", () => {
    expect(proximoVencimento("2028-02-29", "anual")).toBe("2029-02-28");
  });

  it("semanal soma 7 dias", () => {
    expect(proximoVencimento("2026-07-27", "semanal")).toBe("2026-08-03");
  });

  it("trimestral soma 3 meses", () => {
    expect(proximoVencimento("2026-01-15", "trimestral")).toBe("2026-04-15");
  });

  it("conta avulsa não avança", () => {
    expect(proximoVencimento("2026-07-27", "unica")).toBe("2026-07-27");
  });
});

describe("dias e situação", () => {
  it("conta os dias sem deixar o fuso deslocar", () => {
    expect(diasAteVencer("2026-07-27", "2026-07-27")).toBe(0);
    expect(diasAteVencer("2026-07-20", "2026-07-27")).toBe(-7);
    expect(diasAteVencer("2026-08-01", "2026-07-27")).toBe(5);
  });

  it("classifica pela urgência", () => {
    expect(situacaoConta(C({ vencimento: "2026-07-27" }), "2026-07-27")).toBe("vence_hoje");
    expect(situacaoConta(C({ vencimento: "2026-07-25" }), "2026-07-27")).toBe("atrasada");
    expect(situacaoConta(C({ vencimento: "2026-07-29" }), "2026-07-27")).toBe("proxima");
    expect(situacaoConta(C({ vencimento: "2026-08-15" }), "2026-07-27")).toBe("futura");
  });

  it("conta desligada para de cobrar", () => {
    expect(situacaoConta(C({ vencimento: "2026-07-01", ativo: false }), "2026-07-27")).toBe("inativa");
  });

  it("avulsa já paga fica quitada", () => {
    const paga = C({
      recorrencia: "unica",
      vencimento: "2026-07-01",
      pagamentos: [{ data: "x", valor: 100, formaPagamento: "pix", referencia: "2026-07-01" }],
    });
    expect(situacaoConta(paga, "2026-07-27")).toBe("paga");
  });
});

describe("pagamento", () => {
  it("recorrente anda para o ciclo seguinte e preserva o dia original", () => {
    let c = C({ vencimento: "2026-01-31" });
    c = pagarConta(c, { valor: 1500, formaPagamento: "pix", data: "2026-01-30T10:00:00Z" });
    expect(c.vencimento).toBe("2026-02-28");
    expect(c.pagamentos[0].referencia).toBe("2026-01-31");

    c = pagarConta(c, { valor: 1500, formaPagamento: "pix" });
    expect(c.vencimento).toBe("2026-03-31");
  });

  it("avulsa não muda o vencimento", () => {
    const c = pagarConta(C({ recorrencia: "unica" }), { valor: 200, formaPagamento: "dinheiro" });
    expect(c.vencimento).toBe("2026-07-27");
  });
});

describe("totais", () => {
  const contas = [
    C({ id: "a", vencimento: "2026-07-10", valor: 1500 }),
    C({ id: "b", vencimento: "2026-07-27", valor: 300 }),
    C({ id: "c", vencimento: "2026-08-05", valor: 200 }),
    C({ id: "d", vencimento: "2026-07-30", valor: 99, ativo: false }),
  ];

  it("total do mês ignora desligada e outro mês", () => {
    expect(totalAPagarNoMes(contas, "2026-07-27")).toBe(1800);
  });

  it("soma o que está atrasado", () => {
    expect(totalAtrasado(contas, "2026-07-27")).toBe(1500);
  });

  it("avisa em ordem de urgência", () => {
    expect(contasParaAvisar(contas, "2026-07-27").map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("custo fixo soma só as ativas", () => {
    expect(custoFixoMensal(contas)).toBe(2000);
  });
});

describe("gastos por categoria", () => {
  const movs = [
    { tipo: "saida", valor: 1500, categoria: "Aluguel", data: "2026-07-05" },
    { tipo: "saida", valor: 500, categoria: "Energia", data: "2026-07-10" },
    { tipo: "saida", valor: 2000, categoria: "Aluguel", data: "2026-06-05" },
    { tipo: "entrada", valor: 9999, categoria: "Venda", data: "2026-07-01" },
  ] as never;

  it("considera só as saídas do mês pedido", () => {
    expect(gastosPorCategoria(movs, "2026-07")).toHaveLength(2);
  });

  it("ordena do maior para o menor, com a fatia certa", () => {
    const g = gastosPorCategoria(movs, "2026-07");
    expect(g[0].categoria).toBe("Aluguel");
    expect(g[0].valor).toBe(1500);
    expect(Math.round(g[0].fatia)).toBe(75);
  });

  it("mês sem gasto devolve vazio em vez de quebrar", () => {
    expect(gastosPorCategoria(movs, "2020-01")).toEqual([]);
  });
});

describe("objetivos", () => {
  const M = (o: Partial<Meta>): Meta =>
    ({ id: "m", titulo: "t", periodo: "mensal", ativo: true, criadoEm: "", ...o }) as Meta;

  const movs = [
    { tipo: "entrada", valor: 5000, custoRelacionado: 1000, data: "2026-07-05" },
    { tipo: "saida", valor: 800, categoria: "Aluguel", data: "2026-07-06" },
    { tipo: "saida", valor: 300, categoria: "Compra de peça", data: "2026-07-07" },
  ] as never;

  it("faturamento mede a receita do período", () => {
    const p = progressoMeta(M({ tipo: "faturamento", alvo: 10000 }), movs, [], "2026-07-27");
    expect(p.percentual).toBe(50);
    expect(p.atingida).toBe(false);
  });

  it("lucro não desconta compra de estoque duas vezes", () => {
    const p = progressoMeta(M({ tipo: "lucro", alvo: 3000 }), movs, [], "2026-07-27");
    expect(p.atual).toBe(3200);
    expect(p.atingida).toBe(true);
  });

  it("teto de gastos conta só despesa operacional", () => {
    const p = progressoMeta(M({ tipo: "teto_gasto", alvo: 1000 }), movs, [], "2026-07-27");
    expect(p.atual).toBe(800);
    expect(p.atingida).toBe(true);
    expect(p.estourou).toBe(false);
  });

  it("passar do teto é fracasso, não sucesso", () => {
    const p = progressoMeta(M({ tipo: "teto_gasto", alvo: 500 }), movs, [], "2026-07-27");
    expect(p.estourou).toBe(true);
    expect(p.atingida).toBe(false);
  });

  it("conta só as OS entregues dentro do período", () => {
    const ordens = [
      { status: "entregue", entregueEm: "2026-07-10" },
      { status: "entregue", entregueEm: "2026-06-10" },
      { status: "pronta", entregueEm: "2026-07-11" },
    ] as never;
    expect(progressoMeta(M({ tipo: "os", alvo: 2 }), [], ordens, "2026-07-27").atual).toBe(1);
  });
});
