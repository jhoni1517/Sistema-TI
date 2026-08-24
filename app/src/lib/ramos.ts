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

export type Ramo =
  | "assistencia"
  | "motores"
  | "mercearia"
  | "pizzaria"
  | "bebidas";

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
  /**
   * Senha, padrão de desbloqueio e conta vinculada do aparelho.
   *
   * NASCEU DE UM PEDIDO ÓBVIO EM RETROSPECTO: "imagina numa pizzaria ter
   * senha do celular". O bloco confidencial era incondicional, então toda
   * loja de qualquer ramo via um campo pedindo a senha do celular do
   * cliente — e num rebobinamento de motor isso não é só estranho, é pedir
   * dado sigiloso que a loja não tem por que guardar.
   *
   * Guardar senha de terceiro é o maior risco jurídico deste sistema. Só
   * pede quem precisa.
   */
  | "senhaAparelho"
  /**
   * Placa do motor: potência, tensão, rotação e fases.
   *
   * É o que o rebobinador anota ANTES de abrir. Sem esses quatro números
   * não dá para calcular o fio nem conferir se o motor voltou igual.
   */
  | "dadosMotor"
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
  /**
   * O que entra para consertar: aparelho, equipamento.
   *
   * "Dados do aparelho" numa oficina de rebobinamento soa a celular, e a
   * pessoa que trabalha ali passa o dia lendo a palavra errada. Trocar
   * custa uma linha e muda como a loja enxerga o sistema.
   */
  aparelho: string;
  aparelhoPlural: string;
}

export interface RamoMeta {
  label: string;
  descricao: string;
  vocabulario: Vocabulario;
  modulos: Modulo[];
  recursos: Recurso[];
  /**
   * O que a loja recebe para consertar, na ordem em que aparece no seletor.
   *
   * Estava escrito à mão dentro da tela da OS — "Celular, Notebook, PC,
   * Tablet" — e por isso a oficina de motores abria a ordem escolhendo
   * entre celular e tablet. Vazio em ramo que não conserta nada.
   */
  aparelhos: string[];
  /**
   * Checklist de entrada, conferido com o cliente na frente.
   *
   * Também estava à mão na tela: "Tela sem trincos", "Touch funciona",
   * "Câmera OK". Num motor não se confere touch — confere-se se o eixo gira
   * e se a carcaça está trincada. Checklist errado é checklist que ninguém
   * marca, e aí a prova da entrada deixa de existir.
   */
  checklist: string[];
}

const VENDA: Vocabulario = {
  ordem: "Venda",
  ordemPlural: "Vendas",
  ordemCurta: "Venda",
  item: "Produto",
  itemPlural: "Produtos",
  // Sem conserto, mas o campo existe para toda a tela poder ler sem checar.
  aparelho: "Item",
  aparelhoPlural: "Itens",
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
      aparelho: "Aparelho",
      aparelhoPlural: "Aparelhos",
    },
    modulos: ["os", "rastreio"],
    recursos: ["imei", "senhaAparelho", "garantia"],
    aparelhos: ["Celular", "Notebook", "PC", "Tablet", "Impressora", "Console", "Outro"],
    checklist: [
      "Liga normalmente",
      "Tela sem trincos",
      "Touch funciona",
      "Botões OK",
      "Câmera OK",
      "Alto-falante OK",
      "Carrega",
      "Molhou / oxidação",
    ],
  },
  /**
   * Rebobinamento e manutenção de motor elétrico e bomba d'água.
   *
   * É assistência técnica com outro conteúdo, e por isso reaproveita a OS
   * inteira — laudo, orçamento com opções, aprovação pelo link, garantia,
   * peças, caixa. O que muda é o que se pergunta na entrada.
   *
   * O QUE ENTRA: a placa do motor. Potência, tensão, rotação e fases são os
   * quatro números que o rebobinador anota antes de abrir; sem eles não dá
   * para calcular a bitola do fio nem conferir, na volta, se o motor saiu
   * igual ao que entrou.
   *
   * O QUE SAI: IMEI e senha do aparelho. Motor não tem IMEI, e pedir a senha
   * do celular de quem trouxe uma bomba d'água é pedir dado sigiloso sem ter
   * por que guardar.
   */
  motores: {
    label: "Motores e bombas",
    descricao: "Rebobinamento, motor elétrico e bomba d'água: laudo, orçamento e garantia",
    vocabulario: {
      ordem: "Ordem de Serviço",
      ordemPlural: "Ordens de Serviço",
      ordemCurta: "OS",
      item: "Peça",
      itemPlural: "Peças",
      // "Aparelho" puxa para eletrônico. Quem trabalha ali fala equipamento.
      aparelho: "Equipamento",
      aparelhoPlural: "Equipamentos",
    },
    modulos: ["os", "rastreio"],
    recursos: ["dadosMotor", "garantia"],
    aparelhos: [
      "Motor monofásico",
      "Motor trifásico",
      "Bomba d'água",
      "Bomba submersa",
      "Motobomba",
      "Compressor",
      "Ventilador / exaustor",
      "Betoneira",
      "Outro",
    ],
    checklist: [
      "Eixo gira livre",
      "Rolamentos OK",
      "Carcaça sem trinco",
      "Ventoinha e tampa",
      "Caixa de ligação",
      "Capacitor",
      "Veio molhado / enferrujado",
      "Cheiro de queimado",
    ],
  },
  mercearia: {
    label: "Mercearia / mercado",
    descricao: "Balcão rápido, produto por peso e controle de vencimento",
    vocabulario: VENDA,
    modulos: ["pdv"],
    recursos: ["peso", "validade"],
    aparelhos: [],
    checklist: [],
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
      aparelho: "Item",
      aparelhoPlural: "Itens",
    },
    modulos: ["pdv", "delivery", "mesas", "producao"],
    recursos: ["meioAMeio", "observacaoItem"],
    // Pizzaria não conserta nada: as duas listas ficam vazias de propósito.
    aparelhos: [],
    checklist: [],
  },
  bebidas: {
    label: "Loja de bebidas / adega",
    descricao: "Balcão com entrega, vencimento e restrição de idade",
    vocabulario: VENDA,
    modulos: ["pdv", "delivery"],
    recursos: ["validade", "idadeMinima"],
    aparelhos: [],
    checklist: [],
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

/**
 * O que este ramo recebe para consertar.
 *
 * Devolve a lista da assistência quando o ramo não conserta nada: a tela da
 * OS só existe para quem tem o módulo, e um seletor vazio ali seria pior que
 * um seletor errado — não daria nem para salvar a ordem.
 */
export const aparelhosDoRamo = (ramo?: string | null): string[] => {
  const lista = RAMO_META[ramoDe(ramo)].aparelhos;
  return lista.length > 0 ? lista : RAMO_META.assistencia.aparelhos;
};

/** O checklist de entrada deste ramo. Mesma regra da lista acima. */
export const checklistDoRamo = (ramo?: string | null): string[] => {
  const lista = RAMO_META[ramoDe(ramo)].checklist;
  return lista.length > 0 ? lista : RAMO_META.assistencia.checklist;
};

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
