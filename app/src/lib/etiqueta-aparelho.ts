import { txt, codigoOS, whatsappLink, formatDate } from "./format";

/**
 * A etiqueta que fica colada no aparelho.
 *
 * O cliente leva o celular para casa com a etiqueta na capinha. Daqui a três
 * meses o aparelho dá problema, ele não lembra de que loja era — mas aponta a
 * câmera no QR e cai na página da OS, que depois da entrega mostra a garantia
 * e o botão de acionar. É o jeito mais barato de o cliente VOLTAR para a loja
 * e não ir para a concorrente da esquina.
 *
 * Bobina de 58mm (48mm imprimíveis): pouco texto, QR grande. Nome completo
 * NÃO vai: etiqueta fica exposta, e o primeiro nome já basta para o balcão
 * achar o aparelho na prateleira.
 */

const esc = (v: string): string =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const primeiroNome = (nome?: string | null): string => txt(nome).trim().split(/\s+/)[0] || "";

export function etiquetaDoAparelho(p: {
  loja: string;
  numero: number;
  cliente?: string | null;
  aparelho?: string | null;
  /** O QR já desenhado (data URL). Vazio = sem link: sai só o código. */
  qr: string;
}): string {
  const nome = primeiroNome(p.cliente);
  const qr = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(p.qr) ? p.qr : "";
  return `
<div style="text-align:center;font-family:Arial,Helvetica,sans-serif">
  <div style="font-size:11px;font-weight:bold">${esc(txt(p.loja).trim())}</div>
  <div style="font-size:18px;font-weight:bold;letter-spacing:1px;margin:2px 0">${esc(codigoOS(p.numero))}</div>
  ${nome ? `<div style="font-size:12px">${esc(nome)}</div>` : ""}
  ${p.aparelho ? `<div style="font-size:9px">${esc(txt(p.aparelho).trim().slice(0, 40))}</div>` : ""}
  ${qr ? `<img src="${qr}" style="width:36mm;height:36mm;margin:3px auto;display:block" alt="">` : ""}
  <div style="font-size:9px">${qr ? "Aponte a câmera: conserto e garantia" : "Guarde este número"}</div>
</div>`;
}

// ---------- Garantia na página do cliente ----------

/** O que a função pública garantia_da_os devolve */
export interface GarantiaPublica {
  entregueEm: string | null;
  garantiaDias: number | null;
  relatado: string | null;
  feito: string[] | null;
}

/** Recado do cliente acionando a garantia. Sem emoji. */
export function linkAcionarGarantia(
  whatsappLoja: string | null | undefined,
  numero: number,
  validaAte: string
): string {
  const num = txt(whatsappLoja).replace(/\D/g, "");
  if (num.length < 10) return "";
  return whatsappLink(
    num,
    `Oi! Meu aparelho da ${codigoOS(numero)} voltou a dar problema e está na garantia (até ${formatDate(validaAte)}). Quando posso levar?`
  );
}
