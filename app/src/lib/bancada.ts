import { normalizar, txt } from "./format";
import type { OrdemServico, OSStatus } from "./types";

/**
 * Modo bancada: o celular apoiado na bancada, com as OS do técnico e botões
 * grandes. Mão suja de pasta térmica não acerta botão pequeno, e o técnico
 * não vai abrir o sistema inteiro para dizer "comecei".
 *
 * O cronômetro soa como controle, mas é o contrário: é a prova de que o
 * conserto de R$ 80 levou três horas. Sem ele, o preço da mão de obra é
 * chute, e a produtividade só conta OS, não tempo.
 *
 * Tempo em segundos, somado a cada pausa. Um cronômetro por técnico: ligar
 * outra OS pausa a que estava rodando.
 */

export const ABERTAS: OSStatus[] = ["aberta", "em_analise", "aguardando_aprovacao", "aprovada", "em_reparo", "aguardando_peca"];

const segundosEntre = (de: string, ate: string) => Math.max(0, Math.round((Date.parse(ate) - Date.parse(de)) / 1000));

export const rodando = (o: Pick<OrdemServico, "bancada">): boolean => !!o.bancada?.inicio;

/** Tempo total de bancada, contando o trecho que está rodando agora. */
export function tempoDeBancada(o: Pick<OrdemServico, "bancada">, agora: string): number {
  const b = o.bancada;
  if (!b) return 0;
  return (Number(b.acumulado) || 0) + (b.inicio ? segundosEntre(b.inicio, agora) : 0);
}

/** Para o cronômetro somando o trecho. Parado continua parado. */
export function pausar<O extends Pick<OrdemServico, "bancada">>(o: O, agora: string): O {
  if (!o.bancada?.inicio) return o;
  return { ...o, bancada: { acumulado: tempoDeBancada(o, agora) } };
}

/** Liga o cronômetro e põe a OS em reparo. */
export function iniciar(o: OrdemServico, agora: string): OrdemServico {
  if (rodando(o)) return o;
  const status: OSStatus = o.status === "em_reparo" ? o.status : "em_reparo";
  return {
    ...o,
    status,
    bancada: { acumulado: Number(o.bancada?.acumulado) || 0, inicio: agora },
    historico: status !== o.status ? [...(o.historico || []), { data: agora, status }] : o.historico,
    atualizadoEm: agora,
  };
}

/** Pausa e muda a situação (aguardando peça, pronta). */
export function pausarCom(o: OrdemServico, status: OSStatus, agora: string): OrdemServico {
  const p = pausar(o, agora);
  if (p.status === status) return { ...p, atualizadoEm: agora };
  return {
    ...p,
    status,
    prontaEm: status === "pronta" ? p.prontaEm || agora : p.prontaEm,
    historico: [...(p.historico || []), { data: agora, status }],
    atualizadoEm: agora,
  };
}

/** A OS é deste técnico? Sem acento e sem maiúscula: "José" é "jose". */
export const doTecnico = (o: Pick<OrdemServico, "tecnico">, tecnico: string): boolean =>
  !!tecnico && normalizar(o.tecnico) === normalizar(tecnico);

/**
 * As OS do técnico na bancada: a que está rodando primeiro, depois em
 * reparo, aprovadas e o resto; dentro de cada grupo, a previsão mais cedo.
 */
export function minhasOS(ordens: OrdemServico[], tecnico: string): OrdemServico[] {
  const peso: Partial<Record<OSStatus, number>> = { em_reparo: 1, aprovada: 2, aberta: 3, em_analise: 3, aguardando_peca: 4, aguardando_aprovacao: 5 };
  return ordens
    .filter((o) => ABERTAS.includes(o.status) && doTecnico(o, tecnico))
    .sort(
      (a, b) =>
        Number(rodando(b)) - Number(rodando(a)) ||
        (peso[a.status] ?? 9) - (peso[b.status] ?? 9) ||
        txt(a.previsaoEntrega || "9999").localeCompare(txt(b.previsaoEntrega || "9999")) ||
        a.numero - b.numero
    );
}

/** Os técnicos que aparecem nas OS abertas, para escolher no aparelho da bancada. */
export function tecnicosDasOS(ordens: OrdemServico[]): string[] {
  const vistos = new Map<string, string>();
  for (const o of ordens) {
    const t = txt(o.tecnico).trim();
    if (!t) continue;
    const k = normalizar(t);
    const antes = vistos.get(k);
    // "jose" digitado às pressas perde para "José" escrito direito.
    // texto-cru-proposital: compara a grafia, não o nome
    if (!antes || (antes === antes.toLowerCase() && t !== t.toLowerCase())) vistos.set(k, t);
  }
  return [...vistos.values()].sort((a, b) => a.localeCompare(b));
}

/** 3725 → "1h 02min"; 45 → "0min 45s" */
export function formatarTempo(seg: number): string {
  const s = Math.max(0, Math.floor(seg));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}min`;
  return `${m}min ${String(s % 60).padStart(2, "0")}s`;
}

/** Relógio de parede: "01:02:05" */
export function relogio(seg: number): string {
  const s = Math.max(0, Math.floor(seg));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((x) => String(x).padStart(2, "0")).join(":");
}
