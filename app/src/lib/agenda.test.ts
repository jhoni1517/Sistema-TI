import { describe, it, expect } from "vitest";
import {
  avancar,
  ocorrenciasEntre,
  proximaOcorrencia,
  aniversarioNoAno,
  aniversariosEntre,
  agendaEntre,
  gradeDoMes,
  limitesDoMes,
  paraAvisarHoje,
  quandoTexto,
} from "./agenda";
import type { Cliente, Evento } from "./types";

const evento = (e: Partial<Evento> = {}): Evento => ({
  id: "e1",
  titulo: "Visita",
  tipo: "atendimento",
  data: "2026-03-10",
  criadoEm: "2026-01-01T00:00:00.000Z",
  ...e,
});

const cliente = (c: Partial<Cliente> = {}): Cliente => ({
  id: "c1",
  nome: "João",
  telefone: "",
  criadoEm: "2026-01-01T00:00:00.000Z",
  ...c,
});

describe("avancar", () => {
  it("semanal soma 7 dias", () => {
    expect(avancar("2026-03-10", "semanal")).toBe("2026-03-17");
  });

  it("mensal atravessa a virada do ano", () => {
    expect(avancar("2026-12-15", "mensal")).toBe("2027-01-15");
  });

  it("dia 31 vira 28 em fevereiro, e VOLTA para 31 em março", () => {
    // O erro clássico é guardar só a última data: o evento ficaria preso
    // no dia 28 para sempre depois de passar por fevereiro.
    const fev = avancar("2026-01-31", "mensal", 31);
    expect(fev).toBe("2026-02-28");
    expect(avancar(fev, "mensal", 31)).toBe("2026-03-31");
  });

  it("dia 31 vira 30 em abril", () => {
    expect(avancar("2026-03-31", "mensal", 31)).toBe("2026-04-30");
  });

  it("anual de 29/02 cai em 28/02 no ano comum", () => {
    expect(avancar("2028-02-29", "anual", 29)).toBe("2029-02-28");
  });

  it("anual mantém 29/02 quando o ano de destino é bissexto", () => {
    expect(avancar("2027-02-28", "anual", 29)).toBe("2028-02-29");
  });

  it("não repetir devolve a mesma data", () => {
    expect(avancar("2026-03-10", "nenhuma")).toBe("2026-03-10");
  });
});

describe("ocorrenciasEntre", () => {
  it("evento único só aparece se estiver dentro do intervalo", () => {
    expect(ocorrenciasEntre(evento(), "2026-03-01", "2026-03-31")).toEqual(["2026-03-10"]);
    expect(ocorrenciasEntre(evento(), "2026-04-01", "2026-04-30")).toEqual([]);
  });

  it("semanal lista todas as semanas do mês", () => {
    const o = ocorrenciasEntre(
      evento({ data: "2026-03-02", repetir: "semanal" }),
      "2026-03-01",
      "2026-03-31"
    );
    expect(o).toEqual(["2026-03-02", "2026-03-09", "2026-03-16", "2026-03-23", "2026-03-30"]);
  });

  it("não devolve ocorrência anterior ao começo do evento", () => {
    const o = ocorrenciasEntre(
      evento({ data: "2026-03-10", repetir: "mensal" }),
      "2026-01-01",
      "2026-03-31"
    );
    expect(o).toEqual(["2026-03-10"]);
  });

  it("anual atravessa vários anos sem se perder", () => {
    const o = ocorrenciasEntre(
      evento({ data: "2026-05-20", repetir: "anual" }),
      "2028-01-01",
      "2029-12-31"
    );
    expect(o).toEqual(["2028-05-20", "2029-05-20"]);
  });
});

describe("proximaOcorrencia", () => {
  it("evento único que já passou não tem próxima", () => {
    expect(proximaOcorrencia(evento({ data: "2026-01-05" }), "2026-03-01")).toBeNull();
  });

  it("evento único futuro devolve a própria data", () => {
    expect(proximaOcorrencia(evento({ data: "2026-03-10" }), "2026-03-01")).toBe("2026-03-10");
  });

  it("no próprio dia ainda conta como próxima", () => {
    expect(proximaOcorrencia(evento({ data: "2026-03-10" }), "2026-03-10")).toBe("2026-03-10");
  });

  it("mensal pula para o mês seguinte quando o dia já passou", () => {
    const e = evento({ data: "2026-01-10", repetir: "mensal" });
    expect(proximaOcorrencia(e, "2026-03-15")).toBe("2026-04-10");
  });
});

