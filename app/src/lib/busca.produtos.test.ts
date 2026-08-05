import { describe, it, expect } from "vitest";
import { produtosParaOS } from "./busca";
import type { Produto } from "./types";

const p = (nome: string, extra: Partial<Produto> = {}): Produto =>
  ({
    id: nome,
    nome,
    quantidade: 5,
    estoqueMinimo: 1,
    custo: 10,
    preco: 20,
    ...extra,
  }) as Produto;

/** De propósito fora de ordem: é assim que a lista chega do banco */
const estoque = [
  p("Teclado USB"),
  p("Fonte 200W", { sku: "FT200" }),
  p("Cabo de força para fonte"),
  p("Formatação", { servico: true }),
  p("Água mineral", { categoria: "Bebidas" }),
  p("Bateria 9V", { codigoBarras: "7891234567890" }),
];

describe("produtos para escolher na OS", () => {
  it("sem nada digitado, vem em ordem alfabética e não na ordem do banco", () => {
    // O <select> antigo listava na ordem em que as linhas voltaram do banco,
    // que não é ordem nenhuma. Abrir o campo tem que mostrar algo previsível.
    const nomes = produtosParaOS(estoque, "").map((x) => x.nome);
    expect(nomes).toEqual([...nomes].sort((a, b) => a.localeCompare(b)));
    expect(nomes[0]).toBe("Água mineral");
  });

  it("acha sem acento, porque no balcão ninguém acentua", () => {
    expect(produtosParaOS(estoque, "agua")[0].nome).toBe("Água mineral");
    expect(produtosParaOS(estoque, "formatacao")[0].nome).toBe("Formatação");
  });

  it("nome que começa com o termo vem antes do que só contém", () => {
    // "fon" é a Fonte, não o "Cabo de força para fonte"
    const nomes = produtosParaOS(estoque, "fon").map((x) => x.nome);
    expect(nomes[0]).toBe("Fonte 200W");
    expect(nomes).toContain("Cabo de força para fonte");
  });

  it("código de barras e SKU ganham de qualquer nome parecido", () => {
    expect(produtosParaOS(estoque, "7891234567890")[0].nome).toBe("Bateria 9V");
    expect(produtosParaOS(estoque, "FT200")[0].nome).toBe("Fonte 200W");
  });

  it("acha pela categoria, mas atrás de quem bate pelo nome", () => {
    const nomes = produtosParaOS(estoque, "bebidas").map((x) => x.nome);
    expect(nomes).toEqual(["Água mineral"]);
  });

  it("termo que não bate em nada devolve lista vazia, não o estoque inteiro", () => {
    expect(produtosParaOS(estoque, "girafa")).toEqual([]);
  });

  it("respeita o limite: a lista suspensa não pode virar a tela toda", () => {
    expect(produtosParaOS(estoque, "", 3)).toHaveLength(3);
  });
});
