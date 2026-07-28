import { txt } from "./format";
import { soData, hojeISO, diasAteVencer } from "./contas";
import type { Cliente, Evento, RepetirEvento, TipoEvento } from "./types";

/**
 * Agenda: ocorrências, aniversários e avisos.
 *
 * Toda conta de data mora aqui, com teste, em vez de espalhada pelas telas.
 * As armadilhas conhecidas:
 *
 *   - Evento anual em 29/02 some em ano não bissexto se ninguém tratar.
 *   - Evento mensal no dia 31 pula fevereiro na soma ingênua.
 *   - Somar horas locais desloca o dia inteiro dependendo do fuso; por isso
 *     a data é sempre string AAAA-MM-DD e a aritmética é feita em UTC.
 */

export interface Ocorrencia {
  /** AAAA-MM-DD em que acontece */
  data: string;
  titulo: string;
  tipo: TipoEvento;
  hora?: string;
  local?: string;
  clienteId?: string;
  observacoes?: string;
  concluido?: boolean;
  /** Id do evento cadastrado. Aniversário derivado do cliente não tem. */
  eventoId?: string;
  /** Aniversário vem do cadastro do cliente, não da agenda */
  automatico?: boolean;
  /** Quantos anos o cliente faz (só aniversário, e só se o ano for real) */
  idade?: number;
}

const UTC = (iso: string) => new Date(soData(iso) + "T00:00:00Z");

const paraISO = (d: Date) => d.toISOString().slice(0, 10);

/** Último dia do mês, para prender o dia 31 sem pular para o mês seguinte */
const ultimoDia = (ano: number, mes0: number) =>
  new Date(Date.UTC(ano, mes0 + 1, 0)).getUTCDate();

/**
 * Avança uma data conforme a repetição, preservando o dia original.
 *
 * O dia original importa: um evento no dia 31 que caiu para 28 em fevereiro
 * precisa voltar para 31 em março. Guardar só a última data faria ele ficar
 * preso no 28 para sempre.
 */
export function avancar(
  data: string,
  repetir: RepetirEvento,
  diaOriginal?: number
): string {
  const base = UTC(data);
  if (Number.isNaN(base.getTime()) || repetir === "nenhuma") return soData(data);

  if (repetir === "semanal") {
    base.setUTCDate(base.getUTCDate() + 7);
    return paraISO(base);
  }

  const passo = repetir === "anual" ? 12 : 1;
  const dia = diaOriginal || base.getUTCDate();
  const alvoMes = base.getUTCMonth() + passo;
  const ano = base.getUTCFullYear() + Math.floor(alvoMes / 12);
  const mes0 = ((alvoMes % 12) + 12) % 12;
  // 29/02 em ano comum vira 28/02; dia 31 vira 30 ou 28 conforme o mês.
  return paraISO(new Date(Date.UTC(ano, mes0, Math.min(dia, ultimoDia(ano, mes0)))));
}

/**
 * Todas as datas em que o evento acontece dentro do intervalo.
 * Limite de 400 repetições: agenda de loja não precisa de mais que isso, e
 * sem teto um dado ruim vira laço infinito na tela.
 */
export function ocorrenciasEntre(evento: Evento, de: string, ate: string): string[] {
  const inicio = soData(evento.data);
  const repetir = evento.repetir || "nenhuma";
  if (repetir === "nenhuma") return inicio >= soData(de) && inicio <= soData(ate) ? [inicio] : [];

  const diaOriginal = UTC(inicio).getUTCDate();
  const saida: string[] = [];
  let atual = inicio;
  for (let i = 0; i < 400; i++) {
    if (atual > soData(ate)) break;
    if (atual >= soData(de)) saida.push(atual);
    const proxima = avancar(atual, repetir, diaOriginal);
    if (proxima <= atual) break; // trava de segurança
    atual = proxima;
  }
  return saida;
}

/** Próxima vez que o evento acontece a partir de hoje (null se já passou) */
export function proximaOcorrencia(evento: Evento, hoje = hojeISO()): string | null {
  const repetir = evento.repetir || "nenhuma";
  const inicio = soData(evento.data);
  if (repetir === "nenhuma") return inicio >= soData(hoje) ? inicio : null;

  const diaOriginal = UTC(inicio).getUTCDate();
  let atual = inicio;
  for (let i = 0; i < 400; i++) {
    if (atual >= soData(hoje)) return atual;
    const proxima = avancar(atual, repetir, diaOriginal);
    if (proxima <= atual) return null;
    atual = proxima;
  }
  return null;
}

/**
 * Aniversário do cliente na virada do ano pedido.
 * O ano cadastrado não importa — só dia e mês. Quem nasceu em 29/02
 * comemora em 28/02 nos anos comuns, que é o que o cartório faz.
 */
export function aniversarioNoAno(nascimento: string, ano: number): string | null {
  const d = soData(nascimento);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const mes0 = Number(d.slice(5, 7)) - 1;
  const dia = Number(d.slice(8, 10));
  if (mes0 < 0 || mes0 > 11 || dia < 1 || dia > 31) return null;
  return paraISO(new Date(Date.UTC(ano, mes0, Math.min(dia, ultimoDia(ano, mes0)))));
}

