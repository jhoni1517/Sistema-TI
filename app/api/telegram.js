// ============================================================
// Robô do Telegram — recebe mensagens e lança no caixa
// Endpoint: /api/telegram
//
// Variáveis de ambiente no Vercel:
//   TELEGRAM_TOKEN    -> token do bot criado no @BotFather
//   TELEGRAM_CHAT_ID  -> (opcional) seu chat id, para só você poder lançar
//   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY -> já existem
// ============================================================

import {
  parseMensagem,
  registrarMovimento,
  resumoCaixa,
  brl,
  AJUDA,
} from "./_caixa.js";

const TOKEN = process.env.TELEGRAM_TOKEN;

async function responder(chatId, texto) {
  if (!TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: texto }),
    });
  } catch {
    /* ignora falha de envio */
  }
}

export default async function handler(req, res) {
  // GET no navegador: mostra instruções e ajuda a configurar
  if (req.method === "GET") {
    const base = `https://${req.headers.host}`;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    return res.status(200).send(
      "Robô do Telegram do Sistema TI\n\n" +
        `Token configurado: ${TOKEN ? "sim" : "NÃO — falta TELEGRAM_TOKEN no Vercel"}\n` +
        `Restrito ao chat: ${process.env.TELEGRAM_CHAT_ID || "não (qualquer pessoa que achar o bot pode lançar)"}\n\n` +
        "Para ligar o robô, abra este endereço uma vez no navegador\n" +
        "(troque SEU_TOKEN pelo token do BotFather):\n\n" +
        `https://api.telegram.org/botSEU_TOKEN/setWebhook?url=${base}/api/telegram\n`
    );
  }

  if (req.method !== "POST") return res.status(405).end();

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const msg = body.message || body.edited_message;
    const texto = msg?.text;
    const chatId = msg?.chat?.id;
    if (!texto || !chatId) return res.status(200).json({ ok: true });

    // Restringe a um chat, se configurado
    const permitido = process.env.TELEGRAM_CHAT_ID;
    if (permitido && String(chatId) !== String(permitido).trim()) {
      await responder(chatId, "Este bot é de uso restrito.");
      return res.status(200).json({ ok: true });
    }

    const cmd = texto.trim().toLowerCase();

    if (cmd === "/start" || cmd === "/ajuda" || cmd === "/help") {
      await responder(
        chatId,
        `Tudo certo! Seu chat id é ${chatId}.\n\n${AJUDA}`
      );
      return res.status(200).json({ ok: true });
    }

    if (cmd === "/saldo" || cmd === "/hoje") {
      try {
        const r = await resumoCaixa();
        await responder(
          chatId,
          "Caixa de hoje\n\n" +
            `Entradas: ${brl(r.entradas)}\n` +
            `Saídas: ${brl(r.saidas)}\n` +
            `Sangrias: ${brl(r.sangrias)}\n` +
            `Saldo: ${brl(r.saldo)}\n\n` +
            `${r.qtd} movimentação(ões) hoje`
        );
      } catch (e) {
        await responder(chatId, "Não consegui consultar o caixa agora. " + e.message);
      }
      return res.status(200).json({ ok: true });
    }

    const parsed = parseMensagem(texto);
    if (!parsed) {
      await responder(chatId, "Não entendi.\n\n" + AJUDA);
      return res.status(200).json({ ok: true });
    }

    try {
      await registrarMovimento(parsed, "Telegram");
    } catch (e) {
      await responder(chatId, "Erro ao registrar: " + e.message);
      return res.status(200).json({ ok: false });
    }

    const rotulo =
      parsed.tipo === "entrada" ? "Entrada" : parsed.tipo === "sangria" ? "Sangria" : "Despesa";
    await responder(
      chatId,
      `${rotulo} registrada!\n${parsed.descricao} — ${brl(parsed.valor)}`
    );

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("Erro no webhook do Telegram:", e);
    return res.status(200).json({ ok: false });
  }
}
