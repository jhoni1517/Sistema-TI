import { brl } from "./format";
import type { TaxasCartao } from "./sobra";

/**
 * Simulador de parcelas.
 *
 * "Em quantas vezes dá?" é a pergunta do balcão, e a resposta errada custa
 * dos dois lados: parcelar em 10x "sem juros" com 12% de taxa come a margem
 * do conserto inteiro; repassar a taxa sem saber quanto ela é assusta o
 * cliente com um número inventado.
 *
 * Duas colunas: sem juros (o cliente paga o preço, a loja recebe menos) e
 * repassando (o cliente paga mais, a loja recebe o preço cheio).
 *
 * Tudo em centavos inteiros. A parcela que não divide exato leva a diferença
 * na PRIMEIRA — é como a maquininha faz, e a soma das parcelas bate com o
 * total no centavo.
 */

export type TaxasParcelas = Record<string, number>;

const limita = (v: unknown) => Math.max(0, Math.min(40, Number(v) || 0));
const c = (reais: number) => Math.round(reais * 100);

/**
 * Taxa de N parcelas. 1x = crédito à vista. Parcela sem taxa cadastrada usa
 * a da maior parcela abaixo dela que tem (quem cadastrou 6x e 12x, cobre o
 * 7x com a do 6x) — melhor errar para menos do que inventar.
 */
export function taxaDe(n: number, taxas: TaxasCartao = {}, parcelas: TaxasParcelas = {}): number {
  if (n <= 1) return limita(taxas.credito);
  for (let k = n; k >= 2; k--) {
    const v = parcelas[String(k)];
    if (v !== undefined && v !== null && Number(v) > 0) return limita(v);
  }
  return limita(taxas.credito);
}

/** Divide em parcelas, com o centavo que sobra na primeira. */
export function dividir(totalCentavos: number, n: number): number[] {
  const base = Math.floor(totalCentavos / n);
  const resto = totalCentavos - base * n;
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + resto : base));
}

export interface LinhaSimulacao {
  rotulo: string;
  parcelas: number;
  taxa: number;
  /** Sem juros: o cliente paga o preço */
  semJuros: { total: number; parcela: number; primeira: number; recebe: number };
  /** Repassando: a loja recebe o preço cheio */
  repassando: { total: number; parcela: number; primeira: number; recebe: number };
}

function linha(valorC: number, n: number, taxa: number, rotulo: string): LinhaSimulacao {
  const t = taxa / 100;
  const recebeSem = Math.floor(valorC * (1 - t));
  // Repassando: o menor total que, tirada a taxa, devolve pelo menos o preço.
  let totalRep = t >= 1 ? valorC : Math.ceil(valorC / (1 - t));
  while (Math.floor(totalRep * (1 - t)) < valorC) totalRep++;
  const pSem = dividir(valorC, n);
  const pRep = dividir(totalRep, n);
  return {
    rotulo,
    parcelas: n,
    taxa,
    semJuros: { total: valorC / 100, parcela: pSem[n - 1] / 100, primeira: pSem[0] / 100, recebe: recebeSem / 100 },
    repassando: { total: totalRep / 100, parcela: pRep[n - 1] / 100, primeira: pRep[0] / 100, recebe: Math.floor(totalRep * (1 - t)) / 100 },
  };
}

/** Débito e crédito de 1x a `ate`. Valor zerado ou negativo não simula. */
export function simular(valor: number, taxas: TaxasCartao = {}, parcelas: TaxasParcelas = {}, ate = 12): LinhaSimulacao[] {
  const v = c(valor);
  if (!(v > 0)) return [];
  const saida = [linha(v, 1, limita(taxas.debito), "Débito")];
  for (let n = 1; n <= Math.max(1, Math.min(24, ate)); n++) {
    saida.push(linha(v, n, taxaDe(n, taxas, parcelas), n === 1 ? "Crédito à vista" : `${n}x`));
  }
  return saida;
}

/** Faltou cadastrar taxa: a simulação mostra o que der, mas avisa. */
export function avisoDeTaxas(taxas: TaxasCartao = {}, parcelas: TaxasParcelas = {}): string {
  const temParcela = Object.values(parcelas).some((v) => Number(v) > 0);
  if (!(Number(taxas.credito) > 0) && !temParcela) return "Cadastre as taxas da maquininha em Configurações: sem elas, a conta sai sem taxa.";
  if (!temParcela) return "Sem taxa do parcelado cadastrada: usei a do crédito à vista para todas as parcelas.";
  return "";
}

/** Texto para o WhatsApp. Sem emoji. `repassar` escolhe a coluna. */
export function textoDaSimulacao(valor: number, linhas: LinhaSimulacao[], loja: string, repassar: boolean, descricao?: string): string {
  const cab = [`*${loja || "Orçamento"}*`, descricao ? `${descricao}: ${brl(valor)}` : `Valor: ${brl(valor)}`, ""];
  const corpo = linhas.map((l) => {
    const x = repassar ? l.repassando : l.semJuros;
    if (l.parcelas === 1) return `${l.rotulo}: ${brl(x.total)}`;
    const diferente = x.primeira !== x.parcela ? ` (1ª de ${brl(x.primeira)})` : "";
    return `${l.rotulo} de ${brl(x.parcela)}${diferente}${repassar ? ` = ${brl(x.total)}` : " sem juros"}`;
  });
  return [...cab, ...corpo, "", "Pix e dinheiro: consulte desconto."].join("\n");
}
