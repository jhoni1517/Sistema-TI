import { txt } from "./format";
import { pecasEfetivas } from "./orcamento";
import {
  CODIGO_PAGAMENTO,
  documentoDoProduto,
  pendenciasDaLoja,
  pendenciasParaEmitir,
  servicoDoProduto,
} from "./fiscal";
import type { TipoDocumento } from "./fiscal";
import {
  linhaDoServico,
  type PagamentoDaNota,
  type PedidoDeNota,
  type PedidoDeNotaDeServico,
} from "./nota";
import { pedidoDaNota } from "./nota";
import type { Parcela } from "./pagamento";
import type {
  Cliente,
  Config,
  FormaPagamento,
  ItemVenda,
  MovimentoCaixa,
  OrdemServico,
  PecaOS,
  Produto,
  Venda,
} from "./types";

/**
 * ============================================================
 *  UMA ORDEM DE SERVIÇO GERA DUAS NOTAS
 * ============================================================
 *
 * Uma troca de tela é R$ 180 de mão de obra e R$ 630 de peça. São dois
 * documentos, dois impostos e dois governos:
 *
 *   MÃO DE OBRA .... NFS-e ... ISS ..... prefeitura
 *   PEÇAS .......... NFC-e ... ICMS .... SEFAZ do estado
 *
 * Emitir tudo como mercadoria paga ICMS sobre serviço; emitir tudo como
 * serviço paga ISS sobre peça. Os dois erros aparecem meses depois, no
 * contador, e o valor já foi recolhido errado.
 *
 * O sistema já sabia separar (`documentoDoProduto` em lib/fiscal.ts) e já
 * tinha o campo `tipo: "nfce" | "nfse"` na nota. Faltava a tela da OS usar:
 * até aqui, só a venda de balcão emitia — a assistência técnica, que é o
 * caso em que a separação IMPORTA, era a única que não tinha nota nenhuma.
 *
 * ------------------------------------------------------------
 * O QUE DECIDE DE QUE LADO O ITEM CAI
 *
 * 1. A mão de obra é sempre serviço. Não tem NCM e nunca vai ter.
 * 2. A peça segue o cadastro do produto: `servico` marcado vira NFS-e.
 * 3. O atendente pode MOVER um item de lado, e a escolha fica gravada
 *    naquela OS (`PecaOS.documentoForcado`).
 *
 * A terceira existe porque o cadastro erra. "Instalação de SSD" cadastrada
 * como produto comum, "cabo HDMI" cadastrado como serviço — e travar a
 * emissão até alguém corrigir o cadastro é parar a loja por causa de um
 * campo. Mover na hora resolve a nota de hoje; corrigir o cadastro resolve
 * as próximas.
 */

const n = (v?: number | null): number => Number(v) || 0;
const centavos = (v: number): number => Math.round((Number(v) || 0) * 100) / 100;

/** A descrição que a mão de obra leva na nota de serviço */
export const DESCRICAO_MAO_DE_OBRA = "Mão de obra";

/** De que lado esta peça cai, respeitando a escolha feita na OS */
export function documentoDaPeca(p: PecaOS, produtos: Produto[]): TipoDocumento {
  if (p.documentoForcado === "nfce" || p.documentoForcado === "nfse") {
    return p.documentoForcado;
  }
  const prod = p.produtoId ? produtos.find((x) => x.id === p.produtoId) : undefined;
  /*
   * Peça sem cadastro cai em MERCADORIA, e não em serviço.
   *
   * `documentoDoProduto(undefined)` já devolve "nfce", mas o motivo merece
   * estar escrito: peça digitada à mão numa OS é quase sempre a peça que a
   * loja comprou avulsa. Mandá-la para a nota de serviço faria a loja pagar
   * ISS sobre mercadoria — e o erro só aparece no contador.
   */
  return documentoDoProduto(prod);
}

export interface LadoDaNota {
  documento: TipoDocumento;
  /** Já no formato que o pedido da nota entende */
  itens: ItemVenda[];
  /** Soma dos itens, antes do desconto */
  bruto: number;
  /** Quanto do desconto da OS coube deste lado */
  desconto: number;
  /** bruto - desconto. É o que vai na nota. */
  total: number;
}

