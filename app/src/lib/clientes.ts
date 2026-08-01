import { txt } from "./format";
import { saldoFiado, diasDesde } from "./calc";
import type { Classificacao, Cliente, Fiado, OrdemServico } from "./types";

/**
 * Classificação de risco do cliente.
 *
 * A classificação final é sempre decisão da loja — o sistema não rebaixa
 * ninguém sozinho. O que ele faz é levantar FATOS do histórico e sugerir,
 * porque "esse cliente é ruim" costuma ser memória do atendente, e memória
 * discute. Fato não discute: são três aparelhos abandonados e R$ 800 em
 * aberto há oito meses.
 *
 * O motivo fica registrado junto. Sem motivo, a classificação vira boato
 * dentro do sistema e ninguém depois sabe por que aquele cliente está
 * marcado.
 */

export interface Sinal {
  texto: string;
  peso: number;
}

export interface AvaliacaoCliente {
  sinais: Sinal[];
  pontos: number;
  sugestao: Classificacao;
  /** Classificação que vale hoje (a manual vence a sugestão) */
  atual: Classificacao;
  /** A loja marcou algo diferente do que os fatos indicam? */
  divergente: boolean;
}

export const classificacaoDe = (c?: Cliente | null): Classificacao =>
  c?.classificacao || "normal";

/** Dias que uma OS pronta está parada esperando retirada */
const diasParado = (o: OrdemServico): number =>
  o.status === "pronta" && o.prontaEm ? diasDesde(o.prontaEm) : 0;

/**
 * Levanta os sinais de risco a partir do histórico real.
 * Cada sinal tem peso; a soma vira sugestão. Os limites são propositalmente
 * conservadores: acusar cliente bom de caloteiro custa mais caro do que
 * deixar um ruim passar.
 */
export function avaliarCliente(
  cliente: Cliente,
  ordens: OrdemServico[],
  fiados: Fiado[]
): AvaliacaoCliente {
  const minhas = ordens.filter((o) => o.clienteId === cliente.id);
  const meusFiados = fiados.filter((f) => f.clienteId === cliente.id);
  const sinais: Sinal[] = [];

  // --- Dívida em aberto ---
  const emAberto = meusFiados.filter((f) => !f.quitado);
  const devendo = emAberto.reduce((s, f) => s + saldoFiado(f), 0);
  if (devendo > 0) {
    const maisAntigo = emAberto.reduce(
      (max, f) => Math.max(max, diasDesde(f.criadoEm)),
      0
    );
    if (maisAntigo >= 90) {
      sinais.push({
        texto: `Deve ${moeda(devendo)} há mais de ${Math.floor(maisAntigo / 30)} meses`,
        peso: 3,
      });
    } else if (maisAntigo >= 30) {
      sinais.push({ texto: `Deve ${moeda(devendo)} há mais de 30 dias`, peso: 2 });
    } else {
      sinais.push({ texto: `Tem ${moeda(devendo)} em aberto`, peso: 1 });
    }
  }

  // --- Aparelho abandonado na loja ---
  const abandonados = minhas.filter((o) => diasParado(o) >= 60);
  if (abandonados.length > 0) {
    sinais.push({
      texto: `${abandonados.length} aparelho(s) pronto(s) há mais de 60 dias sem retirar`,
      peso: 2 * abandonados.length,
    });
  }

  // --- Orçamento recusado depois da análise ---
  // Recusar é direito do cliente; só vira sinal quando é padrão repetido.
  const recusadas = minhas.filter((o) => o.recusadoEm || o.status === "cancelada");
  if (recusadas.length >= 3) {
    sinais.push({
      texto: `Recusou ou cancelou ${recusadas.length} orçamentos`,
      peso: 2,
    });
  }

  // --- Contrapeso: cliente antigo e bom não pode ser tratado como novo ---
  const entregues = minhas.filter((o) => o.status === "entregue").length;
  if (entregues >= 5) {
    sinais.push({ texto: `${entregues} serviços concluídos sem problema`, peso: -2 });
  }
  const quitados = meusFiados.filter((f) => f.quitado).length;
  if (quitados >= 2) {
    sinais.push({ texto: `Quitou ${quitados} fiados`, peso: -1 });
  }

  const pontos = sinais.reduce((s, x) => s + x.peso, 0);
  const sugestao: Classificacao =
    pontos >= 5 ? "bloqueado" : pontos >= 2 ? "atencao" : "normal";

  const atual = classificacaoDe(cliente);

  return {
    sinais,
    pontos,
    sugestao,
    atual,
    // Só avisa quando os fatos são MAIS graves do que a marcação atual.
    // Loja que decidiu perdoar alguém não precisa ser lembrada disso.
    divergente: nivel(sugestao) > nivel(atual),
  };
}

