import { txt, normalizar } from "./format";
import { parecenca } from "./leitura-nota";
import { totalOS } from "./calc";
import { pecasEfetivas } from "./orcamento";
import type { OrdemServico, PecaOS } from "./types";

/**
 * "Já pegamos um desse com esse defeito? Quanto cobramos?"
 *
 * A resposta estava no histórico da própria loja e ninguém tinha como
 * achar: o técnico lembrava de cabeça, ou orçava de novo do zero — e o
 * mesmo conserto saía R$ 180 numa semana e R$ 260 na outra.
 *
 * Tudo aqui é SUGESTÃO, e cada número diz de onde veio ("baseado em 12 OS
 * suas"). A tela só preenche um campo quando o técnico clica em "Usar".
 *
 * Só OS concluídas entram na conta (pronta ou entregue): orçamento recusado
 * ou OS aberta ainda não diz quanto o conserto custou de verdade.
 */

export interface AlvoDaSugestao {
  id?: string;
  tipoAparelho?: string;
  marca?: string;
  modelo?: string;
  defeitoRelatado?: string;
}

export interface PecaSugerida {
  descricao: string;
  produtoId?: string;
  /** Em quantas das OS parecidas ela apareceu */
  vezes: number;
  precoMedio: number;
  custoMedio: number;
}

export interface Sugestao {
  /** Quantas OS da loja embasam os números */
  base: number;
  /** "baseado em 12 OS suas" — a origem, escrita */
  origem: string;
  precoMedio: number;
  precoMin: number;
  precoMax: number;
  maoDeObraMedia: number;
  /** Dias da abertura até ficar pronta. Nulo se nenhuma tinha as datas. */
  diasMedios: number | null;
  /** Peças que apareceram em pelo menos um terço das OS parecidas */
  pecas: PecaSugerida[];
  /** As OS usadas, para a tela deixar conferir uma por uma */
  numeros: number[];
}

/** Menos que isso não é padrão, é coincidência */
export const BASE_MINIMA = 2;
const MAX_PARECIDAS = 30;

