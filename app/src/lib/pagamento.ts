import { centavos } from "./pdv";
import type { FormaPagamento } from "./types";

/**
 * Venda paga em mais de uma forma.
 *
 * Acontece o tempo todo no balcão: "passa R$ 50 no cartão e o resto em
 * dinheiro", "tenho R$ 30 no Pix e completo em espécie". O sistema só
 * aceitava uma forma, então o atendente lançava tudo como dinheiro — e o
 * fechamento do dia acusava sobra no cartão e falta na gaveta, todo dia,
 * sem ninguém achar a origem.
 *
 * A conta mora aqui porque é ela que decide se o caixa fecha.
 */

export interface Parcela {
  forma: FormaPagamento;
  valor: number;
  /** Só para dinheiro: quanto o cliente entregou, para calcular o troco */
  recebido?: number;
}

const n = (v?: number | null): number => Number(v) || 0;

/** Soma do que foi declarado nas formas de pagamento */
export const totalPago = (parcelas: Parcela[]): number =>
  centavos(parcelas.reduce((s, p) => s + n(p.valor), 0));

/**
 * Quanto falta para fechar. Nunca negativo — pagar a mais é troco, não falta.
 */
export const faltaNoPagamento = (total: number, parcelas: Parcela[]): number =>
  centavos(Math.max(0, n(total) - totalPago(parcelas)));

/**
 * Troco.
 *
 * Só sai de dinheiro. Passar R$ 100 no cartão numa compra de R$ 80 não gera
 * R$ 20 de troco — gera estorno, e devolver isso da gaveta é prejuízo puro
 * que só aparece na conferência.
 */
export function trocoDoPagamento(total: number, parcelas: Parcela[]): number {
  const emDinheiro = parcelas.filter((p) => p.forma === "dinheiro");
  if (emDinheiro.length === 0) return 0;

  // O que o cliente entregou em espécie, e o que as OUTRAS formas cobriram.
  const entregue = emDinheiro.reduce((s, p) => s + n(p.recebido ?? p.valor), 0);
  const outras = parcelas
    .filter((p) => p.forma !== "dinheiro")
    .reduce((s, p) => s + n(p.valor), 0);

  return centavos(Math.max(0, entregue + outras - n(total)));
}

/**
 * O que impede de fechar a venda, em português. Vazio = pode fechar.
 *
 * Cada recusa aqui evita um tipo de furo de caixa que só apareceria na
 * conferência da gaveta, dias depois, sem origem rastreável.
 */
export function problemaNoPagamento(total: number, parcelas: Parcela[]): string {
  const validas = parcelas.filter((p) => n(p.valor) > 0);
  if (validas.length === 0) return "Informe como o cliente vai pagar.";

  if (parcelas.some((p) => n(p.valor) < 0)) {
    return "Valor negativo numa das formas de pagamento.";
  }

  const falta = faltaNoPagamento(total, validas);
  if (falta > 0) return `Faltam ${falta.toFixed(2)} para fechar a venda.`;

  // Pagar a mais só é permitido em dinheiro, porque só de dinheiro sai troco.
  const semDinheiro = validas.every((p) => p.forma !== "dinheiro");
  const pago = totalPago(validas);
  if (semDinheiro && pago > n(total)) {
    return (
      `As formas somam ${pago.toFixed(2)} numa venda de ${n(total).toFixed(2)}. ` +
      "Sem dinheiro em espécie não há troco a dar — ajuste os valores."
    );
  }

  const dinheiro = validas.filter((p) => p.forma === "dinheiro");
  for (const p of dinheiro) {
    if (p.recebido !== undefined && n(p.recebido) < n(p.valor)) {
      return "O valor recebido em dinheiro é menor do que o lançado em dinheiro.";
    }
  }

  return "";
}

/**
 * Junta parcelas repetidas da mesma forma.
 *
 * Duas linhas de "dinheiro" no fechamento do caixa é ruído: quem confere
 * quer saber quanto entrou em cada forma, não em quantas etapas.
 */
export function consolidar(parcelas: Parcela[]): Parcela[] {
  const mapa = new Map<FormaPagamento, Parcela>();
  for (const p of parcelas) {
    if (n(p.valor) <= 0) continue;
    const atual = mapa.get(p.forma);
    if (!atual) {
      mapa.set(p.forma, { ...p, valor: centavos(n(p.valor)) });
    } else {
      atual.valor = centavos(atual.valor + n(p.valor));
      if (p.recebido !== undefined) {
        atual.recebido = centavos(n(atual.recebido ?? atual.valor) + n(p.recebido));
      }
    }
  }
  return [...mapa.values()];
}

/**
 * A forma que representa a venda inteira, para telas de uma linha só.
 *
 * É a de maior valor: numa venda de R$ 200 com R$ 190 no cartão e R$ 10 em
 * dinheiro, chamar a venda de "dinheiro" seria mentir sobre onde o dinheiro
 * está.
 */
export function formaPrincipal(parcelas: Parcela[]): FormaPagamento {
  const validas = parcelas.filter((p) => n(p.valor) > 0);
  if (validas.length === 0) return "dinheiro";
  return validas.reduce((a, b) => (n(b.valor) > n(a.valor) ? b : a)).forma;
}

/** Resumo para o cupom: "Cartão R$ 190,00 + Dinheiro R$ 10,00" */
export const descricaoDoPagamento = (
  parcelas: Parcela[],
  rotulo: (f: FormaPagamento) => string
): string =>
  consolidar(parcelas)
    .map((p) => `${rotulo(p.forma)} ${p.valor.toFixed(2)}`)
    .join(" + ");
