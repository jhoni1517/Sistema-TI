import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Toda migração pede a coluna de que precisa, e não confia na ordem.
 *
 * ------------------------------------------------------------
 * O BUG QUE ORIGINOU ISTO
 *
 * `supabase-migracao-catalogo.sql` (passo 13) lia `precoPromocional`,
 * `promocaoInicio` e `promocaoFim`. As três nasciam no
 * `supabase-corrigir-colunas.sql`, que é o passo 25 — o ÚLTIMO.
 *
 * Numa loja NOVA, seguindo o CONFIGURACAO.md à risca, o passo 13 abortava
 * com "column p.precoPromocional does not exist". Uma frase que não diz a
 * ninguém o que fazer, num painel onde o certo é seguir para o próximo
 * arquivo. E o estrago não era o erro na tela: era que a função
 * `catalogo_loja` NÃO ERA CRIADA. O catálogo público da loja nova não
 * existia, e ninguém tinha como saber por quê.
 *
 * Só apareceu rodando as 25 migrações em ordem num Postgres de verdade.
 * ------------------------------------------------------------
 *
 * Este teste é a versão barata daquilo: sem banco, lendo os arquivos do
 * disco na ordem publicada. Ele responde a uma pergunta só —
 *
 *   toda coluna que a migração N usa já existia no passo N?
 *
 * Nome de coluna em maiúscula-minúscula precisa de aspas no Postgres, e é
 * justamente esse o formato dos nossos campos (`precoPromocional`,
 * `lojaId`, `criadoEm`). Então dá para achar o uso pelo texto entre aspas,
 * com pouquíssimo risco de confundir com apelido de tabela — que nunca vem
 * entre aspas.
 */

const raiz = join(__dirname, "..", "..");
const doc = readFileSync(join(raiz, "CONFIGURACAO.md"), "utf8");

/** Os arquivos na ORDEM em que o CONFIGURACAO.md manda rodar */
const ordem = [...doc.matchAll(/^\d+\.\s+`(supabase-[a-z0-9-]+\.sql)`/gm)].map((m) => m[1]);

const fonte = (arquivo: string): string => readFileSync(join(raiz, arquivo), "utf8");

/** Colunas com aspas que ESTE arquivo cria */
function colunasCriadas(sql: string): string[] {
  const nomes: string[] = [];
  for (const m of sql.matchAll(/add column if not exists\s+"(\w+)"/gi)) nomes.push(m[1]);
  // Dentro de um create table: linhas `  "campo" tipo`
  for (const m of sql.matchAll(/create table if not exists\s+\w+\s*\(([\s\S]*?)\n\);/gi)) {
    for (const linha of m[1].split("\n")) {
      const c = linha.match(/^\s*"(\w+)"\s+\w/);
      if (c) nomes.push(c[1]);
    }
  }
  return nomes;
}

/** Colunas com aspas que ESTE arquivo usa */
function colunasUsadas(sql: string): string[] {
  const usadas = new Set<string>();
  for (const m of sql.matchAll(/"(\w+)"/g)) usadas.add(m[1]);
  return [...usadas];
}

describe("as migrações rodam na ordem publicada sem faltar coluna", () => {
  it("o CONFIGURACAO.md lista a ordem, e todo arquivo dela existe", () => {
    expect(ordem.length, "não achei a lista numerada de migrações").toBeGreaterThan(20);
    for (const arquivo of ordem) {
      expect(() => fonte(arquivo), `${arquivo} está na lista e não no disco`).not.toThrow();
    }
  });

  it("nenhuma migração usa coluna que só nasce numa migração POSTERIOR", () => {
    /*
     * A conta é acumulada: no passo N valem as colunas criadas do 1 ao N.
     * Coluna que aparece só depois é o bug do catálogo se repetindo.
     */
    const jaExiste = new Set<string>();
    const problemas: string[] = [];

    // Tudo que alguma migração cria, em algum momento. Só o que está aqui é
    // tratado como "coluna nossa" — o resto é palavra entre aspas de outra
    // natureza (nome de policy, texto, coluna do próprio Postgres).
    const universo = new Set<string>();
    for (const arquivo of ordem) for (const c of colunasCriadas(fonte(arquivo))) universo.add(c);

    for (const [i, arquivo] of ordem.entries()) {
      const sql = fonte(arquivo);

      // O que este arquivo cria já vale para ele mesmo: a migração pode
      // criar a coluna no topo e usá-la na função logo abaixo. É exatamente
      // o conserto que o catálogo recebeu.
      for (const c of colunasCriadas(sql)) jaExiste.add(c);

      for (const usada of colunasUsadas(sql)) {
        if (!universo.has(usada)) continue;
        if (jaExiste.has(usada)) continue;
        problemas.push(
          `${i + 1}. ${arquivo} usa "${usada}", que só é criada numa migração posterior`
        );
      }
    }

    expect(problemas, problemas.join("\n")).toEqual([]);
  });

  it("as três colunas da promoção estão no catálogo, e não só no corrige-tudo", () => {
    // O caso concreto, escrito por extenso: quem apagar as três linhas do
    // topo do catálogo quebra a loja nova de novo, e este teste reprova
    // antes de chegar lá.
    const catalogo = fonte("supabase-migracao-catalogo.sql");
    for (const coluna of ["precoPromocional", "promocaoInicio", "promocaoFim"]) {
      expect(
        colunasCriadas(catalogo),
        `o catálogo lê "${coluna}" e não garante que ela exista`
      ).toContain(coluna);
    }
  });
});
