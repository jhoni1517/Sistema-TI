import { describe, it, expect } from "vitest";
import { precoDosSabores, descricaoDosSabores, regraDe, type Sabor } from "./pizza";

const calabresa: Sabor = { nome: "Calabresa", preco: 45 };
const portuguesa: Sabor = { nome: "Portuguesa", preco: 52 };
const camarao: Sabor = { nome: "Camarão", preco: 60 };

describe("preço da pizza de mais de um sabor", () => {
  it("o exemplo do balcão: 45 e 52", () => {
    expect(precoDosSabores([calabresa, portuguesa], "maior")).toBe(52);
    expect(precoDosSabores([calabresa, portuguesa], "media")).toBe(48.5);
  });

  it("somar as metades É a média — não é uma terceira regra", () => {
    // O levantamento dizia que "soma das metades" diferia da média em três
    // ou quatro sabores. Não difere: somar preco/N de cada sabor é (Σ)/N,
    // que é a própria definição de média. Oferecer as duas na tela seria
    // pedir para a loja escolher entre duas opções idênticas.
    for (const sabores of [
      [calabresa, portuguesa],
      [calabresa, portuguesa, camarao],
      [calabresa, portuguesa, camarao, { nome: "Marguerita", preco: 39 }],
    ]) {
      const somaDasFracoes = sabores.reduce((s, x) => s + x.preco / sabores.length, 0);
      expect(precoDosSabores(sabores, "media")).toBe(
        Math.round(somaDasFracoes * 100) / 100
      );
    }
  });

  it("três sabores arredonda para centavo, sem sobrar dízima", () => {
    // 45 + 52 + 60 = 157; 157/3 = 52,333... O caixa não cobra fração de
    // centavo, e um total com três casas quebra a conferência do dia.
    expect(precoDosSabores([calabresa, portuguesa, camarao], "media")).toBe(52.33);
    expect(precoDosSabores([calabresa, portuguesa, camarao], "maior")).toBe(60);
  });

  it("um sabor só é a pizza inteira, e vale o preço dela", () => {
    // Passar pelo montador não pode mudar o preço de uma pizza comum.
    expect(precoDosSabores([calabresa], "maior")).toBe(45);
    expect(precoDosSabores([calabresa], "media")).toBe(45);
  });

  it("sem sabor nenhum não inventa preço", () => {
    expect(precoDosSabores([], "maior")).toBe(0);
    expect(precoDosSabores([], "media")).toBe(0);
  });

  it("preço quebrado não vira dízima escondida no total", () => {
    const a: Sabor = { nome: "A", preco: 39.9 };
    const b: Sabor = { nome: "B", preco: 44.9 };
    expect(precoDosSabores([a, b], "media")).toBe(42.4);
    expect(precoDosSabores([a, b], "maior")).toBe(44.9);
  });

  it("preço ausente conta como zero e não quebra a conta", () => {
    const semPreco = { nome: "Promoção" } as Sabor;
    expect(precoDosSabores([calabresa, semPreco], "maior")).toBe(45);
    expect(precoDosSabores([calabresa, semPreco], "media")).toBe(22.5);
  });
});

describe("como a pizza chega na cozinha", () => {
  it("diz a fração de cada sabor, não uma lista solta", () => {
    // "Calabresa, Portuguesa" não distingue uma pizza de dois sabores de
    // duas pizzas. A cozinha monta errado e o cliente recebe errado.
    expect(descricaoDosSabores([calabresa, portuguesa])).toBe(
      "1/2 Calabresa + 1/2 Portuguesa"
    );
    expect(descricaoDosSabores([calabresa, portuguesa, camarao])).toBe(
      "1/3 Calabresa + 1/3 Portuguesa + 1/3 Camarão"
    );
  });

  it("um sabor só sai sem fração", () => {
    expect(descricaoDosSabores([calabresa])).toBe("Calabresa");
  });

  it("nome em branco não vira fração fantasma", () => {
    expect(descricaoDosSabores([calabresa, { nome: "  ", preco: 10 }])).toBe("Calabresa");
    expect(descricaoDosSabores([])).toBe("");
  });
});

describe("regra da loja", () => {
  it("quem nunca escolheu fica com o sabor mais caro", () => {
    // É a regra mais usada no Brasil. Um padrão que cobra menos do que a
    // loja cobra hoje faria o sistema tirar dinheiro dela em silêncio.
    expect(regraDe(undefined)).toBe("maior");
    expect(regraDe(null)).toBe("maior");
    expect(regraDe("")).toBe("maior");
    expect(regraDe("qualquer coisa")).toBe("maior");
  });

  it("respeita a escolha gravada", () => {
    expect(regraDe("media")).toBe("media");
    expect(regraDe("maior")).toBe("maior");
  });
});
