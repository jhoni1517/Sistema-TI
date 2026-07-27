/**
 * Criptografia das senhas de aparelho.
 *
 * Por que isto existe: a OS guarda a senha do celular do cliente. Se um
 * backup do banco vazar, se alguém abrir o painel do Supabase, ou se um dia
 * uma política de acesso for escrita errada, essa senha estaria à mostra em
 * texto puro. Aqui ela vira um bloco cifrado que não diz nada sozinho.
 *
 * Como funciona: cada loja tem uma chave AES-256 própria, guardada na linha
 * da loja e acessível apenas por quem está logado nela. O texto é cifrado no
 * navegador (AES-GCM) antes de subir e decifrado depois de descer.
 *
 * O que isto NÃO protege: um funcionário logado na loja continua vendo a
 * senha — é o trabalho dele. Contra isso valem os papéis, o registro de quem
 * revelou e o descarte automático na entrega.
 */

const PREFIXO = "enc1.";
let chave: CryptoKey | null = null;

const subtle = (): SubtleCrypto | null =>
  typeof crypto !== "undefined" && crypto.subtle ? crypto.subtle : null;

const b64 = (bytes: ArrayBuffer | Uint8Array): string => {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s);
};

const deB64 = (texto: string): ArrayBuffer => {
  const bin = atob(texto);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr.buffer;
};

/** Carrega a chave da loja (base64 de 32 bytes). Chamada uma vez após o login. */
export async function definirChaveLoja(segredo: string | null): Promise<void> {
  const cs = subtle();
  if (!segredo || !cs) {
    chave = null;
    return;
  }
  try {
    chave = await cs.importKey("raw", deB64(segredo), { name: "AES-GCM" }, false, [
      "encrypt",
      "decrypt",
    ]);
  } catch {
    chave = null;
  }
}

export const criptoAtiva = (): boolean => chave !== null;

/** Já está cifrado? Serve para conviver com as OS antigas em texto puro. */
export const estaCifrado = (valor: string | null | undefined): boolean =>
  typeof valor === "string" && valor.startsWith(PREFIXO);

/** Cifra um texto. Sem chave disponível, devolve o texto como está. */
export async function proteger(texto: string | null | undefined): Promise<string> {
  const cs = subtle();
  if (!texto) return "";
  if (!chave || !cs || estaCifrado(texto)) return texto;
  try {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ivBuf = iv.buffer as ArrayBuffer;
    const dados = new TextEncoder().encode(texto);
    const cifrado = await cs.encrypt({ name: "AES-GCM", iv: ivBuf }, chave, dados.buffer as ArrayBuffer);
    return `${PREFIXO}${b64(iv)}.${b64(cifrado)}`;
  } catch {
    // Nunca impedir o técnico de salvar a OS por causa da criptografia
    return texto;
  }
}

/** Decifra. Texto antigo (sem prefixo) volta inalterado. */
export async function revelar(valor: string | null | undefined): Promise<string> {
  const cs = subtle();
  if (!valor) return "";
  if (!estaCifrado(valor)) return valor;
  if (!chave || !cs) return "";
  try {
    const [, ivB64, ctB64] = valor.split(".");
    const claro = await cs.decrypt(
      { name: "AES-GCM", iv: deB64(ivB64) },
      chave,
      deB64(ctB64)
    );
    return new TextDecoder().decode(claro);
  } catch {
    return "";
  }
}
