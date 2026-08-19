import {
  hojeISO,
  soData,
  contaQuitada,
  ehReceber,
  proximoVencimento,
  saldoDaConta,
} from "./contas";
import { txt } from "./format";
import type { ContaPagar } from "./types";

/**
 * O QUE AINDA VAI ACONTECER COM O DINHEIRO, DIA A DIA.
 *
 * O sistema inteiro olha para trás: o que entrou, o que saiu, quanto sobrou.
 * A pergunta que ninguém responde é a única que se faz de manhã — "até o dia
 * 20 o dinheiro dá?".
 *
 * Quem tem loja faz essa conta de cabeça toda semana e erra, porque são
 * quinze contas em datas diferentes. Quem vive de salário e auxílio faz no
 * papel e também erra, pelo mesmo motivo.
 *
 * ------------------------------------------------------------
 * A DECISÃO QUE FAZ ESTE NÚMERO SER CONFIÁVEL
 *
 * Só entra aqui o que tem DATA E VALOR COMBINADOS. Conta a pagar cadastrada,
 * renda fixa cadastrada. Venda futura NÃO entra.
 *
 * A tentação é grande: dá para pegar a média das últimas quatro semanas e
 * projetar faturamento. Mas aí o número deixa de ser um compromisso e vira
 * um palpite — e um palpite que a pessoa vai usar para decidir se paga o
 * fornecedor hoje. Previsão errada para o lado otimista é pior que nenhuma
 * previsão: ela dá permissão para gastar dinheiro que não vai chegar.
 *
 * Então o que sai daqui é uma frase que dá para agir em cima:
 *
 *   "Até dia 20 saem R$ 3.400 e entram R$ 2.000 já garantidos.
 *    Faltam R$ 1.400 que precisam vir da venda."
 *
 * Para a loja, isso é a meta da quinzena. Para quem vive de renda fixa, é o
 * aviso de que o mês não fecha — e a diferença entre saber isso hoje ou no
 * dia 20 é a diferença entre resolver e não resolver.
 * ------------------------------------------------------------
 */

const n = (v?: number | null): number => Number(v) || 0;
const centavos = (v: number): number => {
  const x = Number(v) || 0;
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100 + 0;
};

/** Uma coisa marcada para acontecer num dia */
export interface Compromisso {
  /** AAAA-MM-DD */
  dia: string;
  descricao: string;
  categoria: string;
  valor: number;
  /** entra = renda fixa; sai = conta a pagar */
  direcao: "entra" | "sai";
  /** De qual cadastro veio, para a tela poder abrir */
  contaId: string;
  /**
   * É a repetição futura de uma conta recorrente?
   *
   * A primeira ocorrência é a que está gravada; as seguintes são calculadas.
   * A tela mostra a diferença porque a pessoa PODE mexer na primeira (marcar
   * como paga, mudar valor) e não nas outras.
   */
  projetado: boolean;
  /**
   * Já venceu e não foi pago.
   *
   * Entra na projeção no dia de HOJE, não na data original. Foi um teste que
   * pegou isto: a primeira versão só olhava de hoje para frente, e uma conta
   * vencida ontem sumia da previsão inteira. O dinheiro continua tendo que
   * sair — com mais urgência, não menos — e uma previsão que esconde o
   * atrasado esconde justamente o buraco que ela existe para mostrar.
   */
  atrasado: boolean;
}

export interface DiaProjetado {
  dia: string;
  entra: number;
  sai: number;
  /** Entra menos sai, somado desde hoje */
  acumulado: number;
  compromissos: Compromisso[];
}

export interface Projecao {
  dias: DiaProjetado[];
  totalEntra: number;
  totalSai: number;
  /** Sai menos entra. Positivo = precisa vir de outro lugar (venda, reserva). */
  precisaVir: number;
  /**
   * O primeiro dia em que o acumulado fica negativo, e quanto falta ali.
   *
   * É O NÚMERO DA TELA. Não é o total do período: é a data em que o buraco
   * aparece, porque é ela que diz quando agir. Um mês que fecha positivo no
   * dia 30 mas fica negativo no dia 12 continua sendo um problema no dia 12.
   */
  aperto?: { dia: string; falta: number };
  /** O pior momento do período, mesmo que nunca fique negativo */
  menorSaldo: { dia: string; valor: number };
}

