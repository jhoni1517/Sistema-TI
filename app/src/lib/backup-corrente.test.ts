import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

/**
 * A corrente do backup (api/backup.js se chama de novo quando o tempo
 * acaba) tem que andar para a frente mesmo quando uma loja falha.
 *
 * Continuava da última loja que DEU CERTO: a loja que falhou devagar,
 * gastando os 10 segundos sozinha, era repetida na chamada seguinte, e na
 * outra, para sempre — sem nunca chegar nas lojas depois dela.
 */
let chamadaSeguinte = "";

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-28T07:00:00Z"));
  process.env.SUPABASE_URL = "https://sb.teste";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "servico";
  process.env.CRON_SECRET = "segredo";
  const chave = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i)));
  vi.stubGlobal("fetch", async (url: string) => {
    const u = new URL(url);
    const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
    if (u.host === "app.teste") {
      chamadaSeguinte = u.search;
      return json({});
    }
    if (u.pathname === "/rest/v1/lojas")
      return json([
        { id: "A", chave_cripto: chave, ativa: true },
        { id: "B", chave_cripto: chave, ativa: true },
      ]);
    // A loja A falha devagar: leva 11 segundos e dá erro.
    if (u.searchParams.get("lojaId") === "eq.A") {
      vi.setSystemTime(Date.now() + 11000);
      return new Response("fora do ar", { status: 500 });
    }
    return json([]);
  });
});
afterAll(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("corrente do backup", () => {
  it("a próxima chamada começa DEPOIS da loja que falhou", async () => {
    // @ts-expect-error: arquivo JS da Vercel, sem tipos
    const { default: handler } = await import("../../api/backup.js");
    const r: { body?: unknown } = {};
    const res = {
      status() {
        return this;
      },
      json(b: unknown) {
        r.body = b;
        return this;
      },
    };
    await handler({ headers: { authorization: "Bearer segredo", host: "app.teste" }, query: {} }, res);
    expect(r.body).toMatchObject({ feitos: 0, pulados: 1 });
    expect(chamadaSeguinte).toBe("?depois=A");
  });
});
