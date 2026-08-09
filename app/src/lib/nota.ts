import { txt } from "./format";
import { centavos, subtotalItem } from "./pdv";
import { totalVenda } from "./pdv";
import {
  CODIGO_PAGAMENTO,
  fiscalDoProduto,
  pendenciasParaEmitir,
  type SituacaoNota,
} from "./fiscal";
import type { Cliente, Config, ItemVenda, Produto, Venda } from "./types";

/**
 * A nota fiscal de uma venda: o que mandar, quando mandar e quando desistir.
 *
 * O sistema não emite nota — quem emite é o intermediário (ver
 * NOTA-FISCAL-INTERMEDIARIO.md). O que mora aqui é o que é NOSSO: montar o
 * pedido com os dados certos, decidir se dá para mandar, e saber a hora de
 * parar de tentar.
 *
 * ---------------------------------------------------------------------
 * A VENDA NUNCA ESPERA A NOTA.
 *
 * Este é o princípio que decide o desenho inteiro. A SEFAZ cai, o
 * intermediário cai, a internet do balcão cai — e nada disso pode travar o
 * caixa de um restaurante numa sexta cheia com fila na porta. A venda fecha,
 * o dinheiro entra, o estoque baixa; a nota entra numa FILA e sai depois.
 *
 * É por isso que `situacao` nasce "pendente" e que isso não é erro: é o
 * estado normal de quem acabou de vender.
 * ---------------------------------------------------------------------
 *
 * NENHUMA CREDENCIAL PASSA POR AQUI. O token do emissor e o CSC vivem em
 * `fiscal_credencial`, tabela que o navegador não lê — nem com o login do
 * dono. Quem lê é a função da Vercel. Ver supabase-migracao-notas.sql.
 */

const n = (v?: number | null): number => Number(v) || 0;
const digitos = (v?: string | null): string => txt(v).replace(/\D/g, "");

/** Duas casas, como a SEFAZ espera — e como o cupom já mostra */
const duasCasas = (v: number): number => centavos(v);

export interface Nota {
  id: string;
  vendaId?: string;
  tipo: "nfce" | "nfse";
  situacao: SituacaoNota;
  erro?: string;
  tentativas?: number;
  chave?: string;
  numero?: string;
  serie?: string;
  protocolo?: string;
  url?: string;
  emitidaEm?: string;
  canceladaEm?: string;
  motivoCancelamento?: string;
  criadoEm?: string;
  atualizadoEm?: string;
}

/**
 * Quantas vezes vale a pena tentar antes de parar.
 *
 * Nota recusada por dado errado — NCM que não existe, CFOP inválido — vai
 * ser recusada para sempre. Sem um teto, o robô bate na mesma pedra todo dia
 * e a loja recebe o mesmo aviso até parar de ler avisos.
 *
 * Três é generoso para o que é temporário (SEFAZ fora do ar, timeout) e
 * curto para o que é permanente.
 */
export const MAXIMO_DE_TENTATIVAS = 3;

/**
 * Esta nota ainda deve ser tentada?
 *
 * Só a pendente, e só enquanto não estourou o teto. Autorizada e cancelada
 * acabaram; rejeitada esperou o teto e agora precisa de gente.
 */
export const podeTentar = (nota: Nota): boolean =>
  nota?.situacao === "pendente" && n(nota?.tentativas) < MAXIMO_DE_TENTATIVAS;

/**
 * A nota precisa de alguém olhando?
 *
 * É o que a tela mostra em vermelho: ou a SEFAZ recusou, ou tentamos o
 * bastante e não passou. Nos dois casos o caminho é humano — conferir o
 * cadastro do produto ou os dados da loja.
 */
export const precisaDeAtencao = (nota: Nota): boolean =>
  nota?.situacao === "rejeitada" ||
  (nota?.situacao === "pendente" && n(nota?.tentativas) >= MAXIMO_DE_TENTATIVAS);

