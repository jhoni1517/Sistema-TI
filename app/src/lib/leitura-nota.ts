import { txt, normalizar } from "./format";
import type { Produto } from "./types";

/**
 * A nota do fornecedor lida por foto, pela IA — e desconfiada aqui.
 *
 * A IA erra do jeito mais perigoso: com cara de certo. "1.234,56" vira
 * 1.23456, a quantidade vem como "2 un", o preço total da linha vem no
 * lugar do unitário, um item vem sem nome. Número errado no estoque vira
 * custo médio errado, e custo errado é margem errada no mês inteiro.
 *
 * Então: tudo que volta passa por aqui, com teste, e nada é gravado sem
 * a pessoa ver item por item na tela e confirmar.
 */

export interface ItemLido {
  descricao: string;
  /** Código de barras ou código do produto na nota. Vazio se não veio. */
  codigo: string;
  quantidade: number;
  custoUnitario: number;
}

export interface NotaLida {
  fornecedor: string;
  /** AAAA-MM-DD, ou vazio quando não deu para ler */
  data: string;
  itens: ItemLido[];
  /** O que foi corrigido ou descartado, para a tela avisar */
  avisos: string[];
}

/** Uma nota de verdade não passa disso; resposta maior é lixo repetido */
export const MAX_ITENS_LIDOS = 150;

/**
 * Número como ele vem escrito: 12, "12", "12,50", "1.234,56", "R$ 1.234,56",
 * "2 un". Devolve NaN quando não é número — quem chama decide o que fazer.
 */
