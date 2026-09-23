import { txt } from "./format";
import type { OSStatus } from "./types";

/**
 * O lado da página do cliente no Pix pelo link.
 *
 * Quem decide se pode pagar e quanto é o SERVIDOR (api/pix.js): o valor
 * nunca sai daqui. Esta tela só pergunta, mostra o QR e espera a
 * confirmação.
 */

/**
 * Em que status a página oferece o Pix. Tem que ser a MESMA lista de
 * `STATUS_QUE_PAGAM` em api/pix.js — pix.cron.test.ts lê os dois e reprova
 * se divergirem. Botão que aparece e o servidor recusa é botão quebrado.
 */
export const STATUS_QUE_PAGAM: OSStatus[] = ["aprovada", "em_reparo", "aguardando_peca", "pronta"];

export const podePagarPix = (status: OSStatus): boolean => STATUS_QUE_PAGAM.includes(status);

/** Segundos entre uma pergunta e outra enquanto o QR está na tela */
export const SEGUNDOS_ENTRE_CONSULTAS = 8;

/** A imagem do QR que o Mercado Pago devolve em base64. Vazio sem imagem. */
export function imagemDoQR(base64: string | null | undefined): string {
  const b = txt(base64).trim();
  // Só base64 de verdade vira src: texto qualquer ali seria injetado na página.
  if (!b || !/^[A-Za-z0-9+/=\s]+$/.test(b)) return "";
  return `data:image/png;base64,${b.replace(/\s/g, "")}`;
}

/**
 * Quanto tempo o QR ainda vale, dito como gente fala.
 * Vencido devolve vazio, e a tela oferece gerar outro.
 */
export function validadeDoQR(expiraEm: string | null | undefined, agora = new Date()): string {
  const fim = Date.parse(txt(expiraEm));
  if (Number.isNaN(fim)) return "";
  const minutos = Math.floor((fim - agora.getTime()) / 60000);
  if (minutos < 1) return "";
  return minutos === 1 ? "Vale por mais 1 minuto" : `Vale por mais ${minutos} minutos`;
}
