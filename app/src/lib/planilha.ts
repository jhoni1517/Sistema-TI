import { normalizar, txt } from "./format";
import type { Produto } from "./types";

/**
 * Importar a planilha que a loja já tem.
 *
 * Loja que chega trazendo 300 produtos numa planilha não vai digitar um por
 * um — ela desiste no décimo e volta para o caderno. Aqui mora a parte que
 * dá para errar: separar colunas, ler "R$ 1.234,56", adivinhar qual coluna
 * é o quê e dizer QUAL linha ficou de fora e por quê.
 *
 * O XLSX vira linhas na tela (biblioteca carregada só quando precisa); daqui
 * para frente CSV e XLSX são a mesma coisa: uma lista de linhas de texto.
 */

export type Linha = string[];

/**
 * CSV -> linhas. Aceita ponto e vírgula (o Excel brasileiro salva assim),
 * vírgula e tabulação, aspas com separador dentro e aspas dobradas.
 */
export function lerCSV(texto: string): Linha[] {
  const limpo = txt(texto).replace(/^﻿/, "");
  const primeira = limpo.split(/\r?\n/, 1)[0] || "";
  const conta = (c: string) => primeira.split(c).length - 1;
  const sep = [";", "\t", ","].reduce((a, b) => (conta(b) > conta(a) ? b : a), ";");

  const linhas: Linha[] = [];
  let linha: string[] = [];
  let campo = "";
  let aspas = false;
  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i];
    if (aspas) {
      if (c === '"' && limpo[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && limpo[i + 1] === "\n") i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else campo += c;
  }
  if (campo !== "" || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }
  // Linha só de separadores é o rodapé que o Excel deixa: não é produto.
  return linhas.map((l) => l.map((x) => x.trim())).filter((l) => l.some((x) => x !== ""));
}

/**
 * "R$ 1.234,56" -> 1234.56. Undefined quando não é número.
 *
 * Planilha brasileira mistura tudo: "12,50", "12.50", "1.234,56" e até
 * "1,234.56" de quem baixou de site gringo. Quando aparecem os dois
 * separadores, o ÚLTIMO é o decimal. Ponto sozinho em grupos de três
 * ("1.500") é milhar — ninguém cobra R$ 1,50 escrevendo "1.500".
 */
