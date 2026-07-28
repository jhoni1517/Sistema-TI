import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Confere que todo campo usado pelo código existe como coluna no banco.
 *
 * Este teste nasceu de um prejuízo real: o código passou a gravar
 * "compraEstoque" em movimentos sem que a coluna existisse, e a venda
 * simplesmente não era salva. Como a falha era silenciosa, o estoque
 * baixava e o dinheiro nunca entrava no caixa.
 *
 * Enquanto este teste passar, esse tipo de esquecimento não chega ao
 * balcão.
 */

const raiz = join(__dirname, "..", "..");
const tipos = readFileSync(join(raiz, "src/lib/types.ts"), "utf8");
const sql = readdirSync(raiz)
  .filter((f) => f.startsWith("supabase-") && f.endsWith(".sql"))
  .map((f) => readFileSync(join(raiz, f), "utf8"))
  .join("\n");

/** Tipo do domínio -> tabela onde ele é gravado */
const TABELAS: Record<string, string> = {
  Cliente: "clientes",
  OrdemServico: "ordens",
  Produto: "produtos",
  MovimentoCaixa: "movimentos",
  SessaoCaixa: "sessoes",
  Fiado: "fiados",
  Categoria: "categorias",
  Fornecedor: "fornecedores",
  Cotacao: "cotacoes",
  PrecoFornecedor: "precos_fornecedor",
  ContaPagar: "contas_pagar",
  Meta: "metas",
  Evento: "eventos",
};

/** Colunas declaradas para uma tabela, no create table e nos alter */
function colunasDaTabela(tabela: string): Set<string> {
  const cols = new Set<string>();

  const criar = new RegExp(`create table if not exists ${tabela}\\s*\\(([\\s\\S]*?)\\n\\);`, "g");
  for (const m of sql.matchAll(criar)) {
    for (const linha of m[1].split("\n")) {
      const c = linha.match(/^\s*"?(\w+)"?\s/);
      if (c) cols.add(c[1]);
    }
  }

  const alterar = new RegExp(
    `alter table ${tabela}\\s+add column if not exists\\s+"?(\\w+)"?`,
    "g"
  );
  for (const m of sql.matchAll(alterar)) cols.add(m[1]);

  return cols;
}

/** Campos declarados numa interface do types.ts */
function camposDoTipo(nome: string): string[] {
  const m = tipos.match(new RegExp(`export interface ${nome}\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!m) return [];
  return m[1]
    .split("\n")
    .map((l) => l.match(/^\s*(\w+)\??\s*:/)?.[1])
    .filter((x): x is string => !!x);
}

describe("todo campo do código tem coluna no banco", () => {
  for (const [tipo, tabela] of Object.entries(TABELAS)) {
    const cols = colunasDaTabela(tabela);
    const campos = camposDoTipo(tipo);

    it(`${tipo} -> ${tabela}`, () => {
      expect(campos.length, `interface ${tipo} não encontrada`).toBeGreaterThan(0);
      expect(cols.size, `tabela ${tabela} não encontrada nos arquivos SQL`).toBeGreaterThan(0);

      const ausentes = campos.filter((c) => !cols.has(c));
      expect(
        ausentes,
        `Faltam colunas em ${tabela}: ${ausentes.join(", ")}. ` +
          "Acrescente em supabase-corrigir-colunas.sql."
      ).toEqual([]);
    });
  }
});
