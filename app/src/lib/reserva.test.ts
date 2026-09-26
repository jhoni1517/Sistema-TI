import { describe, it, expect } from "vitest";
import { disponiveis, reservasFora, problemaNoEmprestimo, linhasDoEmprestimo, emprestado } from "./reserva";
import { textoDoTermo } from "./termo";
import type { AparelhoReserva, Emprestimo, OrdemServico } from "./types";

const aparelhos: AparelhoReserva[] = [
  { id: "r1", nome: "Moto G22 reserva" },
  { id: "r2", nome: "Galaxy A10 reserva" },
];
const emp = (x: Partial<Emprestimo>): Emprestimo => ({ aparelhoId: "r1", nome: "Moto G22 reserva", estado: "Tela sem risco, 80% bateria", emprestadoEm: "2026-09-20T10:00:00Z", ...x });
const os = (x: Partial<OrdemServico>): OrdemServico => ({ id: "o", numero: 1, status: "em_reparo", historico: [], ...x }) as OrdemServico;

describe("aparelho reserva", () => {
  const ordens = [
    os({ id: "a", numero: 10, emprestimo: emp({}) }),
    os({ id: "b", numero: 11, status: "entregue", emprestimo: emp({ aparelhoId: "r2", nome: "Galaxy A10 reserva", emprestadoEm: "2026-09-24T10:00:00Z" }) }),
    os({ id: "c", numero: 12, emprestimo: emp({ devolvidoEm: "2026-09-22" }) }),
  ];
  it("disponível é o que não está emprestado; devolvido libera", () => {
    expect(disponiveis(aparelhos, [ordens[0], ordens[2]]).map((a) => a.id)).toEqual(["r2"]);
    expect(emprestado(ordens[2])).toBe(false);
  });
  it("OS entregue com reserva fora vem primeiro (esquecido); depois o mais antigo", () => {
    const l = reservasFora(ordens, "2026-09-26", 5);
    expect(l.map((x) => [x.os.numero, x.dias, x.esquecido, x.demorado])).toEqual([
      [11, 2, true, false],
      [10, 6, false, true],
    ]);
  });
  it("não empresta o que está com outro cliente, nem sem descrever o estado", () => {
    expect(problemaNoEmprestimo(emp({}), aparelhos, ordens, "z")).toMatch(/OS 10/);
    expect(problemaNoEmprestimo(emp({}), aparelhos, ordens, "a")).toBe("");
    expect(problemaNoEmprestimo(emp({ estado: " " }), aparelhos, [], "z")).toMatch(/Descreva/);
    expect(problemaNoEmprestimo(emp({ aparelhoId: "" }), aparelhos, [], "z")).toMatch(/Escolha/);
  });
  it("o termo leva aparelho, estado, caução e a declaração", () => {
    const t = textoDoTermo("emprestimo", os({ numero: 7, emprestimo: emp({ caucao: 200, imei: "123" }) }), { nome: "Ana" }, "Cell X", "2026-09-26T10:00:00Z");
    expect(t).toMatch(/Termo de empréstimo de aparelho reserva · OS0*7/);
    expect(t).toMatch(/Moto G22 reserva \(IMEI\/série 123\)/);
    expect(t).toMatch(/Caução deixada: R\$ 200,00/);
    expect(t).toMatch(/Comprometo-me a devolvê-lo/);
    expect(linhasDoEmprestimo(emp({}), "")).not.toContain(undefined);
  });
});
