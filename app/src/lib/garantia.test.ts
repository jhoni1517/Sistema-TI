import { describe, it, expect } from "vitest";
import {
  garantiaDaOS,
  naGarantia,
  garantiasDoCliente,
  garantiasVencendo,
  textoDaGarantia,
} from "./garantia";
import type { OrdemServico } from "./types";

const os = (p: Partial<OrdemServico>): OrdemServico =>
  ({
    id: "o1",
    numero: 7,
    clienteId: "c1",
    tipoAparelho: "Celular",
    marca: "Samsung",
    modelo: "A54",
    defeitoRelatado: "",
    checklist: {},
    pecas: [],
    maoDeObra: 0,
    desconto: 0,
    status: "entregue",
    garantiaDias: 90,
    historico: [],
    criadoEm: "2026-01-01T00:00:00.000Z",
    atualizadoEm: "2026-01-01T00:00:00.000Z",
    entregueEm: "2026-04-01T10:00:00.000Z",
    ...p,
  }) as OrdemServico;

describe("está na garantia?", () => {
  it("dentro do prazo, está coberto e diz até quando", () => {
    const g = garantiaDaOS(os({}), "2026-05-01");
    expect(g.situacao).toBe("valida");
    expect(g.ate).toBe("2026-06-30");
    expect(g.diasRestantes).toBe(60);
  });

  it("o último dia ainda é garantia", () => {
    // Negar no dia 90 é perder o cliente por um dia de conta errada.
    expect(garantiaDaOS(os({}), "2026-06-30").situacao).toBe("valida");
    expect(garantiaDaOS(os({}), "2026-07-01").situacao).toBe("vencida");
  });

  it("conta da ENTREGA, não da abertura", () => {
    // O aparelho pode ter ficado três semanas esperando peça, e esse tempo
    // não é do cliente.
    const g = garantiaDaOS(
      os({ criadoEm: "2026-01-01T00:00:00.000Z", entregueEm: "2026-04-01T10:00:00.000Z" }),
      "2026-06-01"
    );
    expect(g.ate).toBe("2026-06-30");
  });

  it("OS que ainda está na loja não começou a contar", () => {
    const g = garantiaDaOS(os({ status: "pronta", entregueEm: undefined }), "2026-05-01");
    expect(g.situacao).toBe("nao_entregue");
    expect(g.diasRestantes).toBe(90);
  });

  it("cancelada nunca tem garantia: não houve serviço", () => {
    expect(garantiaDaOS(os({ status: "cancelada" }), "2026-05-01").situacao).toBe(
      "sem_garantia"
    );
  });

  it("sem prazo cadastrado, o sistema não inventa 90 dias", () => {
    // Prometer o que a loja não combinou é pior do que não responder.
    expect(garantiaDaOS(os({ garantiaDias: 0 }), "2026-05-01").situacao).toBe(
      "sem_garantia"
    );
  });

  it("garantia vencida diz há quantos dias", () => {
    const g = garantiaDaOS(os({}), "2026-07-10");
    expect(g.situacao).toBe("vencida");
    expect(g.diasRestantes).toBe(-10);
  });

  it("naGarantia é o atalho de sim ou não", () => {
    expect(naGarantia(os({}), "2026-05-01")).toBe(true);
    expect(naGarantia(os({}), "2026-08-01")).toBe(false);
  });

  it("data de entrega estragada não derruba a conta", () => {
    expect(() => garantiaDaOS(os({ entregueEm: "ontem" }), "2026-05-01")).not.toThrow();
    expect(garantiaDaOS(os({ entregueEm: "ontem" }), "2026-05-01").situacao).toBe(
      "nao_entregue"
    );
  });
});

describe("garantias por cliente e as que vencem", () => {
  const ordens = [
    os({ id: "a", numero: 1, entregueEm: "2026-04-01T10:00:00.000Z" }), // vence 30/06
    os({ id: "b", numero: 2, entregueEm: "2026-05-20T10:00:00.000Z" }), // vence 18/08
    os({ id: "c", numero: 3, entregueEm: "2025-01-01T10:00:00.000Z" }), // vencida
    os({ id: "d", numero: 4, clienteId: "outro", entregueEm: "2026-05-01T10:00:00.000Z" }),
  ];

  it("mostra só as válidas, da que vence primeiro", () => {
    const r = garantiasDoCliente(ordens, "c1", "2026-06-01");
    expect(r.map((x) => x.os.id)).toEqual(["a", "b"]);
  });

  it("não mistura garantia de outro cliente", () => {
    expect(
      garantiasDoCliente(ordens, "c1", "2026-06-01").some((x) => x.os.id === "d")
    ).toBe(false);
  });

  it("avisa o que vence na semana, para a loja chamar antes", () => {
    // "Sua garantia vence semana que vem, quer que a gente dê uma olhada?"
    // custa uma mensagem e evita o retorno bravo no dia 91.
    const r = garantiasVencendo(ordens, 7, "2026-06-25");
    expect(r.map((x) => x.os.id)).toEqual(["a"]);
  });

  it("garantia já vencida não entra no aviso", () => {
    expect(garantiasVencendo(ordens, 7, "2026-09-01")).toEqual([]);
  });
});

describe("resposta pronta para o WhatsApp", () => {
  it("na garantia diz até quando e quantos dias faltam", () => {
    const t = textoDaGarantia(os({}), "2026-05-01");
    expect(t).toContain("OS00007");
    expect(t).toContain("30/06/2026");
    expect(t).toContain("60");
  });

  it("vencida diz a data e há quantos dias", () => {
    expect(textoDaGarantia(os({}), "2026-07-10")).toContain("venceu em 30/06/2026");
  });

  it("ainda na loja explica que a contagem começa na entrega", () => {
    expect(textoDaGarantia(os({ entregueEm: undefined, status: "pronta" }), "2026-05-01")).toContain(
      "começa a contar na entrega"
    );
  });

  it("não sai emoji", () => {
    // Em alguns aparelhos elas chegam como "?" e sujam o recado.
    for (const hoje of ["2026-05-01", "2026-07-10"]) {
      expect(/\p{Extended_Pictographic}/u.test(textoDaGarantia(os({}), hoje))).toBe(false);
    }
  });
});
