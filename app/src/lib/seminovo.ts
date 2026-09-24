import { txt, formatDate } from "./format";
import type { Produto, Seminovo } from "./types";

/**
 * Seminovos: comprar o usado do cliente (ou pegar na troca) e revender.
 *
 * A avaliação no balcão é onde a loja perde dinheiro: o técnico olha, acha
 * que está bom, paga caro — e descobre em casa a bateria em 71% e o Face ID
 * morto. Aqui a conta é sempre a mesma, com checklist: o preço de mercado
 * do aparelho perfeito (a loja informa, e o sistema lembra por modelo)
 * vezes o desconto de cada defeito. Daí saem dois números: por quanto ele
 * vende nessas condições, e quanto a loja pode oferecer deixando margem.
 *
 * NÃO é módulo com tela no menu: o seminovo é um produto do estoque com a
 * ficha junto (recurso), e a avaliação é um botão em Estoque.
 */

export interface ItemChecklist {
  k: string;
  rotulo: string;
  /** Quanto o valor cai se falhar: 0,30 = 30% */
  fator: number;
}

export const CHECKLIST_USADO: ItemChecklist[] = [
  { k: "tela", rotulo: "Tela sem trinca, toque e imagem perfeitos", fator: 0.3 },
  { k: "biometria", rotulo: "Face ID / digital funcionando", fator: 0.15 },
  { k: "cameras", rotulo: "Câmeras traseira e frontal", fator: 0.1 },
  { k: "carga", rotulo: "Carrega normal", fator: 0.07 },
  { k: "sinal", rotulo: "Chip, sinal e Wi-Fi", fator: 0.07 },
  { k: "som", rotulo: "Alto-falante, microfone e auricular", fator: 0.05 },
  { k: "carcaca", rotulo: "Carcaça sem amassado nem trinca", fator: 0.08 },
];

/** Bateria gasta derruba o preço: abaixo de 80% ninguém compra sem trocar */
export function fatorBateria(saude?: number | null): number {
  const s = Number(saude);
  if (!Number.isFinite(s) || s <= 0) return 1;
  if (s < 80) return 0.88;
  if (s < 85) return 0.95;
  return 1;
}

/** A loja fica com pelo menos isto do preço de venda */
export const MARGEM_PADRAO = 0.35;

export interface Avaliacao {
  /** Preço de venda do aparelho perfeito, informado pela loja */
  referencia: number;
  /** Itens que PASSARAM no teste */
  ok: Record<string, boolean>;
  bateria?: number | null;
}

/** Arredonda para baixo, de 10 em 10: oferta "R$ 1.237" parece chute */
const dezena = (v: number): number => Math.max(0, Math.floor(v / 10) * 10);

export function avaliar(a: Avaliacao, margem = MARGEM_PADRAO): { venda: number; oferta: number; defeitos: string[] } {
  const ref = Math.max(0, Number(a.referencia) || 0);
  const defeitos = CHECKLIST_USADO.filter((i) => !a.ok[i.k]);
  let fator = defeitos.reduce((f, i) => f * (1 - i.fator), 1);
  fator *= fatorBateria(a.bateria);
  const venda = dezena(ref * fator);
  return { venda, oferta: dezena(venda * (1 - margem)), defeitos: defeitos.map((d) => d.rotulo) };
}

/** A chave com que a loja lembra a referência: "iphone 11 128gb" */
export const chaveDoModelo = (modelo?: string | null): string =>
  txt(modelo).toLowerCase().replace(/\s+/g, " ").trim(); // texto-cru-proposital: chave interna

/** Segredo do link público da ficha: sem ele, trocar um número no link abriria o estoque todo */
export function novoTokenDaFicha(): string {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export const linkDaFicha = (origem: string, loja: string | null | undefined, token?: string | null): string => {
  const l = txt(loja).trim();
  const t = txt(token).trim();
  return l && t ? `${origem}#/seminovo/${encodeURIComponent(l)}/${encodeURIComponent(t)}` : "";
};

/** O produto que entra no estoque, com a ficha junto */
export function produtoSeminovo(p: {
  id: string;
  modelo: string;
  venda: number;
  custo: number;
  ficha: Seminovo;
  criadoEm: string;
}): Produto {
  return {
    id: p.id,
    nome: `${txt(p.modelo).trim()} (seminovo)`,
    categoria: "Seminovos",
    quantidade: 1,
    estoqueMinimo: 0,
    custo: p.custo,
    preco: p.venda,
    seminovo: p.ficha,
    criadoEm: p.criadoEm,
  };
}

/** Linha de garantia para a ficha e para o recibo */
export const textoGarantiaSeminovo = (dias?: number | null): string =>
  Number(dias) > 0 ? `${Number(dias)} dias de garantia da loja` : "Sem garantia";

export const dataDaAvaliacao = (f?: Seminovo): string => (f?.avaliadoEm ? formatDate(f.avaliadoEm.slice(0, 10)) : "");
