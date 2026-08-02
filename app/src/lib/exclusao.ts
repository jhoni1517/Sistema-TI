import { txt, codigoOS } from "./format";
import { centavos } from "./pdv";
import { saldoFiado, totalOS } from "./calc";
import type { Cliente, Fiado, MovimentoCaixa, OrdemServico, Produto, Venda } from "./types";

/**
 * O que se perde ao apagar.
 *
 * A tela perguntava só "Excluir Fulano?". Quem responde sim não sabe que
 * aquele Fulano deve R$ 340 e tem um notebook na bancada — e o sistema não
 * contava. Depois a dívida vira "fiado órfão" na conferência, sem dono e sem
 * como cobrar: o telefone foi embora junto.
 *
 * Duas regras, e a segunda é a que importa:
 *
 * 1. **Diz o que some junto**, em dinheiro e em quantidade. "Excluir?" não é
 *    pergunta, é armadilha.
 * 2. **Algumas coisas simplesmente não se apaga.** Cliente com dívida em
 *    aberto e produto com movimento no caixa não são cadastro: são histórico
 *    contábil, e apagar histórico é o caminho curto para o mês não fechar.
 */

const n = (v?: number | null): number => Number(v) || 0;

export interface Consequencia {
  /** Pode apagar? */
  pode: boolean;
  /** Título curto para o confirm ou para o aviso de recusa */
  titulo: string;
  /** O que exatamente se perde, uma linha por coisa */
  perdas: string[];
  /** Quando não pode, o que fazer em vez disso */
  saida: string;
}

/**
 * Apagar um cliente.
 *
 * Dívida em aberto trava: sem o cadastro, some o telefone de quem deve.
 * Histórico de compra não trava — mas precisa estar na tela, porque é o que
 * a pessoa não imagina que vai perder.
 */
export function aoApagarCliente(
  cliente: Cliente,
  dados: { fiados: Fiado[]; ordens: OrdemServico[]; vendas: Venda[] }
): Consequencia {
  const devendo = centavos(
    dados.fiados
      .filter((f) => f.clienteId === cliente.id && !f.quitado)
      .reduce((s, f) => s + saldoFiado(f), 0)
  );

  const naBancada = dados.ordens.filter(
    (o) => o.clienteId === cliente.id && !["entregue", "cancelada"].includes(o.status)
  );

  if (devendo > 0) {
    return {
      pode: false,
      titulo: `${txt(cliente.nome)} deve ${devendo.toFixed(2)} em aberto`,
      perdas: [],
      saida:
        "Quite ou cancele a dívida em A Receber antes de apagar. Sem o " +
        "cadastro some o telefone de quem deve, e a cobrança fica sem dono.",
    };
  }

  if (naBancada.length > 0) {
    return {
      pode: false,
      titulo: `${txt(cliente.nome)} tem ${naBancada.length} aparelho(s) na loja`,
      perdas: naBancada.map(
        (o) => `${codigoOS(o.numero)} — ${txt(o.marca)} ${txt(o.modelo)}`.trim()
      ),
      saida:
        "Entregue ou cancele essas ordens primeiro. Apagar agora deixa " +
        "aparelho de gente na bancada sem saber de quem é.",
    };
  }

  const perdas: string[] = [];
  const compras = dados.vendas.filter((v) => v.clienteId === cliente.id).length;
  const ordens = dados.ordens.filter((o) => o.clienteId === cliente.id).length;
  if (ordens > 0) perdas.push(`${ordens} ordem(ns) de serviço ficam sem cliente`);
  if (compras > 0) perdas.push(`${compras} compra(s) ficam sem cliente`);
  if (txt(cliente.telefone)) perdas.push(`o telefone ${txt(cliente.telefone)}`);

  return {
    pode: true,
    titulo: `Apagar ${txt(cliente.nome)}?`,
    perdas,
    saida: "",
  };
}

/**
 * Apagar um produto.
 *
 * Produto que já foi vendido trava: o cupom do cliente cita o nome dele, e o
 * relatório de giro passa a ter uma venda de item que não existe. O certo é
 * zerar o estoque e parar de usar.
 */
export function aoApagarProduto(
  produto: Produto,
  dados: { vendas: Venda[]; ordens: OrdemServico[] }
): Consequencia {
  const vendido = dados.vendas.some((v) =>
    (v.itens || []).some((i) => i.produtoId === produto.id)
  );
  const usadoEmOS = dados.ordens.some((o) =>
    (o.pecas || []).some((p) => p.produtoId === produto.id)
  );

  if (vendido || usadoEmOS) {
    return {
      pode: false,
      titulo: `${txt(produto.nome)} já tem histórico de venda`,
      perdas: [],
      saida:
        "Não apague: o cupom do cliente cita este nome, e o relatório passaria " +
        "a mostrar venda de item que não existe. Zere a quantidade e pare de " +
        "usar — ele some das buscas do balcão do mesmo jeito.",
    };
  }

  const perdas: string[] = [];
  const emEstoque = n(produto.quantidade);
  if (!produto.servico && emEstoque > 0) {
    perdas.push(
      `${emEstoque} em estoque, ${centavos(emEstoque * n(produto.custo)).toFixed(2)} a custo`
    );
  }
  if (txt(produto.codigoBarras)) perdas.push(`o código de barras ${produto.codigoBarras}`);

  return { pode: true, titulo: `Apagar ${txt(produto.nome)}?`, perdas, saida: "" };
}

