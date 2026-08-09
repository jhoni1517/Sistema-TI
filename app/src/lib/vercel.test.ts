import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * O cron mais fino que uma vez por dia PARA O DEPLOY INTEIRO.
 *
 * Isto custou quatro merges e meia tarde, e o sintoma é o pior possível:
 * NADA acontece. Não aparece build vermelho, não aparece aviso, não chega
 * e-mail. A implantação simplesmente não é criada, e a lista da Vercel fica
 * igual a antes — como se o GitHub não tivesse avisado.
 *
 * O plano Hobby aceita cron, mas só com disparo DIÁRIO. Um cron de dez em dez minutos
 * no vercel.json é configuração inválida, e a Vercel recusa a implantação
 * na validação, antes de construir qualquer coisa. Quatro PRs ficaram no
 * `main` sem nunca chegar ao ar por causa de uma linha.
 *
 * A regra é chata de lembrar e barata de conferir: minuto e hora fixos, e
 * nada de `*` ou `/` nos dois primeiros campos.
 */
const cfg = JSON.parse(
  readFileSync(resolve(__dirname, "..", "..", "vercel.json"), "utf8")
) as { crons?: { path: string; schedule: string }[] };

describe("o cron cabe no plano da Vercel", () => {
  const crons = cfg.crons || [];

  it("existe cron declarado", () => {
    expect(crons.length).toBeGreaterThan(0);
  });

  it.each(crons.map((c) => [c.path, c.schedule]))(
    "%s dispara no máximo uma vez por dia (%s)",
    (path, schedule) => {
      const [minuto, hora] = String(schedule).trim().split(/\s+/);
      expect(minuto, `${path}: minuto tem que ser um número fixo`).toMatch(/^\d+$/);
      expect(hora, `${path}: hora tem que ser um número fixo`).toMatch(/^\d+$/);
    }
  );

  it("no máximo 2 crons — é o teto do Hobby", () => {
    expect(crons.length).toBeLessThanOrEqual(2);
  });
});
