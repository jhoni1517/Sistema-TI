import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * A rotina diária rodando de verdade, com o banco e o Telegram fingidos.
 *
 * O outro teste (cobranca.cron.test.ts) lê o arquivo e confere a forma: quem
 * chama quem, qual consulta filtra por loja. Isso pega o descuido, mas não
 * prova que a mensagem chega no chat certo — e era exatamente esse o bug:
 * dado de uma loja saindo no Telegram de outra pessoa.
 *
 * Aqui o handler roda inteiro. O `fetch` é trocado por um que responde como
 * o Supabase e anota cada mensagem enviada, com o chat de destino. Se algum
 * dia alguém trocar um `enviarPara` por um `enviarTelegram`, a mercearia
 * aparece no chat do operador e este teste mostra isso na cara.
 */

/** Uma segunda-feira: é o dia em que o aviso de fiado vencido sai. */
const SEGUNDA = new Date("2026-08-03T09:00:00.000Z");

const LOJA_A = "aaaaaaaa-0000-4000-8000-000000000001";
const LOJA_B = "bbbbbbbb-0000-4000-8000-000000000002";
const CHAT_A = "111111";
const CHAT_OPERADOR = "999999";

interface Enviada {
  chat: string;
  texto: string;
}

let enviadas: Enviada[] = [];
let consultas: string[] = [];

/** Corpo que o Supabase devolveria para cada consulta desta rotina */
function respostaDoBanco(url: string): unknown {
  if (url.includes("/sistema_config")) return [{ dias_tolerancia: 5 }];
  // Nenhuma mensalidade vencendo: o caminho curto, que é o que roda na
  // maioria absoluta dos dias.
  if (url.includes("/lojas?")) return [];
  if (url.includes("/avisos_cobranca")) return [];

  if (url.includes("/configuracoes")) {
    return [
      { id: LOJA_A, dados: { nomeLoja: "Mercearia da Ana", telegramChatId: CHAT_A } },
      // Loja B não configurou Telegram: não pode receber nem vazar.
      { id: LOJA_B, dados: { nomeLoja: "Pizzaria do Beto" } },
    ];
  }

  if (url.includes("/contas_pagar")) {
    return [
      {
        id: "conta-a",
        descricao: "Aluguel da mercearia",
        valor: 1200,
        vencimento: "2026-08-03",
        lembreteDias: 3,
        ativo: true,
        recorrencia: "mensal",
        pagamentos: [],
        lojaId: LOJA_A,
      },
      {
        id: "conta-b",
        descricao: "Forno da pizzaria",
        valor: 800,
        vencimento: "2026-08-03",
        lembreteDias: 3,
        ativo: true,
        recorrencia: "mensal",
        pagamentos: [],
        lojaId: LOJA_B,
      },
    ];
  }
  if (url.includes("/avisos_contas")) return [];

  if (url.includes("/eventos")) {
    return [
      {
        id: "ev-a",
        titulo: "Entrega do fornecedor",
        data: "2026-08-03",
        repetir: "nenhuma",
        avisarDiasAntes: 0,
        concluido: false,
        lojaId: LOJA_A,
      },
      {
        id: "ev-b",
        titulo: "Manutencao do forno",
        data: "2026-08-03",
        repetir: "nenhuma",
        avisarDiasAntes: 0,
        concluido: false,
        lojaId: LOJA_B,
      },
    ];
  }

  if (url.includes("/fiados")) {
    return [
      {
        id: "fi-a",
        clienteId: "cli-a",
        descricao: "feira do mes",
        valor: 340,
        pagamentos: [],
        quitado: false,
        vencimento: "2026-07-01",
        lojaId: LOJA_A,
      },
      {
        id: "fi-b",
        clienteId: "cli-b",
        descricao: "rodizio",
        valor: 500,
        pagamentos: [],
        quitado: false,
        vencimento: "2026-07-01",
        lojaId: LOJA_B,
      },
    ];
  }

  if (url.includes("/clientes")) {
    return [
      { id: "cli-a", nome: "Dona Ana", nascimento: "1970-08-03", lojaId: LOJA_A },
      { id: "cli-b", nome: "Seu Beto", nascimento: "1970-08-03", lojaId: LOJA_B },
    ];
  }
  return [];
}

function fetchFingido(url: string, opcoes: { body?: string } = {}) {
  if (url.includes("api.telegram.org")) {
    const corpo = JSON.parse(opcoes.body || "{}");
    enviadas.push({ chat: String(corpo.chat_id), texto: String(corpo.text) });
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) });
  }
  consultas.push(url);
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => respostaDoBanco(url),
    text: async () => "",
    headers: { get: () => null },
  });
}