const n = (v?: number | null): number => Number(v) || 0;
const media = (xs: number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const reais = (v: number): number => Math.round(v * 100) / 100;

/** Dá para sugerir? Sem modelo e defeito, qualquer número seria chute. */
export const temDadosParaSugerir = (a: AlvoDaSugestao): boolean =>
  txt(a.modelo).trim().length >= 2 && txt(a.defeitoRelatado).trim().length >= 4;

/**
 * Quanto uma OS antiga parece com a de agora, de 0 a 1.
 *
 * O modelo pesa mais que o defeito: "tela quebrada" num A54 e num iPhone 13
 * são consertos de preço completamente diferente. Modelo diferente zera —
 * média de preço misturando aparelhos é número que engana.
 */
export function semelhanca(antiga: OrdemServico, alvo: AlvoDaSugestao): number {
  const mA = normalizar(`${txt(antiga.marca)} ${txt(antiga.modelo)}`);
  const mB = normalizar(`${txt(alvo.marca)} ${txt(alvo.modelo)}`);
  const modelo = normalizar(antiga.modelo) === normalizar(alvo.modelo) ? 1 : parecenca(mA, mB);
  if (modelo < 0.6) return 0;
  const defeito = Math.max(
    parecenca(txt(antiga.defeitoRelatado), txt(alvo.defeitoRelatado)),
    parecenca(txt(antiga.defeitoConstatado), txt(alvo.defeitoRelatado))
  );
  if (defeito < 0.3) return 0;
  return 0.6 * modelo + 0.4 * defeito;
}

function dias(o: OrdemServico): number | null {
  const a = Date.parse(txt(o.criadoEm));
  const b = Date.parse(txt(o.prontaEm || o.entregueEm));
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.round((b - a) / 86400000);
}

/**
 * A sugestão a partir do histórico da loja. Nulo quando não há base — a
 * tela diz "ainda não tem OS parecida" em vez de mostrar média de uma OS só.
 */
export function sugerir(ordens: OrdemServico[], alvo: AlvoDaSugestao): Sugestao | null {
  if (!temDadosParaSugerir(alvo)) return null;
  const parecidas = ordens
    .filter((o) => o.id !== alvo.id && (o.status === "pronta" || o.status === "entregue"))
    .map((o) => ({ o, s: semelhanca(o, alvo) }))
    .filter((x) => x.s > 0 && totalOS(x.o) > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, MAX_PARECIDAS)
    .map((x) => x.o);
  if (parecidas.length < BASE_MINIMA) return null;

  const precos = parecidas.map((o) => totalOS(o));
  const tempos = parecidas.map(dias).filter((d): d is number => d !== null);

  // Peças agrupadas pelo nome sem acento: "Tela A54" e "TELA A54" são a mesma.
  const grupos = new Map<string, { pecas: PecaOS[]; os: Set<string> }>();
  for (const o of parecidas) {
    for (const p of pecasEfetivas(o)) {
      const chave = normalizar(p.descricao);
      if (!chave) continue;
      const g = grupos.get(chave) || { pecas: [], os: new Set<string>() };
      g.pecas.push(p);
      g.os.add(o.id);
      grupos.set(chave, g);
    }
  }
  const pecas: PecaSugerida[] = [...grupos.values()]
    .filter((g) => g.os.size >= Math.max(1, Math.ceil(parecidas.length / 3)))
    .map((g) => ({
      descricao: txt(g.pecas[0].descricao),
      produtoId: g.pecas.find((p) => p.produtoId)?.produtoId,
      vezes: g.os.size,
      precoMedio: reais(media(g.pecas.map((p) => n(p.precoUnit)))),
      custoMedio: reais(media(g.pecas.map((p) => n(p.custoUnit)))),
    }))
    .sort((a, b) => b.vezes - a.vezes)
    .slice(0, 5);

  return {
    base: parecidas.length,
    origem: `baseado em ${parecidas.length} OS suas`,
    precoMedio: reais(media(precos)),
    precoMin: reais(Math.min(...precos)),
    precoMax: reais(Math.max(...precos)),
    maoDeObraMedia: reais(media(parecidas.map((o) => n(o.maoDeObra)))),
    diasMedios: tempos.length ? Math.round(media(tempos)) : null,
    pecas,
    numeros: parecidas.map((o) => o.numero),
  };
}

/**
 * O resumo que vai para a IA junto do defeito. Só números e nomes de peça:
 * nome de cliente não tem por que sair da loja para o Google.
 */
export function resumoParaIA(s: Sugestao | null): string {
  if (!s) return "";
  return (
    `${s.base} OS parecidas na loja. Preço médio R$ ${s.precoMedio.toFixed(2)} ` +
    `(de ${s.precoMin.toFixed(2)} a ${s.precoMax.toFixed(2)}).` +
    (s.diasMedios !== null ? ` Ficaram prontas em ${s.diasMedios} dia(s) em média.` : "") +
    (s.pecas.length ? ` Peças mais usadas: ${s.pecas.map((p) => p.descricao).join(", ")}.` : "")
  );
}

/* ------------------------------------------------------------------ */
/* A resposta da IA                                                    */
/* ------------------------------------------------------------------ */

export type Chance = "alta" | "media" | "baixa";

export interface DiagnosticoIA {
  causas: { causa: string; chance: Chance }[];
  testes: string[];
  observacao: string;
}

const linha = (v: unknown, max = 160): string =>
  txt(typeof v === "string" ? v : "")
    .replace(/[\u0000-\u001f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/**
 * A resposta da IA validada. Lixo vira erro com saída; campo fora do
 * formato é descartado, nunca mostrado cru na tela.
 */
export function lerDiagnosticoDaIA(bruto: unknown): DiagnosticoIA {
  let obj: Record<string, unknown>;
  if (bruto && typeof bruto === "object") obj = bruto as Record<string, unknown>;
  else {
    const s = txt(bruto as string).trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    const i = s.indexOf("{");
    const f = s.lastIndexOf("}");
    if (i < 0 || f <= i) throw new Error("A IA não respondeu nada aproveitável. Tenta de novo.");
    try {
      obj = JSON.parse(s.slice(i, f + 1));
    } catch {
      throw new Error("A IA respondeu pela metade. Tenta de novo.");
    }
  }
  const chances: Chance[] = ["alta", "media", "baixa"];
  const causas = (Array.isArray(obj.causas) ? obj.causas : [])
    .map((c: unknown) => {
      const x = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
      const chance = normalizar(linha(x.chance)) as Chance;
      return { causa: linha(x.causa), chance: chances.includes(chance) ? chance : "media" };
    })
    .filter((c: { causa: string }) => c.causa)
    .slice(0, 5);
  const testes = (Array.isArray(obj.testes) ? obj.testes : [])
    .map((t: unknown) => linha(t))
    .filter(Boolean)
    .slice(0, 8);
  if (causas.length === 0 && testes.length === 0) {
    throw new Error("A IA não trouxe nenhuma causa. Descreva o defeito com mais detalhe e tente de novo.");
  }
  return { causas, testes, observacao: linha(obj.observacao, 300) };
}

/** O texto que o "Usar" põe no laudo, para o técnico editar */
export function laudoSugerido(d: DiagnosticoIA): string {
  const partes: string[] = [];
  if (d.causas.length) partes.push("Possíveis causas: " + d.causas.map((c) => `${c.causa} (${c.chance})`).join("; ") + ".");
  if (d.testes.length) partes.push("Testes: " + d.testes.join("; ") + ".");
  return partes.join("\n");
}
