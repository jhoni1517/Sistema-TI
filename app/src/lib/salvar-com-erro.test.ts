import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Gravação sem tratamento de erro é a pior classe de bug.
 *
 * Erro que aparece na tela custa cinco minutos. Erro engolido custa uma
 * semana e a confiança do cliente: a janela fecha como se tivesse gravado, e
 * a OS que o cliente acabou de abrir simplesmente não existe.
 *
 * A ESPECIFICACAO conta que esta regra foi quebrada SEIS vezes na mesma
 * base, sempre em tela nova. Regra escrita não segura nada — quando uma
 * regra da casa é quebrada pela terceira vez, o conserto não é consertar, é
 * escrever o teste que reprova. Este é ele.
 *
 * A saída para o caso legítimo é a mesma dos emoji: uma marca explícita na
 * linha. Função auxiliar que só é chamada de dentro de um `try` de quem
 * chama leva `erro-tratado-por-quem-chama`, e a marca é a diferença entre
 * decisão e descuido.
 */

const RAIZ = new URL("../..", import.meta.url).pathname;

/** Gravações que não podem falhar em silêncio */
const GRAVACOES = [
  "saveMovimento(", "saveProduto(", "saveOrdem(", "saveVenda(", "saveFiado(",
  "saveConta(", "saveCliente(", "saveSessao(", "saveEvento(", "saveCotacao(",
  "saveConfig(", "saveCategoria(", "saveFornecedor(", "saveMeta(",
  "removeProduto(", "removeCliente(", "removeOrdem(", "removeMovimento(",
  "removeFiado(", "removeConta(", "removeEvento(", "removeCotacao(",
];

const LIBERADO = "erro-tratado-por-quem-chama";

export function gravaSemTratarErro(codigo: string): string[] {
  const marcas = [...codigo.matchAll(/\basync\s*(?:function\b|\()/g)].map((m) => m.index!);
  const problemas: string[] = [];

  for (const [k, inicio] of marcas.entries()) {
    const bloco = codigo.slice(inicio, marcas[k + 1] ?? codigo.length);
    if (bloco.includes(LIBERADO)) continue;

    const posicoes = GRAVACOES.map((g) => bloco.indexOf(g)).filter((i) => i >= 0);
    if (posicoes.length === 0) continue;
    const primeira = Math.min(...posicoes);

    // O `try` tem que ABRIR antes da gravação. Abrir depois protege o que
    // vem depois e deixa passar justamente a chamada que importa.
    const t = bloco.indexOf("try");
    if (t < 0 || t > primeira) {
      const nome = GRAVACOES.find((g) => bloco.indexOf(g) === primeira) || "gravação";
      problemas.push(`${nome.replace("(", "")} grava sem try/catch`);
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

describe("gravação sem tratamento de erro é a pior classe de bug", () => {
  it("o detector acha a gravação desprotegida", () => {
    // Sem isto, um erro no detector faria o teste de baixo passar sempre.
    expect(gravaSemTratarErro(`const f = async () => { await saveOrdem(o); };`)).toEqual([
      "saveOrdem grava sem try/catch",
    ]);
  });

  it("o detector aceita a gravação protegida", () => {
    const certo = `const f = async () => {
      try { await saveOrdem(o); } catch (e) { aviso.erro(String(e)); }
    };`;
    expect(gravaSemTratarErro(certo)).toEqual([]);
  });

  it("try que abre DEPOIS da gravação não protege a gravação", () => {
    const errado = `const f = async () => {
      await saveOrdem(o);
      try { await saveProduto(p); } catch {}
    };`;
    expect(gravaSemTratarErro(errado)).toEqual(["saveOrdem grava sem try/catch"]);
  });

  it("a marca explícita libera a função auxiliar", () => {
    // Quem só é chamado de dentro do try de outro não precisa do próprio.
    const auxiliar = `const baixar = async (o) => {
      // ${LIBERADO}: sempre roda dentro do try de onReceber
      await saveProduto(p);
    };`;
    expect(gravaSemTratarErro(auxiliar)).toEqual([]);
  });

  it("nenhuma tela grava sem tratar o erro", () => {
    const achados = arquivos(join(RAIZ, "src")).flatMap((f) =>
      gravaSemTratarErro(readFileSync(f, "utf8")).map((p) => `${f.replace(RAIZ, "")}: ${p}`)
    );
    expect(achados).toEqual([]);
  });
});
