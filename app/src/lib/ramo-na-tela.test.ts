import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { RAMOS, RAMO_META, temRecurso, aparelhosDoRamo, checklistDoRamo } from "./ramos";

/*
 * ============================================================
 *  A TELA TEM QUE MUDAR JUNTO COM O RAMO
 * ============================================================
 *
 * O pedido veio assim: "imagina na área de restaurante ter senha do celular,
 * ia ser muito estranho".
 *
 * E estava certo. A tela da OS tinha três listas escritas à mão dentro dela:
 *
 *   - o tipo de aparelho ..... Celular, Notebook, PC, Tablet
 *   - o checklist de entrada . "Tela sem trincos", "Touch funciona"
 *   - o bloco confidencial ... senha, padrão de desbloqueio, conta vinculada
 *
 * Nenhuma delas olhava o ramo. Uma oficina de rebobinamento abria a ordem de
 * um motor trifásico escolhendo entre celular e tablet, conferia se o touch
 * funcionava, e o sistema pedia a senha do celular de quem trouxe uma bomba
 * d'água.
 *
 * O último é o mais grave, e não é estético: guardar senha de terceiro é o
 * maior risco jurídico deste sistema. Um campo pedindo senha onde a loja não
 * tem por que guardar é um convite a criar o risco de graça.
 */

const raiz = new URL("../", import.meta.url);
const ler = (rel: string): string => readFileSync(new URL(rel, raiz), "utf8");
const semComentarios = (fonte: string): string =>
  fonte
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("a tela da OS não escreve lista de ramo à mão", () => {
  const tela = semComentarios(ler("pages/OrdensServico.tsx"));

  it("o tipo de equipamento vem do ramo", () => {
    expect(tela).toContain("aparelhosDoRamo(ramo)");
    // A lista de celular não pode voltar para dentro da tela.
    expect(tela).not.toMatch(/"Celular",\s*"Notebook"/);
  });

  it("o checklist de entrada vem do ramo", () => {
    expect(tela).toContain("checklistDoRamo(ramo)");
    expect(tela).not.toMatch(/"Tela sem trincos"/);
  });

  it("o bloco de senha só aparece com o recurso ligado", () => {
    expect(tela).toMatch(/temRecurso\(ramo, "senhaAparelho"\)/);
    // Nos dois lugares: o formulário e o detalhe.
    expect(tela.match(/temRecurso\(ramo, "senhaAparelho"\)/g)?.length).toBe(2);
  });

  it("o IMEI só aparece com o recurso ligado", () => {
    expect(tela).toMatch(/temRecurso\(ramo, "imei"\)/);
  });

  it("a placa do motor só aparece com o recurso ligado", () => {
    expect(tela).toMatch(/temRecurso\(ramo, "dadosMotor"\)/);
  });
});

describe("o seletor de tipo de loja saiu da entrada", () => {
  const tela = semComentarios(ler("pages/Login.tsx"));

  it("só o cadastro escolhe o tipo de loja", () => {
    /*
     * Quem entra já tem loja: a escolha nunca valeu para ele, e clicar sem
     * nada acontecer parecia defeito. Com a lista crescendo, a primeira tela
     * do sistema virava uma parede de botões antes do campo de e-mail.
     */
    expect(tela).toMatch(/const mostraEscolha = modo === "criar"/);
  });

  it("a grade de tipos continua existindo, atrás dessa condição", () => {
    // Tirar o seletor do login não pode significar tirar do cadastro: lá ele
    // é o dado mais importante da conta, porque decide as telas da loja.
    expect(tela).toContain("{mostraEscolha && (");
    expect(tela).toContain("RAMOS.map(");
  });
});

describe("cada ramo se sustenta sozinho", () => {
  for (const r of RAMOS) {
    const meta = RAMO_META[r];

    it(`${r}: vocabulário completo`, () => {
      for (const chave of [
        "ordem",
        "ordemPlural",
        "ordemCurta",
        "item",
        "itemPlural",
        "aparelho",
        "aparelhoPlural",
      ] as const) {
        expect(meta.vocabulario[chave], `${r}.${chave}`).toBeTruthy();
      }
    });

    it(`${r}: quem tem OS tem lista de equipamento e checklist próprios`, () => {
      // Ramo que conserta e cai na lista de outro estaria mentindo na tela.
      if (meta.modulos.includes("os")) {
        expect(meta.aparelhos.length, r).toBeGreaterThan(0);
        expect(meta.checklist.length, r).toBeGreaterThan(0);
      }
      // E quem não conserta ainda assim responde alguma coisa, sem quebrar.
      expect(aparelhosDoRamo(r).length, r).toBeGreaterThan(0);
      expect(checklistDoRamo(r).length, r).toBeGreaterThan(0);
    });

    it(`${r}: recurso de conserto só em quem conserta`, () => {
      const conserta = meta.modulos.includes("os");
      for (const rec of ["imei", "senhaAparelho", "dadosMotor"] as const) {
        if (!conserta) expect(temRecurso(r, rec), `${r}.${rec}`).toBe(false);
      }
    });
  }
});
