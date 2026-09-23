import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PLANO_META, PLANOS } from "./planos";

/**
 * O limite de IA existe em dois lugares: a tela mostra (lib/planos.ts) e o
 * servidor confere (api/_ia.js). Se divergirem, a tela promete 200 leituras
 * e o servidor recusa na 21ª — e quem aparece como mentiroso é o sistema.
 *
 * Lê o arquivo do disco em vez de recopiar os números: cópia dentro do
 * teste envelhece junto e as duas mentem em coordenação.
 */
const api = resolve(__dirname, "..", "..", "api");
const fonte = readFileSync(resolve(api, "_ia.js"), "utf8");

describe("limites de IA: tela e servidor dizem o mesmo", () => {
  it("LIMITES_IA do servidor é igual ao PLANO_META da tela", () => {
    const bloco = fonte.match(/export const LIMITES_IA = (\{[\s\S]*?\n\});/)?.[1];
    expect(bloco, "LIMITES_IA sumiu de api/_ia.js").toBeTruthy();
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const doServidor = new Function(`return ${bloco}`)();
    for (const plano of PLANOS) {
      expect(doServidor[plano], plano).toEqual(PLANO_META[plano].limitesIA);
    }
  });

  it("a loja vem da sessão, nunca do corpo do pedido", () => {
    expect(fonte).not.toMatch(/req\.body\??\.(loja|lojaId)/);
    const ia = readFileSync(resolve(api, "ia.js"), "utf8");
    expect(ia).not.toMatch(/(b|req\.body)\??\.(loja|lojaId)\b/);
  });

  it("falha na IA devolve o crédito", () => {
    const atender = fonte.slice(fonte.indexOf("export async function atenderIA"));
    expect(atender.indexOf("devolverCredito")).toBeGreaterThan(atender.indexOf("catch"));
  });
});

/**
 * O plano Hobby da Vercel aceita no máximo 12 funções por implantação. A 13ª
 * não dá erro de build: a implantação simplesmente não sobe, e o site fica
 * na versão velha sem aviso — o mesmo sintoma do cron fino (vercel.test.ts).
 */
describe("teto de funções da Vercel", () => {
  it("no máximo 12 arquivos em api/ (os com _ não contam)", () => {
    const funcoes = readdirSync(api).filter((f) => f.endsWith(".js") && !f.startsWith("_"));
    expect(funcoes.length, funcoes.join(", ")).toBeLessThanOrEqual(12);
  });
});
