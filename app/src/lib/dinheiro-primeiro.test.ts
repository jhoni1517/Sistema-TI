import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Dinheiro primeiro, sempre.
 *
 * Toda gravação que mexe em caixa E em outra coisa grava o movimento antes.
 * Falhando no meio, sobra lançamento de dinheiro sem a baixa correspondente
 * — que salta aos olhos na conferência e se conserta olhando o estoque. Ao
 * contrário, some a venda (ou aparece mercadoria que ninguém pagou), e
 * **lucro inflado é invisível: ninguém procura por ele.**
 *
 * A regra está escrita no CLAUDE.md desde o começo e foi quebrada cinco
 * vezes: entrada de nota, compra por cotação, pagamento de conta, ajuste de
 * inventário e recebimento de fiado. Sempre pelo mesmo motivo — a ordem que
 * parece natural ao escrever é a ordem errada, porque a gente pensa "faz a
 * coisa e depois anota".
 *
 * Regra escrita não segura nada. Este teste segura.
 */

const RAIZ = new URL("../..", import.meta.url).pathname;

/** As gravações que NÃO podem vir antes do dinheiro */
const DEPOIS = ["saveProduto", "saveFiado", "saveConta", "saveVenda", "saveOrdem"];

/**
 * Procura uma gravação de dinheiro precedida por uma gravação de mercadoria
 * ou dívida.
 *
 * O corte é por `try {` e por início de função assíncrona. Só o `try` não
 * bastava: o recebimento de fiado quebrava a regra e não tinha `try` nenhum
 * — o mesmo trecho quebrava as duas regras da casa ao mesmo tempo, e o
 * detector passava batido justamente no caso pior.
 */
export function foraDeOrdem(codigo: string): string[] {
  const problemas: string[] = [];
  const blocos = codigo.split(/\btry\s*\{|\basync\s*(?:function\b|\()/).slice(1);
  for (const bloco of blocos) {
    const dinheiro = bloco.indexOf("saveMovimento(");
    if (dinheiro < 0) continue;
    for (const nome of DEPOIS) {
      const outro = bloco.indexOf(`${nome}(`);
      if (outro >= 0 && outro < dinheiro) {
        problemas.push(`${nome} grava antes de saveMovimento`);
      }
    }
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

describe("dinheiro primeiro, sempre", () => {
  it("o detector acha a ordem errada", () => {
    // Sem isto, um erro no detector faria o teste de baixo passar sempre —
    // pior do que não ter teste, porque dá a impressão de estar coberto.
    const errado = `try { await saveProduto(p); await saveMovimento(m); } catch {}`;
    expect(foraDeOrdem(errado)).toEqual(["saveProduto grava antes de saveMovimento"]);
  });

  it("o detector aceita a ordem certa", () => {
    const certo = `try { await saveMovimento(m); await saveProduto(p); } catch {}`;
    expect(foraDeOrdem(certo)).toEqual([]);
  });

  it("gravação que não mexe em caixa não é problema deste teste", () => {
    expect(foraDeOrdem(`try { await saveProduto(p); } catch {}`)).toEqual([]);
  });

  it("pega também quem não tem try: era o caso do recebimento de fiado", () => {
    const errado = `const receber = async (f) => { await saveFiado(f); await saveMovimento(m); };`;
    expect(foraDeOrdem(errado)).toEqual(["saveFiado grava antes de saveMovimento"]);
  });

  it("nenhuma tela grava estoque ou dívida antes do dinheiro", () => {
    const achados = arquivos(join(RAIZ, "src"))
      .flatMap((f) => foraDeOrdem(readFileSync(f, "utf8")).map((p) => `${f.replace(RAIZ, "")}: ${p}`));
    expect(achados).toEqual([]);
  });
});
