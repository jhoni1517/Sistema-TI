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
  ROTULO_FORMA,
} from "./_caixa.js";

const TOKEN = process.env.TELEGRAM_TOKEN;

/**
 * Responde no chat, e DIZ quando não conseguiu.
 *
 * A versão anterior tinha `if (!TOKEN) return;` e um `catch {}` vazio. Com o
 * TELEGRAM_TOKEN faltando ou errado no Vercel, o robô continuava recebendo a
 * mensagem (o webhook é da Telegram para cá, não precisa do token), gravava o
 * lançamento no caixa normalmente e simplesmente não respondia nada.
 *
 * Do lado de quem digitou, isso é "o robô parou". Do lado do sistema, era
 * sucesso silencioso — e o lançamento entrava duas, três vezes, porque quem
 * não recebe confirmação repete.
 *
 * Agora a falha vai para o registro da função, que é o único canal que sobra
 * quando o canal de resposta é justamente o que está quebrado.
 */
async function responder(chatId, texto) {
  if (!TOKEN) {
    console.error(
      "Telegram: nada foi respondido porque falta TELEGRAM_TOKEN no Vercel. " +
        "O lançamento pode ter sido gravado mesmo assim."
    );
    return false;
  }
  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: texto }),
    });
    if (!r.ok) {
      console.error(`Telegram recusou a resposta (${r.status}): ${await r.text()}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("Telegram: falha de rede ao responder:", e?.message || e);
    return false;
  }
}

export default async function handler(req, res) {
  // GET no navegador: mostra instruções e ajuda a configurar
  if (req.method === "GET") {
    const base = `https://${req.headers.host}`;
    res.setHeader("content-type", "text/plain; charset=utf-8");

    /*
     * Testa o token DE VERDADE, chamando a Telegram.
     *
     * Antes esta página só dizia se a variável existia. Token errado ou
     * revogado passava por "sim" — e o sintoma no balcão era o robô gravar
     * o lançamento e não responder nada, sem nenhum lugar onde olhar.
     */
    let situacao = "NÃO — falta TELEGRAM_TOKEN no Vercel";
    let webhook = "não dá para conferir sem o token";
    if (TOKEN) {
      try {
        const eu = await fetch(`https://api.telegram.org/bot${TOKEN}/getMe`);
        const corpo = await eu.json();
        situacao = corpo?.ok
          ? `sim, e VALIDO (bot @${corpo.result?.username})`
          : `sim, mas RECUSADO pela Telegram: ${corpo?.description || eu.status}. ` +
            "O token foi trocado ou revogado — pegue o atual no BotFather.";
      } catch (e) {
        situacao = "sim, mas não consegui falar com a Telegram: " + (e?.message || e);
      }
      try {
        const w = await fetch(`https://api.telegram.org/bot${TOKEN}/getWebhookInfo`);
        const corpo = await w.json();
        const r = corpo?.result;
        webhook = r?.url
          ? `recebendo em ${r.url}` +
            (r.last_error_message ? ` | ultimo erro: ${r.last_error_message}` : "")
          : "NAO ligado — abra o link de setWebhook abaixo";
      } catch {
        webhook = "não consegui conferir";
      }
    }

    return res.status(200).send(
      "Robô do Telegram do Sistema TI\n\n" +
        `Token: ${situacao}\n` +
        `Webhook: ${webhook}\n` +
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
      `${rotulo} registrada!\n${parsed.descricao} — ${brl(parsed.valor)}` +
      `\nForma: ${ROTULO_FORMA[parsed.forma] || parsed.forma}`
    );

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("Erro no webhook do Telegram:", e);
    return res.status(200).json({ ok: false });
  }
}
