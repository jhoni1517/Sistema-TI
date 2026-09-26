import { describe, it, expect } from "vitest";
import { iniciar, pausar, pausarCom, tempoDeBancada, minhasOS, tecnicosDasOS, formatarTempo, relogio, rodando, doTecnico } from "./bancada";
import type { OrdemServico } from "./types";

const os = (x: Partial<OrdemServico>): OrdemServico => ({ id: "o", numero: 1, status: "aprovada", tecnico: "José", historico: [], ...x }) as OrdemServico;
const T = (h: string) => `2026-09-26T${h}:00.000Z`;

describe("cronômetro", () => {
  it("inicia, pausa e soma; retoma do acumulado", () => {
    let o = iniciar(os({}), T("10:00"));
    expect(o.status).toBe("em_reparo");
    expect(o.historico.at(-1)).toEqual({ data: T("10:00"), status: "em_reparo" });
    expect(tempoDeBancada(o, T("10:30"))).toBe(1800);
    o = pausar(o, T("10:30"));
    expect(rodando(o)).toBe(false);
    expect(o.bancada).toEqual({ acumulado: 1800 });
    expect(tempoDeBancada(o, T("18:00"))).toBe(1800); // parado não conta
    o = iniciar(o, T("14:00"));
    expect(o.historico).toHaveLength(1); // já estava em reparo: não repete
    expect(tempoDeBancada(o, T("14:15"))).toBe(2700);
  });
  it("iniciar o que já roda não zera; pausar o parado não muda", () => {
    const o = iniciar(os({}), T("10:00"));
    expect(iniciar(o, T("11:00"))).toBe(o);
    const p = pausar(o, T("10:10"));
    expect(pausar(p, T("12:00"))).toBe(p);
  });
  it("pronto pausa, marca prontaEm e o histórico", () => {
    const o = pausarCom(iniciar(os({}), T("10:00")), "pronta", T("11:00"));
    expect(o).toMatchObject({ status: "pronta", prontaEm: T("11:00"), bancada: { acumulado: 3600 } });
    expect(o.historico.at(-1)?.status).toBe("pronta");
    const peca = pausarCom(iniciar(os({}), T("10:00")), "aguardando_peca", T("10:05"));
    expect(peca).toMatchObject({ status: "aguardando_peca", bancada: { acumulado: 300 } });
    expect(peca.prontaEm).toBeUndefined();
  });
  it("relógio parado no passado não dá negativo", () => {
    expect(tempoDeBancada(os({ bancada: { acumulado: 10, inicio: T("12:00") } }), T("11:00"))).toBe(10);
  });
});

describe("a fila do técnico", () => {
  const ordens = [
    os({ id: "a", numero: 1, status: "aprovada", tecnico: "jose" }),
    os({ id: "b", numero: 2, status: "em_reparo", tecnico: "José" }),
    os({ id: "c", numero: 3, status: "aguardando_peca", tecnico: "José", bancada: { acumulado: 0, inicio: T("09:00") } }),
    os({ id: "d", numero: 4, status: "pronta", tecnico: "José" }),
    os({ id: "e", numero: 5, status: "em_reparo", tecnico: "Marina" }),
  ];
  it("só as dele, abertas, a que roda primeiro", () => {
    expect(minhasOS(ordens, "JOSÉ").map((o) => o.id)).toEqual(["c", "b", "a"]);
    expect(doTecnico({ tecnico: "" }, "")).toBe(false);
  });
  it("técnicos sem repetir por acento", () => {
    expect(tecnicosDasOS(ordens)).toEqual(["José", "Marina"]);
  });
});

describe("mostrar tempo", () => {
  it("formatos", () => {
    expect(formatarTempo(3725)).toBe("1h 02min");
    expect(formatarTempo(45)).toBe("0min 45s");
    expect(relogio(3725)).toBe("01:02:05");
  });
});

import { produtividade } from "./comissao";

describe("alimenta a produtividade", () => {
  it("soma as horas de bancada das OS entregues, e conta só as que usaram o cronômetro", () => {
    const entregue = (id: string, seg?: number) =>
      os({ id, status: "entregue", entregueEm: "2026-09-20T10:00:00Z", criadoEm: "2026-09-18T10:00:00Z", pecas: [], maoDeObra: 0, desconto: 0, bancada: seg ? { acumulado: seg } : undefined });
    const p = produtividade([entregue("a", 5400), entregue("b", 1800), entregue("c")], "2026-09-01", "2026-09-30");
    expect(p[0]).toMatchObject({ tecnico: "José", concluidas: 3, horasBancada: 2, comCronometro: 2 });
  });
});
