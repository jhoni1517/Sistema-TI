import { txt, codigoOS } from "./format";
import { soData, hojeISO, diasAteVencer } from "./contas";
import type { OrdemServico } from "./types";

/**
 * "Esse conserto ainda está na garantia?"
 *
 * A pergunta chega no balcão e no WhatsApp toda semana, e a resposta estava
 * espalhada: a data de entrega numa tela, os dias de garantia em outra, e a
 * conta na cabeça de quem atendeu. Dar a resposta errada custa dos dois
 * lados — negar garantia válida perde o cliente, honrar garantia vencida
 * paga peça que já foi paga uma vez.
 *
 * A garantia conta da ENTREGA, não da abertura. O aparelho pode ter ficado
 * três semanas esperando peça, e esse tempo não é do cliente.
 */

export type SituacaoGarantia = "sem_garantia" | "nao_entregue" | "valida" | "vencida";

export const GARANTIA_META: Record<SituacaoGarantia, { label: string; cor: string }> = {
  sem_garantia: { label: "Sem garantia", cor: "bg-slate-100 text-slate-600" },
  nao_entregue: { label: "Ainda na loja", cor: "bg-slate-100 text-slate-600" },
  valida: { label: "Na garantia", cor: "bg-emerald-100 text-emerald-700" },
  vencida: { label: "Garantia vencida", cor: "bg-red-100 text-red-700" },
};

export interface Garantia {
  situacao: SituacaoGarantia;
  /** Último dia coberto (AAAA-MM-DD), ou vazio quando não há garantia */
  ate: string;
  /** Dias que ainda restam. Negativo = venceu há tantos dias. */
  diasRestantes: number;
}

/**
 * Situação da garantia de uma OS.
 *
 * Cancelada nunca tem garantia: não houve serviço. Entregue sem prazo
 * cadastrado também não — inventar 90 dias porque "é o costume" faria o
 * sistema prometer o que a loja não combinou.
 */
export function garantiaDaOS(o: OrdemServico, hoje = hojeISO()): Garantia {
  const dias = Number(o.garantiaDias) || 0;
  const entrega = soData(o.entregueEm);

  if (o.status === "cancelada" || dias <= 0) {
    return { situacao: "sem_garantia", ate: "", diasRestantes: 0 };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entrega)) {
    return { situacao: "nao_entregue", ate: "", diasRestantes: dias };
  }

  // Conta em UTC a partir da data pura: somar hora local desloca o dia
  // inteiro conforme o fuso, e um dia a menos na garantia é discussão certa.
  const fim = new Date(Date.parse(entrega + "T00:00:00Z") + dias * 86400000)
    .toISOString()
    .slice(0, 10);
  const restantes = diasAteVencer(fim, hoje);

  return {
    situacao: restantes >= 0 ? "valida" : "vencida",
    ate: fim,
    diasRestantes: restantes,
  };
}

/** Está coberto hoje? */
export const naGarantia = (o: OrdemServico, hoje = hojeISO()): boolean =>
  garantiaDaOS(o, hoje).situacao === "valida";

/**
 * Garantias de um cliente, da que vence primeiro para a que vence por último.
 *
 * Só as válidas: listar as vencidas junto faria a resposta rápida no balcão
 * virar leitura de tabela.
 */
export const garantiasDoCliente = (
  ordens: OrdemServico[],
  clienteId: string,
  hoje = hojeISO()
): { os: OrdemServico; garantia: Garantia }[] =>
  ordens
    .filter((o) => o.clienteId === clienteId)
    .map((o) => ({ os: o, garantia: garantiaDaOS(o, hoje) }))
    .filter((x) => x.garantia.situacao === "valida")
    .sort((a, b) => a.garantia.diasRestantes - b.garantia.diasRestantes);

/**
 * Garantias que vencem em breve.
 *
 * Serve para a loja avisar antes: "sua garantia vence semana que vem, quer
 * que a gente dê uma olhada?" custa uma mensagem e evita o retorno bravo no
 * dia 91.
 */
export const garantiasVencendo = (
  ordens: OrdemServico[],
  diasAviso = 7,
  hoje = hojeISO()
): { os: OrdemServico; garantia: Garantia }[] =>
  ordens
    .map((o) => ({ os: o, garantia: garantiaDaOS(o, hoje) }))
    .filter(
      (x) => x.garantia.situacao === "valida" && x.garantia.diasRestantes <= diasAviso
    )
    .sort((a, b) => a.garantia.diasRestantes - b.garantia.diasRestantes);

/**
 * Resposta pronta sobre a garantia, para colar no WhatsApp.
 *
 * Sem emoji: em alguns aparelhos elas chegam como "?" e sujam o recado.
 */
export function textoDaGarantia(o: OrdemServico, hoje = hojeISO()): string {
  const g = garantiaDaOS(o, hoje);
  const cod = codigoOS(o.numero);
  const aparelho = [txt(o.marca), txt(o.modelo)].filter(Boolean).join(" ") || "o aparelho";

  switch (g.situacao) {
    case "valida":
      return (
        `A ${cod} (${aparelho}) está na garantia até ${g.ate.split("-").reverse().join("/")}` +
        ` — faltam ${g.diasRestantes} dia(s). Pode trazer.`
      );
    case "vencida":
      return (
        `A garantia da ${cod} (${aparelho}) venceu em ` +
        `${g.ate.split("-").reverse().join("/")}, há ${Math.abs(g.diasRestantes)} dia(s).`
      );
    case "nao_entregue":
      return `A ${cod} ainda está na loja. A garantia começa a contar na entrega.`;
    default:
      return `A ${cod} não tem prazo de garantia registrado.`;
  }
}
