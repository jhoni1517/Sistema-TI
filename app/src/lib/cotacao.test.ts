import { describe, it, expect } from "vitest";
import {
  ultimoPreco,
  ultimaReferencia,
  melhorPreco,
  variacao,
  totalCotacao,
  aplicarCompra,
  mensagemFornecedor,
} from "./cotacao";
import type { PrecoFornecedor, Produto } from "./types";

const precos = [
  { id: "1", descricao: "Fonte 500W", fornecedorId: "f1", preco: 300, quantidade: 1, data: "2026-01-10", comprado: true },
  { id: "2", descricao: "Fonte 500W", fornecedorId: "f1", preco: 129, quantidade: 1, data: "2026-07-27", comprado: false },
  { id: "3", descricao: "Fonte 350W", fornecedorId: "f1", preco: 79, quantidade: 1, data: "2026-07-27", comprado: false },
  { id: "4", descricao: "Fonte 200W", fornecedorId: "f1", preco: 49, quantidade: 1, data: "2026-06-01" },
] as PrecoFornecedor[];

describe("preço cotado não pode virar preço pago", () => {
  it("a última compra ignora a cotação recusada", () => {
    expect(ultimoPreco(precos, { descricao: "Fonte 500W" })?.preco).toBe(300);
  });

  it("mas a cotação continua servindo de referência", () => {
    expect(ultimaReferencia(precos, { descricao: "Fonte 500W" })?.preco).toBe(129);
  });

  it("item só cotado não tem última compra", () => {
    expect(ultimoPreco(precos, { descricao: "Fonte 350W" })).toBeNull();
    expect(ultimaReferencia(precos, { descricao: "Fonte 350W" })?.preco).toBe(79);
  });

  it("registro antigo, sem a marca, conta como compra", () => {
    expect(ultimoPreco(precos, { descricao: "Fonte 200W" })?.preco).toBe(49);
  });

  it("o melhor preço também ignora o que não foi comprado", () => {
    expect(melhorPreco(precos, { descricao: "Fonte 500W" })?.preco).toBe(300);
  });
});

describe("variação de preço", () => {
  it("mostra alta e queda", () => {
    expect(Math.round(variacao(340, 300)!)).toBe(13);
    expect(Math.round(variacao(280, 300)!)).toBe(-7);
  });

  it("sem base de comparação não inventa número", () => {
    expect(variacao(340, 0)).toBeNull();
  });
});

describe("entrada no estoque", () => {
  const existente = {
    id: "p1",
    nome: "Fonte 500W",
    quantidade: 2,
    estoqueMinimo: 1,
    custo: 300,
    preco: 600,
    criadoEm: "",
  } as Produto;

  it("soma na quantidade existente em vez de criar outra linha", () => {
    const r = aplicarCompra({ descricao: "Fonte 500W", quantidade: 3, precoUnit: 340 }, existente)!;
    expect(r.quantidade).toBe(5);
    expect(r.custo).toBe(340);
  });

  it("preserva o preço de venda que a loja já definiu", () => {
    const r = aplicarCompra({ descricao: "Fonte 500W", quantidade: 1, precoUnit: 340 }, existente)!;
    expect(r.preco).toBe(600);
  });

  it("item novo entra com margem sugerida", () => {
    const r = aplicarCompra({ descricao: "Peça nova", quantidade: 4, precoUnit: 100 }, undefined)!;
    expect(r.quantidade).toBe(4);
    expect(r.preco).toBe(180);
  });

  it("quantidade zero não cria produto", () => {
    expect(aplicarCompra({ descricao: "x", quantidade: 0, precoUnit: 10 }, undefined)).toBeNull();
  });
});

describe("total da cotação", () => {
  it("multiplica quantidade pelo unitário", () => {
    expect(
      totalCotacao({
        itens: [
          { descricao: "a", quantidade: 2, precoUnit: 50 },
          { descricao: "b", quantidade: 1, precoUnit: 30 },
        ],
      } as never)
    ).toBe(130);
  });

  it("item ainda sem preço não entra na conta", () => {
    expect(
      totalCotacao({
        itens: [
          { descricao: "a", quantidade: 2, precoUnit: 50 },
          { descricao: "b", quantidade: 3 },
        ],
      } as never)
    ).toBe(100);
  });
});

describe("mensagem ao fornecedor", () => {
  const cotacao = {
    id: "1",
    numero: 7,
    fornecedorId: "f1",
    status: "aberta",
    criadoEm: "",
    itens: [
      { descricao: "Fonte 500W", quantidade: 2 },
      { descricao: "Peça inédita", quantidade: 5 },
    ],
  } as never;

  const texto = mensagemFornecedor(
    cotacao,
    { id: "f1", nome: "Distribuidora XYZ", contato: "Marcos Silva", criadoEm: "" },
    precos,
    "Nova Geração"
  );

  it("mostra o preço de referência de quem já tem histórico", () => {
    expect(texto).toContain("Fonte 500W");
    expect(texto).toContain("cotado antes");
  });

  it("pede as três informações sem perguntas soltas", () => {
    expect(texto).toContain("Disponibilidade em estoque");
    expect(texto).toContain("Valor unitário");
    expect(texto).toContain("Prazo de entrega");
  });

  it("não usa emoji, que chega quebrada em alguns aparelhos", () => {
    expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(texto)).toBe(false);
  });
});