describe("aniversário", () => {
  it("usa só o dia e o mês, ignorando o ano cadastrado", () => {
    expect(aniversarioNoAno("1990-07-15", 2026)).toBe("2026-07-15");
  });

  it("29/02 comemora em 28/02 no ano comum", () => {
    expect(aniversarioNoAno("2000-02-29", 2026)).toBe("2026-02-28");
    expect(aniversarioNoAno("2000-02-29", 2028)).toBe("2028-02-29");
  });

  it("data inválida não vira aniversário", () => {
    expect(aniversarioNoAno("", 2026)).toBeNull();
    expect(aniversarioNoAno("15/07/1990", 2026)).toBeNull();
  });

  it("calcula a idade que a pessoa faz", () => {
    const [a] = aniversariosEntre([cliente({ nascimento: "1990-07-15" })], "2026-07-01", "2026-07-31");
    expect(a.idade).toBe(36);
    expect(a.titulo).toContain("João");
  });

  it("não inventa idade quando o ano é claramente 'não sei'", () => {
    const [a] = aniversariosEntre([cliente({ nascimento: "1900-07-15" })], "2026-07-01", "2026-07-31");
    expect(a.idade).toBeUndefined();
  });

  it("cliente sem nascimento não gera nada", () => {
    expect(aniversariosEntre([cliente()], "2026-01-01", "2026-12-31")).toEqual([]);
  });
});

describe("agendaEntre", () => {
  it("mistura eventos e aniversários em ordem de data e hora", () => {
    const lista = agendaEntre(
      [
        evento({ id: "a", data: "2026-07-15", hora: "14:00", titulo: "Tarde" }),
        evento({ id: "b", data: "2026-07-15", hora: "08:00", titulo: "Manhã" }),
        evento({ id: "c", data: "2026-07-10", titulo: "Antes" }),
      ],
      [cliente({ nascimento: "1990-07-20" })],
      "2026-07-01",
      "2026-07-31"
    );
    expect(lista.map((o) => o.titulo)).toEqual([
      "Antes",
      "Manhã",
      "Tarde",
      "Aniversário de João",
    ]);
  });

  it("evento que se repete nunca aparece como concluído nas datas futuras", () => {
    // Concluir a visita de março não pode apagar a de abril.
    const lista = agendaEntre(
      [evento({ data: "2026-03-10", repetir: "mensal", concluido: true })],
      [],
      "2026-03-01",
      "2026-04-30"
    );
    expect(lista.every((o) => !o.concluido)).toBe(true);
  });
});

describe("gradeDoMes", () => {
  it("devolve 42 dias, sempre em semanas inteiras", () => {
    expect(gradeDoMes(2026, 3)).toHaveLength(42);
  });

  it("começa no domingo anterior ao dia 1", () => {
    // 01/03/2026 é domingo, então a grade começa nele mesmo.
    expect(gradeDoMes(2026, 3)[0]).toBe("2026-03-01");
    // 01/07/2026 é quarta; a grade tem que começar no domingo, 28/06.
    expect(gradeDoMes(2026, 7)[0]).toBe("2026-06-28");
  });

  it("contém todos os dias do mês pedido", () => {
    const g = gradeDoMes(2026, 2);
    expect(g).toContain("2026-02-01");
    expect(g).toContain("2026-02-28");
  });
});

describe("limitesDoMes", () => {
  it("pega o último dia certo de cada mês", () => {
    expect(limitesDoMes(2026, 2)).toEqual({ de: "2026-02-01", ate: "2026-02-28" });
    expect(limitesDoMes(2028, 2).ate).toBe("2028-02-29");
    expect(limitesDoMes(2026, 12)).toEqual({ de: "2026-12-01", ate: "2026-12-31" });
  });
});

describe("paraAvisarHoje", () => {
  it("avisa no dia quando não pediu antecedência", () => {
    const r = paraAvisarHoje([evento({ data: "2026-03-10" })], [], "2026-03-10");
    expect(r).toHaveLength(1);
  });

  it("não avisa antes da antecedência pedida", () => {
    const e = evento({ data: "2026-03-10", avisarDiasAntes: 2 });
    expect(paraAvisarHoje([e], [], "2026-03-07")).toHaveLength(0);
    expect(paraAvisarHoje([e], [], "2026-03-08")).toHaveLength(1);
  });

  it("evento que já passou não avisa mais", () => {
    expect(paraAvisarHoje([evento({ data: "2026-03-01" })], [], "2026-03-10")).toHaveLength(0);
  });

  it("evento concluído não avisa", () => {
    const e = evento({ data: "2026-03-10", concluido: true });
    expect(paraAvisarHoje([e], [], "2026-03-10")).toHaveLength(0);
  });

  it("aniversário avisa com um dia de antecedência", () => {
    const c = [cliente({ nascimento: "1990-07-15" })];
    expect(paraAvisarHoje([], c, "2026-07-14")).toHaveLength(1);
    expect(paraAvisarHoje([], c, "2026-07-13")).toHaveLength(0);
  });
});

describe("quandoTexto", () => {
  it("fala como gente", () => {
    expect(quandoTexto("2026-03-10", "2026-03-10")).toBe("hoje");
    expect(quandoTexto("2026-03-11", "2026-03-10")).toBe("amanhã");
    expect(quandoTexto("2026-03-13", "2026-03-10")).toBe("em 3 dias");
    expect(quandoTexto("2026-03-09", "2026-03-10")).toBe("ontem");
    expect(quandoTexto("2026-03-05", "2026-03-10")).toBe("há 5 dias");
  });
});
