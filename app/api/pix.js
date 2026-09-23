// ============================================================
//  Pix da OS pelo link do cliente — Mercado Pago
//  Endpoint: /api/pix?acao=...
//
//    acao=credencial  POST  o dono grava o Access Token (sessão da loja)
//                     GET   diz se está configurado, sem nunca devolver o token
//    acao=status      GET   a página do cliente: dá para pagar? já pagou?
//    acao=gerar       POST  a página do cliente pede o QR
//    acao=webhook     POST  o Mercado Pago avisa que o pagamento mudou
//
// Uma função só, e não quatro arquivos: o plano Hobby da Vercel tem teto de
// funções, e cada arquivo em api/ conta uma.
// ============================================================
//
// ------------------------------------------------------------
// O QUE ESTE ARQUIVO NUNCA FAZ
//
// - Nunca aceita VALOR vindo do navegador. O valor sai da OS gravada no
//   banco, pela mesma regra de lib/orcamento.ts (ver `valorDaOS`, com teste
//   de paridade em src/lib/pix.cron.test.ts). Senão qualquer um pagaria
//   R$ 1 por um conserto de R$ 800 editando a chamada.
// - Nunca acredita no corpo do aviso do Mercado Pago. O aviso só traz o id;
//   o pagamento é LIDO de novo na API do Mercado Pago com o token da loja.
//   Um aviso forjado dizendo "pago" não passa daqui.
// - Nunca lança duas vezes. O lançamento no caixa tem id fixo,
//   `pix-<id do pagamento>`, gravado com "ignore-duplicates": o Mercado Pago
//   repete o aviso (ele repete, e muito), a página consulta o status junto,
//   e o banco recusa a segunda linha sozinho.
// ------------------------------------------------------------
//
// Variáveis de ambiente no Vercel:
//   SUPABASE_URL                -> mesma do VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   -> chave "service_role" (Settings -> API)
//   VITE_SUPABASE_ANON_KEY      -> valida a sessão do dono ao gravar o token
//   PIX_CHAVE_CRIPTO            -> 32 bytes em base64; cifra o token da loja
//   SITE_URL (opcional)         -> endereço do site para o aviso do Mercado
//                                  Pago. Sem ela, usa o do próprio pedido.
//   TELEGRAM_TOKEN              -> o mesmo robô dos lembretes diários: avisa
//                                  o chat DA LOJA quando o Pix cai.
//
// O Access Token de CADA LOJA não é variável de ambiente: cada loja recebe
// na conta dela, e o token mora cifrado em `pix_credencial`.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || SERVICE_KEY;
const CHAVE_CRIPTO = process.env.PIX_CHAVE_CRIPTO;
const MP = "https://api.mercadopago.com";
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

/**
 * Em que status o link oferece o Pix.
 *
 * Só depois de o cliente aprovar: antes disso não existe valor combinado, e
 * cobrar orçamento que ninguém aceitou é o jeito mais rápido de perder o
 * cliente. Entregue e cancelada também não — a primeira já foi resolvida
 * no balcão, a segunda não tem o que cobrar.
 */
const STATUS_QUE_PAGAM = ["aprovada", "em_reparo", "aguardando_peca", "pronta"];

/** Quanto tempo o QR vale. Depois disso gera outro, com o valor de agora. */
const MINUTOS_DO_QR = 30;

/* ------------------------------------------------------------------ */
/* Dinheiro — a MESMA conta de lib/orcamento.ts e lib/calc.ts          */
/* ------------------------------------------------------------------ */

function centavos(v) {
  const n = Number(v) || 0;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100 + 0;
}

/**
 * O total do serviço com o orçamento que vale agora.
 *
 * Peça sem `opcao` entra sempre; peça com `opcao` só quando é a escolhida;
 * sem escolha registrada vale a primeira opção, que é a sugestão da loja.
 * É `totalOS` de lib/calc.ts reescrito em JavaScript, porque função da
 * Vercel não importa TypeScript — e pix.cron.test.ts sorteia centenas de
 * OS e reprova se as duas divergirem num centavo.
 *
 * A taxa de guarda NÃO entra: ela depende de quantos dias o aparelho ficou
 * parado até o dia da RETIRADA, e é cobrada no balcão.
 */
