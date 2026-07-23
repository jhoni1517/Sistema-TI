// ============================================================
// Robô do WhatsApp — recebe mensagens e lança no caixa (Supabase)
// Endpoint: /api/whatsapp
//   GET  -> verificação do webhook (Meta)
//   POST -> mensagem recebida -> registra despesa/entrada
//
// Variáveis de ambiente necessárias (no Vercel):
//   WHATSAPP_VERIFY_TOKEN  -> um texto secreto que você inventa
//   WHATSAPP_TOKEN         -> token de acesso da Meta (WhatsApp Cloud API)
//   WHATSAPP_PHONE_ID      -> ID do número (Phone number ID)
//   WHATSAPP_ALLOWED_FROM  -> (opcional) seu número, ex: 5599999999999
//   VITE_SUPABASE_URL      -> já existe (URL do Supabase)
//   VITE_SUPABASE_ANON_KEY -> já existe (chave do Supabase)
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// Interpreta a mensagem: define tipo, valor e descrição
function parseMensagem(textoOriginal) {
  let texto = (textoOriginal || "").trim();
  if (!texto) return null;

  let tipo = "saida";
  const low = texto.toLowerCase();
  if (low.startsWith("+") || low.startsWith("entrada")) {
    tipo = "entrada";
    texto = texto.replace(/^\+/, "").replace(/^entrada/i, "").trim();
  } else if (low.startsWith("sangria")) {
    tipo = "sangria";
    texto = texto.replace(/^sangria/i, "").trim();
  } else if (low.startsWith("-") || low.startsWith("despesa")) {
    tipo = "saida";
    texto = texto.replace(/^-/, "").replace(/^despesa/i, "").trim();
  }

  // primeiro número da mensagem = valor (aceita 5, 5.50 ou 5,50)
  const m = texto.match(/(\d+(?:[.,]\d{1,2})?)/);
  if (!m) return null;
  const valor = parseFloat(m[1].replace(",", "."));
  if (!valor || valor <= 0) return null;

  // descrição = o texto sem o número
  let descricao = texto.replace(m[0], "").replace(/\s+/g, " ").trim();
  if (!descricao) descricao = tipo === "entrada" ? "Entrada via WhatsApp" : "Despesa via WhatsApp";

  const categoria = tipo === "entrada" ? "Venda" : tipo === "sangria" ? "Sangria" : "Despesa";
  return { tipo, valor, descricao, categoria };
}

async function registrarMovimento(mov) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/movimentos`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify([
      {
        id: uid(),
        tipo: mov.tipo,
        categoria: mov.categoria,
        descricao: mov.descricao + " (WhatsApp)",
        valor: mov.valor,
        formaPagamento: "dinheiro",
        data: new Date().toISOString(),
      },
    ]),
  });
  if (!res.ok) throw new Error("Supabase: " + res.status + " " + (await res.text()));
}

async function responder(to, texto) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) return;
  await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      text: { body: texto },
    }),
  }).catch(() => {});
}

const brl = (v) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function handler(req, res) {
  // ---- Verificação do webhook (Meta chama com GET) ----
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
    const body = req.body || {};
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    const msg = value?.messages?.[0];

    // Sempre responde 200 rápido para a Meta não reenviar
    if (!msg || msg.type !== "text") return res.status(200).json({ ok: true });

    const from = msg.from;
    const texto = msg.text?.body || "";

    // (opcional) só aceita do número autorizado
    const allowed = process.env.WHATSAPP_ALLOWED_FROM;
    if (allowed && from !== allowed.replace(/\D/g, "")) {
      await responder(from, "Número não autorizado a lançar despesas.");
      return res.status(200).json({ ok: true });
    }

    const parsed = parseMensagem(texto);
    if (!parsed) {
      await responder(
        from,
        "Não entendi 🤔\nEnvie assim:\n• café 5\n• luz 230 conta de energia\n• +100 venda avulsa (entrada)"
      );
      return res.status(200).json({ ok: true });
    }

    await registrarMovimento(parsed);

    const emoji = parsed.tipo === "entrada" ? "🟢" : "🔴";
    const rotulo = parsed.tipo === "entrada" ? "Entrada" : parsed.tipo === "sangria" ? "Sangria" : "Despesa";
    await responder(
      from,
      `${emoji} ${rotulo} registrada!\n${parsed.descricao} — ${brl(parsed.valor)}`
    );

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("Erro no webhook:", e);
    return res.status(200).json({ ok: false });
  }
}
