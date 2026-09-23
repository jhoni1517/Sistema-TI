import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { totalOS } from "./calc";
import type { OrdemServico, PecaOS } from "./types";

/**
 * O Pix pelo link mexe em dinheiro sem ninguém no balcão olhando.
 *
 * A lógica mora em api/pix.js, que é JavaScript puro (função da Vercel não
 * importa TypeScript). Este teste LÊ o arquivo do disco e extrai as funções
 * de lá — recopiar aqui faria as duas cópias envelhecerem juntas e mentirem
 * em coordenação.
 *
 * Três coisas que não podem falhar:
 *   1. o valor cobrado é o mesmo que a tela mostra, centavo por centavo;
 *   2. o mesmo aviso do Mercado Pago duas vezes não lança duas vezes;
 *   3. o token da loja não sai legível do banco.
 */

const fonte = readFileSync(resolve(__dirname, "..", "..", "api", "pix.js"), "utf8");

function extrair(nome: string): string {
  const m = new RegExp(`(async )?function ${nome}\\(`).exec(fonte);
  if (!m) throw new Error(`função ${nome} sumiu de api/pix.js`);
  const abre = fonte.indexOf("{", fonte.indexOf(")", m.index));
  let nivel = 0;
  for (let j = abre; j < fonte.length; j++) {
    if (fonte[j] === "{") nivel++;
    else if (fonte[j] === "}") {
      nivel--;
      if (nivel === 0) return fonte.slice(m.index, j + 1);
    }
  }
  throw new Error(`não consegui ler o corpo de ${nome}`);
}

/** Monta funções do arquivo real, com o que elas precisam por perto */
function montar<T>(nomes: string[], devolver: string, extras: Record<string, unknown> = {}): T {
  const params = Object.keys(extras);
  const codigo = `${nomes.map(extrair).join("\n")}\nreturn ${devolver};`;
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(...params, codigo)(...Object.values(extras)) as T;
}

/* ------------------------------------------------------------------ */

type Pagar = {
  valorDaOS: (o: unknown) => number;
  aPagar: (o: unknown, m: unknown[]) => number;
};
const dinheiro = montar<Pagar>(["centavos", "valorDaOS", "aPagar"], "{ valorDaOS, aPagar }");

function sorteio(semente: number) {
  let x = semente >>> 0 || 1;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
}

