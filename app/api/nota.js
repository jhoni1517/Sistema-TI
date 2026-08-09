// ============================================================
//  Emissão de nota fiscal — a fila que fala com o intermediário
//  Endpoint: /api/nota  (chamado pelo cron do Vercel e sob demanda)
// ============================================================
//
// A VENDA NUNCA ESPERA A NOTA. A tela grava a venda e põe uma nota
// "pendente" na fila; quem manda é este robô, depois. SEFAZ fora do ar,
// intermediário fora do ar, internet do balcão caindo — nada disso pode
// travar o caixa de um restaurante numa sexta cheia.
//
// ------------------------------------------------------------
// POR QUE ISTO RODA AQUI E NÃO NO NAVEGADOR
//
// O token do emissor e o CSC da SEFAZ são segredos. Qualquer coisa que o
// navegador consegue ler, o usuário consegue ler — e junto com o token vem
// a capacidade de emitir nota em nome da loja.
//
// `fiscal_credencial` NÃO TEM policy de select. O navegador não lê aquela
// tabela nem com o login do dono. Esta função lê com a chave de serviço,
// que ignora RLS por definição, e é o único lugar do sistema que enxerga o
// token. Ver supabase-migracao-notas.sql.
// ------------------------------------------------------------
//
// Variáveis de ambiente no Vercel:
//   SUPABASE_URL                -> mesma do VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   -> chave "service_role" (Settings -> API)
//   CRON_SECRET                 -> protege a chamada manual
//
// O token de CADA LOJA não é variável de ambiente: ele mora no banco, por
// loja, porque cada restaurante tem a conta dele no emissor.

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Quantas vezes tentar antes de desistir.
 *
 * Tem que bater com MAXIMO_DE_TENTATIVAS de src/lib/nota.ts — a tela usa o
 * número para dizer "precisa de atenção", e o robô para parar de tentar.
 * nota.cron.test.ts lê os dois arquivos do disco e reprova se divergirem.
 */
const MAXIMO_DE_TENTATIVAS = 3;

/** Quantas notas por execução. Segura o tempo da função e o custo da API. */
const LOTE = 20;

/**
 * Onde falar com o emissor.
 *
 * Homologação e produção são endereços diferentes, e a loja nasce em
 * homologação de propósito: a primeira nota de uma loja nova tem que ser de
 * mentira. Mandar para produção sem querer emite documento fiscal de
 * verdade, com número consumido e prazo de cancelamento correndo.
 */
const BASE = {
  homologacao: "https://homologacao.focusnfe.com.br",
  producao: "https://api.focusnfe.com.br",
};

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
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

/**
 * Traduz o erro do emissor para português de balcão.
 *
 * O que volta da SEFAZ é um código e uma frase técnica: "Rejeicao: NCM
 * informado nao existe na tabela". Quem lê está atendendo, e precisa saber
 * O QUE FAZER — não decorar a tabela de rejeições.
 *
 * O texto original vai junto, no fim: quando a tradução não cobre o caso, é
 * ele que o contador usa.
 */
function traduzErroFiscal(bruto) {
  const t = String(bruto || "").toLowerCase();
  const dica =
    t.includes("ncm")
      ? "O NCM de algum produto está errado. Confira em Estoque, no cadastro do produto."
      : t.includes("cfop")
        ? "O CFOP está errado. Para venda no balcão ele começa com 5."
        : t.includes("csosn") || t.includes("cst")
          ? "O código de tributação do item não bate com o regime da loja. Confira em Configurações."
          : t.includes("inscricao") || t.includes("inscrição")
            ? "A Inscrição Estadual da loja está errada ou não está ativa na SEFAZ."
            : t.includes("certificado")
              ? "O certificado digital venceu ou não foi enviado ao emissor."
              : t.includes("csc") || t.includes("codigo de seguranca")
                ? "O CSC da SEFAZ está errado. Gere de novo no portal do estado."
                : t.includes("duplicidade") || t.includes("duplicado")
                  ? "Esta nota já foi emitida antes. Confira na lista antes de tentar de novo."
                  : "";
  const original = String(bruto || "").trim();
  return dica ? `${dica}\n\n(${original})` : original || "O emissor não explicou o motivo.";
}

/** As credenciais de cada loja, lidas com a chave de serviço */
async function credenciais() {
  const mapa = new Map();
  try {
    const linhas = await sb('fiscal_credencial?select="lojaId",emissor,token,ambiente');
    for (const l of linhas || []) {
      if (String(l.token || "").trim()) mapa.set(String(l.lojaId), l);
    }
  } catch {
    // Sem a tabela ainda, ninguém emite — que é o lado seguro.
  }
  return mapa;
}

/**
 * Manda uma nota para o emissor.
 *
 * A referência é o ID da nossa nota, e não um número sequencial: é ela que
 * o emissor usa para NÃO emitir a mesma nota duas vezes se este robô rodar
 * de novo antes de a resposta anterior chegar. Sem isso, um timeout vira
 * duas notas fiscais para uma venda só — e a segunda tem que ser cancelada
 * em 30 minutos ou vira nota de devolução com o contador.
 */
