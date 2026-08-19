import { txt } from "./format";
import { normalizar } from "./busca";
import {
  RECORRENCIA_META,
  type ContaPagar,
  type Meta,
  type MovimentoCaixa,
  type OrdemServico,
  type Recorrencia,
  type TipoMeta,
} from "./types";
import { receitaBruta, lucroLiquido, despesasOperacionais } from "./calc";

/**
 * Contas fixas e a pagar.
 *
 * O cuidado maior aqui é com data. Conta de aluguel que vence dia 31 não
 * pode sumir em fevereiro, e conta paga adiantada não pode pular um mês.
 * Toda a aritmética de vencimento vive neste arquivo, com teste, em vez de
 * espalhada pelas telas.
 */

const n = (v?: number | null): number => Number(v) || 0;

/** Só a data, sem hora — comparar horários faz "vence hoje" virar "atrasada" */
export const soData = (iso?: string | null): string => txt(iso).slice(0, 10);

/**
 * O dia de HOJE, no relógio de quem está no balcão.
 *
 * A regra da casa — data é texto AAAA-MM-DD e a conta é em UTC — vale para a
 * ARITMÉTICA: somar um mês, virar o ano, dia 31 em fevereiro. Ela nunca quis
 * dizer que o dia de hoje fosse o de Greenwich, e era isso que acontecia:
 * `toISOString()` devolve a data em UTC, então no Brasil (UTC-3) o sistema
 * inteiro virava o dia às 21h. Três horas por dia, todo dia, e justamente as
 * horas cheias de uma pizzaria ou de uma loja de bebidas.
 *
 * Das 21h em diante: promoção que termina hoje parava de valer (a gôndola
 * dizia um preço e o caixa cobrava outro), produto que vence amanhã já
 * entrava como vencido no PDV, e conta que vence hoje aparecia atrasada.
 *
 * Deslocar pelo fuso antes de cortar devolve a data LOCAL como texto puro —
 * e daí para a frente toda a aritmética continua em UTC, como sempre foi.
 */
export const hojeISO = (): string => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

/**
 * Dias até o vencimento. Negativo = atrasada.
 * Calculado em UTC a partir da data pura, para o fuso não deslocar um dia.
 */