describe("o valor do Pix é o mesmo da tela", () => {
  it("valorDaOS (api/pix.js) e totalOS (lib/calc.ts) concordam em 500 OS sorteadas", () => {
    const r = sorteio(20260923);
    const opcoes = ["", "", "Opção 1", "Opção 2", "Completo"];
    for (let k = 0; k < 500; k++) {
      const pecas: PecaOS[] = Array.from({ length: Math.floor(r() * 6) }, (_, i) => ({
        descricao: `peça ${i}`,
        quantidade: Math.floor(r() * 3) + (r() < 0.2 ? 0.5 : 0),
        precoUnit: Math.round(r() * 90000) / 100,
        custoUnit: 0,
        opcao: opcoes[Math.floor(r() * opcoes.length)] || undefined,
      })) as PecaOS[];
      const o = {
        pecas,
        maoDeObra: Math.round(r() * 50000) / 100,
        desconto: r() < 0.3 ? Math.round(r() * 5000) / 100 : 0,
        opcaoEscolhida: r() < 0.5 ? opcoes[Math.floor(r() * opcoes.length)] : undefined,
      } as unknown as OrdemServico;
      expect(Math.round(dinheiro.valorDaOS(o) * 100), JSON.stringify(o)).toBe(
        Math.round(totalOS(o) * 100)
      );
    }
  });

  it("o sinal já pago abate; saída não conta; nunca fica negativo", () => {
    const o = { pecas: [], maoDeObra: 800, desconto: 0 };
    expect(dinheiro.aPagar(o, [])).toBe(800);
    expect(dinheiro.aPagar(o, [{ tipo: "entrada", valor: 300 }])).toBe(500);
    expect(dinheiro.aPagar(o, [{ tipo: "saida", valor: 300 }])).toBe(800);
    expect(dinheiro.aPagar(o, [{ tipo: "entrada", valor: 900 }])).toBe(0);
  });

  it("o valor nunca vem do navegador", () => {
    // Quem gera o QR lê loja, número e segredo do pedido — e mais nada.
    const gerar = extrair("acaoGerar");
    expect(gerar).toMatch(/const \{ loja, numero, t \} = req\.body/);
    expect(gerar).not.toMatch(/req\.body\??\.valor/);
    expect(gerar).toMatch(/aPagar\(ordem/);
  });
});

/* ------------------------------------------------------------------ */

describe("o token da loja fica cifrado", () => {
  const cofre = montar<{ cifrar: (t: string, k: string) => string; decifrar: (g: string, k: string) => string }>(
    ["cifrar", "decifrar"],
    "{ cifrar, decifrar }",
    { createCipheriv, createDecipheriv, randomBytes, Buffer }
  );
  const chave = randomBytes(32).toString("base64");

  it("ida e volta", () => {
    const g = cofre.cifrar("APP_USR-123-abc", chave);
    expect(g).not.toContain("APP_USR");
    expect(cofre.decifrar(g, chave)).toBe("APP_USR-123-abc");
  });

  it("gravado mexido ou chave errada não decifra — recusa em vez de devolver lixo", () => {
    const g = cofre.cifrar("APP_USR-123-abc", chave);
    const partes = g.split(":");
    partes[3] = Buffer.from("outra coisa").toString("base64");
    expect(() => cofre.decifrar(partes.join(":"), chave)).toThrow();
    expect(() => cofre.decifrar(g, randomBytes(32).toString("base64"))).toThrow();
  });

  it("chave de tamanho errado é recusada na hora de gravar", () => {
    expect(() => cofre.cifrar("x", "curta")).toThrow(/32 bytes/);
  });
});

/* ------------------------------------------------------------------ */

const LOJA = "11111111-1111-1111-1111-111111111111";

/** Um Supabase de mentira, em memória, que entende só o que o arquivo usa */
function bancoFalso() {
  const tabelas: Record<string, Record<string, unknown>[]> = {
    ordens: [{ id: "os-1", numero: 33, clienteId: "c1", lojaId: LOJA }],
    clientes: [{ id: "c1", nome: "Maria Souza" }],
    sessoes: [{ id: "sessao-1" }],
    movimentos: [],
    pix_cobrancas: [{ id: "123", status: "pending" }],
    configuracoes: [{ id: LOJA, dados: { telegramChatId: "555" } }],
  };
  const telegram: { chat_id: string; text: string }[] = [];
  const fetchFalso = async (url: string, opcoes: RequestInit = {}) => {
    if (url.startsWith("https://api.telegram.org/")) {
      telegram.push(JSON.parse(String(opcoes.body)));
      return { ok: true, status: 200, text: async () => "{}" };
    }
    const u = new URL(url);
    const tabela = u.pathname.split("/").pop()!;
    const linhas = tabelas[tabela] || [];
    const metodo = opcoes.method || "GET";
    let saida: unknown = null;
    if (metodo === "GET") {
      const id = u.searchParams.get("id")?.replace("eq.", "");
      saida = id ? linhas.filter((l) => l.id === id) : linhas;
    } else if (metodo === "POST") {
      const prefer = String((opcoes.headers as Record<string, string>)?.Prefer || "");
      const entrou: unknown[] = [];
      for (const nova of JSON.parse(String(opcoes.body))) {
        const existe = linhas.some((l) => l.id === nova.id);
        if (existe && !prefer.includes("ignore-duplicates")) {
          return { ok: false, status: 409, text: async () => "duplicate key" };
        }
        if (!existe) {
          linhas.push(nova);
          entrou.push(nova);
        }
      }
      tabelas[tabela] = linhas;
      // Como o PostgREST: "return=representation" devolve só o que entrou.
      if (prefer.includes("return=representation")) saida = entrou;
    } else if (metodo === "PATCH") {
      const id = u.searchParams.get("id")?.replace("eq.", "");
      for (const l of linhas) if (l.id === id) Object.assign(l, JSON.parse(String(opcoes.body)));
    }
    return { ok: true, status: 200, text: async () => (saida ? JSON.stringify(saida) : "") };
  };
  return { tabelas, fetchFalso, telegram };
}

function roboDoPix(fetchFalso: unknown) {
  return montar<(loja: string, p: Record<string, unknown>) => Promise<{ ok: boolean; pago?: boolean }>>(
    ["centavos", "codigoOS", "movimentoDoPix", "recadoDoPix", "sb", "avisarLoja", "sessaoAberta", "processarPagamento"],
    "processarPagamento",
    { fetch: fetchFalso, SUPABASE_URL: "https://banco.teste", SERVICE_KEY: "chave", TELEGRAM_TOKEN: "robo", console }
  );
}

const aprovado = {
  id: 123,
  status: "approved",
  transaction_amount: 480,
  date_approved: "2026-09-23T15:00:00Z",
  external_reference: `${LOJA}|os-1`,
};

describe("o aviso repetido não lança duas vezes", () => {
  it("o mesmo pagamento processado duas vezes vira UM lançamento", async () => {
    const { tabelas, fetchFalso } = bancoFalso();
    const processar = roboDoPix(fetchFalso);
    await processar(LOJA, aprovado);
    await processar(LOJA, aprovado);
    expect(tabelas.movimentos).toHaveLength(1);
  });

  it("o lançamento é Pix, da OS, no caixa aberto, com o valor que o Mercado Pago cobrou", async () => {
    const { tabelas, fetchFalso } = bancoFalso();
    await roboDoPix(fetchFalso)(LOJA, aprovado);
    expect(tabelas.movimentos[0]).toMatchObject({
      id: "pix-123",
      tipo: "entrada",
      categoria: "OS",
      formaPagamento: "pix",
      osId: "os-1",
      valor: 480,
      sessaoId: "sessao-1",
      custoRelacionado: 0,
      lojaId: LOJA,
    });
    expect(String(tabelas.movimentos[0].descricao)).toContain("OS00033");
  });

  it("dinheiro primeiro: a cobrança só é marcada paga depois do lançamento", async () => {
    const { tabelas, fetchFalso } = bancoFalso();
    await roboDoPix(fetchFalso)(LOJA, aprovado);
    expect(tabelas.pix_cobrancas[0]).toMatchObject({ status: "approved", movimentoId: "pix-123" });
    const corpo = extrair("processarPagamento");
    expect(corpo.indexOf('"movimentos?on_conflict=id"')).toBeLessThan(
      corpo.indexOf("movimentoId: movimento.id")
    );
  });

  it("o Telegram da loja avisa UMA vez, mesmo com o aviso do Mercado Pago repetido", async () => {
    const { telegram, fetchFalso } = bancoFalso();
    const processar = roboDoPix(fetchFalso);
    await processar(LOJA, aprovado);
    await processar(LOJA, aprovado);
    expect(telegram).toHaveLength(1);
    expect(telegram[0].chat_id).toBe("555");
    expect(telegram[0].text).toContain("R$ 480,00");
    expect(telegram[0].text).toContain("OS00033");
    expect(telegram[0].text).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("loja sem chat do Telegram: o pagamento entra do mesmo jeito, sem aviso", async () => {
    const { tabelas, telegram, fetchFalso } = bancoFalso();
    tabelas.configuracoes = [{ id: LOJA, dados: {} }];
    await roboDoPix(fetchFalso)(LOJA, aprovado);
    expect(telegram).toHaveLength(0);
    expect(tabelas.movimentos).toHaveLength(1);
  });

  it("pendente não lança nada", async () => {
    const { tabelas, fetchFalso } = bancoFalso();
    const r = await roboDoPix(fetchFalso)(LOJA, { ...aprovado, status: "pending" });
    expect(r.pago).toBe(false);
    expect(tabelas.movimentos).toHaveLength(0);
  });

  it("pagamento de outra loja é recusado", async () => {
    const { tabelas, fetchFalso } = bancoFalso();
    const r = await roboDoPix(fetchFalso)(LOJA, {
      ...aprovado,
      external_reference: "22222222-2222-2222-2222-222222222222|os-1",
    });
    expect(r.ok).toBe(false);
    expect(tabelas.movimentos).toHaveLength(0);
  });

  it("o aviso não é prova: o pagamento é lido de novo no Mercado Pago", () => {
    const aviso = extrair("acaoWebhook");
    expect(aviso).toMatch(/mp\(token, `\/v1\/payments\/\$\{id\}`\)/);
    expect(aviso).not.toMatch(/req\.body\??\.(status|transaction_amount)/);
  });
});

describe("a página e o servidor oferecem Pix nos mesmos status", () => {
  it("STATUS_QUE_PAGAM é igual nos dois lados", async () => {
    const { STATUS_QUE_PAGAM } = await import("./pix");
    const doServidor = fonte.match(/const STATUS_QUE_PAGAM = (\[[^\]]*\])/)?.[1];
    expect(doServidor, "a lista sumiu de api/pix.js").toBeTruthy();
    expect(JSON.parse(doServidor!)).toEqual(STATUS_QUE_PAGAM);
  });
});

describe("o QR na página", () => {
  it("só base64 vira imagem", async () => {
    const { imagemDoQR } = await import("./pix");
    expect(imagemDoQR("iVBORw0KGgo=")).toBe("data:image/png;base64,iVBORw0KGgo=");
    expect(imagemDoQR('x" onerror="alert(1)')).toBe("");
    expect(imagemDoQR("")).toBe("");
  });

  it("diz quanto tempo o QR ainda vale, e cala quando venceu", async () => {
    const { validadeDoQR } = await import("./pix");
    const agora = new Date("2026-09-23T15:00:00Z");
    expect(validadeDoQR("2026-09-23T15:29:30Z", agora)).toBe("Vale por mais 29 minutos");
    expect(validadeDoQR("2026-09-23T15:01:10Z", agora)).toBe("Vale por mais 1 minuto");
    expect(validadeDoQR("2026-09-23T14:59:00Z", agora)).toBe("");
    expect(validadeDoQR("", agora)).toBe("");
  });
});

describe("aviso de Pix com o sistema aberto", () => {
  it("avisa só o que ainda não foi visto neste aparelho", async () => {
    const { pixQueCairam } = await import("./pix");
    const linhas = [
      { id: "1", valor: 10, osId: "a", pagoEm: "2026-09-23T15:00:00Z" },
      { id: "2", valor: 20, osId: "b", pagoEm: "2026-09-23T15:01:00Z" },
    ];
    expect(pixQueCairam(linhas, new Set(["1"])).map((p) => p.id)).toEqual(["2"]);
    expect(pixQueCairam(null, new Set())).toEqual([]);
  });

  it("o texto diz valor e OS, sem emoji", async () => {
    const { textoDoPixRecebido } = await import("./pix");
    const t = textoDoPixRecebido(1, "OS00033");
    expect(t).toBe("R$ 1,00 da OS00033, pago pelo link. Já está no caixa.");
    expect(t).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
