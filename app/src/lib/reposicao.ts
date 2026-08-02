import { soData, hojeISO } from "./contas";
import { centavos } from "./pdv";
import { txt } from "./format";
import { saidasDeEstoque } from "./consumo";
import type { OrdemServico, Produto, Venda } from "./types";

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
 *
 * `ordens` entra porque na assistência técnica a peça sai por OS, não por
 * venda. Sem elas tudo girava zero, e como esta conta pula justamente o que
 * gira zero, a sugestão de compra nunca sugeria nada — sem parecer quebrada.
 */
export function sugestaoDeCompra(
  produtos: Produto[],
  vendas: Venda[],
  {
    diasObservados = 30,
    coberturaDias = 15,
    hoje = hojeISO(),
    ordens = [],
  }: {
    diasObservados?: number;
    coberturaDias?: number;
    hoje?: string;
    ordens?: OrdemServico[];
  } = {}
): Reposicao[] {
  const inicio = new Date(Date.parse(soData(hoje) + "T00:00:00Z") - diasObservados * 86400000)
    .toISOString()
    .slice(0, 10);

  const saiu = new Map<string, number>();
  for (const s of saidasDeEstoque(vendas, ordens)) {
    if (s.dia < inicio || s.dia > soData(hoje)) continue;
    if (!s.produtoId) continue;
    saiu.set(s.produtoId, (saiu.get(s.produtoId) || 0) + n(s.quantidade));
  }

  const out: Reposicao[] = [];
  for (const p of produtos) {
    if (p.servico) continue;
    const total = saiu.get(p.id) || 0;
    /*
     * O consumo por dia é uma TAXA, não dinheiro, e não pode ser arredondado
     * em centavos.
     *
     * Duas telas em trinta dias dão 0,0667 por dia. Arredondado para 0,07,
     * o alvo de quinze dias vira 1,05 em vez de 1,00 — e como a sugestão
     * arredonda para cima, ela mandava comprar DUAS telas onde uma resolve.
     * Numa lista de trinta itens, isso é a loja comprando um a mais de cada.
     */
    const porDiaExato = total / Math.max(1, diasObservados);
    const emEstoque = n(p.quantidade);
    const diasAteAcabar = porDiaExato > 0 ? emEstoque / porDiaExato : Infinity;

    // Quanto falta para cobrir a cobertura desejada.
    const alvo = porDiaExato * coberturaDias;
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
    if (porDiaExato <= 0) continue;
    if (faltando <= 0) continue;

    // Produto por peso aceita fração; o resto arredonda para cima, porque
    // não existe comprar 2,3 unidades.
    const sugerido = p.porPeso ? centavos(faltando) : Math.ceil(faltando);

    out.push({
      produtoId: p.id,
      nome: txt(p.nome),
      emEstoque,
      // Arredondado só para a tela: quem lê "0,07 por dia" não precisa das
      // outras casas, mas a conta acima precisou.
      porDia: centavos(porDiaExato),
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
