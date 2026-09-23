// ============================================================
//  O que as funções de IA têm em comum: quem chama, quanto pode gastar e
//  a conversa com o Gemini.
//
//  Arquivo com "_" na frente NÃO vira função da Vercel (igual ao
//  _caixa.js): é só código compartilhado. Isso importa porque o plano
//  Hobby tem teto de funções.
//
//  Variáveis no Vercel:
//    GEMINI_API_KEY   -> chave da API do Gemini (aistudio.google.com)
//    GEMINI_MODELO    -> opcional; padrão "gemini-3.5-flash-lite"
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || SERVICE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODELO = process.env.GEMINI_MODELO || "gemini-3.5-flash-lite";

/**
 * Quanto cada plano pode usar por mês. MESMOS números de src/lib/planos.ts
 * — ia.cron.test.ts lê os dois arquivos e reprova se divergirem. Quem
 * confere de verdade é este lado: a tela só mostra.
 */
export const LIMITES_IA = {
  essencial: { nota: 20, diagnostico: 30, voz: 30 },
  completo: { nota: 200, diagnostico: 300, voz: 300 },
};

/** Como cada recurso aparece na mensagem de limite */
const NOME_DO_RECURSO = {
  nota: "leituras de nota",
  diagnostico: "sugestões da IA",
  voz: "OS por voz",
};

function planoDe(v) {
  return v === "completo" ? "completo" : "essencial";
}

export async function sb(caminho, opcoes = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
    ...opcoes,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(opcoes.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`Banco respondeu ${r.status}: ${await r.text()}`);
  if (r.status === 204) return null;
  const texto = await r.text();
  return texto ? JSON.parse(texto) : null;
}

/**
 * Quem está chamando: loja, papel e plano, a partir da SESSÃO.
 *
 * A loja nunca vem do corpo do pedido — senão bastava trocar o id para
 * gastar os créditos de outra loja.
 */
export async function lojaDaSessao(req) {
  const sessao = String(req.headers.authorization || "").replace("Bearer ", "");
  if (!sessao) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${sessao}` },
  });
  if (!r.ok) return null;
  const usuario = await r.json();
  if (!usuario?.id) return null;
  const [perfil] = (await sb(`perfis?select=loja_id,papel,ativo&id=eq.${usuario.id}`)) || [];
  if (!perfil?.loja_id || perfil.ativo === false) return null;
  const [loja] = (await sb(`lojas?select=plano,bloqueada&id=eq.${perfil.loja_id}`)) || [];
  return {
    lojaId: String(perfil.loja_id),
    papel: perfil.papel,
    plano: planoDe(loja?.plano),
    bloqueada: loja?.bloqueada === true,
  };
}

/**
 * Gasta um crédito do mês, ou recusa. A conta é atômica no banco
 * (`gastar_ia`): duas leituras juntas no último crédito não passam as duas.
 */
export async function gastarCredito(quem, recurso) {
  const limite = LIMITES_IA[quem.plano]?.[recurso] ?? 0;
  const usados = await sb("rpc/gastar_ia", {
    method: "POST",
    body: JSON.stringify({ p_loja: quem.lojaId, p_recurso: recurso, p_limite: limite }),
  });
  return { ok: Number(usados) >= 0, usados: Number(usados), limite };
}

/** A IA falhou: a loja não paga por resposta que não veio. */
export async function devolverCredito(quem, recurso) {
  try {
    await sb("rpc/devolver_ia", {
      method: "POST",
      body: JSON.stringify({ p_loja: quem.lojaId, p_recurso: recurso }),
    });
  } catch (e) {
    console.error("IA: não consegui devolver o crédito", e?.message || e);
  }
}

/**
 * Uma pergunta ao Gemini, pedindo JSON.
 *
 * O prazo é curto de propósito: a função da Vercel morre em 15 s, e morrer
 * no meio não devolveria o crédito nem diria nada à tela. Com 12 s, sobra
 * tempo de responder "demorou, tenta de novo".
 */
export async function perguntarAoGemini({ instrucao, partes }) {
  if (!GEMINI_API_KEY) {
    throw new Error("Falta GEMINI_API_KEY nas variáveis da Vercel.");
  }
  const controle = new AbortController();
  const prazo = setTimeout(() => controle.abort(), 12000);
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODELO}:generateContent`,
      {
        method: "POST",
        signal: controle.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: instrucao }] },
          contents: [{ role: "user", parts: partes }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
        }),
      }
    );
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok) {
      throw new Error(corpo?.error?.message || `Gemini respondeu ${r.status}`);
    }
    return (corpo?.candidates?.[0]?.content?.parts || [])
      .map((p) => p?.text || "")
      .join("");
  } catch (e) {
    if (e?.name === "AbortError") throw new Error("A IA demorou demais para responder. Tenta de novo.");
    throw e;
  } finally {
    clearTimeout(prazo);
  }
}

/**
 * O caminho de toda chamada de IA: confere sessão, gasta crédito, pergunta,
 * e devolve o crédito se a pergunta falhar. Quem chama só monta o pedido.
 *
 * A resposta sai CRUA para a tela: quem valida e limpa é lib/ (com teste),
 * porque é lá que as regras de negócio moram. O servidor não grava nada.
 */
export async function atenderIA(req, res, recurso, montar) {
  if (req.method !== "POST") return res.status(405).json({ erro: "use POST" });
  const quem = await lojaDaSessao(req);
  if (!quem) return res.status(401).json({ erro: "Sua sessão expirou. Entre de novo e repita." });
  if (quem.bloqueada) {
    return res.status(403).json({ erro: "A assinatura desta loja está bloqueada. A IA volta quando regularizar." });
  }

  let pedido;
  try {
    pedido = montar(req.body || {});
  } catch (e) {
    return res.status(400).json({ erro: e instanceof Error ? e.message : String(e) });
  }

  const credito = await gastarCredito(quem, recurso);
  if (!credito.ok) {
    return res.status(429).json({
      erro:
        `A loja já usou as ${credito.limite} ${NOME_DO_RECURSO[recurso] || "chamadas"} ` +
        `deste mês no plano ${quem.plano}. ` +
        "Volta no dia 1º, ou fale com o suporte para mudar de plano.",
      limite: credito.limite,
    });
  }

  try {
    const bruto = await perguntarAoGemini(pedido);
    return res.status(200).json({ bruto, usados: credito.usados, limite: credito.limite });
  } catch (e) {
    await devolverCredito(quem, recurso);
    console.error("IA:", recurso, e?.message || e);
    return res.status(502).json({ erro: e instanceof Error ? e.message : String(e) });
  }
}
