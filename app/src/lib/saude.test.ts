import { describe, it, expect } from "vitest";
import { avaliarLoja, avaliarLojas, diasDesde, mensagemSaude, type UsoRecente } from "./saude";
import type { Loja } from "./assinatura";

const hoje = new Date().toISOString().slice(0, 10);
const dia = (n: number) => new Date(Date.now() + n * 86400000).toISOString();

const loja = (x: Partial<Loja> = {}): Loja => ({ id: "l1", nome: "Cell Center", venceEm: dia(20), ...x }) as Loja;
const uso = (x: Partial<UsoRecente> = {}): UsoRecente => ({
  loja: "l1",
  ultimoUso: dia(0),
  osRecentes: 30,
  osAnteriores: 30,
  vendasRecentes: 0,
  vendasAnteriores: 0,
  caixaRecentes: 10,
  funcoes: ["os", "caixa", "clientes"],
  ...x,
});

describe("diasDesde", () => {
  it("conta pela data, não pela hora", () => {
    expect(diasDesde("2026-09-20T23:59:00", "2026-09-21")).toBe(1);
    expect(diasDesde("2026-12-31", "2027-01-02")).toBe(2);
  });
  it("sem data é null", () => expect(diasDesde(null, hoje)).toBeNull());
  it("data no futuro não vira negativo", () => expect(diasDesde("2099-01-01", hoje)).toBe(0));
});

describe("avaliarLoja", () => {
  it("loja usando bem é feliz e tem risco baixo", () => {
    const s = avaliarLoja(loja({ ultimoPagamento: dia(-10) }), uso(), hoje);
    expect(s.grupo).toBe("feliz");
    expect(s.risco).toBeLessThan(20);
    expect(s.porSemana).toBe(7.5);
  });

  it("uso caindo mais da metade entra em risco", () => {
    const s = avaliarLoja(loja(), uso({ osRecentes: 5, osAnteriores: 20 }), hoje);
    expect(s.queda).toBe(0.8);
    expect(s.grupo).toBe("risco");
    expect(s.motivos).toContain("uso caiu 80%");
  });

  it("queda sobre base pequena não é alarme", () => {
    const s = avaliarLoja(loja(), uso({ osRecentes: 0, osAnteriores: 2 }), hoje);
    expect(s.queda).toBeNull();
    expect(s.grupo).not.toBe("risco");
  });

  it("OS e vendas somam juntas: trocar OS por PDV não é queda", () => {
    const s = avaliarLoja(loja(), uso({ osRecentes: 5, osAnteriores: 20, vendasRecentes: 20, vendasAnteriores: 5 }), hoje);
    expect(s.queda).toBe(0);
  });

  it("teste acabando em 3 dias sem uso", () => {
    const l = loja({ venceEm: dia(2), testeAte: dia(2) });
    const s = avaliarLoja(l, uso({ ultimoUso: null, osRecentes: 0, osAnteriores: 0, funcoes: [] }), hoje);
    expect(s.grupo).toBe("teste_acabando");
    expect(s.teste).toBe(2);
    expect(s.motivos).toContain("nunca usou");
  });

  it("teste acabando mas usando todo dia não entra", () => {
    const l = loja({ venceEm: dia(2), testeAte: dia(2) });
    expect(avaliarLoja(l, uso(), hoje).grupo).toBeNull();
  });

  it("teste com 10 dias ainda não entra na lista de acabando", () => {
    const l = loja({ venceEm: dia(10), testeAte: dia(10) });
    expect(avaliarLoja(l, uso({ osRecentes: 0, ultimoUso: null }), hoje).grupo).toBeNull();
  });

  it("teste que já acabou não aparece como acabando", () => {
    const l = loja({ venceEm: dia(-3), testeAte: dia(-3) });
    expect(avaliarLoja(l, uso({ osRecentes: 0, ultimoUso: null }), hoje).grupo).toBeNull();
  });

  it("loja em teste não é 'feliz': ainda não pagou, não se pede indicação", () => {
    const l = loja({ venceEm: dia(20), testeAte: dia(20) });
    expect(avaliarLoja(l, uso(), hoje).grupo).toBeNull();
  });

  it("isenta nunca entra em grupo", () => {
    expect(avaliarLoja(loja({ isento: true }), uso({ osRecentes: 0, osAnteriores: 40 }), hoje).grupo).toBeNull();
  });

  it("sumida há 20 dias, uma função só e atrasada: risco alto", () => {
    const s = avaliarLoja(loja({ venceEm: dia(-3) }), uso({ ultimoUso: dia(-20), osRecentes: 0, osAnteriores: 10, funcoes: ["os"] }), hoje);
    expect(s.risco).toBe(100);
    expect(s.diasSemUso).toBe(20);
  });

  it("sem dado de uso (função não rodou) não quebra", () => {
    const s = avaliarLoja(loja(), undefined, hoje);
    expect(s.diasSemUso).toBeNull();
    expect(s.funcoes).toEqual([]);
  });
});

describe("avaliarLojas", () => {
  it("ordena do maior risco para o menor", () => {
    const lojas = [loja({ id: "a" }), loja({ id: "b" })];
    const r = avaliarLojas(lojas, { a: uso({ loja: "a" }), b: uso({ loja: "b", ultimoUso: dia(-30), osRecentes: 0 }) }, hoje);
    expect(r.map((s) => s.loja.id)).toEqual(["b", "a"]);
  });
});

describe("mensagemSaude", () => {
  it("cada grupo tem seu recado, sem emoji", () => {
    const risco = mensagemSaude(avaliarLoja(loja(), uso({ osRecentes: 1, osAnteriores: 20 }), hoje));
    const teste = mensagemSaude(avaliarLoja(loja({ venceEm: dia(1), testeAte: dia(1) }), uso({ osRecentes: 0, ultimoUso: null }), hoje));
    const feliz = mensagemSaude(avaliarLoja(loja(), uso(), hoje));
    expect(risco).toContain("caiu");
    expect(teste).toContain("acaba amanhã");
    expect(feliz).toContain("depoimento");
    for (const m of [risco, teste, feliz]) expect(m).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(risco).toContain("Cell Center");
  });
});
