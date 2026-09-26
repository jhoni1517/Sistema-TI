import { txt } from "./format";
import { diasAteVencer, soData } from "./contas";
import type { AparelhoReserva, Emprestimo, OrdemServico } from "./types";

/**
 * Aparelho reserva: o celular da loja que o cliente leva enquanto o dele
 * está na bancada.
 *
 * O cliente que fica sem celular três dias vai para a loja que empresta.
 * Mas o reserva que sai sem registro volta riscado, sem carregador — ou
 * não volta: a OS é entregue, o cliente vai embora com os dois aparelhos
 * e ninguém lembra de pedir o reserva de volta.
 *
 * O empréstimo mora na OS (estado, fotos, caução, termo assinado) e a
 * entrega da OS pergunta pelo reserva antes de liberar.
 */

export const LIMITE_DIAS_FORA = 15;

/** Emprestado e ainda não devolvido */
export const emprestado = (o: Pick<OrdemServico, "emprestimo">): boolean => !!o.emprestimo && !o.emprestimo.devolvidoEm;

/** Os aparelhos que não estão com ninguém agora. */
export function disponiveis(aparelhos: AparelhoReserva[], ordens: OrdemServico[]): AparelhoReserva[] {
  const fora = new Set(ordens.filter(emprestado).map((o) => o.emprestimo!.aparelhoId));
  return aparelhos.filter((a) => !fora.has(a.id));
}

export interface ReservaFora {
  os: OrdemServico;
  emprestimo: Emprestimo;
  dias: number;
  /** A OS já foi entregue (ou cancelada) e o reserva não voltou */
  esquecido: boolean;
  /** Fora há mais que o limite */
  demorado: boolean;
}

/** Tudo que está emprestado, com o mais grave primeiro: esquecido, depois o mais antigo. */
export function reservasFora(ordens: OrdemServico[], hoje: string, limite = LIMITE_DIAS_FORA): ReservaFora[] {
  const saida: ReservaFora[] = [];
  for (const os of ordens) {
    if (!emprestado(os)) continue;
    const e = os.emprestimo!;
    const dias = Math.max(0, -diasAteVencer(soData(e.emprestadoEm), hoje));
    const esquecido = os.status === "entregue" || os.status === "cancelada";
    saida.push({ os, emprestimo: e, dias, esquecido, demorado: dias > limite });
  }
  return saida.sort((a, b) => Number(b.esquecido) - Number(a.esquecido) || b.dias - a.dias);
}

export function problemaNoEmprestimo(e: Pick<Emprestimo, "aparelhoId" | "estado">, aparelhos: AparelhoReserva[], ordens: OrdemServico[], osId: string): string {
  if (!e.aparelhoId) return "Escolha o aparelho reserva.";
  if (!txt(e.estado).trim()) return "Descreva como o aparelho está saindo (riscos, bateria, acessórios).";
  const outro = ordens.find((o) => o.id !== osId && emprestado(o) && o.emprestimo!.aparelhoId === e.aparelhoId);
  if (outro) return `Este aparelho está emprestado na OS ${outro.numero}.`;
  if (!aparelhos.some((a) => a.id === e.aparelhoId)) return "Aparelho não encontrado no cadastro.";
  return "";
}

/** O que o termo de empréstimo diz. Entra no texto assinado. */
export function linhasDoEmprestimo(e: Emprestimo, loja: string): string[] {
  return [
    `Aparelho reserva: ${e.nome}${e.imei ? ` (IMEI/série ${e.imei})` : ""}`,
    `Estado na saída: ${txt(e.estado).trim()}`,
    (e.fotos || []).length ? `Fotos do reserva na saída: ${(e.fotos || []).length}` : "",
    e.caucao ? `Caução deixada: R$ ${e.caucao.toFixed(2).replace(".", ",")} (devolvida com o reserva em bom estado)` : "",
    "",
    `Declaro que recebi o aparelho reserva acima, emprestado pela ${txt(loja).trim() || "loja"} enquanto o meu está em conserto, no estado descrito.`,
    "Comprometo-me a devolvê-lo na retirada do meu aparelho, no mesmo estado. Danos, perda ou não devolução serão cobrados, podendo ser descontados da caução.",
  ].filter((l, i, a) => l !== "" || (i > 0 && a[i - 1] !== ""));
}
