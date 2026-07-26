// Diagnóstico do robô do WhatsApp.
// Abra no navegador: https://SEU-SITE/api/status
// Mostra o que está configurado e testa a gravação no banco.
// Nunca expõe os valores das chaves — apenas se existem e um trecho final.

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const fim = (v) => (v ? "..." + String(v).slice(-6) : null);

export default async function handler(req, res) {
  const out = {
    funcao: "ok — a função está publicada e respondendo",
    configuracao: {
      supabaseUrl: !!SUPABASE_URL,
      supabaseKey: !!SUPABASE_KEY,
      telegramToken: !!process.env.TELEGRAM_TOKEN,
      telegramChatId: process.env.TELEGRAM_CHAT_ID || "(sem restrição)",
      whatsappToken: !!process.env.WHATSAPP_TOKEN,
      whatsappPhoneId: process.env.WHATSAPP_PHONE_ID || null,
      whatsappVerifyToken: !!process.env.WHATSAPP_VERIFY_TOKEN,
      tokenTerminaEm: fim(process.env.WHATSAPP_TOKEN),
    },
    banco: "não testado",
    telegram: "não testado",
    whatsapp: "não testado",
    ultimosLancamentos: [],
  };

  // 1) Testa leitura/gravação no Supabase
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/movimentos?select=descricao,valor,data&order=data.desc&limit=5`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      if (r.ok) {
        const linhas = await r.json();
        out.banco = "ok — consegui ler a tabela de movimentos";
        out.ultimosLancamentos = linhas;
      } else {
        out.banco = `ERRO ao ler (${r.status}): ${await r.text()}`;
      }
    } catch (e) {
      out.banco = "ERRO de conexão: " + (e?.message || String(e));
    }
  } else {
    out.banco = "ERRO — faltam VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY no Vercel";
  }

  // 2) Testa o robô do Telegram
  const tg = process.env.TELEGRAM_TOKEN;
  if (tg) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${tg}/getWebhookInfo`);
      const body = await r.json();
      if (body?.ok) {
        const url = body.result?.url;
        out.telegram = url
          ? `ok — bot ligado e recebendo em ${url}`
          : "token válido, mas o webhook AINDA NÃO foi ligado (falta abrir o link setWebhook)";
        if (body.result?.last_error_message) {
          out.telegram += ` | último erro: ${body.result.last_error_message}`;
        }
      } else {
        out.telegram = "ERRO — token do Telegram inválido";
      }
    } catch (e) {
      out.telegram = "ERRO de conexão com o Telegram: " + (e?.message || String(e));
    }
  } else {
    out.telegram = "falta TELEGRAM_TOKEN no Vercel";
  }

  // 3) Testa se o token do WhatsApp ainda é válido
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (token && phoneId) {
    try {
      const r = await fetch(
        `https://graph.facebook.com/v21.0/${phoneId}?fields=display_phone_number,verified_name`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const body = await r.json();
      if (r.ok) {
        out.whatsapp = `ok — token válido (número ${body.display_phone_number || "?"})`;
      } else {
        out.whatsapp = `ERRO — token inválido ou expirado. Gere um novo na Meta e atualize WHATSAPP_TOKEN no Vercel. Detalhe: ${body?.error?.message || r.status}`;
      }
    } catch (e) {
      out.whatsapp = "ERRO de conexão com a Meta: " + (e?.message || String(e));
    }
  } else {
    out.whatsapp = "ERRO — faltam WHATSAPP_TOKEN / WHATSAPP_PHONE_ID no Vercel";
  }

  res.setHeader("content-type", "application/json; charset=utf-8");
  res.status(200).send(JSON.stringify(out, null, 2));
}
