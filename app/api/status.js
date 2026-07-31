/**
 * Diagnóstico da instalação.
 *
 * PRECISA DE CHAVE. Antes ele respondia para qualquer um que abrisse o
 * endereço, e junto vinham os últimos lançamentos do caixa, o id do chat do
 * Telegram e o número do WhatsApp. Ou seja: um diagnóstico que era, na
 * prática, uma janela para dentro da loja. Página de diagnóstico aberta é
 * um clássico — some no meio do sistema e ninguém lembra que existe.
 *
 * Como abrir:
 *   https://SEU-SITE/api/status?chave=<o valor de CRON_SECRET>
 *
 * Sem a chave ele confirma só que a função está publicada, que é o que
 * interessa saber de fora.
 *
 * Nunca mostra o valor de chave nenhuma — só se existe.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const fim = (v) => (v ? "..." + String(v).slice(-6) : null);

/** Comparação de tamanho fixo, para não vazar o tamanho da chave pelo tempo. */
const iguais = (a, b) => {
  const x = String(a || "");
  const y = String(b || "");
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
};

export default async function handler(req, res) {
  const segredo = process.env.CRON_SECRET;
  const enviada =
    (req.query && req.query.chave) ||
    (req.headers.authorization || "").replace(/^Bearer\s+/i, "");

  if (!segredo || !iguais(enviada, segredo)) {
    res.setHeader("content-type", "application/json; charset=utf-8");
    return res.status(401).send(
      JSON.stringify(
        {
          funcao: "ok — a função está publicada e respondendo",
          diagnostico: segredo
            ? "protegido — abra com ?chave=<o valor de CRON_SECRET>"
            : "indisponível — falta CRON_SECRET nas variáveis do Vercel",
        },
        null,
        2
      )
    );
  }

  const out = {
    funcao: "ok — a função está publicada e respondendo",
    configuracao: {
      supabaseUrl: !!SUPABASE_URL,
      supabaseKey: !!SUPABASE_KEY,
      telegramToken: !!process.env.TELEGRAM_TOKEN,
      // Só se está definido. Imprimir o número não ajuda a diagnosticar
      // nada e transforma a página numa lista de para-onde-mandar.
      telegramChatId: !!process.env.TELEGRAM_CHAT_ID,
      whatsappToken: !!process.env.WHATSAPP_TOKEN,
      whatsappPhoneId: process.env.WHATSAPP_PHONE_ID || null,
      whatsappVerifyToken: !!process.env.WHATSAPP_VERIFY_TOKEN,
      tokenTerminaEm: fim(process.env.WHATSAPP_TOKEN),
      // O robô diário de cobrança e o gerador de link de senha usam a chave
      // de serviço. Sem ela nada dispara, e o silêncio parece "está tudo bem".
      supabaseServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      cronSecret: !!process.env.CRON_SECRET,
    },
    pendencias: [],
    banco: "não testado",
    telegram: "não testado",
    whatsapp: "não testado",
    ultimosLancamentos: 0,
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
        // A leitura aqui é com a chave PÚBLICA e sem ninguém logado. Vir
        // vazio é o resultado certo: prova que o RLS está barrando. Lista
        // cheia aqui seria o problema, não o contrário.
        out.banco =
          `ok — o banco respondeu. Vieram ${linhas.length} linha(s) com a chave pública` +
          (linhas.length === 0 ? "; vazio é o esperado, é o RLS barrando." : ".");
        // Só a contagem. O que prova que o RLS está barrando é o zero, não
        // o conteúdo — e página de diagnóstico que imprime lançamento vira
        // porta dos fundos no dia em que o RLS regride.
        out.ultimosLancamentos = linhas.length;
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

  // 4) Diz em português o que falta, com o efeito prático de cada falta.
  // Uma lista de true/false não ajuda quem está no meio da configuração.
  // Colar o NOME da variável no campo do valor é escorregão comum, e o erro
  // que aparece depois ("Failed to parse URL from ...") não entrega a causa.
  if (SUPABASE_URL && !/^https:\/\/[^/]+\.supabase\.co\/?$/.test(SUPABASE_URL.trim())) {
    out.pendencias.push(
      `SUPABASE_URL não parece um endereço do Supabase (recebi "${SUPABASE_URL}"). ` +
        "O valor certo é https://SEU-PROJETO.supabase.co, sem barra no fim."
    );
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    out.pendencias.push(
      "SUPABASE_SERVICE_ROLE_KEY não está no Vercel: o aviso diário de mensalidade e de contas a pagar não dispara, e 'Liberar senha' não funciona."
    );
  }
  if (!process.env.CRON_SECRET) {
    out.pendencias.push(
      "CRON_SECRET não está no Vercel: /api/cobranca fica aberto para qualquer um chamar."
    );
  }
  if (!process.env.TELEGRAM_CHAT_ID) {
    out.pendencias.push(
      "TELEGRAM_CHAT_ID não está no Vercel: o aviso diário não sabe para quem mandar."
    );
  }
  if (out.pendencias.length === 0) out.pendencias.push("nenhuma — está tudo configurado");

  res.setHeader("content-type", "application/json; charset=utf-8");
  res.status(200).send(JSON.stringify(out, null, 2));
}
