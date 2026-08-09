import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { empurrarFilaDeNotas } from "./nota";

/**
 * O empurrão que faz a nota sair na hora da venda.
 *
 * O cron da Vercel passa UMA VEZ POR DIA — é o teto do plano Hobby. Nota
 * que sai no dia seguinte não serve: o cliente pede o cupom no balcão, com
 * a compra na mão. Então o caminho normal é este empurrão e o cron é a rede.
 */
const respondendo = (status: number, corpo: unknown = {}) =>
  (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => corpo,
    }) as Response) as unknown as typeof fetch;

describe("empurrarFilaDeNotas", () => {
  it("manda o token da sessão, e por POST", async () => {
    let url = "";
    let opcoes: RequestInit = {};
    const espiao = (async (u: string, o: RequestInit) => {
      url = u;
      opcoes = o;
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;

    await empurrarFilaDeNotas("meu-token", espiao);

    expect(url).toBe("/api/nota");
    expect(opcoes.method).toBe("POST");
    expect((opcoes.headers as Record<string, string>).Authorization).toBe("Bearer meu-token");
  });

  it("sem sessão não chama nada e diz por quê", async () => {
    let chamou = false;
    const espiao = (async () => {
      chamou = true;
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;

    const r = await empurrarFilaDeNotas(undefined, espiao);
    expect(chamou).toBe(false);
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/sess/i);
  });

  /**
   * A parte que importa: a nota JÁ ESTÁ gravada na fila quando isto roda.
   *
   * Se o empurrão lançasse, a tela mostraria "não foi possível pedir a nota"
   * para uma nota que está pedida — e a pessoa pediria de novo. Nota em
   * duplicidade se resolve com o contador, não com um F5.
   */
  it("erro de rede não lança: devolve o motivo", async () => {
    const caindo = (async () => {
      throw new Error("Failed to fetch");
    }) as unknown as typeof fetch;

    const r = await empurrarFilaDeNotas("t", caindo);
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("Failed to fetch");
  });

  it("401 do servidor não lança: devolve o erro que veio", async () => {
    const r = await empurrarFilaDeNotas("t", respondendo(401, { erro: "sessão expirada" }));
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("sessão expirada");
  });

  it("resposta sem corpo ainda diz o status", async () => {
    const semJson = (async () =>
      ({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error("not json");
        },
      }) as unknown as Response) as unknown as typeof fetch;

    const r = await empurrarFilaDeNotas("t", semJson);
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("500");
  });

  it("deu certo, deu certo", async () => {
    const r = await empurrarFilaDeNotas("t", respondendo(200, { ok: true }));
    expect(r).toEqual({ ok: true, motivo: "" });
  });
});

/**
 * O servidor tem que aceitar o token da SESSÃO, não só o CRON_SECRET.
 *
 * Lê o api/nota.js do disco em vez de recopiar a lógica: cópia dentro de
 * teste envelhece igual ao original e os dois passam a mentir juntos.
 */
describe("api/nota.js — a porta do navegador", () => {
  const fonte = readFileSync(resolve(__dirname, "..", "..", "api", "nota.js"), "utf8");

  it("valida o token da sessão no Supabase", () => {
    expect(fonte).toContain("/auth/v1/user");
  });

  it("descobre a loja pelo perfil, e não confia no que o navegador mandar", () => {
    expect(fonte).toMatch(/perfis\?select=loja_id/);
    // O lojaId nunca sai do corpo do pedido: viria do navegador.
    expect(fonte).not.toMatch(/req\.body\??\.\s*lojaId/);
  });

  it("usuário desativado não emite nota", () => {
    expect(fonte).toMatch(/ativo === false/);
  });

  it("o CRON_SECRET continua valendo para o cron e o diagnóstico", () => {
    expect(fonte).toContain("x-vercel-cron");
    expect(fonte).toContain("CRON_SECRET");
  });
});
