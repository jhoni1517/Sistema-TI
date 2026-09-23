import { txt, codigoOS } from "./format";
import type { Cliente, OrdemServico, OSStatus } from "./types";

/**
 * O painel da bancada, na TV da loja.
 *
 * O cliente no balcão pergunta "o meu já tá pronto?" e o técnico larga a
 * solda para olhar o sistema. Com a fila na parede, a pergunta se responde
 * sozinha — e a loja parece organizada, que é metade da confiança.
 *
 * A TV fica virada para o salão, então o cartão leva o MÍNIMO: código,
 * primeiro nome e aparelho. Nada de sobrenome, telefone, defeito ou valor —
 * quem está na fila lê tudo o que está na parede.
 */

export type ColunaPainel = "fila" | "reparo" | "peca" | "pronto";

export const COLUNAS_PAINEL: { chave: ColunaPainel; titulo: string; status: OSStatus[] }[] = [
  // Aguardando aprovação fica na fila: o aparelho não está na mão do
  // técnico, está esperando o cliente.
  { chave: "fila", titulo: "Na fila", status: ["aberta", "em_analise", "aguardando_aprovacao", "aprovada"] },
  { chave: "reparo", titulo: "Em reparo", status: ["em_reparo"] },
  { chave: "peca", titulo: "Aguardando peça", status: ["aguardando_peca"] },
  { chave: "pronto", titulo: "Pronto", status: ["pronta"] },
];

/**
 * Quantos cartões cabem numa coluna lidos a 3 metros. Passou disso, o
 * resto vira "+N" — cartão espremido para caber é cartão que ninguém lê.
 */
export const CARTOES_POR_COLUNA = 6;

export interface CartaoPainel {
  id: string;
  codigo: string;
  primeiroNome: string;
  aparelho: string;
}

export function cartaoDoPainel(o: OrdemServico, cliente?: Pick<Cliente, "nome">): CartaoPainel {
  return {
    id: o.id,
    codigo: codigoOS(o.numero),
    primeiroNome: txt(cliente?.nome).trim().split(/\s+/)[0] || "",
    aparelho: [txt(o.marca), txt(o.modelo)].filter(Boolean).join(" ") || txt(o.tipoAparelho) || "Aparelho",
  };
}

/**
 * As quatro colunas, já cortadas.
 *
 * Na bancada, quem espera há mais tempo vai no topo: é o próximo a ser
 * pego. No "Pronto", o mais recente vai no topo — é o que acabou de ser
 * avisado e o dono pode estar chegando.
 */
export function colunasDoPainel(
  ordens: OrdemServico[],
  clientes: Pick<Cliente, "id" | "nome">[]
): { chave: ColunaPainel; titulo: string; cartoes: CartaoPainel[]; mais: number; total: number }[] {
  const nomes = new Map(clientes.map((c) => [c.id, c]));
  return COLUNAS_PAINEL.map((col) => {
    const daColuna = ordens
      .filter((o) => col.status.includes(o.status))
      .sort((a, b) =>
        col.chave === "pronto"
          ? txt(b.prontaEm || b.atualizadoEm).localeCompare(txt(a.prontaEm || a.atualizadoEm))
          : txt(a.criadoEm).localeCompare(txt(b.criadoEm))
      );
    return {
      chave: col.chave,
      titulo: col.titulo,
      total: daColuna.length,
      cartoes: daColuna
        .slice(0, CARTOES_POR_COLUNA)
        .map((o) => cartaoDoPainel(o, nomes.get(o.clienteId))),
      mais: Math.max(0, daColuna.length - CARTOES_POR_COLUNA),
    };
  });
}

/**
 * Quais OS acabaram de virar "pronta" desde a última olhada — são as que
 * ganham o carimbo animado.
 *
 * Na primeira carga não há "antes", e nada anima: carimbar vinte cartões
 * ao ligar a TV é festa sem motivo, e ensina a não olhar para o carimbo.
 */
export function novasProntas(
  antes: Record<string, OSStatus> | null,
  agora: Pick<OrdemServico, "id" | "status">[]
): string[] {
  if (!antes) return [];
  return agora
    .filter((o) => o.status === "pronta" && antes[o.id] !== undefined && antes[o.id] !== "pronta")
    .map((o) => o.id);
}

/** O retrato de agora, para a próxima comparação */
export const retratoDosStatus = (ordens: Pick<OrdemServico, "id" | "status">[]): Record<string, OSStatus> =>
  Object.fromEntries(ordens.map((o) => [o.id, o.status]));
