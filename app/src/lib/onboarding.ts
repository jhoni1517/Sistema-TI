import type { Config } from "./types";

/**
 * O primeiro acesso da loja.
 *
 * Loja nova abre um sistema vazio e não sabe por onde começar: sem produto
 * não tem venda, sem OS não tem o link que impressiona o cliente. O
 * assistente leva em cinco passos até o momento em que a pessoa vê o
 * sistema trabalhando para ela — o link de acompanhamento chegando no
 * próprio WhatsApp.
 *
 * O estado mora na configuração da loja (sobe para a nuvem), não no
 * aparelho: quem pulou no computador não pode ver de novo no celular.
 */

export type PassoId = "loja" | "ramo" | "produto" | "primeira" | "pronto";

export const PASSOS: { id: PassoId; titulo: string }[] = [
  { id: "loja", titulo: "Sua loja" },
  { id: "ramo", titulo: "Tipo de loja" },
  { id: "produto", titulo: "Primeiro produto" },
  { id: "primeira", titulo: "Primeiro atendimento" },
  { id: "pronto", titulo: "Pronto" },
];

export interface EstadoOnboarding {
  /** Terminou ou pulou: o assistente não abre mais sozinho */
  visto?: boolean;
  /** Onde parou, para voltar ao mesmo passo se fechar no meio */
  passo?: PassoId;
  /** Abriu o link de acompanhamento que o cliente recebe */
  viuRastreio?: boolean;
  /** Quando o assistente apareceu: é o que liga a lista do Painel */
  inicio?: string;
}

const NOME_PADRAO = "Minha Assistência TI";

/**
 * O assistente abre sozinho?
 *
 * Só para loja NOVA: sem cliente, produto, OS ou venda. Loja que já usa o
 * sistema e nunca viu isto não pode ser interrompida por um tutorial no
 * meio do expediente. E só depois de a configuração chegar da nuvem — antes
 * disso "nunca viu" pode ser só "ainda não carregou".
 */
export function deveAbrirAssistente(p: {
  configCarregada: boolean;
  loading: boolean;
  demo: boolean;
  dono: boolean;
  estado?: EstadoOnboarding;
  quantos: number;
}): boolean {
  if (!p.configCarregada || p.loading || p.demo || !p.dono) return false;
  if (p.estado?.visto) return false;
  // Começou e fechou a aba no meio: continua de onde parou, mesmo que já
  // tenha cadastrado o primeiro produto.
  if (p.estado?.passo) return true;
  return p.quantos === 0;
}

export const indiceDoPasso = (id?: PassoId): number => Math.max(0, PASSOS.findIndex((x) => x.id === id));

/** 0 a 100, para a barra. O último passo é 100. */
export const progresso = (id?: PassoId): number =>
  Math.round((indiceDoPasso(id) / (PASSOS.length - 1)) * 100);

export const proximoPasso = (id?: PassoId): PassoId =>
  PASSOS[Math.min(PASSOS.length - 1, indiceDoPasso(id) + 1)].id;

export const passoAnterior = (id?: PassoId): PassoId => PASSOS[Math.max(0, indiceDoPasso(id) - 1)].id;

// ---------- Lista do Painel ----------

export interface ItemPrimeirosPassos {
  id: string;
  texto: string;
  feito: boolean;
  /** Para onde o botão leva */
  rota: string;
}

/**
 * A lista "Primeiros passos" do Painel.
 *
 * O "feito" sai dos DADOS, não de um tique guardado: a loja que cadastrou o
 * produto pelo Estoque, sem passar pelo assistente, também vê o passo
 * marcado. Tique guardado mentiria nos dois sentidos.
 */
export function primeirosPassos(
  config: Pick<Config, "nomeLoja" | "telefoneLoja" | "logoUrl"> & { primeirosPassos?: EstadoOnboarding },
  dados: { produtos: number; ordens: number; vendas: number },
  temOS: boolean
): ItemPrimeirosPassos[] {
  const nome = (config.nomeLoja || "").trim();
  return [
    {
      id: "loja",
      texto: "Nome e WhatsApp da loja",
      feito: !!nome && nome !== NOME_PADRAO && !!(config.telefoneLoja || "").replace(/\D/g, ""),
      rota: "/config",
    },
    { id: "logo", texto: "Logo da loja", feito: !!config.logoUrl, rota: "/config" },
    { id: "produto", texto: "Primeiro produto no estoque", feito: dados.produtos > 0, rota: "/estoque" },
    temOS
      ? { id: "primeira", texto: "Primeira ordem de serviço", feito: dados.ordens > 0, rota: "/ordens" }
      : { id: "primeira", texto: "Primeira venda", feito: dados.vendas > 0, rota: "/pdv" },
    temOS
      ? {
          id: "rastreio",
          texto: "Ver o link que o cliente recebe",
          feito: !!config.primeirosPassos?.viuRastreio,
          rota: "/ordens",
        }
      : null,
  ].filter((x): x is ItemPrimeirosPassos => x !== null);
}

/**
 * A lista aparece no Painel? Só para quem passou pelo assistente (loja
 * nova) e enquanto falta algum passo. Loja antiga sem logo não ganha uma
 * lista de tarefas que nunca pediu.
 */
export const mostrarPrimeirosPassos = (
  estado: EstadoOnboarding | undefined,
  itens: ItemPrimeirosPassos[]
): boolean => !!estado?.inicio && itens.some((i) => !i.feito);