/** Carrega o módulo do zero: ele lê as variáveis de ambiente ao importar */
async function rodar() {
  vi.resetModules();
  // Função da Vercel é JavaScript puro e não tem tipos — é justamente por
  // isso que ela precisa deste teste, e não do compilador.
  // @ts-expect-error módulo JS sem declaração de tipos
  const { default: handler } = await import("../../api/cobranca.js");
  const resposta: { status?: number; corpo?: Record<string, unknown> } = {};
  const res = {
    status(s: number) {
      resposta.status = s;
      return {
        json(c: Record<string, unknown>) {
          resposta.corpo = c;
          return c;
        },
        end() {},
      };
    },
  };
  await handler({ method: "POST", headers: { "x-vercel-cron": "1" }, query: {} }, res);
  return resposta;
}

describe("a rotina diária manda cada coisa para o chat certo", () => {
  beforeEach(() => {
    enviadas = [];
    consultas = [];
    vi.useFakeTimers();
    vi.setSystemTime(SEGUNDA);
    vi.stubEnv("SUPABASE_URL", "https://exemplo.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "chave-de-mentira");
    vi.stubEnv("TELEGRAM_TOKEN", "token-de-mentira");
    vi.stubEnv("TELEGRAM_CHAT_ID", CHAT_OPERADOR);
    vi.stubGlobal("fetch", fetchFingido);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("o chat do operador não recebe NADA de dentro de loja nenhuma", async () => {
    // Este é o teste. Todo o resto é detalhe.
    await rodar();
    const doOperador = enviadas.filter((e) => e.chat === CHAT_OPERADOR);
    expect(doOperador).toEqual([]);
  });

  it("a loja com Telegram configurado recebe o que é dela", async () => {
    await rodar();
    const daLojaA = enviadas.filter((e) => e.chat === CHAT_A).map((e) => e.texto);
    const tudo = daLojaA.join("\n---\n");

    expect(tudo).toContain("Aluguel da mercearia");
    expect(tudo).toContain("Entrega do fornecedor");
    expect(tudo).toContain("Dona Ana");
  });

  it("nada da loja B sai, porque ela não configurou o Telegram", async () => {
    // Silêncio é o padrão certo: o contrário vaza por omissão.
    await rodar();
    const tudo = enviadas.map((e) => e.texto).join("\n");
    expect(tudo).not.toContain("Forno da pizzaria");
    expect(tudo).not.toContain("Manutencao do forno");
    expect(tudo).not.toContain("Seu Beto");
  });

  it("toda mensagem sai para um chat de loja, nenhuma para outro lugar", async () => {
    await rodar();
    expect(enviadas.length).toBeGreaterThan(0);
    for (const e of enviadas) expect(e.chat).toBe(CHAT_A);
  });

  it("a consulta de cliente já sai filtrada pelas lojas que vão receber", async () => {
    // Puxar nome de cliente de quem não recebe nada é carregar o dado mais
    // sensível do sistema sem nenhum uso.
    await rodar();
    const deCliente = consultas.filter((u) => u.includes("/clientes?select=nome"));
    expect(deCliente.length).toBeGreaterThan(0);
    for (const u of deCliente) {
      expect(u).toContain(LOJA_A);
      expect(u).not.toContain(LOJA_B);
    }
  });

  it("sem nenhuma loja configurada, o cron não manda mensagem nenhuma", async () => {
    const original = respostaDoBanco;
    vi.stubGlobal("fetch", (url: string, o: { body?: string } = {}) =>
      url.includes("/configuracoes")
        ? Promise.resolve({
            ok: true,
            status: 200,
            json: async () => [],
            text: async () => "",
            headers: { get: () => null },
          })
        : fetchFingido(url, o)
    );
    await rodar();
    expect(enviadas).toEqual([]);
    expect(original).toBeTruthy();
  });

  it("o resumo de mensalidade continua indo para o operador", async () => {
    // O canal dele não foi desligado: nome da loja e quanto ela deve são da
    // relação comercial, e é o aviso que paga o sistema.
    vi.stubGlobal("fetch", (url: string, o: { body?: string } = {}) => {
      if (url.includes("/lojas?")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [
            {
              id: LOJA_B,
              nome: "Pizzaria do Beto",
              venceEm: "2026-08-01T00:00:00Z",
              valor_mensal: 120,
              bloqueada: false,
              isento: false,
            },
          ],
          text: async () => "",
          headers: { get: () => null },
        });
      }
      return fetchFingido(url, o);
    });

    await rodar();
    const doOperador = enviadas.filter((e) => e.chat === CHAT_OPERADOR);
    expect(doOperador).toHaveLength(1);
    expect(doOperador[0].texto).toContain("Pizzaria do Beto");
    expect(doOperador[0].texto).toContain("Mensalidades");
    // E continua sem levar nada de dentro da loja junto.
    expect(doOperador[0].texto).not.toContain("Seu Beto");
    expect(doOperador[0].texto).not.toContain("Forno da pizzaria");
  });
});