const nivel = (c: Classificacao): number =>
  c === "bloqueado" ? 2 : c === "atencao" ? 1 : 0;

const moeda = (v: number): string =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * O que a tela deve fazer ao escolher este cliente numa nova OS.
 * "bloquear" não é definitivo: o dono pode autorizar caso a caso, porque a
 * vida do balcão tem exceção e um sistema que não deixa fazer nada acaba
 * sendo contornado por fora.
 */
export function travaAtendimento(cliente?: Cliente | null): {
  bloqueia: boolean;
  avisa: boolean;
  titulo: string;
  motivo: string;
} {
  const cls = classificacaoDe(cliente);
  const motivo = txt(cliente?.motivoClassificacao).trim();

  if (cls === "bloqueado") {
    return {
      bloqueia: true,
      avisa: true,
      titulo: "Cliente bloqueado para novos atendimentos",
      motivo: motivo || "Sem motivo registrado.",
    };
  }
  if (cls === "atencao") {
    return {
      bloqueia: false,
      avisa: true,
      titulo: "Cliente marcado com atenção",
      motivo: motivo || "Sem motivo registrado.",
    };
  }
  return { bloqueia: false, avisa: false, titulo: "", motivo: "" };
}

/* ------------------------------------------------------------------ */
/* Limite de fiado                                                     */
/* ------------------------------------------------------------------ */

/**
 * Quanto este cliente já deve, somando tudo que não está quitado.
 *
 * O fiado ficava espalhado em vários lançamentos e ninguém somava na hora de
 * fiar mais um. Quem atende vê "ele deve pouco" olhando o último, não o
 * total.
 */
export const devendo = (clienteId: string, fiados: Fiado[]): number =>
  fiados
    .filter((f) => f.clienteId === clienteId && !f.quitado)
    .reduce((s, f) => s + saldoFiado(f), 0);

export interface TravaFiado {
  /** Passa do teto? */
  estoura: boolean;
  /** Tem teto definido para este cliente? */
  temLimite: boolean;
  devendo: number;
  limite: number;
  /** Quanto ainda cabe. Sem teto, é Infinity. */
  disponivel: number;
  /** Explicação pronta para a tela. Vazio quando está tudo certo. */
  motivo: string;
}

/**
 * Cabe mais este valor no fiado deste cliente?
 *
 * "Fio pra você" é decisão de dono, tomada uma vez, com a cabeça fria. Sem o
 * teto no sistema ela virava decisão do atendente, no balcão, com fila
 * esperando — e o dono só descobria no fim do mês.
 *
 * Não é bloqueio absoluto de propósito: a tela pergunta e deixa o dono
 * autorizar. Sistema que não deixa fazer nada acaba sendo contornado por
 * fora, e aí o fiado volta a não existir no sistema.
 */
export function travaFiado(
  cliente: Cliente | undefined | null,
  fiados: Fiado[],
  valorNovo = 0
): TravaFiado {
  const limite = Number(cliente?.limiteFiado) || 0;
  const atual = cliente ? devendo(cliente.id, fiados) : 0;
  const temLimite = limite > 0;
  const disponivel = temLimite ? Math.max(0, limite - atual) : Infinity;
  const total = atual + (Number(valorNovo) || 0);
  const estoura = temLimite && total > limite;

  return {
    estoura,
    temLimite,
    devendo: atual,
    limite,
    disponivel,
    motivo: estoura
      ? `${txt(cliente?.nome) || "Este cliente"} já deve ${atual.toFixed(2)} e o limite é ` +
        `${limite.toFixed(2)}. Com este lançamento chega a ${total.toFixed(2)}.`
      : "",
  };
}
