// Funções compartilhadas pelos robôs (Telegram / WhatsApp).
// Arquivos iniciados com "_" não viram endpoints no Vercel.

export const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
export const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

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

/** Sessão de caixa aberta, para o lançamento entrar no fechamento do dia */
async function sessaoAbertaId() {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/sessoes?select=id&fechadoEm=is.null&order=abertoEm.desc&limit=1`,
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
  const sessaoId = await sessaoAbertaId();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/movimentos`, {
    method: "POST",
    headers: { ...headers(), Prefer: "return=minimal" },
    body: JSON.stringify([
      {
        id: uid(),
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
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/movimentos?select=tipo,valor,descricao,data&data=gte.${hoje}`,
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
