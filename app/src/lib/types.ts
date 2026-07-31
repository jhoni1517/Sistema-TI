import type { Ramo } from "./ramos";
import type { FormatoBalanca } from "./balanca";

// ==== Tipos de domínio do Sistema TI ====

export type ID = string;

export type OSStatus =
  | "aberta"
  | "em_analise"
  | "aguardando_aprovacao"
  | "aprovada"
  | "em_reparo"
  | "aguardando_peca"
  | "pronta"
  | "entregue"
  | "cancelada";

export const OS_STATUS_META: Record<
  OSStatus,
  { label: string; color: string; cliente: string }
> = {
  aberta: { label: "Aberta", color: "bg-slate-100 text-slate-700", cliente: "Recebemos seu aparelho e vamos analisá-lo." },
  em_analise: { label: "Em análise", color: "bg-blue-100 text-blue-700", cliente: "Seu aparelho está em análise técnica." },
  aguardando_aprovacao: { label: "Aguardando aprovação", color: "bg-amber-100 text-amber-700", cliente: "Temos um orçamento! Aguardamos sua aprovação." },
  aprovada: { label: "Aprovada", color: "bg-indigo-100 text-indigo-700", cliente: "Orçamento aprovado. Vamos iniciar o reparo." },
  em_reparo: { label: "Em reparo", color: "bg-purple-100 text-purple-700", cliente: "Seu aparelho está em reparo." },
  aguardando_peca: { label: "Aguardando peça", color: "bg-orange-100 text-orange-700", cliente: "Aguardando a chegada de uma peça para continuar." },
  pronta: { label: "Pronta", color: "bg-emerald-100 text-emerald-700", cliente: "Boa notícia! Seu aparelho está pronto para retirada." },
  entregue: { label: "Entregue", color: "bg-teal-100 text-teal-700", cliente: "Aparelho entregue. Obrigado pela preferência!" },
  cancelada: { label: "Cancelada", color: "bg-red-100 text-red-700", cliente: "Ordem de serviço cancelada." },
};

export type TipoPessoa = "fisica" | "juridica";

/**
 * Classificação de risco do cliente.
 *
 * É registro interno da loja, baseado no histórico dela com aquela pessoa.
 * Nunca aparece no recibo nem na página pública de acompanhamento: serve
 * para o atendente decidir na hora, não para constranger ninguém no balcão.
 */
export type Classificacao = "normal" | "atencao" | "bloqueado";

export const CLASSIFICACAO_META: Record<
  Classificacao,
  { label: string; cor: string; corPonto: string; descricao: string }
> = {
  normal: {
    label: "Normal",
    cor: "bg-emerald-100 text-emerald-700",
    corPonto: "bg-emerald-500",
    descricao: "Sem restrição",
  },
  atencao: {
    label: "Atenção",
    cor: "bg-amber-100 text-amber-700",
    corPonto: "bg-amber-500",
    descricao: "Atende, mas o sistema avisa antes de abrir a OS",
  },
  bloqueado: {
    label: "Bloqueado",
    cor: "bg-red-100 text-red-700",
    corPonto: "bg-red-500",
    descricao: "Não abre nova OS sem autorização do dono",
  },
};

export interface Cliente {
  id: ID;
  nome: string; // pessoa física: nome; jurídica: razão social
  telefone: string;
  /** CPF ou CNPJ, guardado só com dígitos */
  cpf?: string;
  email?: string;
  endereco?: string;
  observacoes?: string;
  tipoPessoa?: TipoPessoa; // ausente = física (cadastros antigos)
  nomeFantasia?: string; // só jurídica
  inscricaoEstadual?: string; // só jurídica
  /** Classificação de risco (ausente = normal) */
  classificacao?: Classificacao;
  /** Por que foi classificado assim. Obrigatório fora do normal. */
  motivoClassificacao?: string;
  classificadoEm?: string;
  /** Aniversário (AAAA-MM-DD). O ano pode ser qualquer um: só o dia importa. */
  nascimento?: string;
  criadoEm: string;
}

export interface PecaOS {
  produtoId?: ID;
  descricao: string;
  quantidade: number;
  custoUnit: number; // custo para a loja
  precoUnit: number; // preço cobrado do cliente
  /**
   * A qual orçamento a peça pertence ("Opção 1", "Completo"). Vazio = entra
   * em qualquer um. Ver lib/orcamento.ts.
   */
  opcao?: string;
}

