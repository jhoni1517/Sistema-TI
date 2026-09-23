import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  MODELOS_POR_STATUS,
  numeroWhatsapp,
  parametrosDoModelo,
  idDoEnvio,
  statusQueAvisa,
  MAXIMO_DE_TENTATIVAS_WHATSAPP,
} from "./whatsapp-os";

describe("WhatsApp automático: regras", () => {
  it("número vira 55 + DDD + número; sem DDD, nada", () => {
    expect(numeroWhatsapp("(41) 99999-0000")).toBe("5541999990000");
    expect(numeroWhatsapp("+55 41 3333-4444")).toBe("554133334444");
    expect(numeroWhatsapp("99999-0000")).toBe("");
    expect(numeroWhatsapp("")).toBe("");
  });

  it("parâmetros nunca vão vazios: a Meta recusa modelo com parâmetro em branco", () => {
    expect(parametrosDoModelo({ nomeCliente: "Maria Souza", numero: 33, marca: "Samsung", modelo: "A54", link: "https://x" })).toEqual([
      "Maria",
      "OS00033",
      "Samsung A54",
      "https://x",
    ]);
    expect(parametrosDoModelo({ numero: 1, link: "" }).every((p) => p.length > 0)).toBe(true);
  });

  it("um envio por OS e status", () => {
    expect(idDoEnvio("os-1", "pronta")).toBe("os-1:pronta");
  });

  it("só os status que o cliente precisa saber avisam", () => {
    expect(statusQueAvisa("pronta")).toBe(true);
    expect(statusQueAvisa("em_analise")).toBe(false);
    expect(statusQueAvisa("em_reparo")).toBe(false);
  });

  it("modelos de utilidade: sem emoji, sem propaganda, 4 parâmetros em ordem", () => {
    for (const m of Object.values(MODELOS_POR_STATUS)) {
      expect(m!.texto).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(m!.texto).not.toMatch(/promo|desconto|oferta/i);
      expect(m!.nome).toMatch(/^[a-z0-9_]+$/);
      for (const n of [1, 2, 3, 4]) expect(m!.texto, m!.nome).toContain(`{{${n}}}`);
    }
  });
});

/**
 * O servidor manda pelo NOME do modelo. Se a tela (e a lista que vai para
 * aprovação na Meta) disser um nome e o servidor outro, toda mensagem é
 * recusada — em silêncio, porque quem lê o erro é o log.
 */
describe("tela e servidor usam os mesmos modelos", () => {
  const fonte = readFileSync(resolve(__dirname, "..", "..", "api", "whatsapp-os.js"), "utf8");

  it("mesmo status → mesmo nome de modelo", () => {
    const bloco = fonte.match(/const MODELO_POR_STATUS = (\{[\s\S]*?\n\});/)?.[1];
    expect(bloco, "MODELO_POR_STATUS sumiu de api/whatsapp-os.js").toBeTruthy();
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const doServidor = new Function(`return ${bloco}`)() as Record<string, string>;
    const daTela = Object.fromEntries(Object.entries(MODELOS_POR_STATUS).map(([s, m]) => [s, m!.nome]));
    expect(doServidor).toEqual(daTela);
  });

  it("mesmo teto de tentativas", () => {
    expect(fonte).toContain(`const MAXIMO_DE_TENTATIVAS = ${MAXIMO_DE_TENTATIVAS_WHATSAPP};`);
  });

  it("a loja vem da sessão, nunca do corpo do pedido", () => {
    expect(fonte).not.toMatch(/req\.body\??\.(loja|lojaId)\b/);
  });
});

/* ------------------------------------------------------------------ */
/* A fila de verdade, com banco e Meta de mentira                      */
/* ------------------------------------------------------------------ */

const api = resolve(__dirname, "..", "..", "api");
const doArquivo = (arquivo: string, nome: string): string => {
  const fonte = readFileSync(resolve(api, arquivo), "utf8");
  const m = new RegExp(`(async )?function ${nome}\\(`).exec(fonte)!;
  const abre = fonte.indexOf("{", fonte.indexOf(")", m.index));
  let nivel = 0;
  for (let j = abre; j < fonte.length; j++) {
    if (fonte[j] === "{") nivel++;
    else if (fonte[j] === "}" && --nivel === 0) return fonte.slice(m.index, j + 1);
  }
  throw new Error(nome);
};