/**
 * Apagar uma ordem de serviço.
 *
 * Com dinheiro lançado, apagar deixa a entrada no caixa apontando para uma
 * OS que não existe — e o fechamento do mês passa a ter receita sem origem.
 */
export function aoApagarOrdem(
  ordem: OrdemServico,
  dados: { movimentos: MovimentoCaixa[]; fiados: Fiado[] }
): Consequencia {
  const pago = dados.movimentos.filter((m) => m.osId === ordem.id);
  const fiado = dados.fiados.filter((f) => f.osId === ordem.id && !f.quitado);

  if (pago.length > 0 || fiado.length > 0) {
    return {
      pode: false,
      titulo: `${codigoOS(ordem.numero)} tem dinheiro lançado`,
      perdas: [
        ...pago.map((m) => `entrada de ${n(m.valor).toFixed(2)} no caixa`),
        ...fiado.map((f) => `${saldoFiado(f).toFixed(2)} em aberto no A Receber`),
      ],
      saida:
        "Cancele a OS em vez de apagar. Apagando, a entrada do caixa fica " +
        "apontando para uma ordem que não existe, e o mês fecha com receita " +
        "sem origem.",
    };
  }

  const perdas: string[] = [];
  if (totalOS(ordem) > 0) perdas.push(`orçamento de ${totalOS(ordem).toFixed(2)}`);
  if ((ordem.fotos || []).length > 0) {
    perdas.push(`${(ordem.fotos || []).length} foto(s) do estado de entrada`);
  }
  if (txt(ordem.defeitoConstatado)) perdas.push("o laudo técnico");

  return { pode: true, titulo: `Apagar ${codigoOS(ordem.numero)}?`, perdas, saida: "" };
}

/**
 * O texto do confirm, pronto.
 *
 * Uma linha por perda, porque parágrafo em caixa de confirmação ninguém lê.
 */
export function textoDaConfirmacao(c: Consequencia): string {
  if (c.perdas.length === 0) return `${c.titulo}\n\nIsto não pode ser desfeito.`;
  return (
    `${c.titulo}\n\nO que some junto:\n` +
    c.perdas.map((p) => `- ${p}`).join("\n") +
    "\n\nIsto não pode ser desfeito."
  );
}

/**
 * Apagar um fiado.
 *
 * O botão perguntava "Excluir este fiado?" e apagava. Era a mesma armadilha
 * do cliente, com dinheiro dentro: um fiado de R$ 500 com R$ 300 já pagos
 * tem TRÊS lançamentos de entrada no caixa apontando para ele. Some a
 * dívida, ficam as entradas — receita sem origem, que ninguém consegue
 * explicar no fim do mês, e some junto o registro de que o cliente pagou.
 *
 * Com pagamento recebido, não se apaga: isso não é cadastro, é histórico
 * contábil. Em aberto e sem nada recebido, apaga — mas dizendo quanto o
 * cliente deixa de dever, porque é isso que a loja está perdoando.
 */
export function aoApagarFiado(
  fiado: Fiado,
  nomeCliente = ""
): Consequencia {
  const recebido = centavos((fiado.pagamentos || []).reduce((s, p) => s + n(p.valor), 0));
  const saldo = saldoFiado(fiado);
  const de = txt(nomeCliente).trim();

  if (recebido > 0) {
    return {
      pode: false,
      titulo: `Este fiado já tem ${recebido.toFixed(2)} recebidos`,
      perdas: [
        `${(fiado.pagamentos || []).length} pagamento(s) lançados no caixa`,
        `o registro de que ${de || "o cliente"} pagou`,
      ],
      saida:
        "Apagar deixa as entradas do caixa apontando para uma dívida que não " +
        "existe mais, e o mês fecha com receita sem origem. Se a dívida acabou, " +
        "receba o saldo restante — ela some da lista sozinha ao quitar.",
    };
  }

  return {
    pode: true,
    titulo: `Apagar este fiado${de ? ` de ${de}` : ""}?`,
    perdas:
      saldo > 0
        ? [`${de || "O cliente"} deixa de dever ${saldo.toFixed(2)}`]
        : [],
    saida: "",
  };
}
