import { txt } from "./format";
import { diasAteVencer } from "./contas";
import type { OrdemServico, PedidoPeca, Produto } from "./types";

/**
 * Peça encomendada para a OS.
 *
 * "Aguardando peça" era um status sem memória: ninguém sabia de quem foi
 * pedida, quanto custou nem para quando vinha. A peça chegava junto com a
 * compra da semana, ia para a prateleira — e era vendida no balcão para o
 * primeiro cliente que pediu, enquanto o dono do aparelho esperava mais
 * uma semana.
 *
 * Aqui o pedido mora na OS, a entrada de nota reconhece a peça, RESERVA
 * para a OS (o PDV não vende) e devolve a OS para a bancada.
 */

export const pendentes = (o: Pick<OrdemServico, "pedidosPeca">): PedidoPeca[] =>
  (o.pedidosPeca || []).filter((p) => p.status === "pedido");

const aberta = (o: Pick<OrdemServico, "status">) => o.status !== "entregue" && o.status !== "cancelada";

export function problemaNoPedido(p: Pick<PedidoPeca, "descricao" | "quantidade">): string {
  if (!txt(p.descricao).trim()) return "Escreva qual peça foi pedida.";
  if (!(Number(p.quantidade) > 0)) return "Quantidade inválida.";
  return "";
}

export interface PecaACaminho {
  os: OrdemServico;
  pedido: PedidoPeca;
  /** Dias de atraso (0 = vence hoje ou sem previsão; > 0 = atrasado) */
  atraso: number;
}

/** Tudo que foi pedido e não chegou, com o atrasado primeiro. */
export function pecasACaminho(ordens: OrdemServico[], hoje: string): PecaACaminho[] {
  const saida: PecaACaminho[] = [];
  for (const os of ordens) {
    if (!aberta(os)) continue;
    for (const pedido of pendentes(os)) {
      const atraso = pedido.previsao ? Math.max(0, -diasAteVencer(pedido.previsao, hoje)) : 0;
      saida.push({ os, pedido, atraso });
    }
  }
  return saida.sort((a, b) => b.atraso - a.atraso || txt(a.pedido.previsao || "9999").localeCompare(txt(b.pedido.previsao || "9999")));
}

/**
 * Quanto de cada produto está reservado: peça que chegou para uma OS ainda
 * não entregue. Na entrega a OS dá baixa no estoque e a reserva acaba.
 */
export function reservas(ordens: OrdemServico[]): Map<string, { total: number; ordens: number[] }> {
  const m = new Map<string, { total: number; ordens: number[] }>();
  for (const os of ordens) {
    if (!aberta(os)) continue;
    for (const p of os.pedidosPeca || []) {
      if (p.status !== "chegou" || !p.produtoId) continue;
      const r = m.get(p.produtoId) || { total: 0, ordens: [] };
      r.total += Number(p.quantidade) || 0;
      if (!r.ordens.includes(os.numero)) r.ordens.push(os.numero);
      m.set(p.produtoId, r);
    }
  }
  return m;
}

/**
 * A venda come peça reservada? Estoque negativo continua sendo
 * informação (a venda passa); o que não passa é vender a peça que tem dono.
 */
export function conflitoComReserva(
  itens: { produtoId?: string; quantidade: number; descricao?: string }[],
  produtos: Pick<Produto, "id" | "nome" | "quantidade">[],
  res: Map<string, { total: number; ordens: number[] }>
): string {
  const noCarrinho = new Map<string, number>();
  for (const i of itens) if (i.produtoId) noCarrinho.set(i.produtoId, (noCarrinho.get(i.produtoId) || 0) + (Number(i.quantidade) || 0));
  for (const [id, qtd] of noCarrinho) {
    const r = res.get(id);
    if (!r || r.total <= 0) continue;
    const p = produtos.find((x) => x.id === id);
    const livre = Math.max(0, (Number(p?.quantidade) || 0) - r.total);
    if (qtd > livre) {
      const oss = r.ordens.map((n) => `OS ${n}`).join(", ");
      return livre > 0
        ? `${p?.nome || "Esta peça"}: só ${livre} livre(s). ${r.total} está(ão) reservada(s) para ${oss}.`
        : `${p?.nome || "Esta peça"} está reservada para ${oss}. Não dá para vender no balcão.`;
    }
  }
  return "";
}

/**
 * A nota de entrada chegou: casa cada peça com os pedidos pendentes, do
 * mais antigo para o mais novo, até acabar a quantidade que veio. A OS que
 * estava aguardando peça e não espera mais nada volta para a bancada.
 */
export function chegadaDaEntrada(
  ordens: OrdemServico[],
  itens: { produtoId: string; quantidade: number }[],
  agora: string
): { atualizadas: OrdemServico[]; chegadas: { os: OrdemServico; pedido: PedidoPeca }[] } {
  const sobra = new Map<string, number>();
  for (const i of itens) sobra.set(i.produtoId, (sobra.get(i.produtoId) || 0) + (Number(i.quantidade) || 0));

  const fila: { os: OrdemServico; pedido: PedidoPeca }[] = [];
  for (const os of ordens) {
    if (!aberta(os)) continue;
    for (const pedido of pendentes(os)) if (pedido.produtoId && sobra.has(pedido.produtoId)) fila.push({ os, pedido });
  }
  fila.sort((a, b) => a.pedido.pedidoEm.localeCompare(b.pedido.pedidoEm));

  const mudou = new Map<string, OrdemServico>();
  const chegadas: { os: OrdemServico; pedido: PedidoPeca }[] = [];
  for (const { os, pedido } of fila) {
    const tem = sobra.get(pedido.produtoId!) || 0;
    if (tem < pedido.quantidade) continue;
    sobra.set(pedido.produtoId!, tem - pedido.quantidade);
    const atual = mudou.get(os.id) || os;
    const pedidosPeca = (atual.pedidosPeca || []).map((p) => (p.id === pedido.id ? { ...p, status: "chegou" as const, chegouEm: agora } : p));
    mudou.set(os.id, { ...atual, pedidosPeca });
    chegadas.push({ os: atual, pedido: { ...pedido, status: "chegou", chegouEm: agora } });
  }

  const atualizadas = [...mudou.values()].map((os) => {
    if (os.status !== "aguardando_peca" || pendentes(os).length > 0) return { ...os, atualizadoEm: agora };
    const nomes = (os.pedidosPeca || []).filter((p) => p.chegouEm === agora).map((p) => p.descricao).join(", ");
    return {
      ...os,
      status: "em_reparo" as const,
      atualizadoEm: agora,
      historico: [...(os.historico || []), { data: agora, status: "em_reparo" as const, nota: `Peça chegou: ${nomes}` }],
    };
  });
  return { atualizadas, chegadas };
}

/** Recado para o cliente. Sem emoji. */
export function mensagemPecaChegou(nome: string, loja: string, os: Pick<OrdemServico, "numero" | "marca" | "modelo">, link?: string): string {
  const quem = txt(nome).trim().split(/\s+/)[0] || "tudo bem";
  const aparelho = [os.marca, os.modelo].filter((x) => txt(x).trim()).join(" ");
  return (
    `Oi, ${quem}! Aqui é da ${loja}. A peça do seu ${aparelho || "aparelho"} (OS ${os.numero}) chegou e o conserto já voltou para a bancada.` +
    (link ? `\nAcompanhe: ${link}` : "")
  );
}