function mundoFalso(metaFalha = false) {
  const envios: Record<string, unknown>[] = [
    { id: "os-1:pronta", lojaId: "L", situacao: "pendente", tentativas: 0, modelo: "os_pronta", telefone: "5541999990000", parametros: ["Maria"] },
  ];
  const enviados: unknown[] = [];
  const fetchFalso = async (url: string, op: RequestInit = {}) => {
    if (url.includes("graph.facebook.com")) {
      enviados.push(JSON.parse(String(op.body)));
      return metaFalha
        ? { ok: false, status: 400, json: async () => ({ error: { message: "modelo não aprovado" } }) }
        : { ok: true, status: 200, json: async () => ({ messages: [{ id: "wamid.1" }] }) };
    }
    const u = new URL(url);
    const id = decodeURIComponent(u.searchParams.get("id")?.replace("eq.", "") || "");
    const soPendente = u.searchParams.get("situacao") === "in.(pendente,falhou)";
    const alvo = envios.filter((e) => (!id || e.id === id) && (!soPendente || ["pendente", "falhou"].includes(String(e.situacao))));
    if ((op.method || "GET") === "PATCH") {
      alvo.forEach((e) => Object.assign(e, JSON.parse(String(op.body))));
      return { ok: true, status: 200, text: async () => JSON.stringify(alvo) };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify(alvo.filter((e) => Number(e.tentativas) < 5)) };
  };
  const processar = new Function(
    "fetch",
    "SUPABASE_URL",
    "SERVICE_KEY",
    "GRAPH",
    "MAXIMO_DE_TENTATIVAS",
    "LOTE",
    [doArquivo("_ia.js", "sb"), doArquivo("whatsapp-os.js", "mandarModelo"), doArquivo("whatsapp-os.js", "processarFila")].join("\n") +
      "\nreturn processarFila;"
  )(fetchFalso, "https://banco", "k", "https://graph.facebook.com/v21.0", 5, 5) as (
    l: string,
    c: { phoneId: string; token: string }
  ) => Promise<{ enviados: number; falhas: number }>;
  return { envios, enviados, processar };
}

describe("a fila do WhatsApp nunca manda duas vezes", () => {
  const cred = { phoneId: "123", token: "t" };

  it("duas rodadas juntas: só uma pega o envio", async () => {
    const { envios, enviados, processar } = mundoFalso();
    await Promise.all([processar("L", cred), processar("L", cred)]);
    expect(enviados).toHaveLength(1);
    expect(envios[0]).toMatchObject({ situacao: "enviado", mensagemId: "wamid.1", tentativas: 1 });
  });

  it("já enviado não é mandado de novo na próxima rodada", async () => {
    const { enviados, processar } = mundoFalso();
    await processar("L", cred);
    await processar("L", cred);
    expect(enviados).toHaveLength(1);
  });

  it("falha fica na fila com o erro, e desiste na 5ª", async () => {
    const { envios, processar } = mundoFalso(true);
    await processar("L", cred);
    expect(envios[0]).toMatchObject({ situacao: "falhou", erro: "modelo não aprovado", tentativas: 1 });
    for (let i = 0; i < 6; i++) await processar("L", cred);
    expect(envios[0]).toMatchObject({ situacao: "desistiu", tentativas: 5 });
  });

  it("vai como modelo em pt_BR, com os parâmetros no corpo", async () => {
    const { enviados, processar } = mundoFalso();
    await processar("L", cred);
    expect(enviados[0]).toMatchObject({
      to: "5541999990000",
      type: "template",
      template: { name: "os_pronta", language: { code: "pt_BR" } },
    });
  });
});

describe("o recado na tela", () => {
  it("enviado avisa; falha diz a saída; ignorado cala", async () => {
    const { recadoDoAviso } = await import("./whatsapp-envio");
    expect(recadoDoAviso({ situacao: "enviado" }).tipo).toBe("sucesso");
    const f = recadoDoAviso({ situacao: "falhou", erro: "modelo não aprovado" });
    expect(f.tipo).toBe("alerta");
    expect(f.texto).toContain("botão do WhatsApp");
    expect(recadoDoAviso({ ignorado: "plano" }).texto).toBe("");
  });
});
