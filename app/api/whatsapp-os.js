// ============================================================
//  Aviso de status da OS pelo WhatsApp — Cloud API da Meta (sem BSP)
//  Endpoint: /api/whatsapp-os?acao=...
//
//    acao=credencial  POST  o dono grava phone_id e token (plano completo)
//                     GET   diz se está configurado, sem devolver o token
//    acao=avisar      POST  { osId, status } — a tela chama ao mudar o status
//
// Só o plano COMPLETO manda sozinho: cada conversa é cobrada pela Meta. No
// essencial o botão wa.me de sempre continua sendo o caminho.
//
// Variáveis no Vercel: as mesmas do Pix (SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_ANON_KEY, PIX_CHAVE_CRIPTO) e,
// opcional, SITE_URL para o link de acompanhamento.
// ============================================================
//
// NUNCA DUAS VEZES O MESMO STATUS
//
// 1. O envio tem id OS + status, e o banco recusa a linha repetida.
// 2. Antes de mandar, o envio é RESERVADO ("enviando") com um PATCH que só
//    pega linha pendente ou que falhou. Duas chamadas juntas: só uma pega.
// 3. Se a função morrer depois de mandar e antes de anotar, a linha fica em
//    "enviando" e NÃO é tentada de novo. Entre avisar duas vezes e deixar
//    um aviso sem confirmação, o segundo é o menor erro — o botão wa.me
//    continua ali para quem quiser reforçar.

import { lojaDaSessao, sb } from "./_ia.js";
import { cifrar, decifrar } from "./_cofre.js";

const CHAVE_CRIPTO = process.env.PIX_CHAVE_CRIPTO;
const GRAPH = "https://graph.facebook.com/v21.0";

/**
 * O modelo aprovado na Meta para cada status. MESMOS nomes de
 * src/lib/whatsapp-os.ts — whatsapp-os.test.ts reprova se divergirem.
 */
const MODELO_POR_STATUS = {
  aberta: "os_recebida",
  aguardando_aprovacao: "os_orcamento_pronto",
  aguardando_peca: "os_aguardando_peca",
  pronta: "os_pronta",
  entregue: "os_entregue",
};

/** Mesmo teto de src/lib/whatsapp-os.ts */
const MAXIMO_DE_TENTATIVAS = 5;

/** Quantos da fila cada chamada tenta, para caber nos 15 s da função */
const LOTE = 5;

