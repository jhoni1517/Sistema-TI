import { txt, codigoOS } from "./format";
import type { OSStatus } from "./types";

/**
 * Aviso de status da OS pela API oficial do WhatsApp (Cloud API da Meta).
 *
 * O botão wa.me continua sendo o caminho do plano essencial: abre o
 * WhatsApp com o texto pronto e a pessoa aperta enviar. No plano completo,
 * a loja cadastra o número dela na Meta e o sistema manda sozinho.
 *
 * A Meta só deixa a empresa puxar conversa com MODELO aprovado (template),
 * e cobra por conversa. Por isso:
 *   - só alguns status avisam (os que o cliente precisa saber);
 *   - cada status vira UM envio, nunca dois: o id do envio é OS + status,
 *     e o banco recusa o segundo (supabase-migracao-whatsapp-os.sql).
 *
 * Os mesmos modelos estão em api/whatsapp-os.js — whatsapp-os.cron.test.ts
 * lê os dois e reprova se divergirem. Modelo com nome diferente do aprovado
 * na Meta é mensagem recusada.
 */

export interface ModeloWhatsapp {
  /** Nome EXATO do modelo aprovado na Meta */
  nome: string;
  /** O texto que vai para aprovação, com {{1}}..{{4}} */
  texto: string;
}

/**
 * Parâmetros, na ordem: {{1}} primeiro nome, {{2}} código da OS,
 * {{3}} aparelho, {{4}} link de acompanhamento.
 *
 * Sem emoji e sem "Olá!": modelo de categoria UTILIDADE que parece
 * propaganda é reclassificado pela Meta como MARKETING, que custa mais e
 * pode ser bloqueado.
 */
export const MODELOS_POR_STATUS: Partial<Record<OSStatus, ModeloWhatsapp>> = {
  aberta: {
    nome: "os_recebida",
    texto:
      "Oi, {{1}}. Recebemos seu {{3}} e abrimos a ordem de serviço {{2}}. " +
      "Acompanhe cada etapa por aqui: {{4}}",
  },
  aguardando_aprovacao: {
    nome: "os_orcamento_pronto",
    texto:
      "{{1}}, o orçamento da ordem {{2}} ({{3}}) está pronto. " +
      "Veja os valores e aprove pelo link: {{4}}",
  },
  aguardando_peca: {
    nome: "os_aguardando_peca",
    texto:
      "{{1}}, a ordem {{2}} ({{3}}) está aguardando a chegada de uma peça. " +
      "Avisamos assim que chegar. Acompanhe: {{4}}",
  },
  pronta: {
    nome: "os_pronta",
    texto:
      "{{1}}, seu {{3}} está pronto para retirada (ordem {{2}}). " +
      "Detalhes e valor: {{4}}",
  },
  entregue: {
    nome: "os_entregue",
    texto:
      "{{1}}, a ordem {{2}} ({{3}}) foi entregue. " +
      "O comprovante e a garantia ficam neste link: {{4}}",
  },
};

export const statusQueAvisa = (s: OSStatus): boolean => !!MODELOS_POR_STATUS[s];

/**
 * Número no formato que a Meta aceita: 55 + DDD + número, só dígitos.
 * Sem DDD devolve vazio — mandar para o número errado é pior que não mandar.
 */
export function numeroWhatsapp(telefone: string | null | undefined): string {
  let d = txt(telefone).replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return "";
  return `55${d}`;
}

/** Os quatro parâmetros do modelo, na ordem. Nenhum pode ir vazio: a Meta recusa. */
export function parametrosDoModelo(dados: {
  nomeCliente?: string;
  numero: number;
  marca?: string;
  modelo?: string;
  link: string;
}): string[] {
  const primeiro = txt(dados.nomeCliente).trim().split(/\s+/)[0] || "cliente";
  const aparelho = [txt(dados.marca), txt(dados.modelo)].filter(Boolean).join(" ").trim() || "aparelho";
  return [primeiro, codigoOS(dados.numero), aparelho, dados.link || "-"];
}

/** O id do envio: um por OS e status. É ele que impede o segundo envio. */
export const idDoEnvio = (osId: string, status: OSStatus): string => `${osId}:${status}`;

/** Quantas vezes tentar antes de desistir e deixar o botão wa.me resolver */
export const MAXIMO_DE_TENTATIVAS_WHATSAPP = 5;
