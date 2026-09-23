// ============================================================
//  O cofre das credenciais das lojas (hoje, o token do Mercado Pago).
//
//  Arquivo com "_" não vira função da Vercel: é código compartilhado.
//  Separado de pix.js para a próxima credencial usar o MESMO cofre: duas
//  cópias de código de criptografia envelhecem diferente, e a que ficar
//  para trás é a porta.
//
//  A chave é PIX_CHAVE_CRIPTO (32 bytes em base64). O nome ficou do Pix,
//  que foi o primeiro a usar; trocar agora obrigaria cada loja a colar o
//  token de novo.
// ============================================================

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM: cifra E confere. Um token trocado no banco por outra pessoa
 * não decifra — o GCM recusa em vez de devolver lixo.
 */
export function cifrar(texto, chaveB64) {
  const chave = Buffer.from(String(chaveB64 || ""), "base64");
  if (chave.length !== 32) throw new Error("PIX_CHAVE_CRIPTO precisa ter 32 bytes em base64.");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave, iv);
  const corpo = Buffer.concat([c.update(String(texto), "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), corpo.toString("base64")].join(":");
}

export function decifrar(guardado, chaveB64) {
  const [versao, iv, tag, corpo] = String(guardado || "").split(":");
  if (versao !== "v1") throw new Error("Credencial gravada num formato desconhecido.");
  const chave = Buffer.from(String(chaveB64 || ""), "base64");
  const d = createDecipheriv("aes-256-gcm", chave, Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(corpo, "base64")), d.final()]).toString("utf8");
}