export interface HistoricoOS {
  data: string;
  status: OSStatus;
  nota?: string;
}

export interface OrdemServico {
  id: ID;
  numero: number;
  clienteId: ID;
  // Aparelho
  tipoAparelho: string; // Celular, Notebook, PC, Tablet...
  marca: string;
  modelo: string;
  cor?: string;
  imeiSerial?: string;
  // Senhas / acesso (dados sensíveis)
  senhaAparelho?: string;
  padraoDesbloqueio?: string;
  contaVinculada?: string;
  // Estado / diagnóstico
  acessorios?: string; // capinha, chip, cartão...
  defeitoRelatado: string;
  defeitoConstatado?: string;
  checklist: Record<string, boolean>;
  // Financeiro
  pecas: PecaOS[];
  /**
   * Qual dos orçamentos o cliente escolheu. Vazio = ninguém decidiu ainda, e
   * vale o primeiro, que é a sugestão da loja. Ver lib/orcamento.ts.
   */
  opcaoEscolhida?: string;
  maoDeObra: number;
  desconto: number;
  // Fluxo
  status: OSStatus;
  tecnico?: string;
  garantiaDias: number;
  historico: HistoricoOS[];
  observacoes?: string;
  criadoEm: string;
  atualizadoEm: string;
  entregueEm?: string;
  // Aprovação do orçamento pelo cliente (link público)
  aprovadoEm?: string;
  recusadoEm?: string;
  // Assinatura do cliente (imagem em data URL)
  assinaturaCliente?: string;
  // Quando ficou pronta (base para taxa de armazenamento)
  prontaEm?: string;
}

export interface Categoria {
  id: ID;
  nome: string;
  paiId?: ID | null; // null/undefined = classe (nível 1); preenchido = subclasse
  criadoEm: string;
}

export interface Fornecedor {
  id: ID;
  nome: string;
  telefone?: string;
  contato?: string;
  cnpj?: string;
  observacoes?: string;
  criadoEm: string;
}

export interface Produto {
  id: ID;
  nome: string;
  categoria?: string; // texto livre (compatibilidade / exibição)
  categoriaId?: ID; // classe cadastrada
  subcategoriaId?: ID; // subclasse cadastrada
  sku?: string;
  quantidade: number;
  estoqueMinimo: number;
  custo: number; // custo unitário
  preco: number; // preço de venda
  fornecedor?: string; // texto livre (compatibilidade)
  fornecedorId?: ID; // fornecedor cadastrado
  /**
   * Serviço (formatação, instalação, limpeza) em vez de peça física.
   * Não tem estoque: não entra no valor do inventário, nunca aparece como
   * "estoque baixo" e não é descontado quando vendido. Sem isso o
   * atendente digitava 99999999999 na quantidade para o item não ficar
   * vermelho, e o valor do estoque ia para a casa dos trilhões.
   */
  servico?: boolean;
  /** Código de barras — é por ele que o leitor do balcão acha o produto */
  codigoBarras?: string;
  /**
   * Endereço da foto do produto no depósito de imagens.
   *
   * Só o endereço: o arquivo em si engordaria a linha, e "produtos" é lido
   * inteiro em toda carga. Ver lib/imagens.ts.
   */
  imagemUrl?: string;
  /**
   * Vendido por quilo. O campo "preco" passa a ser o preço do QUILO, e a
   * quantidade vendida é fracionária (0,315 kg). Mercearia e açougue.
   */
  porPeso?: boolean;
  /** Vencimento do lote (AAAA-MM-DD). Vira alerta no estoque. */
  validade?: string;
  /**
   * Código curto que este produto tem na balança do balcão.
   *
   * É diferente do código de barras de fábrica: a etiqueta que a balança
   * imprime é única por pacote (traz o peso dentro), e o que se repete entre
   * elas é só este número.
   */
  codigoBalanca?: string;
  criadoEm: string;
}

/**
 * Cotação com fornecedor.
 *
 * Fluxo real do balcão: chega uma OS, a peça não está no estoque. Em vez de
 * cadastrar produto fantasma, o técnico abre uma cotação, o sistema monta a
 * mensagem para o fornecedor já com o último valor pago como referência, e
 * quando a resposta chega ela vira estoque + saída de caixa em um clique.
 */
