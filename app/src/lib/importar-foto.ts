import { txt, normalizar, soDigitos } from "./format";
import { extrairJSON, numeroBR, parecenca } from "./leitura-nota";
import type { Cliente, Produto } from "./types";

/**
 * O caderno do balcão virando cadastro, pela IA.
 *
 * Loja de bairro chega com os clientes num caderno e o estoque numa folha
 * impressa. Digitar tudo é a parte em que ela desiste. A IA lê a foto, mas
 * erra com cara de certo — telefone com um dígito a menos, preço de custo
 * no lugar do de venda, o mesmo cliente em duas páginas. Tudo que volta
 * passa por aqui, com teste, e a tela mostra linha por linha para a pessoa
 * corrigir antes de gravar.
 *
 * Duplicado é MARCADO, não descartado: "Maria" no caderno pode ser outra
 * Maria. A linha vem desmarcada e a pessoa decide.
 */

export type OQue = "clientes" | "produtos";

/** Até 5 fotos por vez: cada uma é uma chamada paga à IA */
export const MAX_FOTOS = 5;
/** Página de caderno não passa disso; resposta maior é lixo repetido */
export const MAX_LINHAS_POR_FOTO = 80;

export interface LinhaCliente {
  nome: string;
  telefone: string;
  /** Já existe na loja ou apareceu antes nesta importação */
  duplicado: string;
  importar: boolean;
}

export interface LinhaProduto {
  nome: string;
  quantidade: number;
  custo: number;
  preco: number;
  duplicado: string;
  importar: boolean;
}

export interface Lido<T> {
  linhas: T[];
  avisos: string[];
}

const limpo = (v: unknown, max = 120): string =>
  txt(typeof v === "string" || typeof v === "number" ? String(v) : "")
    .replace(/[\u0000-\u001f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

function objetoDaIA(bruto: unknown): Record<string, unknown> {
  try {
    const o = extrairJSON(bruto);
    return o && typeof o === "object" ? (o as Record<string, unknown>) : {};
  } catch {
    throw new Error("Não consegui ler esta foto. Tenta outra, mais de perto, reta e com luz.");
  }
}

function listaDaIA(bruto: unknown, chave: OQue, avisos: string[]): Record<string, unknown>[] {
  const obj = objetoDaIA(bruto);
  const lista = Array.isArray(obj[chave]) ? (obj[chave] as unknown[]) : [];
  if (lista.length > MAX_LINHAS_POR_FOTO) {
    avisos.push(`A foto trouxe ${lista.length} linhas; ficaram as ${MAX_LINHAS_POR_FOTO} primeiras.`);
  }
  return lista
    .slice(0, MAX_LINHAS_POR_FOTO)
    .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {}));
}

/**
 * Telefone brasileiro: 10 ou 11 dígitos com DDD. Com 55 na frente, tira.
 * Sem DDD (8 ou 9 dígitos) fica como veio e vira aviso — inventar o DDD
 * mandaria a cobrança para o número de outra pessoa.
 */
export function telefoneLido(v: unknown): { telefone: string; problema: string } {
  let d = soDigitos(limpo(v, 40));
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (!d) return { telefone: "", problema: "" };
  if (d.length === 10 || d.length === 11) return { telefone: d, problema: "" };
  if (d.length === 8 || d.length === 9) return { telefone: d, problema: "sem DDD" };
  return { telefone: d, problema: "número incompleto" };
}

/** Clientes da foto, conferidos e marcados contra os que a loja já tem */
export function lerClientesDaIA(bruto: unknown, existentes: Pick<Cliente, "nome" | "telefone">[], jaLidos: LinhaCliente[] = []): Lido<LinhaCliente> {
  const avisos: string[] = [];
  const linhas: LinhaCliente[] = [];
  const todos = [...jaLidos];
  listaDaIA(bruto, "clientes", avisos).forEach((c, n) => {
    const nome = limpo(c.nome);
    if (!nome) return avisos.push(`A linha ${n + 1} veio sem nome e ficou de fora.`);
    const { telefone, problema } = telefoneLido(c.telefone);
    if (problema) avisos.push(`${nome}: telefone ${problema}. Confira.`);
    const duplicado = clienteRepetido({ nome, telefone }, existentes, todos);
    const linha = { nome, telefone, duplicado, importar: !duplicado };
    linhas.push(linha);
    todos.push(linha);
  });
  if (linhas.length === 0) throw new Error("Não achei nenhum cliente nesta foto. Tenta outra, mais de perto.");
  return { linhas, avisos };
}

