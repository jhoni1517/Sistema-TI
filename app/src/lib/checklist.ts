import { txt } from "./format";
import { hojeISO, soData } from "./contas";
import type { TarefaDiaria } from "./types";

/**
 * Checklist diário: o que precisa acontecer todo dia.
 *
 * Não é agenda e não é conta a pagar. A agenda guarda compromisso com data
 * — "dia 14, buscar o notebook do Fulano". Isto aqui é o que se repete sem
 * data nenhuma: beber água, conferir a bancada, passar no fornecedor às
 * duas, fechar o caixa antes de sair.
 *
 * Três decisões que o formato precisa respeitar:
 *
 * 1. **Feito é POR DIA, não uma bandeira.** Um campo `feito` obrigaria
 *    alguém a desmarcar tudo toda manhã, e ninguém faz isso — no terceiro
 *    dia a lista está toda marcada e não quer dizer mais nada. Guardando os
 *    dias em que foi feita, ela nasce limpa todo dia sozinha.
 * 2. **Horário é opcional.** "Beber água" não tem hora; "passar no
 *    fornecedor" tem. Obrigar horário faria a pessoa inventar um, e aí o
 *    lembrete toca na hora errada e vira ruído.
 * 3. **O histórico não pode crescer para sempre.** A tabela é lida inteira
 *    a cada carga, como `produtos` — e foi foto em base64 lida a cada F5
 *    que ensinou essa lição aqui. Guardamos os últimos 90 dias, que é o
 *    bastante para ver constância e não pesa no 4G do balcão.
 */

const n = (v?: number | null): number => Number(v) || 0;

/** Quantos dias de histórico ficam guardados em cada tarefa */
export const DIAS_GUARDADOS = 90;

/** Domingo a sábado, na ordem que o JavaScript usa */
export const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/**
 * Dia da semana de uma data pura, em UTC.
 *
 * Em UTC de propósito, como toda aritmética de data da casa: `new
 * Date("2026-08-02")` já é meia-noite UTC, e ler o dia em hora local
 * devolveria o dia anterior em qualquer fuso negativo.
 */
export const diaDaSemana = (dia: string): number =>
  new Date(soData(dia) + "T00:00:00Z").getUTCDay();

/** A hora AGORA no relógio de quem está no balcão, como "HH:MM" */
export function horaAgora(d = new Date()): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Só o horário normalizado, ou vazio quando não tem */
export const horarioDe = (t: TarefaDiaria): string => {
  const h = txt(t.horario).trim();
  return /^\d{2}:\d{2}$/.test(h) ? h : "";
};

/** Esta tarefa vale no dia informado? */
export function valeHoje(t: TarefaDiaria, hoje = hojeISO()): boolean {
  if (t.ativo === false) return false;
  const dias = t.dias || [];
  // Sem dias marcados = todo dia. É o caso comum e não deve dar trabalho.
  if (dias.length === 0) return true;
  return dias.includes(diaDaSemana(hoje));
}

export const estaFeita = (t: TarefaDiaria, dia = hojeISO()): boolean =>
  (t.feitoEm || []).includes(soData(dia));

/**
 * Marca ou desmarca, devolvendo a tarefa nova.
 *
 * Poda o histórico na mesma passada: é o único momento em que a tarefa é
 * gravada, então é aqui que ela não pode engordar.
 */
export function marcar(t: TarefaDiaria, dia: string, feito: boolean): TarefaDiaria {
  const d = soData(dia);
  const atual = new Set(t.feitoEm || []);
  if (feito) atual.add(d);
  else atual.delete(d);

  const limite = new Date(Date.parse(d + "T00:00:00Z") - DIAS_GUARDADOS * 86400000)
    .toISOString()
    .slice(0, 10);

  return {
    ...t,
    feitoEm: [...atual].filter((x) => x >= limite).sort(),
  };
}

/**
 * As tarefas do dia, na ordem em que o dia acontece.
 *
 * Quem tem horário vem primeiro, em ordem de relógio; quem não tem vai para
 * o fim. Misturar as duas quebraria a leitura de cima para baixo, que é a
 * única coisa que um checklist precisa fazer bem.
 */
export function tarefasDoDia(tarefas: TarefaDiaria[], hoje = hojeISO()): TarefaDiaria[] {
  return tarefas
    .filter((t) => valeHoje(t, hoje))
    .sort((a, b) => {
      const ha = horarioDe(a);
      const hb = horarioDe(b);
      if (ha && hb) return ha.localeCompare(hb) || txt(a.titulo).localeCompare(txt(b.titulo));
      if (ha) return -1;
      if (hb) return 1;
      return txt(a.titulo).localeCompare(txt(b.titulo));
    });
}

