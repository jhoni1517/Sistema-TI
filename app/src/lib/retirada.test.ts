import { describe, it, expect } from "vitest";
import { pinFraco, gerarPin, pinConfere, exigePin, precisaDePin, problemaSemPin, textoDoPin } from "./retirada";

describe("PIN de retirada", () => {
  it("fraco: repetido, sequência e os clássicos", () => {
    for (const p of ["0000", "7777", "1234", "4321", "6789", "2580", "123", "12a4"]) expect(pinFraco(p), p).toBe(true);
    for (const p of ["4829", "0371", "1357"]) expect(pinFraco(p), p).toBe(false);
  });
  it("sorteio pula o fraco e sempre tem 4 dígitos", () => {
    const seq = [1234, 0, 42];
    expect(gerarPin(() => seq.shift()!)).toBe("0042");
    for (let i = 0; i < 200; i++) expect(gerarPin()).toMatch(/^\d{4}$/);
  });
  it("confere ignorando espaço e traço; sem PIN nunca confere", () => {
    expect(pinConfere(" 04-82 ", "0482")).toBe(true);
    expect(pinConfere("0483", "0482")).toBe(false);
    expect(pinConfere("", undefined)).toBe(false);
  });
  it("OS antiga (sem código) não trava a entrega; opção desligada também não", () => {
    expect(exigePin({ pinRetirada: "0482" }, {})).toBe(true);
    expect(exigePin({}, {})).toBe(false);
    expect(exigePin({ pinRetirada: "0482" }, { pinRetirada: false })).toBe(false);
  });
  it("gera só ao ficar pronta, uma vez", () => {
    expect(precisaDePin({ status: "pronta" }, {})).toBe(true);
    expect(precisaDePin({ status: "pronta", pinRetirada: "0482" }, {})).toBe(false);
    expect(precisaDePin({ status: "em_reparo" }, {})).toBe(false);
  });
  it("sem código exige motivo e foto", () => {
    expect(problemaSemPin("", "x")).toMatch(/por que/);
    expect(problemaSemPin("Filha do cliente, autorizada por telefone", null)).toMatch(/foto/);
    expect(problemaSemPin("Filha do cliente, autorizada por telefone", "a/b.jpg")).toBe("");
  });
  it("texto sem emoji", () => {
    expect(/[\u{1F300}-\u{1FAFF}]/u.test(textoDoPin("0482"))).toBe(false);
  });
});