function valorDaOS(o) {
  const pecas = Array.isArray(o.pecas) ? o.pecas : [];
  const nomes = [];
  for (const p of pecas) {
    const nome = String((p && p.opcao) || "").trim();
    if (nome && !nomes.includes(nome)) nomes.push(nome);
  }
  const marcada = String(o.opcaoEscolhida || "").trim();
  const atual = nomes.includes(marcada) ? marcada : nomes[0] || "";
  let soma = 0;
  for (const p of pecas) {
    const nome = String((p && p.opcao) || "").trim();
    if (nome && nome !== atual) continue;
    soma += (Number(p.precoUnit) || 0) * (Number(p.quantidade) || 0);
  }
  return soma + (Number(o.maoDeObra) || 0) - (Number(o.desconto) || 0);
}

/**
 * Quanto falta pagar: o serviço menos o que já entrou por esta OS.
 *
 * O sinal pago no balcão abate daqui, pela mesma razão de lá: sem isso o
 * cliente pagaria o total de novo pelo link.
 */
function aPagar(ordem, movimentos) {
  const recebido = (movimentos || [])
    .filter((m) => m.tipo === "entrada")
    .reduce((s, m) => s + (Number(m.valor) || 0), 0);
  return centavos(Math.max(0, centavos(valorDaOS(ordem)) - centavos(recebido)));
}

function codigoOS(numero) {
  return `OS${String(numero).padStart(5, "0")}`;
}

/**
 * O lançamento que o pagamento aprovado vira no caixa.
 *
 * O id é FIXO por pagamento, e é isso que faz o aviso repetido não lançar
 * duas vezes. Custo zero: o aparelho ainda não saiu, e o custo das peças é
 * lançado na entrega (ver `lancamentoParaOCusto` em lib/os-pagamento.ts) —
 * é a mesma regra do sinal no balcão.
 */
function movimentoDoPix(pagamento, ordem, nomeCliente, sessaoId, lojaId) {
  return {
    id: `pix-${pagamento.id}`,
    lojaId,
    tipo: "entrada",
    categoria: "OS",
    descricao:
      `${codigoOS(ordem.numero)} - ${nomeCliente || "Cliente"}` + " (Pix pelo link)",
    valor: centavos(pagamento.transaction_amount),
    formaPagamento: "pix",
    osId: ordem.id,
    custoRelacionado: 0,
    data: pagamento.date_approved || new Date().toISOString(),
    sessaoId: sessaoId || null,
  };
}

/**
 * O recado do Pix que caiu, para o Telegram da loja.
 *
 * Texto puro, sem Markdown e sem emoji: nome de cliente com "_" ou "*"
 * quebrava a formatação do Telegram e a mensagem inteira era recusada — e
 * emoji chega como "?" em aparelho velho.
 */
function recadoDoPix(movimento, numero, nomeCliente) {
  const valor = Number(movimento.valor || 0).toFixed(2).replace(".", ",");
  return (
    `Pix recebido: R$ ${valor}\n` +
    `${codigoOS(numero)}${nomeCliente ? ` - ${nomeCliente}` : ""}\n` +
    "Pago pelo link de acompanhamento. Já está no caixa."
  );
}

/**
 * Avisa o chat do Telegram DA LOJA. Loja sem chat configurado não recebe
 * nada — o mesmo silêncio dos lembretes diários, que é o lado seguro.
 *
 * Falha aqui NUNCA derruba o pagamento: o dinheiro já entrou no caixa, e
 * responder erro ao Mercado Pago faria ele repetir o aviso por dias. Vai
 * para o log da Vercel, que é o canal que sobra quando o de aviso quebra.
 */