export interface NotasDaOS {
  servico: LadoDaNota;
  mercadoria: LadoDaNota;
}

/** Uma peça vira linha de venda, que é o formato que a nota já entende */
const linhaDaPeca = (p: PecaOS): ItemVenda => ({
  produtoId: p.produtoId,
  descricao: txt(p.descricao).trim() || "Item",
  quantidade: n(p.quantidade) || 1,
  precoUnit: n(p.precoUnit),
  custoUnit: n(p.custoUnit),
});

/**
 * Separa a OS nos dois documentos.
 *
 * ------------------------------------------------------------
 * PARA ONDE VAI O DESCONTO
 *
 * O desconto da OS é UM número, e as notas são duas. Ratear proporcional
 * parece justo e cria o problema que `pedidoDaNota` já documenta: quando a
 * divisão não é exata, a soma dos itens deixa de bater com o total e a SEFAZ
 * rejeita.
 *
 * Então ele desconta do SERVIÇO primeiro, e só o que sobrar vai para a
 * mercadoria. Dois motivos:
 *
 * - É o que a loja faz de verdade. Ninguém dá desconto na peça que custou
 *   caro; dá na mão de obra, que é o trabalho dela.
 * - É determinístico. O mesmo desconto na mesma OS sempre cai no mesmo
 *   lugar, e a nota de amanhã é igual à conferência de hoje.
 *
 * A trava que importa: a soma dos dois lados é SEMPRE o total da OS, e
 * nenhum lado fica negativo. Tem teste para as duas coisas.
 * ------------------------------------------------------------
 */
export function separarOS(os: OrdemServico, produtos: Produto[]): NotasDaOS {
  const pecas = pecasEfetivas(os);

  const doServico: ItemVenda[] = [];
  const daMercadoria: ItemVenda[] = [];

  // A mão de obra abre a nota de serviço. Sempre primeiro: é o que a OS é.
  const mao = centavos(n(os.maoDeObra));
  if (mao > 0) {
    doServico.push({
      descricao: DESCRICAO_MAO_DE_OBRA,
      quantidade: 1,
      precoUnit: mao,
      // Mão de obra não tem custo de mercadoria: o custo dela é o tempo, que
      // não sai do estoque. Zero aqui é a resposta certa, não um buraco.
      custoUnit: 0,
    });
  }

  for (const p of pecas) {
    if (!txt(p.descricao).trim() && n(p.precoUnit) <= 0) continue;
    const linha = linhaDaPeca(p);
    if (documentoDaPeca(p, produtos) === "nfse") doServico.push(linha);
    else daMercadoria.push(linha);
  }

  const somar = (itens: ItemVenda[]): number =>
    centavos(itens.reduce((s, i) => s + centavos(n(i.precoUnit) * n(i.quantidade)), 0));

  const brutoServico = somar(doServico);
  const brutoMercadoria = somar(daMercadoria);

  // O desconto nunca passa do que existe para descontar.
  const desconto = Math.max(0, centavos(n(os.desconto)));
  const noServico = Math.min(desconto, brutoServico);
  const naMercadoria = Math.min(centavos(desconto - noServico), brutoMercadoria);

  return {
    servico: {
      documento: "nfse",
      itens: doServico,
      bruto: brutoServico,
      desconto: noServico,
      total: centavos(brutoServico - noServico),
    },
    mercadoria: {
      documento: "nfce",
      itens: daMercadoria,
      bruto: brutoMercadoria,
      desconto: naMercadoria,
      total: centavos(brutoMercadoria - naMercadoria),
    },
  };
}

/** Este lado tem alguma coisa para virar nota? */
export const ladoTemNota = (lado: LadoDaNota): boolean =>
  lado.itens.length > 0 && lado.total > 0;

/**
 * O que falta para ESTE lado sair, em português.
 *
 * Vazio quando pode emitir. Por lado, e não pela OS inteira: a assistência
 * que só quer a nota de serviço não pode ser barrada porque falta o NCM de
 * uma peça que ela nem vai declarar hoje.
 */