export type StatusCotacao = "aberta" | "respondida" | "comprada" | "recusada";

export interface ItemCotacao {
  produtoId?: ID; // quando já existe no cadastro
  descricao: string;
  quantidade: number;
  /** Resposta do fornecedor */
  temEstoque?: boolean;
  precoUnit?: number;
  prazoDias?: number;
}

export interface Cotacao {
  id: ID;
  numero: number;
  fornecedorId?: ID;
  osId?: ID; // cotação nascida de uma ordem de serviço
  itens: ItemCotacao[];
  status: StatusCotacao;
  observacoes?: string;
  enviadoEm?: string;
  respondidoEm?: string;
  compradoEm?: string;
  criadoEm: string;
}

/**
 * Histórico de preços.
 * Guarda tanto o que foi COMPRADO quanto o que foi apenas COTADO: um preço
 * que você não aceitou hoje continua sendo referência na próxima negociação.
 * O campo "comprado" separa os dois — sem ele, uma cotação recusada viraria
 * "última compra" e bagunçaria a conta.
 */
export interface PrecoFornecedor {
  id: ID;
  produtoId?: ID;
  descricao: string;
  fornecedorId?: ID;
  preco: number;
  quantidade: number;
  data: string;
  comprado?: boolean;
}

export const COTACAO_STATUS_META: Record<StatusCotacao, { label: string; color: string }> = {
  aberta: { label: "Aguardando resposta", color: "bg-amber-100 text-amber-700" },
  respondida: { label: "Respondida", color: "bg-blue-100 text-blue-700" },
  comprada: { label: "Comprada", color: "bg-emerald-100 text-emerald-700" },
  recusada: { label: "Recusada", color: "bg-slate-100 text-slate-600" },
};

/* ------------------------------------------------------------------ */
/* Contas a pagar e contas fixas                                       */
/* ------------------------------------------------------------------ */

export type Recorrencia = "unica" | "semanal" | "mensal" | "bimestral" | "trimestral" | "anual";

export const RECORRENCIA_META: Record<Recorrencia, { label: string; meses: number; dias: number }> = {
  unica: { label: "Uma vez só", meses: 0, dias: 0 },
  semanal: { label: "Toda semana", meses: 0, dias: 7 },
  mensal: { label: "Todo mês", meses: 1, dias: 0 },
  bimestral: { label: "A cada 2 meses", meses: 2, dias: 0 },
  trimestral: { label: "A cada 3 meses", meses: 3, dias: 0 },
  anual: { label: "Todo ano", meses: 12, dias: 0 },
};

export interface PagamentoConta {
  data: string;
  valor: number;
  formaPagamento: FormaPagamento;
  /** Vencimento a que este pagamento se refere (a conta pode ser paga adiantada ou atrasada) */
  referencia: string;
}

export interface ContaPagar {
  id: ID;
  descricao: string;
  categoria: string;
  valor: number;
  /** Data do próximo vencimento (ISO). Nas recorrentes, avança a cada baixa. */
  vencimento: string;
  recorrencia: Recorrencia;
  fornecedorId?: ID;
  /** Quantos dias antes começa a avisar */
  lembreteDias: number;
  /** Conta desligada continua no histórico, mas para de cobrar */
  ativo: boolean;
  /** Reposição de estoque não é despesa do resultado (mesma regra do caixa) */
  compraEstoque?: boolean;
  pagamentos: PagamentoConta[];
  observacoes?: string;
  criadoEm: string;
}

export const CATEGORIAS_CONTA = [
  "Aluguel",
  "Energia",
  "Água",
  "Internet",
  "Telefone",
  "Salário",
  "Contador",
  "Impostos",
  "Fornecedor",
  "Software / Assinaturas",
  "Marketing",
  "Manutenção",
  "Transporte",
  "Outro",
];

/* ------------------------------------------------------------------ */
/* Objetivos (metas)                                                   */
/* ------------------------------------------------------------------ */

export type TipoMeta = "faturamento" | "lucro" | "os" | "teto_gasto";

