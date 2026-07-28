import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { avancar, proximaOcorrencia } from "./agenda";
import type { Evento, RepetirEvento } from "./types";

/**
 * A conta de datas da agenda existe DUAS VEZES: aqui em TypeScript e copiada
 * em api/cobranca.js, porque função da Vercel não importa TypeScript.
 *
 * Em vez de recopiar o código neste teste — o que só empurraria o problema,
 * já que a cópia do teste também envelhece — o arquivo real é lido do disco e
 * a função é extraída dele. Se alguém mexer só num lado, isto quebra.
 */
const fonte = readFileSync(
  resolve(__dirname, "..", "..", "api", "cobranca.js"),
  "utf8"
);

function extrair(nome: string): string {
  const i = fonte.indexOf(`function ${nome}(`);
  if (i < 0) throw new Error(`função ${nome} sumiu de api/cobranca.js`);
  // Anda pelas chaves até fechar o corpo da função.
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

/** Monta a função pedida junto das que ela chama */
const criar = <T>(nome: string, ...dependencias: string[]): T =>
  new Function(
    `${[...dependencias, nome].map(extrair).join("\n")}; return ${nome};`
  )() as T;

const avancarDoCron = criar<(d: string, r: string, dia?: number) => string>("avancarData");
const proximaDoCron = criar<(e: Record<string, unknown>, hoje: string) => string | null>(
  "proximaData",
  "avancarData"
);

const REPETICOES: RepetirEvento[] = ["nenhuma", "semanal", "mensal", "anual"];

describe("a agenda da tela e a do Telegram concordam", () => {
  it("avançar data devolve o mesmo resultado nos dois lados", () => {
    // Varre um ano inteiro, que é onde moram fevereiro, os meses de 30 e a
    // virada de ano — os três lugares onde conta de data costuma quebrar.
    let comparados = 0;
    for (const repetir of REPETICOES) {
      for (let mes = 1; mes <= 12; mes++) {
        for (const dia of [1, 15, 28, 29, 30, 31]) {
          const ultimo = new Date(Date.UTC(2026, mes, 0)).getUTCDate();
          if (dia > ultimo) continue;
          const data = `2026-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
          expect(avancarDoCron(data, repetir, dia), `${data} ${repetir}`).toBe(
            avancar(data, repetir, dia)
          );
          comparados++;
        }
      }
    }
    expect(comparados).toBeGreaterThan(200);
  });

  it("ano bissexto também bate", () => {
    for (const repetir of REPETICOES) {
      expect(avancarDoCron("2028-02-29", repetir, 29)).toBe(avancar("2028-02-29", repetir, 29));
      expect(avancarDoCron("2027-02-28", repetir, 29)).toBe(avancar("2027-02-28", repetir, 29));
    }
  });

  it("próxima ocorrência devolve a mesma data nos dois lados", () => {
    const casos: Array<[string, RepetirEvento, string]> = [
      ["2026-03-10", "nenhuma", "2026-03-01"],
      ["2026-03-10", "nenhuma", "2026-03-10"],
      ["2026-03-10", "nenhuma", "2026-03-11"],
      ["2026-01-31", "mensal", "2026-02-15"],
      ["2026-01-10", "mensal", "2026-03-15"],
      ["2026-03-02", "semanal", "2026-03-20"],
      ["2024-05-20", "anual", "2026-06-01"],
      ["2020-02-29", "anual", "2026-01-01"],
    ];
    for (const [data, repetir, hoje] of casos) {
      const evento: Evento = {
        id: "x",
        titulo: "t",
        tipo: "lembrete",
        data,
        repetir,
        criadoEm: "2026-01-01T00:00:00.000Z",
      };
      expect(proximaDoCron({ data, repetir }, hoje), `${data} ${repetir} @${hoje}`).toBe(
        proximaOcorrencia(evento, hoje)
      );
    }
  });

  it("data inválida não derruba nenhum dos dois", () => {
    expect(proximaDoCron({ data: "", repetir: "nenhuma" }, "2026-03-01")).toBeNull();
    expect(proximaDoCron({ data: "10/03/2026", repetir: "mensal" }, "2026-03-01")).toBeNull();
  });
});
