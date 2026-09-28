import type { ItemVenda, LoteProduto, Produto } from "./types";

/**
 * Lote com validade, e o que sai primeiro é o que vence antes (FIFO).
 *
 * O saldo do produto continua sendo UM número (`quantidade`), mexido só
 * pelo banco, de forma atômica (lib/estoque.ts). Os lotes não são outro
 * saldo: são a lista do que ENTROU, com a validade de cada entrada.
 *
 * O que sobra de cada lote é CALCULADO: se a loja vende primeiro o que vence
 * antes, o que está na prateleira é sempre o que vence por último. Com 30 em
 * estoque e lotes de 24 (vence dia 10) e 24 (vence dia 20), sobram 24 do dia
 * 20 e 6 do dia 10.
 *
 * Guardar quanto sobrou em cada lote seria um segundo saldo, gravado pela
 * tela: dois caixas vendendo juntos leem o mesmo lote e um apaga a baixa do
 * outro — o mesmo bug que o estoque atômico existe para evitar. Calculado,
 * não tem o que desencontrar.
 *
 * O estoque que existia antes dos lotes (ou que entrou sem lote) é o mais
 * velho, e sai primeiro. A validade dele é a do campo antigo `validade`.
 */

/** O que a conta precisa do produto. Quantidade ausente conta zero. */
export type ComLotes = { quantidade?: number; lotes?: LoteProduto[]; validade?: string };

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const dia = (s?: string | null) => (s || "").slice(0, 10);
const arred = (x: number) => Math.round(x * 1000) / 1000;

export interface LoteRestante {
  /** "" = sem validade conhecida */
  validade: string;
  quantidade: number;
  /** true = estoque de antes dos lotes, ou que entrou sem lote */
  semLote?: boolean;
}

/**
 * O que sobra de cada lote, do que vence antes para o que vence depois (a
 * ordem em que vai sair). Lote que já acabou não aparece.
 */
export function lotesRestantes(p: ComLotes): LoteRestante[] {
  let resta = Math.max(0, Number(p.quantidade) || 0);
  const lotes = [...(p.lotes || [])]
    .filter((l) => Number(l.quantidade) > 0)
    // Vence depois = fica na prateleira. Sem validade conta como o mais
    // novo: não tem como dizer que venceu.
    .sort((a, b) => (dia(b.validade) || "9999").localeCompare(dia(a.validade) || "9999"));
  const r: LoteRestante[] = [];
  for (const l of lotes) {
    if (resta <= 0) break;
    const q = Math.min(resta, Number(l.quantidade));
    r.push({ validade: DATA.test(dia(l.validade)) ? dia(l.validade) : "", quantidade: arred(q) });
    resta = arred(resta - q);
  }
  if (resta > 0) r.push({ validade: DATA.test(dia(p.validade)) ? dia(p.validade) : "", quantidade: resta, semLote: true });
  // Ordem de saída: sem lote primeiro (é o mais velho), depois por validade.
  return r.sort((a, b) =>
    a.semLote !== b.semLote ? (a.semLote ? -1 : 1) : (a.validade || "9999").localeCompare(b.validade || "9999")
  );
}

/**
 * A validade que vale para o alerta: a do lote que sai primeiro. Sem lote
 * nenhum, é o campo antigo — as lojas que nunca usaram lote não mudam nada.
 */
export function validadeEfetiva(p: ComLotes): string {
  if (!p.lotes || p.lotes.length === 0) return dia(p.validade);
  const datas = lotesRestantes(p)
    .map((l) => l.validade)
    .filter(Boolean)
    .sort();
  return datas[0] || "";
}

/**
 * Quantas das próximas `quantidade` unidades a sair estão vencidas.
 *
 * É o que o PDV pergunta na hora de vender: se o sistema acha que a próxima
 * garrafa é de um lote vencido, ou ela está na prateleira, ou foi jogada
 * fora sem ajuste. As duas coisas precisam de alguém olhando.
 */
export function vencidasNaSaida(p: ComLotes, quantidade: number, hoje: string): number {
  let falta = Math.max(0, quantidade);
  let vencidas = 0;
  for (const l of lotesRestantes(p)) {
    if (falta <= 0) break;
    const q = Math.min(falta, l.quantidade);
    if (l.validade && l.validade < hoje) vencidas += q;
    falta -= q;
  }
  return arred(vencidas);
}

/**
 * O lote que chega. Recebe o produto ANTES de somar a quantidade da
 * entrada, e já descarta os lotes que acabaram: sem isso a lista cresce a
 * cada nota, para sempre, e é lida inteira em toda carga.
 */
export function comLoteNovo(p: Produto, validade: string, quantidade: number, entradaEm: string): LoteProduto[] {
  const vivos: LoteProduto[] = lotesRestantes(p)
    .filter((l) => !l.semLote)
    .map((l) => ({ validade: l.validade, quantidade: l.quantidade, entradaEm: entradaEm }));
  // Preserva a data de entrada original de quem continua vivo.
  for (const v of vivos) {
    const original = (p.lotes || []).find((l) => dia(l.validade) === v.validade);
    if (original?.entradaEm) v.entradaEm = original.entradaEm;
  }
  // Mesma validade soma no mesmo lote: duas notas do mesmo lote de fábrica
  // não viram duas linhas iguais.
  const igual = vivos.find((l) => l.validade === dia(validade));
  if (igual) igual.quantidade = arred(igual.quantidade + quantidade);
  else vivos.push({ validade: dia(validade), quantidade: arred(quantidade), entradaEm });
  return vivos;
}

/** Por que o lote não entra, ou "". */
export function problemaNoLote(validade: string, quantidade: number): string {
  if (!DATA.test(dia(validade))) return "Escolha a validade do lote.";
  if (!(quantidade > 0)) return "Quantas unidades chegaram neste lote?";
  return "";
}

/**
 * O aviso do PDV: quais produtos do carrinho sairiam de lote vencido, somando
 * as linhas do mesmo produto. "" = nenhum.
 */
export function vencidasDaVenda(itens: ItemVenda[], produtos: Produto[], hoje: string): string {
  const porProduto = new Map<string, number>();
  for (const it of itens) {
    if (!it.produtoId) continue;
    porProduto.set(it.produtoId, (porProduto.get(it.produtoId) || 0) + (Number(it.quantidade) || 0));
  }
  const linhas: string[] = [];
  for (const [id, q] of porProduto) {
    const p = produtos.find((x) => x.id === id);
    if (!p || p.servico) continue;
    const v = vencidasNaSaida(p, q, hoje);
    if (v > 0) linhas.push(`${p.nome}: ${v} de ${q} pelo lote vencido`);
  }
  return linhas.length ? "Pela conta do estoque, sai produto vencido:\n" + linhas.join("\n") : "";
}