export function problemaDoLado(
  lado: LadoDaNota,
  produtos: Produto[],
  config: Config
): string {
  if (lado.itens.length === 0) return "Nada deste lado para emitir.";
  if (lado.total <= 0) {
    return "Total zerado. Nota de R$ 0,00 é rejeitada.";
  }

  const faltas = [
    ...pendenciasDaLoja(config, [lado.documento]),
    ...pendenciasParaEmitir(lado.itens, produtos, config),
  ];

  if (lado.documento === "nfse") {
    /*
     * A mão de obra é uma linha sem cadastro, e `pendenciasParaEmitir` cobra
     * NCM de linha sem cadastro — com razão, porque no PDV isso é item
     * avulso de mercadoria. Aqui ela é serviço por construção, e o que ela
     * precisa é do código da lista de serviços da LOJA, cobrado logo abaixo.
     */
    const semMao = faltas.filter((f) => !f.startsWith(DESCRICAO_MAO_DE_OBRA));
    if (!servicoDoProduto(undefined, config).codigoServico) {
      semMao.push("Código da lista de serviços da loja (o contador informa)");
    }
    if (!(n(config.aliquotaIssPadrao) > 0)) {
      semMao.push("Alíquota de ISS da loja, em por cento (o contador informa)");
    }
    return textoDasFaltas(semMao);
  }

  return textoDasFaltas(faltas);
}

const textoDasFaltas = (faltas: string[]): string =>
  faltas.length === 0
    ? ""
    : `Faltam dados para a nota:\n\n${[...new Set(faltas)].map((x) => `- ${x}`).join("\n")}`;

/**
 * O texto que descreve o serviço na NFS-e.
 *
 * A prefeitura recebe UM campo de discriminação, não uma lista de itens.
 * Então a lista vira texto — com o número da OS na frente, que é como a loja
 * e o cliente se referem àquele trabalho quando alguém for conferir depois.
 */
export function discriminacaoDoServico(os: OrdemServico, lado: LadoDaNota): string {
  const linhas = lado.itens.map((i) => {
    const qtd = n(i.quantidade) || 1;
    return `${txt(i.descricao)}${qtd > 1 ? ` (${qtd}x)` : ""}`;
  });
  const cabeca = `OS ${os.numero} - ${txt(os.marca)} ${txt(os.modelo)}`.trim();
  const corpo = linhas.join("; ");
  const desconto = lado.desconto > 0 ? ` - desconto de R$ ${lado.desconto.toFixed(2)}` : "";
  return `${cabeca}. ${corpo}${desconto}`.trim();
}

/* ------------------------------------------------------------------ */
/* Como o dinheiro que já entrou se divide entre as duas notas         */
/* ------------------------------------------------------------------ */

/**
 * As formas de pagamento que já entraram no caixa por esta OS.
 *
 * Sai dos MOVIMENTOS e não de um campo da OS porque é lá que o dinheiro
 * mora de verdade: a OS pode ter sido recebida em duas vezes, ou dividida
 * entre Pix e cartão, e a nota tem que fechar com o que o contador vai ver
 * no extrato — não com o que a tela supôs.
 *
 * Entrada só: devolução e sangria lançadas na mesma OS não são pagamento
 * dela. Mesma forma somada uma vez, para a nota não sair com três linhas de
 * "dinheiro".
 */
export function pagamentosDaOS(movimentos: MovimentoCaixa[], osId: string): Parcela[] {
  const soma = new Map<FormaPagamento, number>();
  for (const m of movimentos || []) {
    if (m.osId !== osId || m.tipo !== "entrada") continue;
    const v = centavos(n(m.valor));
    if (v <= 0) continue;
    soma.set(m.formaPagamento, centavos(n(soma.get(m.formaPagamento)) + v));
  }
  return [...soma.entries()].map(([forma, valor]) => ({ forma, valor }));
}