/**
 * O que fazer com a nota depois de a venda ser DEVOLVIDA.
 *
 * Não existe "desfazer" de nota autorizada fora dos 30 minutos: passou
 * disso, o caminho é nota de devolução, que é outro documento e quem faz é o
 * contador. A tela não pode oferecer o que não existe.
 */
export const podeCancelar = (nota: Nota): boolean => nota?.situacao === "autorizada";

/* ------------------------------------------------------------------ */
/* O pedido que vai para o emissor                                     */
/* ------------------------------------------------------------------ */

export interface ItemDaNota {
  /** Ordem do item na nota, começando em 1 */
  numero: number;
  codigo: string;
  descricao: string;
  ncm: string;
  cfop: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  valorBruto: number;
  origem: string;
  /** CSOSN no Simples, CST fora dele */
  codigoTributacao: string;
}

export interface PagamentoDaNota {
  /** Código da tabela da SEFAZ: 01 dinheiro, 17 pix, 11 vale-refeição... */
  formaPagamento: string;
  valor: number;
}

export interface PedidoDeNota {
  naturezaOperacao: string;
  itens: ItemDaNota[];
  pagamentos: PagamentoDaNota[];
  valorTotal: number;
  valorDesconto: number;
  /** Só quando o cliente pediu "com CPF na nota" */
  cpfDestinatario?: string;
  nomeDestinatario?: string;
}

/**
 * Monta o pedido da NFC-e a partir da venda.
 *
 * Três decisões que valem explicar:
 *
 * **O desconto vai no TOTAL, e não rateado por item.** A NFC-e aceita os
 * dois jeitos; ratear obriga a distribuir centavo por centavo e, quando a
 * divisão não é exata, a soma dos itens deixa de bater com o total — que é
 * exatamente o erro que a SEFAZ rejeita.
 *
 * **A linha sem produtoId vai com o código "SEM CADASTRO".** É a taxa de
 * serviço, a taxa de entrega e o item avulso. Elas não têm NCM, e é por isso
 * que `pendenciasParaEmitir` recusa a venda ANTES de chegar aqui — menos a
 * taxa, que é marcada e passa.
 *
 * **O pagamento vai por FORMA, na tabela da SEFAZ.** Uma venda dividida
 * manda duas linhas de pagamento; a nota tem que fechar com o que entrou no
 * caixa, senão a conferência do contador não bate com a do sistema.
 */
export function pedidoDaNota(
  venda: Venda,
  produtos: Produto[],
  config: Config,
  cliente?: Cliente
): PedidoDeNota {
  const itens = (venda.itens || []).map((item, i) => linhaDaNota(item, i + 1, produtos, config));

  /*
   * A venda dividida manda uma linha por forma; a de uma forma só manda uma.
   * O valor é o TOTAL da venda em qualquer caso — a soma dos pagamentos tem
   * que bater com o total, e é isso que a SEFAZ confere.
   */
  const total = totalVenda(venda);
  const divididos = (venda.pagamentos || []).filter((p) => n(p.valor) > 0);
  const pagamentos: PagamentoDaNota[] =
    divididos.length > 0
      ? divididos.map((p) => ({
          formaPagamento: CODIGO_PAGAMENTO[p.forma] || "99",
          valor: duasCasas(n(p.valor)),
        }))
      : [
          {
            formaPagamento: CODIGO_PAGAMENTO[venda.formaPagamento] || "99",
            valor: total,
          },
        ];

  const cpf = digitos(cliente?.cpf);

  return {
    // "Venda ao consumidor" é a natureza de toda NFC-e de balcão.
    naturezaOperacao: txt(config.naturezaOperacao).trim() || "Venda ao consumidor",
    itens,
    pagamentos,
    valorTotal: total,
    valorDesconto: duasCasas(Math.max(0, n(venda.desconto))),
    /*
     * CPF só quando existe e é válido em tamanho.
     *
     * NFC-e sem CPF é normal — é a nota "sem identificação do
     * destinatário", que é a maioria no balcão. Mandar um CPF pela metade,
     * porém, faz a SEFAZ rejeitar a nota inteira.
     */
    cpfDestinatario: cpf.length === 11 ? cpf : undefined,
    nomeDestinatario: cpf.length === 11 ? txt(cliente?.nome).trim() || undefined : undefined,
  };
}

