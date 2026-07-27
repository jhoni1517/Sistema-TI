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

export interface Cliente {
  id: ID;
  nome: string;
  telefone: string;
  cpf?: string;
  email?: string;
  endereco?: string;
  observacoes?: string;
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