/**
 * Quanto de cada forma de pagamento cabe NESTA nota.
 *
 * O cliente paga a OS inteira de uma vez, e as notas são duas. Como no
 * desconto, o rateio é por PREENCHIMENTO e não proporcional: a primeira
 * forma preenche o teto, a segunda pega o resto. Proporcional produz
 * centavo quebrado, e a soma dos pagamentos deixa de bater com o total da
 * nota — que é exatamente o que a SEFAZ rejeita.
 *
 * A trava: a soma do que sai daqui é SEMPRE o teto, nem um centavo a mais.
 * Quando o que entrou no caixa não cobre a nota (a OS foi paga em parte, ou
 * ainda não foi paga), o que falta vira uma linha da forma escolhida na
 * tela — a nota não pode sair com pagamento menor que o total.
 */
export function ratearPagamento(
  parcelas: Parcela[],
  teto: number,
  formaDoResto: FormaPagamento = "dinheiro"
): Parcela[] {
  const alvo = centavos(Math.max(0, teto));
  const saida: Parcela[] = [];
  let falta = alvo;

  for (const p of parcelas || []) {
    if (falta <= 0) break;
    const v = centavos(Math.min(falta, Math.max(0, n(p.valor))));
    if (v <= 0) continue;
    saida.push({ forma: p.forma, valor: v });
    falta = centavos(falta - v);
  }

  if (falta > 0) saida.push({ forma: formaDoResto, valor: falta });
  return saida;
}

const linhasDePagamento = (parcelas: Parcela[]): PagamentoDaNota[] =>
  parcelas.map((p) => ({
    formaPagamento: CODIGO_PAGAMENTO[p.forma] || "99",
    valor: centavos(n(p.valor)),
  }));

/* ------------------------------------------------------------------ */
/* Os dois pedidos prontos para a fila                                 */
/* ------------------------------------------------------------------ */

/**
 * O pedido da NFC-e das peças.
 *
 * Reaproveita `pedidoDaNota` inteiro montando uma venda de mentira com os
 * itens deste lado — e isso é de propósito. A regra de como o desconto, o
 * CPF e o código do item entram na nota de mercadoria já existe lá, com
 * teste; escrever uma segunda versão aqui seria duas regras para o mesmo
 * documento, e a que envelhece é sempre a cópia.
 */
export function pedidoDaMercadoriaDaOS(
  os: OrdemServico,
  lado: LadoDaNota,
  produtos: Produto[],
  config: Config,
  parcelas: Parcela[],
  cliente?: Cliente
): PedidoDeNota {
  const rateio = ratearPagamento(parcelas, lado.total);
  const venda: Venda = {
    id: os.id,
    numero: os.numero,
    itens: lado.itens,
    desconto: lado.desconto,
    formaPagamento: rateio[0]?.forma || "dinheiro",
    pagamentos: rateio,
    clienteId: os.clienteId,
    criadoEm: os.entregueEm || os.atualizadoEm || os.criadoEm,
  };
  return pedidoDaNota(venda, produtos, config, cliente);
}

/** O pedido da NFS-e da mão de obra */
export function pedidoDoServicoDaOS(
  os: OrdemServico,
  lado: LadoDaNota,
  produtos: Produto[],
  config: Config,
  parcelas: Parcela[],
  cliente?: Cliente
): PedidoDeNotaDeServico {
  const cpf = txt(cliente?.cpf).replace(/\D/g, "");
  return {
    discriminacao: discriminacaoDoServico(os, lado),
    codigoMunicipio: txt(config.nfCodigoIbge).replace(/\D/g, ""),
    itens: lado.itens.map((i, x) => linhaDoServico(i, x + 1, produtos, config)),
    pagamentos: linhasDePagamento(ratearPagamento(parcelas, lado.total)),
    valorTotal: lado.total,
    valorDesconto: lado.desconto,
    /*
     * A NFS-e sem tomador identificado existe, mas quase nunca serve: é o
     * cliente que leva a nota para o contador dele. Ainda assim, CPF pela
     * metade derruba a nota inteira — então ou vai completo, ou não vai.
     */
    cpfDestinatario: cpf.length === 11 ? cpf : undefined,
    nomeDestinatario: cpf.length === 11 ? txt(cliente?.nome).trim() || undefined : undefined,
  };
}
