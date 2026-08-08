import { hojeISO, soData, diasAteVencer } from "./contas";
import { saldoFiado } from "./calc";
import type { Fiado } from "./types";

/**
 * Quando uma dívida passa a incomodar.
 *
 * O sistema só sabia cobrar fiado COM data de vencimento: a tela contava
 * "Vencidos" olhando `vencimento`, e o robô de segunda-feira consultava o
 * banco com `vencimento=not.is.null`.
 *
 * Só que o caminho mais usado para fiar alguém numa assistência é entregar
 * a OS no fiado — e esse caminho nunca preencheu vencimento. Nem o "Novo
 * fiado" do balcão obriga: o campo é opcional, e com fila esperando ninguém
 * preenche campo opcional.
 *
 * Resultado: a dívida entrava no "Total a receber" e ficava lá para sempre.
 * Nunca aparecia como atrasada, nunca entrava no aviso de segunda, e ninguém
 * procura por dinheiro que nunca chegou — é o mesmo vazamento invisível da
 * mesa que ficou aberta.
 *
 * O conserto NÃO é inventar um vencimento. Prazo é combinado entre a loja e
 * o cliente, e um sistema que inventa "30 dias" passa a cobrar em nome da
 * loja um acordo que não existiu — a mesma razão pela qual a garantia não
 * inventa 90 dias porque "é o costume".
 *
 * O que dá para afirmar é outra coisa, e ela basta: **esta dívida está em
 * aberto há tanto tempo.** A data de criação sempre existe. Passado o
 * limite, a dívida é PARADA — não "vencida", porque prazo nenhum foi
 * quebrado — e entra na lista de quem precisa de um toque.
 */

export type SituacaoFiado = "quitado" | "em_dia" | "vencido" | "parado";

export const FIADO_META: Record<SituacaoFiado, { label: string; cor: string }> = {
  quitado: { label: "Quitado", cor: "bg-emerald-100 text-emerald-700" },
  em_dia: { label: "Em aberto", cor: "bg-amber-100 text-amber-700" },
  vencido: { label: "Vencido", cor: "bg-red-100 text-red-700" },
  // Cor diferente da do vencido de propósito: um quebrou um prazo
  // combinado, o outro só está parado. Tratar os dois como a mesma coisa
  // faria a loja cobrar com a mesma dureza quem não prometeu data nenhuma.
  parado: { label: "Parado", cor: "bg-orange-100 text-orange-700" },
};

/**
 * Quantos dias essa dívida está em aberto, sem vencimento nenhum.
 *
 * `criadoEm` é carimbo de hora completo; a conta é feita sobre a data pura,
 * em UTC, como todo o resto do sistema — somar hora local desloca o dia
 * inteiro conforme o fuso.
 */
export const diasEmAberto = (f: Pick<Fiado, "criadoEm">, hoje = hojeISO()): number => {
  const inicio = soData(f?.criadoEm);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return 0;
  return Math.max(0, -diasAteVencer(inicio, hoje));
};

/**
 * A partir de quantos dias uma dívida sem vencimento passa a ser cobrada.
 *
 * Trinta dias é um mês de balcão: quem ia pagar "na semana que vem" já
 * passou de quatro semanas. Curto demais transforma o aviso em ruído
 * semanal, e aviso que aparece sempre é aviso que a pessoa aprende a
 * ignorar.
 */
export const DIAS_PARA_COBRAR_SEM_VENCIMENTO = 30;

export interface EstadoFiado {
  situacao: SituacaoFiado;
  /** Dias de atraso quando venceu; dias em aberto quando não tem vencimento */
  dias: number;
  /** Precisa de um toque hoje? */
  cobravel: boolean;
}

export function estadoFiado(
  f: Fiado,
  hoje = hojeISO(),
  diasParado = DIAS_PARA_COBRAR_SEM_VENCIMENTO
): EstadoFiado {
  // Quitado manda, mesmo que a data já tenha passado: ninguém cobra quem
  // pagou, e mandar essa mensagem custa o cliente.
  if (f?.quitado || saldoFiado(f) <= 0) {
    return { situacao: "quitado", dias: 0, cobravel: false };
  }

  const venc = soData(f?.vencimento);
  if (/^\d{4}-\d{2}-\d{2}$/.test(venc)) {
    const restam = diasAteVencer(venc, hoje);
    return restam < 0
      ? { situacao: "vencido", dias: -restam, cobravel: true }
      : { situacao: "em_dia", dias: restam, cobravel: false };
  }

  const dias = diasEmAberto(f, hoje);
  return dias >= diasParado
    ? { situacao: "parado", dias, cobravel: true }
    : { situacao: "em_dia", dias, cobravel: false };
}

/**
 * As dívidas que pedem um toque hoje, da mais antiga para a mais nova.
 *
 * Ordena por dias e não por valor: quem deve há oito meses é quem some, e
 * dívida velha é dívida que vira prejuízo. O valor aparece do lado, para
 * quem quiser escolher por ele.
 */
export function fiadosParaCobrar(
  fiados: Fiado[],
  hoje = hojeISO(),
  diasParado = DIAS_PARA_COBRAR_SEM_VENCIMENTO
): { fiado: Fiado; estado: EstadoFiado }[] {
  return (fiados || [])
    .map((fiado) => ({ fiado, estado: estadoFiado(fiado, hoje, diasParado) }))
    .filter((x) => x.estado.cobravel)
    .sort((a, b) => b.estado.dias - a.estado.dias);
}

/** Quanto está atrasado, em dinheiro — é o número que move alguém */
export const totalParaCobrar = (
  fiados: Fiado[],
  hoje = hojeISO(),
  diasParado = DIAS_PARA_COBRAR_SEM_VENCIMENTO
): number =>
  Math.round(
    fiadosParaCobrar(fiados, hoje, diasParado).reduce((s, x) => s + saldoFiado(x.fiado), 0) * 100
  ) / 100;
