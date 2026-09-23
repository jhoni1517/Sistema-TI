// O fuso precisa valer antes de qualquer Date deste arquivo.
process.env.TZ = "America/Sao_Paulo";

import { describe, it, expect } from "vitest";
import {
  diaLocal,
  prazoDoConserto,
  alertaDeAbandono,
  mensagemDeAbandono,
  prazosEmRisco,
  termoDeGarantia,
} from "./prazos";
import type { OrdemServico } from "./types";

const os = (o: Partial<OrdemServico> = {}): OrdemServico =>
  ({
    id: "o1",
    numero: 33,
    clienteId: "c1",
    marca: "Samsung",
    modelo: "A54",
    status: "em_reparo",
    criadoEm: "2026-09-01T13:00:00Z",
    garantiaDias: 90,
    historico: [],
    pecas: [],
    ...o,
  }) as OrdemServico;

const config = { nomeLoja: "Silva Cell", enderecoLoja: "", diasAbandono: 90, taxaArmazenamentoDia: 0 };

describe("o dia de um instante é o do balcão", () => {
  it("OS aberta às 22h de segunda é de segunda, não de terça", () => {
    // 01:00 UTC do dia 2 = 22:00 do dia 1 em São Paulo
    expect(diaLocal("2026-09-02T01:00:00Z")).toBe("2026-09-01");
  });
  it("data pura passa direto, e lixo vira vazio", () => {
    expect(diaLocal("2026-09-01")).toBe("2026-09-01");
    expect(diaLocal("")).toBe("");
    expect(diaLocal("ontem")).toBe("");
  });
});

describe("retorno em garantia: 30 dias corridos da abertura (CDC)", () => {
  const retorno = (o: Partial<OrdemServico> = {}) => os({ retornoGarantia: true, ...o });

  it("OS comum não tem relógio", () => {
    expect(prazoDoConserto(os(), "2026-09-10")).toBeNull();
  });

  it("folgado: no prazo, com os dias que restam", () => {
    const p = prazoDoConserto(retorno(), "2026-09-10");
    expect(p?.situacao).toBe("no_prazo");
    expect(p?.limite).toBe("2026-10-01");
    expect(p?.diasRestantes).toBe(21);
  });

  it("a sete dias ou menos, avisa", () => {
    expect(prazoDoConserto(retorno(), "2026-09-24")?.situacao).toBe("vence_logo");
    expect(prazoDoConserto(retorno(), "2026-09-24")?.texto).toBe("Prazo CDC vence em 7 dia(s)");
    expect(prazoDoConserto(retorno(), "2026-09-23")?.situacao).toBe("no_prazo");
    expect(prazoDoConserto(retorno(), "2026-10-01")?.texto).toBe("Prazo CDC vence hoje");
  });

  it("passou: vencido, dizendo há quanto tempo", () => {
    const p = prazoDoConserto(retorno(), "2026-10-04");
    expect(p?.situacao).toBe("vencido");
    expect(p?.texto).toBe("Prazo CDC vencido há 3 dia(s)");
  });

  it("aberta tarde da noite conta do dia do balcão", () => {
    const p = prazoDoConserto(retorno({ criadoEm: "2026-09-02T01:00:00Z" }), "2026-09-10");
    expect(p?.limite).toBe("2026-10-01");
  });

  it("conserto que saiu da bancada para de contar", () => {
    for (const status of ["pronta", "entregue", "cancelada"] as const) {
      expect(prazoDoConserto(retorno({ status }), "2026-12-01")).toBeNull();
    }
  });

  it("virada de mês e de ano", () => {
    expect(prazoDoConserto(retorno({ criadoEm: "2026-12-15" }), "2026-12-20")?.limite).toBe("2027-01-14");
    expect(prazoDoConserto(retorno({ criadoEm: "2027-01-31" }), "2027-02-01")?.limite).toBe("2027-03-02");
  });
});