/** Aniversários de clientes que caem no intervalo, como ocorrências */
export function aniversariosEntre(
  clientes: Cliente[],
  de: string,
  ate: string
): Ocorrencia[] {
  const anoDe = Number(soData(de).slice(0, 4));
  const anoAte = Number(soData(ate).slice(0, 4));
  const saida: Ocorrencia[] = [];

  for (const c of clientes) {
    if (!txt(c.nascimento)) continue;
    for (let ano = anoDe; ano <= anoAte; ano++) {
      const data = aniversarioNoAno(txt(c.nascimento), ano);
      if (!data || data < soData(de) || data > soData(ate)) continue;
      const anoNasc = Number(txt(c.nascimento).slice(0, 4));
      saida.push({
        data,
        titulo: `Aniversário de ${c.nome}`,
        tipo: "aniversario",
        clienteId: c.id,
        automatico: true,
        // Ano 1900 ou parecido costuma ser "não sei o ano"; não inventa idade.
        idade: anoNasc > 1900 ? ano - anoNasc : undefined,
      });
    }
  }
  return saida;
}

/** Tudo que acontece no intervalo, já ordenado por data e hora */
export function agendaEntre(
  eventos: Evento[],
  clientes: Cliente[],
  de: string,
  ate: string
): Ocorrencia[] {
  const saida: Ocorrencia[] = [];

  for (const e of eventos) {
    for (const data of ocorrenciasEntre(e, de, ate)) {
      saida.push({
        data,
        titulo: e.titulo,
        tipo: e.tipo,
        hora: txt(e.hora) || undefined,
        local: txt(e.local) || undefined,
        clienteId: e.clienteId,
        observacoes: txt(e.observacoes) || undefined,
        // Concluir vale para a ocorrência que já passou, não para as futuras
        // de um evento que se repete.
        concluido: (e.repetir || "nenhuma") === "nenhuma" ? e.concluido : false,
        eventoId: e.id,
      });
    }
  }

  saida.push(...aniversariosEntre(clientes, de, ate));

  return saida.sort(
    (a, b) => a.data.localeCompare(b.data) || txt(a.hora).localeCompare(txt(b.hora))
  );
}

/** Primeiro e último dia do mês, no formato AAAA-MM-DD */
export function limitesDoMes(ano: number, mes1a12: number): { de: string; ate: string } {
  const mes0 = mes1a12 - 1;
  return {
    de: paraISO(new Date(Date.UTC(ano, mes0, 1))),
    ate: paraISO(new Date(Date.UTC(ano, mes0 + 1, 0))),
  };
}

/**
 * Grade do mês para desenhar o calendário: sempre semanas inteiras,
 * começando no domingo, com os dias vizinhos preenchendo as pontas.
 */
export function gradeDoMes(ano: number, mes1a12: number): string[] {
  const primeiro = new Date(Date.UTC(ano, mes1a12 - 1, 1));
  const inicio = new Date(primeiro);
  inicio.setUTCDate(inicio.getUTCDate() - primeiro.getUTCDay());
  const dias: string[] = [];
  for (let i = 0; i < 42; i++) {
    dias.push(paraISO(inicio));
    inicio.setUTCDate(inicio.getUTCDate() + 1);
  }
  return dias;
}

/**
 * O que merece aviso hoje.
 *
 * Um evento entra quando falta o tanto de dias que ele pediu (ou menos) e
 * ainda não passou. Aniversário avisa com 1 dia de antecedência por padrão:
 * mandar parabéns no dia é o mínimo, mas dá tempo de separar um brinde.
 */
export function paraAvisarHoje(
  eventos: Evento[],
  clientes: Cliente[],
  hoje = hojeISO()
): Ocorrencia[] {
  const limite = avancarDias(hoje, 30);
  return agendaEntre(eventos, clientes, hoje, limite).filter((o) => {
    if (o.concluido) return false;
    const faltam = diasAteVencer(o.data, hoje);
    if (faltam < 0) return false;
    const antecedencia = o.automatico
      ? 1
      : antecedenciaDe(eventos, o.eventoId);
    return faltam <= antecedencia;
  });
}

const antecedenciaDe = (eventos: Evento[], id?: string): number => {
  const e = eventos.find((x) => x.id === id);
  const v = e?.avisarDiasAntes;
  return typeof v === "number" && v >= 0 ? v : 0;
};

export const avancarDias = (data: string, dias: number): string => {
  const d = UTC(data);
  d.setUTCDate(d.getUTCDate() + dias);
  return paraISO(d);
};

/** "hoje", "amanhã", "em 3 dias" — texto que se lê sem conta de cabeça */
export function quandoTexto(data: string, hoje = hojeISO()): string {
  const faltam = diasAteVencer(data, hoje);
  if (faltam === 0) return "hoje";
  if (faltam === 1) return "amanhã";
  if (faltam === -1) return "ontem";
  if (faltam > 1) return `em ${faltam} dias`;
  return `há ${Math.abs(faltam)} dias`;
}
