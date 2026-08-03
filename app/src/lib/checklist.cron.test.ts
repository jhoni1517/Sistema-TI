import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { valeHoje, pendentesAgora, marcar } from "./checklist";
import type { TarefaDiaria } from "./types";

/**
 * A regra do checklist existe DUAS VEZES: aqui em TypeScript e copiada em
 * api/cobranca.js, porque função da Vercel não importa TypeScript.
 *
 * Em vez de recopiar o código neste teste — o que só empurraria o problema,
 * já que a cópia do teste também envelhece — o arquivo real é lido do disco
 * e a função é extraída dele. Se alguém mexer só num lado, isto quebra.
 */
const fonte = readFileSync(resolve(__dirname, "..", "..", "api", "cobranca.js"), "utf8");

function extrair(nome: string): string {
  const i = fonte.indexOf(`function ${nome}(`);
  if (i < 0) throw new Error(`função ${nome} sumiu de api/cobranca.js`);
  const abre = fonte.indexOf("{", i);
  let nivel = 0;
  for (let j = abre; j < fonte.length; j++) {
    if (fonte[j] === "{") nivel++;
    else if (fonte[j] === "}") {
      nivel--;
      if (nivel === 0) return fonte.slice(i, j + 1);
    }
  }
  throw new Error(`não consegui ler o corpo de ${nome}`);
}

const criar = <T>(nome: string, ...dependencias: string[]): T =>
  new Function(`${[...dependencias, nome].map(extrair).join("\n")}; return ${nome};`)() as T;

type Linha = Record<string, unknown>;

const valeHojeDoCron = criar<(t: Linha, hoje: string) => boolean>("tarefaValeHoje");
const paraAvisarDoCron = criar<(t: Linha[], hoje: string, agora: string) => Linha[]>(
  "tarefasParaAvisar",
  "tarefaValeHoje"
);
const horaDaLoja = criar<(d: Date, fuso: number) => string>("horaDaLoja");
const diaDaLoja = criar<(d: Date, fuso: number) => string>("diaDaLoja");

const t = (p: Partial<TarefaDiaria> = {}): TarefaDiaria => ({
  id: "t1",
  titulo: "Beber água",
  feitoEm: [],
  criadoEm: "2026-01-01T00:00:00.000Z",
  ...p,
});

const DOMINGO = "2026-08-02";
const SEGUNDA = "2026-08-03";

describe("o robô e a tela concordam sobre quando a tarefa vale", () => {
  const casos: [string, TarefaDiaria, string][] = [
    ["sem dias marcados vale todo dia", t(), DOMINGO],
    ["com dias marcados, no dia certo", t({ dias: [1] }), SEGUNDA],
    ["com dias marcados, no dia errado", t({ dias: [1] }), DOMINGO],
    ["desligada não vale", t({ ativo: false }), SEGUNDA],
    ["só de semana, no domingo", t({ dias: [1, 2, 3, 4, 5] }), DOMINGO],
  ];

  for (const [nome, tarefa, dia] of casos) {
    it(nome, () => {
      expect(valeHojeDoCron(tarefa as unknown as Linha, dia)).toBe(valeHoje(tarefa, dia));
    });
  }
});

describe("o robô e a tela concordam sobre o que já passou da hora", () => {
  const lista = (): TarefaDiaria[] => [
    t({ id: "manha", titulo: "Abrir", horario: "08:00", avisar: true }),
    t({ id: "tarde", titulo: "Fornecedor", horario: "14:00", avisar: true }),
    t({ id: "semHora", titulo: "Beber água", avisar: true }),
    t({ id: "feita", titulo: "Varrer", horario: "07:00", avisar: true, feitoEm: [SEGUNDA] }),
  ];

  for (const agora of ["07:30", "08:00", "12:00", "23:59"]) {
    it(`às ${agora} a lista é a mesma dos dois lados`, () => {
      const daTela = pendentesAgora(lista(), SEGUNDA, agora).map((x) => x.id);
      const doCron = paraAvisarDoCron(lista() as unknown as Linha[], SEGUNDA, agora).map(
        (x) => x.id
      );
      expect(doCron).toEqual(daTela);
    });
  }

  it("tarefa já marcada como feita não vira recado", () => {
    const ids = paraAvisarDoCron(lista() as unknown as Linha[], SEGUNDA, "23:59").map(
      (x) => x.id
    );
    expect(ids).not.toContain("feita");
  });

  it("tarefa sem horário nunca vira recado", () => {
    const ids = paraAvisarDoCron(lista() as unknown as Linha[], SEGUNDA, "23:59").map(
      (x) => x.id
    );
    expect(ids).not.toContain("semHora");
  });
});

/**
 * `avisadoEm` é o que impede o mesmo recado de sair a cada disparo do robô.
 * Aviso repetido é o jeito mais rápido de a pessoa desligar tudo.
 */
describe("o robô não repete o recado no mesmo dia", () => {
  it("já avisada hoje sai da lista", () => {
    const lista = [t({ id: "a", horario: "08:00", avisar: true, avisadoEm: SEGUNDA })];
    expect(paraAvisarDoCron(lista as unknown as Linha[], SEGUNDA, "09:00")).toEqual([]);
  });

  it("avisada ONTEM volta a valer hoje", () => {
    const lista = [t({ id: "a", horario: "08:00", avisar: true, avisadoEm: DOMINGO })];
    expect(paraAvisarDoCron(lista as unknown as Linha[], SEGUNDA, "09:00")).toHaveLength(1);
  });

  it("quem não pediu aviso nunca entra", () => {
    const lista = [t({ id: "a", horario: "08:00", avisar: false })];
    expect(paraAvisarDoCron(lista as unknown as Linha[], SEGUNDA, "09:00")).toEqual([]);
  });

  it("marcar como feita na tela cala o robô", () => {
    const feita = marcar(t({ id: "a", horario: "08:00", avisar: true }), SEGUNDA, true);
    expect(paraAvisarDoCron([feita] as unknown as Linha[], SEGUNDA, "09:00")).toEqual([]);
  });
});

/**
 * O robô roda no servidor, em UTC. A tarefa marcada para as 14h é 14h no
 * relógio de quem está na loja — sem isto o lembrete das duas da tarde
 * chegaria às onze da manhã.
 */
describe("o relógio é o do balcão, não o de Greenwich", () => {
  it("converte a hora para o fuso da loja", () => {
    expect(horaDaLoja(new Date("2026-08-03T17:00:00Z"), -3)).toBe("14:00");
    expect(horaDaLoja(new Date("2026-08-03T12:05:00Z"), -3)).toBe("09:05");
  });

  it("vira o dia junto com a loja, e não três horas antes", () => {
    // 21h em São Paulo ainda é dia 3, embora em UTC já seja dia 4.
    expect(diaDaLoja(new Date("2026-08-04T00:30:00Z"), -3)).toBe("2026-08-03");
    expect(diaDaLoja(new Date("2026-08-03T12:00:00Z"), -3)).toBe("2026-08-03");
  });
});
