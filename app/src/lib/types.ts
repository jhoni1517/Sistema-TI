import type { Ramo } from "./ramos";
import type { FormatoBalanca } from "./balanca";
import type { RegraMeioAMeio } from "./pizza";
import type { RegimeTributario } from "./fiscal";

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

/**
 * Como cada etapa da OS se apresenta.
 *
 * São três textos e duas cores porque são três públicos diferentes:
 *
 * - `label` é o nome curto de dentro da loja, para caber em lista e filtro.
 * - `destaque` é o mesmo estado dito para o CLIENTE, e é o que vai grande no
 *   rastreio e sozinho no parágrafo do WhatsApp. "Pronta" não diz nada a quem
 *   está do outro lado; "Pronta para retirada" diz o que ele faz agora.
 * - `cliente` explica em uma frase, embaixo do destaque.
 *
 * `color` é o crachá pálido das listas — dez linhas de cor cheia viram um
 * borrão e nada mais salta. `forte` é o oposto: cor cheia para quando a
 * situação está sozinha na tela e é o que a pessoa foi ali ver. Os tons são
 * 600 de propósito: branco por cima de 500 não tem contraste suficiente nem
 * para letra grande.
 */
export const OS_STATUS_META: Record<
  OSStatus,
  { label: string; destaque: string; color: string; forte: string; cliente: string }
> = {
  aberta: { label: "Aberta", destaque: "Aparelho recebido", color: "bg-slate-100 text-slate-700", forte: "bg-slate-600 text-white", cliente: "Recebemos seu aparelho e vamos analisá-lo." },
  em_analise: { label: "Em análise", destaque: "Em análise", color: "bg-blue-100 text-blue-700", forte: "bg-blue-600 text-white", cliente: "Estamos avaliando o que o aparelho tem." },
  aguardando_aprovacao: { label: "Aguardando aprovação", destaque: "Aguardando sua aprovação", color: "bg-amber-100 text-amber-700", forte: "bg-amber-600 text-white", cliente: "O orçamento está pronto. Precisamos do seu OK para começar." },
  aprovada: { label: "Aprovada", destaque: "Orçamento aprovado", color: "bg-indigo-100 text-indigo-700", forte: "bg-indigo-600 text-white", cliente: "Orçamento aprovado. Vamos iniciar o reparo." },
  em_reparo: { label: "Em reparo", destaque: "Em reparo", color: "bg-purple-100 text-purple-700", forte: "bg-purple-600 text-white", cliente: "Estamos trabalhando no seu aparelho." },
  aguardando_peca: { label: "Aguardando peça", destaque: "Aguardando peça", color: "bg-orange-100 text-orange-700", forte: "bg-orange-600 text-white", cliente: "Aguardando a chegada de uma peça para continuar." },
  pronta: { label: "Pronta", destaque: "Pronta para retirada", color: "bg-emerald-100 text-emerald-700", forte: "bg-emerald-600 text-white", cliente: "Pode vir buscar dentro do nosso horário de atendimento." },
  entregue: { label: "Entregue", destaque: "Aparelho entregue", color: "bg-teal-100 text-teal-700", forte: "bg-teal-600 text-white", cliente: "Obrigado pela preferência!" },
  cancelada: { label: "Cancelada", destaque: "Serviço cancelado", color: "bg-red-100 text-red-700", forte: "bg-red-600 text-white", cliente: "O aparelho está disponível para retirada." },
};

/**
 * Backup dos dados do cliente.
 *
 * Formatação e troca de SSD apagam tudo, e apagar não tem desfazer. O que a
 * loja combinou com o cliente vivia solto no meio do texto do defeito —
 * "extremamente lento, não precisa backup" — onde some assim que alguém
 * escreve mais uma linha. Como campo, ele fica na cara de quem vai
 * formatar e sai impresso no papel que o cliente assina.
 *
 * "pendente" é o estado de propósito INCÔMODO: enquanto ninguém decidir,
 * o sistema cobra antes de deixar a OS ficar pronta.
 */
export type BackupOS = "pendente" | "nao_precisa" | "a_fazer" | "feito";

export const BACKUP_META: Record<
  BackupOS,
  { label: string; cor: string; curto: string }
