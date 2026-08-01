import { describe, it, expect } from "vitest";
import {
  resumoCaixa,
  movimentosDaSessao,
  sessoesFechadas,
  sessaoAberta,
  conferencia,
} from "./caixa";
import type { MovimentoCaixa, SessaoCaixa } from "./types";

const mov = (m: Partial<MovimentoCaixa> = {}): MovimentoCaixa => ({
  id: Math.random().toString(36).slice(2),
  tipo: "entrada",
  categoria: "Venda",
  descricao: "venda",
  valor: 100,
  formaPagamento: "dinheiro",
  data: "2026-07-28T10:00:00.000Z",
  ...m,
});

const sessao = (s: Partial<SessaoCaixa> = {}): SessaoCaixa => ({
  id: "s1",
  abertoEm: "2026-07-28T08:00:00.000Z",
  valorAbertura: 50,
  ...s,
});

describe("resumoCaixa", () => {
  it("saldo é abertura mais entradas menos saídas e sangrias", () => {
    const r = resumoCaixa(sessao({ valorAbertura: 22 }), [
      mov({ valor: 29.9 }),
      mov({ tipo: "saida", valor: 10 }),
      mov({ tipo: "sangria", valor: 5 }),
    ]);
    expect(r.abertura).toBe(22);
    expect(r.entradas).toBe(29.9);
    expect(r.saidas).toBe(10);
    expect(r.sangrias).toBe(5);
    expect(r.saldo).toBeCloseTo(36.9, 2);
  });

  it("sem sessão, a abertura é zero em vez de quebrar", () => {
    expect(resumoCaixa(null, [mov({ valor: 40 })]).saldo).toBe(40);
  });

  it("separa as entradas por forma de pagamento, e só as entradas", () => {
    const r = resumoCaixa(sessao(), [
      mov({ valor: 30, formaPagamento: "credito" }),
      mov({ valor: 20, formaPagamento: "credito" }),
      mov({ valor: 15, formaPagamento: "pix" }),
      // Saída no cartão não pode aparecer como se fosse recebimento
      mov({ tipo: "saida", valor: 99, formaPagamento: "credito" }),
    ]);
    expect(r.porForma).toEqual({ credito: 50, pix: 15 });
  });

  it("conta quantas movimentações a sessão teve", () => {
    expect(resumoCaixa(sessao(), [mov(), mov(), mov()]).quantidade).toBe(3);
  });
});

describe("conferência da gaveta", () => {
  it("sem contagem a diferença é indefinida, não zero", () => {
    // Zero diria "conferi e bateu", que é bem diferente de "ninguém contou".
    const r = resumoCaixa(sessao(), [mov()]);
    expect(r.contado).toBeUndefined();
    expect(r.diferenca).toBeUndefined();
    expect(conferencia(r)).toBe("nao_conferido");
  });

  it("acusa falta quando a gaveta tem menos do que devia", () => {
    const r = resumoCaixa(sessao({ valorAbertura: 50, valorContado: 100 }), [mov({ valor: 100 })]);
    expect(r.saldo).toBe(150);
    expect(r.diferenca).toBe(-50);
    expect(conferencia(r)).toBe("falta");
  });

  it("acusa sobra quando tem mais", () => {
    const r = resumoCaixa(sessao({ valorAbertura: 0, valorContado: 120 }), [mov({ valor: 100 })]);
    expect(r.diferenca).toBe(20);
    expect(conferencia(r)).toBe("sobra");
  });

  it("centavo de troco não vira alarme todo dia", () => {
    // Diferença de moeda acontece sempre; alerta que aparece sempre para
    // de ser lido, e aí o alerta de verdade passa junto.
    const r = resumoCaixa(sessao({ valorAbertura: 0, valorContado: 100.3 }), [mov({ valor: 100 })]);
    expect(conferencia(r)).toBe("certo");
    expect(conferencia(r, 0.1)).toBe("sobra");
  });

  it("contar exatamente zero é uma contagem válida", () => {
    // Gaveta vazia depois de uma sangria total é resultado legítimo, e não
    // pode ser confundido com "não conferido".
    const r = resumoCaixa(sessao({ valorAbertura: 0, valorContado: 0 }), []);
    expect(r.contado).toBe(0);
    expect(r.diferenca).toBe(0);
    expect(conferencia(r)).toBe("certo");
  });

  it("não deixa o centavo virar dízima na comparação", () => {
    const r = resumoCaixa(sessao({ valorAbertura: 0, valorContado: 0.3 }), [
      mov({ valor: 0.1 }),
      mov({ valor: 0.2 }),
    ]);
    expect(r.diferenca).toBe(0);
  });
});

