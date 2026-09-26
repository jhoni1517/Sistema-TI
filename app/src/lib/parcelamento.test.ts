import { describe, it, expect } from "vitest";
import { taxaDe, dividir, simular, avisoDeTaxas, textoDaSimulacao } from "./parcelamento";

const taxas = { debito: 1.5, credito: 3.2 };
const parcelas = { "2": 5.5, "6": 9, "12": 14 };

describe("taxa por parcela", () => {
  it("1x é o crédito; sem taxa na parcela, usa a maior abaixo", () => {
    expect(taxaDe(1, taxas, parcelas)).toBe(3.2);
    expect(taxaDe(2, taxas, parcelas)).toBe(5.5);
    expect(taxaDe(5, taxas, parcelas)).toBe(5.5);
    expect(taxaDe(7, taxas, parcelas)).toBe(9);
    expect(taxaDe(12, taxas, parcelas)).toBe(14);
    expect(taxaDe(3, taxas, {})).toBe(3.2);
    expect(taxaDe(3, {}, { "3": 99 })).toBe(40);
  });
});

describe("arredondamento", () => {
  it("centavo que sobra vai na primeira; a soma bate", () => {
    expect(dividir(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(dividir(10000, 3).reduce((a, b) => a + b)).toBe(10000);
    expect(dividir(99, 12).reduce((a, b) => a + b)).toBe(99);
  });
  it("sem juros: cliente paga o preço, loja recebe menos (arredondado para baixo)", () => {
    const l = simular(100, taxas, parcelas).find((x) => x.parcelas === 3 && x.rotulo === "3x")!;
    expect(l.semJuros).toEqual({ total: 100, parcela: 33.33, primeira: 33.34, recebe: 94.5 });
  });
  it("repassando: a loja recebe pelo menos o preço cheio, sem centavo a menos", () => {
    for (const v of [0.01, 1, 99.99, 333.33, 1234.56, 2999.9]) {
      for (const l of simular(v, taxas, parcelas)) {
        expect(l.repassando.recebe).toBeGreaterThanOrEqual(v);
        expect(l.repassando.recebe - v).toBeLessThan(0.02);
        const soma = l.repassando.primeira + l.repassando.parcela * (l.parcelas - 1);
        expect(Math.round(soma * 100)).toBe(Math.round(l.repassando.total * 100));
      }
    }
    const l12 = simular(1000, taxas, parcelas).at(-1)!;
    expect(l12.repassando.total).toBe(1162.8); // 1000 / 0,86 = 1162,79 → sobe para 1162,80
    expect(l12.repassando.recebe).toBe(1000);
  });
  it("débito e 1x a 12x; valor zero não simula", () => {
    expect(simular(50, taxas, parcelas).map((l) => l.rotulo)).toEqual(["Débito", "Crédito à vista", "2x", "3x", "4x", "5x", "6x", "7x", "8x", "9x", "10x", "11x", "12x"]);
    expect(simular(0, taxas)).toEqual([]);
  });
});

describe("textos", () => {
  it("avisa quando falta taxa", () => {
    expect(avisoDeTaxas({}, {})).toMatch(/Cadastre/);
    expect(avisoDeTaxas(taxas, {})).toMatch(/crédito à vista/);
    expect(avisoDeTaxas(taxas, parcelas)).toBe("");
  });
  it("WhatsApp sem emoji, com a primeira parcela diferente quando precisa", () => {
    const l = simular(100, taxas, parcelas).filter((x) => x.parcelas <= 3);
    const t = textoDaSimulacao(100, l, "Cell X", false, "Troca de tela");
    expect(t).toMatch(/Troca de tela: R\$\s?100,00/);
    expect(t).toMatch(/3x de R\$\s?33,33 \(1ª de R\$\s?33,34\) sem juros/);
    expect(/[\u{1F300}-\u{1FAFF}]/u.test(t)).toBe(false);
    expect(textoDaSimulacao(100, l, "Cell X", true)).toMatch(/= R\$/);
  });
});
