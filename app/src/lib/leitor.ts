import { txt } from "./format";
import { imeiValido } from "./imei";

/**
 * O celular como leitor de código de barras.
 *
 * Leitor de mão custa dinheiro e fica preso no caixa. O técnico na bancada
 * e o repositor no corredor têm um celular no bolso. A câmera lê; aqui mora
 * o que fazer com o que ela leu — a parte que dá para errar.
 */

/** Os formatos que valem a pena pedir: produto (EAN/UPC) e etiqueta (Code 128) */
export const FORMATOS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"];

/**
 * O que a câmera leu, pronto para o campo de produto. Tira espaço e quebra
 * de linha que alguns códigos trazem, mas não mexe em letra: SKU tem letra.
 */
export const leituraDeProduto = (bruto?: string | null): string => txt(bruto).replace(/[\r\n\t]/g, "").trim();

/**
 * O IMEI que está na etiqueta da caixa ou em *#06#.
 *
 * A caixa tem vários códigos (EAN do produto, número de série, IMEI 1 e
 * IMEI 2), e o QR às vezes traz "IMEI1:35...;IMEI2:35...". Pega o primeiro
 * número de 15 dígitos que passa no dígito verificador — um EAN de 13
 * dígitos lido por engano não vira IMEI. Sem IMEI válido, devolve vazio e
 * a tela diz para tentar o outro código.
 */
export function leituraDeImei(bruto?: string | null): string {
  const t = txt(bruto);
  for (const m of t.matchAll(/\d[\d\s-]{13,20}\d/g)) {
    const d = m[0].replace(/\D/g, "");
    if (d.length === 15 && imeiValido(d)) return d;
    // Sequência colada (IMEI1 e IMEI2 sem separador): tenta de 15 em 15.
    for (let i = 0; i + 15 <= d.length; i++) {
      const pedaco = d.slice(i, i + 15);
      if (imeiValido(pedaco)) return pedaco;
    }
  }
  return "";
}

/** Leitura repetida do mesmo código em sequência é o mesmo bipe, não dois */
export function mesmaLeitura(anterior: { codigo: string; em: number } | null, codigo: string, agora: number, janelaMs = 1500): boolean {
  return !!anterior && anterior.codigo === codigo && agora - anterior.em < janelaMs;
}
