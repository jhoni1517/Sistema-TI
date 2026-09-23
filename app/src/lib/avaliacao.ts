import { txt } from "./format";
import { hojeISO, diasAteVencer, soData } from "./contas";
import type { Cliente, Config, OrdemServico } from "./types";

/**
 * Pedir avaliação no Google depois da entrega.
 *
 * Avaliação é o que traz cliente novo para loja de bairro, e o melhor
 * momento para pedir é o cliente com o aparelho funcionando na mão. O pior
 * é pedir de novo: quem voltou três vezes no mês e recebeu três pedidos
 * de estrela passa a achar a loja chata — e o Google também não gosta de
 * avaliação repetida da mesma pessoa.
 *
 * Por isso o pedido fica ANOTADO no cliente (`avaliacaoPedidaEm`), e não
 * na OS: a pergunta é "já pedimos a esta pessoa?", não "a esta ordem?".
 */

/** Dias entre um pedido e outro para a mesma pessoa */
export const JANELA_AVALIACAO_DIAS = 90;

/** Já pedimos a esta pessoa nos últimos 90 dias? */
export function avaliacaoRecente(
  cliente: Pick<Cliente, "avaliacaoPedidaEm"> | undefined,
  hoje = hojeISO()
): boolean {
  const quando = soData(cliente?.avaliacaoPedidaEm);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(quando)) return false;
  return diasAteVencer(hoje, quando) < JANELA_AVALIACAO_DIAS;
}

/**
 * Dá para pedir agora? Quando não, diz por quê — botão desabilitado sem
 * motivo faz a pessoa achar que o sistema travou.
 */
export function podePedirAvaliacao(
  o: Pick<OrdemServico, "status">,
  cliente: Pick<Cliente, "telefone" | "avaliacaoPedidaEm"> | undefined,
  config: Pick<Config, "linkAvaliacao">,
  hoje = hojeISO()
): { pode: boolean; motivo: string } {
  if (o.status !== "entregue") {
    return { pode: false, motivo: "Só depois de entregue: pedir estrela no meio do conserto é pedir na pior hora." };
  }
  if (!txt(config.linkAvaliacao).trim()) {
    return { pode: false, motivo: "Falta o link de avaliação do Google em Configurações." };
  }
  if (!txt(cliente?.telefone).replace(/\D/g, "")) {
    return { pode: false, motivo: "Cliente sem telefone cadastrado." };
  }
  if (avaliacaoRecente(cliente, hoje)) {
    const quando = soData(cliente?.avaliacaoPedidaEm).split("-").reverse().join("/");
    return { pode: false, motivo: `Já pedimos em ${quando}. Pedir de novo antes de 90 dias cansa.` };
  }
  return { pode: true, motivo: "" };
}

/**
 * A mensagem, na voz de balcão. Sem emoji: em alguns aparelhos chegam
 * como "?" e sujam justamente a mensagem que devia causar boa impressão.
 */
export function mensagemPedidoAvaliacao(
  o: Pick<OrdemServico, "marca" | "modelo">,
  cliente: Pick<Cliente, "nome"> | undefined,
  config: Pick<Config, "nomeLoja" | "linkAvaliacao">
): string {
  const nome = txt(cliente?.nome).trim().split(/\s+/)[0];
  const loja = txt(config.nomeLoja).trim() || "a loja";
  const aparelho = [txt(o.marca), txt(o.modelo)].filter(Boolean).join(" ") || "seu aparelho";
  const link = txt(config.linkAvaliacao).trim();
  return [
    `Oi${nome ? `, ${nome}` : ""}! Aqui é da ${loja}.`,
    `Tomara que o ${aparelho} esteja tinindo. Se a gente te atendeu bem, deixa uma avaliação ` +
      "pra gente no Google? Leva um minuto e ajuda demais uma loja de bairro.",
    link,
  ].join("\n\n");
}