function linhaDaNota(
  item: ItemVenda,
  numero: number,
  produtos: Produto[],
  config: Config
): ItemDaNota {
  const p = item.produtoId ? produtos.find((x) => x.id === item.produtoId) : undefined;
  const f = fiscalDoProduto(p, config);
  const quantidade = n(item.quantidade);
  return {
    numero,
    // Sem cadastro não há código, e inventar um faria a nota apontar para um
    // produto que não existe. A taxa de serviço cai aqui.
    codigo: txt(p?.sku).trim() || txt(p?.codigoBarras).trim() || item.produtoId || "SEM CADASTRO",
    descricao: txt(item.descricao).trim(),
    ncm: f.ncm,
    cfop: f.cfop,
    unidade: f.unidade,
    quantidade,
    valorUnitario: duasCasas(n(item.precoUnit)),
    // O bruto é o subtotal JÁ arredondado da mesma forma que o cupom mostra.
    // Somar sem arredondar produz um total diferente do que está escrito nos
    // itens, e é a soma que a SEFAZ confere.
    valorBruto: subtotalItem(item),
    origem: f.origem,
    codigoTributacao: f.codigoTributacao,
  };
}

/**
 * A venda pode virar nota agora?
 *
 * Devolve o motivo em texto, vazio quando pode. É a mesma conferência de
 * `lib/fiscal.ts` mais duas que só existem aqui.
 */
export function problemaParaEmitir(
  venda: Venda,
  produtos: Produto[],
  config: Config
): string {
  if (!venda) return "Venda não encontrada.";
  if ((venda.itens || []).length === 0) return "Venda sem itens.";
  if (totalVenda(venda) <= 0) {
    return "Venda com total zero. Nota de R$ 0,00 é rejeitada pela SEFAZ.";
  }

  const faltas = pendenciasParaEmitir(venda.itens || [], produtos, config);
  if (faltas.length === 0) return "";

  /*
   * A lista inteira de uma vez, e não a primeira pendência.
   *
   * Quem vai preencher prefere ver os cinco produtos que faltam do que
   * descobrir um a cada tentativa — com o cliente esperando o cupom.
   */
  return `Faltam dados para a nota:\n\n${faltas.map((x) => `- ${x}`).join("\n")}`;
}

/**
 * Uma nota nova, pendente, para a venda.
 *
 * Nasce sem tentativa nenhuma e sem erro. Quem a manda é o robô, nunca a
 * tela — a tela só a coloca na fila.
 */
export function notaPendente(
  id: string,
  venda: Venda,
  agora = new Date().toISOString()
): Nota {
  return {
    id,
    vendaId: venda.id,
    tipo: "nfce",
    situacao: "pendente",
    tentativas: 0,
    criadoEm: agora,
    atualizadoEm: agora,
  };
}

/** A nota desta venda, se já existe alguma */
export const notaDaVenda = (notas: Nota[], vendaId?: string): Nota | undefined =>
  vendaId ? (notas || []).find((x) => x.vendaId === vendaId) : undefined;

/**
 * As notas que precisam de gente olhando, da mais antiga para a mais nova.
 *
 * Antiga primeiro porque nota parada é imposto atrasado, e o prazo corre
 * mesmo quando ninguém está olhando a tela.
 */
export const notasComProblema = (notas: Nota[]): Nota[] =>
  (notas || [])
    .filter(precisaDeAtencao)
    .sort((a, b) => txt(a.criadoEm).localeCompare(txt(b.criadoEm)));
