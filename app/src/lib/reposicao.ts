import { soData, hojeISO } from "./contas";
import { centavos } from "./pdv";
import { txt } from "./format";
import type { Produto, Venda } from "./types";

/**
 * O que repor, quanto, e o que já era para ter reposto.
 *
 * O estoque mínimo é um número que alguém chutou no cadastro e nunca mais
 * olhou. Ele não sabe que o arroz saiu 40 vezes este mês e a caixa de som
 * saiu uma — então avisa os dois do mesmo jeito, e o dono aprende a ignorar
 * o aviso.
 *
 * Aqui a conta olha o consumo real: quanto sai por dia, quantos dias faltam
 * para acabar, e quanto comprar para durar até a próxima ida ao fornecedor.
 */

const n = (v?: number | null): number => Number(v) || 0;

export interface Reposicao {
  produtoId: string;
  nome: string;
  emEstoque: number;
  /** Média de saída por dia no período observado */
  porDia: number;
  /** Em quantos dias acaba. Infinity quando não sai nada. */
  diasAteAcabar: number;
  /** Quanto comprar para cobrir a cobertura desejada */
  sugerido: number;
  /** Quanto isso custa, ao último custo conhecido */
  custo: number;
  /** Já acabou */
  zerado: boolean;
  /** Vai acabar antes da próxima compra */
  urgente: boolean;
}

/**
 * Sugestão de compra a partir do consumo.
 *
 * `diasObservados` é a janela de histórico; `coberturaDias` é para quantos
 * dias a compra precisa durar — normalmente o intervalo entre duas idas ao
 * fornecedor.
 *
 * Serviço fica de fora: não tem prateleira para repor.
 */
export function sugestaoDeCompra(
  produtos: Produto[],
  vendas: Venda[],
  {
    diasObservados = 30,
    coberturaDias = 15,
    hoje = hojeISO(),
  }: { diasObservados?: number; coberturaDias?: number; hoje?: string } = {}
): Reposicao[] {
  const inicio = new Date(Date.parse(soData(hoje) + "T00:00:00Z") - diasObservados * 86400000)
    .toISOString()
    .slice(0, 10);

  const saiu = new Map<string, number>();
  for (const v of vendas) {
    const dia = soData(v.criadoEm);
    if (dia < inicio || dia > soData(hoje)) continue;
    for (const i of v.itens || []) {
      if (!i.produtoId) continue;
      saiu.set(i.produtoId, (saiu.get(i.produtoId) || 0) + n(i.quantidade));
    }
  }

  const out: Reposicao[] = [];
  for (const p of produtos) {
    if (p.servico) continue;
    const total = saiu.get(p.id) || 0;
    const porDia = centavos(total / Math.max(1, diasObservados));
    const emEstoque = n(p.quantidade);
    const diasAteAcabar = porDia > 0 ? emEstoque / porDia : Infinity;

    // Quanto falta para cobrir a cobertura desejada.
    const alvo = porDia * coberturaDias;
    const faltando = alvo - emEstoque;

    /*
     * Nunca sugere comprar o que não sai NA JANELA OBSERVADA.
     *
     * Girar zero e mesmo assim pedir reposição é exatamente como o estoque
     * encalha — e é o que o estoque mínimo do cadastro faz, porque ele não
     * sabe que o arroz saiu 40 vezes e a caixa de som saiu uma.
     *
     * Isso vale inclusive para o item ZERADO: prateleira vazia de coisa que
     * ninguém pede não é falta, é acerto. Ele aparece em "produtos parados"
     * (lib/giro.ts), que é onde essa conversa pertence.
     *
     * Havia aqui um ramo tentando tratar "zerado que já vendeu" como exceção.
     * Ele era inalcançável: se vendeu na janela, porDia nunca é zero. O teste
     * do caso é que revelou o código morto.
     */
    if (porDia <= 0) continue;
    if (faltando <= 0) continue;

    // Produto por peso aceita fração; o resto arredonda para cima, porque
    // não existe comprar 2,3 unidades.
    const sugerido = p.porPeso ? centavos(faltando) : Math.ceil(faltando);

    out.push({
      produtoId: p.id,
      nome: txt(p.nome),
      emEstoque,
      porDia,
      diasAteAcabar: centavos(diasAteAcabar),
      sugerido,
      custo: centavos(sugerido * n(p.custo)),
      zerado: emEstoque <= 0,
      urgente: diasAteAcabar <= coberturaDias / 2,
    });
  }

  // Zerado primeiro, depois o que acaba antes: é a ordem em que a falta dói.
  return out.sort(
    (a, b) => Number(b.zerado) - Number(a.zerado) || a.diasAteAcabar - b.diasAteAcabar
  );
}

/** Quanto custa fazer a compra sugerida inteira */
export const custoDaReposicao = (lista: Reposicao[]): number =>
  centavos(lista.reduce((s, r) => s + r.custo, 0));

/**
 * Estoque mínimo sugerido a partir do consumo real.
 *
 * O mínimo cadastrado é um chute que ninguém revisita. Este número diz
 * quanto ele deveria ser para o produto não acabar antes da próxima compra.
 */
export function minimoSugerido(
  p: Produto,
  vendas: Venda[],
  { diasObservados = 30, coberturaDias = 7, hoje = hojeISO() } = {}
): number {
  const [r] = sugestaoDeCompra([{ ...p, quantidade: 0 }], vendas, {
    diasObservados,
    coberturaDias,
    hoje,
  });
  return r ? r.sugerido : 0;
}

/**
 * Mensagem de pedido para o fornecedor, pronta para o WhatsApp.
 *
 * Sem emoji: em alguns aparelhos elas chegam como "?" e sujam o pedido — e
 * pedido sujo vira mercadoria errada na entrega.
 */
export function mensagemDePedido(lista: Reposicao[], nomeLoja: string): string {
  if (lista.length === 0) return "";
  const linhas = lista.map((r) => `- ${r.nome}: ${r.sugerido}`);
  const loja = txt(nomeLoja).trim();
  return (
    `${loja ? `${loja} - pedido` : "Pedido"}\n\n` +
    `${linhas.join("\n")}\n\n` +
    "Confirma disponibilidade e prazo, por favor."
  );
}
