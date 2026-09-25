import { txt } from "./format";
import { somarDiasISO } from "./orcamento-online";
import { diasAteVencer } from "./contas";
import type { MovimentoCaixa, OrdemServico, PecaOS, RMA, StatusRMA } from "./types";

/**
 * Troca de peça com o fornecedor (RMA).
 *
 * A tela que voltou com defeito em 20 dias é trocada de graça para o
 * cliente — e a loja paga duas vezes se não devolver a ruim para o
 * fornecedor. Sem controle, a peça fica numa caixa embaixo do balcão até a
 * garantia do fornecedor vencer, e o dinheiro some sem ninguém ver.
 *
 * O número que importa é o dinheiro parado: peça com defeito que ainda não
 * foi mandada, ou foi e não voltou.
 */

export const STATUS_RMA: Record<StatusRMA, { nome: string; aberto: boolean }> = {
  enviar: { nome: "Enviar", aberto: true },
  enviado: { nome: "Enviado", aberto: true },
  trocado: { nome: "Trocado", aberto: false },
  credito: { nome: "Crédito", aberto: false },
  negado: { nome: "Negado", aberto: false },
};

export const GARANTIA_FORNECEDOR_PADRAO = 90;

const cents = (v: number) => Math.round(v * 100) / 100 + 0;

/** Até quando o fornecedor aceita a peça. Sem data de compra, não dá para saber. */
export const venceEm = (r: Pick<RMA, "dataCompra" | "garantiaFornecedorDias">): string | null =>
  r.dataCompra && /^\d{4}-\d{2}-\d{2}$/.test(r.dataCompra) ? somarDiasISO(r.dataCompra, Math.max(0, r.garantiaFornecedorDias || 0)) : null;

/** Dinheiro parado: tudo que ainda está em aberto (a enviar ou enviado). */
export const dinheiroParado = (rmas: RMA[]): number =>
  cents(rmas.filter((r) => STATUS_RMA[r.status]?.aberto).reduce((s, r) => s + (Number(r.valor) || 0) * (Number(r.quantidade) || 1), 0));

export interface AlertaRMA {
  rma: RMA;
  dias: number;
  texto: string;
}

/**
 * Peça AINDA NÃO ENVIADA cuja garantia do fornecedor vence em até
 * `antecedencia` dias (ou já venceu). Depois de enviada, o prazo que vale
 * é o do fornecedor responder — não é mais a loja que está atrasando.
 */
export function alertasDeGarantia(rmas: RMA[], hoje: string, antecedencia = 10): AlertaRMA[] {
  const saida: AlertaRMA[] = [];
  for (const r of rmas) {
    if (r.status !== "enviar") continue;
    const v = venceEm(r);
    if (!v) continue;
    const dias = diasAteVencer(v, hoje);
    if (dias > antecedencia) continue;
    saida.push({
      rma: r,
      dias,
      texto:
        dias < 0
          ? `${r.descricao}: a garantia do fornecedor venceu há ${-dias} dia(s)`
          : dias === 0
            ? `${r.descricao}: a garantia do fornecedor vence hoje`
            : `${r.descricao}: a garantia do fornecedor vence em ${dias} dia(s)`,
    });
  }
  return saida.sort((a, b) => a.dias - b.dias);
}

/**
 * De onde veio a peça: a última entrada de mercadoria com este produto
 * ANTES da OS. Depois da OS não serve — a peça já estava instalada.
 */
export function entradaDaPeca(
  produtoId: string | undefined,
  antesDe: string,
  movimentos: MovimentoCaixa[]
): { movimento: MovimentoCaixa; custoUnit: number } | null {
  if (!produtoId) return null;
  let melhor: { movimento: MovimentoCaixa; custoUnit: number } | null = null;
  for (const m of movimentos) {
    if (!m.compraEstoque || !Array.isArray(m.itensEntrada)) continue;
    if (txt(m.data) > antesDe) continue;
    const item = m.itensEntrada.find((i) => i.produtoId === produtoId);
    if (!item) continue;
    if (!melhor || txt(m.data) > txt(melhor.movimento.data)) melhor = { movimento: m, custoUnit: Number(item.custoUnit) || 0 };
  }
  return melhor;
}

/** O RMA já preenchido a partir da peça da OS que voltou em garantia. */
export function rmaDaPeca(
  os: Pick<OrdemServico, "id" | "numero" | "criadoEm" | "defeitoRelatado">,
  peca: PecaOS,
  movimentos: MovimentoCaixa[],
  ids: { id: string; agora: string },
  garantiaPadrao = GARANTIA_FORNECEDOR_PADRAO,
  osOriginal?: Pick<OrdemServico, "criadoEm">
): RMA {
  // A peça foi comprada antes da OS ORIGINAL (a que instalou), não da de retorno.
  const referencia = txt(osOriginal?.criadoEm || os.criadoEm);
  const origem = entradaDaPeca(peca.produtoId, referencia, movimentos);
  return {
    id: ids.id,
    osId: os.id,
    osNumero: os.numero,
    produtoId: peca.produtoId,
    descricao: txt(peca.descricao).trim() || "Peça",
    quantidade: Math.max(1, Number(peca.quantidade) || 1),
    valor: cents(origem?.custoUnit ?? (Number(peca.custoUnit) || 0)),
    fornecedor: txt(origem?.movimento.fornecedor).trim(),
    dataCompra: origem ? txt(origem.movimento.data).slice(0, 10) : undefined,
    numeroNota: origem?.movimento.numeroNota,
    movimentoEntradaId: origem?.movimento.id,
    garantiaFornecedorDias: garantiaPadrao,
    defeito: txt(os.defeitoRelatado).trim(),
    fotos: [],
    status: "enviar",
    historico: [{ data: ids.agora, status: "enviar" }],
    criadoEm: ids.agora,
    atualizadoEm: ids.agora,
  };
}

/** Muda o status e anota no histórico. Crédito pede o valor. */
export function mudarStatusRMA(r: RMA, status: StatusRMA, agora: string, obs?: string, valorRecuperado?: number): RMA {
  if (status === "credito" && !(Number(valorRecuperado) > 0)) throw new Error("Informe o valor do crédito.");
  return {
    ...r,
    status,
    valorRecuperado: status === "credito" ? cents(Number(valorRecuperado)) : status === "trocado" ? cents(r.valor * r.quantidade) : r.valorRecuperado,
    historico: [...(r.historico || []), { data: agora, status, obs: txt(obs).trim() || undefined }],
    atualizadoEm: agora,
  };
}

export function problemaNoRMA(r: Pick<RMA, "descricao" | "fornecedor" | "valor" | "quantidade">): string {
  if (!txt(r.descricao).trim()) return "Escreva qual é a peça.";
  if (!txt(r.fornecedor).trim()) return "Escreva o fornecedor.";
  if (!(Number(r.quantidade) > 0)) return "Quantidade inválida.";
  if (!(Number(r.valor) >= 0)) return "Valor inválido.";
  return "";
}

/** Resumo do que o fornecedor resolveu: quanto voltou e quanto se perdeu (negado). */
export function resultadoRMA(rmas: RMA[]): { recuperado: number; perdido: number; parado: number } {
  let recuperado = 0;
  let perdido = 0;
  for (const r of rmas) {
    if (r.status === "trocado" || r.status === "credito") recuperado += Number(r.valorRecuperado) || 0;
    if (r.status === "negado") perdido += (Number(r.valor) || 0) * (Number(r.quantidade) || 1);
  }
  return { recuperado: cents(recuperado), perdido: cents(perdido), parado: dinheiroParado(rmas) };
}
