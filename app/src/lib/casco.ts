import type { ItemVenda, LancamentoCasco, Produto } from "./types";

/**
 * Casco retornável: o cliente leva 12 garrafas cheias e devolve 8 vazias;
 * ficam 4 com ele.
 *
 * É conta de saldo, não campo. Meia implementação produz saldo errado, e
 * saldo errado é pior que nenhum: a loja cobra do cliente que já devolveu e
 * perde o cliente junto com o casco. Por isso cada ida e cada volta é um
 * lançamento, o saldo é a soma, e lançamento não se apaga — correção é outro
 * lançamento, que aparece no histórico.
 */

/** Tipo do vasilhame, do jeito que se compara: sem espaço sobrando. */
export const tipoDoCasco = (t?: string | null): string => (t || "").trim().replace(/\s+/g, " "); // texto-cru-proposital: só limpa espaço

/** Quantos cascos de cada tipo saem nesta venda. Produto por peso não tem casco. */
export function cascosDaVenda(itens: ItemVenda[], produtos: Produto[]): Record<string, number> {
  const r: Record<string, number> = {};
  for (const it of itens) {
    const p = produtos.find((x) => x.id === it.produtoId);
    const tipo = tipoDoCasco(p?.casco);
    if (!tipo || p?.porPeso) continue;
    const q = Math.round(Number(it.quantidade) || 0);
    if (q > 0) r[tipo] = (r[tipo] || 0) + q;
  }
  return r;
}

/** Saldo por tipo de um cliente. Só aparece o que não zerou. */
export function saldoDoCliente(lancamentos: LancamentoCasco[], clienteId: string): Record<string, number> {
  const r: Record<string, number> = {};
  for (const l of lancamentos) {
    if (l.clienteId !== clienteId) continue;
    const tipo = tipoDoCasco(l.tipo);
    r[tipo] = (r[tipo] || 0) + (Number(l.quantidade) || 0);
  }
  for (const k of Object.keys(r)) if (r[k] === 0) delete r[k];
  return r;
}

/** Total de cascos pendentes de cada cliente (só quem deve alguma coisa). */
export function pendentesPorCliente(lancamentos: LancamentoCasco[]): Record<string, number> {
  const ids = [...new Set(lancamentos.map((l) => l.clienteId))];
  const r: Record<string, number> = {};
  for (const id of ids) {
    const total = Object.values(saldoDoCliente(lancamentos, id)).reduce((s, n) => s + Math.max(0, n), 0);
    if (total > 0) r[id] = total;
  }
  return r;
}

/**
 * Por que a venda com casco não fecha, ou "".
 *
 * Casco que ficou com o cliente só existe se tiver nome. Sem cliente, a
 * venda passaria e o casco sumiria do mapa — exatamente o saldo errado que
 * esta conta existe para evitar. Quem trouxe tudo não precisa de cadastro.
 */
export function problemaNoCasco(
  levou: Record<string, number>,
  trouxe: Record<string, number>,
  clienteId?: string,
  saldo: Record<string, number> = {}
): string {
  for (const [tipo, n] of Object.entries(levou)) {
    const t = trouxe[tipo] ?? n;
    if (!Number.isInteger(t) || t < 0) return `Quantos cascos de ${tipo} o cliente trouxe? Use um número inteiro.`;
    // Trouxe a mais só se devia de antes; senão a loja passaria a dever casco.
    const sobra = t - n;
    if (sobra > 0 && clienteId && sobra > (saldo[tipo] || 0)) {
      return `O cliente trouxe ${sobra} de ${tipo} a mais do que levou, e só devia ${saldo[tipo] || 0}. Confira a contagem.`;
    }
  }
  const fica = Object.entries(levou).reduce((s, [tipo, n]) => s + Math.max(0, n - (trouxe[tipo] ?? n)), 0);
  if (fica > 0 && !clienteId) {
    return `${fica} casco${fica === 1 ? "" : "s"} vão ficar com o cliente. Escolha o cliente para anotar, ou marque que ele trouxe todos.`;
  }
  return "";
}

/**
 * Os lançamentos de uma venda: um de ida por tipo, e um de volta para o
 * que o cliente trouxe. Os dois aparecem no histórico — "levou 12,
 * devolveu 8" diz mais que "ficou com 4" quando o cliente contesta.
 *
 * Sem cliente não anota nada: só chega aqui sem cliente quem trouxe tudo
 * (ver `problemaNoCasco`), e aí não há saldo a guardar.
 *
 * Cliente que trouxe MAIS do que levou está devolvendo casco de antes: a
 * volta leva o número inteiro e o saldo desce.
 */
export function lancamentosDaVenda(
  novoId: () => string,
  venda: { id: string; numero: number; clienteId?: string; criadoEm: string },
  levou: Record<string, number>,
  trouxe: Record<string, number>
): LancamentoCasco[] {
  if (!venda.clienteId) return [];
  const r: LancamentoCasco[] = [];
  for (const [tipo, n] of Object.entries(levou)) {
    const t = trouxe[tipo] ?? n;
    const base = { clienteId: venda.clienteId, tipo, vendaId: venda.id, vendaNumero: venda.numero, criadoEm: venda.criadoEm };
    r.push({ id: novoId(), ...base, quantidade: n });
    if (t > 0) r.push({ id: novoId(), ...base, quantidade: -t });
  }
  return r;
}

/** Devolução no balcão, sem venda. Devolver mais do que deve é recusado. */
export function problemaNaDevolucao(saldo: Record<string, number>, tipo: string, quantidade: number): string {
  if (!tipoDoCasco(tipo)) return "Escolha o tipo de casco.";
  if (!Number.isInteger(quantidade) || quantidade <= 0) return "Quantos cascos voltaram? Use um número inteiro.";
  const deve = saldo[tipoDoCasco(tipo)] || 0;
  if (quantidade > deve) {
    return deve > 0
      ? `O cliente deve ${deve} de ${tipo}. Para devolver mais, confira o histórico antes.`
      : `Este cliente não deve casco de ${tipo}.`;
  }
  return "";
}

/** Os tipos de casco cadastrados nos produtos, para a lista de escolha. */
export const tiposDeCasco = (produtos: Produto[]): string[] =>
  [...new Set(produtos.map((p) => tipoDoCasco(p.casco)).filter(Boolean))].sort();
