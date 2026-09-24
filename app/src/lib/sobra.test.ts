import { describe, it, expect } from "vitest";
import { taxaDoCartao, sobraDoMes, mesAnterior, comparar, metaProLabore } from "./sobra";
import type { MovimentoCaixa } from "./types";

const m = (x: Partial<MovimentoCaixa>): MovimentoCaixa =>
  ({ id: Math.random().toString(), tipo: "entrada", categoria: "Venda", descricao: "", valor: 0, formaPagamento: "dinheiro", data: "2026-09-10T12:00:00Z", ...x }) as MovimentoCaixa;
const utc = (iso: string) => iso.slice(0, 7);

const movs = [
  m({ valor: 1000, formaPagamento: "credito", custoRelacionado: 400 }),
  m({ valor: 500, formaPagamento: "debito", custoRelacionado: 100 }),
  m({ valor: 300, formaPagamento: "dinheiro" }),
  m({ tipo: "saida", categoria: "Aluguel", valor: 600, formaPagamento: "pix" }),
  m({ tipo: "saida", categoria: "Compra de peça", valor: 900, compraEstoque: true }),
  m({ tipo: "saida", categoria: "Fatura", valor: 200, faturaCartao: true }),
  m({ tipo: "sangria", categoria: "Sangria", valor: 250 }),
  m({ valor: 999, data: "2026-08-20T12:00:00Z", custoRelacionado: 0 }),
];

describe("quanto sobrou", () => {
  it("taxa da maquininha só sobre entrada na forma dela", () => {
    expect(taxaDoCartao(movs.slice(0, 4), { credito: 3.5, debito: 1.5 })).toBe(42.5); // 35 + 7,50
    expect(taxaDoCartao(movs, {})).toBe(0);
  });

  it("faturamento − custo − despesas do mês − taxa", () => {
    const s = sobraDoMes(movs, "2026-09", { credito: 3.5, debito: 1.5 }, utc);
    expect(s).toEqual({ faturamento: 1800, custoMercadoria: 500, despesas: 600, taxas: 42.5, sobra: 657.5 });
  });

  it("compra de estoque, fatura do cartão e sangria não saem da sobra", () => {
    const s = sobraDoMes(movs, "2026-09", {}, utc);
    expect(s.despesas).toBe(600);
  });

  it("outro mês não se mistura", () => {
    expect(sobraDoMes(movs, "2026-08", {}, utc).faturamento).toBe(999);
  });

  it("taxa absurda é travada em 30%", () => {
    expect(taxaDoCartao([m({ valor: 100, formaPagamento: "credito" })], { credito: 500 })).toBe(30);
  });
});

describe("comparação e meta", () => {
  it("mês anterior, inclusive na virada de ano", () => {
    expect(mesAnterior("2026-09")).toBe("2026-08");
    expect(mesAnterior("2026-01")).toBe("2025-12");
  });
  it("diferença e %; mês passado zerado não vira %", () => {
    expect(comparar(1200, 1000)).toEqual({ diferenca: 200, pct: 20 });
    expect(comparar(500, 0)).toEqual({ diferenca: 500, pct: null });
    expect(comparar(-100, 400)).toEqual({ diferenca: -500, pct: -125 });
  });
  it("meta de pró-labore: quanto cobriu e quanto falta", () => {
    expect(metaProLabore(1500, 3000)).toEqual({ pct: 50, falta: 1500 });
    expect(metaProLabore(4000, 3000)).toEqual({ pct: 100, falta: 0 });
    expect(metaProLabore(-200, 3000)).toEqual({ pct: 0, falta: 3200 });
    expect(metaProLabore(100, 0)).toBeNull();
  });
});