/**
 * Já existe? Telefone igual é a mesma pessoa, com certeza. Sem telefone
 * igual, nome muito parecido (0,85 — mais alto que o da nota, porque
 * "Maria Silva" e "Maria Souza" são duas clientes).
 */
export function clienteRepetido(
  c: { nome: string; telefone: string },
  existentes: Pick<Cliente, "nome" | "telefone">[],
  lidos: Pick<LinhaCliente, "nome" | "telefone">[] = []
): string {
  const tel = soDigitos(c.telefone);
  const ultimos = (t: string) => soDigitos(t).slice(-8);
  for (const [lista, onde] of [[existentes, "Já cadastrado"], [lidos, "Repetido nas fotos"]] as const) {
    for (const e of lista) {
      if (tel.length >= 8 && ultimos(e.telefone) === tel.slice(-8)) return `${onde}: ${e.nome} (mesmo telefone)`;
      if (normalizar(e.nome) === normalizar(c.nome) || parecenca(c.nome, e.nome) >= 0.85) {
        return `${onde}: ${e.nome}`;
      }
    }
  }
  return "";
}

/** Produtos da foto, conferidos e marcados contra o estoque */
export function lerProdutosDaIA(bruto: unknown, existentes: Pick<Produto, "nome">[], jaLidos: LinhaProduto[] = []): Lido<LinhaProduto> {
  const avisos: string[] = [];
  const linhas: LinhaProduto[] = [];
  const todos = [...jaLidos];
  listaDaIA(bruto, "produtos", avisos).forEach((p, n) => {
    const nome = limpo(p.nome);
    if (!nome) return avisos.push(`A linha ${n + 1} veio sem nome e ficou de fora.`);
    const num = (v: unknown, campo: string, padrao: number) => {
      if (v === undefined || v === null || v === "") return padrao;
      const x = numeroBR(v);
      if (Number.isFinite(x) && x >= 0) return x;
      avisos.push(`${nome}: ${campo} ilegível, ficou ${padrao}. Confira.`);
      return padrao;
    };
    const quantidade = num(p.quantidade, "quantidade", 0);
    const custo = Math.round(num(p.custo, "custo", 0) * 100) / 100;
    const preco = Math.round(num(p.preco, "preço", 0) * 100) / 100;
    if (preco === 0) avisos.push(`${nome}: sem preço de venda. Preencha antes de importar.`);
    // Custo maior que o preço quase sempre é coluna trocada na leitura.
    if (preco > 0 && custo > preco) avisos.push(`${nome}: custo maior que o preço. A IA pode ter trocado as colunas.`);
    const duplicado = produtoRepetido(nome, existentes, todos);
    const linha = { nome, quantidade, custo, preco, duplicado, importar: !duplicado && preco > 0 };
    linhas.push(linha);
    todos.push(linha);
  });
  if (linhas.length === 0) throw new Error("Não achei nenhum produto nesta foto. Tenta outra, mais de perto.");
  return { linhas, avisos };
}

/** Mesma régua da nota (0,6), porque aqui o erro é o mesmo: produto em dobro */
export function produtoRepetido(
  nome: string,
  existentes: Pick<Produto, "nome">[],
  lidos: Pick<LinhaProduto, "nome">[] = []
): string {
  for (const [lista, onde] of [[existentes, "Já no estoque"], [lidos, "Repetido nas fotos"]] as const) {
    let melhor = { nome: "", p: 0 };
    for (const e of lista) {
      const p = normalizar(e.nome) === normalizar(nome) ? 1 : parecenca(nome, e.nome);
      if (p > melhor.p) melhor = { nome: e.nome, p };
    }
    if (melhor.p >= 0.6) return `${onde}: ${melhor.nome}`;
  }
  return "";
}

/** O que vai para o banco, na hora de confirmar */
export function clienteDaLinha(l: LinhaCliente, id: string, criadoEm: string): Cliente {
  return { id, nome: l.nome, telefone: soDigitos(l.telefone), observacoes: "Importado do caderno por foto.", criadoEm };
}

export function produtoDaLinha(l: LinhaProduto, id: string, criadoEm: string): Produto {
  return {
    id,
    nome: l.nome,
    quantidade: l.quantidade,
    custo: l.custo,
    preco: l.preco,
    estoqueMinimo: 0,
    criadoEm,
  };
}
