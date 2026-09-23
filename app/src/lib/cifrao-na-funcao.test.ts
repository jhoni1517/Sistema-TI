import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Cifrão dentro de função SQL quebra o editor do Supabase.
 *
 * A migração do rastreio usava `~ '^[a-z]{1,20}$'` dentro do corpo de
 * `consultar_os`. O Postgres aceita — rodou limpo no banco de teste — mas o
 * editor do Supabase divide o texto antes de mandar, se perde no cifrão e
 * entrega a função pela metade: "unterminated dollar-quoted string". O
 * dono da loja colou a migração e recebeu o erro na cara.
 *
 * O corpo da função é delimitado por dois cifrões; outro cifrão lá dentro
 * é arriscado. Passam só os dois que já rodaram no editor em produção:
 * "R$ " em comentário e o parâmetro de `execute ... using` ($1, $2).
 */
const raiz = join(__dirname, "..", "..");

describe("nenhuma função SQL tem cifrão no corpo", () => {
  for (const arquivo of readdirSync(raiz).filter((f) => f.startsWith("supabase-") && f.endsWith(".sql"))) {
    it(arquivo, () => {
      const sql = readFileSync(join(raiz, arquivo), "utf8");
      const problemas: string[] = [];
      for (const m of sql.matchAll(/\bas \$\$([\s\S]*?)\$\$/g)) {
        const antes = sql.slice(0, m.index).split("\n").length;
        m[1].split("\n").forEach((linha, i) => {
          if (linha.replace(/R\$ /g, "").replace(/\$\d/g, "").includes("$")) problemas.push(`linha ${antes + i}: ${linha.trim()}`);
        });
      }
      expect(problemas, "troque a regex por uma sem cifrão (ex.: !~ '[^a-z]' e length)").toEqual([]);
    });
  }
});