async function enviarNota(cred, nota, pedido) {
  const base = BASE[cred.ambiente === "producao" ? "producao" : "homologacao"];
  const r = await fetch(`${base}/v2/nfce?ref=${encodeURIComponent(nota.id)}`, {
    method: "POST",
    headers: {
      // O emissor usa Basic com o token no lugar do usuário e senha vazia.
      Authorization: "Basic " + Buffer.from(`${cred.token}:`).toString("base64"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(pedido),
  });

  let corpo = {};
  try {
    corpo = await r.json();
  } catch {
    /* resposta sem JSON: o status ainda diz o que aconteceu */
  }

  /*
   * "processando_autorizacao" NÃO é erro e NÃO é sucesso.
   *
   * O emissor aceitou e está falando com a SEFAZ. A nota continua pendente
   * e a próxima rodada consulta o resultado — tratar isso como falha faria
   * o robô reenviar e arriscar a nota em duplicidade.
   */
  const status = String(corpo.status || "");
  if (status === "autorizado") {
    return {
      situacao: "autorizada",
      chave: corpo.chave_nfe || corpo.chave || "",
      numero: String(corpo.numero || ""),
      serie: String(corpo.serie || ""),
      protocolo: String(corpo.protocolo || ""),
      url: corpo.caminho_danfe || corpo.url_danfe || "",
      emitidaEm: new Date().toISOString(),
    };
  }
  if (status === "processando_autorizacao" || r.status === 202) {
    return { situacao: "pendente", erro: "" };
  }
  if (status === "erro_autorizacao" || status === "denegado") {
    return {
      situacao: "rejeitada",
      erro: traduzErroFiscal(corpo.mensagem_sefaz || corpo.mensagem || corpo.erros),
    };
  }
  // Falha de rede, 500 do emissor, timeout: continua pendente e tenta de
  // novo. Só o que a SEFAZ RECUSOU vira "rejeitada" — o resto é temporário.
  return {
    situacao: "pendente",
    erro: traduzErroFiscal(corpo.mensagem || corpo.erro || `HTTP ${r.status}`),
  };
}

export default async function handler(req, res) {
  const doCron = !!req.headers["x-vercel-cron"];
  const token = req.query?.token || (req.headers.authorization || "").replace("Bearer ", "");
  if (!doCron && (!CRON_SECRET || token !== CRON_SECRET)) {
    return res.status(401).json({ erro: "não autorizado" });
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({
      erro: "Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no Vercel.",
    });
  }

  try {
    const creds = await credenciais();
    if (creds.size === 0) {
      return res.status(200).json({ ok: true, enviadas: 0, motivo: "nenhuma loja configurada" });
    }

    const lojas = [...creds.keys()];
    const pendentes = await sb(
      'notas?select=*&situacao=eq.pendente' +
        `&tentativas=lt.${MAXIMO_DE_TENTATIVAS}` +
        `&lojaId=in.(${lojas.join(",")})&order=criadoEm.asc&limit=${LOTE}`
    );

    const resultado = { autorizadas: 0, rejeitadas: 0, pendentes: 0, falhas: 0 };

    for (const nota of pendentes || []) {
      const cred = creds.get(String(nota.lojaId));
      if (!cred) continue;

      /*
       * O pedido vem GRAVADO na própria nota, montado pela tela.
       *
       * Este robô não recalcula preço nem imposto: a nota tem que sair com
       * exatamente o que o cliente pagou, e recalcular aqui abriria a porta
       * para a nota discordar do cupom que já saiu na mão dele.
       */
      let pedido;
      try {
        pedido = typeof nota.pedido === "string" ? JSON.parse(nota.pedido) : nota.pedido;
      } catch {
        pedido = null;
      }
      if (!pedido) {
        await sb(`notas?id=eq.${nota.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            situacao: "rejeitada",
            erro: "A nota foi criada sem os dados do pedido. Emita de novo pela tela da venda.",
            atualizadoEm: new Date().toISOString(),
          }),
        });
        resultado.falhas++;
        continue;
      }

      let r;
      try {
        r = await enviarNota(cred, nota, pedido);
      } catch (e) {
        r = { situacao: "pendente", erro: traduzErroFiscal(e?.message) };
      }

      await sb(`notas?id=eq.${nota.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...r,
          // A tentativa conta SEMPRE, inclusive quando continua pendente: é
          // ela que faz o robô desistir de uma nota que nunca vai passar.
          tentativas: (Number(nota.tentativas) || 0) + 1,
          atualizadoEm: new Date().toISOString(),
        }),
      });

      if (r.situacao === "autorizada") resultado.autorizadas++;
      else if (r.situacao === "rejeitada") resultado.rejeitadas++;
      else resultado.pendentes++;
    }

    return res.status(200).json({ ok: true, ...resultado });
  } catch (e) {
    // Erro aqui não pode derrubar o cron inteiro em silêncio: o status volta
    // 500 e a mensagem fica no log da Vercel.
    return res.status(500).json({ erro: e instanceof Error ? e.message : String(e) });
  }
}
