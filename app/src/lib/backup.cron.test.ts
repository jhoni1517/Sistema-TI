import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { decifrar, lerBackup } from "./backup-diario";

/**
 * O robô de verdade (api/backup.js), com o Supabase de mentira: confere
 * paginação de mil em mil, arquivo cifrado com a chave da loja, limpeza
 * do que passou de 30 dias e a recusa sem o segredo.
 */
const chave = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i)));
const gravados: Record<string, string> = {};
let apagados: string[] = [];
let email: { to: string[]; attachments: { content: string }[] } | null = null;

beforeAll(() => {
  // Relógio fixo: a retenção de 30 dias é contada a partir de "hoje".
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-27T07:00:00Z")); // domingo: dia do e-mail
  process.env.SUPABASE_URL = "https://sb.teste";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "servico";
  process.env.CRON_SECRET = "segredo";
  process.env.RESEND_API_KEY = "re_teste";
  const movimentos = Array.from({ length: 1500 }, (_, i) => ({ id: `m${String(i).padStart(5, "0")}`, valor: i }));
  vi.stubGlobal("fetch", async (url: string, op: RequestInit = {}) => {
    const u = new URL(url);
    const h = (op.headers || {}) as Record<string, string>;
    const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
    if (u.pathname === "/rest/v1/lojas") return json([{ id: "L1", nome: "X", chave_cripto: chave, ativa: true }]);
    if (u.pathname === "/rest/v1/configuracoes") return json([{ dados: { nomeLoja: "Cell X", backupEmail: "dono@loja.com" } }]);
    if (u.host === "api.resend.com") {
      email = JSON.parse(String(op.body));
      return json({ id: "e1" });
    }
    if (u.pathname === "/rest/v1/movimentos") {
      const [de, ate] = h.Range.split("-").map(Number);
      return json(movimentos.slice(de, ate + 1), 206);
    }
    if (u.pathname === "/rest/v1/clientes") return json([{ id: "c1", nome: "Ana" }]);
    if (u.pathname === "/rest/v1/rmas") return new Response("tabela não existe", { status: 404 });
    if (u.pathname.startsWith("/rest/v1/")) return json([]);
    if (u.pathname.startsWith("/storage/v1/object/list/")) return json([{ name: "2026-08-01.json.enc" }, { name: "2026-09-25.json.enc" }]);
    if (u.pathname.startsWith("/storage/v1/object/backups/")) {
      gravados[u.pathname.replace("/storage/v1/object/backups/", "")] = String(op.body);
      return json({});
    }
    if (u.pathname === "/storage/v1/object/backups" && op.method === "DELETE") {
      apagados = JSON.parse(String(op.body)).prefixes;
      return json([]);
    }
    return json({ erro: "inesperado " + u.pathname }, 500);
  });
});
afterAll(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const resposta = () => {
  const r: { code?: number; body?: unknown } = {};
  return {
    r,
    res: {
      status(c: number) {
        r.code = c;
        return this;
      },
      json(b: unknown) {
        r.body = b;
        return this;
      },
    },
  };
};

describe("robô do backup", () => {
  it("sem o segredo, recusa (nem com o cabeçalho do cron)", async () => {
    // @ts-expect-error: arquivo JS da Vercel, sem tipos
    const { default: handler } = await import("../../api/backup.js");
    const { r, res } = resposta();
    await handler({ headers: { "x-vercel-cron": "1" }, query: {} }, res);
    expect(r.code).toBe(401);
  });

  it("pagina, cifra com a chave da loja e apaga o que passou de 30 dias", async () => {
    // @ts-expect-error: arquivo JS da Vercel, sem tipos
    const { default: handler } = await import("../../api/backup.js");
    const { r, res } = resposta();
    await handler({ headers: { authorization: "Bearer segredo" }, query: {} }, res);
    expect(r.code).toBe(200);
    const [caminho] = Object.keys(gravados);
    expect(caminho).toBe("L1/2026-09-27.json.enc");
    // Base64 não tem aspas: achar um pedaço de JSON aqui seria dado aberto.
    expect(gravados[caminho].startsWith("sbk1.")).toBe(true);
    expect(gravados[caminho]).not.toContain('"nome"');
    const b = lerBackup(await decifrar(gravados[caminho], chave), "L1");
    expect(b.tabelas.movimentos).toHaveLength(1500);
    expect(b.tabelas.clientes).toEqual([{ id: "c1", nome: "Ana" }]);
    expect(b.tabelas.rmas).toBeUndefined();
    expect(b.config).toEqual({ nomeLoja: "Cell X", backupEmail: "dono@loja.com" });
    // Domingo: o e-mail leva o arquivo CIFRADO, nunca o JSON aberto.
    expect(email?.to).toEqual(["dono@loja.com"]);
    expect(atob(email!.attachments[0].content)).toBe(gravados[caminho]);
    expect(apagados).toContain("L1/2026-08-01.json.enc");
    expect(r.body).toMatchObject({ ok: true, feitos: 1 });
    expect(apagados).not.toContain("L1/2026-09-25.json.enc");
  });
});
