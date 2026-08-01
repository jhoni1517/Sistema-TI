// ============================================================
// Robô do WhatsApp (Meta Cloud API) — opcional
// Endpoint: /api/whatsapp
//   GET  -> verificação do webhook
//   POST -> mensagem recebida -> registra no caixa
//
// Variáveis no Vercel: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID,
// WHATSAPP_VERIFY_TOKEN e (opcional) WHATSAPP_ALLOWED_FROM
// ============================================================

import { parseMensagem, registrarMovimento, brl, AJUDA } from "./_caixa.js";

/**
 * Responde no WhatsApp, e DIZ quando não conseguiu.
 *
 * Mesmo problema que o robô do Telegram tinha: token faltando e `catch {}`
 * vazio. A mensagem chegava, o lançamento entrava no caixa e nada era
 * respondido — do lado de quem digitou, "o robô parou". E quem não recebe
 * confirmação repete, então o mesmo gasto entrava duas ou três vezes.
 *
 * O registro da função é o único canal que sobra quando o canal de resposta
 * é justamente o que está quebrado.
 */
async function responder(to, texto) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) {
    console.error(
      "WhatsApp: nada foi respondido porque falta WHATSAPP_TOKEN ou " +
        "WHATSAPP_PHONE_ID no Vercel. O lançamento pode ter sido gravado."
    );
    return false;
  }
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        text: { body: texto },
      }),
    });
    if (!r.ok) {
      console.error(`WhatsApp recusou a resposta (${r.status}): ${await r.text()}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("WhatsApp: falha de rede ao responder:", e?.message || e);
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send("Forbidden");
  }

  if (req.method !== "POST") return res.status(405).end();

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    const msg = value?.messages?.[0];
    if (!msg || msg.type !== "text") return res.status(200).json({ ok: true });

    const from = msg.from;
    const texto = msg.text?.body || "";

    const allowed = process.env.WHATSAPP_ALLOWED_FROM;
    if (allowed && from !== allowed.replace(/\D/g, "")) {
      return res.status(200).json({ ok: true });
    }

    const parsed = parseMensagem(texto);
    if (!parsed) {
      await responder(from, "Não entendi.\n\n" + AJUDA);
      return res.status(200).json({ ok: true });
    }

    try {
      await registrarMovimento(parsed, "WhatsApp");
    } catch (e) {
      await responder(from, "Erro ao registrar: " + e.message);
      return res.status(200).json({ ok: false });
    }

    const rotulo =
      parsed.tipo === "entrada" ? "Entrada" : parsed.tipo === "sangria" ? "Sangria" : "Despesa";
    await responder(from, `${rotulo} registrada!\n${parsed.descricao} - ${brl(parsed.valor)}`);

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("Erro no webhook do WhatsApp:", e);
    return res.status(200).json({ ok: false });
  }
}