> = {
  pendente: {
    label: "Ainda não perguntei",
    cor: "bg-amber-100 text-amber-700",
    curto: "a definir",
  },
  nao_precisa: {
    label: "Cliente dispensou o backup",
    cor: "bg-slate-100 text-slate-600",
    curto: "dispensado pelo cliente",
  },
  a_fazer: {
    label: "Fazer backup antes",
    cor: "bg-red-100 text-red-700",
    curto: "a fazer",
  },
  feito: {
    label: "Backup feito",
    cor: "bg-emerald-100 text-emerald-700",
    curto: "feito",
  },
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
  /**
   * Teto do fiado deste cliente. Vazio = sem teto.
   *
   * "Fio pra você" é decisão de dono, tomada uma vez. Sem o teto no sistema,
   * ela virava decisão do atendente, no balcão, sob pressão da fila.
   */
  limiteFiado?: number;
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
  /**
   * Segredo do link público, sorteado pelo BANCO.
   *
   * O número da OS é sequencial porque precisa ser lido no balcão — então
   * ele não serve de senha. Sem este segredo, quem recebia um link de
   * rastreio trocava o número e lia (ou cancelava) a fila inteira da loja.
   * A tela nunca gera: caminho montado no navegador não protege nada.
   */
  rastreio?: string;
  /**
   * O que foi combinado sobre o backup dos dados.
   *
   * Formatação e troca de SSD apagam tudo, e apagar não tem desfazer.
   * Antes isto ficava solto no texto do defeito, onde some na linha
   * seguinte. Ausente = OS antiga, tratada como "pendente".
   */
  backup?: BackupOS;
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
  /**
   * Fotos do aparelho na ENTRADA, com o endereço no depósito de imagens.
   *
   * O checklist diz "tela sem trincos"; a foto mostra o trinco que já estava
   * lá. Sem ela, a discussão na retirada é a palavra do cliente contra a do
   * técnico, e quem perde é sempre a loja.
   */
  fotos?: string[];
  /**
   * Fotos do LAUDO — as únicas que o cliente vê.
   *
   * "A placa está queimada" é uma frase que o cliente tem que acreditar. A
   * foto de perto da trilha queimada é a mesma frase sem precisar de fé, e é
   * a diferença entre aprovar o orçamento e achar que está sendo enrolado.
   *
   * ------------------------------------------------------------
   * POR QUE NÃO SÃO AS MESMAS FOTOS DA ENTRADA
   *
   * As de `fotos` são prova da loja: o trinco que já estava lá quando o
   * aparelho chegou. Elas existem justamente para a discussão da retirada, e
   * pegam a tela ligada, a tela de bloqueio, o que estiver aberto no
   * aparelho. Mandar tudo para uma página pública seria publicar a tela do
   * celular do cliente sem ele pedir.
   *
   * Duas listas separadas fazem a escolha ser um ato: a foto só chega ao
   * cliente porque alguém a colocou no lugar que diz, com todas as letras,
   * que ela vai para o cliente.
   * ------------------------------------------------------------
   */
  fotosLaudo?: string[];
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
  /*
   * ---------- Nota fiscal ----------
   *
   * Sem estes campos nenhum emissor do mundo emite: eles são o que a SEFAZ
   * exige de cada item. Só o NCM é por produto de verdade — ele muda de
   * mercadoria para mercadoria e não tem padrão possível. Os outros três
   * caem no padrão da loja quando vazios (ver lib/fiscal.ts), porque
   * obrigar a digitar CFOP em duzentos produtos é o caminho para ninguém
   * preencher nenhum.
   */
  /** NCM, 8 dígitos. É ele que diz à Receita o que a mercadoria é. */
  ncm?: string;
  /** CFOP. Vazio = o padrão da loja. NFC-e é sempre 5xxx (dentro do estado). */
  cfop?: string;
  /** CSOSN (3 dígitos), usado quando a loja é do Simples Nacional */
  csosn?: string;
  /** CST (2 dígitos), usado fora do Simples */
  cst?: string;
  /** Origem da mercadoria, 0 a 8. Vazio = o padrão da loja (0, nacional). */
  origem?: string;
  /** Unidade que vai na nota: UN, KG, CX. Vazio = KG por peso, UN no resto. */
  unidadeTributavel?: string;
  /** CEST, só para mercadoria com substituição tributária */
  cest?: string;
  /*
   * ---------- Nota de SERVIÇO (NFS-e) ----------
   *
   * Valem só para produto marcado como `servico`. São outro documento e
   * outro imposto: NFS-e é municipal (ISS), NFC-e é estadual (ICMS). Um
   * serviço não tem NCM nem CFOP — cobrar isso dele trava a emissão para
   * sempre, porque o número não existe.
   */
  /** Código da lista de serviços (LC 116). Quem informa é o contador. */
  codigoServico?: string;
  /** Alíquota de ISS em %. No Simples costuma ir zerada. */
  aliquotaIss?: number;
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
   * Promoção com prazo. O preço cheio continua em `preco` e volta sozinho
   * quando o prazo acaba — promover editando o preço na mão dava certo até
   * a hora de destrocar, que ninguém lembrava. Ver lib/promocao.ts.
   */
  precoPromocional?: number;
  promocaoInicio?: string;
  promocaoFim?: string;
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

export type Recorrencia =
  | "unica"
  | "semanal"
  | "mensal"
  | "bimestral"
  | "trimestral"
  | "semestral"
  | "anual";

export const RECORRENCIA_META: Record<Recorrencia, { label: string; meses: number; dias: number }> = {
  unica: { label: "Uma vez só", meses: 0, dias: 0 },
  semanal: { label: "Toda semana", meses: 0, dias: 7 },
  mensal: { label: "Todo mês", meses: 1, dias: 0 },
  bimestral: { label: "A cada 2 meses", meses: 2, dias: 0 },
  trimestral: { label: "A cada 3 meses", meses: 3, dias: 0 },
  // IPTU, alvará e seguro costumam ser de seis em seis meses. Sem esta
  // opção a conta era cadastrada como trimestral e cobrava o dobro de
  // vezes, ou como anual e sumia por meio ano.
  semestral: { label: "A cada 6 meses", meses: 6, dias: 0 },
  anual: { label: "Todo ano", meses: 12, dias: 0 },
};

export interface PagamentoConta {
  data: string;
  valor: number;
  formaPagamento: FormaPagamento;
  /** Vencimento a que este pagamento se refere (a conta pode ser paga adiantada ou atrasada) */
  referencia: string;
}

/**
 * A conta é para PAGAR ou para RECEBER?
 *
 * Salário, aposentadoria, aluguel que a pessoa recebe, mensalidade de
 * cliente fixo: tudo isso é o espelho exato de uma conta a pagar — mesma
 * recorrência, mesmo histórico, e principalmente a MESMA conta de
 * vencimento, que é a parte difícil e que já custou caro para acertar (dia
 * 31, 29 de fevereiro, virada de ano).
 *
 * Por isso é um campo aqui e não uma tela nova: tela nova duplicaria a regra
 * do vencimento, e regra escrita em dois lugares envelhece em um deles.
 *
 * Ausente = "pagar". É o que toda conta cadastrada antes deste campo é, e
 * ler ausente como "receber" viraria despesa em receita da noite para o dia.
 */
export type TipoConta = "pagar" | "receber";

export const TIPO_CONTA_META: Record<TipoConta, { label: string; verbo: string }> = {
  pagar: { label: "A pagar", verbo: "Pagar" },
  receber: { label: "A receber", verbo: "Recebi" },
};

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
  /**
   * Pagar (padrão) ou receber. Ver TipoConta.
   *
   * OPCIONAL DE PROPÓSITO: as contas que já existem no banco não têm o
   * campo, e todas elas são "pagar".
   */
  tipo?: TipoConta;
  /** Reposição de estoque não é despesa do resultado (mesma regra do caixa) */
  compraEstoque?: boolean;
  /**
   * Esta conta é o pagamento da FATURA do cartão?
   *
   * Cada compra no crédito já é despesa quando acontece. Se a fatura também
   * contasse, o mês somaria tudo duas vezes e mostraria um prejuízo que não
   * existiu. Mesma regra da compra de estoque: sai do caixa, não entra no
   * resultado.
   */
  faturaCartao?: boolean;
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

/**
 * De onde vem o dinheiro que ENTRA todo mês.
 *
 * Lista separada da de despesa de propósito: quem recebe salário e auxílio
 * não tem nada a ver com "Energia" e "Fornecedor", e uma lista com trinta
 * itens dos quais vinte não servem é uma lista que ninguém lê até o fim.
 *
 * "Auxílio / Benefício" cobre Bolsa Família, BPC, seguro-desemprego e o que
 * mais aparecer. Não vale separar um a um: programa de governo troca de nome
 * e de regra a cada governo, e uma lista fixa no código envelheceria — o
 * campo de descrição diz qual é.
 */
export const CATEGORIAS_RENDA = [
  "Salário",
  "Auxílio / Benefício",
  "Aposentadoria",
  "Pensão",
  "Aluguel recebido",
  "Mensalidade de cliente",
  "Freelance / Bico fixo",
  "Rendimento de investimento",
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
/**
 * Como o dinheiro entrou ou saiu.
 *
 * Vale-refeição e vale-alimentação são DOIS de propósito, e não um "vale"
 * só: na nota fiscal eles têm códigos diferentes (11 e 10), e mandar o
 * errado é erro fiscal. Fora isso, um restaurante recebe VR e um mercado
 * recebe VA — quem confunde os dois na hora de conferir a maquininha
 * procura o dinheiro no lugar errado.
 */
export type FormaPagamento =
  | "dinheiro"
  | "pix"
  | "debito"
  | "credito"
  | "vale_refeicao"
  | "vale_alimentacao"
  | "transferencia"
  | "outro";

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
  /** Pagamento da fatura do cartão: sai do caixa, mas não é despesa nova */
  faturaCartao?: boolean;
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
  /**
   * Sabores de uma pizza montada, na ordem em que foram escolhidos.
   *
   * A ordem importa: é ela que diz de que lado cada sabor vai, e a cozinha
   * monta por ela. O preço da linha já vem resolvido em `precoUnit` pela
   * regra da loja (ver lib/pizza.ts) — guardar os sabores é para o cupom, a
   * cozinha e a conferência depois.
   *
   * Mora dentro de `Venda.itens`, que é uma coluna JSON: campo aqui não
   * pede coluna nova.
   */
  sabores?: { nome: string; preco: number }[];
  /**
   * Recado do cliente para quem prepara: "sem cebola", "bem passado".
   *
   * É por item e não por pedido: numa mesa de quatro, o "sem cebola" é de
   * uma pessoa só, e um recado no pedido inteiro faz a cozinha errar as
   * outras três.
   */
  observacao?: string;
  /**
   * Esta linha é a taxa de serviço da mesa, não uma mercadoria.
   *
   * Existe por causa da conferência da nota: sem produtoId, a taxa era
   * apontada como "item avulso não tem cadastro, e nota exige NCM" — e a
   * saída sugerida era cadastrar um produto chamado "Taxa de servico", que é
   * conselho errado. Gorjeta não é mercadoria, não tem NCM e não desce do
   * estoque.
   *
   * Mora dentro de `Venda.itens`, que é uma coluna JSON: campo aqui não pede
   * coluna nova.
   */
  taxaServico?: boolean;
  /** Unidades, ou quilos quando o produto é vendido por peso */
  quantidade: number;
  /** Preço da unidade, ou do quilo */
  precoUnit: number;
  custoUnit: number;
  porPeso?: boolean;
}

/**
 * Em que pé está o preparo de um item da comanda.
 *
 * "entregue" é diferente de "pronto": pronto é a cozinha dizendo que
 * terminou, entregue é o salão dizendo que levou. Juntar os dois esconde a
 * comida esfriando no balcão de passagem, que é onde ela esfria de verdade.
 */
export type PreparoItem = "pendente" | "preparando" | "pronto" | "entregue";

/**
 * Um item dentro da comanda.
 *
 * É o item da venda mais o que a cozinha precisa: um id próprio (a fila
 * trabalha item a item, não por linha de carrinho), a etapa de preparo e a
 * hora do pedido, que é o relógio do atraso.
 */
export interface ItemComanda extends ItemVenda {
  id: ID;
  preparo?: PreparoItem;
  /** Quando o item foi pedido. É daqui que sai o tempo de espera. */
  pedidoEm: string;
  prontoEm?: string;
  /**
   * Cancelado NÃO é apagado. A linha fica para a cozinha saber que aquilo
   * chegou a ser pedido — e, se ela já tinha começado, que o prato volta.
   */
  cancelado?: boolean;
  motivoCancelamento?: string;
}

/**
 * Comanda de mesa: um pedido que fica aberto recebendo itens.
 *
 * Não é dinheiro enquanto está aberta. Fechar é que gera a venda e o
 * movimento no caixa — lançar a cada item faria o fechamento do dia contar
 * a mesa 5 seis vezes. Ver lib/comanda.ts.
 */
export interface Comanda {
  id: ID;
  numero: number;
  /**
   * Texto livre: "5", "Balcão", "Viagem". Restaurante de bairro não tem
   * mesa numerada em cadastro, e obrigar um cadastro de mesas seria uma
   * tela a mais que ninguém preenche.
   */
  mesa: string;
  itens: ItemComanda[];
  status: "aberta" | "fechada" | "cancelada";
  abertaEm: string;
  fechadaEm?: string;
  /** A venda gerada no fechamento. É por ela que se chega ao caixa. */
  vendaId?: ID;
  clienteId?: ID;
  /** Quem está atendendo a mesa */
  garcom?: string;
  observacoes?: string;
  /**
   * Comanda de mesa ou pedido de entrega.
   *
   * São a MESMA coisa por dentro, e isso é decisão, não preguiça: uma conta
   * aberta que recebe itens, manda para a cozinha e no fim vira venda,
   * movimento no caixa e baixa de estoque. Escrever um `Pedido` separado
   * duplicaria esse caminho inteiro — o mesmo caminho que já foi revisado e
   * testado duas vezes — e as duas cópias envelheceriam em ritmos
   * diferentes.
   *
   * O que a entrega tem a mais são CAMPOS: endereço, taxa, entregador,
   * troco. Pela régua de ramos.ts, isso é recurso, não módulo novo por
   * dentro. A tela é que é separada, porque a rotina do salão e a da moto
   * não se parecem em nada.
   *
   * Vazio é "mesa": é assim que voltam as comandas gravadas antes de a
   * entrega existir.
   */
  tipo?: "mesa" | "entrega";
  /** Para onde vai. Texto livre, como a mesa — endereço de bairro não cabe em campo. */
  endereco?: string;
  /**
   * O telefone de quem pediu.
   *
   * Não é opcional na prática: é para ele que o entregador liga quando não
   * acha o portão, e é a única coisa que salva um pedido perdido.
   */
  telefone?: string;
  /** Quanto a casa cobra para levar */
  taxaEntrega?: number;
  /** Quem levou. Texto livre: entregador de bairro não tem cadastro. */
  entregador?: string;
  /**
   * "Tem troco para 50?" — a pergunta que define se o pedido dá certo.
   *
   * Sem ela o entregador sai com a bolsa cheia e sem trocado, e volta com o
   * pedido ou com a conta errada. Guardar o valor é o que faz a pergunta
   * existir na tela.
   */
  trocoPara?: number;
  /** Quando saiu para a rua. É daqui que sai o relógio da entrega. */
  saiuEm?: string;
  /**
   * A gorjeta, em porcentagem do consumo. Fica na comanda e não só na
   * configuração porque o cliente pode recusar, e a mesa que recusou tem
   * que continuar recusando quando a tela recarregar.
   */
  taxaServico?: number;
  /** Abatimento em reais, combinado no salão */
  desconto?: number;
  atualizadoEm?: string;
}

export interface Venda {
  id: ID;
  numero: number;
  itens: ItemVenda[];
  desconto: number;
  formaPagamento: FormaPagamento;
  /** Dinheiro entregue pelo cliente, para calcular o troco */
  valorRecebido?: number;
  /**
   * Venda dividida em mais de uma forma ("50 no cartão e o resto em
   * dinheiro"). Quando existe, `formaPagamento` guarda a de MAIOR valor, só
   * para as telas de uma linha só. Ver lib/pagamento.ts.
   */
  pagamentos?: { forma: FormaPagamento; valor: number; recebido?: number }[];
  clienteId?: ID;
  /** Lançamento correspondente no caixa */
  movimentoId?: ID;
  sessaoId?: ID;
  /**
   * Devoluções já feitas desta venda. Ficam na própria venda para que
   * "quanto ainda pode voltar" seja uma conta e não um palpite.
   * Ver lib/devolucao.ts.
   */
  devolucoes?: DevolucaoVenda[];
  criadoEm: string;
}

/** Uma devolução: o que voltou, quanto saiu do caixa e por quê */
export interface DevolucaoVenda {
  id: ID;
  data: string;
  /** Quantidade devolvida por índice do item na venda */
  itens: Record<number, number>;
  valor: number;
  motivo?: string;
  /** Lançamento de saída no caixa */
  movimentoId?: ID;
}

/**
 * Interface PRÓPRIA, e não objeto aninhado dentro de SessaoCaixa.
 *
 * O `esquema.test.ts` lê os tipos linha a linha procurando `campo:` para
 * cobrar a coluna no banco, e não distingue nível de aninhamento: declarado
 * lá dentro, ele exigia oito colunas novas em `sessoes` que não existem —
 * tudo isto mora num jsonb só.
 */
export interface TotaisFechamento {
  abertura: number;
  entradas: number;
  saidas: number;
  sangrias: number;
  saldo: number;
  emEspecie: number;
  quantidade: number;
  porForma: Record<string, number>;
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
  /**
   * OS NÚMEROS CONGELADOS NO FECHAMENTO.
   *
   * O histórico recalculava tudo a partir dos movimentos, a cada vez que a
   * tela abria. Então mexer num lançamento antigo — corrigir um valor,
   * apagar uma saída, lançar com data retroativa — mudava RETROATIVAMENTE a
   * conferência de um dia que o operador já tinha contado e assinado.
   *
   * A diferença de ontem passava a mostrar um valor que não existia ontem, e
   * quem procurasse o erro procuraria dinheiro que nunca faltou.
   *
   * O risco cresceu quando o lançamento manual ganhou campo de data: agora
   * dá para lançar hoje uma saída de semana passada.
   *
   * Sessão fechada antes deste campo existir fica sem ele e continua sendo
   * recalculada — é o melhor que dá para fazer com o histórico que já existe.
   */
  totaisFechamento?: TotaisFechamento;
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

/**
 * Tarefa do checklist diário.
 *
 * Não é agenda e não é conta a pagar. A agenda guarda compromisso com data
 * — "dia 14, buscar o notebook do Fulano". Isto é o que se repete sem data
 * nenhuma: beber água, conferir a bancada, passar no fornecedor às duas.
 */
export interface TarefaDiaria {
  id: string;
  titulo: string;
  /** "HH:MM". Vazio = vale para o dia todo, sem hora para cobrar. */
  horario?: string;
  /** Dias da semana (0 = domingo). Vazio = todo dia. */
  dias?: number[];
  /**
   * Datas AAAA-MM-DD em que foi cumprida.
   *
   * Uma bandeira `feito` obrigaria a desmarcar tudo toda manhã, e ninguém
   * faz isso: no terceiro dia a lista está toda marcada e não diz mais
   * nada. Guardando os dias, ela nasce limpa sozinha. Podada em 90 dias,
   * porque a tabela é lida inteira a cada carga.
   */
  feitoEm?: string[];
  /** Manda lembrete no Telegram no horário marcado */
  avisar?: boolean;
  /** Último dia em que o robô já mandou, para não repetir o mesmo aviso */
  avisadoEm?: string;
  ativo?: boolean;
  criadoEm: string;
  atualizadoEm?: string;
}

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
   * Largura do papel da impressora: "a4", "58" ou "80" (bobina térmica).
   * O recibo saía sempre em A4 e a bobina cortava a metade direita de tudo,
   * inclusive do total.
   */
  papelImpressao?: "a4" | "58" | "80";
  /**
   * Quanto pode ficar em espécie na gaveta antes do sistema sugerir sangria.
   * Vazio = sem aviso. Não é sobre desconfiar de ninguém: é sobre quanto se
   * perde num assalto, e sobre a gaveta não virar o cofre da loja.
   */
  limiteGaveta?: number;
  /**
   * Chat do Telegram DESTA loja, para onde vão os avisos diários de contas
   * a pagar, agenda, aniversário e fiado vencido.
   *
   * Existe porque a rotina diária mandava tudo para um chat só, o do
   * operador do sistema: nome e dívida de cliente de uma loja iam parar no
   * celular de outra pessoa, e o dono que precisava do lembrete não recebia
   * nada. Vazio = esta loja não recebe aviso nenhum, e nada dela sai.
   */
  telegramChatId?: string;
  /**
   * Ramo de atividade da loja. Decide o vocabulário das telas e quais
   * módulos aparecem. Ausente = assistência técnica, que é como o sistema
   * nasceu — nenhuma loja existente pode acordar diferente de ontem.
   */
  ramo?: Ramo;
  telefoneLoja: string;
  enderecoLoja: string;
  /**
   * Horário de atendimento, texto livre: "Seg a Sex, 9h as 18h. Sab ate 13h".
   *
   * A mensagem de aparelho pronto mandava "pode retirar dentro do nosso
   * horário de atendimento" sem nunca dizer qual é — e sem o endereço e sem o
   * telefone, na mensagem que existe justamente para trazer o cliente até o
   * balcão. Texto livre porque loja de bairro não tem grade: fecha para o
   * almoço, abre sábado até uma hora, emenda feriado.
   */
  horarioAtendimento?: string;
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
  /**
   * Como a casa cobra a pizza de mais de um sabor: "maior" ou "media".
   *
   * É escolha da loja porque é dinheiro, e cada casa faz de um jeito. Sem
   * escolha vale o sabor mais caro, que é o mais usado no Brasil — um
   * padrão que cobrasse menos tiraria dinheiro da loja em silêncio.
   * Ver lib/pizza.ts.
   */
  regraMeioAMeio?: RegraMeioAMeio;
  /**
   * A taxa de serviço que já vem marcada ao abrir a conta, em porcentagem.
   *
   * Zero (ou vazio) significa que a casa não cobra. Fica em Configurações e
   * não escrita no código porque nem toda casa cobra os 10%, e a que cobra
   * não quer digitar isso em toda mesa. Ver lib/comanda.ts.
   */
  taxaServicoPadrao?: number;
  /**
   * A taxa de entrega que já vem preenchida ao abrir um pedido.
   *
   * Uma casa de bairro cobra o mesmo para o bairro inteiro; quem cobra por
   * distância corrige no próprio pedido. Zero significa entrega de graça.
   */
  taxaEntregaPadrao?: number;
  /*
   * ---------- Nota fiscal ----------
   *
   * NENHUMA CREDENCIAL AQUI. O CSC da SEFAZ e o token do intermediário são
   * segredos, e `configuracoes` sobe para a nuvem, entra no backup e sai no
   * arquivo de exportação — que circula por WhatsApp e e-mail. Um token
   * aqui é um token queimado. Ver o cabeçalho de lib/fiscal.ts.
   */
  /** Inscrição Estadual da loja. Sem ela não sai nota. */
  inscricaoEstadual?: string;
  /** Simples, Simples com excesso de sublimite, ou regime normal */
  regimeTributario?: RegimeTributario;
  /** CFOP que vale para o produto que não tem o dele. 5102 na maioria. */
  cfopPadrao?: string;
  /** CSOSN padrão (Simples). 102 na maioria. */
  csosnPadrao?: string;
  /** CST padrão (fora do Simples) */
  cstPadrao?: string;
  /** Origem padrão da mercadoria. 0 = nacional. */
  origemPadrao?: string;
  /** CNAE principal da loja, exigido no cadastro do emissor */
  cnae?: string;
  /**
   * A natureza da operação que sai na nota. Vazio = "Venda ao consumidor",
   * que é o que vale para toda NFC-e de balcão.
   */
  naturezaOperacao?: string;
  /**
   * Inscrição Municipal — o registro da loja na PREFEITURA.
   *
   * É outra coisa que a Inscrição Estadual: a estadual serve para a nota de
   * mercadoria (ICMS), esta serve para a de serviço (ISS). Uma assistência
   * técnica precisa das duas, porque vende peça e cobra mão de obra.
   */
  inscricaoMunicipal?: string;
  /*
   * Endereço PARTIDO em campos, só para a nota.
   *
   * `enderecoLoja` continua sendo a linha única que sai no recibo e na
   * mensagem do cliente. A nota precisa dos campos separados, e partir a
   * linha depois não é confiável: "Rua 15 de Novembro, 1500" tem número no
   * nome da rua. São dois usos diferentes, e por isso dois lugares.
   */
  nfLogradouro?: string;
  nfNumero?: string;
  nfComplemento?: string;
  nfBairro?: string;
  nfCep?: string;
  nfMunicipio?: string;
  /** Código IBGE do município, 7 dígitos. São José dos Pinhais é 4125506. */
  nfCodigoIbge?: string;
  nfUf?: string;
}
