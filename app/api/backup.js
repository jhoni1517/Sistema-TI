// ============================================================
// Backup automático diário
// Endpoint: /api/backup  (chamado pelo cron do Vercel, de madrugada)
//
// Para cada loja: lê todas as tabelas dela, monta um JSON, cifra com a
// chave da PRÓPRIA loja (AES-256-GCM, a mesma das senhas de aparelho) e
// grava no depósito privado "backups", em <loja>/<data>.json.enc. Apaga o
// que passou de 30 dias.
//
// Por que cifrado com a chave da loja: o arquivo tem dado de cliente. Quem
// abrir o depósito sem estar logado na loja vê um bloco que não diz nada.
//
// QUEM CHAMA: o cron diário da cobrança (api/cobranca.js). O plano Hobby
// só aceita 2 crons e os dois estão em uso (ver src/lib/vercel.test.ts).
// Cada chamada tem 15 segundos; loja que não coube passa para a próxima
// chamada, que esta função dispara sozinha com ?depois=<última loja feita>.
//
// Variáveis no Vercel (as mesmas da cobrança):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET (obrigatório aqui)
//   RESEND_API_KEY  -> e-mail semanal do backup (opcional, aos domingos)
//   RESEND_FROM     -> remetente com domínio verificado no Resend. Sem ele,
//                      vale o de teste do Resend, que só entrega no e-mail
//                      de quem criou a conta do Resend.
// ============================================================

import { TABELAS_BACKUP, montarBackup, cifrar, nomeDoArquivo, paraApagar } from "./_backup.js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || "Sistema TI <onboarding@resend.dev>";

/**
 * Domingo: a cópia da semana no e-mail da loja, se ela pediu. Vai o
 * arquivo CIFRADO — o e-mail passa por servidores de terceiros, e sem a
 * chave da loja ele não diz nada. Para abrir: Configurações > Backup >
 * Restaurar de um arquivo.
 */
async function mandarPorEmail(para, nomeLoja, nome, pacote) {
  if (!RESEND_API_KEY || !para) return false;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [para],
      subject: `Backup semanal - ${nomeLoja || "sua loja"}`,
      text:
        "Em anexo, a cópia desta semana dos dados da loja, criptografada.\n\n" +
        "Guarde no computador ou num pendrive. Para restaurar: Configurações > Backup > Restaurar de um arquivo.\n" +
        "Sem entrar na loja, o arquivo não abre.",
      attachments: [{ filename: `backup-${nome}`, content: btoa(pacote) }],
    }),
  });
  return r.ok;
}
const PAGINA = 1000;

const cabecalho = (extra = {}) => ({ apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, ...extra });

/**
 * Todas as linhas de uma tabela da loja, de mil em mil. O Supabase devolve
 * no máximo mil por pedido: sem paginar, o backup de quem tem 1.500
 * lançamentos sairia com mil, e ninguém perceberia até precisar dele.
 */
async function linhas(tabela, lojaId) {
  const todas = [];
  for (let de = 0; ; de += PAGINA) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?select=*&lojaId=eq.${lojaId}&order=id`, {
      headers: cabecalho({ Range: `${de}-${de + PAGINA - 1}`, "Range-Unit": "items" }),
    });
    // Tabela de migração ainda não rodada: fica de fora, o resto segue.
    if (r.status === 404 || r.status === 400) return null;
    if (!r.ok && r.status !== 206) throw new Error(`${tabela}: ${r.status} ${await r.text()}`);
    const lote = await r.json();
    todas.push(...lote);
    if (lote.length < PAGINA) return todas;
  }
}

async function gravar(caminho, conteudo) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/backups/${caminho}`, {
    method: "POST",
    headers: cabecalho({ "Content-Type": "text/plain", "x-upsert": "true" }),
    body: conteudo,
  });
  if (!r.ok) throw new Error(`gravar ${caminho}: ${r.status} ${await r.text()}`);
}

