import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * O tipo do parâmetro da função do banco tem que bater com a coluna.
 *
 * ------------------------------------------------------------
 * O BUG QUE ORIGINOU ISTO
 *
 * `mover_estoque(p_produto uuid, ...)` foi escrita para acabar com a baixa
 * de estoque não atômica — o caso de dois caixas vendendo a mesma peça ao
 * mesmo tempo, que o CLAUDE.md listava como pendente há meses.
 *
 * Só que `produtos.id` é `text`, e a tela gera o id com `uid()`, que produz
 * algo como "m4x8k2p9abc". Toda chamada morria com "invalid input syntax
 * for type uuid".
 *
 * E o pior é o que acontecia com esse erro. O AppStore tem um desvio para
 * "a função ainda não existe no banco", que cai no caminho antigo para não
 * parar a loja. Só que ele reconhece a mensagem pelo texto — "does not
 * exist", "schema cache" — e "invalid input syntax" não bate com nenhum.
 * Resultado: ou a venda subia com um erro do Postgres na cara do atendente,
 * ou nada disso acontecia e a correção simplesmente nunca valeu.
 *
 * Medido chamando a função com 40 processos ao mesmo tempo, num Postgres de
 * verdade: antes do conserto, o estoque de 100 continuou 100 — as 40 baixas
 * falharam TODAS. Depois, deu 60 exato.
 * ------------------------------------------------------------
 *
 * Este teste é a versão sem banco: lê os arquivos do disco e compara.
 */

const raiz = join(__dirname, "..", "..");
const sqls = readdirSync(raiz).filter((f) => f.startsWith("supabase-") && f.endsWith(".sql"));
const tudo = sqls.map((f) => readFileSync(join(raiz, f), "utf8")).join("\n");

/** O tipo declarado para uma coluna, no create table da tabela */
function tipoDaColuna(tabela: string, coluna: string): string | undefined {
  const criar = new RegExp(`create table if not exists ${tabela}\\s*\\(([\\s\\S]*?)\\n\\);`, "i");
  const corpo = tudo.match(criar)?.[1];
  if (!corpo) return undefined;
  for (const linha of corpo.split("\n")) {
    const m = linha.match(/^\s*"?(\w+)"?\s+(\w+)/);
    if (m && m[1] === coluna) return m[2].toLowerCase();
  }
  return undefined;
}

describe("função do banco e coluna falam a mesma língua", () => {
  it("mover_estoque recebe o id do produto no tipo da coluna", () => {
    const daColuna = tipoDaColuna("produtos", "id");
    expect(daColuna, "não achei o tipo de produtos.id").toBe("text");

    const assinatura = tudo.match(
      /create or replace function mover_estoque\(\s*p_produto\s+(\w+)/i
    )?.[1];
    expect(assinatura, "mover_estoque sumiu").toBeTruthy();
    expect(
      assinatura!.toLowerCase(),
      `produtos.id é ${daColuna} e a função pede ${assinatura} — toda chamada morre`
    ).toBe(daColuna);
  });

  it("a versão antiga da função é derrubada, e não fica ao lado da nova", () => {
    /*
     * `create or replace` NÃO muda o tipo de um parâmetro: ele cria uma
     * SEGUNDA função. Com as duas no banco, o PostgREST não sabe qual
     * chamar e responde erro de ambiguidade — a loja para de vender e a
     * mensagem não diz nada a quem está no balcão.
     */
    const atomico = readFileSync(join(raiz, "supabase-migracao-estoque-atomico.sql"), "utf8");
    expect(atomico).toMatch(/drop function if exists mover_estoque\(uuid, numeric\)/i);
    // E o drop vem ANTES do create, senão derruba a que acabou de nascer.
    expect(atomico.indexOf("drop function if exists mover_estoque")).toBeLessThan(
      atomico.indexOf("create or replace function mover_estoque")
    );
  });

  it("o grant aponta para a assinatura que existe", () => {
    // Grant na assinatura errada não dá erro: ele simplesmente não concede,
    // e a loja descobre no balcão que não tem permissão.
    const atomico = readFileSync(join(raiz, "supabase-migracao-estoque-atomico.sql"), "utf8");
    const daFuncao = atomico.match(
      /create or replace function mover_estoque\(\s*p_produto\s+(\w+),\s*p_qtd\s+(\w+)/i
    );
    expect(daFuncao, "não li a assinatura").toBeTruthy();
    const esperado = new RegExp(
      `grant execute on function mover_estoque\\(${daFuncao![1]}, ${daFuncao![2]}\\)`,
      "i"
    );
    expect(atomico, `o grant não bate com a assinatura`).toMatch(esperado);
  });

  it("o desvio do AppStore reconhece a falha por ausência da função", () => {
    /*
     * O desvio existe para a loja que ainda não rodou a migração continuar
     * vendendo. Ele lê a MENSAGEM do erro, e é por isso que ele é frágil:
     * qualquer falha que não seja "a função não existe" tem que SUBIR para
     * a tela, e não cair no caminho antigo em silêncio.
     *
     * O teste prende os dois lados: o desvio existe, e ele é estreito.
     */
    const store = readFileSync(join(raiz, "src", "store", "AppStore.tsx"), "utf8");
    const trecho = store.slice(store.indexOf("const moverEstoque"));
    expect(trecho).toContain("does not exist");
    expect(trecho).toContain("schema cache");
    // Erro que não é ausência de função tem que virar exceção.
    expect(trecho).toMatch(/if \(!semFuncao\) throw new Error/);
  });
});
