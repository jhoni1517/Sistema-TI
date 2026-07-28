/**
 * Gera um link de redefinição de senha SEM depender de e-mail.
 *
 * Por que isto existe: enquanto o SMTP não está configurado, o Supabase não
 * entrega o "esqueci minha senha". Uma loja que perde a senha fica de fora
 * do próprio sistema, e a única saída seria rodar SQL na mão — o que não é
 * sustentável com cliente pagante.
 *
 * Aqui o dono do sistema gera o link e manda pelo WhatsApp. O link é do
 * próprio Supabase, expira sozinho e só serve uma vez.
 *
 * Quem pode chamar: apenas quem está logado E tem super_admin no perfil.
 * A verificação é feita aqui no servidor, com a chave de serviço, porque
 * qualquer coisa checada no navegador é sugestão, não trava.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || SERVICE_KEY;

const json = (res, status, body) => res.status(status).json(body);

/** Descobre quem está chamando a partir do token da sessão. */
async function usuarioDoToken(token) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.id ? u : null;
}

/** Só o dono do sistema libera senha de outra loja. */
async function ehSuperAdmin(userId) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/perfis?select=super_admin,ativo&id=eq.${userId}`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!r.ok) return false;
  const [perfil] = await r.json();
  return Boolean(perfil?.super_admin && perfil?.ativo !== false);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { erro: "Use POST." });

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json(res, 500, {
      erro:
        "Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nas variáveis de ambiente do Vercel.",
    });
  }

  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return json(res, 401, { erro: "Faça login antes." });

  const usuario = await usuarioDoToken(token);
  if (!usuario) return json(res, 401, { erro: "Sessão expirada. Entre de novo." });
  if (!(await ehSuperAdmin(usuario.id))) {
    return json(res, 403, { erro: "Só o dono do sistema pode gerar este link." });
  }

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};
  const email = String(body.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return json(res, 400, { erro: "Informe o e-mail da conta." });

  // redirectTo precisa estar na lista de URLs permitidas do Supabase,
  // senão o link abre e volta para a home sem deixar trocar a senha.
  const origem = body.redirectTo || `https://${req.headers.host}`;

  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "recovery",
      email,
      options: { redirect_to: `${origem}/#/login` },
    }),
  });

  const dado = await r.json().catch(() => ({}));
  if (!r.ok) {
    // O erro cru do Supabase costuma ser "User not found" — vale repassar
    // traduzido, porque digitar o e-mail errado é o caso mais comum.
    const cru = dado?.msg || dado?.message || dado?.error_description || "";
    return json(res, r.status, {
      erro: /not found/i.test(cru)
        ? `Não existe conta com o e-mail ${email}.`
        : cru || "O Supabase recusou a geração do link.",
    });
  }

  const link = dado?.properties?.action_link || dado?.action_link;
  if (!link) return json(res, 502, { erro: "O Supabase respondeu sem o link." });

  console.log(`[recuperar] link gerado para ${email} por ${usuario.email}`);
  return json(res, 200, { link, email });
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
