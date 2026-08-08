import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { normalizar } from "./busca";

/**
 * Texto digitado no balcão nunca é comparado cru.
 *
 * Quem atende digita rápido, no celular, com a fila andando: escreve
 * "acucar", "pao", "agua", "feijao". O banco tem "Açúcar", "Pão de queijo",
 * "Água mineral", "Feijão". Comparar com `.toLowerCase()` só resolve a
 * maiúscula e deixa o acento — a busca devolve nada, e a conclusão do
 * operador é sempre a mesma e sempre errada: "não está cadastrado".
 *
 * O estrago não para na busca vazia. Sem achar o produto, a peça vira item
 * avulso digitado na mão: a venda sai sem baixa de estoque, a OS perde o
 * vínculo com o cadastro, e o saldo da prateleira passa a mentir em silêncio.
 *
 * Este erro foi corrigido três vezes em lugares diferentes — busca geral,
 * produtos da OS, sugestão do PDV — e voltou nas outras telas todas as
 * vezes, porque `.toLowerCase()` é o que a mão escreve sozinha. Pela regra
 * do CLAUDE.md, na terceira vez o conserto não é consertar: é escrever o
 * teste que reprova.
 *
 * A regra: em `src`, `.toLowerCase()` só pode aparecer marcado com
 * `// texto-cru-proposital`. A marca é a diferença entre decisão e descuido
 * — é ela que obriga quem escreve a parar um segundo e responder se aquele
 * texto veio de gente digitando ou de um valor interno do sistema.
 */

/** A marca que libera a linha, junto com o motivo escrito ao lado */
const MARCA = "texto-cru-proposital";

/** `normalizar` vive aqui e é ela própria quem chama `.toLowerCase()` */
const ARQUIVO_DA_REGRA = "lib/busca.ts";

function arquivosDeCodigo(dir: string, base: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      arquivosDeCodigo(caminho, base, saida);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(nome) || nome.includes(".test.")) continue;
    saida.push(caminho.slice(base.length + 1));
  }
  return saida;
}

/** Linha de comentário não é código: `.toLowerCase()` citado em texto não conta */
const ehComentario = (linha: string): boolean =>
  /^\s*(\/\/|\/\*|\*)/.test(linha);

describe("texto digitado não é comparado cru", () => {
  it("normalizar tira acento, maiúscula e espaço das pontas", () => {
    expect(normalizar("  Açúcar CRISTAL ")).toBe("acucar cristal");
    expect(normalizar("Pão de Queijo")).toBe("pao de queijo");
    expect(normalizar("João")).toBe("joao");
    expect(normalizar(undefined)).toBe("");
    expect(normalizar(null)).toBe("");
  });

  it("comparação sem acento é simétrica: os dois lados passam pela mesma conta", () => {
    // É o erro clássico: normalizar só o termo digitado e comparar com o
    // nome cru. Continua não achando.
    expect(normalizar("Feijão preto").includes(normalizar("feijao"))).toBe(true);
    expect(normalizar("Água mineral").startsWith(normalizar("AGUA"))).toBe(true);
  });

  it("nenhuma tela compara texto cru sem dizer por quê", () => {
    const base = resolve(__dirname, "..");
    const suspeitas: string[] = [];

    for (const arquivo of arquivosDeCodigo(base, base)) {
      if (arquivo.replace(/\\/g, "/") === ARQUIVO_DA_REGRA) continue;
      const linhas = readFileSync(join(base, arquivo), "utf8").split("\n");
      linhas.forEach((linha, i) => {
        if (!linha.includes(".toLowerCase()")) return;
        if (ehComentario(linha)) return;
        // A marca vale para a linha e para a anterior: a comparação às vezes
        // ocupa três linhas depois do prettier, e o comentário fica em cima.
        if (linha.includes(MARCA) || (linhas[i - 1] || "").includes(MARCA)) return;
        suspeitas.push(`${arquivo}:${i + 1}  ${linha.trim()}`);
      });
    }

    expect(
      suspeitas,
      "Texto comparado cru:\n" +
        suspeitas.join("\n") +
        `\n\nSe é texto que uma pessoa digitou, use normalizar() dos DOIS ` +
        `lados — senão "acucar" não acha "Açúcar" e o operador conclui que o ` +
        `produto não existe.\nSe é valor interno do sistema (tecla, forma de ` +
        `pagamento, nome de arquivo, chave de agrupamento), escreva ` +
        `// ${MARCA} na linha, com o motivo.`
    ).toEqual([]);
  });
});
