import { txt } from "./format";
import { somarDiasISO } from "./orcamento-online";
import type { Avaliacao } from "./types";

export type { Avaliacao };

/**
 * Depois da entrega, o link de rastreio pergunta "Como foi o atendimento?".
 *
 * Nota 4 ou 5 é cliente satisfeito: é a hora de pedir a estrela no Google e
 * a licença para mostrar o comentário no site. Nota 1 a 3 NÃO vai para o
 * Google nem para lugar nenhum público — vira um aviso só para o dono,
 * que tem a chance de resolver antes de virar reclamação no Reclame Aqui.
 *
 * O comentário só aparece em /depoimentos com o SIM do cliente, e só com o
 * primeiro nome. Quem decide isso é o banco (depoimentos_publicos), não a
 * tela.
 */


/** Satisfeito o bastante para o Google e para o site */
export const ehPromotora = (nota: number) => nota >= 4;

/**
 * NPS numa escala de 1 a 5: 5 é promotor, 4 é neutro, 1 a 3 é detrator.
 * NPS = % promotores − % detratores, de −100 a 100.
 *
 * O 4 é neutro de propósito: quem dá 4 de 5 está satisfeito, mas não é quem
 * indica a loja para o vizinho. Contar 4 como promotor deixaria o número
 * bonito e inútil.
 */
export function nps(notas: number[]): { nps: number | null; total: number; promotores: number; neutros: number; detratores: number } {
  const validas = notas.filter((n) => Number.isInteger(n) && n >= 1 && n <= 5);
  const promotores = validas.filter((n) => n === 5).length;
  const neutros = validas.filter((n) => n === 4).length;
  const detratores = validas.length - promotores - neutros;
  const total = validas.length;
  return {
    nps: total ? Math.round(((promotores - detratores) / total) * 100) : null,
    total,
    promotores,
    neutros,
    detratores,
  };
}

/** NPS dos últimos `meses` meses, do mais antigo para o atual. Mês sem avaliação vem com nps null. */
export function npsPorMes(avs: Pick<Avaliacao, "nota" | "criadoEm">[], hoje: string, meses = 6) {
  const [a, m] = hoje.slice(0, 7).split("-").map(Number);
  const saida: { mes: string; nps: number | null; total: number; media: number | null }[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(a, m - 1 - i, 1));
    const mes = d.toISOString().slice(0, 7);
    const notas = avs.filter((x) => txt(x.criadoEm).slice(0, 7) === mes).map((x) => x.nota);
    const r = nps(notas);
    saida.push({ mes, nps: r.nps, total: r.total, media: r.total ? Math.round((notas.reduce((s, n) => s + n, 0) / r.total) * 10) / 10 : null });
  }
  return saida;
}

/**
 * Os insatisfeitos que ainda esperam alguém: nota 1 a 3, não resolvidos,
 * dos últimos 60 dias. O mais recente primeiro — é o que ainda dá tempo.
 */
export function insatisfeitosPendentes<A extends Pick<Avaliacao, "nota" | "resolvido" | "criadoEm">>(avs: A[], hoje: string): A[] {
  const limite = somarDiasISO(hoje, -60);
  return avs
    .filter((x) => !ehPromotora(x.nota) && !x.resolvido && txt(x.criadoEm).slice(0, 10) >= limite)
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
}

/** Só o primeiro nome: sobrenome em página pública é dado pessoal à toa. */
export const primeiroNome = (nome?: string | null): string => txt(nome).trim().split(/\s+/)[0] || "";

/** Mensagem para o dono chamar quem ficou insatisfeito. Sem emoji. */
export function mensagemInsatisfeito(nome: string, loja: string, aparelho?: string | null): string {
  const quem = primeiroNome(nome) || "tudo bem";
  const sobre = aparelho ? ` com o ${aparelho}` : "";
  return `Oi, ${quem}! Aqui é da ${loja}. Vi sua avaliação sobre o atendimento${sobre} e quero entender o que aconteceu para resolver. Pode me contar?`;
}

/** Código para colar no site da loja. */
export function codigoWidget(link: string, altura = 460): string {
  const src = `${link}${link.includes("?") ? "&" : "?"}embed=1`;
  return `<iframe src="${src}" title="Depoimentos" loading="lazy" style="width:100%;max-width:640px;height:${altura}px;border:0"></iframe>`;
}

/** Estrelas em texto, para leitor de tela e para o título: "4,8 de 5" */
export const mediaEmTexto = (media: number | null | undefined): string =>
  media === null || media === undefined ? "" : `${media.toFixed(1).replace(".", ",")} de 5`;
