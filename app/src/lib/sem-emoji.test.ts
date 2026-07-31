import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Nenhum emoji sai do sistema.
 *
 * A regra existe porque em alguns aparelhos o emoji chega como "?" e suja o
 * recado — vale para WhatsApp, Telegram e recibo. Estava escrita e mesmo
 * assim a cobrança de fiado saía com três emojis no meio do texto, por meses,
 * porque ninguém relê uma string que já funciona.
 *
 * A varredura é do código inteiro, não só dos arquivos de mensagem. É mais
 * larga do que a regra precisa de propósito: todo emoji que existiu neste
 * repositório estava numa mensagem que ia para fora, e a fronteira entre
 * "texto de tela" e "texto que vai para o WhatsApp" muda de lugar toda vez
 * que alguém move uma função.
 *
 * Emoji que fica SÓ na tela é permitido, marcando a linha com
 * `// emoji-na-tela`. A marca não é burocracia: ela é a diferença entre
 * "alguém decidiu que este aqui nunca vai para o WhatsApp" e "passou
 * despercebido", que é como os três da cobrança entraram.
 */

const RAIZ = new URL("../..", import.meta.url).pathname;

/** Emoji de verdade. Símbolos de texto (© ± →) ficam de fora de propósito. */
const EMOJI = /\p{Extended_Pictographic}/u;

function arquivos(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === "dist" || nome.startsWith(".")) continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      arquivos(caminho, achados);
    } else if (
      /\.(ts|tsx|js)$/.test(nome) &&
      !nome.includes(".test.") &&
      !nome.endsWith(".d.ts")
    ) {
      achados.push(caminho);
    }
  }
  return achados;
}

describe("nenhum emoji sai do sistema", () => {
  it("não há emoji em nenhum arquivo de código", () => {
    const comEmoji = [...arquivos(join(RAIZ, "src")), ...arquivos(join(RAIZ, "api"))]
      .map((f) => ({ f, linhas: readFileSync(f, "utf8").split("\n") }))
      .flatMap(({ f, linhas }) =>
        linhas
          .map((l, i) => ({ f, n: i + 1, l }))
          .filter((x) => EMOJI.test(x.l) && !x.l.includes("emoji-na-tela"))
          .map((x) => `${x.f.replace(RAIZ, "")}:${x.n}: ${x.l.trim()}`)
      );

    expect(comEmoji).toEqual([]);
  });

  it("a varredura funciona: um emoji plantado é encontrado", () => {
    // Sem isto, um erro no regex faria o teste de cima passar sempre — que é
    // pior do que não ter teste, porque dá a impressão de estar coberto.
    expect(EMOJI.test("Saldo devedor: 💰")).toBe(true);
    expect(EMOJI.test("Saldo devedor: R$ 340,00")).toBe(false);
  });
});
