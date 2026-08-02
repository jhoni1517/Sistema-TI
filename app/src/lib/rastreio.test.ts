import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { linkDeRastreio, tokenDoLink, problemaNoLink } from "./rastreio";
import type { OrdemServico } from "./types";

const RAIZ = new URL("../..", import.meta.url).pathname;

const os = (o: Partial<OrdemServico> = {}): OrdemServico =>
  ({ id: "o1", numero: 7, rastreio: "a1b2c3d4e5f6", ...o }) as OrdemServico;

/**
 * O rastreio público era enumerável.
 *
 * O link que a loja manda leva o UUID da loja: `#/rastreio/OS00007?loja=<id>`.
 * A consulta pedia SÓ a loja e o número, e o número é sequencial. Quem recebe
 * um link — todo cliente, e qualquer pessoa para quem ele encaminhe — trocava
 * o 7 por 1, 2, 3 e lia a assistência inteira: primeiro nome, aparelho e
 * valor de cada conserto. A própria página oferecia o campo de busca para
 * isso, sem precisar montar URL nenhuma.
 *
 * E a resposta ao orçamento tinha a mesma porta: `responder_orcamento` só
 * pedia loja e número. Dava para CANCELAR, um por um, todos os orçamentos
 * aguardando aprovação da loja.
 *
 * O código da OS não serve de senha porque ele é sequencial de propósito —
 * é o que o cliente lê no balcão. Quem faz o papel de senha é um segredo por
 * ordem, sorteado no banco, que só existe no link.
 */
describe("o link do rastreio carrega o segredo da ordem", () => {
  const origem = "https://sistema-ti-caixa.vercel.app/";

  it("monta o link com loja, número e segredo", () => {
    const l = linkDeRastreio(origem, "loja-uuid", os());
    expect(l).toBe(
      "https://sistema-ti-caixa.vercel.app/#/rastreio/OS00007?loja=loja-uuid&t=a1b2c3d4e5f6"
    );
  });

  it("sem loja não monta link nenhum: link pela metade vira suporte", () => {
    expect(linkDeRastreio(origem, "", os())).toBe("");
  });

  it("ordem antiga, ainda sem segredo, também não monta link", () => {
    // Melhor não oferecer o link do que mandar um que vai ser recusado.
    expect(linkDeRastreio(origem, "loja-uuid", os({ rastreio: undefined }))).toBe("");
  });

  it("lê o segredo de volta do link", () => {
    expect(tokenDoLink("#/rastreio/OS00007?loja=x&t=a1b2c3d4e5f6")).toBe("a1b2c3d4e5f6");
    expect(tokenDoLink("#/rastreio/OS00007?t=abc&loja=x")).toBe("abc");
  });

  it("link sem segredo devolve vazio, e não o da última consulta", () => {
    expect(tokenDoLink("#/rastreio/OS00007?loja=x")).toBe("");
    expect(tokenDoLink("")).toBe("");
  });

  it("diz o que fazer quando o link é antigo, em vez de 'não encontrada'", () => {
    // "Ordem não encontrada" manda o cliente conferir o código, que está
    // certo. O problema é o link, e quem resolve é a loja.
    const p = problemaNoLink("loja-uuid", "");
    expect(p).toContain("link");
    expect(p).toContain("novo");
  });

  it("sem loja no link, a saída é a mesma: pedir link novo", () => {
    expect(problemaNoLink("", "abc")).toContain("novo");
  });

  it("link completo não tem problema", () => {
    expect(problemaNoLink("loja-uuid", "a1b2c3d4e5f6")).toBe("");
  });
});

/**
 * O corte é feito no BANCO, não na tela.
 *
 * Esconder o campo de busca da página resolveria o campo de busca. Não
 * resolveria nada de quem monta a chamada na mão — e a chamada é pública,
 * concedida a `anon`. As duas funções que a página pública usa precisam
 * EXIGIR o segredo, e é isto que este teste lê do disco e cobra.
 */
describe("as funções públicas exigem o segredo", () => {
  const sql = readdirSync(RAIZ)
    .filter((f) => f.startsWith("supabase-") && f.endsWith(".sql"))
    .map((f) => readFileSync(join(RAIZ, f), "utf8"))
    .join("\n");

  /** O corpo da última definição de uma função, que é a que vale */
  const definicao = (nome: string): string => {
    const partes = sql.split(new RegExp(`create (?:or replace )?function ${nome}\\s*\\(`));
    return partes[partes.length - 1];
  };

  it("a coluna do segredo existe na tabela de ordens", () => {
    expect(sql).toMatch(/alter table ordens\s+add column if not exists\s+"?rastreio"?/);
  });

  it("consultar_os recebe e confere o segredo", () => {
    const d = definicao("consultar_os");
    // Receber e ignorar seria pior do que não receber: pareceria protegido.
    // Por isso as duas coisas — o parâmetro entra E a coluna é comparada.
    expect(d).toContain("p_token");
    expect(d).toMatch(/\brastreio\s*=\s*\S/);
  });

  it("responder_orcamento recebe e confere o segredo", () => {
    // Ler a fila dos outros é ruim; CANCELAR a fila dos outros é pior.
    const d = definicao("responder_orcamento");
    expect(d).toContain("p_token");
    expect(d).toMatch(/\brastreio\s*=\s*\S/);
  });

  it("as versões sem segredo saem de cena", () => {
    // Deixar a antiga concedida a anon mantém a porta aberta ao lado da
    // fechada, e ninguém repara porque a tela nova nem chama.
    expect(sql).toMatch(/drop function if exists consultar_os\(uuid, integer\)/);
    expect(sql).toMatch(
      /drop function if exists responder_orcamento\(uuid, integer, boolean, text\)/
    );
  });
});