/** Soma dias a uma data AAAA-MM-DD, em UTC. */
const maisDias = (dia: string, dias: number): string => {
  const d = new Date(soData(dia) + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return soData(dia);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

/**
 * Todas as vezes que esta conta acontece daqui até `ate`.
 *
 * Conta única e conta já quitada dão no máximo uma ocorrência. Recorrente
 * repete pela regra de sempre — inclusive a do dia 31, que volta para 31
 * depois de passar por fevereiro. Reusa `proximoVencimento` em vez de
 * recalcular: regra escrita em dois lugares envelhece em um deles.
 */
export function ocorrenciasDaConta(
  c: ContaPagar,
  de: string,
  ate: string
): Compromisso[] {
  if (!c?.ativo) return [];
  if (contaQuitada(c)) return [];

  const base = {
    descricao: txt(c.descricao),
    categoria: txt(c.categoria),
    valor: centavos(n(c.valor)),
    direcao: (ehReceber(c) ? "entra" : "sai") as "entra" | "sai",
    contaId: c.id,
  };
  if (base.valor <= 0) return [];

  /*
   * A PRIMEIRA ocorrência vale o SALDO; as seguintes valem o valor cheio.
   *
   * Pagos R$ 300 de uma fatura de R$ 1.000, o que ainda tem que sair neste
   * mês são R$ 700 — mas o mês que vem volta a ser R$ 1.000. Usar o saldo em
   * todas faria a previsão do trimestre inteiro nascer R$ 300 mais barata; e
   * usar o cheio na primeira mandaria a pessoa separar dinheiro que ela já
   * pagou.
   *
   * Previsão existe para decidir se dá para pagar o fornecedor hoje: os dois
   * erros mentem sobre isso, um para cada lado.
   */
  const saldo = centavos(saldoDaConta(c));

  const saida: Compromisso[] = [];
  let dia = soData(c.vencimento);
  const diaOriginal = new Date(dia + "T00:00:00Z").getUTCDate() || undefined;

  /*
   * Teto de 400 voltas, igual ao da agenda: dado ruim não pode virar laço
   * infinito na tela. Sessenta dias de janela com repetição semanal dão nove
   * ocorrências, então o teto nunca é alcançado em uso normal.
   */
  for (let i = 0; i < 400; i++) {
    if (dia > ate) break;
    // Só a primeira volta é o ciclo corrente, e só ela leva o saldo abatido.
    const valor = i === 0 ? saldo : base.valor;
    if (dia >= de) {
      // Saldo zerado na primeira volta é ciclo já quitado: pula a ocorrência
      // sem cortar as futuras, que continuam valendo o valor cheio.
      if (valor > 0) saida.push({ ...base, valor, dia, projetado: i > 0, atrasado: false });
    } else if (i === 0 && base.direcao === "sai" && valor > 0) {
      /*
       * CONTA VENCIDA E NÃO PAGA: entra HOJE.
       *
       * `c.vencimento` de uma recorrente é sempre a PRÓXIMA em aberto — as
       * pagas já empurraram a data para frente. Então uma data no passado só
       * pode significar uma coisa: não foi pago e continua devendo.
       *
       * ------------------------------------------------------------
       * E A RENDA ATRASADA? NÃO ENTRA. A ASSIMETRIA É DE PROPÓSITO.
       *
       * O salário que era para cair dia 5 e não caiu é justamente o dinheiro
       * com que não se pode contar. Somá-lo faria a previsão dizer que o mês
       * está coberto por causa de um dinheiro que já provou que pode não vir
       * — e essa é a única mentira que esta função não pode contar, porque
       * ela existe para decidir se dá para pagar o fornecedor hoje.
       *
       * Conta atrasada aumenta o buraco; renda atrasada não o tapa. O erro
       * seguro é sempre para o lado pessimista.
       *
       * A renda que não caiu não some do sistema: ela aparece em vermelho na
       * tela de Renda fixa, que é onde se cobra quem devia ter pago.
       * ------------------------------------------------------------
       *
       * Só a primeira volta (i === 0) faz isso. As seguintes são datas
       * calculadas para o futuro e nunca caem antes de hoje.
       */
      saida.push({ ...base, valor, dia: de, projetado: false, atrasado: true });
    }
    if (c.recorrencia === "unica") break;
    const proxima = proximoVencimento(dia, c.recorrencia, diaOriginal);
    // Trava: se não andou, para. Sem isto, recorrência desconhecida devolve a
    // mesma data e o laço enche a lista com o mesmo dia 400 vezes.
    if (proxima <= dia) break;
    dia = proxima;
  }
  return saida;
}

/**
 * O caixa dos próximos dias, a partir do que já está combinado.
 *
 * `dias` é a janela. Sessenta é o padrão porque cobre o mês corrente e o
 * seguinte: quem olha isto no dia 25 precisa ver o mês que vem, senão a tela
 * fica vazia justamente quando a pergunta é mais urgente.
 */
export function projetarCaixa(
  contas: ContaPagar[],
  hoje = hojeISO(),
  dias = 60
): Projecao {
  const inicio = soData(hoje);
  const fim = maisDias(inicio, Math.max(1, dias));

  const todos: Compromisso[] = [];
  for (const c of contas || []) todos.push(...ocorrenciasDaConta(c, inicio, fim));

  const porDia = new Map<string, Compromisso[]>();
  for (const c of todos) {
    if (!porDia.has(c.dia)) porDia.set(c.dia, []);
    porDia.get(c.dia)!.push(c);
  }

  const listaDias: DiaProjetado[] = [];
  let acumulado = 0;
  let totalEntra = 0;
  let totalSai = 0;
  let aperto: { dia: string; falta: number } | undefined;
  let menorSaldo = { dia: inicio, valor: 0 };

  for (const dia of [...porDia.keys()].sort()) {
    const doDia = porDia.get(dia)!;
    const entra = centavos(
      doDia.filter((x) => x.direcao === "entra").reduce((s, x) => s + x.valor, 0)
    );
    const sai = centavos(
      doDia.filter((x) => x.direcao === "sai").reduce((s, x) => s + x.valor, 0)
    );
    acumulado = centavos(acumulado + entra - sai);
    totalEntra = centavos(totalEntra + entra);
    totalSai = centavos(totalSai + sai);

    /*
     * O PRIMEIRO dia negativo, e nunca o pior.
     *
     * Quem precisa agir age na data em que o buraco aparece. Mostrar o pior
     * dia do período faria a pessoa se preparar para uma data em que já vai
     * estar devendo há uma semana.
     */
    if (acumulado < 0 && !aperto) aperto = { dia, falta: centavos(-acumulado) };
    if (acumulado < menorSaldo.valor) menorSaldo = { dia, valor: acumulado };

    listaDias.push({
      dia,
      entra,
      sai,
      acumulado,
      // Dentro do dia: o que sai primeiro. É o que preocupa.
      compromissos: [...doDia].sort((a, b) =>
        a.direcao === b.direcao ? b.valor - a.valor : a.direcao === "sai" ? -1 : 1
      ),
    });
  }

  return {
    dias: listaDias,
    totalEntra,
    totalSai,
    precisaVir: centavos(Math.max(0, totalSai - totalEntra)),
    aperto,
    menorSaldo,
  };
}

/**
 * A frase que resume a projeção, pronta para a tela.
 *
 * Frase e não número solto porque "R$ 1.400" sozinho não diz o que fazer.
 * Sem emoji: este texto também sai no aviso do Telegram.
 */
export function resumoDaProjecao(p: Projecao, dias = 60): string {
  if (p.dias.length === 0) {
    return `Nada marcado para os próximos ${dias} dias. Cadastre suas contas e sua renda para ver a previsão.`;
  }
  if (p.aperto) {
    const [, m, d] = p.aperto.dia.split("-");
    return (
      `No dia ${d}/${m} falta ${brlSimples(p.aperto.falta)}: até lá saem ` +
      `${brlSimples(p.totalSai)} e entram ${brlSimples(p.totalEntra)} garantidos.`
    );
  }
  if (p.precisaVir > 0) {
    return (
      `Nos próximos ${dias} dias saem ${brlSimples(p.totalSai)} e entram ` +
      `${brlSimples(p.totalEntra)} garantidos. Faltam ${brlSimples(p.precisaVir)} ` +
      `para vir da venda.`
    );
  }
  return (
    `Os próximos ${dias} dias estão cobertos: entram ${brlSimples(p.totalEntra)} ` +
    `e saem ${brlSimples(p.totalSai)}.`
  );
}

/** Formatação simples, que também serve para mensagem fora do sistema */
const brlSimples = (v: number): string =>
  "R$ " + Number(v || 0).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
