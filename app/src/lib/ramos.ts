/**
 * Ramos de atividade.
 *
 * O sistema nasceu para assistência técnica, mas quase tudo que ele faz —
 * caixa, estoque, clientes, fiado, contas a pagar, agenda, relatórios,
 * assinatura — é igual em mercearia, pizzaria e loja de bebidas. O que muda
 * de verdade é o VOCABULÁRIO e QUAIS MÓDULOS aparecem.
 *
 * Por que um sistema só, e não um repositório por nicho: quem mantém isso é
 * uma pessoa. Com quatro cópias, o bug que fazia a venda sumir em silêncio
 * seria consertado quatro vezes — e a terceira seria esquecida. Aqui
 * conserta-se uma vez e todas as lojas recebem.
 *
 * ---------------------------------------------------------------------
 * A REGRA QUE SEGURA ISTO DE PÉ: módulo é TELA, recurso é CAMPO.
 *
 * Módulo custa caro: é uma tela nova para escrever, testar e manter, e ela
 * precisa funcionar em qualquer combinação com as outras. Recurso custa
 * quase nada: é um campo a mais numa tela que já existe.
 *
 * IMEI, garantia, peso e validade parecem módulos e não são — são campos.
 * Tratá-los como módulo multiplicaria as combinações a testar sem entregar
 * nada em troca. Quando bater a dúvida: se não tem endereço próprio no
 * menu, é recurso.
 * ---------------------------------------------------------------------
 */

export type Ramo = "assistencia" | "mercearia" | "pizzaria" | "bebidas";

/**
 * Telas que aparecem ou não conforme o ramo.
 *
 * O que NÃO está aqui é core e vale para todo mundo: caixa, estoque,
 * clientes, fiado, contas a pagar, agenda, relatórios, configurações e
 * assinatura. Módulo que todo mundo usa não precisa de interruptor.
 */
export type Modulo =
  | "os" // ordem de serviço: aparelho, laudo, aprovação de orçamento
  | "rastreio" // página pública de acompanhamento do conserto
  | "pdv" // venda rápida de balcão, sem abrir cadastro
  | "delivery" // entrega: endereço, taxa, entregador e fechamento dele
  | "mesas" // comanda aberta por mesa
  | "producao"; // fila de preparo para a cozinha

/**
 * Campos e regras dentro de telas que já existem.
 *
 * Ligar um destes é acrescentar um campo, não construir uma tela. Por isso
 * são baratos e podem ser combinados à vontade.
 */
export type Recurso =
  | "imei" // número de série do aparelho, na OS
  | "garantia" // prazo de garantia impresso no comprovante
  | "peso" // produto vendido por quilo, com preço por kg
  | "validade" // data de vencimento no estoque, com alerta
  | "idadeMinima"; // venda proibida para menores (bebida alcoólica)

/**
 * As palavras que a tela usa.
 *
 * "Ordem de serviço" em pizzaria é ridículo e "pedido" em assistência é
 * impreciso. Trocar a palavra é barato e muda como a loja enxerga o sistema.
 */
export interface Vocabulario {
  /** O documento central: OS, pedido, venda */
  ordem: string;
  ordemPlural: string;
  /** Versão curta, para caber em cartão e botão */
  ordemCurta: string;
  /** O que se vende: peça, produto, item */
  item: string;
  itemPlural: string;
}

export interface RamoMeta {
  label: string;
  descricao: string;
  vocabulario: Vocabulario;
  modulos: Modulo[];
  recursos: Recurso[];
}

const VENDA: Vocabulario = {
  ordem: "Venda",
  ordemPlural: "Vendas",
  ordemCurta: "Venda",
  item: "Produto",
  itemPlural: "Produtos",
};

export const RAMO_META: Record<Ramo, RamoMeta> = {
  assistencia: {
    label: "Assistência técnica",
    descricao: "Informática e celulares: conserto com laudo e acompanhamento",
    vocabulario: {
      ordem: "Ordem de Serviço",
      ordemPlural: "Ordens de Serviço",
      ordemCurta: "OS",
      item: "Peça",
      itemPlural: "Peças",
    },
    modulos: ["os", "rastreio"],
    recursos: ["imei", "garantia"],
  },
  mercearia: {
    label: "Mercearia / mercado",
    descricao: "Balcão rápido, produto por peso e controle de vencimento",
    vocabulario: VENDA,
    modulos: ["pdv"],
    recursos: ["peso", "validade"],
  },
  pizzaria: {
    label: "Pizzaria / lanchonete",
    descricao: "Pedido com fila de preparo, entrega e comanda de mesa",
    vocabulario: {
      ordem: "Pedido",
      ordemPlural: "Pedidos",
      ordemCurta: "Pedido",
      item: "Item",
      itemPlural: "Itens",
    },
    modulos: ["pdv", "delivery", "mesas", "producao"],
    recursos: [],
  },
  bebidas: {
    label: "Loja de bebidas / adega",
    descricao: "Balcão com entrega, vencimento e restrição de idade",
    vocabulario: VENDA,
    modulos: ["pdv", "delivery"],
    recursos: ["validade", "idadeMinima"],
  },
};

export const RAMOS = Object.keys(RAMO_META) as Ramo[];

/** Ramo válido, com a assistência como padrão dos cadastros antigos */
export const ramoDe = (r?: string | null): Ramo =>
  RAMOS.includes(r as Ramo) ? (r as Ramo) : "assistencia";

/** Este ramo tem esta tela? */
export const temModulo = (ramo: string | undefined | null, modulo: Modulo): boolean =>
  RAMO_META[ramoDe(ramo)].modulos.includes(modulo);

/** Este ramo usa este campo? */
export const temRecurso = (ramo: string | undefined | null, recurso: Recurso): boolean =>
  RAMO_META[ramoDe(ramo)].recursos.includes(recurso);

/** As palavras deste ramo */
export const vocabulario = (ramo?: string | null): Vocabulario =>
  RAMO_META[ramoDe(ramo)].vocabulario;