export function numeroBR(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  let s = txt(v as string).replace(/[^\d,.-]/g, "");
  if (!s) return NaN;
  const temVirgula = s.includes(",");
  const temPonto = s.includes(".");
  if (temVirgula && temPonto) {
    // O último separador é o decimal: "1.234,56" (BR) ou "1,234.56" (US).
    s = s.lastIndexOf(",") > s.lastIndexOf(".")
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(/,/g, "");
  } else if (temVirgula) {
    s = s.replace(",", ".");
  } else if (temPonto && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    // "1.234" sozinho é milhar, não decimal: nota não tem custo de R$ 1,234.
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** "23/09/2026", "2026-09-23", "23/09/26" → "2026-09-23". Inválida → "". */
export function dataDaNota(v: unknown): string {
  const s = txt(v as string).trim();
  let a = "", m = "", d = "";
  let r = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (r) [, a, m, d] = r;
  else if ((r = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/))) {
    [, d, m, a] = r;
    if (a.length === 2) a = `20${a}`;
  } else return "";
  const iso = `${a}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const t = Date.parse(iso + "T00:00:00Z");
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== iso) return "";
  return iso;
}

/** Tira o ```json ... ``` que a IA às vezes põe em volta, e acha o objeto */
export function extrairJSON(bruto: unknown): unknown {
  if (bruto && typeof bruto === "object") return bruto;
  const s = txt(bruto as string).trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const i = s.indexOf("{");
  const f = s.lastIndexOf("}");
  if (i < 0 || f <= i) throw new Error("A IA não devolveu uma nota legível. Tenta outra foto, mais de perto e com luz.");
  try {
    return JSON.parse(s.slice(i, f + 1));
  } catch {
    throw new Error("A IA devolveu a nota pela metade. Tenta de novo.");
  }
}

const limpo = (v: unknown, max = 120): string =>
  txt(typeof v === "string" || typeof v === "number" ? String(v) : "")
    .replace(/[\u0000-\u001f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/**
 * A resposta da IA virando uma nota que dá para mostrar.
 *
 * Lança erro só quando não há NADA aproveitável (a tela diz para tentar
 * outra foto). Item com problema é descartado ou corrigido, e isso vira
 * aviso — descartar calado faria a pessoa achar que a nota tinha menos
 * itens.
 */
export function lerRespostaDaIA(bruto: unknown): NotaLida {
  const obj = extrairJSON(bruto) as Record<string, unknown>;
  const avisos: string[] = [];
  const brutos = Array.isArray(obj?.itens) ? obj.itens : [];
  if (brutos.length > MAX_ITENS_LIDOS) {
    avisos.push(`A leitura trouxe ${brutos.length} itens; ficaram os ${MAX_ITENS_LIDOS} primeiros.`);
  }

  const itens: ItemLido[] = [];
  brutos.slice(0, MAX_ITENS_LIDOS).forEach((b: unknown, n: number) => {
    const i = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
    const descricao = limpo(i.descricao);
    if (!descricao) {
      avisos.push(`A linha ${n + 1} veio sem descrição e ficou de fora.`);
      return;
    }
    let quantidade = numeroBR(i.quantidade);
    if (!(quantidade > 0)) {
      avisos.push(`"${descricao}": quantidade ilegível, ficou 1. Confira.`);
      quantidade = 1;
    }
    let custo = numeroBR(i.custoUnitario);
    if (!(custo >= 0)) {
      avisos.push(`"${descricao}": custo ilegível, ficou zero. Confira.`);
      custo = 0;
    }
    itens.push({
      descricao,
      codigo: limpo(i.codigo, 40).replace(/\s/g, ""),
      quantidade: Math.round(quantidade * 1000) / 1000,
      custoUnitario: Math.round(custo * 100) / 100,
    });
  });

  if (itens.length === 0) {
    throw new Error("Não consegui ler nenhum item nesta foto. Tenta outra, mais de perto e com luz.");
  }
  return { fornecedor: limpo(obj?.fornecedor), data: dataDaNota(obj?.data), itens, avisos };
}

/* ------------------------------------------------------------------ */
/* Casar com o estoque                                                 */
/* ------------------------------------------------------------------ */

/** Palavras que contam para comparar nomes: sem acento, sem as miúdas */
const palavras = (s: string): string[] =>
  normalizar(s)
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length > 2 || /^\d+$/.test(p));

/**
 * Quão parecidos são dois nomes, de 0 a 1 (coeficiente de Dice nas
 * palavras). "CABO USB-C 1M BRANCO" contra "Cabo USB C 1m" dá alto; "FONTE
 * 500W" contra "Fonte 200W" dá médio — e médio não casa, de propósito:
 * trocar a fonte de 500W pela de 200W no estoque é o erro que custa caro.
 */
export function parecenca(a: string, b: string): number {
  const x = palavras(a);
  const y = palavras(b);
  if (!x.length || !y.length) return 0;
  const resto = [...y];
  let comuns = 0;
  for (const p of x) {
    const i = resto.indexOf(p);
    if (i >= 0) {
      comuns++;
      resto.splice(i, 1);
    }
  }
  return (2 * comuns) / (x.length + y.length);
}

/** A partir de quanto a parecença vira sugestão de "é este produto" */
export const PARECENCA_MINIMA = 0.6;

export interface ItemCasado extends ItemLido {
  /** O produto do estoque; vazio = produto novo */
  produtoId: string;
  /** Por que casou, para a pessoa confiar (ou não) */
  motivo: "codigo" | "nome" | "novo";
}

/**
 * Cada item lido com o produto do estoque que parece ser ele.
 *
 * Código de barras ou SKU igual vale mais que qualquer nome: é o mesmo
 * produto, com certeza. Sem código, o nome mais parecido, se passar do
 * mínimo. O mesmo produto não é casado com duas linhas: a segunda vira
 * "novo" e a pessoa decide.
 *
 * É SUGESTÃO: a tela deixa trocar o produto de cada linha antes de lançar.
 */
export function casarItens(itens: ItemLido[], produtos: Produto[]): ItemCasado[] {
  const usaveis = produtos.filter((p) => !p.servico);
  const usados = new Set<string>();
  return itens.map((i) => {
    const cod = i.codigo.trim();
    const porCodigo = cod
      ? usaveis.find(
          (p) =>
            !usados.has(p.id) &&
            (txt(p.codigoBarras).trim() === cod || (txt(p.sku) && normalizar(p.sku) === normalizar(cod)))
        )
      : undefined;
    if (porCodigo) {
      usados.add(porCodigo.id);
      return { ...i, produtoId: porCodigo.id, motivo: "codigo" as const };
    }
    let melhor: Produto | undefined;
    let nota = 0;
    for (const p of usaveis) {
      if (usados.has(p.id)) continue;
      const s = parecenca(i.descricao, p.nome);
      if (s > nota) {
        nota = s;
        melhor = p;
      }
    }
    if (melhor && nota >= PARECENCA_MINIMA) {
      usados.add(melhor.id);
      return { ...i, produtoId: melhor.id, motivo: "nome" as const };
    }
    return { ...i, produtoId: "", motivo: "novo" as const };
  });
}

/**
 * A revisão confirmada virando itens da entrada — e os produtos novos que
 * ela precisa.
 *
 * O produto novo NÃO é gravado aqui: ele só nasce no "Lançar", junto da
 * entrada, depois do dinheiro (a mesma ordem de toda gravação do sistema).
 * Fechar a janela antes disso não deixa cadastro órfão no estoque.
 *
 * Produto novo nasce com preço de venda ZERO de propósito: a nota diz o
 * custo, não o preço. Inventar margem seria o sistema decidindo preço pela
 * loja — e a tela avisa para definir antes de vender.
 */
export function paraEntrada(
  casados: ItemCasado[],
  produtos: Produto[],
  novoId: () => string,
  agora: string
): { itens: { produtoId: string; descricao: string; quantidade: number; custoUnit: number }[]; novos: Produto[] } {
  const novos: Produto[] = [];
  const itens = casados
    .filter((c) => c.quantidade > 0)
    .map((c) => {
      const existente = c.produtoId ? produtos.find((p) => p.id === c.produtoId) : undefined;
      if (existente) {
        return { produtoId: existente.id, descricao: existente.nome, quantidade: c.quantidade, custoUnit: c.custoUnitario };
      }
      const novo: Produto = {
        id: novoId(),
        nome: c.descricao,
        quantidade: 0,
        estoqueMinimo: 0,
        custo: c.custoUnitario,
        preco: 0, // preco-cru-proposital: produto novo nasce sem preço; a loja define
        codigoBarras: /^\d{8,14}$/.test(c.codigo) ? c.codigo : undefined,
        criadoEm: agora,
      };
      novos.push(novo);
      return { produtoId: novo.id, descricao: novo.nome, quantidade: c.quantidade, custoUnit: c.custoUnitario };
    });
  return { itens, novos };
}
