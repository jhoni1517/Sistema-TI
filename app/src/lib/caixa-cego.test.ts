import { describe, it, expect } from "vitest";
import { resumoCaixa, esperadoPorForma, diferencasPorForma, diferencaTotal, diferencasPorOperador } from "./caixa";
import type { MovimentoCaixa, SessaoCaixa } from "./types";

const mov = (tipo: MovimentoCaixa["tipo"], valor: number, forma: string, sessaoId = "s1"): MovimentoCaixa =>
  ({ id: Math.random().toString(36), tipo, valor, formaPagamento: forma, categoria: "", descricao: "", data: "2026-09-25T12:00:00Z", sessaoId }) as MovimentoCaixa;

const sessao: SessaoCaixa = { id: "s1", abertoEm: "2026-09-25T08:00:00Z", valorAbertura: 100 };
const movs = [
  mov("entrada", 200, "dinheiro"),
  mov("entrada", 50, ""), // vazio é dinheiro
  mov("entrada", 3000, "credito"),
  mov("entrada", 400, "pix"),
  mov("saida", 500, "credito"), // estorno no cartão
  mov("saida", 30, "dinheiro"),
  mov("sangria", 100, "dinheiro"),
];

describe("esperado por forma", () => {
  it("dinheiro é o papel da gaveta; cartão desconta o estorno no cartão", () => {
    const e = esperadoPorForma(resumoCaixa(sessao, movs), movs);
    expect(e).toEqual({ dinheiro: 220, credito: 2500, pix: 400 });
  });
});

describe("diferença forma a forma", () => {
  const e = { dinheiro: 220, credito: 2500, pix: 400 };
  it("sobra, falta e forma não contada", () => {
    const l = diferencasPorForma(e, { dinheiro: 215, credito: 2500 });
    expect(l).toEqual([
      { forma: "dinheiro", esperado: 220, contado: 215, diferenca: -5 },
      { forma: "credito", esperado: 2500, contado: 2500, diferenca: 0 },
      { forma: "pix", esperado: 400 },
    ]);
    expect(diferencaTotal(l)).toBe(-5);
  });
  it("forma contada que o sistema não esperava aparece como sobra", () => {
    const l = diferencasPorForma({ dinheiro: 0 }, { dinheiro: 0, debito: 35.1 });
    expect(l.find((x) => x.forma === "debito")).toMatchObject({ esperado: 0, diferenca: 35.1 });
  });
  it("nada contado não é zero", () => {
    expect(diferencaTotal(diferencasPorForma(e, {}))).toBeUndefined();
  });
  it("centavo quebrado não vira 0.30000000000000004", () => {
    expect(diferencasPorForma({ dinheiro: 0.1 }, { dinheiro: 0.4 })[0].diferenca).toBe(0.3);
  });
});

describe("relatório por operador", () => {
  const fechada = (id: string, por: string, contado: Record<string, number>, fechadoEm = "2026-09-20T20:00:00Z"): SessaoCaixa => ({
    id,
    abertoEm: fechadoEm,
    fechadoEm,
    valorAbertura: 0,
    fechadoPor: por,
    esperadoPorForma: { dinheiro: 100, pix: 50 },
    contadoPorForma: contado,
    cego: true,
  });
  it("sobra e falta separadas; tolerância de 50 centavos; outro mês fica fora", () => {
    const r = diferencasPorOperador(
      [
        fechada("a", "Ana", { dinheiro: 50, pix: 50 }),
        fechada("b", "Ana", { dinheiro: 150, pix: 50 }),
        fechada("c", "Bia", { dinheiro: 100.3, pix: 50 }),
        fechada("d", "Bia", { dinheiro: 0 }, "2026-08-31T20:00:00Z"),
      ],
      [],
      "2026-09"
    );
    expect(r).toEqual([
      { operador: "Ana", fechamentos: 2, conferidos: 2, sobra: 50, falta: 50, liquido: 0, comDiferenca: 2 },
      { operador: "Bia", fechamentos: 1, conferidos: 1, sobra: 0, falta: 0, liquido: 0, comDiferenca: 0 },
    ]);
  });
  it("fechamento antigo (sem cego) usa a contagem da gaveta", () => {
    const antiga: SessaoCaixa = { id: "s1", abertoEm: "2026-09-25T08:00:00Z", fechadoEm: "2026-09-25T20:00:00Z", valorAbertura: 100, valorContado: 200, fechadoPor: "Caio" };
    const r = diferencasPorOperador([antiga], movs, "2026-09");
    expect(r[0]).toMatchObject({ operador: "Caio", falta: 20, conferidos: 1 });
  });
});