export interface Progresso {
  feitas: number;
  total: number;
  /** De 0 a 100, arredondado. Zero tarefas devolve 0, não NaN. */
  percentual: number;
  /** Fechou o dia? */
  completo: boolean;
}

export function progressoDoDia(tarefas: TarefaDiaria[], hoje = hojeISO()): Progresso {
  const doDia = tarefasDoDia(tarefas, hoje);
  const feitas = doDia.filter((t) => estaFeita(t, hoje)).length;
  const total = doDia.length;
  return {
    feitas,
    total,
    percentual: total > 0 ? Math.round((feitas / total) * 100) : 0,
    completo: total > 0 && feitas === total,
  };
}

/**
 * O que já passou da hora e ainda não foi feito.
 *
 * É a lista que vira lembrete. Tarefa sem horário nunca entra: ela não tem
 * hora para cobrar, e cobrar a toda hora é o jeito mais rápido de a pessoa
 * desligar os avisos.
 */
export function pendentesAgora(
  tarefas: TarefaDiaria[],
  hoje = hojeISO(),
  agora = horaAgora()
): TarefaDiaria[] {
  return tarefasDoDia(tarefas, hoje).filter((t) => {
    const h = horarioDe(t);
    return !!h && h <= agora && !estaFeita(t, hoje);
  });
}

/** A próxima que ainda vai chegar hoje, para a tela dizer o que vem */
export function proximaDoDia(
  tarefas: TarefaDiaria[],
  hoje = hojeISO(),
  agora = horaAgora()
): TarefaDiaria | undefined {
  return tarefasDoDia(tarefas, hoje).find((t) => {
    const h = horarioDe(t);
    return !!h && h > agora && !estaFeita(t, hoje);
  });
}

/**
 * Sequência de dias seguidos em que a tarefa foi cumprida, contando de trás
 * para a frente. É o número que faz alguém não querer quebrar a corrente.
 *
 * Só conta os dias em que a tarefa VALIA: quem marcou "só de segunda a
 * sexta" não perde a sequência por causa do domingo.
 */
export function sequencia(t: TarefaDiaria, hoje = hojeISO()): number {
  const feitos = new Set(t.feitoEm || []);
  let dias = 0;
  let cursor = soData(hoje);

  for (let i = 0; i <= DIAS_GUARDADOS; i++) {
    if (valeHoje(t, cursor)) {
      if (feitos.has(cursor)) dias++;
      // O dia de hoje ainda pode ser cumprido: não quebra a corrente.
      else if (cursor !== soData(hoje)) break;
    }
    cursor = new Date(Date.parse(cursor + "T00:00:00Z") - 86400000)
      .toISOString()
      .slice(0, 10);
  }
  return dias;
}

/**
 * O que impede de salvar a tarefa, em português. Vazio = pode gravar.
 */
export function problemaNaTarefa(t: Partial<TarefaDiaria>): string {
  if (!txt(t.titulo).trim()) return "Escreva o que precisa ser feito.";

  const h = txt(t.horario).trim();
  if (h) {
    if (!/^\d{1,2}:\d{2}$/.test(h)) return "O horário é no formato 14:30.";
    const [hh, mm] = h.split(":").map(Number);
    if (hh > 23 || mm > 59) return "Esse horário não existe. Use de 00:00 a 23:59.";
  }

  for (const d of t.dias || []) {
    if (n(d) < 0 || n(d) > 6) return "Dia da semana inválido.";
  }

  // Lembrete sem horário não teria quando tocar, e a pessoa ficaria
  // esperando por um aviso que nunca vem.
  if (t.avisar && !h) {
    return "Para avisar no Telegram, a tarefa precisa de um horário.";
  }
  return "";
}

/**
 * O texto do lembrete, pronto para o Telegram.
 *
 * Sem emoji: em alguns aparelhos chegam como "?" e sujam o recado.
 */
export function mensagemDoLembrete(tarefas: TarefaDiaria[]): string {
  if (tarefas.length === 0) return "";
  const linhas = tarefas.map((t) => `- ${horarioDe(t)} ${txt(t.titulo).trim()}`.trim());
  return `*Checklist do dia*\n\n${linhas.join("\n")}`;
}