async function avisarLoja(lojaId, texto) {
  if (!TELEGRAM_TOKEN) return false;
  try {
    const [cfg] = (await sb(`configuracoes?select=dados&id=eq.${lojaId}`)) || [];
    const chat = String(cfg?.dados?.telegramChatId || "").trim();
    if (!chat) return false;
    const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: texto }),
    });
    if (!r.ok) console.error("Pix: Telegram recusou o aviso", r.status, await r.text());
    return r.ok;
  } catch (e) {
    console.error("Pix: falha ao avisar no Telegram", e?.message || e);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Cofre do token                                                      */
/* ------------------------------------------------------------------ */

/**
 * AES-256-GCM: cifra E confere. Um token trocado no banco por outra pessoa
 * não decifra — o GCM recusa em vez de devolver lixo.
 */
function cifrar(texto, chaveB64) {
  const chave = Buffer.from(String(chaveB64 || ""), "base64");
  if (chave.length !== 32) throw new Error("PIX_CHAVE_CRIPTO precisa ter 32 bytes em base64.");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave, iv);
  const corpo = Buffer.concat([c.update(String(texto), "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), corpo.toString("base64")].join(":");
}

function decifrar(guardado, chaveB64) {
  const [versao, iv, tag, corpo] = String(guardado || "").split(":");
  if (versao !== "v1") throw new Error("Token do Pix gravado num formato desconhecido.");
  const chave = Buffer.from(String(chaveB64 || ""), "base64");
  const d = createDecipheriv("aes-256-gcm", chave, Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(corpo, "base64")), d.final()]).toString("utf8");
}

/* ------------------------------------------------------------------ */
/* Conversa com o banco e com o Mercado Pago                           */
/* ------------------------------------------------------------------ */

async function sb(caminho, opcoes = {}) {
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

async function mp(token, caminho, opcoes = {}) {
  const r = await fetch(`${MP}${caminho}`, {
    ...opcoes,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(opcoes.headers || {}),
    },
  });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(corpo?.message || `Mercado Pago respondeu ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return corpo;
}

/** O token da loja, decifrado. Nulo = a loja não recebe Pix pelo link. */
async function tokenDaLoja(lojaId) {
  const [linha] = (await sb(`pix_credencial?select=token_cifrado&lojaId=eq.${lojaId}`)) || [];
  if (!linha?.token_cifrado) return null;
  return decifrar(linha.token_cifrado, CHAVE_CRIPTO);
}

/**
 * A OS pelo link público: loja, número E o segredo do link.
 *
 * Mesma porta de `consultar_os`: sem o segredo, quem recebeu um link
 * trocava o número e gerava Pix — ou lia valor — da fila inteira da loja.
 */
async function ordemDoLink(loja, numero, segredo) {
  if (!/^[0-9a-f-]{36}$/i.test(String(loja)) || !Number(numero) || !String(segredo || "").trim()) {
    return null;
  }
  const [o] =
    (await sb(
      `ordens?select=id,numero,status,pecas,maoDeObra,desconto,opcaoEscolhida,clienteId` +
        `&lojaId=eq.${loja}&numero=eq.${Number(numero)}` +
        `&rastreio=eq.${encodeURIComponent(String(segredo).trim())}&limit=1`
    )) || [];
  return o || null;
}

const movimentosDaOS = (lojaId, osId) =>
  sb(`movimentos?select=tipo,valor&lojaId=eq.${lojaId}&osId=eq.${encodeURIComponent(osId)}`);

async function sessaoAberta(lojaId) {
  const [s] =
    (await sb(`sessoes?select=id&fechadoEm=is.null&lojaId=eq.${lojaId}&order=abertoEm.desc&limit=1`)) ||
    [];
  return s?.id || null;
}

/**
 * O pagamento, lido DO MERCADO PAGO, virando dinheiro no caixa.
 *
 * Chamado pelo aviso e pela consulta de status da página — os dois podem
 * chegar juntos, e é por isso que o lançamento tem id fixo.
 *
 * A ordem é a da casa: o dinheiro entra PRIMEIRO, a anotação na cobrança
 * depois. Falhando no meio, sobra um lançamento com a cobrança ainda
 * "pendente" — que o próximo aviso ou a próxima consulta completa sem lançar
 * de novo. Ao contrário, a cobrança diria "paga" sem dinheiro nenhum no
 * caixa, e ninguém iria procurar.
 */
async function processarPagamento(lojaId, pagamento) {
  const [dono, osId] = String(pagamento.external_reference || "").split("|");
  // O pagamento tem que ser DESTA loja. Sem isto, um aviso com o id de um
  // pagamento de outra conta faria esta loja lançar dinheiro que não é dela.
  if (dono !== String(lojaId) || !osId) return { ok: false, motivo: "pagamento de outra loja" };

  const [ordem] =
    (await sb(`ordens?select=id,numero,clienteId&lojaId=eq.${lojaId}&id=eq.${encodeURIComponent(osId)}`)) ||
    [];
  if (!ordem) return { ok: false, motivo: "OS não encontrada" };

  if (pagamento.status !== "approved") {
    await sb(`pix_cobrancas?id=eq.${pagamento.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: String(pagamento.status || "pending") }),
    });
    return { ok: true, pago: false, status: pagamento.status };
  }

  const [cliente] =
    (await sb(`clientes?select=nome&id=eq.${encodeURIComponent(ordem.clienteId || "")}`)) || [];
  const movimento = movimentoDoPix(
    pagamento,
    ordem,
    cliente?.nome,
    await sessaoAberta(lojaId),
    lojaId
  );

  // `return=representation` devolve SÓ a linha que entrou agora. Aviso
  // repetido volta vazio — é assim que o Telegram também avisa uma vez só.
  const inseridos = await sb("movimentos?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify([movimento]),
  });
  const novo = Array.isArray(inseridos) && inseridos.length > 0;

  await sb(`pix_cobrancas?id=eq.${pagamento.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "approved",
      pagoEm: pagamento.date_approved || new Date().toISOString(),
      movimentoId: movimento.id,
    }),
  });
  if (novo) await avisarLoja(lojaId, recadoDoPix(movimento, ordem.numero, cliente?.nome));
  return { ok: true, pago: true, valor: movimento.valor, novo };
}

/* ------------------------------------------------------------------ */
/* As quatro ações                                                     */
/* ------------------------------------------------------------------ */

/** Quem está logado e de qual loja é. Só o dono mexe na conta da loja. */
async function donoDaSessao(req) {
  const sessao = String(req.headers.authorization || "").replace("Bearer ", "");
  if (!sessao) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${sessao}` },
  });
  if (!r.ok) return null;
  const usuario = await r.json();
  if (!usuario?.id) return null;
  const [perfil] =
    (await sb(`perfis?select=loja_id,papel,ativo&id=eq.${usuario.id}`)) || [];
  if (!perfil?.loja_id || perfil.ativo === false) return null;
  return { lojaId: String(perfil.loja_id), dono: perfil.papel === "dono" };
}

