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
  criadoEm: string;
}

export interface PecaOS {
  produtoId?: ID;
  descricao: string;
  quantidade: number;
  custoUnit: number; // custo para a loja
  precoUnit: number; // preço cobrado do cliente
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

export interface SessaoCaixa {
  id: ID;
  abertoEm: string;
  fechadoEm?: string;
  valorAbertura: number;
  valorFechamento?: number;
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

export interface Config {
  nomeLoja: string;
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
}
