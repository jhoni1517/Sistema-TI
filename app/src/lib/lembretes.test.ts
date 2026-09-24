import { describe, it, expect } from "vitest";
import {
  somarMeses,
  lembretesDoDia,
  mensagemDoLembrete,
  marcarChamado,
  regrasValidas,
  REGRAS_PADRAO,
  JANELA_DIAS,
} from "./lembretes";
import type { Cliente, OrdemServico } from "./types";

const maria = { id: "c1", nome: "Maria da Silva", telefone: "11988887777", criadoEm: "" } as Cliente;
const semFone = { id: "c2", nome: "Zé", telefone: "", criadoEm: "" } as Cliente;
const os = (x: Partial<OrdemServico>): OrdemServico =>
  ({ id: "o1", numero: 10, clienteId: "c1", status: "entregue", marca: "Samsung", modelo: "A54", pecas: [], criadoEm: "2025-09-20", ...x }) as OrdemServico;
const bateria = { descricao: "Bateria Samsung A54", quantidade: 1, custoUnit: 50, precoUnit: 150 };

describe("somar meses", () => {
  it("dia 31 cai no último dia do mês", () => {
    expect(somarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(somarMeses("2024-01-31", 1)).toBe("2024-02-29");
  });
  it("29/02 + 12 meses = 28/02", () => {
    expect(somarMeses("2024-02-29", 12)).toBe("2025-02-28");
  });
  it("virada de ano", () => {
    expect(somarMeses("2025-11-15", 6)).toBe("2026-05-15");
  });
});

describe("quem chamar hoje", () => {
  const entregue = os({ entregueEm: "2025-09-20T15:00:00Z", pecas: [bateria] });

  it("bateria trocada há 12 meses aparece no dia", () => {
    const l = lembretesDoDia([entregue], [maria], REGRAS_PADRAO, "2026-09-20");
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ quando: "2026-09-20", atraso: 0, chave: "o1:bateria" });
  });

  it("antes da data, não; depois da janela, também não", () => {
    expect(lembretesDoDia([entregue], [maria], REGRAS_PADRAO, "2026-09-19")).toHaveLength(0);
    expect(lembretesDoDia([entregue], [maria], REGRAS_PADRAO, "2026-11-19")).toHaveLength(1);
    expect(lembretesDoDia([entregue], [maria], REGRAS_PADRAO, "2026-11-20")).toHaveLength(0);
    expect(JANELA_DIAS).toBe(60);
  });

  it("acha a palavra sem acento e no defeito também", () => {
    const pel = os({ id: "o2", entregueEm: "2026-03-01T12:00:00Z", defeitoRelatado: "Colocar PELICULA 3D" });
    expect(lembretesDoDia([pel], [maria], REGRAS_PADRAO, "2026-09-01")[0].regra.id).toBe("pelicula");
  });

  it("peça de orçamento que o cliente não escolheu não conta", () => {
    const o = os({ entregueEm: "2025-09-20T15:00:00Z", opcaoEscolhida: "A", pecas: [{ ...bateria, opcao: "B" }] });
    expect(lembretesDoDia([o], [maria], REGRAS_PADRAO, "2026-09-20")).toHaveLength(0);
  });

  it("marcado como chamado some; OS não entregue e cliente sem telefone ficam fora", () => {
    expect(lembretesDoDia([marcarChamado(entregue, "bateria")], [maria], REGRAS_PADRAO, "2026-09-20")).toHaveLength(0);
    expect(lembretesDoDia([{ ...entregue, status: "pronta" }], [maria], REGRAS_PADRAO, "2026-09-20")).toHaveLength(0);
    expect(lembretesDoDia([{ ...entregue, clienteId: "c2" }], [semFone], REGRAS_PADRAO, "2026-09-20")).toHaveLength(0);
  });

  it("se o cliente já voltou e trocou de novo, não chama", () => {
    const nova = os({ id: "o9", status: "entregue", criadoEm: "2026-06-01", entregueEm: "2026-06-02T10:00:00Z", pecas: [bateria] });
    expect(lembretesDoDia([entregue, nova], [maria], REGRAS_PADRAO, "2026-09-20")).toHaveLength(0);
  });

  it("marcar não duplica", () => {
    expect(marcarChamado(marcarChamado(entregue, "bateria"), "bateria").lembretesFeitos).toEqual(["bateria"]);
  });
});

describe("recado e regras", () => {
  it("recado com primeiro nome, aparelho, OS e oferta, sem emoji", () => {
    const [l] = lembretesDoDia([os({ entregueEm: "2025-09-20T15:00:00Z", pecas: [bateria] })], [maria], REGRAS_PADRAO, "2026-09-20");
    const m = mensagemDoLembrete(l, "Silva Cell");
    expect(m).toMatch(/^Oi, Maria! Aqui é da Silva Cell\./);
    expect(m).toMatch(/Faz um ano que cuidamos do Samsung A54 \(OS00010\)\. Que tal uma revisão da bateria\?/);
    expect(/[\u{1F300}-\u{1FAFF}]/u.test(m)).toBe(false);
  });
  it("regra sem palavra, sem meses ou absurda sai", () => {
    expect(
      regrasValidas([
        { id: "a", palavra: " ", meses: 6, oferta: "" },
        { id: "b", palavra: "tela", meses: 0, oferta: "" },
        { id: "c", palavra: "tela", meses: 999, oferta: "" },
        { id: "d", palavra: " chip ", meses: 3.4, oferta: " x " },
      ])
    ).toEqual([{ id: "d", palavra: "chip", meses: 3, oferta: "x" }]);
  });
});
