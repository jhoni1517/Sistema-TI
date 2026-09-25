import { txt } from "./format";
import { arredondarPreco, type Arredondar, type TabelaServicos } from "./tabela-precos";
import type { Produto } from "./types";

/**
 * Margem caindo sem ninguém ver.
 *
 * O fornecedor sobe a tela do A15 de R$ 180 para R$ 212, a nota entra, o
 * custo sobe — e o preço da troca de tela continua R$ 400 na Tabela de
 * serviços. A loja descobre no fim do mês, depois de fazer vinte trocas
 * ganhando menos do que achava.
 *
 * Aqui a peça é ligada aos serviços que a usam (Tabela de serviços), e a
 * subida de custo mostra de uma vez tudo o que ficou apertado, com o preço
 * que devolve a margem-alvo da loja.
 *
 * Margem = (preço − custo) / preço. É sobre o preço de venda, que é como o
 * balcão pensa ("de cada 100 que entra, 40 fica").
 */

export const MARGEM_ALVO_PADRAO = 40;

const um = (v: number) => Math.round(v * 10) / 10 + 0;
const cents = (v: number) => Math.round(v * 100) / 100 + 0;

export const margemPct = (preco: number, custo: number): number | null =>
  preco > 0 ? um(((preco - custo) / preco) * 100) : null;

/** O preço que devolve a margem-alvo, arredondado para cima. */
export function precoParaMargem(custo: number, alvoPct: number, arred: Arredondar = "final90"): number {
  const alvo = Math.min(95, Math.max(0, alvoPct));
  return arredondarPreco(cents(custo / (1 - alvo / 100)), arred);
}

export interface ItemMargem {
  tipo: "produto" | "servico";
  /** A peça (produto do estoque) cujo custo mudou */
  produtoId: string;
  nome: string;
  preco: number;
  custoAntes: number;
  custoDepois: number;
  margemAntes: number | null;
  margemDepois: number | null;
  /** Abaixo da margem-alvo depois do custo novo */
  emRisco: boolean;
  /** Preço que devolve a margem-alvo */
  sugerido: number;
  modeloId?: string;
  servicoId?: string;
}

export interface MudancaCusto {
  produtoId: string;
  custoAntes: number;
  custoDepois: number;
}

/** Os serviços da tabela que usam esta peça, com o preço de cada um. */
export function servicosDaPeca(tabela: TabelaServicos | undefined, produtoId: string) {
  const saida: { modeloId: string; servicoId: string; nome: string; preco: number }[] = [];
  if (!tabela) return saida;
  const nomeServico = new Map(tabela.servicos.map((s) => [s.id, s.nome]));
  for (const m of tabela.modelos) {
    for (const [servicoId, pid] of Object.entries(m.pecas || {})) {
      if (pid !== produtoId) continue;
      const preco = m.precos[servicoId];
      if (!(preco > 0)) continue;
      saida.push({
        modeloId: m.id,
        servicoId,
        nome: `${nomeServico.get(servicoId) || "Serviço"} · ${[m.marca, m.modelo].filter(Boolean).join(" ")}`,
        preco,
      });
    }
  }
  return saida;
}

/**
 * O que muda com custos novos: o próprio produto (preço de venda de
 * balcão) e cada serviço da tabela que usa a peça. Só custo que SUBIU.
 */
export function impactoDoCusto(
  mudancas: MudancaCusto[],
  produtos: Produto[],
  tabela: TabelaServicos | undefined,
  alvoPct = MARGEM_ALVO_PADRAO
): ItemMargem[] {
  const saida: ItemMargem[] = [];
  for (const mu of mudancas) {
    if (!(mu.custoDepois > mu.custoAntes)) continue;
    const p = produtos.find((x) => x.id === mu.produtoId);
    if (!p) continue;
    const linha = (tipo: ItemMargem["tipo"], nome: string, preco: number, extra: Partial<ItemMargem> = {}): ItemMargem => {
      const depois = margemPct(preco, mu.custoDepois);
      return {
        tipo,
        produtoId: p.id,
        nome,
        preco,
        custoAntes: cents(mu.custoAntes),
        custoDepois: cents(mu.custoDepois),
        margemAntes: margemPct(preco, mu.custoAntes),
        margemDepois: depois,
        emRisco: depois === null || depois < alvoPct,
        sugerido: precoParaMargem(mu.custoDepois, alvoPct),
        ...extra,
      };
    };
    // preco-cru-proposital: margem é sobre o preço de TABELA, não o da promoção do dia
    const precoProduto = Number(p.preco) || 0;
    if (!p.servico && precoProduto > 0) saida.push(linha("produto", txt(p.nome), precoProduto));
    for (const s of servicosDaPeca(tabela, p.id)) {
      saida.push(linha("servico", s.nome, s.preco, { modeloId: s.modeloId, servicoId: s.servicoId }));
    }
  }
  return saida.sort((a, b) => (a.margemDepois ?? -999) - (b.margemDepois ?? -999));
}

/** "O custo da tela do A15 subiu 18%. Sua margem caiu de 55% para 41%." */
export function textoDoAlerta(i: ItemMargem, nomePeca?: string): string {
  const subiu = i.custoAntes > 0 ? Math.round(((i.custoDepois - i.custoAntes) / i.custoAntes) * 100) : null;
  const peca = nomePeca || i.nome;
  const custo = subiu !== null ? `O custo de ${peca} subiu ${subiu}%.` : `O custo de ${peca} subiu.`;
  const pct = (v: number | null) => (v === null ? "—" : `${String(v).replace(".", ",")}%`);
  return i.margemDepois !== null && i.margemDepois < 0
    ? `${custo} ${i.tipo === "servico" ? i.nome : "O preço de venda"} ficou no prejuízo.`
    : `${custo} ${i.tipo === "servico" ? `Em "${i.nome}", sua` : "Sua"} margem caiu de ${pct(i.margemAntes)} para ${pct(i.margemDepois)}.`;
}

/**
 * Painel "Margens em risco": o que HOJE está abaixo da margem-alvo, com o
 * custo atual. Produto sem custo cadastrado fica de fora — margem de 100%
 * não é margem, é cadastro incompleto.
 */
export function margensEmRisco(produtos: Produto[], tabela: TabelaServicos | undefined, alvoPct = MARGEM_ALVO_PADRAO): ItemMargem[] {
  const saida: ItemMargem[] = [];
  for (const p of produtos) {
    const custo = Number(p.custo) || 0;
    if (!(custo > 0)) continue;
    const base = { produtoId: p.id, custoAntes: cents(custo), custoDepois: cents(custo), sugerido: precoParaMargem(custo, alvoPct) };
    // preco-cru-proposital: margem é sobre o preço de TABELA, não o da promoção do dia
    const preco = Number(p.preco) || 0;
    if (!p.servico && preco > 0) {
      const m = margemPct(preco, custo);
      if (m !== null && m < alvoPct) saida.push({ ...base, tipo: "produto", nome: txt(p.nome), preco, margemAntes: m, margemDepois: m, emRisco: true });
    }
    for (const s of servicosDaPeca(tabela, p.id)) {
      const m = margemPct(s.preco, custo);
      if (m !== null && m < alvoPct) {
        saida.push({ ...base, tipo: "servico", nome: s.nome, preco: s.preco, margemAntes: m, margemDepois: m, emRisco: true, modeloId: s.modeloId, servicoId: s.servicoId });
      }
    }
  }
  return saida.sort((a, b) => (a.margemDepois ?? 0) - (b.margemDepois ?? 0));
}