async function acaoCredencial(req, res) {
  const quem = await donoDaSessao(req);
  if (!quem) return res.status(401).json({ erro: "Sua sessão expirou. Entre de novo e repita." });

  if (req.method === "GET") {
    const [linha] =
      (await sb(`pix_credencial?select=conta,atualizadoEm&lojaId=eq.${quem.lojaId}`)) || [];
    return res.status(200).json({ configurado: !!linha, conta: linha?.conta || "", desde: linha?.atualizadoEm || "" });
  }

  if (!quem.dono) {
    return res.status(403).json({ erro: "Só o dono da loja pode ligar o Pix pelo link." });
  }
  if (!CHAVE_CRIPTO) {
    return res.status(500).json({
      erro: "Falta PIX_CHAVE_CRIPTO nas variáveis da Vercel. Sem ela o token não é gravado.",
    });
  }
  const token = String(req.body?.token || "").trim();
  if (!token) return res.status(400).json({ erro: "Cole o Access Token do Mercado Pago." });

  // Confere o token ANTES de gravar: token errado gravado só apareceria
  // quando o primeiro cliente tentasse pagar — o pior momento.
  let conta;
  try {
    const eu = await mp(token, "/users/me");
    conta = eu.nickname || eu.email || String(eu.id || "");
  } catch (e) {
    return res.status(400).json({
      erro:
        "O Mercado Pago recusou este token. Confira se copiou o Access Token de PRODUÇÃO " +
        "(começa com APP_USR-), e não a Public Key." +
        (e?.message ? ` (${e.message})` : ""),
    });
  }

  await sb("pix_credencial?on_conflict=lojaId", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([
      {
        lojaId: quem.lojaId,
        token_cifrado: cifrar(token, CHAVE_CRIPTO),
        conta,
        atualizadoEm: new Date().toISOString(),
      },
    ]),
  });
  return res.status(200).json({ ok: true, conta });
}

