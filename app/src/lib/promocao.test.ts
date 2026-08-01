import { describe, it, expect } from "vitest";
import {
  promocaoValendo,
  precoEfetivo,
  descontoDaPromocao,
  percentualDaPromocao,
  emPromocao,
  promocoesVencidas,
  problemaNaPromocao,
} from "./promocao";
import type { Produto } from "./types";

const prod = (p: Partial<Produto>): Produto =>
  ({
    id: "1",
    nome: "Arroz 5kg",
    quantidade: 10,
    estoqueMinimo: 2,
    custo: 20,
    preco: 30,
    criadoEm: "2026-01-01",
    ...p,
  }) as Produto;

describe("promoção com prazo", () => {
  it("dentro do prazo, o cliente paga o preço promocional", () => {
    const p = prod({
      precoPromocional: 24,
      promocaoInicio: "2026-07-01",
      promocaoFim: "2026-07-31",
    });
    expect(precoEfetivo(p, "2026-07-15")).toBe(24);
    expect(promocaoValendo(p, "2026-07-15")).toBe(true);
  });

  it("o preço cheio volta sozinho quando o prazo acaba", () => {
    // Promover era editar o preço na mão e lembrar de destrocar depois.
    // Ninguém lembra: a promoção de Natal seguia valendo em março.
    const p = prod({ precoPromocional: 24, promocaoFim: "2026-07-31" });
    expect(precoEfetivo(p, "2026-08-01")).toBe(30);
    expect(promocaoValendo(p, "2026-08-01")).toBe(false);
  });

  it("promoção programada não vale antes de começar", () => {
    const p = prod({ precoPromocional: 24, promocaoInicio: "2026-08-01" });
    expect(precoEfetivo(p, "2026-07-31")).toBe(30);
    expect(precoEfetivo(p, "2026-08-01")).toBe(24);
  });

  it("o dia de início e o de fim contam como promoção", () => {
    // Fora isso a promoção "de 1 a 31" perderia dois dias de venda.
    const p = prod({
      precoPromocional: 24,
      promocaoInicio: "2026-07-01",
      promocaoFim: "2026-07-31",
    });
    expect(promocaoValendo(p, "2026-07-01")).toBe(true);
    expect(promocaoValendo(p, "2026-07-31")).toBe(true);
  });

  it("sem data de fim vale até alguém tirar", () => {
    const p = prod({ precoPromocional: 24, promocaoInicio: "2026-01-01" });
    expect(precoEfetivo(p, "2030-01-01")).toBe(24);
  });

  it("preço promocional maior que o normal é engano, não promoção", () => {
    // Digitar 40 no lugar de 24 não pode fazer o caixa cobrar mais caro.
    const p = prod({ precoPromocional: 40 });
    expect(promocaoValendo(p, "2026-07-15")).toBe(false);
    expect(precoEfetivo(p, "2026-07-15")).toBe(30);
  });

  it("produto sem promoção nenhuma segue no preço normal", () => {
    expect(precoEfetivo(prod({}), "2026-07-15")).toBe(30);
    expect(descontoDaPromocao(prod({}), "2026-07-15")).toBe(0);
  });

  it("calcula o desconto e o percentual do cartaz", () => {
    const p = prod({ preco: 30, precoPromocional: 24 });
    expect(descontoDaPromocao(p, "2026-07-15")).toBe(6);
    expect(percentualDaPromocao(p, "2026-07-15")).toBe(20);
  });

  it("lista o que está em promoção, do maior desconto para o menor", () => {
    const lista = [
      prod({ id: "a", preco: 100, precoPromocional: 90 }), // 10%
      prod({ id: "b", preco: 100, precoPromocional: 50 }), // 50%
      prod({ id: "c", preco: 100 }),
    ];
    expect(emPromocao(lista, "2026-07-15").map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("aponta promoção vencida ainda pendurada no produto", () => {
    const lista = [
      prod({ id: "a", precoPromocional: 20, promocaoFim: "2026-06-30" }),
      prod({ id: "b", precoPromocional: 20, promocaoFim: "2026-12-31" }),
    ];
    expect(promocoesVencidas(lista, "2026-07-15").map((p) => p.id)).toEqual(["a"]);
  });
});

describe("avisos antes de salvar a promoção", () => {
  it("recusa promoção que não é mais barata", () => {
    expect(problemaNaPromocao(prod({ precoPromocional: 35 }))).toContain("MENOR");
  });

  it("avisa quando a promoção fica abaixo do custo", () => {
    // Não bloqueia: queima de estoque vencendo às vezes vale a pena. Mas
    // ninguém pode descobrir isso depois de vender tudo.
    expect(problemaNaPromocao(prod({ custo: 20, precoPromocional: 15 }))).toContain(
      "abaixo do custo"
    );
  });

  it("recusa promoção que termina antes de começar", () => {
    const p = prod({
      precoPromocional: 24,
      promocaoInicio: "2026-08-10",
      promocaoFim: "2026-08-01",
    });
    expect(problemaNaPromocao(p)).toContain("antes de começar");
  });

  it("produto sem promoção não gera aviso", () => {
    expect(problemaNaPromocao(prod({}))).toBe("");
  });
});
