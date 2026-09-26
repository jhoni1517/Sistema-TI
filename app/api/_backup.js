// ============================================================
// Formato e criptografia do backup diário. Usado por api/backup.js.
//
// A MESMA conta existe em src/lib/backup-diario.ts (o app restaura o que
// o robô gravou). backup-diario.test.ts importa este arquivo e confere
// que um lê o que o outro escreve — cópia dentro de teste envelhece igual.
// ============================================================

export const TABELAS_BACKUP = [
  "clientes",
  "ordens",
  "produtos",
  "movimentos",
  "sessoes",
  "fiados",
  "categorias",
  "fornecedores",
  "cotacoes",
  "precos_fornecedor",
  "contas_pagar",
  "metas",
  "eventos",
  "vendas",
  "tarefas",
  "comandas",
  "notas",
  "rmas",
  "pedidos_site",
];

export const RETENCAO_DIAS = 30;
const PREFIXO = "sbk1.";

const b64 = (bytes) => {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < arr.length; i += 0x8000) s += String.fromCharCode(...arr.subarray(i, i + 0x8000));
  return btoa(s);
};
const deB64 = (t) => {
  const bin = atob(t);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
};

async function chaveDe(chaveB64) {
  if (!chaveB64) throw new Error("Loja sem chave de criptografia.");
  return globalThis.crypto.subtle.importKey("raw", deB64(chaveB64), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export function montarBackup(lojaId, geradoEm, tabelas, config) {
  return { formato: "sistema-ti-backup", versao: 1, lojaId, geradoEm, config: config || null, tabelas };
}

/** JSON -> "sbk1.<iv>.<cifrado>" com AES-256-GCM e a chave da loja. */
export async function cifrar(texto, chaveB64) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const k = await chaveDe(chaveB64);
  const ct = await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, new TextEncoder().encode(texto));
  return `${PREFIXO}${b64(iv)}.${b64(ct)}`;
}

export async function decifrar(pacote, chaveB64) {
  if (typeof pacote !== "string" || !pacote.startsWith(PREFIXO)) throw new Error("Arquivo não é um backup do sistema.");
  const [iv, ct] = pacote.slice(PREFIXO.length).split(".");
  const k = await chaveDe(chaveB64);
  try {
    const claro = await globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(iv) }, k, deB64(ct));
    return new TextDecoder().decode(claro);
  } catch {
    throw new Error("Não deu para abrir: o backup é de outra loja ou está corrompido.");
  }
}

/** "2026-09-26.json.enc" (robô) ou "2026-09-26-manual-1432.json.enc" (botão). */
export const nomeDoArquivo = (quandoISO, manual) =>
  manual ? `${quandoISO.slice(0, 10)}-manual-${quandoISO.slice(11, 13)}${quandoISO.slice(14, 16)}.json.enc` : `${quandoISO.slice(0, 10)}.json.enc`;

/** Quais arquivos já passaram da retenção. Nome sem data fica (não é nosso). */
export function paraApagar(nomes, hoje, dias = RETENCAO_DIAS) {
  const [a, m, d] = hoje.split("-").map(Number);
  const limite = new Date(Date.UTC(a, m - 1, d - dias)).toISOString().slice(0, 10);
  return nomes.filter((n) => /^\d{4}-\d{2}-\d{2}/.test(n) && n.slice(0, 10) < limite);
}