/** Dá para pagar? Já pagou? E, se tem QR válido, devolve ele. */
async function acaoStatus(req, res) {
  const { loja, numero, t } = req.query || {};
  const ordem = await ordemDoLink(loja, numero, t);
  if (!ordem) return res.status(404).json({ erro: "OS não encontrada." });

  const token = await tokenDaLoja(loja);
  if (!token) return res.status(200).json({ disponivel: false });

  // A página pergunta enquanto o QR está na tela. Se o aviso do Mercado
  // Pago se perdeu, é esta consulta que registra o pagamento.
  const pendentes =
    (await sb(
      `pix_cobrancas?select=id&lojaId=eq.${loja}&osId=eq.${encodeURIComponent(ordem.id)}` +
        `&status=eq.pending&order=criadoEm.desc&limit=3`
    )) || [];
  for (const c of pendentes) {
    try {
      await processarPagamento(loja, await mp(token, `/v1/payments/${c.id}`));
    } catch (e) {
      console.error("Pix: falha ao conferir pagamento", c.id, e?.message || e);
    }
  }

  const falta = aPagar(ordem, await movimentosDaOS(loja, ordem.id));
  return res.status(200).json({
    disponivel: STATUS_QUE_PAGAM.includes(ordem.status),
    valor: falta,
    pago: falta <= 0,
  });
}

