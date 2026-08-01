import { soData } from "./contas";
import { txt } from "./format";
import { centavos } from "./pdv";
import { ehCompraEstoque } from "./calc";
import type { MovimentoCaixa } from "./types";

/**
 * O arquivo que o contador pede todo mês.
 *
 * Hoje a resposta é mandar print do relatório, e o contador redigita. Cada
 * redigitação é uma chance de erro, e a conversa "esse número está diferente
 * do que você me mandou" custa uma tarde dos dois lados.
 *
 * CSV e não Excel de propósito: CSV abre em qualquer planilha, em qualquer
 * versão, sem instalar nada — e é o que todo sistema contábil importa.
 */

const n = (v?: number | null): number => Number(v) || 0;

/**
 * Escapa um campo para CSV.
 *
 * O ponto e vírgula é o separador porque o Excel em português espera isso: com
 * vírgula, a planilha inteira abre numa coluna só e o contador devolve o
 * arquivo pedindo "manda de novo, veio tudo junto".
 *
 * Aspas dentro do texto viram aspas duplas, que é a regra do formato. Sem
 * isso, uma descrição com aspas quebra todas as colunas dali para a frente.
 */
export const campoCSV = (v: string | number | undefined | null): string => {
  const s = String(v ?? "");
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Valor no formato que a planilha em português entende: vírgula decimal */
export const numeroCSV = (v: number): string => centavos(v).toFixed(2).replace(".", ",");

export interface LinhaContabil {
  data: string;
  tipo: string;
  categoria: string;
  descricao: string;
  formaPagamento: string;
  entrada: number;
  saida: number;
  /** Compra de mercadoria não é despesa do mês: é troca de dinheiro por bem */
  compraEstoque: string;
}

/**
 * Lançamentos de um período, prontos para a planilha.
 *
 * Entrada e saída em colunas separadas, e não uma coluna com sinal: é assim
 * que todo livro-caixa é montado, e somar coluna é o que o contador faz
 * primeiro ao abrir o arquivo.
 */
export function linhasDoPeriodo(
  movimentos: MovimentoCaixa[],
  de: string,
  ate: string
): LinhaContabil[] {
  return movimentos
    .filter((m) => {
      const d = soData(m.data);
      return d >= de && d <= ate;
    })
    .sort((a, b) => txt(a.data).localeCompare(txt(b.data)))
    .map((m) => ({
      data: soData(m.data).split("-").reverse().join("/"),
      tipo: m.tipo === "entrada" ? "Entrada" : m.tipo === "sangria" ? "Sangria" : "Saída",
      categoria: txt(m.categoria),
      descricao: txt(m.descricao),
      formaPagamento: txt(m.formaPagamento),
      entrada: m.tipo === "entrada" ? n(m.valor) : 0,
      saida: m.tipo === "entrada" ? 0 : n(m.valor),
      compraEstoque: ehCompraEstoque(m) ? "sim" : "nao",
    }));
}

const CABECALHO = [
  "Data",
  "Tipo",
  "Categoria",
  "Descricao",
  "Forma de pagamento",
  "Entrada",
  "Saida",
  "Compra de estoque",
];

/**
 * O arquivo inteiro, com totais no fim.
 *
 * Os totais vão no arquivo de propósito: sem eles, a primeira coisa que o
 * contador faz é somar — e se a soma dele der diferente da tela do sistema,
 * ninguém sabe qual das duas está certa.
 */
export function csvDoPeriodo(
  movimentos: MovimentoCaixa[],
  de: string,
  ate: string
): string {
  const linhas = linhasDoPeriodo(movimentos, de, ate);
  const entradas = linhas.reduce((s, l) => s + l.entrada, 0);
  const saidas = linhas.reduce((s, l) => s + l.saida, 0);

  const corpo = linhas.map((l) =>
    [
      l.data,
      l.tipo,
      l.categoria,
      l.descricao,
      l.formaPagamento,
      numeroCSV(l.entrada),
      numeroCSV(l.saida),
      l.compraEstoque,
    ]
      .map(campoCSV)
      .join(";")
  );

  return [
    CABECALHO.join(";"),
    ...corpo,
    "",
    ["TOTAL", "", "", "", "", numeroCSV(entradas), numeroCSV(saidas), ""].join(";"),
    ["SALDO", "", "", "", "", numeroCSV(entradas - saidas), "", ""].join(";"),
  ].join("\r\n");
}

/** Nome do arquivo, com o período dentro — o contador guarda dez destes */
export const nomeDoArquivo = (de: string, ate: string): string =>
  `livro-caixa-${de}-a-${ate}.csv`;

/**
 * Primeiro e último dia de um mês (AAAA-MM).
 *
 * O último dia vem do próprio calendário, em UTC: chutar 30 perderia o dia
 * 31, e chutar 31 traria lançamentos de fevereiro para janeiro.
 */
export function limitesDoMes(mes: string): { de: string; ate: string } {
  const [ano, m] = mes.split("-").map(Number);
  if (!ano || !m) return { de: "", ate: "" };
  const ultimo = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { de: `${ano}-${mm}-01`, ate: `${ano}-${mm}-${ultimo}` };
}
