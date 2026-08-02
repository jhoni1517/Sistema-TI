import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * A comissão é uma conta só, e ela mora em lib/desempenho.ts.
 *
 * A regra da casa é clara: comissão é sobre o LUCRO, não sobre o
 * faturamento, e só do que foi entregue. Comissão sobre faturamento paga o
 * técnico por vender peça cara com margem zero — dois técnicos com o mesmo
 * esforço recebem valores diferentes porque um usou uma peça de R$ 400 que a
 * loja apenas repassou.
 *
 * `comissoes()` respeitava a regra. Só que a tela de Relatórios tinha uma
 * SEGUNDA conta, escrita à mão ali dentro, multiplicando o percentual pelo
 * TOTAL da ordem. As duas apareciam na mesma página, com números diferentes,
 * debaixo do mesmo título "Comissão por técnico" — e a errada era a que
 * pagava mais, que é sempre a que vira a versão oficial na conversa.
 *
 * Este teste é irmão do preco-unico.test.ts: ele varre as telas procurando
 * conta feita com o percentual de comissão fora da lib.
 */

const RAIZ = new URL("../..", import.meta.url).pathname;

/** Percentual multiplicado por alguma coisa, em qualquer forma */
const CONTA_NA_TELA = /comissaoPadrao\s*(?:\|\|[^)]*\))?\s*[)/*]|comissaoPadrao[^;\n]*[*/]\s*\d/;

function arquivos(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === "dist" || nome.startsWith(".")) continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivos(caminho, achados);
    else if (/\.tsx$/.test(nome) && !nome.includes(".test.")) achados.push(caminho);
  }
  return achados;
}

/** Linhas de tela que fazem conta com o percentual de comissão */
export function contaComissaoNaTela(codigo: string): string[] {
  return codigo
    .split("\n")
    .filter((l) => CONTA_NA_TELA.test(l) && !l.includes("comissao-na-tela"))
    .map((l) => l.trim());
}

describe("a comissão é uma conta só", () => {
  it("o detector acha a conta escrita na tela", () => {
    const errado = "    const pct = (config.comissaoPadrao || 0) / 100;";
    expect(contaComissaoNaTela(errado)).toHaveLength(1);
  });

  it("o detector deixa passar quem só MOSTRA o percentual", () => {
    // Escrever "comissão de 10%" no texto da tela não é fazer conta.
    const certo = "  <p>comissão de {config.comissaoPadrao || 0}% (ajuste em Configurações)</p>";
    expect(contaComissaoNaTela(certo)).toEqual([]);
  });

  it("nenhuma tela calcula comissão por fora da lib", () => {
    const achados = arquivos(join(RAIZ, "src")).flatMap((f) =>
      contaComissaoNaTela(readFileSync(f, "utf8")).map((l) => `${f.replace(RAIZ, "")}: ${l}`)
    );
    expect(achados).toEqual([]);
  });
});
