import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * O que o BANCO preenche precisa voltar para a tela.
 *
 * `upsert` grava e devolve a linha como ela ficou no banco — com os valores
 * que só o banco sabe preencher. A loja de estado descartava esse retorno e
 * guardava o objeto que a tela mandou, que não tem esses campos.
 *
 * O estrago apareceu no rastreio: a OS recém-criada não tem `rastreio` (é o
 * banco que sorteia o segredo), então o link de acompanhamento saía vazio e
 * o botão não gerava nada. Só depois de um F5 ele passava a funcionar — o
 * que dava a impressão de que o link só existe a partir de "em análise",
 * porque a essa altura a tela já tinha recarregado.
 *
 * É silencioso e vai acontecer de novo na próxima coluna com `default`.
 * Este teste lê o código do disco e cobra que o retorno seja usado.
 */

const RAIZ = new URL("../..", import.meta.url).pathname;

/** Gravações que devolvem a linha do banco */
const SALVA = /await\s+db\.(\w+)\.save\(/g;

export function descartaORetorno(codigo: string): string[] {
  const problemas: string[] = [];
  for (const m of codigo.matchAll(SALVA)) {
    // A linha inteira em que a chamada acontece
    const inicio = codigo.lastIndexOf("\n", m.index!) + 1;
    const fim = codigo.indexOf("\n", m.index!);
    const linha = codigo.slice(inicio, fim < 0 ? undefined : fim).trim();
    // Usar o retorno é atribuí-lo a alguma coisa, ou devolvê-lo.
    if (/^(const|let|var)\s|^return\s/.test(linha)) continue;
    if (linha.includes("retorno-do-banco-nao-importa")) continue;
    problemas.push(`db.${m[1]}.save descarta o que o banco devolveu`);
  }
  return problemas;
}

function arquivos(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === "dist" || nome.startsWith(".")) continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivos(caminho, achados);
    else if (/\.tsx?$/.test(nome) && !nome.includes(".test.")) achados.push(caminho);
  }
  return achados;
}

describe("o que o banco preenche volta para a tela", () => {
  it("o detector acha o retorno descartado", () => {
    expect(descartaORetorno("  await db.ordens.save(o);")).toEqual([
      "db.ordens.save descarta o que o banco devolveu",
    ]);
  });

  it("o detector aceita quem usa o retorno", () => {
    expect(descartaORetorno("  const gravada = await db.ordens.save(o);")).toEqual([]);
    expect(descartaORetorno("  return await db.ordens.save(o);")).toEqual([]);
  });

  it("a marca explícita libera quem não precisa do retorno", () => {
    expect(
      descartaORetorno("  await db.metas.save(m); // retorno-do-banco-nao-importa")
    ).toEqual([]);
  });

  it("nenhuma gravação joga fora o que o banco devolveu", () => {
    const achados = arquivos(join(RAIZ, "src")).flatMap((f) =>
      descartaORetorno(readFileSync(f, "utf8")).map((p) => `${f.replace(RAIZ, "")}: ${p}`)
    );
    expect(achados).toEqual([]);
  });
});