async function acaoGerar(req, res) {
  const { loja, numero, t } = req.body || {};
  const ordem = await ordemDoLink(loja, numero, t);
  if (!ordem) return res.status(404).json({ erro: "OS não encontrada." });
  if (!STATUS_QUE_PAGAM.includes(ordem.status)) {
    return res.status(409).json({ erro: "Esta OS não está esperando pagamento." });
  }

  const token = await tokenDaLoja(loja);
  if (!token) return res.status(409).json({ erro: "Esta loja ainda não recebe Pix pelo link." });

  const valor = aPagar(ordem, await movimentosDaOS(loja, ordem.id));
  if (valor <= 0) return res.status(200).json({ pago: true });

  // QR ainda válido e do MESMO valor: devolve o mesmo. Gerar um novo a cada
  // toque deixaria dois QR abertos para a mesma OS — e o cliente que paga os
  // dois paga duas vezes.
  const agora = new Date();
  const [aberta] =
    (await sb(
      `pix_cobrancas?select=*&lojaId=eq.${loja}&osId=eq.${encodeURIComponent(ordem.id)}` +
        `&status=eq.pending&valor=eq.${valor}` +
        `&expiraEm=gt.${new Date(agora.getTime() + 2 * 60000).toISOString()}` +
        `&order=criadoEm.desc&limit=1`
    )) || [];
  if (aberta) {
    return res.status(200).json({
      id: aberta.id,
      valor: Number(aberta.valor),
      copiaECola: aberta.copiaECola,
      qrBase64: aberta.qrBase64,
      expiraEm: aberta.expiraEm,
    });
  }

  const site = process.env.SITE_URL || `https://${req.headers.host}`;
  const expira = new Date(agora.getTime() + MINUTOS_DO_QR * 60000);
  const [loj] = (await sb(`lojas?select=nome&id=eq.${loja}`)) || [];
  const pagamento = await mp(token, "/v1/payments", {
    method: "POST",
    headers: {
      // Mesmo pedido repetido na mesma janela de 10 minutos = mesmo
      // pagamento. Clique duplo no celular não gera dois QR.
      "X-Idempotency-Key": `os-${ordem.id}-${Math.round(valor * 100)}-${Math.floor(agora.getTime() / 600000)}`,
    },
    body: JSON.stringify({
      transaction_amount: valor,
      description: `${codigoOS(ordem.numero)} - ${loj?.nome || "Assistência"}`,
      payment_method_id: "pix",
      // O Mercado Pago exige um e-mail de pagador. O cliente não digita nada
      // na página, e pedir e-mail para pagar um conserto faz a pessoa
      // desistir — vai um endereço da própria OS.
      payer: { email: `os-${ordem.numero}@pagador.sistema-ti.app` },
      external_reference: `${loja}|${ordem.id}`,
      notification_url: `${site}/api/pix?acao=webhook&loja=${loja}`,
      date_of_expiration: expira.toISOString(),
    }),
  });

  const dados = pagamento?.point_of_interaction?.transaction_data || {};
  await sb("pix_cobrancas?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify([
      {
        id: String(pagamento.id),
        lojaId: loja,
        osId: ordem.id,
        valor,
        status: String(pagamento.status || "pending"),
        copiaECola: dados.qr_code || "",
        qrBase64: dados.qr_code_base64 || "",
        expiraEm: expira.toISOString(),
      },
    ]),
  });

  return res.status(200).json({
    id: String(pagamento.id),
    valor,
    copiaECola: dados.qr_code || "",
    qrBase64: dados.qr_code_base64 || "",
    expiraEm: expira.toISOString(),
  });
}

/**
 * O aviso do Mercado Pago. Responde 200 sempre que o pedido foi entendido,
 * mesmo quando não há nada a fazer: resposta de erro faz o Mercado Pago
 * repetir o aviso por dias.
 */
async function acaoWebhook(req, res) {
  const loja = String(req.query?.loja || "");
  const id = String(req.body?.data?.id || req.query?.["data.id"] || req.query?.id || "");
  const tipo = String(req.body?.type || req.query?.type || req.query?.topic || "");
  if (!/^[0-9a-f-]{36}$/i.test(loja) || !/^\d+$/.test(id) || (tipo && tipo !== "payment")) {
    return res.status(200).json({ ok: true, ignorado: true });
  }

  const token = await tokenDaLoja(loja);
  if (!token) return res.status(200).json({ ok: true, ignorado: "loja sem Pix" });

  // O corpo do aviso NÃO é prova de nada: o pagamento é lido de novo na API
  // do Mercado Pago, com o token da loja.
  const pagamento = await mp(token, `/v1/payments/${id}`);
  const r = await processarPagamento(loja, pagamento);
  return res.status(200).json(r);
}

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ erro: "Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no Vercel." });
  }
  const acao = String(req.query?.acao || "");
  try {
    if (acao === "credencial") return await acaoCredencial(req, res);
    if (acao === "status" && req.method === "GET") return await acaoStatus(req, res);
    if (acao === "gerar" && req.method === "POST") return await acaoGerar(req, res);
    if (acao === "webhook") return await acaoWebhook(req, res);
    return res.status(404).json({ erro: "ação desconhecida" });
  } catch (e) {
    // Erro vai para o log da Vercel com o texto cru, e para a tela também:
    // "algo deu errado" não diz a ninguém qual é a saída.
    console.error("Pix:", acao, e?.message || e);
    const status = acao === "webhook" ? 500 : 502;
    return res.status(status).json({ erro: e instanceof Error ? e.message : String(e) });
  }
}
