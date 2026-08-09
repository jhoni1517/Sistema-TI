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

/**
 * As formas de pagamento que a tela oferece, numa lista só.
 *
 * Estava copiada no PDV e na comanda, e as telas de COMPRA nem perguntavam:
 * a entrada de mercadoria gravava "dinheiro" fixo e a cotação gravava "pix"
 * fixo. Ver o comentário de `FORMAS_DE_COMPRA`, logo abaixo — o estrago é
 * na gaveta.
 */
export const FORMAS_META: { k: FormaPagamento; nome: string }[] = [
  { k: "dinheiro", nome: "Dinheiro" },
  { k: "pix", nome: "Pix" },
  { k: "debito", nome: "Débito" },
  { k: "credito", nome: "Crédito" },
  // Vale entra aqui porque é forma de RECEBER, e num restaurante é diário.
  // Sem ele, o operador lançava como débito ou "outro" — e aí a conferência
  // da maquininha procura o dinheiro num lugar onde ele nunca esteve.
  { k: "vale_refeicao", nome: "Vale-refeição" },
  { k: "vale_alimentacao", nome: "Vale-alimentação" },
];

/**
 * As formas de quando a loja PAGA. É uma lista à parte, não a de cima mais
 * duas.
 *
 * "Transferência" é o boleto e o TED do fornecedor, que ninguém usa para
 * receber no balcão; "Outro" é a troca, o acerto informal, o que não coube.
 * Nenhum dos dois tira nota da gaveta — e é exatamente esse o ponto.
 *
 * E o VALE não entra: ninguém paga fornecedor com vale-refeição. Enquanto
 * esta lista era "a de venda mais duas", acrescentar o vale nas vendas o
 * fazia aparecer também na compra de mercadoria.
 */
export const FORMAS_DE_COMPRA: { k: FormaPagamento; nome: string }[] = [
  { k: "dinheiro", nome: "Dinheiro" },
  { k: "pix", nome: "Pix" },
  { k: "debito", nome: "Débito" },
  { k: "credito", nome: "Crédito" },
  { k: "transferencia", nome: "Transferência / boleto" },
  { k: "outro", nome: "Outro" },
];

/**
 * Todas as formas, para o lançamento manual do caixa.
 *
 * Ali se registra tanto a venda que ficou de fora quanto a conta paga no
 * boleto, então as duas listas valem. É a única tela que precisa das duas.
 */
export const TODAS_AS_FORMAS: { k: FormaPagamento; nome: string }[] = [
  ...FORMAS_META,
  { k: "transferencia", nome: "Transferência / boleto" },
  { k: "outro", nome: "Outro" },
];

/**
 * O nome da forma para MOSTRAR, a partir da chave gravada.
 *
 * A tela imprimia a chave crua com `capitalize` do CSS, e funcionava por
 * sorte: toda forma era uma palavra só. "vale_refeicao" virou
 * "Vale_refeicao" no caixa, no recibo e no relatório no mesmo dia em que a
 * forma nasceu.
 *
 * Chave desconhecida — lançamento antigo, importação — vira texto legível
 * em vez de sumir: o valor está lá e a pessoa precisa saber de onde ele veio.
 */
export function nomeDaForma(k?: string | null): string {
  const chave = String(k ?? "").trim();
  if (!chave) return "Dinheiro"; // vazio é dinheiro, como em lib/caixa.ts
  const achado = TODAS_AS_FORMAS.find((f) => f.k === chave);
  if (achado) return achado.nome;
  const legivel = chave.replace(/_/g, " ");
  return legivel.charAt(0).toUpperCase() + legivel.slice(1);
}

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
 * O troco é a diferença entre o que o cliente ENTREGOU em espécie e o que
 * ele de fato pagou em espécie. Ele não depende do total da venda, porque a
 * soma das formas sempre fecha com o total — o excesso vive em `recebido`,
 * nunca em `valor`.
 *
 * Só sai de dinheiro. Passar R$ 100 no cartão numa compra de R$ 80 não gera
 * R$ 20 de troco — gera estorno, e devolver isso da gaveta é prejuízo puro
 * que só aparece na conferência.
 */
export function trocoDoPagamento(_total: number, parcelas: Parcela[]): number {
  const emDinheiro = parcelas.filter((p) => p.forma === "dinheiro");
  if (emDinheiro.length === 0) return 0;
  const entregue = emDinheiro.reduce((s, p) => s + n(p.recebido ?? p.valor), 0);
  const lancado = emDinheiro.reduce((s, p) => s + n(p.valor), 0);
  return centavos(Math.max(0, entregue - lancado));
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

  /*
   * A soma das formas precisa fechar EXATO com o total.
   *
   * Este é o furo que a revisão pegou: numa venda de 100 com 60 no cartão, o
   * atendente digitava 50 em dinheiro e o sistema aceitava — lançando 110 no
   * caixa por uma venda de 100. A sobra aparecia na conferência da gaveta
   * dias depois, sem origem.
   *
   * Dinheiro a mais na mão do cliente é `recebido`, não `valor`: é de lá que
   * o troco sai, e é o `valor` que vira lançamento no caixa.
   */
  const pago = totalPago(validas);
  if (pago > n(total)) {
    const sobra = centavos(pago - n(total));
    return (
      `As formas somam ${pago.toFixed(2)} numa venda de ${n(total).toFixed(2)}. ` +
      `Tire ${sobra.toFixed(2)} de alguma delas` +
      (validas.some((p) => p.forma === "dinheiro")
        ? " — se o cliente entregou a mais em espécie, ponha o valor entregue no campo Recebido."
        : ".")
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
  /*
   * `recebido` é POR PARCELA, e quem não informou entregou exatamente o que
   * foi lançado. A soma do entregue usava o valor JÁ juntado no lugar do
   * valor da própria linha — o dobro — e é de `entregue - lançado` que sai o
   * troco que a gaveta paga.
   *
   * `informou` existe para não inventar um "Recebido" no cupom quando
   * ninguém digitou nada: guardar entregue igual ao valor não muda a conta,
   * mas faz o cupom afirmar uma coisa que não aconteceu.
   */
  const mapa = new Map<
    FormaPagamento,
    { forma: FormaPagamento; valor: number; entregue: number; informou: boolean }
  >();

  for (const p of parcelas) {
    const valor = centavos(n(p.valor));
    if (valor <= 0) continue;
    const informou = p.recebido !== undefined;
    const entregue = informou ? centavos(n(p.recebido)) : valor;

    const atual = mapa.get(p.forma);
    if (!atual) {
      mapa.set(p.forma, { forma: p.forma, valor, entregue, informou });
    } else {
      atual.valor = centavos(atual.valor + valor);
      atual.entregue = centavos(atual.entregue + entregue);
      atual.informou = atual.informou || informou;
    }
  }

  return [...mapa.values()].map((x) =>
    x.informou
      ? { forma: x.forma, valor: x.valor, recebido: x.entregue }
      : { forma: x.forma, valor: x.valor }
  );
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
