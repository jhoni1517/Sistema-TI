import { describe, it, expect } from "vitest";
import { lotesRestantes, validadeEfetiva, vencidasNaSaida, comLoteNovo, problemaNoLote } from "./lotes";
import { situacaoValidade } from "./pdv";
import type { Produto } from "./types";

const lote = (validade: string, quantidade: number) => ({ validade, quantidade, entradaEm: "2026-09-01" });
const p = (quantidade: number, lotes = [lote("2026-10-10", 24), lote("2026-10-20", 24)], validade?: string) =>
  ({ id: "x", nome: "Cerveja", quantidade, lotes, validade }) as Produto;

describe("lotesRestantes", () => {
  it("o que sobra é o que vence por último", () => {
    expect(lotesRestantes(p(30))).toEqual([
      { validade: "2026-10-10", quantidade: 6 },
      { validade: "2026-10-20", quantidade: 24 },
    ]);
  });
  it("lote que acabou some", () => {
    expect(lotesRestantes(p(20))).toEqual([{ validade: "2026-10-20", quantidade: 20 }]);
  });
  it("estoque sem lote (de antes, ou ajuste para cima) é o mais velho e sai primeiro", () => {
    expect(lotesRestantes(p(50, undefined, "2026-10-01"))).toEqual([
      { validade: "2026-10-01", quantidade: 2, semLote: true },
      { validade: "2026-10-10", quantidade: 24 },
      { validade: "2026-10-20", quantidade: 24 },
    ]);
  });
  it("estoque zerado ou negativo não tem lote", () => {
    expect(lotesRestantes(p(0))).toEqual([]);
    expect(lotesRestantes(p(-3))).toEqual([]);
  });
  it("fração de quilo não vira dízima", () => {
    expect(lotesRestantes(p(0.3, [lote("2026-10-10", 0.1), lote("2026-10-20", 0.2)]))).toEqual([
      { validade: "2026-10-10", quantidade: 0.1 },
      { validade: "2026-10-20", quantidade: 0.2 },
    ]);
  });
});

describe("validadeEfetiva e o alerta", () => {
  it("é a do lote que sai primeiro, e muda sozinha quando ele acaba", () => {
    expect(validadeEfetiva(p(30))).toBe("2026-10-10");
    expect(validadeEfetiva(p(20))).toBe("2026-10-20");
  });
  it("sem lotes, é o campo de sempre", () => {
    expect(validadeEfetiva({ validade: "2026-11-01", quantidade: 5 })).toBe("2026-11-01");
  });
  it("o alerta de vencido olha o lote que sai primeiro", () => {
    expect(situacaoValidade(p(30), 7, "2026-10-12")).toBe("vencido");
    expect(situacaoValidade(p(20), 7, "2026-10-12")).toBe("ok");
  });
});

describe("vencidasNaSaida", () => {
  it("conta quantas das próximas unidades estão vencidas", () => {
    expect(vencidasNaSaida(p(30), 4, "2026-10-12")).toBe(4);
    expect(vencidasNaSaida(p(30), 10, "2026-10-12")).toBe(6);
    expect(vencidasNaSaida(p(30), 10, "2026-10-10")).toBe(0); // vence hoje ainda vale
  });
});

describe("comLoteNovo", () => {
  it("guarda só os lotes vivos e acrescenta o novo", () => {
    const l = comLoteNovo(p(20), "2026-11-05", 12, "2026-10-01");
    expect(l.map((x) => [x.validade, x.quantidade])).toEqual([
      ["2026-10-20", 20],
      ["2026-11-05", 12],
    ]);
    // Depois da entrada o estoque é 32, e a conta fecha
    expect(lotesRestantes({ quantidade: 32, lotes: l })).toEqual([
      { validade: "2026-10-20", quantidade: 20 },
      { validade: "2026-11-05", quantidade: 12 },
    ]);
  });
  it("mesma validade soma no mesmo lote", () => {
    const l = comLoteNovo(p(30), "2026-10-20", 6, "2026-10-01");
    expect(l.find((x) => x.validade === "2026-10-20")?.quantidade).toBe(30);
    expect(l).toHaveLength(2);
  });
  it("produto sem lote nenhum: o estoque antigo continua sem lote, e sai primeiro", () => {
    const antigo = { id: "y", nome: "Refri", quantidade: 10, validade: "2026-10-05" } as Produto;
    const l = comLoteNovo(antigo, "2026-12-01", 12, "2026-10-01");
    expect(l).toEqual([{ validade: "2026-12-01", quantidade: 12, entradaEm: "2026-10-01" }]);
    expect(lotesRestantes({ ...antigo, quantidade: 22, lotes: l })[0]).toEqual({ validade: "2026-10-05", quantidade: 10, semLote: true });
  });
});

it("problemaNoLote", () => {
  expect(problemaNoLote("", 5)).toContain("validade");
  expect(problemaNoLote("2026-10-10", 0)).toContain("Quantas");
  expect(problemaNoLote("2026-10-10", 5)).toBe("");
});

describe("vencidasDaVenda", () => {
  it("soma as linhas do mesmo produto e diz quantas saem vencidas", async () => {
    const { vencidasDaVenda } = await import("./lotes");
    const itens = [
      { produtoId: "x", descricao: "", quantidade: 4, precoUnit: 5 },
      { produtoId: "x", descricao: "", quantidade: 4, precoUnit: 5 },
    ];
    expect(vencidasDaVenda(itens as never, [p(30)], "2026-10-12")).toContain("6 de 8");
    expect(vencidasDaVenda(itens as never, [p(20)], "2026-10-12")).toBe("");
  });
});
