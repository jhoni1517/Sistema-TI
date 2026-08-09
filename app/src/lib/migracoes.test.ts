import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * A LISTA DE MIGRAÇÕES ENVELHECE CALADA, E QUEM PAGA É A LOJA NOVA.
 *
 * O CONFIGURACAO.md tem a ordem em que rodar os SQL. Ela é escrita à mão, e
 * quatro migrações criadas depois daquele dia ficaram de fora: notas,
 * comandas, teste-gratis e teste-controle.
 *
 * O estrago só aparece na hora errada. Quem monta uma loja nova segue a
 * lista até o fim, acha que terminou, e a tela abre dizendo que a tabela
 * "notas" não existe. Pior: como a carga é tolerante a falha parcial de
 * propósito, o resto do sistema funciona — então não parece configuração
 * pela metade, parece bug do sistema.
 *
 * É exatamente o mesmo erro do `saveConfig`, que gravava na nuvem uma lista
 * de campos escrita à mão e esqueceu oito. A conclusão de lá vale aqui:
 * lista escrita à mão precisa de alguém conferindo, e esse alguém é o teste.
 *
 * A regra é: todo `supabase-*.sql` do disco tem que aparecer no
 * CONFIGURACAO.md. O que não entra na ORDEM precisa estar escrito como
 * exceção, com o motivo — a marca é a diferença entre decisão e descuido.
 */
const raiz = resolve(__dirname, "..", "..");
const doc = readFileSync(resolve(raiz, "CONFIGURACAO.md"), "utf8");

const migracoes = readdirSync(raiz)
  .filter((f) => f.startsWith("supabase-") && f.endsWith(".sql"))
  .sort();

/** Rodar fora da ordem é decisão, e decisão se escreve. */
const FORA_DA_ORDEM = new Set(["supabase-conta-teste.sql"]);

describe("a ordem das migrações no CONFIGURACAO.md", () => {
  it("achou os arquivos SQL", () => {
    expect(migracoes.length).toBeGreaterThan(10);
  });

  it.each(migracoes)("%s aparece no CONFIGURACAO.md", (arquivo) => {
    expect(
      doc.includes(arquivo),
      `${arquivo} existe no disco e não está no CONFIGURACAO.md. ` +
        `Quem monta uma loja nova não vai rodar, e a tela vai abrir dizendo ` +
        `que a tabela não existe.`
    ).toBe(true);
  });

  it.each(migracoes.filter((f) => !FORA_DA_ORDEM.has(f)))(
    "%s está numerado na ordem de rodar",
    (arquivo) => {
      const numerado = new RegExp(`^\\d+\\. \`${arquivo.replace(/\./g, "\\.")}\``, "m");
      expect(
        numerado.test(doc),
        `${arquivo} é citado no CONFIGURACAO.md mas não está na lista numerada. ` +
          `Ou entra na ordem, ou entra em FORA_DA_ORDEM aqui com o motivo escrito.`
      ).toBe(true);
    }
  );

  it("a numeração não pula nem repete", () => {
    const numeros = [...doc.matchAll(/^(\d+)\. `supabase-[^`]+\.sql`/gm)].map((m) =>
      Number(m[1])
    );
    expect(numeros.length).toBeGreaterThan(10);
    expect(numeros).toEqual(numeros.map((_, i) => i + 1));
  });

  it("o que está fora da ordem tem o motivo escrito junto", () => {
    for (const arquivo of FORA_DA_ORDEM) {
      const trecho = doc.slice(doc.indexOf(arquivo), doc.indexOf(arquivo) + 400);
      expect(trecho.length, `${arquivo} citado sem explicação nenhuma`).toBeGreaterThan(80);
    }
  });
});

/**
 * Migração tem que ser repetível.
 *
 * O dono roda o SQL do celular, no balcão, e não tem como saber se aquele
 * arquivo já passou naquele banco. Rodar de novo não pode quebrar — senão a
 * saída é ele parar no meio, sem saber o que rodou e o que não rodou.
 */
describe("toda migração pode rodar duas vezes", () => {
  it.each(migracoes)("%s usa create/drop defensivo", (arquivo) => {
    const sql = readFileSync(resolve(raiz, arquivo), "utf8");

    const criaTabelaCrua = /create\s+table\s+(?!if\s+not\s+exists)/i.test(sql);
    expect(criaTabelaCrua, `${arquivo}: use "create table if not exists"`).toBe(false);

    const criaIndiceCru = /create\s+(unique\s+)?index\s+(?!if\s+not\s+exists|concurrently)/i.test(sql);
    expect(criaIndiceCru, `${arquivo}: use "create index if not exists"`).toBe(false);

    /*
     * Policy não aceita "if not exists": o jeito é dropar antes de criar.
     *
     * A conferência é por NOME **E** TABELA, não só pelo nome. "loja_ler"
     * se repete em quase toda tabela do sistema — checando só o nome, um
     * único drop faria passar cinco creates, e a segunda rodada da migração
     * quebraria no primeiro que não tivesse par.
     */
    for (const [, nome, tabela] of sql.matchAll(
      /create\s+policy\s+"([^"]+)"\s+on\s+([A-Za-z0-9_."]+)/gi
    )) {
      const escapa = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const dropAntes = new RegExp(
        `drop\\s+policy\\s+if\\s+exists\\s+"${escapa(nome)}"\\s+on\\s+${escapa(tabela)}\\b`,
        "i"
      );
      expect(
        dropAntes.test(sql),
        `${arquivo}: a policy "${nome}" em ${tabela} precisa de um ` +
          `"drop policy if exists ... on ${tabela}" antes`
      ).toBe(true);
    }
  });
});
