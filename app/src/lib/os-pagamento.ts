import { centavos } from "./pdv";
import { problemaNoPagamento, totalPago, type Parcela } from "./pagamento";
import type { MovimentoCaixa } from "./types";

/**
 * ============================================================
 *  O CLIENTE PAGOU SÓ UMA PARTE
 * ============================================================
 *
 * Até aqui a OS era tudo ou nada: ou o pagamento fechava exato, ou o sistema
 * recusava com "Faltam R$ 500 para fechar a venda". No balcão isso acontece
 * o tempo todo e sempre do mesmo jeito — o cliente paga metade e o
 * atendente resolve por fora, no caderno.
 *
 * ------------------------------------------------------------
 * SÃO DUAS SAÍDAS, E ELAS NÃO SÃO A MESMA COISA
 *
 *   FIADO ..... o cliente LEVA o aparelho e fica devendo
 *   SINAL ..... o aparelho FICA na loja até o resto ser pago
 *
 * A diferença é o aparelho, e é ela que justifica existirem duas opções. Se
 * as duas entregassem, seriam a mesma coisa com dois nomes.
 *
 * O fiado é uma DÍVIDA: vai para A Receber, conta no teto daquele cliente,
 * entra na cobrança e aparece no "quanto me devem". O sinal não é dívida de
 * ninguém — é adiantamento, o dinheiro que a loja pega para comprar a peça.
 * Lançar sinal como fiado inflaria o que o cliente deve por um aparelho que
 * está na prateleira da loja; lançar fiado como sinal esconderia uma dívida
 * de verdade.
 * ------------------------------------------------------------
 *
 * O QUE NÃO MUDA
 *
 * O que entra no caixa é o que o cliente PAGOU, nunca o total da OS. E a
 * soma das formas continua sem poder passar do que falta: dinheiro a mais
 * na gaveta aparece dias depois sem origem, que é o furo que
 * `problemaNoPagamento` existe para fechar.
 */

const n = (v?: number | null): number => Number(v) || 0;

export type DestinoDoResto = "fiado" | "sinal";

export const DESTINO_META: Record<
  DestinoDoResto,
  { label: string; explicacao: string; entrega: boolean }
> = {
  fiado: {
    label: "Levar e ficar devendo",
    explicacao:
      "O aparelho sai hoje. O que falta vira dívida em A Receber, com cobrança.",
    entrega: true,
  },
  sinal: {
    label: "Sinal: o aparelho fica",
    explicacao:
      "O dinheiro entra no caixa e a OS continua aberta. O aparelho só sai quando o resto for pago.",
    entrega: false,
  },
};

/** Este destino entrega o aparelho? É a única diferença que importa. */
export const entregaOAparelho = (d: DestinoDoResto): boolean => DESTINO_META[d].entrega;

/**
 * Quanto já entrou no caixa por esta OS.
 *
 * Sai dos MOVIMENTOS e não de um campo da OS porque é lá que o dinheiro
 * mora de verdade — e porque um campo separado começaria a divergir do
 * caixa no primeiro estorno.
 *
 * Só entrada: devolução e sangria lançadas na mesma OS não são pagamento
 * dela.
 */
export const recebidoDaOS = (movimentos: MovimentoCaixa[], osId: string): number =>
  centavos(
    (movimentos || [])
      .filter((m) => m.osId === osId && m.tipo === "entrada")
      .reduce((s, m) => s + n(m.valor), 0)
  );

export type SituacaoDaConta = "sem_valor" | "parcial" | "exato" | "sobra";

export interface ContaDaOS {
  /** O total a cobrar hoje, guarda incluída */
  aCobrar: number;
  /** O que já tinha entrado antes desta vez */
  jaRecebido: number;
  /** O que está sendo pago agora */
  agora: number;
  /** O que ainda vai faltar depois deste pagamento. Nunca negativo. */
  falta: number;
  situacao: SituacaoDaConta;
}

/**
 * A conta da OS depois deste pagamento.
 *
 * `jaRecebido` entra na conta porque o sinal de ontem tem que abater o de
 * hoje: sem isso, a segunda parcela cobraria o total de novo e o caixa
 * receberia mais do que o serviço custou.
 */
export function contaDaOS(
  aCobrar: number,
  parcelas: Parcela[],
  jaRecebido = 0
): ContaDaOS {
  const total = centavos(Math.max(0, n(aCobrar)));
  const antes = centavos(Math.max(0, n(jaRecebido)));
  const agora = totalPago(parcelas || []);
  const restava = centavos(Math.max(0, total - antes));
  const falta = centavos(Math.max(0, restava - agora));

  const situacao: SituacaoDaConta =
    agora <= 0 ? "sem_valor" : agora > restava ? "sobra" : falta > 0 ? "parcial" : "exato";

  return { aCobrar: total, jaRecebido: antes, agora, falta, situacao };
}

/**
 * O que impede de registrar este pagamento, em português. Vazio = pode.
 *
 * Repare no que ele NÃO recusa: faltar dinheiro. Faltar virou pergunta —
 * fiado ou sinal — e não mais erro. O resto das recusas continua igual, e de
 * propósito ele chama `problemaNoPagamento` em vez de recopiar as regras:
 * forma vazia, valor negativo e "recebido menor que o lançado" são o mesmo
 * furo de caixa aqui e no PDV, e cópia envelhece.
 *
 * O truque de passar `totalPago` como total é o que desliga só a checagem da
 * falta, mantendo todas as outras vivas — inclusive as que alguém
 * acrescentar lá amanhã.
 */
export function problemaNaEntradaDaOS(
  aCobrar: number,
  parcelas: Parcela[],
  jaRecebido = 0
): string {
  const validas = (parcelas || []).filter((p) => n(p.valor) > 0);
  const base = problemaNoPagamento(totalPago(validas), parcelas || []);
  if (base) return base;

  const conta = contaDaOS(aCobrar, parcelas, jaRecebido);
  if (conta.situacao === "sobra") {
    const sobra = centavos(conta.agora - centavos(conta.aCobrar - conta.jaRecebido));
    return (
      `As formas somam ${conta.agora.toFixed(2)} e faltavam só ` +
      `${centavos(conta.aCobrar - conta.jaRecebido).toFixed(2)}. ` +
      `Tire ${sobra.toFixed(2)} de alguma delas — se o cliente entregou a mais ` +
      `em espécie, ponha o valor entregue no campo Recebido, que é de onde sai o troco.`
    );
  }
  return "";
}

/**
 * A pergunta que a tela faz quando falta dinheiro.
 *
 * Ela diz o VALOR que falta, e não "o pagamento está incompleto": quem está
 * no balcão decide olhando o número, e obrigar a pessoa a fazer a subtração
 * de cabeça na frente do cliente é como o erro entra.
 */
export const perguntaDoResto = (conta: ContaDaOS): string =>
  `Faltam R$ ${conta.falta.toFixed(2)}. O que fazer com o resto?`;

/**
 * Quanto ainda falta receber nesta OS, olhando só o que já entrou.
 *
 * É o número que a lista e o detalhe mostram depois do sinal. Sem ele o
 * sinal seria invisível: a OS ficaria com cara de paga e ninguém cobraria o
 * resto — que é exatamente o erro que o caderno do balcão comete.
 */
export const faltaNaOS = (
  aCobrar: number,
  movimentos: MovimentoCaixa[],
  osId: string
): number => centavos(Math.max(0, centavos(n(aCobrar)) - recebidoDaOS(movimentos, osId)));
