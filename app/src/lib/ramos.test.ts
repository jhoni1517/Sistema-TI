import { describe, it, expect } from "vitest";
import {
  RAMOS,
  RAMO_META,
  ramoDe,
  temModulo,
  temRecurso,
  vocabulario,
} from "./ramos";

describe("ramos", () => {
  it("loja sem ramo cadastrado continua sendo assistência técnica", () => {
    // Toda loja existente foi criada antes deste campo. Nenhuma pode acordar
    // num sistema diferente do que ela usava ontem.
    expect(ramoDe(undefined)).toBe("assistencia");
    expect(ramoDe(null)).toBe("assistencia");
    expect(ramoDe("")).toBe("assistencia");
  });

  it("ramo inventado não derruba a tela", () => {
    expect(ramoDe("padaria")).toBe("assistencia");
    expect(() => vocabulario("padaria")).not.toThrow();
    expect(temModulo("padaria", "pdv")).toBe(false);
  });

  it("só a assistência tem ordem de serviço e rastreio", () => {
    expect(temModulo("assistencia", "os")).toBe(true);
    expect(temModulo("assistencia", "rastreio")).toBe(true);
    for (const r of RAMOS.filter((x) => x !== "assistencia")) {
      expect(temModulo(r, "os"), r).toBe(false);
      expect(temModulo(r, "rastreio"), r).toBe(false);
    }
  });

  it("assistência não tem PDV: lá a venda nasce da OS, não do balcão", () => {
    expect(temModulo("assistencia", "pdv")).toBe(false);
  });

  it("mesa e fila de preparo são só da pizzaria", () => {
    expect(temModulo("pizzaria", "mesas")).toBe(true);
    expect(temModulo("pizzaria", "producao")).toBe(true);
    for (const r of RAMOS.filter((x) => x !== "pizzaria")) {
      expect(temModulo(r, "mesas"), r).toBe(false);
      expect(temModulo(r, "producao"), r).toBe(false);
    }
  });

  it("IMEI e garantia são campos da assistência, não de mercearia", () => {
    expect(temRecurso("assistencia", "imei")).toBe(true);
    expect(temRecurso("assistencia", "garantia")).toBe(true);
    expect(temRecurso("mercearia", "imei")).toBe(false);
  });

  it("validade vale para quem vende comida e bebida", () => {
    expect(temRecurso("mercearia", "validade")).toBe(true);
    expect(temRecurso("bebidas", "validade")).toBe(true);
    expect(temRecurso("assistencia", "validade")).toBe(false);
  });

  it("só bebidas tem restrição de idade", () => {
    expect(temRecurso("bebidas", "idadeMinima")).toBe(true);
    for (const r of RAMOS.filter((x) => x !== "bebidas")) {
      expect(temRecurso(r, "idadeMinima"), r).toBe(false);
    }
  });

  it("todo ramo tem vocabulário completo, sem campo vazio", () => {
    for (const r of RAMOS) {
      for (const [campo, valor] of Object.entries(vocabulario(r))) {
        expect(valor.trim(), `${r}.${campo}`).not.toBe("");
      }
    }
  });

  it("cada ramo tem nome e descrição para aparecer na escolha", () => {
    for (const r of RAMOS) {
      expect(RAMO_META[r].label.trim()).not.toBe("");
      expect(RAMO_META[r].descricao.trim()).not.toBe("");
    }
  });

  it("nenhum ramo repete módulo nem recurso", () => {
    for (const r of RAMOS) {
      const { modulos, recursos } = RAMO_META[r];
      expect(new Set(modulos).size, `${r} módulos`).toBe(modulos.length);
      expect(new Set(recursos).size, `${r} recursos`).toBe(recursos.length);
    }
  });

  it("cada módulo declarado é usado por pelo menos um ramo", () => {
    // Módulo que ninguém usa é tela que ninguém abre: ou falta ligar em
    // algum ramo, ou sobra no código.
    const usados = new Set(RAMOS.flatMap((r) => RAMO_META[r].modulos));
    for (const m of ["os", "rastreio", "pdv", "delivery", "mesas", "producao"]) {
      expect(usados.has(m as never), `módulo ${m} não é de nenhum ramo`).toBe(true);
    }
  });
});
