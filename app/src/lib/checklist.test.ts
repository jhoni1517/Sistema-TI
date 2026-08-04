import { describe, it, expect } from "vitest";
import {
  valeHoje,
  estaFeita,
  marcar,
  tarefasDoDia,
  progressoDoDia,
  pendentesAgora,
  proximaDoDia,
  sequencia,
  problemaNaTarefa,
  mensagemDoLembrete,
  diaDaSemana,
  horaAgora,
  DIAS_GUARDADOS,
} from "./checklist";
import type { TarefaDiaria } from "./types";

const t = (p: Partial<TarefaDiaria> = {}): TarefaDiaria => ({
  id: "t1",
  titulo: "Beber água",
  feitoEm: [],
  criadoEm: "2026-01-01T00:00:00.000Z",
  ...p,
});

// 2026-08-02 é um domingo; 2026-08-03, segunda.
const DOMINGO = "2026-08-02";
const SEGUNDA = "2026-08-03";

describe("que dia é hoje para a tarefa", () => {
  it("lê o dia da semana em UTC, e não um dia antes", () => {
    // Em hora local, num fuso negativo, "2026-08-03" viraria domingo.
    expect(diaDaSemana(DOMINGO)).toBe(0);
    expect(diaDaSemana(SEGUNDA)).toBe(1);
  });

  it("sem dias marcados, vale todo dia", () => {
    expect(valeHoje(t(), DOMINGO)).toBe(true);
    expect(valeHoje(t(), SEGUNDA)).toBe(true);
  });

  it("com dias marcados, vale só neles", () => {
    const util = t({ dias: [1, 2, 3, 4, 5] });
    expect(valeHoje(util, SEGUNDA)).toBe(true);
    expect(valeHoje(util, DOMINGO)).toBe(false);
  });

  it("tarefa desligada não vale nunca", () => {
    expect(valeHoje(t({ ativo: false }), SEGUNDA)).toBe(false);
  });
});

/**
 * Feito é POR DIA, não uma bandeira.
 *
 * Um campo `feito` obrigaria alguém a desmarcar tudo toda manhã, e ninguém
 * faz isso: no terceiro dia a lista está toda marcada e não quer dizer mais
 * nada.
 */
describe("marcar e desmarcar", () => {
  it("a tarefa de ontem não nasce marcada hoje", () => {
    const feita = marcar(t(), DOMINGO, true);
    expect(estaFeita(feita, DOMINGO)).toBe(true);
    expect(estaFeita(feita, SEGUNDA)).toBe(false);
  });

  it("desmarcar tira só aquele dia", () => {
    let x = marcar(t(), DOMINGO, true);
    x = marcar(x, SEGUNDA, true);
    x = marcar(x, SEGUNDA, false);
    expect(estaFeita(x, DOMINGO)).toBe(true);
    expect(estaFeita(x, SEGUNDA)).toBe(false);
  });

  it("marcar duas vezes não duplica o dia", () => {
    const x = marcar(marcar(t(), SEGUNDA, true), SEGUNDA, true);
    expect(x.feitoEm).toEqual([SEGUNDA]);
  });

  it("o histórico não cresce para sempre", () => {
    // A tabela é lida inteira a cada carga, como produtos. Guardar tudo
    // faria cada F5 baixar anos de marcação no 4G do balcão.
    const antigo = t({ feitoEm: ["2020-01-01", "2020-01-02"] });
    const x = marcar(antigo, SEGUNDA, true);
    expect(x.feitoEm).toEqual([SEGUNDA]);
  });

  it("guarda a janela inteira, não só o dia de hoje", () => {
    const ontem = "2026-08-02";
    const x = marcar(marcar(t(), ontem, true), SEGUNDA, true);
    expect(x.feitoEm).toEqual([ontem, SEGUNDA]);
    expect(DIAS_GUARDADOS).toBeGreaterThan(30);
  });
});

