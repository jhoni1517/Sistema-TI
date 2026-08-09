import { centavos } from "./pdv";
import { txt } from "./format";
import { itensAtivos, preparoDe, totalComanda } from "./comanda";
import type { Comanda } from "./types";

/**
 * Pedido de entrega.
 *
 * Por dentro é uma comanda: uma conta aberta que recebe itens, manda para a
 * cozinha e no fim vira venda, movimento no caixa e baixa de estoque. Todo
 * esse caminho já existe, já foi revisado e já tem teste — escrever um
 * `Pedido` separado o duplicaria, e as duas cópias envelheceriam em ritmos
 * diferentes.
 *
 * O que muda são CAMPOS (endereço, taxa, entregador, troco) e a TELA, porque
 * a rotina do salão e a da moto não se parecem em nada.
 *
 * O que é diferente de verdade e mora aqui:
 *
 * - **O troco.** "Tem troco para 50?" é a pergunta que decide se o pedido dá
 *   certo. Sem ela o entregador sai com a bolsa cheia e sem trocado, e volta
 *   com o pedido ou com a conta errada.
 * - **O relógio da rua.** Depois que sai, a demora não é mais da cozinha.
 * - **A taxa de entrega**, que é dinheiro da casa e não pode sumir da conta.
 */

const n = (v?: number | null): number => Number(v) || 0;

/** Vazio é mesa: é assim que voltam as comandas gravadas antes da entrega */
export const ehEntrega = (c?: Comanda | null): boolean => c?.tipo === "entrega";

/** Só as mesas, para a tela do salão */
export const soMesas = (comandas: Comanda[]): Comanda[] =>
  (comandas || []).filter((c) => !ehEntrega(c));

/** Só as entregas, para a tela da moto */
export const soEntregas = (comandas: Comanda[]): Comanda[] =>
  (comandas || []).filter(ehEntrega);

/**
 * Em que pé está o pedido.
 *
 * Sai dos ITENS e da hora da saída, não de um campo de status que alguém
 * precisa lembrar de mexer. Status que se digita à mão é status que fica
 * desatualizado — e um pedido "na cozinha" que já está na rua faz a casa
 * ligar para o entregador perguntando o que ele já respondeu.
 */
export type SituacaoEntrega = "montando" | "pronto" | "na_rua" | "entregue";

export const ENTREGA_META: Record<
  SituacaoEntrega,
  { label: string; cor: string; explicacao: string }
> = {
  montando: {
    label: "Na cozinha",
    cor: "bg-amber-100 text-amber-700",
    explicacao: "Ainda tem item sendo preparado",
  },
  pronto: {
    label: "Pronto para sair",
    cor: "bg-emerald-100 text-emerald-700",
    explicacao: "Tudo pronto, esperando entregador",
  },
  na_rua: {
    label: "Saiu para entrega",
    cor: "bg-blue-100 text-blue-700",
    explicacao: "Com o entregador, a caminho",
  },
  entregue: {
    label: "Entregue",
    cor: "bg-slate-100 text-slate-600",
    explicacao: "Pedido fechado e pago",
  },
};

export function situacaoEntrega(c: Comanda): SituacaoEntrega {
  if (c?.status !== "aberta") return "entregue";
  if (txt(c?.saiuEm).trim()) return "na_rua";
  const itens = itensAtivos(c);
  // Pedido vazio conta como "montando": ninguém manda a moto sair sem nada,
  // e chamar de "pronto" faria a tela pedir para despachar o que não existe.
  if (itens.length === 0) return "montando";
  const faltando = itens.some((i) => {
    const p = preparoDe(i.preparo);
    return p === "pendente" || p === "preparando";
  });
  return faltando ? "montando" : "pronto";
}

/** Minutos desde que a moto saiu. Zero enquanto não saiu. */
export function minutosNaRua(c: Comanda, agora = new Date()): number {
  const saiu = Date.parse(txt(c?.saiuEm));
  if (!Number.isFinite(saiu)) return 0;
  return Math.max(0, Math.floor((agora.getTime() - saiu) / 60000));
}

/**
 * A taxa de entrega em dinheiro.
 *
 * Negativa é ignorada: taxa negativa viraria desconto disfarçado, e desconto
 * tem campo próprio.
 */
export const taxaDaEntrega = (c: Comanda): number => Math.max(0, centavos(n(c?.taxaEntrega)));

/**
 * Quanto o entregador precisa levar de troco.
 *
 * Só existe quando o cliente disse para quanto ele tem. Nunca negativo:
 * "tenho R$ 20" numa conta de R$ 60 não é troco, é falta — e o valor certo
 * ali é zero, com a conversa acontecendo antes de a moto sair.
 */
export const trocoDaEntrega = (total: number, trocoPara?: number | null): number => {
  const nota = n(trocoPara);
  if (nota <= 0) return 0;
  return centavos(Math.max(0, nota - n(total)));
};

/**
 * O que impede a moto de sair, em português. Vazio = pode ir.
 *
 * Endereço e telefone não são burocracia: sem endereço a moto não sai, e sem
 * telefone ela não volta — é para ele que o entregador liga quando não acha
 * o portão. Descobrir isso com a bolsa na mão é tarde.
 */
export function problemaParaSair(c: Comanda): string {
  if (!txt(c?.endereco).trim()) {
    return "Sem endereço. A moto não sai sem saber para onde ir.";
  }
  if (!txt(c?.telefone).trim()) {
    return (
      "Sem telefone. É por ele que o entregador liga quando não acha o " +
      "portão — e é o que salva o pedido perdido."
    );
  }
  if (itensAtivos(c).length === 0) {
    return "Pedido sem itens. Lance o que vai na bolsa antes de despachar.";
  }
  if (situacaoEntrega(c) === "montando") {
    return (
      "Ainda tem item na cozinha. Marque como pronto na tela da Cozinha, ou " +
      "cancele o que não vai."
    );
  }
  return "";
}

/**
 * O que o cliente paga: consumo + taxa de entrega - desconto.
 *
 * A taxa de serviço NÃO entra aqui de propósito: gorjeta de garçom é do
 * salão. Cobrar os 10% de quem pediu por telefone é o tipo de coisa que
 * aparece na reclamação, não no fechamento.
 */
export function totalDaEntrega(c: Comanda): number {
  const consumo = totalComanda(c);
  const desconto = Math.max(0, n(c?.desconto));
  return centavos(Math.max(0, consumo + taxaDaEntrega(c) - desconto));
}

/**
 * As entregas que ainda estão em pé, na ordem em que a casa cuida delas.
 *
 * Quem está na rua vem primeiro — é o pedido que tem cliente esperando na
 * porta e prazo correndo. Depois o que está pronto e a moto ainda não levou,
 * e por último o que a cozinha está montando.
 */
export function entregasAbertas(comandas: Comanda[]): Comanda[] {
  const peso: Record<SituacaoEntrega, number> = {
    na_rua: 0,
    pronto: 1,
    montando: 2,
    entregue: 3,
  };
  return soEntregas(comandas)
    .filter((c) => c.status === "aberta")
    .sort(
      (a, b) =>
        peso[situacaoEntrega(a)] - peso[situacaoEntrega(b)] ||
        txt(a.abertaEm).localeCompare(txt(b.abertaEm))
    );
}