export const diasAteVencer = (vencimento?: string | null, hoje = hojeISO()): number => {
  const a = Date.parse(soData(vencimento) + "T00:00:00Z");
  const b = Date.parse(soData(hoje) + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((a - b) / 86400000);
};

/**
 * Avança um vencimento conforme a recorrência.
 *
 * O detalhe que quebra sistemas: dia 31 + 1 mês. Fevereiro não tem 31, e a
 * soma ingênua joga a conta para março. Aqui o dia é preso ao último dia do
 * mês de destino, e o dia original é preservado para os meses seguintes.
 */
export function proximoVencimento(
  vencimento: string,
  recorrencia: Recorrencia,
  diaOriginal?: number
): string {
  const meta = RECORRENCIA_META[recorrencia];
  if (!meta || (meta.meses === 0 && meta.dias === 0)) return soData(vencimento);

  const base = new Date(soData(vencimento) + "T00:00:00Z");
  if (Number.isNaN(base.getTime())) return soData(vencimento);

  if (meta.dias > 0) {
    base.setUTCDate(base.getUTCDate() + meta.dias);
    return base.toISOString().slice(0, 10);
  }

  const dia = diaOriginal || base.getUTCDate();
  const ano = base.getUTCFullYear();
  const mes = base.getUTCMonth() + meta.meses;

  // Dia 0 do mês seguinte = último dia do mês desejado
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const alvo = new Date(Date.UTC(ano, mes, Math.min(dia, ultimoDia)));
  return alvo.toISOString().slice(0, 10);
}

export type SituacaoConta = "paga" | "atrasada" | "vence_hoje" | "proxima" | "futura" | "inativa";

export const SITUACAO_CONTA_META: Record<SituacaoConta, { label: string; cor: string }> = {
  atrasada: { label: "Atrasada", cor: "bg-red-100 text-red-700" },
  vence_hoje: { label: "Vence hoje", cor: "bg-amber-100 text-amber-700" },
  proxima: { label: "Vence em breve", cor: "bg-blue-100 text-blue-700" },
  futura: { label: "Em dia", cor: "bg-slate-100 text-slate-600" },
  paga: { label: "Paga", cor: "bg-emerald-100 text-emerald-700" },
  inativa: { label: "Desligada", cor: "bg-slate-100 text-slate-500" },
};

/**
 * ============================================================
 *  PAGAMENTO PARCIAL
 * ============================================================
 *
 * A fatura do cartão é R$ 1.000 e neste mês dá para pagar R$ 300.
 *
 * Antes, todo pagamento fechava o ciclo: a conta era dada como paga e a
 * recorrente pulava para o mês seguinte. Os R$ 700 que continuavam devidos
 * sumiam da lista, da previsão e do aviso — e a única lembrança de que
 * existiam era a memória de quem pagou.
 *
 * Agora o pagamento abate. Enquanto sobrar saldo, a conta FICA no mesmo
 * vencimento, continua atrasando e continua aparecendo. Ela só anda quando
 * for realmente quitada.
 *
 * ------------------------------------------------------------
 * O QUE COLA CADA PAGAMENTO AO SEU CICLO
 *
 * `PagamentoConta.referencia` — o vencimento a que aquele pagamento se
 * refere. O campo já existia; era o que faltava usar. Somar TODOS os
 * pagamentos da conta daria o total pago na vida dela: uma conta de luz
 * paga há dois anos apareceria com saldo negativo e nunca mais cobraria
 * nada.
 * ------------------------------------------------------------
 */

const centavos = (v: number): number => Math.round((Number(v) || 0) * 100) / 100;

/** Quanto já foi pago PARA ESTE vencimento (o corrente, por padrão) */
export const pagoNaReferencia = (c: ContaPagar, referencia?: string): number => {
  const alvo = soData(referencia ?? c.vencimento);
  return centavos(
    (c.pagamentos || [])
      .filter((p) => soData(p.referencia) === alvo)
      .reduce((s, p) => s + n(p.valor), 0)
  );
};

/**
 * Quanto ainda falta neste vencimento.
 *
 * Nunca negativo: pagar R$ 1.100 numa conta de R$ 1.000 deixa saldo zero, e
 * não um crédito de R$ 100 que abateria o mês seguinte sozinho. Crédito com
 * fornecedor é conversa entre pessoas, não conta de sistema — e um abatimento
 * automático que ninguém pediu é a pior forma de errar aqui.
 */
export const saldoDaConta = (c: ContaPagar): number =>
  Math.max(0, centavos(n(c.valor) - pagoNaReferencia(c)));

/** Já entrou dinheiro neste ciclo, mas ainda falta? */
export const parcialmentePaga = (c: ContaPagar): boolean => {
  const pago = pagoNaReferencia(c);
  return pago > 0 && pago < n(c.valor);
};

/** Uma conta única já quitada não volta a cobrar */
export const contaQuitada = (c: ContaPagar): boolean =>
  c.recorrencia === "unica" &&
  (c.pagamentos || []).length > 0 &&
  saldoDaConta(c) <= 0;

export function situacaoConta(c: ContaPagar, hoje = hojeISO()): SituacaoConta {
  if (!c.ativo) return "inativa";
  if (contaQuitada(c)) return "paga";
  const dias = diasAteVencer(c.vencimento, hoje);
  if (dias < 0) return "atrasada";
  if (dias === 0) return "vence_hoje";
  if (dias <= (c.lembreteDias ?? 3)) return "proxima";
  return "futura";
}

/** Contas que merecem aviso agora: atrasadas, vencendo hoje ou dentro do lembrete */
export const contasParaAvisar = (contas: ContaPagar[], hoje = hojeISO()): ContaPagar[] =>
  contas
    .filter((c) => ["atrasada", "vence_hoje", "proxima"].includes(situacaoConta(c, hoje)))
    .sort((a, b) => diasAteVencer(a.vencimento, hoje) - diasAteVencer(b.vencimento, hoje));

/** Do mês corrente, ainda em aberto, de um lado só */
const abertasNoMes = (
  contas: ContaPagar[],
  hoje: string,
  querReceber: boolean
): ContaPagar[] => {
  const mes = soData(hoje).slice(0, 7);
  return contas.filter(
    (c) =>
      c.ativo &&
      !contaQuitada(c) &&
      ehReceber(c) === querReceber &&
      soData(c.vencimento).slice(0, 7) === mes
  );
};

/*
 * Daqui para baixo o que vale é o SALDO, e não o valor cheio da conta.
 *
 * Pagos R$ 300 de uma fatura de R$ 1.000, o que ainda vai sair do caixa são
 * R$ 700. Continuar somando os R$ 1.000 faria a tela cobrar de novo um
 * dinheiro que já saiu — e quem olha "a pagar este mês" está decidindo se dá
 * para pagar o fornecedor hoje.
 */

/** Quanto ainda vai SAIR no mês corrente considerando o que não foi pago */
export const totalAPagarNoMes = (contas: ContaPagar[], hoje = hojeISO()): number =>
  centavos(abertasNoMes(contas, hoje, false).reduce((s, c) => s + saldoDaConta(c), 0));

/** Quanto ainda vai ENTRAR no mês corrente e não caiu */
export const totalAReceberNoMes = (contas: ContaPagar[], hoje = hojeISO()): number =>
  centavos(abertasNoMes(contas, hoje, true).reduce((s, c) => s + saldoDaConta(c), 0));

/**
 * Atrasado, separado por lado.
 *
 * Somar os dois num número só daria um valor sem significado nenhum: uma
 * conta de luz atrasada e um salário que não caiu são problemas opostos, e o
 * que se faz com cada um é o oposto também.
 */
export const totalAtrasado = (contas: ContaPagar[], hoje = hojeISO()): number =>
  centavos(
    contas
      .filter((c) => ehPagar(c) && situacaoConta(c, hoje) === "atrasada")
      .reduce((s, c) => s + saldoDaConta(c), 0)
  );

/** O que era para ter entrado e não entrou */
export const totalAtrasadoAReceber = (contas: ContaPagar[], hoje = hojeISO()): number =>
  centavos(
    contas
      .filter((c) => ehReceber(c) && situacaoConta(c, hoje) === "atrasada")
      .reduce((s, c) => s + saldoDaConta(c), 0)
  );

/* ------------------------------------------------------------------ */
/* Pagar ou receber                                                     */
/* ------------------------------------------------------------------ */

/**
 * Esta conta é dinheiro ENTRANDO?
 *
 * Ausente é "pagar", e isso não é detalhe: toda conta cadastrada antes deste
 * campo existir volta do banco sem ele. Ler ausente como "receber"
 * transformaria o aluguel da loja em receita da noite para o dia.
 */
export const ehReceber = (c: Pick<ContaPagar, "tipo">): boolean => c?.tipo === "receber";

/** O mesmo, do outro lado, para a leitura não depender de negação */
export const ehPagar = (c: Pick<ContaPagar, "tipo">): boolean => !ehReceber(c);

/**
 * Normaliza qualquer recorrência para o valor mensal equivalente.
 *
 * Semanal usa 52/12, não 4: o ano tem 52 semanas, e multiplicar por 4
 * esconde quase um mês inteiro de despesa por ano.
 */
const porMes = (c: ContaPagar): number => {
  const meta = RECORRENCIA_META[c.recorrencia];
  if (!meta) return 0;
  if (meta.dias === 7) return n(c.valor) * (52 / 12);
  if (meta.meses > 0) return n(c.valor) / meta.meses;
  return 0;
};

/**
 * Soma das contas fixas ativas A PAGAR, normalizada para o mês.
 *
 * O FILTRO DE `ehPagar` É O PONTO INTEIRO DESTA FUNÇÃO.
 *
 * Sem ele, um salário de R$ 3.000 cadastrado como receita fixa entraria como
 * R$ 3.000 de CUSTO fixo — e o número que a pessoa usa para saber quanto
 * precisa faturar por mês passaria a mostrar o dobro do que é. É a mesma
 * família de erro da compra de estoque contada como despesa: dinheiro do
 * lado errado da conta, num número que ninguém confere porque parece
 * plausível.
 */
export const custoFixoMensal = (contas: ContaPagar[]): number =>
  contas
    .filter((c) => c.ativo && c.recorrencia !== "unica" && ehPagar(c))
    .reduce((s, c) => s + porMes(c), 0);

/**
 * O espelho: quanto entra todo mês de forma previsível.
 *
 * Salário, aposentadoria, aluguel recebido, mensalidade de cliente fixo. É o
 * número que responde "dá para pagar as contas?" quando posto ao lado do
 * custo fixo.
 */
export const receitaFixaMensal = (contas: ContaPagar[]): number =>
  contas
    .filter((c) => c.ativo && c.recorrencia !== "unica" && ehReceber(c))
    .reduce((s, c) => s + porMes(c), 0);

/**
 * Sobra prevista do mês: o que entra fixo menos o que sai fixo.
 *
 * Negativo é informação, não erro — é a pessoa vendo que o fixo não fecha e
 * que o resto precisa vir da venda. Zerar em zero esconderia exatamente isso.
 */
export const sobraFixaMensal = (contas: ContaPagar[]): number =>
  Math.round((receitaFixaMensal(contas) - custoFixoMensal(contas)) * 100) / 100;

/**
 * Registra o pagamento e devolve a conta já no estado seguinte.
 *
 * QUITOU: a recorrente anda para o ciclo seguinte; a única fecha.
 * FALTOU: a conta NÃO anda. Fica no mesmo vencimento, continua atrasando e
 * continua na lista, agora com o saldo abatido.
 *
 * Andar com saldo em aberto era o bug: pagar R$ 300 de uma fatura de
 * R$ 1.000 dava a conta como paga e empurrava o vencimento para o mês que
 * vem. Os R$ 700 sumiam da lista, da previsão e do aviso de vencimento.
 */
export function pagarConta(
  c: ContaPagar,
  dados: { valor: number; formaPagamento: PagamentoFormas; data?: string }
): ContaPagar {
  const data = dados.data || new Date().toISOString();
  const pagamento = {
    data,
    valor: n(dados.valor),
    formaPagamento: dados.formaPagamento,
    referencia: soData(c.vencimento),
  };
  const pagamentos = [...(c.pagamentos || []), pagamento];
  const depois = { ...c, pagamentos };

  // Ainda falta: fica onde está. Vale para única e para recorrente.
  if (saldoDaConta(depois) > 0) return depois;

  if (c.recorrencia === "unica") return depois;

  /*
   * O dia original vem do PRIMEIRO pagamento da vida da conta, e é assim de
   * propósito: a referência dele é o vencimento como foi cadastrado. Uma
   * conta do dia 31 passa por fevereiro (28) e precisa VOLTAR para 31 em
   * março — se o dia saísse do vencimento corrente, ela ficaria presa no 28
   * para sempre depois do primeiro fevereiro.
   *
   * O pagamento parcial não atrapalha isto: as parcelas do mesmo ciclo
   * entram com a MESMA referência, então `pagamentos[0]` continua sendo a
   * primeira quitação e continua apontando para o vencimento de origem.
   */
  const diaOriginal = new Date(
    soData(pagamentos[0].referencia) + "T00:00:00Z"
  ).getUTCDate();

  return {
    ...depois,
    vencimento: proximoVencimento(c.vencimento, c.recorrencia, diaOriginal),
  };
}

type PagamentoFormas = ContaPagar["pagamentos"][number]["formaPagamento"];

/* ------------------------------------------------------------------ */
/* Procurar e ordenar a lista de contas                                */
/* ------------------------------------------------------------------ */

export type OrdemContas = "vencimento" | "atraso" | "valor" | "nome";

export const ORDEM_CONTAS_META: Record<OrdemContas, string> = {
  vencimento: "Vencimento",
  atraso: "Mais atrasada",
  valor: "Maior valor",
  nome: "Nome",
};

export interface FiltroContas {
  /** Casa com descrição, categoria e observações */
  termo?: string;
  ordem?: OrdemContas;
  /** Só as que estão nesta situação. Vazio = todas. */
  situacao?: SituacaoConta | "";
  /** Esconder as desligadas */
  soAtivas?: boolean;
}

/**
 * A lista de contas, do jeito que se procura nela.
 *
 * A tela mostrava tudo numa ordem só — desligadas por último, o resto pelo
 * vencimento. Serve para o dia a dia e não serve para as duas perguntas que
 * aparecem quando o mês aperta: "o que está atrasado há mais tempo?" e "qual
 * é a maior conta?". Com trinta contas cadastradas, responder isso era rolar
 * a tela comparando de cabeça.
 *
 * A desligada continua sempre por último, em qualquer ordenação: ela não
 * cobra nada e só atrapalharia a leitura de cima para baixo.
 */
export function filtrarContas(
  contas: ContaPagar[],
  filtro: FiltroContas = {},
  hoje = hojeISO()
): ContaPagar[] {
  const termo = normalizar(filtro.termo);
  const ordem = filtro.ordem || "vencimento";

  const filtradas = contas.filter((c) => {
    if (filtro.soAtivas && !c.ativo) return false;
    if (filtro.situacao && situacaoConta(c, hoje) !== filtro.situacao) return false;
    if (!termo) return true;
    // Categoria e observação entram na busca porque é assim que a pessoa
    // lembra: "aquela do contador", "as de energia".
    const alvo = normalizar(
      `${txt(c.descricao)} ${txt(c.categoria)} ${txt(c.observacoes)}`
    );
    return alvo.includes(termo);
  });

  return filtradas.sort((a, b) => {
    if (a.ativo !== b.ativo) return a.ativo ? -1 : 1;
    switch (ordem) {
      case "atraso": {
        // Quanto mais negativo o "dias até vencer", mais atrasada. Conta em
        // dia vai para o fim: ela não é resposta para esta pergunta.
        const da = diasAteVencer(a.vencimento, hoje);
        const db = diasAteVencer(b.vencimento, hoje);
        const atrasadaA = da < 0 ? 0 : 1;
        const atrasadaB = db < 0 ? 0 : 1;
        return atrasadaA - atrasadaB || da - db;
      }
      case "valor":
        return n(b.valor) - n(a.valor);
      case "nome":
        return txt(a.descricao).localeCompare(txt(b.descricao), "pt-BR");
      default:
        return diasAteVencer(a.vencimento, hoje) - diasAteVencer(b.vencimento, hoje);
    }
  });
}

/* ------------------------------------------------------------------ */
/* Relatório de gastos                                                 */
/* ------------------------------------------------------------------ */

export interface GastoCategoria {
  categoria: string;
  valor: number;
  fatia: number; // % do total
}

/** Para onde o dinheiro foi, do maior para o menor */
export function gastosPorCategoria(
  movs: MovimentoCaixa[],
  filtroMes?: string
): GastoCategoria[] {
  const saidas = movs.filter(
    (m) => m.tipo === "saida" && (!filtroMes || soData(m.data).slice(0, 7) === filtroMes)
  );
  const total = saidas.reduce((s, m) => s + n(m.valor), 0);
  if (total === 0) return [];

  const mapa = new Map<string, number>();
  for (const m of saidas) {
    const cat = txt(m.categoria).trim() || "Sem categoria";
    mapa.set(cat, (mapa.get(cat) || 0) + n(m.valor));
  }

  return [...mapa.entries()]
    .map(([categoria, valor]) => ({
      categoria,
      valor,
      fatia: (valor / total) * 100,
    }))
    .sort((a, b) => b.valor - a.valor);
}

/* ------------------------------------------------------------------ */
/* Objetivos                                                           */
/* ------------------------------------------------------------------ */

export interface ProgressoMeta {
  atual: number;
  alvo: number;
  percentual: number;
  atingida: boolean;
  /** No teto de gasto, passar do alvo é ruim */
  estourou: boolean;
}

const dentroDoPeriodo = (data: string | undefined, meta: Meta, hoje: string): boolean => {
  const d = soData(data);
  if (!d) return false;
  return meta.periodo === "mensal"
    ? d.slice(0, 7) === soData(hoje).slice(0, 7)
    : d.slice(0, 4) === soData(hoje).slice(0, 4);
};

export function progressoMeta(
  meta: Meta,
  movimentos: MovimentoCaixa[],
  ordens: OrdemServico[],
  hoje = hojeISO()
): ProgressoMeta {
  const movs = movimentos.filter((m) => dentroDoPeriodo(m.data, meta, hoje));

  let atual = 0;
  switch (meta.tipo) {
    case "faturamento":
      atual = receitaBruta(movs);
      break;
    case "lucro":
      atual = lucroLiquido(movs);
      break;
    case "teto_gasto":
      atual = despesasOperacionais(movs);
      break;
    case "os":
      atual = ordens.filter(
        (o) => o.status === "entregue" && dentroDoPeriodo(o.entregueEm || o.atualizadoEm, meta, hoje)
      ).length;
      break;
  }

  const alvo = n(meta.alvo);
  const percentual = alvo > 0 ? Math.max(0, (atual / alvo) * 100) : 0;
  const tetoDeGasto = meta.tipo === "teto_gasto";

  return {
    atual,
    alvo,
    percentual,
    // No teto de gasto, "atingir" é ficar abaixo do limite
    atingida: tetoDeGasto ? atual <= alvo : atual >= alvo,
    estourou: tetoDeGasto && atual > alvo,
  };
}

export const CORES_META: Record<TipoMeta, string> = {
  faturamento: "#3b82f6",
  lucro: "#10b981",
  os: "#8b5cf6",
  teto_gasto: "#f59e0b",
};

/* ------------------------------------------------------------------ */
/* Renda fixa: a tela de quem VIVE do que entra todo mês               */
/* ------------------------------------------------------------------ */

export interface ResumoRenda {
  /** Quanto entra por mês somando tudo que é recorrente e está ativo */
  previstoMes: number;
  /** Do mês corrente, o que já foi marcado como recebido */
  recebidoMes: number;
  /** Do mês corrente, o que ainda não caiu e não está atrasado */
  aReceberMes: number;
  /** O que era para ter caído e não caiu */
  atrasado: number;
  /** Quantas fontes de renda ativas */
  fontes: number;
}

/**
 * O retrato do mês para quem vive de renda fixa.
 *
 * A pergunta que esta tela responde não é "quanto eu ganho" — é "o que já
 * caiu e o que ainda falta cair". Quem recebe três salários e dois auxílios
 * em datas diferentes passa o mês fazendo essa conta de cabeça.
 *
 * `recebidoMes` sai dos PAGAMENTOS registrados, não do valor cadastrado: o
 * auxílio que veio menor este mês tem que aparecer pelo que veio, senão a
 * tela mente para o lado otimista — e é justamente quem depende do dinheiro
 * que não pode ser enganado sobre ele.
 */
export function resumoRenda(contas: ContaPagar[], hoje = hojeISO()): ResumoRenda {
  const mes = soData(hoje).slice(0, 7);
  const minhas = (contas || []).filter((c) => ehReceber(c) && c.ativo);

  const recebidoMes = minhas.reduce(
    (s, c) =>
      s +
      (c.pagamentos || [])
        .filter((p) => soData(p.data).slice(0, 7) === mes)
        .reduce((t, p) => t + n(p.valor), 0),
    0
  );

  let aReceberMes = 0;
  let atrasado = 0;
  for (const c of minhas) {
    if (contaQuitada(c)) continue;
    if (soData(c.vencimento).slice(0, 7) !== mes) continue;
    // O saldo, e não o valor cheio: metade do salário que já caiu não pode
    // continuar contando como dinheiro que ainda vem.
    if (situacaoConta(c, hoje) === "atrasada") atrasado += saldoDaConta(c);
    else aReceberMes += saldoDaConta(c);
  }

  const arredonda = (v: number) => Math.round(v * 100) / 100;
  return {
    previstoMes: arredonda(receitaFixaMensal(contas)),
    recebidoMes: arredonda(recebidoMes),
    aReceberMes: arredonda(aReceberMes),
    atrasado: arredonda(atrasado),
    fontes: minhas.length,
  };
}

/**
 * As fontes de renda na ordem em que a pessoa pensa nelas: o que está
 * atrasado primeiro, depois o que cai antes.
 *
 * Ordenar por valor seria o erro clássico: o auxílio de R$ 600 atrasado
 * pesa mais na vida de quem depende dele do que o salário de R$ 3.000 que
 * cai daqui a vinte dias.
 */
export function rendaOrdenada(contas: ContaPagar[], hoje = hojeISO()): ContaPagar[] {
  return (contas || [])
    .filter(ehReceber)
    .sort((a, b) => {
      const atrasoA = situacaoConta(a, hoje) === "atrasada" ? 0 : 1;
      const atrasoB = situacaoConta(b, hoje) === "atrasada" ? 0 : 1;
      if (atrasoA !== atrasoB) return atrasoA - atrasoB;
      // Desligada vai para o fim: ela não faz parte da vida deste mês.
      if (!!a.ativo !== !!b.ativo) return a.ativo ? -1 : 1;
      return diasAteVencer(a.vencimento, hoje) - diasAteVencer(b.vencimento, hoje);
    });
}
