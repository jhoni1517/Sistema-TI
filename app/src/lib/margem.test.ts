import { describe, it, expect } from "vitest";
import { margemPct, precoParaMargem, impactoDoCusto, textoDoAlerta, margensEmRisco, servicosDaPeca } from "./margem";
import { tabelaVazia, acrescentarModelo, definirPreco, definirPeca, tirarServico } from "./tabela-precos";
import type { Produto } from "./types";

const prod = (x: Partial<Produto>): Produto => ({ id: "", nome: "", preco: 0, custo: 0, quantidade: 3, estoqueMinimo: 0, criadoEm: "", ...x }) as Produto;
const tela = prod({ id: "tela", nome: "Tela A15", custo: 180 });
const cabo = prod({ id: "cabo", nome: "Cabo USB-C", preco: 30, custo: 10 });

function tab() {
  let t = tabelaVazia();
  t = acrescentarModelo(t, "Samsung", "Galaxy A15", "a15");
  t = definirPreco(t, "a15", "tela", 400);
  t = definirPeca(t, "a15", "tela", "tela");
  return t;
}

describe("conta de margem", () => {
  it("sobre o preço de venda", () => {
    expect(margemPct(400, 180)).toBe(55);
    expect(margemPct(0, 10)).toBeNull();
    expect(margemPct(100, 120)).toBe(-20);
  });
  it("preço para voltar à margem-alvo, arredondado para cima", () => {
    expect(precoParaMargem(212, 55)).toBe(479.9); // 471,11 → 479,90
    expect(precoParaMargem(10, 40, "centavo")).toBe(16.67);
  });
});

describe("custo subiu", () => {
  it('"subiu 18%, margem caiu de 55% para 47%" no serviço que usa a peça', () => {
    const r = impactoDoCusto([{ produtoId: "tela", custoAntes: 180, custoDepois: 212.4 }], [tela], tab(), 50);
    expect(r).toHaveLength(1); // a tela não tem preço de balcão, só o serviço
    expect(r[0]).toMatchObject({ tipo: "servico", nome: "Troca de tela · Samsung Galaxy A15", margemAntes: 55, margemDepois: 46.9, emRisco: true, modeloId: "a15", servicoId: "tela" });
    expect(textoDoAlerta(r[0], "a tela do A15")).toBe('O custo de a tela do A15 subiu 18%. Em "Troca de tela · Samsung Galaxy A15", sua margem caiu de 55% para 46,9%.');
  });
  it("custo que caiu ou ficou igual não alerta", () => {
    expect(impactoDoCusto([{ produtoId: "tela", custoAntes: 180, custoDepois: 170 }], [tela], tab())).toEqual([]);
  });
  it("produto de balcão também entra; prejuízo vira texto próprio", () => {
    const r = impactoDoCusto([{ produtoId: "cabo", custoAntes: 10, custoDepois: 35 }], [cabo], tab(), 40);
    expect(r[0]).toMatchObject({ tipo: "produto", margemDepois: -16.7, sugerido: 59.9 });
    expect(textoDoAlerta(r[0])).toMatch(/prejuízo/);
  });
});

describe("painel de margens em risco", () => {
  it("abaixo do alvo, pior primeiro; sem custo fica de fora", () => {
    const semCusto = { ...cabo, id: "x", custo: 0, preco: 5 } as Produto;
    const caro = { ...tela, custo: 260 } as Produto;
    const r = margensEmRisco([caro, cabo, semCusto], tab(), 40);
    expect(r.map((x) => [x.nome, x.margemDepois])).toEqual([["Troca de tela · Samsung Galaxy A15", 35]]);
  });
  it("serviço removido tira a ligação da peça", () => {
    expect(servicosDaPeca(tirarServico(tab(), "tela"), "tela")).toEqual([]);
  });
});
