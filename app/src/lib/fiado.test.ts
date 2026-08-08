import { describe, it, expect } from "vitest";
import {
  estadoFiado,
  diasEmAberto,
  fiadosParaCobrar,
  totalParaCobrar,
  DIAS_PARA_COBRAR_SEM_VENCIMENTO,
} from "./fiado";
import type { Fiado } from "./types";

const HOJE = "2026-08-08";

const f = (x: Partial<Fiado> = {}): Fiado =>
  ({
    id: "f1",
    clienteId: "c1",
    descricao: "Troca de tela",
    valor: 300,
    pagamentos: [],
    quitado: false,
    criadoEm: "2026-08-01T10:00:00.000Z",
    ...x,
  }) as Fiado;

describe("dívida com vencimento combinado", () => {
  it("dentro do prazo não incomoda ninguém", () => {
    const e = estadoFiado(f({ vencimento: "2026-08-20" }), HOJE);
    expect(e.situacao).toBe("em_dia");
    expect(e.cobravel).toBe(false);
    expect(e.dias).toBe(12);
  });

  it("vencer HOJE ainda não é atraso", () => {
    // Cobrar no próprio dia do vencimento é cobrar quem ainda vai pagar na
    // parte da tarde.
    expect(estadoFiado(f({ vencimento: HOJE }), HOJE).situacao).toBe("em_dia");
  });

  it("passou do prazo, é vencido, e diz há quantos dias", () => {
    const e = estadoFiado(f({ vencimento: "2026-08-01" }), HOJE);
    expect(e.situacao).toBe("vencido");
    expect(e.dias).toBe(7);
    expect(e.cobravel).toBe(true);
  });
});

/**
 * O caminho mais usado para fiar numa assistência é entregar a OS no fiado,
 * e esse caminho nunca preencheu vencimento. A dívida entrava no "Total a
 * receber" e ficava lá para sempre: nunca aparecia como atrasada, nunca
 * entrava no aviso de segunda, e ninguém procura por dinheiro que nunca
 * chegou.
 */
describe("dívida sem vencimento nenhum", () => {
  it("conta os dias desde que nasceu", () => {
    expect(diasEmAberto(f({ criadoEm: "2026-07-09T23:00:00.000Z" }), HOJE)).toBe(30);
  });

  it("nova ainda não é cobrança: sete dias é a semana que vem", () => {
    const e = estadoFiado(f({ criadoEm: "2026-08-01T10:00:00.000Z" }), HOJE);
    expect(e.situacao).toBe("em_dia");
    expect(e.cobravel).toBe(false);
  });

  it("passado o limite vira PARADA, e não vencida", () => {
    // A diferença importa: vencida quebrou um prazo combinado, parada não
    // prometeu data nenhuma. Cobrar as duas com a mesma dureza custa o
    // cliente que nunca combinou prazo.
    const e = estadoFiado(f({ criadoEm: "2026-06-01T10:00:00.000Z" }), HOJE);
    expect(e.situacao).toBe("parado");
    expect(e.dias).toBe(68);
    expect(e.cobravel).toBe(true);
  });

  it("o limite é o dia exato, sem véspera", () => {
    const nasceu = (dias: number) => {
      const d = new Date(Date.parse(HOJE + "T00:00:00Z") - dias * 86400000);
      return d.toISOString();
    };
    const limite = DIAS_PARA_COBRAR_SEM_VENCIMENTO;
    expect(estadoFiado(f({ criadoEm: nasceu(limite - 1) }), HOJE).cobravel).toBe(false);
    expect(estadoFiado(f({ criadoEm: nasceu(limite) }), HOJE).cobravel).toBe(true);
  });

  it("data de criação estragada não vira dívida de dez anos", () => {
    expect(estadoFiado(f({ criadoEm: "" }), HOJE).situacao).toBe("em_dia");
    expect(diasEmAberto(f({ criadoEm: "sei lá" }), HOJE)).toBe(0);
  });
});

describe("quem já pagou nunca é cobrado", () => {
  it("marcado como quitado sai da lista mesmo com data velha", () => {
    const e = estadoFiado(f({ quitado: true, vencimento: "2026-01-01" }), HOJE);
    expect(e.situacao).toBe("quitado");
    expect(e.cobravel).toBe(false);
  });

  it("saldo zerado pelos pagamentos também conta como quitado", () => {
    // A marca `quitado` é gravada pela tela; o saldo é a verdade. Confiar só
    // na marca mandaria cobrança para quem pagou tudo numa gravação que não
    // chegou a atualizar o campo.
    const pago = f({
      vencimento: "2026-01-01",
      pagamentos: [{ data: "", valor: 300, formaPagamento: "pix" }],
    });
    expect(estadoFiado(pago, HOJE).situacao).toBe("quitado");
  });
});

describe("a lista de quem precisa de um toque", () => {
  const lista = [
    f({ id: "novo", criadoEm: "2026-08-05T10:00:00.000Z" }),
    f({ id: "vencido", valor: 100, vencimento: "2026-08-05" }),
    f({ id: "antigo", valor: 200, criadoEm: "2026-01-10T10:00:00.000Z" }),
    f({ id: "pago", quitado: true, vencimento: "2026-01-01" }),
  ];

  it("traz só quem é cobrável, do mais antigo para o mais novo", () => {
    // Ordena por dias e não por valor: quem deve há oito meses é quem some,
    // e dívida velha é dívida que vira prejuízo.
    expect(fiadosParaCobrar(lista, HOJE).map((x) => x.fiado.id)).toEqual([
      "antigo",
      "vencido",
    ]);
  });

  it("soma o que está atrasado, que é o número que move alguém", () => {
    expect(totalParaCobrar(lista, HOJE)).toBe(300);
  });

  it("lista vazia não vira NaN", () => {
    expect(totalParaCobrar([], HOJE)).toBe(0);
    expect(fiadosParaCobrar([], HOJE)).toEqual([]);
  });
});
