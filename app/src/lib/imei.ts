import { txt } from "./format";
import { garantiaDaOS } from "./garantia";
import type { OrdemServico } from "./types";

/**
 * IMEI e a ficha do aparelho.
 *
 * O mesmo celular volta à loja. Sem ficha, o técnico não sabe que a tela
 * foi trocada há dois meses — e cobra de novo um conserto que está na
 * garantia, ou deixa passar que o aparelho já teve problema de placa.
 */

/** Só os dígitos, para comparar "35 693803 564380 9" com "356938035643809" */
export const soDigitosImei = (v?: string | null): string => txt(v).replace(/\D/g, "");

/**
 * O 15º dígito do IMEI confere os outros 14 (algoritmo de Luhn). Digitou
 * um número errado, o dígito não bate — e é melhor saber no balcão do que
 * quando a ficha não achar o aparelho.
 */
export function imeiValido(v?: string | null): boolean {
  const d = soDigitosImei(v);
  if (!/^\d{15}$/.test(d)) return false;
  let soma = 0;
  for (let i = 0; i < 15; i++) {
    let n = Number(d[14 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    soma += n;
  }
  return soma % 10 === 0;
}

/**
 * Parece IMEI (15 dígitos)? Número de série de notebook tem letra e outro
 * tamanho — esse não passa pelo Luhn, e acusar "inválido" nele seria mentira.
 */
export const pareceImei = (v?: string | null): boolean => /^[\d\s./-]+$/.test(txt(v).trim()) && soDigitosImei(v).length === 15;

/** "35-693803-564380-9" e "356938035643809" são o mesmo aparelho */
export function chaveDoAparelho(v?: string | null): string {
  const t = txt(v).trim();
  if (!t) return "";
  return /^[\d\s./-]+$/.test(t) ? soDigitosImei(t) : t.toLowerCase().replace(/\s+/g, ""); // texto-cru-proposital: série é letra e número
}

export const mesmoAparelho = (a?: string | null, b?: string | null): boolean => {
  const x = chaveDoAparelho(a);
  return x.length >= 5 && x === chaveDoAparelho(b);
};

export interface FichaDoAparelho {
  ordens: OrdemServico[];
  /** Peças que já foram trocadas, da OS mais nova para a mais velha */
  pecas: { os: number; descricao: string; data: string }[];
  /** A garantia que ainda vale, se houver (a que vence por último) */
  garantia: { os: OrdemServico; ate: string } | null;
}

/**
 * Tudo que a loja já fez neste aparelho. Só OS entregue conta como peça
 * trocada: orçamento recusado não trocou nada.
 */
export function fichaDoAparelho(
  imei: string | null | undefined,
  ordens: OrdemServico[],
  ignorar?: string,
  hoje?: string
): FichaDoAparelho {
  const doAparelho = ordens
    .filter((o) => o.id !== ignorar && mesmoAparelho(o.imeiSerial, imei))
    .sort((a, b) => txt(b.criadoEm).localeCompare(txt(a.criadoEm)));

  const pecas = doAparelho
    .filter((o) => o.status === "entregue")
    .flatMap((o) =>
      (o.pecas || [])
        .filter((p) => !txt(p.opcao).trim() || txt(p.opcao).trim() === txt(o.opcaoEscolhida).trim())
        .map((p) => ({ os: o.numero, descricao: txt(p.descricao), data: txt(o.entregueEm || o.criadoEm) }))
    )
    .filter((p) => p.descricao);

  let garantia: FichaDoAparelho["garantia"] = null;
  for (const o of doAparelho) {
    const g = garantiaDaOS(o, hoje);
    if (g.situacao === "valida" && (!garantia || g.ate > garantia.ate)) garantia = { os: o, ate: g.ate };
  }
  return { ordens: doAparelho, pecas, garantia };
}