describe("aparelho pronto e não retirado", () => {
  const pronta = (prontaEm: string) => os({ status: "pronta", prontaEm });

  it("antes de 30 dias não incomoda", () => {
    expect(alertaDeAbandono(pronta("2026-09-01"), "2026-09-30")).toBeNull();
  });

  it("marcos de 30, 60 e 90 dias", () => {
    expect(alertaDeAbandono(pronta("2026-09-01"), "2026-10-01")?.marco).toBe(30);
    expect(alertaDeAbandono(pronta("2026-09-01"), "2026-10-30")?.marco).toBe(30);
    expect(alertaDeAbandono(pronta("2026-09-01"), "2026-10-31")?.marco).toBe(60);
    expect(alertaDeAbandono(pronta("2026-09-01"), "2026-11-30")?.marco).toBe(90);
    expect(alertaDeAbandono(pronta("2026-09-01"), "2027-06-01")?.marco).toBe(90);
  });

  it("só vale para OS pronta", () => {
    expect(alertaDeAbandono(os({ status: "entregue", prontaEm: "2026-01-01" }), "2026-09-01")).toBeNull();
    expect(alertaDeAbandono(os({ status: "pronta" }), "2026-09-01")).toBeNull();
  });

  it("a mensagem sobe o tom sem ameaçar, e o de 90 lembra o termo", () => {
    const o = pronta("2026-09-01");
    const m30 = mensagemDeAbandono(o, { nome: "Maria Souza" }, config, "2026-10-01");
    expect(m30).toContain("Oi, Maria!");
    expect(m30).toContain("OS00033");
    expect(m30).toContain("01/09");
    expect(m30).not.toContain("Souza");

    const m90 = mensagemDeAbandono(o, { nome: "Maria" }, config, "2026-11-30");
    expect(m90).toContain("90 dias");
    expect(m90).toContain("termo");
  });

  it("taxa de guarda só aparece se a loja cobra", () => {
    const o = pronta("2026-09-01");
    expect(mensagemDeAbandono(o, undefined, config, "2026-10-31")).not.toContain("taxa");
    expect(
      mensagemDeAbandono(o, undefined, { ...config, taxaArmazenamentoDia: 5 }, "2026-10-31")
    ).toContain("taxa de guarda");
  });

  it("sem marco, sem mensagem", () => {
    expect(mensagemDeAbandono(pronta("2026-09-20"), undefined, config, "2026-09-25")).toBe("");
  });

  it("sem emoji: vai para o WhatsApp", () => {
    for (const hoje of ["2026-10-01", "2026-10-31", "2026-11-30"]) {
      expect(mensagemDeAbandono(pronta("2026-09-01"), { nome: "Ana" }, config, hoje)).not.toMatch(
        /\p{Extended_Pictographic}/u
      );
    }
  });
});

describe("prazos em risco, para o painel", () => {
  it("retorno vencido vem antes de qualquer abandono; folgado não entra", () => {
    const lista = prazosEmRisco(
      [
        os({ id: "a", status: "pronta", prontaEm: "2026-01-01" }),
        os({ id: "b", retornoGarantia: true, criadoEm: "2026-09-01" }),
        os({ id: "c", retornoGarantia: true, criadoEm: "2026-10-20" }),
        os({ id: "d", status: "pronta", prontaEm: "2026-09-20" }),
      ],
      "2026-10-05"
    );
    expect(lista.map((x) => x.os.id)).toEqual(["b", "a"]);
  });
});

describe("termo de garantia impresso", () => {
  it("sempre imprime os 90 dias do CDC", () => {
    expect(termoDeGarantia({ garantiaDias: 0 })).toContain("90 dias");
    expect(termoDeGarantia({ garantiaDias: 0 })).toContain("art. 26");
    expect(termoDeGarantia({ garantiaDias: 0 })).not.toContain("Garantia da loja");
  });
  it("a garantia da loja sai à parte, só quando cadastrada", () => {
    expect(termoDeGarantia({ garantiaDias: 180 })).toContain("Garantia da loja: 180 dias");
  });
});