export const META_META: Record<TipoMeta, { label: string; descricao: string; dinheiro: boolean; menorEMelhor: boolean }> = {
  faturamento: {
    label: "Faturamento",
    descricao: "Quanto quero receber no período",
    dinheiro: true,
    menorEMelhor: false,
  },
  lucro: {
    label: "Lucro líquido",
    descricao: "Quanto quero que sobre depois de tudo",
    dinheiro: true,
    menorEMelhor: false,
  },
  os: {
    label: "Ordens entregues",
    descricao: "Quantos serviços quero concluir",
    dinheiro: false,
    menorEMelhor: false,
  },
  teto_gasto: {
    label: "Teto de gastos",
    descricao: "Quanto NÃO quero passar de despesas",
    dinheiro: true,
    menorEMelhor: true,
  },
};

export interface Meta {
  id: ID;
  titulo: string;
  tipo: TipoMeta;
  alvo: number;
  periodo: "mensal" | "anual";
  ativo: boolean;
  criadoEm: string;
}

export type TipoMovimento = "entrada" | "saida" | "sangria";
export type FormaPagamento = "dinheiro" | "pix" | "debito" | "credito" | "transferencia" | "outro";

export interface MovimentoCaixa {
  id: ID;
  tipo: TipoMovimento;
  categoria: string; // "OS", "Venda", "Despesa", "Sangria", "Suprimento"...
  descricao: string;
  valor: number;
  formaPagamento: FormaPagamento;
  osId?: ID;
  /** Para quem foi a venda. Sai no recibo que o cliente leva. */
  clienteId?: ID;
  custoRelacionado?: number; // custo das peças para cálculo de lucro
  /**
   * Saída que é COMPRA DE ESTOQUE, não despesa do resultado.
   * Comprar uma peça não é perder dinheiro — é trocar dinheiro por peça. O
   * custo dela só vira resultado quando a peça é vendida (aí entra em
   * custoRelacionado). Sem esta distinção, a mesma peça é descontada duas
   * vezes do lucro.
   */
  compraEstoque?: boolean;
  data: string;
  sessaoId?: ID;
}

/**
 * Venda de balcão (PDV).
 *
 * Existe como registro próprio, e não só como uma linha no caixa, porque
 * numa mercearia o que importa é O QUE saiu, não apenas quanto entrou. Sem
 * os itens não há como saber o que mais vende, reimprimir um cupom nem
 * conferir uma devolução.
 *
 * O dinheiro continua no caixa, num único movimento por venda — é uma venda
 * só, e uma linha por item deixaria o extrato ilegível.
 */
export interface ItemVenda {
  produtoId?: ID;
  descricao: string;
  /** Unidades, ou quilos quando o produto é vendido por peso */
  quantidade: number;
  /** Preço da unidade, ou do quilo */
  precoUnit: number;
  custoUnit: number;
  porPeso?: boolean;
}

export interface Venda {
  id: ID;
  numero: number;
  itens: ItemVenda[];
  desconto: number;
  formaPagamento: FormaPagamento;
  /** Dinheiro entregue pelo cliente, para calcular o troco */
  valorRecebido?: number;
  clienteId?: ID;
  /** Lançamento correspondente no caixa */
  movimentoId?: ID;
  sessaoId?: ID;
  criadoEm: string;
}

export interface SessaoCaixa {
  id: ID;
  abertoEm: string;
  fechadoEm?: string;
  valorAbertura: number;
  /** Saldo que o sistema calculou no fechamento */
  valorFechamento?: number;
  /**
   * Dinheiro realmente contado na gaveta.
   *
   * Sem este campo não existe quebra de caixa: o sistema guardava o valor
   * que ele mesmo calculou e concordava consigo próprio para sempre. A
   * diferença entre contado e esperado é justamente o que se procura na
   * conferência do fim do dia.
   */
  valorContado?: number;
  observacoes?: string;
}

export interface PagamentoFiado {
  data: string;
  valor: number;
  formaPagamento: FormaPagamento;
}

export interface Fiado {
  id: ID;
  clienteId: ID;
  descricao: string;
  osId?: ID;
  valor: number; // valor total devido
  pagamentos: PagamentoFiado[];
  quitado: boolean;
  vencimento?: string;
  criadoEm: string;
}

/**
 * Agenda da loja.
 *
 * Serve para o que não cabe em OS nem em conta a pagar: visita técnica
 * marcada, aniversário de cliente, entrega combinada, reunião com
 * fornecedor. O que separa agenda de lista de tarefas é a HORA — atendimento
 * externo sem horário não serve para nada.
 */
