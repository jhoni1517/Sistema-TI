import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * O robô da nota e a tela precisam concordar.
 *
 * A função da Vercel roda fora do build do Vite e não importa TypeScript,
 * então o teto de tentativas existe duas vezes. Divergindo, a tela diz
 * "precisa de atenção" numa nota que o robô ainda vai tentar — ou pior, o
 * robô desiste de uma que a tela mostra como no caminho.
 *
 * Este teste LÊ os dois arquivos do disco em vez de recopiar o número:
 * cópia dentro de teste envelhece igual e os dois passam a mentir juntos.
 */
const fonte = readFileSync(resolve(__dirname, "..", "..", "api", "nota.js"), "utf8");
const lib = readFileSync(resolve(__dirname, "nota.ts"), "utf8");
const sql = readFileSync(
  resolve(__dirname, "..", "..", "supabase-migracao-notas.sql"),
  "utf8"
);

describe("o robô da nota e a tela concordam", () => {
  it("o teto de tentativas é o mesmo nos dois", () => {
    const doRobo = fonte.match(/const MAXIMO_DE_TENTATIVAS = (\d+);/)?.[1];
    const daLib = lib.match(/MAXIMO_DE_TENTATIVAS = (\d+);/)?.[1];
    expect(doRobo, "MAXIMO_DE_TENTATIVAS sumiu de api/nota.js").toBeTruthy();
    expect(daLib, "MAXIMO_DE_TENTATIVAS sumiu de lib/nota.ts").toBeTruthy();
    expect(doRobo).toBe(daLib);
  });

  it("toda coluna que o robô grava existe na migração", () => {
    /*
     * O erro que este teste evita é o pior da casa: gravar um campo que não
     * tem coluna derruba a gravação INTEIRA daquela tabela, em silêncio. A
     * nota ficaria eternamente pendente sem ninguém saber por quê.
     */
    const gravadas = [
      "situacao",
      "erro",
      "tentativas",
      "chave",
      "numero",
      "serie",
      "protocolo",
      "url",
      "emitidaEm",
      "atualizadoEm",
      "pedido",
    ];
    for (const c of gravadas) {
      expect(sql, `coluna ${c} não existe em supabase-migracao-notas.sql`).toContain(c);
    }
  });
});

describe("o segredo não vaza para o navegador", () => {
  it("a credencial não tem policy de select", () => {
    /*
     * Sem policy, o RLS nega — e é assim que tem que ser: o navegador não lê
     * o token nem com o login do dono da loja. Quem lê é este robô, com a
     * chave de serviço.
     *
     * Uma policy de select em `fiscal_credencial` seria a porta escancarada,
     * e é o tipo de linha que entra "só para testar" e fica.
     */
    const bloco = sql.slice(sql.indexOf("create table if not exists fiscal_credencial"));
    const policies = [...bloco.matchAll(/create policy "(\w+)" on fiscal_credencial\s+for (\w+)/g)];
    expect(policies.length, "nenhuma policy encontrada").toBeGreaterThan(0);
    for (const [, nome, cmd] of policies) {
      expect(cmd, `policy ${nome} abre leitura da credencial`).not.toBe("select");
    }
  });

  it("o token nunca aparece na resposta do robô", () => {
    // Devolver o token num JSON de diagnóstico é o jeito mais fácil de
    // queimá-lo: a resposta vai para o log da Vercel e para quem chamou.
    const resposta = fonte.slice(fonte.indexOf("export default async function handler"));
    expect(resposta).not.toMatch(/res\.status\([^)]*\)\.json\([^)]*token/);
  });

  it("o robô exige segredo para ser chamado na mão", () => {
    // Endpoint aberto que emite nota fiscal é convite para alguém emitir
    // documento em nome da loja.
    expect(fonte).toContain("CRON_SECRET");
    expect(fonte).toContain('res.status(401)');
  });
});

describe("a loja nova nasce em homologação", () => {
  it("o padrão do banco é homologação, não produção", () => {
    // Mandar para produção sem querer emite documento fiscal de verdade,
    // com número consumido e prazo de cancelamento correndo.
    expect(sql).toMatch(/ambiente text not null default 'homologacao'/);
  });

  it("o robô só usa produção quando está escrito produção", () => {
    expect(fonte).toContain('cred.ambiente === "producao" ? "producao" : "homologacao"');
  });
});
