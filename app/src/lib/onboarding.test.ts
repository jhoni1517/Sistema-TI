import { describe, it, expect } from "vitest";
import {
  deveAbrirAssistente,
  progresso,
  proximoPasso,
  passoAnterior,
  primeirosPassos,
  mostrarPrimeirosPassos,
} from "./onboarding";
import { lerCSV, numeroDaPlanilha, sugerirMapa, temCabecalho, linhasParaProdutos } from "./planilha";
import { SO_NO_APARELHO } from "./config";

const base = { configCarregada: true, loading: false, demo: false, dono: true, quantos: 0 };

describe("assistente do primeiro acesso", () => {
  it("abre só para loja nova, do dono, depois de carregar", () => {
    expect(deveAbrirAssistente(base)).toBe(true);
    expect(deveAbrirAssistente({ ...base, quantos: 3 })).toBe(false);
    expect(deveAbrirAssistente({ ...base, configCarregada: false })).toBe(false);
    expect(deveAbrirAssistente({ ...base, loading: true })).toBe(false);
    expect(deveAbrirAssistente({ ...base, demo: true })).toBe(false);
    expect(deveAbrirAssistente({ ...base, dono: false })).toBe(false);
  });

  it("uma vez só: visto não abre mais", () => {
    expect(deveAbrirAssistente({ ...base, estado: { visto: true } })).toBe(false);
  });

  it("fechou no meio: volta no mesmo passo mesmo já tendo produto", () => {
    expect(deveAbrirAssistente({ ...base, quantos: 1, estado: { passo: "primeira" } })).toBe(true);
  });

  it("barra e navegação entre passos", () => {
    expect(progresso("loja")).toBe(0);
    expect(progresso("pronto")).toBe(100);
    expect(proximoPasso("loja")).toBe("ramo");
    expect(proximoPasso("pronto")).toBe("pronto");
    expect(passoAnterior("loja")).toBe("loja");
    expect(passoAnterior("produto")).toBe("ramo");
  });

  it("o estado sobe para a nuvem (não é aparência do aparelho)", () => {
    expect(SO_NO_APARELHO).not.toContain("primeirosPassos");
  });
});

describe("primeiros passos no Painel", () => {
  const cfg = { nomeLoja: "Minha Assistência TI", telefoneLoja: "", logoUrl: undefined };

  it("feito vem dos dados, não de tique guardado", () => {
    const itens = primeirosPassos(cfg, { produtos: 2, ordens: 0, vendas: 0 }, true);
    expect(itens.find((i) => i.id === "produto")?.feito).toBe(true);
    expect(itens.find((i) => i.id === "loja")?.feito).toBe(false);
    expect(itens.find((i) => i.id === "primeira")?.texto).toMatch(/ordem de serviço/);
  });

  it("nome padrão não conta como nome", () => {
    const itens = primeirosPassos({ ...cfg, telefoneLoja: "11999998888" }, { produtos: 0, ordens: 0, vendas: 0 }, true);
    expect(itens[0].feito).toBe(false);
    const ok = primeirosPassos({ ...cfg, nomeLoja: "Silva Cell", telefoneLoja: "11999998888" }, { produtos: 0, ordens: 0, vendas: 0 }, true);
    expect(ok[0].feito).toBe(true);
  });

  it("loja sem OS pede a primeira venda e não fala de rastreio", () => {
    const itens = primeirosPassos(cfg, { produtos: 0, ordens: 0, vendas: 1 }, false);
    expect(itens.map((i) => i.id)).toEqual(["loja", "logo", "produto", "primeira"]);
    expect(itens[3].feito).toBe(true);
  });

  it("loja antiga (sem assistente) não ganha a lista; completa, some", () => {
    const itens = primeirosPassos(cfg, { produtos: 0, ordens: 0, vendas: 0 }, true);
    expect(mostrarPrimeirosPassos(undefined, itens)).toBe(false);
    expect(mostrarPrimeirosPassos({ inicio: "2026-09-24" }, itens)).toBe(true);
    expect(mostrarPrimeirosPassos({ inicio: "2026-09-24" }, itens.map((i) => ({ ...i, feito: true })))).toBe(false);
  });
});

describe("planilha", () => {
  it("CSV do Excel brasileiro: ponto e vírgula, aspas e BOM", () => {
    const t = '﻿Produto;Preço;Qtd\r\n"Capinha; azul";"12,50";3\r\n"Cabo ""tipo C""";9,9;\r\n;;\r\n';
    expect(lerCSV(t)).toEqual([
      ["Produto", "Preço", "Qtd"],
      ["Capinha; azul", "12,50", "3"],
      ['Cabo "tipo C"', "9,9", ""],
    ]);
  });

  it("CSV com vírgula e com tabulação", () => {
    expect(lerCSV("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(lerCSV("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("número do jeito que vier", () => {
    expect(numeroDaPlanilha("R$ 1.234,56")).toBe(1234.56);
    expect(numeroDaPlanilha("12,5")).toBe(12.5);
    expect(numeroDaPlanilha("12.5")).toBe(12.5);
    expect(numeroDaPlanilha("1,234.56")).toBe(1234.56);
    expect(numeroDaPlanilha("1.500")).toBe(1500);
    expect(numeroDaPlanilha(7)).toBe(7);
    expect(numeroDaPlanilha("abc")).toBeUndefined();
    expect(numeroDaPlanilha("")).toBeUndefined();
  });

  it("adivinha as colunas, e custo não vira preço de venda", () => {
    const m = sugerirMapa(["Descrição", "Preço de custo", "Preço de venda", "Estoque", "EAN"]);
    expect(m).toMatchObject({ nome: 0, custo: 1, preco: 2, quantidade: 3, codigoBarras: 4, categoria: -1 });
    expect(temCabecalho(["Descrição", "Preço"])).toBe(true);
    expect(temCabecalho(["Capinha", "12,50"])).toBe(false);
  });

  it("linha ruim fica de fora com o número da linha; as boas entram", () => {
    let n = 0;
    const mapa = { nome: 0, preco: 1, custo: 2, quantidade: 3, codigoBarras: -1, categoria: -1 };
    const r = linhasParaProdutos(
      [
        ["Capinha", "30", "5", "10"],
        ["", "10", "", ""],
        ["Cabo", "abc", "", ""],
        ["capinha", "35", "", ""],
        ["Película", "25,00", "", ""],
        ["Fone", "29", "", "-2"],
      ],
      mapa,
      "2026-09-24T12:00:00Z",
      () => `p${++n}`,
      2,
      ["Fone"]
    );
    expect(r.produtos.map((p) => [p.nome, p.preco, p.custo, p.quantidade])).toEqual([
      ["Capinha", 30, 5, 10],
      ["Película", 25, 0, 0],
    ]);
    expect(r.problemas).toEqual([
      "Linha 3: sem nome.",
      'Linha 4 (Cabo): preço "abc" não é um número.',
      "Linha 5 (capinha): já existe um produto com esse nome.",
      "Linha 7 (Fone): já existe um produto com esse nome.",
    ]);
  });

  it("sem coluna de nome ou preço, diz qual falta", () => {
    const vazio = { nome: -1, preco: -1, custo: -1, quantidade: -1, codigoBarras: -1, categoria: -1 };
    expect(linhasParaProdutos([["x"]], vazio, "", () => "1").problemas[0]).toMatch(/nome/);
    expect(linhasParaProdutos([["x"]], { ...vazio, nome: 0 }, "", () => "1").problemas[0]).toMatch(/preço/);
  });
});
