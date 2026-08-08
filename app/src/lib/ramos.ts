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
  | "idadeMinima" // venda proibida para menores (bebida alcoólica)
  | "meioAMeio" // pizza com 2 a 4 sabores, e a regra de preço da casa
  | "observacaoItem"; // "sem cebola", "bem passado": o recado vai para a cozinha

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
    recursos: ["meioAMeio", "observacaoItem"],
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

/* ------------------------------------------------------------------ */
/* Ramo escolhido no aparelho                                          */
/* ------------------------------------------------------------------ */

/**
 * Ramo escolhido na tela de entrada, válido só NESTE aparelho.
 *
 * Existe porque trocar o ramo em Configurações mexe na loja de verdade: o
 * dono queria só ver como fica uma mercearia e acabou escondendo as próprias
 * ordens de serviço. Aqui a escolha é local — não grava nada na loja, não
 * alcança os outros aparelhos e não altera dado nenhum.
 *
 * Serve para demonstrar o sistema a um cliente novo e para experimentar sem
 * medo. A configuração definitiva da loja continua sendo a de Configurações.
 */
const CHAVE_APARELHO = "sistema-ti:ramo-aparelho";

export function lerRamoAparelho(): Ramo | null {
  try {
    const v = localStorage.getItem(CHAVE_APARELHO);
    return v && RAMOS.includes(v as Ramo) ? (v as Ramo) : null;
  } catch {
    return null;
  }
}

export function definirRamoAparelho(r: Ramo | null): void {
  try {
    if (r) localStorage.setItem(CHAVE_APARELHO, r);
    else localStorage.removeItem(CHAVE_APARELHO);
  } catch {
    /* aparelho sem armazenamento: a escolha simplesmente não persiste */
  }
}

/**
 * Qual ramo vale agora.
 * A escolha do aparelho ganha da loja — é ela que a pessoa acabou de fazer,
 * e é a única que ela consegue desfazer sem mexer na configuração da loja.
 */
export const ramoEfetivo = (ramoDaLoja?: string | null): Ramo =>
  lerRamoAparelho() ?? ramoDe(ramoDaLoja);

/* ------------------------------------------------------------------ */
/* O aparelho lembra o ramo de quem já entrou nele                     */
/* ------------------------------------------------------------------ */

/**
 * Tipo de loja de cada conta que já entrou NESTE aparelho.
 *
 * A tela de entrada mostrava quatro botões de tipo de loja para todo mundo,
 * inclusive para quem já é cliente e não escolhe nada — os botões só valem
 * para o administrador demonstrando o sistema. Quem tem mercearia clicava em
 * "Mercearia" e nada acontecia, o que parecia defeito.
 *
 * Agora, ao digitar o e-mail, a tela já se apresenta como a loja daquela
 * conta. O dado vem do próprio aparelho, do login anterior: perguntar ao
 * servidor "que tipo de loja é este e-mail?" contaria a qualquer um, sem
 * senha, que o endereço existe e que ramo ele toca.
 *
 * Guarda só as últimas contas, e sobrevive ao logout de propósito — apagar
 * junto com o resto do cache faria a tela esquecer no exato momento em que
 * ela mais precisa lembrar. Não é dado da loja: é a memória do aparelho.
 */
const CHAVE_CONTAS = "sistema-ti:ramo-por-conta";
const MAX_CONTAS = 5;

interface ContaLembrada {
  email: string;
  ramo: Ramo;
}

// texto-cru-proposital: e-mail nao tem acento, e tirar um mudaria o endereco
const chaveEmail = (email: string): string => email.trim().toLowerCase();

const lerContas = (): ContaLembrada[] => {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE_CONTAS) || "[]");
    if (!Array.isArray(bruto)) return [];
    return bruto.filter(
      (c): c is ContaLembrada =>
        !!c && typeof c.email === "string" && RAMOS.includes(c.ramo)
    );
  } catch {
    // Armazenamento estragado não pode impedir alguém de entrar.
    return [];
  }
};

/** O que o aparelho lembra sobre esta conta. Nulo = nunca entrou aqui. */
export function ramoLembrado(email: string): Ramo | null {
  const alvo = chaveEmail(email);
  if (!alvo) return null;
  return lerContas().find((c) => c.email === alvo)?.ramo ?? null;
}

/** Guarda o ramo desta conta para a próxima vez que ela abrir o sistema */
export function lembrarRamoDaConta(email: string, ramo: Ramo): void {
  const alvo = chaveEmail(email);
  if (!alvo) return;
  try {
    const resto = lerContas().filter((c) => c.email !== alvo);
    localStorage.setItem(
      CHAVE_CONTAS,
      JSON.stringify([{ email: alvo, ramo }, ...resto].slice(0, MAX_CONTAS))
    );
  } catch {
    /* aparelho sem armazenamento: a tela só não vai adivinhar da próxima vez */
  }
}

/**
 * Pergunta ao servidor qual é o ramo desta conta.
 *
 * A memória do aparelho (acima) só funciona onde a conta já entrou uma vez.
 * No aparelho novo — que é justamente onde a pessoa mais precisa de ajuda —
 * ela não sabe nada, e os quatro botões de tipo de loja voltam a aparecer
 * sem fazer efeito nenhum para quem é cliente.
 *
 * O preço é conhecido e aceito: a função responde sem senha, então quem já
 * sabe o e-mail exato de alguém descobre o ramo do negócio. Ela não devolve
 * mais nada — nem se o e-mail existe, nem nome, nem loja.
 *
 * Nunca lança: falha de rede aqui só faz a tela deixar de adivinhar, e
 * atrapalhar o login por causa de um enfeite seria bem pior.
 */
export async function ramoDoEmail(email: string): Promise<Ramo | null> {
  const alvo = email.trim();
  // Menos que isso não é e-mail, e consultar a cada tecla digitada
  // transformaria a tela de entrada num gerador de tráfego.
  if (alvo.length < 5 || !alvo.includes("@") || !alvo.includes(".")) return null;
  try {
    const { supabase, supabaseEnabled } = await import("./supabase");
    if (!supabaseEnabled || !supabase) return null;
    const { data, error } = await supabase.rpc("ramo_do_email", { p_email: alvo });
    if (error) return null;
    const v = Array.isArray(data) ? data[0] : data;
    return typeof v === "string" && RAMOS.includes(v as Ramo) ? (v as Ramo) : null;
  } catch {
    return null;
  }
}
