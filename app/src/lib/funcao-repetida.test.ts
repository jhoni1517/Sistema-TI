import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ============================================================
 *  A MESMA FUNÇÃO, DEFINIDA EM VÁRIAS MIGRAÇÕES
 * ============================================================
 *
 * `consultar_os` é criada em QUATRO arquivos: opções da OS (passo 11),
 * rastreio com token (15), fotos do laudo (22) e vídeo do laudo (23). Cada
 * um acrescentou uma coluna ao retorno e teve que reescrever a função
 * inteira, porque `create or replace` não muda a assinatura de retorno.
 *
 * Isso é aceitável — migração é histórico, e reescrever é o preço de mudar
 * o que a função devolve. O que NÃO é aceitável é o que aconteceu ao
 * consertar o bug da lista de itens:
 *
 *   o conserto foi escrito no passo 15, rodou, e não mudou nada — porque o
 *   passo 23 roda depois e reescreve a função por cima, com o bug.
 *
 * Não deu erro. Não deu aviso. O banco ficou com a versão velha e o teste
 * de verdade foi quem mostrou. Quem for consertar a próxima cai no mesmo
 * buraco.
 *
 * Este teste compara o CORPO da função entre os arquivos e exige que todas
 * as cópias tenham o mesmo miolo nos pontos que decidem dinheiro. Divergiu,
 * ele diz quais arquivos e o quê.
 */

const raiz = join(__dirname, "..", "..");

/** Os arquivos que definem `consultar_os`, na ordem em que o CONFIGURACAO manda rodar */
function arquivosQueDefinem(funcao: string): string[] {
  const doc = readFileSync(join(raiz, "CONFIGURACAO.md"), "utf8");
  const ordem = [...doc.matchAll(/^\d+\.\s+`(supabase-[a-z0-9-]+\.sql)`/gm)].map((m) => m[1]);
  return ordem.filter((f) =>
    new RegExp(`create (or replace )?function ${funcao}\\b`).test(
      readFileSync(join(raiz, f), "utf8")
    )
  );
}

/** O corpo da função, sem comentário e sem espaço sobrando */
function corpo(arquivo: string, funcao: string): string {
  const sql = readFileSync(join(raiz, arquivo), "utf8");
  const i = sql.search(new RegExp(`create (or replace )?function ${funcao}\\b`));
  const abre = sql.indexOf("as $$", i);
  const fecha = sql.indexOf("$$;", abre);
  return sql
    .slice(abre, fecha)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

describe("consultar_os é a mesma nos quatro arquivos que a criam", () => {
  const arquivos = arquivosQueDefinem("consultar_os");

  it("mais de um arquivo define a função — é por isso que este teste existe", () => {
    expect(arquivos.length, "esperava a função repetida em vários passos").toBeGreaterThan(1);
  });

  it("a lista de itens da opção traz os itens COMUNS em todas as cópias", () => {
    /*
     * O bug de origem: `where i.opcao = o.opcao` deixava de fora o que entra
     * em qualquer opção, enquanto o total somava tudo. O cliente lia
     * "R$ 730,00" com R$ 480 de peça listada embaixo.
     */
    const faltando = arquivos.filter(
      (f) => !corpo(f, "consultar_os").includes("i.opcao = o.opcao or i.opcao = ''")
    );
    expect(
      faltando,
      `estes arquivos ainda cortam os itens comuns da lista: ${faltando.join(", ")}`
    ).toEqual([]);
  });

  it("o pedaço que decide DINHEIRO é igual em todas as cópias", () => {
    /*
     * O corpo inteiro difere de propósito: cada migração acrescentou uma
     * coluna ao retorno (o token, as fotos, os vídeos) e teve que reescrever
     * a função, porque `create or replace` não muda a assinatura.
     *
     * O que não pode divergir é a conta. A última a rodar é a que fica no
     * banco: duas contas diferentes significam que alguém consertou uma
     * cópia e o banco ficou com a outra — sem erro, sem aviso, e sem jeito
     * de perceber olhando o arquivo que foi editado. Foi o que aconteceu ao
     * consertar a lista de itens.
     */
    const conta = (arquivo: string): string => {
      const c = corpo(arquivo, "consultar_os");
      const pedacos: string[] = [];
      // Como o total de cada opção é somado
      pedacos.push(c.match(/'total', [^,]*\+ o\.v/)?.[0] ?? "SEM TOTAL");
      // De onde saem os itens que a opção lista
      pedacos.push(c.match(/from itens i where [^)]*/)?.[0] ?? "SEM ITENS");
      // A base: mão de obra, desconto e o que entra em qualquer opção
      pedacos.push(c.match(/base as \([\s\S]*?\)\s*,/)?.[0] ?? "SEM BASE");
      return pedacos.join(" | ");
    };

    const base = conta(arquivos[0]);
    const diferentes = arquivos.filter((f) => conta(f) !== base);
    expect(
      diferentes,
      `a conta de consultar_os difere entre ${arquivos[0]} e: ${diferentes.join(", ")}.\n` +
        "A última migração da ordem é a que fica no banco — conserte em TODAS."
    ).toEqual([]);
  });
});
