// Funções compartilhadas pelos robôs (Telegram / WhatsApp).
// Arquivos iniciados com "_" não viram endpoints no Vercel.

export const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
// SUPABASE_SERVICE_ROLE_KEY é o nome usado no resto do projeto e na
// documentação. O SUPABASE_SERVICE_KEY antigo fica aceito para não quebrar
// quem já configurou assim — mas era só esse nome aqui, e o robô caía na
// chave pública sem ninguém logado: toda gravação batia no RLS e voltava 401.
export const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const brl = (v) =>
  (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const headers = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
});

/**
 * Interpreta a mensagem do usuário.
 * Exemplos:
 *   "café 5"                  -> despesa de R$ 5,00
 *   "luz 230 conta de energia"-> despesa de R$ 230,00
 *   "+100 venda avulsa"       -> entrada de R$ 100,00
 *   "sangria 200"             -> sangria de R$ 200,00
 */
export function parseMensagem(textoOriginal) {
  let texto = (textoOriginal || "").trim();
  if (!texto) return null;

  let tipo = "saida";
  const low = texto.toLowerCase();
  if (low.startsWith("+") || low.startsWith("entrada") || low.startsWith("venda")) {
    tipo = "entrada";
    texto = texto.replace(/^\+/, "").replace(/^(entrada|venda)/i, "").trim();
  } else if (low.startsWith("sangria")) {
    tipo = "sangria";
    texto = texto.replace(/^sangria/i, "").trim();
  } else if (low.startsWith("-") || low.startsWith("despesa") || low.startsWith("saida") || low.startsWith("saída")) {
    tipo = "saida";
    texto = texto.replace(/^-/, "").replace(/^(despesa|saida|saída)/i, "").trim();
  }

  // primeiro número da mensagem = valor (aceita 5, 5.50 ou 5,50)
  const m = texto.match(/(\d+(?:[.,]\d{1,2})?)/);
  if (!m) return null;
  const valor = parseFloat(m[1].replace(",", "."));
  if (!valor || valor <= 0) return null;

  let descricao = texto.replace(m[0], "").replace(/\s+/g, " ").trim();
  if (!descricao) {
    descricao =
      tipo === "entrada" ? "Entrada" : tipo === "sangria" ? "Sangria" : "Despesa";
  }

  const categoria =
    tipo === "entrada" ? "Venda" : tipo === "sangria" ? "Sangria" : "Despesa";
  return { tipo, valor, descricao, categoria };
}

/**
 * De qual loja é o robô.
 *
 * A chave de serviço passa por cima do RLS, então aqui NADA vem filtrado
 * sozinho: sem dizer a loja, o lançamento nasce órfão (e some da tela de
 * todo mundo, porque as políticas filtram por lojaId) e o /saldo somaria o
 * caixa das outras lojas junto.
 *
 * Por padrão é a loja de quem administra o sistema, que é quem tem o bot.
 * LOJA_ID nas variáveis do Vercel manda mais, se um dia for outra.
 */
let lojaCache = null;
async function lojaDoRobo() {
  if (process.env.LOJA_ID) return process.env.LOJA_ID;
  if (lojaCache) return lojaCache;
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/perfis?select=loja_id&super_admin=is.true&limit=1`,
    { headers: headers() }
  );
  if (!r.ok) return null;
  const [p] = await r.json();
  lojaCache = p?.loja_id || null;
  return lojaCache;
}

/** Sessão de caixa aberta, para o lançamento entrar no fechamento do dia */
async function sessaoAbertaId(lojaId) {
  try {
    const filtroLoja = lojaId ? `&lojaId=eq.${lojaId}` : "";
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/sessoes?select=id&fechadoEm=is.null${filtroLoja}&order=abertoEm.desc&limit=1`,
      { headers: headers() }
    );
    if (!r.ok) return null;
    const linhas = await r.json();
    return linhas?.[0]?.id || null;
  } catch {
    return null;
  }
}

export async function registrarMovimento(mov, origem = "") {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Banco não configurado (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).");
  }
  const lojaId = await lojaDoRobo();
  if (!lojaId) {
    throw new Error(
      "Não descobri de qual loja é este robô. Confira se existe um perfil com super_admin, ou defina LOJA_ID nas variáveis do Vercel."
    );
  }
  const sessaoId = await sessaoAbertaId(lojaId);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/movimentos`, {
    method: "POST",
    headers: { ...headers(), Prefer: "return=minimal" },
    body: JSON.stringify([
      {
        id: uid(),
        lojaId,
        tipo: mov.tipo,
        categoria: mov.categoria,
        descricao: origem ? `${mov.descricao} (${origem})` : mov.descricao,
        valor: mov.valor,
        formaPagamento: "dinheiro",
        data: new Date().toISOString(),
        sessaoId,
      },
    ]),
  });
  if (!res.ok) throw new Error(`Banco respondeu ${res.status}: ${await res.text()}`);
}

/** Resumo do caixa: saldo do dia (ou da sessão aberta) */
export async function resumoCaixa() {
  const hoje = new Date().toISOString().slice(0, 10);
  const lojaId = await lojaDoRobo();
  const filtroLoja = lojaId ? `&lojaId=eq.${lojaId}` : "";
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/movimentos?select=tipo,valor,descricao,data&data=gte.${hoje}${filtroLoja}`,
    { headers: headers() }
  );
  if (!r.ok) throw new Error(`Banco respondeu ${r.status}`);
  const movs = await r.json();
  const soma = (t) =>
    movs.filter((m) => m.tipo === t).reduce((s, m) => s + Number(m.valor || 0), 0);
  const entradas = soma("entrada");
  const saidas = soma("saida");
  const sangrias = soma("sangria");
  return {
    entradas,
    saidas,
    sangrias,
    saldo: entradas - saidas - sangrias,
    qtd: movs.length,
  };
}

export const AJUDA =
  "Como usar:\n\n" +
  "• café 5 — registra despesa de R$ 5,00\n" +
  "• luz 230 conta de energia — despesa com descrição\n" +
  "• +100 venda de película — registra entrada\n" +
  "• sangria 200 — registra retirada\n\n" +
  "Comandos:\n" +
  "/saldo — resumo do caixa de hoje\n" +
  "/ajuda — mostra esta mensagem";
