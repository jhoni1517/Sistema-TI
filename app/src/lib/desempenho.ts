import { soData, hojeISO } from "./contas";
import { centavos } from "./pdv";
import type { MovimentoCaixa, Venda } from "./types";

/**
 * As perguntas que o dono faz de cabeça e erra.
 *
 * "Vendi mais que semana passada?", "que horas enche?", "quanto o técnico
 * fez este mês?". Todas têm resposta nos dados e nenhuma tinha resposta na
 * tela — então eram respondidas por impressão, que é onde a decisão errada
 * nasce.
 */

const n = (v?: number | null): number => Number(v) || 0;

/* ------------------------------------------------------------------ */
/* Comparar com o período anterior                                     */
/* ------------------------------------------------------------------ */

export interface Comparativo {
  atual: number;
  anterior: number;
  /** Variação em %, positiva ou negativa. Zero anterior devolve 0. */
  variacao: number;
  melhorou: boolean;
}

/**
 * Compara dois números e devolve a variação.
 *
 * Anterior zero devolve variação 0 e não "infinito por cento": a tela ficaria
 * anunciando crescimento absurdo no primeiro mês de uso, e o número perderia
 * o sentido justo quando ele deveria começar a ganhar confiança.
 */
export function comparar(atual: number, anterior: number): Comparativo {
  const a = centavos(atual);
  const b = centavos(anterior);
  return {
    atual: a,
    anterior: b,
    variacao: b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : 0,
    melhorou: a >= b,
  };
}

/** Receita de um intervalo de datas (AAAA-MM-DD, inclusive nas duas pontas) */
export const receitaEntre = (
  movimentos: MovimentoCaixa[],
  de: string,
  ate: string
): number =>
  centavos(
    movimentos
      .filter((m) => m.tipo === "entrada")
      .filter((m) => {
        const d = soData(m.data);
        return d >= de && d <= ate;
      })
      .reduce((s, m) => s + n(m.valor), 0)
  );

/** Recua uma data em N dias, em UTC como manda a casa */
export const recuar = (data: string, dias: number): string =>
  new Date(Date.parse(soData(data) + "T00:00:00Z") - dias * 86400000)
    .toISOString()
    .slice(0, 10);

/**
 * Os últimos N dias contra os N anteriores a eles.
 *
 * Sete dias contra sete, e não "este mês contra o passado": no dia 3 do mês
 * a comparação mensal é entre três dias e trinta, e o sistema anuncia uma
 * queda de 90% que não existe.
 */
export function comparativoRecente(
  movimentos: MovimentoCaixa[],
  dias = 7,
  hoje = hojeISO()
): Comparativo {
  const fim = soData(hoje);
  const inicio = recuar(fim, dias - 1);
  const fimAnterior = recuar(inicio, 1);
  const inicioAnterior = recuar(fimAnterior, dias - 1);
  return comparar(
    receitaEntre(movimentos, inicio, fim),
    receitaEntre(movimentos, inicioAnterior, fimAnterior)
  );
}

/* ------------------------------------------------------------------ */
/* Ticket médio e horário de pico                                      */
/* ------------------------------------------------------------------ */

/**
 * Ticket médio das vendas de balcão.
 *
 * Só vendas, não o caixa inteiro: lançamento avulso, recebimento de fiado e
 * OS entram no caixa e não são compra de balcão. Misturar dá um número que
 * não serve para nada.
 */
export function ticketMedio(vendas: Venda[]): number {
  const validas = vendas.filter((v) => (v.itens || []).length > 0);
  if (validas.length === 0) return 0;
  const total = validas.reduce(
    (s, v) =>
      s +
      Math.max(
        0,
        (v.itens || []).reduce((t, i) => t + n(i.quantidade) * n(i.precoUnit), 0) -
          n(v.desconto)
      ),
    0
  );
  return centavos(total / validas.length);
}

export interface FaixaHorario {
  hora: number;
  vendas: number;
  receita: number;
}

/**
 * Movimento por hora do dia.
 *
 * Serve para decidir escala e horário de almoço com dado em vez de
 * impressão. A hora é lida no fuso do aparelho de propósito: aqui o que
 * importa é a hora do relógio da loja, não a UTC.
 */
export function porHora(vendas: Venda[]): FaixaHorario[] {
  const faixas: FaixaHorario[] = Array.from({ length: 24 }, (_, hora) => ({
    hora,
    vendas: 0,
    receita: 0,
  }));
  for (const v of vendas) {
    const d = new Date(v.criadoEm);
    if (Number.isNaN(d.getTime())) continue;
    const f = faixas[d.getHours()];
    f.vendas += 1;
    f.receita = centavos(
      f.receita +
        Math.max(
          0,
          (v.itens || []).reduce((t, i) => t + n(i.quantidade) * n(i.precoUnit), 0) -
            n(v.desconto)
        )
    );
  }
  return faixas;
}

/** As horas de maior movimento, da mais cheia para a menos */
export const horariosDePico = (vendas: Venda[], quantas = 3): FaixaHorario[] =>
  porHora(vendas)
    .filter((f) => f.vendas > 0)
    .sort((a, b) => b.receita - a.receita || b.vendas - a.vendas)
    .slice(0, quantas);

/* Comissão do técnico: mora em lib/comissao.ts (regra por técnico e
 * produtividade). Reexportada aqui para quem já importava daqui. */
export { comissoes, type Comissao } from "./comissao";

/* ------------------------------------------------------------------ */


/* ------------------------------------------------------------------ */
/* Sangria sugerida                                                    */
/* ------------------------------------------------------------------ */

/**
 * Dinheiro demais na gaveta.
 *
 * Loja de bairro guarda o dia inteiro em espécie na gaveta sem pensar. O
 * limite não é sobre desconfiar de ninguém: é sobre quanto se perde num
 * assalto, e sobre a gaveta não virar o cofre da loja.
 */
export function sangriaSugerida(
  dinheiroEmCaixa: number,
  limite: number
): { passou: boolean; excedente: number; sugestao: number } {
  const atual = centavos(dinheiroEmCaixa);
  const teto = centavos(limite);
  if (teto <= 0 || atual <= teto) {
    return { passou: false, excedente: 0, sugestao: 0 };
  }
  const excedente = centavos(atual - teto);
  // Arredonda para baixo em dezenas: sangrar R$ 347,63 obriga a mexer em
  // moeda, e o troco da gaveta é justamente o que não pode faltar.
  return { passou: true, excedente, sugestao: Math.floor(excedente / 10) * 10 };
}