export type TipoEvento =
  | "atendimento"
  | "aniversario"
  | "entrega"
  | "reuniao"
  | "lembrete";

export const TIPO_EVENTO_META: Record<
  TipoEvento,
  { label: string; cor: string; corPonto: string; descricao: string }
> = {
  atendimento: {
    label: "Atendimento externo",
    cor: "bg-blue-100 text-blue-700",
    corPonto: "bg-blue-500",
    descricao: "Visita na casa ou na empresa do cliente",
  },
  entrega: {
    label: "Entrega",
    cor: "bg-emerald-100 text-emerald-700",
    corPonto: "bg-emerald-500",
    descricao: "Levar ou buscar aparelho combinado",
  },
  aniversario: {
    label: "Aniversário",
    cor: "bg-pink-100 text-pink-700",
    corPonto: "bg-pink-500",
    descricao: "Data do cliente, para mandar uma mensagem",
  },
  reuniao: {
    label: "Reunião",
    cor: "bg-violet-100 text-violet-700",
    corPonto: "bg-violet-500",
    descricao: "Fornecedor, contador, parceria",
  },
  lembrete: {
    label: "Lembrete",
    cor: "bg-amber-100 text-amber-700",
    corPonto: "bg-amber-500",
    descricao: "Qualquer coisa que não pode ser esquecida",
  },
};

/** Com que frequência o evento se repete */
export type RepetirEvento = "nenhuma" | "semanal" | "mensal" | "anual";

export const REPETIR_META: Record<RepetirEvento, { label: string }> = {
  nenhuma: { label: "Não repete" },
  semanal: { label: "Toda semana" },
  mensal: { label: "Todo mês" },
  anual: { label: "Todo ano" },
};

export interface Evento {
  id: ID;
  titulo: string;
  tipo: TipoEvento;
  /** AAAA-MM-DD. Sem hora aqui: fuso já estragou data demais neste sistema. */
  data: string;
  /** HH:MM. Vazio = o dia todo. */
  hora?: string;
  clienteId?: ID;
  local?: string;
  observacoes?: string;
  repetir?: RepetirEvento;
  /** Quantos dias antes começar a avisar. 0 = só no dia. */
  avisarDiasAntes?: number;
  concluido?: boolean;
  criadoEm: string;
}

export interface Config {
  nomeLoja: string;
  /**
   * Logo da loja, no cabeçalho do recibo impresso e da página do cliente.
   * Só o endereço da imagem. Ver lib/imagens.ts.
   */
  logoUrl?: string;
  /**
   * Ramo de atividade da loja. Decide o vocabulário das telas e quais
   * módulos aparecem. Ausente = assistência técnica, que é como o sistema
   * nasceu — nenhuma loja existente pode acordar diferente de ontem.
   */
  ramo?: Ramo;
  telefoneLoja: string;
  enderecoLoja: string;
  cnpj: string;
  senhaAcesso: string; // login único
  supabaseUrl?: string;
  supabaseKey?: string;
  // Aparência
  tema?: "auto" | "claro" | "escuro";
  corDestaque?: string; // chave em ACCENTS (azul, esmeralda, ...)
  comissaoPadrao?: number; // % de comissão padrão por técnico
  // Termos do recibo (guarda/abandono)
  taxaArmazenamentoDia?: number; // R$/dia após a conclusão
  diasAbandono?: number; // prazo legal para retirada antes de venda/descarte
  /**
   * Apaga senha, padrão e conta do aparelho quando a OS é entregue.
   * Guardar senha de cliente depois que o aparelho saiu da loja é risco puro,
   * sem nenhuma utilidade. Ligado por padrão.
   */
  limparSenhaNaEntrega?: boolean;
  /**
   * Link para o cliente avaliar a loja (Google, por exemplo).
   *
   * Entra na mensagem de entrega e no recibo. Só na ENTREGA: pedir estrela
   * antes de o serviço terminar é pedir no pior momento possível, e uma
   * avaliação ruim colhida no meio do caminho fica lá para sempre.
   */
  linkAvaliacao?: string;
  /**
   * Como a balança do balcão grava a etiqueta: peso em gramas ou preço em
   * centavos. As duas existem no mercado e a sequência de dígitos é a mesma
   * — ler no formato errado não dá erro, dá um número plausível e errado.
   */
  formatoBalanca?: FormatoBalanca;
}
