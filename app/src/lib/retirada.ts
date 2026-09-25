import { txt } from "./format";
import type { Config, OrdemServico } from "./types";

/**
 * Código de retirada (PIN).
 *
 * "Vim buscar o celular da minha mãe" é a frase que entrega aparelho para a
 * pessoa errada — ex-marido, vizinho, golpista que viu o papel da OS na
 * bolsa. O aparelho sai com fotos, conversas e banco dentro, e quem responde
 * é a loja.
 *
 * O código nasce quando a OS fica pronta e vai só para o cliente (link de
 * acompanhamento e mensagem de pronto). No balcão, digita-se o código. Sem
 * ele, só entrega com motivo e foto do documento de quem levou, e isso vai
 * para a auditoria.
 */

/** Códigos que qualquer um chuta: repetidos e sequências. */
export function pinFraco(pin: string): boolean {
  if (!/^\d{4}$/.test(pin)) return true;
  if (/^(\d)\1{3}$/.test(pin)) return true;
  const d = pin.split("").map(Number);
  const passo = d[1] - d[0];
  if ((passo === 1 || passo === -1) && d.every((x, i) => i === 0 || x - d[i - 1] === passo)) return true;
  return ["1212", "6969", "2580", "1122", "1004"].includes(pin);
}

/** Sorteia até achar um que não é fraco. `sortear` devolve 0 a 9999. */
export function gerarPin(sortear: () => number = sorteioSeguro): string {
  for (let i = 0; i < 50; i++) {
    const pin = String(Math.abs(Math.floor(sortear())) % 10000).padStart(4, "0");
    if (!pinFraco(pin)) return pin;
  }
  return "4829";
}

function sorteioSeguro(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % 10000;
}

/** O código confere? Aceita espaço e traço no que foi digitado. */
export const pinConfere = (digitado: string, pin?: string | null): boolean =>
  !!pin && txt(digitado).replace(/\D/g, "") === pin;

/** Esta entrega pede código? Só se a opção está ligada e a OS tem código (as antigas não têm). */
export const exigePin = (o: Pick<OrdemServico, "pinRetirada">, config: Pick<Config, "pinRetirada">): boolean =>
  config.pinRetirada !== false && !!o.pinRetirada;

/** A OS acabou de ficar pronta e ainda não tem código? */
export const precisaDePin = (o: Pick<OrdemServico, "status" | "pinRetirada">, config: Pick<Config, "pinRetirada">): boolean =>
  config.pinRetirada !== false && o.status === "pronta" && !o.pinRetirada;

/** Entregar sem código: motivo e foto do documento são obrigatórios. */
export function problemaSemPin(motivo: string, foto?: string | null): string {
  if (txt(motivo).trim().length < 5) return "Escreva por que está entregando sem o código.";
  if (!foto) return "Tire a foto do documento de quem está levando.";
  return "";
}

/** Linha da mensagem de pronto. Sem emoji. */
export const textoDoPin = (pin: string): string =>
  `*Código de retirada: ${pin}*\nInforme no balcão para retirar. Só entregamos o aparelho com este código.`;
