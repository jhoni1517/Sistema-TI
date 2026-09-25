import { describe, it, expect } from "vitest";
import { venceEm, dinheiroParado, alertasDeGarantia, entradaDaPeca, rmaDaPeca, mudarStatusRMA, problemaNoRMA, resultadoRMA } from "./rma";
import type { MovimentoCaixa, RMA } from "./types";

const base = (x: Partial<RMA>): RMA => ({
  id: "r",
  descricao: "Tela A15",
  quantidade: 1,
  valor: 200,
  fornecedor: "Distribuidora X",
  garantiaFornecedorDias: 90,
  status: "enviar",
  historico: [],
  criadoEm: "2026-09-01T10:00:00Z",
  atualizadoEm: "2026-09-01T10:00:00Z",
  ...x,
});

const entrada = (id: string, data: string, custo: number, fornecedor = "Distribuidora X"): MovimentoCaixa =>
  ({ id, tipo: "saida", categoria: "Compra de peça", descricao: "", valor: custo, formaPagamento: "pix", compraEstoque: true, data, fornecedor, numeroNota: "123", itensEntrada: [{ produtoId: "tela", quantidade: 5, custoUnit: custo }] }) as MovimentoCaixa;

describe("prazo do fornecedor", () => {
  it("compra + dias; sem data de compra não inventa", () => {
    expect(venceEm({ dataCompra: "2026-07-01", garantiaFornecedorDias: 90 })).toBe("2026-09-29");
    expect(venceEm({ garantiaFornecedorDias: 90 })).toBeNull();
  });
  it("alerta só para peça ainda não enviada, perto de vencer ou vencida", () => {
    const l = alertasDeGarantia(
      [
        base({ id: "a", dataCompra: "2026-07-01" }), // vence 29/09
        base({ id: "b", dataCompra: "2026-06-01" }), // venceu
        base({ id: "c", dataCompra: "2026-09-01" }), // longe
        base({ id: "d", dataCompra: "2026-07-01", status: "enviado" }),
      ],
      "2026-09-25"
    );
    expect(l.map((x) => [x.rma.id, x.dias])).toEqual([
      ["b", -26],
      ["a", 4],
    ]);
    expect(l[0].texto).toMatch(/venceu há 26/);
  });
});

describe("dinheiro parado", () => {
  it("soma a enviar e enviado, com quantidade", () => {
    expect(dinheiroParado([base({ quantidade: 2 }), base({ status: "enviado", valor: 50.1 }), base({ status: "trocado" })])).toBe(450.1);
  });
  it("resultado: trocado e crédito voltam, negado é perda", () => {
    const r = resultadoRMA([
      mudarStatusRMA(base({}), "trocado", "x"),
      mudarStatusRMA(base({}), "credito", "x", "", 150),
      base({ status: "negado", valor: 80 }),
      base({}),
    ]);
    expect(r).toEqual({ recuperado: 350, perdido: 80, parado: 200 });
  });
});

describe("de onde veio a peça", () => {
  const movs = [entrada("m1", "2026-06-01T10:00:00Z", 180), entrada("m2", "2026-08-01T10:00:00Z", 210), entrada("m3", "2026-09-20T10:00:00Z", 250)];
  it("última entrada ANTES da OS original", () => {
    expect(entradaDaPeca("tela", "2026-08-15T00:00:00Z", movs)?.movimento.id).toBe("m2");
    expect(entradaDaPeca("tela", "2026-05-01", movs)).toBeNull();
    expect(entradaDaPeca(undefined, "2026-12-01", movs)).toBeNull();
  });
  it("RMA preenchido com fornecedor, nota, data e custo da compra", () => {
    const r = rmaDaPeca(
      { id: "os2", numero: 52, criadoEm: "2026-09-24T10:00:00Z", defeitoRelatado: "Tela com listras" },
      { produtoId: "tela", descricao: "Tela A15", quantidade: 1, custoUnit: 999, precoUnit: 400 },
      movs,
      { id: "r1", agora: "2026-09-25T10:00:00Z" },
      60,
      { criadoEm: "2026-08-15T10:00:00Z" }
    );
    expect(r).toMatchObject({ osNumero: 52, fornecedor: "Distribuidora X", numeroNota: "123", dataCompra: "2026-08-01", valor: 210, movimentoEntradaId: "m2", garantiaFornecedorDias: 60, defeito: "Tela com listras", status: "enviar" });
  });
  it("peça sem entrada registrada usa o custo da própria OS", () => {
    const r = rmaDaPeca({ id: "o", numero: 1, criadoEm: "2026-01-01", defeitoRelatado: "" }, { descricao: "Bateria", quantidade: 1, custoUnit: 55, precoUnit: 120 }, [], { id: "r", agora: "x" });
    expect(r).toMatchObject({ valor: 55, fornecedor: "", dataCompra: undefined });
    expect(problemaNoRMA(r)).toMatch(/fornecedor/);
  });
});

describe("status", () => {
  it("histórico cresce; crédito exige valor", () => {
    const r = mudarStatusRMA(base({}), "enviado", "2026-09-25", "Correios BR123");
    expect(r.historico.at(-1)).toEqual({ data: "2026-09-25", status: "enviado", obs: "Correios BR123" });
    expect(() => mudarStatusRMA(base({}), "credito", "x")).toThrow(/crédito/);
  });
});
