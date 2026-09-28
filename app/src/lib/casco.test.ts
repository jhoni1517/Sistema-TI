import { describe, it, expect } from "vitest";
import {
  cascosDaVenda,
  saldoDoCliente,
  pendentesPorCliente,
  problemaNoCasco,
  lancamentosDaVenda,
  problemaNaDevolucao,
  tiposDeCasco,
} from "./casco";
import type { LancamentoCasco, Produto } from "./types";

const prod = (id: string, casco?: string, x: Partial<Produto> = {}) => ({ id, nome: id, casco, ...x }) as Produto;
const produtos = [prod("skol", "Garrafa 600ml"), prod("brahma", " Garrafa  600ml "), prod("engr", "Engradado"), prod("lata"), prod("granel", "Garrafa 600ml", { porPeso: true })];
const l = (clienteId: string, tipo: string, quantidade: number): LancamentoCasco => ({ id: Math.random().toString(), clienteId, tipo, quantidade, criadoEm: "2026-09-27" });
let n = 0;
const id = () => `c${++n}`;

describe("cascosDaVenda", () => {
  it("soma por tipo, junta marcas do mesmo vasilhame e ignora quem não tem casco", () => {
    const itens = [
      { produtoId: "skol", descricao: "", quantidade: 6, precoUnit: 8 },
      { produtoId: "brahma", descricao: "", quantidade: 6, precoUnit: 8 },
      { produtoId: "engr", descricao: "", quantidade: 1, precoUnit: 0 },
      { produtoId: "lata", descricao: "", quantidade: 12, precoUnit: 4 },
      { produtoId: "granel", descricao: "", quantidade: 1.5, precoUnit: 4 },
    ];
    expect(cascosDaVenda(itens as never, produtos)).toEqual({ "Garrafa 600ml": 12, Engradado: 1 });
  });
});

describe("saldo", () => {
  const lanc = [l("ana", "Garrafa 600ml", 12), l("ana", "Garrafa 600ml", -8), l("ana", "Engradado", 1), l("ana", "Engradado", -1), l("bia", "Garrafa 600ml", 3)];
  it("levou 12, devolveu 8: ficam 4; o que zerou some", () => {
    expect(saldoDoCliente(lanc, "ana")).toEqual({ "Garrafa 600ml": 4 });
  });
  it("pendentes por cliente", () => {
    expect(pendentesPorCliente(lanc)).toEqual({ ana: 4, bia: 3 });
  });
});

describe("problemaNoCasco", () => {
  const levou = { "Garrafa 600ml": 12 };
  it("trouxe tudo: passa sem cliente (é a troca no balcão)", () => {
    expect(problemaNoCasco(levou, {}, undefined)).toBe("");
    expect(problemaNoCasco(levou, { "Garrafa 600ml": 12 }, undefined)).toBe("");
  });
  it("vai ficar casco com o cliente: sem cliente, recusa dizendo quantos", () => {
    expect(problemaNoCasco(levou, { "Garrafa 600ml": 8 }, undefined)).toContain("4 cascos");
    expect(problemaNoCasco(levou, { "Garrafa 600ml": 8 }, "ana")).toBe("");
  });
  it("número quebrado ou negativo é recusado", () => {
    expect(problemaNoCasco(levou, { "Garrafa 600ml": 2.5 }, "ana")).toContain("inteiro");
    expect(problemaNoCasco(levou, { "Garrafa 600ml": -1 }, "ana")).toContain("inteiro");
  });
  it("trouxe a mais só vale se devia de antes", () => {
    expect(problemaNoCasco(levou, { "Garrafa 600ml": 15 }, "ana", { "Garrafa 600ml": 3 })).toBe("");
    expect(problemaNoCasco(levou, { "Garrafa 600ml": 15 }, "ana", { "Garrafa 600ml": 2 })).toContain("a mais");
  });
});

describe("lancamentosDaVenda", () => {
  const venda = { id: "v1", numero: 7, clienteId: "ana", criadoEm: "2026-09-27T10:00:00" };
  it("uma ida e uma volta por tipo, e o saldo fecha", () => {
    const r = lancamentosDaVenda(id, venda, { "Garrafa 600ml": 12, Engradado: 1 }, { "Garrafa 600ml": 8, Engradado: 0 });
    expect(r.map((x) => [x.tipo, x.quantidade])).toEqual([
      ["Garrafa 600ml", 12],
      ["Garrafa 600ml", -8],
      ["Engradado", 1],
    ]);
    expect(r.every((x) => x.vendaNumero === 7)).toBe(true);
    expect(saldoDoCliente(r, "ana")).toEqual({ "Garrafa 600ml": 4, Engradado: 1 });
  });
  it("sem cliente não anota nada", () => {
    expect(lancamentosDaVenda(id, { ...venda, clienteId: undefined }, { "Garrafa 600ml": 12 }, {})).toEqual([]);
  });
  it("sem dizer quanto trouxe, vale que trouxe tudo", () => {
    expect(saldoDoCliente(lancamentosDaVenda(id, venda, { "Garrafa 600ml": 12 }, {}), "ana")).toEqual({});
  });
});

describe("problemaNaDevolucao", () => {
  const saldo = { "Garrafa 600ml": 4 };
  it("devolve até o que deve", () => {
    expect(problemaNaDevolucao(saldo, "Garrafa 600ml", 4)).toBe("");
    expect(problemaNaDevolucao(saldo, "Garrafa 600ml", 5)).toContain("deve 4");
    expect(problemaNaDevolucao(saldo, "Engradado", 1)).toContain("não deve");
    expect(problemaNaDevolucao(saldo, "Garrafa 600ml", 0)).toContain("inteiro");
  });
});

it("tiposDeCasco lista sem repetir, já limpos", () => {
  expect(tiposDeCasco(produtos)).toEqual(["Engradado", "Garrafa 600ml"]);
});