export function numeroDaPlanilha(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  let s = txt(v as string).replace(/R\$|\s/gi, "");
  if (!s) return undefined;
  const ponto = s.lastIndexOf(".");
  const virgula = s.lastIndexOf(",");
  if (ponto >= 0 && virgula >= 0) {
    s = ponto > virgula ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(",", ".");
  } else if (virgula >= 0) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export type CampoProduto = "nome" | "preco" | "custo" | "quantidade" | "codigoBarras" | "categoria";

export const CAMPOS_PRODUTO: { campo: CampoProduto; rotulo: string; obrigatorio?: boolean }[] = [
  { campo: "nome", rotulo: "Nome do produto", obrigatorio: true },
  { campo: "preco", rotulo: "Preço de venda", obrigatorio: true },
  { campo: "custo", rotulo: "Custo" },
  { campo: "quantidade", rotulo: "Quantidade" },
  { campo: "codigoBarras", rotulo: "Código de barras" },
  { campo: "categoria", rotulo: "Categoria" },
];

/** Qual coluna é o quê: índice, ou -1 para "não tem" */
export type Mapa = Record<CampoProduto, number>;

/** Palavras que cada cabeçalho costuma ter, sem acento e minúsculas */
const PISTAS: Record<CampoProduto, string[]> = {
  nome: ["nome", "produto", "descricao", "item", "mercadoria"],
  preco: ["preco venda", "venda", "preco", "valor", "pv"],
  custo: ["custo", "compra", "preco custo", "pc"],
  quantidade: ["quantidade", "qtd", "qtde", "estoque", "saldo", "quant"],
  codigoBarras: ["codigo de barras", "cod barras", "ean", "gtin", "barras", "codigo"],
  categoria: ["categoria", "grupo", "departamento", "secao", "tipo"],
};

/**
 * Adivinha as colunas pelo cabeçalho. É só a sugestão: a tela mostra e a
 * pessoa troca o que estiver errado antes de importar.
 *
 * Custo vem antes do preço na procura porque "preço de custo" tem "preço"
 * no nome — procurando preço primeiro, a coluna de custo virava o preço de
 * venda e a loja inteira ia para a prateleira pelo valor de compra.
 */
export function sugerirMapa(cabecalho: Linha): Mapa {
  const cab = cabecalho.map((c) => normalizar(c).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim());
  const usados = new Set<number>();
  const achar = (campo: CampoProduto): number => {
    for (const pista of PISTAS[campo]) {
      const i = cab.findIndex((c, idx) => !usados.has(idx) && (c === pista || (pista.length >= 4 && c.includes(pista))));
      if (i >= 0) {
        usados.add(i);
        return i;
      }
    }
    return -1;
  };
  const ordem: CampoProduto[] = ["custo", "codigoBarras", "quantidade", "categoria", "preco", "nome"];
  const mapa = {} as Mapa;
  for (const c of ordem) mapa[c] = achar(c);
  return mapa;
}

/** Parece cabeçalho? Sem nenhum número, e com alguma pista conhecida. */
export function temCabecalho(primeira: Linha): boolean {
  if (primeira.some((c) => numeroDaPlanilha(c) !== undefined)) return false;
  const m = sugerirMapa(primeira);
  return m.nome >= 0 || m.preco >= 0;
}

export interface ResultadoImportacao {
  produtos: Produto[];
  /** "Linha 7: sem preço" — com o número que a pessoa vê na planilha */
  problemas: string[];
}

/**
 * Linhas -> produtos, conferidos. Linha com problema fica de fora e é
 * listada; as boas entram. Recusar a planilha inteira por uma linha ruim
 * faria a pessoa desistir.
 *
 * `primeiraLinha` é o número da primeira linha de DADOS na planilha (2
 * quando tem cabeçalho), para o recado apontar a linha certa.
 */
export function linhasParaProdutos(
  linhas: Linha[],
  mapa: Mapa,
  criadoEm: string,
  novoId: () => string,
  primeiraLinha = 2,
  jaCadastrados: string[] = []
): ResultadoImportacao {
  const produtos: Produto[] = [];
  const problemas: string[] = [];
  const vistos = new Set(jaCadastrados.map((n) => normalizar(n)));
  const col = (l: Linha, c: CampoProduto) => (mapa[c] >= 0 ? txt(l[mapa[c]]).trim() : "");

  if (mapa.nome < 0) return { produtos, problemas: ["Escolha qual coluna tem o nome do produto."] };
  if (mapa.preco < 0) return { produtos, problemas: ["Escolha qual coluna tem o preço de venda."] };

  linhas.forEach((l, i) => {
    const onde = `Linha ${primeiraLinha + i}`;
    const nome = col(l, "nome");
    if (!nome) return problemas.push(`${onde}: sem nome.`);
    const preco = numeroDaPlanilha(col(l, "preco"));
    if (preco === undefined || preco < 0) return problemas.push(`${onde} (${nome}): preço "${col(l, "preco")}" não é um número.`);
    const custoTxt = col(l, "custo");
    const custo = custoTxt ? numeroDaPlanilha(custoTxt) : 0;
    if (custo === undefined || custo < 0) return problemas.push(`${onde} (${nome}): custo "${custoTxt}" não é um número.`);
    const qtdTxt = col(l, "quantidade");
    const quantidade = qtdTxt ? numeroDaPlanilha(qtdTxt) : 0;
    if (quantidade === undefined) return problemas.push(`${onde} (${nome}): quantidade "${qtdTxt}" não é um número.`);
    // Mesmo nome duas vezes vira dois produtos que ninguém sabe qual vender.
    const chave = normalizar(nome);
    if (vistos.has(chave)) return problemas.push(`${onde} (${nome}): já existe um produto com esse nome.`);
    vistos.add(chave);

    produtos.push({
      id: novoId(),
      nome: nome.slice(0, 120),
      preco,
      custo,
      quantidade,
      estoqueMinimo: 0,
      codigoBarras: col(l, "codigoBarras").replace(/\D/g, "") || undefined,
      categoria: col(l, "categoria") || undefined,
      criadoEm,
    });
  });
  return { produtos, problemas };
}

/**
 * Arquivo escolhido pela pessoa → linhas. XLSX carrega a biblioteca só
 * aqui: quem nunca importa não baixa.
 */
export async function lerArquivoPlanilha(arquivo: File): Promise<Linha[]> {
  let lidas: Linha[];
  if (/\.xlsx$/i.test(arquivo.name)) {
    const { readSheet } = await import("read-excel-file/browser");
    const folha = await readSheet(arquivo);
    lidas = folha
      .map((l) => l.map((c) => (c === null || c === undefined ? "" : String(c)).trim()))
      .filter((l) => l.some((c) => c !== ""));
  } else if (/\.(csv|txt)$/i.test(arquivo.name)) {
    lidas = lerCSV(await arquivo.text());
  } else {
    throw new Error("Use uma planilha .xlsx ou .csv. No Excel: Arquivo, Salvar como, CSV.");
  }
  if (lidas.length === 0) throw new Error("A planilha está vazia.");
  return lidas;
}