describe("movimentosDaSessao", () => {
  it("pega só o que é da sessão", () => {
    const s = sessao();
    const dela = mov({ sessaoId: "s1" });
    const deOutra = mov({ sessaoId: "s2" });
    expect(movimentosDaSessao(s, [dela, deOutra])).toEqual([dela]);
  });

  it("sem sessão aberta mostra o movimento de hoje", () => {
    const hoje = mov({ data: new Date().toISOString() });
    const antigo = mov({ data: "2020-01-01T10:00:00.000Z" });
    expect(movimentosDaSessao(null, [hoje, antigo])).toEqual([hoje]);
  });
});

describe("listas de sessões", () => {
  const a = sessao({ id: "a", abertoEm: "2026-07-26T08:00:00.000Z", fechadoEm: "2026-07-26T18:00:00.000Z" });
  const b = sessao({ id: "b", abertoEm: "2026-07-28T08:00:00.000Z", fechadoEm: "2026-07-28T18:00:00.000Z" });
  const aberta = sessao({ id: "c", abertoEm: "2026-07-29T08:00:00.000Z" });

  it("fechadas vêm da mais recente para a mais antiga", () => {
    expect(sessoesFechadas([a, b, aberta]).map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("a sessão sem fechamento é a aberta", () => {
    expect(sessaoAberta([a, b, aberta])?.id).toBe("c");
    expect(sessaoAberta([a, b])).toBeNull();
  });
});

/**
 * O limite da gaveta é sobre PAPEL.
 *
 * O aviso de sangria olhava o saldo, que soma cartão e Pix. Um dia com
 * R$ 3.000 na maquininha disparava o aviso sem ter um centavo a mais na
 * gaveta — e aviso que dispara sem motivo é aviso que a pessoa ignora.
 */
describe("dinheiro em espécie na gaveta", () => {
  it("cartão e Pix não entram", () => {
    const movs = [
      mov({ id: "a", tipo: "entrada", valor: 3000, formaPagamento: "credito" }),
      mov({ id: "b", tipo: "entrada", valor: 100, formaPagamento: "dinheiro" }),
    ];
    const r = resumoCaixa(sessao({ valorAbertura: 50 }), movs);
    expect(r.saldo).toBe(3150);
    expect(r.emEspecie).toBe(150);
  });

  it("a abertura conta: o troco começa o dia na gaveta", () => {
    expect(resumoCaixa(sessao({ valorAbertura: 200 }), []).emEspecie).toBe(200);
  });

  it("saída e sangria saem da gaveta", () => {
    const movs = [
      mov({ id: "a", tipo: "entrada", valor: 500, formaPagamento: "dinheiro" }),
      mov({ id: "b", tipo: "saida", valor: 80 }),
      mov({ id: "c", tipo: "sangria", valor: 300 }),
    ];
    expect(resumoCaixa(sessao({ valorAbertura: 100 }), movs).emEspecie).toBe(220);
  });

  it("dia só de cartão deixa na gaveta apenas o troco de abertura", () => {
    const movs = [mov({ tipo: "entrada", valor: 900, formaPagamento: "pix" })];
    expect(resumoCaixa(sessao({ valorAbertura: 100 }), movs).emEspecie).toBe(100);
  });
});