describe("a ordem em que o dia acontece", () => {
  it("quem tem horário vem primeiro, em ordem de relógio", () => {
    const lista = [
      t({ id: "sem", titulo: "Beber água" }),
      t({ id: "tarde", titulo: "Fornecedor", horario: "14:00" }),
      t({ id: "cedo", titulo: "Abrir caixa", horario: "08:30" }),
    ];
    expect(tarefasDoDia(lista, SEGUNDA).map((x) => x.id)).toEqual(["cedo", "tarde", "sem"]);
  });

  it("as sem horário ficam no fim, em ordem alfabética", () => {
    const lista = [t({ id: "b", titulo: "Varrer" }), t({ id: "a", titulo: "Água" })];
    expect(tarefasDoDia(lista, SEGUNDA).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("tarefa que não vale hoje fica de fora", () => {
    const lista = [t({ id: "util", dias: [1, 2, 3, 4, 5] }), t({ id: "sempre" })];
    expect(tarefasDoDia(lista, DOMINGO).map((x) => x.id)).toEqual(["sempre"]);
  });
});

describe("progresso do dia", () => {
  it("conta só as do dia", () => {
    const lista = [
      marcar(t({ id: "a" }), SEGUNDA, true),
      t({ id: "b" }),
      t({ id: "fds", dias: [0] }),
    ];
    const p = progressoDoDia(lista, SEGUNDA);
    expect(p).toEqual({ feitas: 1, total: 2, percentual: 50, completo: false });
  });

  it("lista vazia dá zero, não NaN", () => {
    expect(progressoDoDia([], SEGUNDA)).toEqual({
      feitas: 0,
      total: 0,
      percentual: 0,
      completo: false,
    });
  });

  it("tudo feito fecha o dia", () => {
    const p = progressoDoDia([marcar(t(), SEGUNDA, true)], SEGUNDA);
    expect(p.completo).toBe(true);
    expect(p.percentual).toBe(100);
  });
});

/**
 * O que vira lembrete.
 *
 * Tarefa sem horário nunca entra: ela não tem hora para cobrar, e cobrar a
 * toda hora é o jeito mais rápido de a pessoa desligar os avisos.
 */
describe("o que já passou da hora", () => {
  const lista = () => [
    t({ id: "manha", titulo: "Abrir", horario: "08:00" }),
    t({ id: "tarde", titulo: "Fornecedor", horario: "14:00" }),
    t({ id: "sem", titulo: "Beber água" }),
  ];

  it("só o que já passou da hora e não foi feito", () => {
    expect(pendentesAgora(lista(), SEGUNDA, "09:00").map((x) => x.id)).toEqual(["manha"]);
    expect(pendentesAgora(lista(), SEGUNDA, "15:00").map((x) => x.id)).toEqual([
      "manha",
      "tarde",
    ]);
  });

  it("tarefa sem horário nunca vira lembrete", () => {
    expect(pendentesAgora(lista(), SEGUNDA, "23:59").some((x) => x.id === "sem")).toBe(false);
  });

  it("o que já foi feito não cobra mais", () => {
    const feita = lista().map((x) => (x.id === "manha" ? marcar(x, SEGUNDA, true) : x));
    expect(pendentesAgora(feita, SEGUNDA, "09:00")).toEqual([]);
  });

  it("na hora exata já conta", () => {
    expect(pendentesAgora(lista(), SEGUNDA, "08:00").map((x) => x.id)).toEqual(["manha"]);
  });

  it("diz também o que ainda vem", () => {
    expect(proximaDoDia(lista(), SEGUNDA, "09:00")?.id).toBe("tarde");
    expect(proximaDoDia(lista(), SEGUNDA, "23:00")).toBeUndefined();
  });
});

describe("sequência de dias", () => {
  it("conta os dias seguidos, de trás para a frente", () => {
    const x = t({ feitoEm: ["2026-08-01", "2026-08-02", "2026-08-03"] });
    expect(sequencia(x, "2026-08-03")).toBe(3);
  });

  it("o dia de hoje ainda não cumprido não quebra a corrente", () => {
    // Às nove da manhã a pessoa ainda vai cumprir: zerar ali seria punir
    // por não ter feito o dia que nem acabou.
    const x = t({ feitoEm: ["2026-08-01", "2026-08-02"] });
    expect(sequencia(x, "2026-08-03")).toBe(2);
  });

  it("um dia pulado no meio quebra", () => {
    const x = t({ feitoEm: ["2026-08-01", "2026-08-03"] });
    expect(sequencia(x, "2026-08-03")).toBe(1);
  });

  it("o dia em que a tarefa não valia não quebra a sequência", () => {
    // Quem marcou "só de segunda a sexta" não perde por causa do domingo.
    const x = t({
      dias: [1, 2, 3, 4, 5],
      feitoEm: ["2026-07-31", "2026-08-03"], // sexta e segunda
    });
    expect(sequencia(x, "2026-08-03")).toBe(2);
  });

  it("nunca cumprida é zero", () => {
    expect(sequencia(t(), SEGUNDA)).toBe(0);
  });
});

describe("recusa antes de gravar", () => {
  it("tarefa sem título não salva", () => {
    expect(problemaNaTarefa({ titulo: "  " })).toContain("Escreva");
  });

  it("horário fora do formato é recusado", () => {
    expect(problemaNaTarefa({ titulo: "x", horario: "14h" })).toContain("14:30");
    expect(problemaNaTarefa({ titulo: "x", horario: "25:00" })).toContain("não existe");
    expect(problemaNaTarefa({ titulo: "x", horario: "10:75" })).toContain("não existe");
  });

  it("aviso sem horário é recusado, dizendo por quê", () => {
    // Senão a pessoa fica esperando por um lembrete que nunca vem.
    expect(problemaNaTarefa({ titulo: "x", avisar: true })).toContain("horário");
  });

  it("tarefa completa passa", () => {
    expect(problemaNaTarefa({ titulo: "Abrir caixa", horario: "08:00", avisar: true })).toBe("");
    expect(problemaNaTarefa({ titulo: "Beber água" })).toBe("");
  });
});

describe("o recado que sai para o Telegram", () => {
  it("lista horário e tarefa, sem emoji", () => {
    const msg = mensagemDoLembrete([t({ titulo: "Fornecedor", horario: "14:00" })]);
    expect(msg).toContain("14:00 Fornecedor");
    // Em alguns aparelhos emoji chega como "?" e suja o recado.
    expect(/\p{Extended_Pictographic}/u.test(msg)).toBe(false);
  });

  it("sem pendência não manda nada", () => {
    expect(mensagemDoLembrete([])).toBe("");
  });
});

describe("a hora de agora é a do balcão", () => {
  it("lê o relógio local, com dois dígitos", () => {
    // Mesma decisão de hojeISO: quem está no balcão vive no fuso dele.
    const d = new Date(2026, 7, 3, 8, 5);
    expect(horaAgora(d)).toBe("08:05");
  });
});
