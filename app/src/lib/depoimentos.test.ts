import { describe, it, expect } from "vitest";
import {
  nps,
  npsPorMes,
  insatisfeitosPendentes,
  primeiroNome,
  mensagemInsatisfeito,
  codigoWidget,
  mediaEmTexto,
  ehPromotora,
} from "./depoimentos";

describe("NPS de 1 a 5", () => {
  it("5 promove, 4 é neutro, 1 a 3 detrai", () => {
    expect(nps([5, 5, 5, 4, 1])).toMatchObject({ nps: 40, total: 5, promotores: 3, neutros: 1, detratores: 1 });
    expect(nps([4, 4])).toMatchObject({ nps: 0 });
    expect(nps([1, 2, 3])).toMatchObject({ nps: -100 });
  });
  it("sem nota não é zero, é vazio; nota torta não conta", () => {
    expect(nps([]).nps).toBeNull();
    expect(nps([0, 6, 2.5, 5]).total).toBe(1);
  });
  it("por mês, com virada de ano e mês vazio", () => {
    const r = npsPorMes(
      [
        { nota: 5, criadoEm: "2026-01-10T10:00:00Z" },
        { nota: 1, criadoEm: "2026-01-11T10:00:00Z" },
        { nota: 5, criadoEm: "2025-12-31T10:00:00Z" },
      ],
      "2026-01-20",
      3
    );
    expect(r.map((x) => [x.mes, x.nps, x.media])).toEqual([
      ["2025-11", null, null],
      ["2025-12", 100, 5],
      ["2026-01", 0, 3],
    ]);
  });
});

describe("alerta do dono", () => {
  const avs = [
    { id: "a", nota: 2, resolvido: false, criadoEm: "2026-09-20T10:00:00Z" },
    { id: "b", nota: 3, resolvido: true, criadoEm: "2026-09-21T10:00:00Z" },
    { id: "c", nota: 5, resolvido: false, criadoEm: "2026-09-22T10:00:00Z" },
    { id: "d", nota: 1, resolvido: false, criadoEm: "2026-06-01T10:00:00Z" },
    { id: "e", nota: 1, resolvido: false, criadoEm: "2026-09-23T10:00:00Z" },
  ];
  it("só 1 a 3, não resolvido, dos últimos 60 dias, mais novo primeiro", () => {
    expect(insatisfeitosPendentes(avs, "2026-09-25").map((x) => x.id)).toEqual(["e", "a"]);
  });
  it("4 e 5 vão para o Google; 3 não", () => {
    expect([ehPromotora(3), ehPromotora(4), ehPromotora(5)]).toEqual([false, true, true]);
  });
  it("mensagem sem emoji, com primeiro nome", () => {
    const m = mensagemInsatisfeito("Maria da Silva", "Cell X", "iPhone 13");
    expect(m).toMatch(/^Oi, Maria! Aqui é da Cell X.*iPhone 13/);
    expect(/[\u{1F300}-\u{1FAFF}]/u.test(m)).toBe(false);
  });
});

describe("página pública", () => {
  it("primeiro nome só", () => {
    expect(primeiroNome("  Ana Paula Souza ")).toBe("Ana");
    expect(primeiroNome(null)).toBe("");
  });
  it("widget em iframe com embed=1", () => {
    expect(codigoWidget("https://x.app/#/depoimentos/abc")).toContain('src="https://x.app/#/depoimentos/abc?embed=1"');
    expect(codigoWidget("https://x.app/#/d?a=1")).toContain("?a=1&embed=1");
  });
  it("média em texto", () => {
    expect(mediaEmTexto(4.83)).toBe("4,8 de 5");
    expect(mediaEmTexto(null)).toBe("");
  });
});
