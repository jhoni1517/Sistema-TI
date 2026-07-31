import { txt } from "./format";
import { hojeISO, soData } from "./contas";
import { aniversarioNoAno } from "./agenda";
import { saldoFiado } from "./calc";
import type { Cliente, Fiado, OrdemServico, Venda } from "./types";

/**
 * Motivos para falar com o cliente antes de ele sumir.
 *
 * A loja de bairro vive de quem volta, e quem volta some sem avisar. Estas
 * listas existem para transformar "eu devia ligar pra alguém" em uma fila de
 * nomes com o texto pronto.
 *
 * Nada aqui dispara mensagem sozinho. A loja escolhe quem, lê o texto e
 * manda — porque mensagem automática de loja de bairro vira spam na primeira
 * semana, e aí o número entra no bloqueio de todo mundo.
 */

const n = (v?: number | null): number => Number(v) || 0;

/* ------------------------------------------------------------------ */
/* Aniversariantes                                                     */
/* ------------------------------------------------------------------ */

export interface Aniversariante {
  cliente: Cliente;
  /** AAAA-MM-DD do aniversário neste ano */
  data: string;
  /** Dia do mês, para ordenar e mostrar */
  dia: number;
  /** É hoje? */
  hoje: boolean;
  /** Já passou neste mês? */
  passou: boolean;
}

/**
 * Aniversariantes de um mês, na ordem do dia.
 *
 * 29/02 cai em 28/02 nos anos comuns — a mesma regra da Agenda. Sem isso, um
 * cliente nascido em ano bissexto simplesmente não faria aniversário três
 * anos em cada quatro.
 */
export function aniversariantesDoMes(
  clientes: Cliente[],
  ano: number,
  mes1a12: number,
  hoje = hojeISO()
): Aniversariante[] {
  const out: Aniversariante[] = [];
  for (const c of clientes) {
    const nasc = soData(c.nascimento);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nasc)) continue;
    const data = aniversarioNoAno(nasc, ano);
    if (!data) continue;
    if (Number(data.slice(5, 7)) !== mes1a12) continue;
    out.push({
      cliente: c,
      data,
      dia: Number(data.slice(8, 10)),
      hoje: data === soData(hoje),
      passou: data < soData(hoje),
    });
  }
  return out.sort((a, b) => a.dia - b.dia);
}

/**
 * Mensagem de aniversário, pronta para o WhatsApp.
 *
 * Sem emoji: em alguns aparelhos elas chegam como "?" e sujam justamente a
 * mensagem que deveria causar boa impressão.
 *
 * Sem promessa de desconto embutida: a loja escreve a oferta dela se quiser.
 * Um texto que promete brinde e não é cumprido é pior do que nenhum texto.
 */
export function mensagemAniversario(cliente: Cliente, nomeLoja: string): string {
  const primeiro = txt(cliente.nome).trim().split(/\s+/)[0] || "";
  const loja = txt(nomeLoja).trim();
  return (
    `${primeiro ? `Olá, ${primeiro}!` : "Olá!"} ` +
    `Passando para desejar um feliz aniversário.` +
    (loja ? ` Um abraço da equipe da ${loja}.` : "")
  );
}

/* ------------------------------------------------------------------ */
/* Clientes sumidos                                                    */
/* ------------------------------------------------------------------ */

export interface ClienteSumido {
  cliente: Cliente;
  /** Data do último contato de qualquer tipo (compra ou OS) */
  ultimaVez: string;
  diasSem: number;
  /** Quanto ele já gastou aqui. É o que decide para quem ligar primeiro. */
  totalGasto: number;
}

/**
 * Quem comprava e parou.
 *
 * Ordenado pelo que a pessoa já gastou, não pelo tempo sumido: com uma tarde
 * livre e vinte nomes na lista, ligar primeiro para quem mais deixou dinheiro
 * na loja é o que muda o mês.
 *
 * Cliente sem nenhum registro fica de fora — ele nunca comprou, então não
 * "sumiu"; é cadastro parado, outro problema.
 */
export function clientesSumidos(
  clientes: Cliente[],
  vendas: Venda[],
  ordens: OrdemServico[],
  diasLimite = 90,
  hoje = hojeISO()
): ClienteSumido[] {
  const ultima = new Map<string, string>();
  const gasto = new Map<string, number>();

  const registrar = (id: string | undefined, data: string, valor: number) => {
    if (!id) return;
    const dia = soData(data);
    if (dia > (ultima.get(id) || "")) ultima.set(id, dia);
    gasto.set(id, (gasto.get(id) || 0) + valor);
  };

  for (const v of vendas) {
    const total = (v.itens || []).reduce(
      (s, i) => s + n(i.quantidade) * n(i.precoUnit),
      0
    );
    registrar(v.clienteId, v.criadoEm, Math.max(0, total - n(v.desconto)));
  }
  for (const o of ordens) {
    registrar(o.clienteId, o.entregueEm || o.criadoEm, 0);
  }

  const dias = (de: string): number =>
    Math.round(
      (Date.parse(soData(hoje) + "T00:00:00Z") - Date.parse(de + "T00:00:00Z")) / 86400000
    );

  return clientes
    .map((c) => {
      const ultimaVez = ultima.get(c.id) || "";
      return {
        cliente: c,
        ultimaVez,
        diasSem: ultimaVez ? dias(ultimaVez) : 0,
        totalGasto: gasto.get(c.id) || 0,
      };
    })
    .filter((x) => x.ultimaVez && x.diasSem >= diasLimite)
    .sort((a, b) => b.totalGasto - a.totalGasto || b.diasSem - a.diasSem);
}

/* ------------------------------------------------------------------ */
/* Fiado vencido                                                       */
/* ------------------------------------------------------------------ */

export interface FiadoAtrasado {
  fiado: Fiado;
  cliente?: Cliente;
  saldo: number;
  diasAtraso: number;
}

/**
 * Fiado que passou do vencimento, do mais atrasado para o menos.
 *
 * Fiado sem vencimento não entra: ele nunca "atrasa", e listá-lo junto faria
 * a fila de cobrança nascer com trinta nomes e ser ignorada no primeiro dia.
 */
export function fiadosAtrasados(
  fiados: Fiado[],
  clientes: Cliente[],
  hoje = hojeISO()
): FiadoAtrasado[] {
  const dia = soData(hoje);
  return fiados
    .filter((f) => !f.quitado && soData(f.vencimento) && soData(f.vencimento) < dia)
    .map((f) => ({
      fiado: f,
      cliente: clientes.find((c) => c.id === f.clienteId),
      saldo: saldoFiado(f),
      diasAtraso: Math.round(
        (Date.parse(dia + "T00:00:00Z") -
          Date.parse(soData(f.vencimento) + "T00:00:00Z")) /
          86400000
      ),
    }))
    .filter((x) => x.saldo > 0)
    .sort((a, b) => b.diasAtraso - a.diasAtraso);
}

/** Quanto está vencido no total */
export const totalAtrasadoEmFiado = (lista: FiadoAtrasado[]): number =>
  lista.reduce((s, x) => s + x.saldo, 0);