async function listar(lojaId) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/list/backups`, {
    method: "POST",
    headers: cabecalho({ "Content-Type": "application/json" }),
    body: JSON.stringify({ prefix: `${lojaId}/`, limit: 1000 }),
  });
  if (!r.ok) return [];
  return (await r.json()).map((o) => o.name);
}

async function apagar(caminhos) {
  if (!caminhos.length) return;
  await fetch(`${SUPABASE_URL}/storage/v1/object/backups`, {
    method: "DELETE",
    headers: cabecalho({ "Content-Type": "application/json" }),
    body: JSON.stringify({ prefixes: caminhos }),
  });
}

export default async function handler(req, res) {
  // Só com o segredo: esta função não está no cron, e aceitar o cabeçalho
  // do cron aqui seria deixar qualquer um disparar a leitura de todas as lojas.
  const token = req.query?.token || (req.headers.authorization || "").replace("Bearer ", "");
  if (!CRON_SECRET || token !== CRON_SECRET) return res.status(401).json({ erro: "não autorizado" });
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ erro: "Faltam as variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no Vercel." });
  }

  const inicio = Date.now();
  const depois = String(req.query?.depois || "");
  const agora = new Date().toISOString();
  const hoje = agora.slice(0, 10);
  const feitos = [];
  const falhas = [];
  const pulados = [];

  try {
    const lr = await fetch(`${SUPABASE_URL}/rest/v1/lojas?select=id,nome,chave_cripto,ativa&chave_cripto=not.is.null&order=id`, {
      headers: cabecalho(),
    });
    if (!lr.ok) throw new Error(`lojas: ${lr.status}`);
    const lojas = (await lr.json()).filter((l) => l.ativa !== false && (!depois || l.id > depois));

    for (const l of lojas) {
      // Folga para a Vercel não matar a função no meio de uma gravação.
      if (Date.now() - inicio > 10000) {
        pulados.push(l.id);
        continue;
      }
      try {
        const tabelas = {};
        for (const t of TABELAS_BACKUP) {
          const v = await linhas(t, l.id);
          if (v) tabelas[t] = v;
        }
        const total = Object.values(tabelas).reduce((s, v) => s + v.length, 0);
        if (total === 0) {
          feitos.push({ loja: l.id, linhas: 0 }); // loja vazia: nada a guardar, mas conta para a fila andar
          continue;
        }
        const cr = await fetch(`${SUPABASE_URL}/rest/v1/configuracoes?select=dados&id=eq.${l.id}`, { headers: cabecalho() });
        const config = cr.ok ? (await cr.json())[0]?.dados || null : null;
        const pacote = await cifrar(JSON.stringify(montarBackup(l.id, agora, tabelas, config)), l.chave_cripto);
        await gravar(`${l.id}/${nomeDoArquivo(agora)}`, pacote);
        const email = config && typeof config.backupEmail === "string" ? config.backupEmail.trim() : "";
        if (email && new Date().getUTCDay() === 0) {
          const foi = await mandarPorEmail(email, config.nomeLoja, nomeDoArquivo(agora), pacote).catch(() => false);
          if (!foi) falhas.push({ loja: l.id, erro: "e-mail do backup não saiu" });
        }
        await apagar(paraApagar(await listar(l.id), hoje).map((n) => `${l.id}/${n}`));
        feitos.push({ loja: l.id, linhas: total });
      } catch (e) {
        falhas.push({ loja: l.id, erro: String(e?.message || e) });
      }
    }
    // Sobrou loja: a próxima chamada continua dali, com 15 segundos novos.
    if (pulados.length && CRON_SECRET && req.headers.host) {
      const ultima = feitos.length ? feitos[feitos.length - 1].loja : depois;
      const proxima = fetch(`https://${req.headers.host}/api/backup?depois=${encodeURIComponent(ultima || "")}`, {
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      }).catch(() => null);
      await Promise.race([proxima, new Promise((ok) => setTimeout(ok, 1500))]);
    }
    return res.status(200).json({ ok: falhas.length === 0, feitos: feitos.length, falhas, pulados: pulados.length });
  } catch (e) {
    return res.status(500).json({ erro: String(e?.message || e) });
  }
}