function numeroWhatsapp(telefone) {
  let d = String(telefone || "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return "";
  return `55${d}`;
}

function codigoOS(numero) {
  return `OS${String(numero).padStart(5, "0")}`;
}

async function credencialDaLoja(lojaId) {
  const [c] = (await sb(`whatsapp_credencial?select=phone_id,token_cifrado&lojaId=eq.${lojaId}`)) || [];
  if (!c) return null;
  return { phoneId: c.phone_id, token: decifrar(c.token_cifrado, CHAVE_CRIPTO) };
}

/** Manda um modelo. Devolve o id da mensagem na Meta, ou lança o erro dela. */
async function mandarModelo(cred, envio) {
  const r = await fetch(`${GRAPH}/${encodeURIComponent(cred.phoneId)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cred.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: envio.telefone,
      type: "template",
      template: {
        name: envio.modelo,
        language: { code: "pt_BR" },
        components: [
          {
            type: "body",
            parameters: (envio.parametros || []).map((t) => ({ type: "text", text: String(t) })),
          },
        ],
      },
    }),
  });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(corpo?.error?.message || `Meta respondeu ${r.status}`);
  return corpo?.messages?.[0]?.id || "";
}

/**
 * Tenta a fila da loja: o que está pendente ou falhou e ainda tem tentativa.
 * Cada chamada de "avisar" passa por aqui — é assim que a falha de ontem é
 * tentada de novo sem precisar de cron (o Hobby da Vercel só tem dois, e os
 * dois já estão usados).
 */
async function processarFila(lojaId, cred) {
  const fila =
    (await sb(
      `whatsapp_envios?select=*&lojaId=eq.${lojaId}&situacao=in.(pendente,falhou)` +
        `&tentativas=lt.${MAXIMO_DE_TENTATIVAS}&order=criadoEm.asc&limit=${LOTE}`
    )) || [];
  const resultado = { enviados: 0, falhas: 0 };
  for (const e of fila) {
    // Reserva: só pega se ainda estiver pendente/falhou. Quem chegar
    // depois recebe lista vazia e não manda.
    const [meu] =
      (await sb(`whatsapp_envios?id=eq.${encodeURIComponent(e.id)}&situacao=in.(pendente,falhou)`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ situacao: "enviando", tentativas: (Number(e.tentativas) || 0) + 1 }),
      })) || [];
    if (!meu) continue;
    try {
      const mensagemId = await mandarModelo(cred, meu);
      await sb(`whatsapp_envios?id=eq.${encodeURIComponent(e.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ situacao: "enviado", mensagemId, erro: null, enviadoEm: new Date().toISOString() }),
      });
      resultado.enviados++;
    } catch (err) {
      const acabou = Number(meu.tentativas) >= MAXIMO_DE_TENTATIVAS;
      await sb(`whatsapp_envios?id=eq.${encodeURIComponent(e.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          situacao: acabou ? "desistiu" : "falhou",
          erro: String(err?.message || err).slice(0, 300),
        }),
      });
      resultado.falhas++;
    }
  }
  return resultado;
}

async function acaoCredencial(req, res, quem) {
  if (req.method === "GET") {
    const [c] = (await sb(`whatsapp_credencial?select=conta,atualizadoEm&lojaId=eq.${quem.lojaId}`)) || [];
    return res.status(200).json({ configurado: !!c, conta: c?.conta || "", plano: quem.plano });
  }
  if (quem.papel !== "dono") return res.status(403).json({ erro: "Só o dono da loja pode ligar o WhatsApp automático." });
  if (quem.plano !== "completo") {
    return res.status(403).json({ erro: "O WhatsApp automático é do plano Completo. Fale com o suporte para mudar de plano." });
  }
  if (!CHAVE_CRIPTO) return res.status(500).json({ erro: "Falta PIX_CHAVE_CRIPTO nas variáveis da Vercel." });

  const phoneId = String(req.body?.phoneId || "").replace(/\D/g, "");
  const token = String(req.body?.token || "").trim();
  if (!phoneId || !token) return res.status(400).json({ erro: "Preencha o Phone number ID e o token." });

  // Confere na Meta ANTES de gravar: token errado gravado só apareceria no
  // primeiro "tá pronto" que não chegou.
  const r = await fetch(`${GRAPH}/${phoneId}?fields=display_phone_number,verified_name`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    return res.status(400).json({
      erro: "A Meta recusou este número ou token: " + (d?.error?.message || `status ${r.status}`),
    });
  }
  const conta = [d.display_phone_number, d.verified_name].filter(Boolean).join(" - ");
  await sb("whatsapp_credencial?on_conflict=lojaId", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([
      { lojaId: quem.lojaId, phone_id: phoneId, token_cifrado: cifrar(token, CHAVE_CRIPTO), conta, atualizadoEm: new Date().toISOString() },
    ]),
  });
  return res.status(200).json({ ok: true, conta });
}

async function acaoAvisar(req, res, quem) {
  // Plano essencial ou loja sem número: responde rápido e calado. A tela
  // chama em toda mudança de status, e o botão wa.me continua lá.
  if (quem.plano !== "completo") return res.status(200).json({ ignorado: "plano" });
  const osId = String(req.body?.osId || "");
  const status = String(req.body?.status || "");
  const modelo = MODELO_POR_STATUS[status];
  if (!osId || !modelo) return res.status(200).json({ ignorado: "status sem aviso" });

  const [cred0] = (await sb(`whatsapp_credencial?select=lojaId&lojaId=eq.${quem.lojaId}`)) || [];
  if (!cred0) return res.status(200).json({ ignorado: "sem número configurado" });
  const cred = await credencialDaLoja(quem.lojaId);

  const [ordem] =
    (await sb(
      `ordens?select=id,numero,status,clienteId,marca,modelo,rastreio` +
        `&lojaId=eq.${quem.lojaId}&id=eq.${encodeURIComponent(osId)}`
    )) || [];
  if (!ordem) return res.status(404).json({ erro: "OS não encontrada." });
  // O status tem que ser o de AGORA: clique rápido em dois status não pode
  // mandar o aviso do que já passou.
  if (ordem.status !== status) return res.status(200).json({ ignorado: "status mudou" });

  const [cliente] = (await sb(`clientes?select=nome,telefone&id=eq.${encodeURIComponent(ordem.clienteId || "")}`)) || [];
  const telefone = numeroWhatsapp(cliente?.telefone);
  if (!telefone) return res.status(200).json({ ignorado: "cliente sem telefone com DDD" });

  const site = process.env.SITE_URL || `https://${req.headers.host}`;
  const link = ordem.rastreio
    ? `${site}/#/rastreio/${codigoOS(ordem.numero)}?loja=${quem.lojaId}&t=${encodeURIComponent(ordem.rastreio)}`
    : site;
  const primeiro = String(cliente?.nome || "").trim().split(/\s+/)[0] || "cliente";
  const aparelho = [ordem.marca, ordem.modelo].filter(Boolean).join(" ").trim() || "aparelho";

  const id = `${ordem.id}:${status}`;
  const novos = await sb("whatsapp_envios?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify([
      {
        id,
        lojaId: quem.lojaId,
        osId: ordem.id,
        status,
        modelo,
        telefone,
        parametros: [primeiro, codigoOS(ordem.numero), aparelho, link],
      },
    ]),
  });
  const jaExistia = !(Array.isArray(novos) && novos.length > 0);

  const fila = await processarFila(quem.lojaId, cred);
  const [agora] = (await sb(`whatsapp_envios?select=situacao,erro&id=eq.${encodeURIComponent(id)}`)) || [];
  return res.status(200).json({ ok: true, jaExistia, situacao: agora?.situacao, erro: agora?.erro || "", ...fila });
}

export default async function handler(req, res) {
  const acao = String(req.query?.acao || "");
  try {
    const quem = await lojaDaSessao(req);
    if (!quem) return res.status(401).json({ erro: "Sua sessão expirou. Entre de novo e repita." });
    if (acao === "credencial") return await acaoCredencial(req, res, quem);
    if (acao === "avisar" && req.method === "POST") return await acaoAvisar(req, res, quem);
    return res.status(404).json({ erro: "ação desconhecida" });
  } catch (e) {
    console.error("WhatsApp OS:", acao, e?.message || e);
    return res.status(500).json({ erro: e instanceof Error ? e.message : String(e) });
  }
}
