import { txt } from "./format";
import { nomesDasOpcoes } from "./orcamento";
import type { OrdemServico, PecaOS } from "./types";

/**
 * Orçamento em 3 níveis: Econômica, Recomendada e Premium.
 *
 * Com um preço só, o cliente decide entre "faço" e "não faço". Com três,
 * ele decide QUAL faz — e a maioria fica no do meio. É a mesma escolha de
 * orçamentos que já existe (lib/orcamento.ts); aqui só mora o jeito de
 * montar, de explicar e de contar quem escolheu o quê.
 *
 * A garantia vai NO NOME da opção ("Premium · garantia 180 dias"): é o que
 * o cliente vê no link, e é daí que a garantia da OS sai quando ele
 * escolhe. Sem campo novo no banco, a página pública e a conta em SQL
 * continuam as mesmas.
 */

export type Nivel = "economica" | "recomendada" | "premium";

export const NIVEIS: { k: Nivel; nome: string; garantia: number; explica: string }[] = [
  { k: "economica", nome: "Econômica", garantia: 30, explica: "Peça paralela de boa qualidade. Resolve e cabe no bolso." },
  { k: "recomendada", nome: "Recomendada", garantia: 90, explica: "Peça de primeira linha. É a que a gente indica." },
  { k: "premium", nome: "Premium", garantia: 180, explica: "Peça original, com a maior garantia." },
];

export const nomeDoNivel = (k: Nivel, dias?: number): string => {
  const n = NIVEIS.find((x) => x.k === k)!;
  return `${n.nome} · garantia ${dias ?? n.garantia} dias`;
};

/** "Premium · garantia 180 dias" -> { nivel: premium, dias: 180 } */
export function nivelDaOpcao(nome?: string | null): { nivel: Nivel; dias: number } | null {
  const m = txt(nome).trim().match(/^(Econômica|Recomendada|Premium)\s*·\s*garantia\s+(\d{1,4})\s+dias$/i);
  if (!m) return null;
  const nivel = NIVEIS.find((x) => x.nome.toLowerCase() === m[1].toLowerCase())!.k; // texto-cru-proposital: nome fixo
  return { nivel, dias: Number(m[2]) };
}

/** Todas as opções da OS são níveis? É o que liga o "lado a lado". */
export const eOrcamentoEmNiveis = (nomes: string[]): boolean =>
  nomes.length >= 2 && nomes.every((n) => nivelDaOpcao(n));

/**
 * Transforma o orçamento em 3 níveis. O que já estava digitado vira a
 * Recomendada — é o que o técnico orçou primeiro — e ela vai na FRENTE da
 * lista: sem escolha registrada, a primeira opção é a que vale (no sistema
 * e no SQL da página do cliente), então a sugestão da loja é a do meio.
 */
export function paraTresNiveis(o: OrdemServico): OrdemServico {
  const ja = (o.pecas || []).filter((p) => txt(p.descricao).trim() || Number(p.precoUnit) > 0 || p.produtoId);
  const vazia = (k: Nivel): PecaOS => ({ descricao: "", quantidade: 1, custoUnit: 0, precoUnit: 0, opcao: nomeDoNivel(k) });
  return {
    ...o,
    pecas: [
      ...(ja.length ? ja.map((p) => ({ ...p, opcao: nomeDoNivel("recomendada") })) : [vazia("recomendada")]),
      vazia("economica"),
      vazia("premium"),
    ],
    // Quem escolhe é o cliente. Marcar aqui mandaria um orçamento já
    // "aprovado" pela loja.
    opcaoEscolhida: undefined,
  };
}

/** Na ordem da prateleira: econômica, recomendada, premium */
export const ordemDosNiveis = <T extends { nome: string }>(lista: T[]): T[] =>
  [...lista].sort(
    (a, b) =>
      NIVEIS.findIndex((n) => n.k === nivelDaOpcao(a.nome)?.nivel) -
      NIVEIS.findIndex((n) => n.k === nivelDaOpcao(b.nome)?.nivel)
  );

/**
 * A garantia da OS passa a ser a do nível escolhido. Roda em toda gravação
 * da OS: o cliente escolhe pelo link, e na próxima vez que a loja mexe na
 * OS (mudar a situação, entregar) a garantia já é a certa — no recibo, no
 * rastreio e na área do cliente.
 */
export function aplicarGarantiaDoNivel(o: OrdemServico): OrdemServico {
  const nivel = nivelDaOpcao(o.opcaoEscolhida);
  if (!nivel || !nomesDasOpcoes(o).includes(txt(o.opcaoEscolhida).trim())) return o;
  return o.garantiaDias === nivel.dias ? o : { ...o, garantiaDias: nivel.dias };
}

export interface TaxaDeEscolha {
  total: number;
  porNivel: Record<Nivel, { n: number; pct: number }>;
}

/**
 * Quem escolheu o quê. Conta só OS com a escolha registrada e que não foi
 * cancelada: orçamento recusado não escolheu nível nenhum.
 */
export function taxaDeEscolha(ordens: OrdemServico[]): TaxaDeEscolha {
  const porNivel = { economica: { n: 0, pct: 0 }, recomendada: { n: 0, pct: 0 }, premium: { n: 0, pct: 0 } };
  let total = 0;
  for (const o of ordens) {
    if (o.status === "cancelada" || o.recusadoEm) continue;
    if (!eOrcamentoEmNiveis(nomesDasOpcoes(o))) continue;
    const nivel = nivelDaOpcao(o.opcaoEscolhida);
    if (!nivel || !nomesDasOpcoes(o).includes(txt(o.opcaoEscolhida).trim())) continue;
    porNivel[nivel.nivel].n++;
    total++;
  }
  for (const k of Object.keys(porNivel) as Nivel[]) {
    porNivel[k].pct = total ? Math.round((porNivel[k].n / total) * 100) : 0;
  }
  return { total, porNivel };
}
