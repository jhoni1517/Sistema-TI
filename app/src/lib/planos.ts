import { txt } from "./format";

/**
 * O que cada plano inclui.
 *
 * `lojas.plano` existia desde a primeira migração ("essencial") e nada lia.
 * Agora ele decide duas coisas que custam dinheiro por uso — a IA (cada
 * leitura é uma chamada paga ao Gemini) e o WhatsApp automático (cada
 * mensagem é cobrada pela Meta).
 *
 * Quem muda o plano é o administrador do sistema, na tela Lojas; um gatilho
 * no banco recusa a troca vinda da própria loja (supabase-migracao-ia.sql),
 * igual ao ramo. Senão a loja se promovia sozinha.
 *
 * Os mesmos números estão em api/_ia.js, que é quem de fato confere — a
 * tela só mostra. ia.cron.test.ts reprova se os dois divergirem.
 */

export type Plano = "essencial" | "completo";
export type RecursoIA = "nota" | "diagnostico" | "voz";

export const PLANOS: Plano[] = ["essencial", "completo"];

export const PLANO_META: Record<
  Plano,
  { label: string; limitesIA: Record<RecursoIA, number>; whatsappAutomatico: boolean }
> = {
  essencial: {
    label: "Essencial",
    limitesIA: { nota: 20, diagnostico: 30, voz: 30 },
    whatsappAutomatico: false,
  },
  completo: {
    label: "Completo",
    limitesIA: { nota: 200, diagnostico: 300, voz: 300 },
    whatsappAutomatico: true,
  },
};

/** Plano desconhecido ou vazio vale o essencial: nunca libera o que não foi vendido. */
export const planoDe = (v?: string | null): Plano =>
  (PLANOS as string[]).includes(txt(v)) ? (txt(v) as Plano) : "essencial";

export const RECURSO_IA_META: Record<RecursoIA, string> = {
  nota: "leituras de nota por foto",
  diagnostico: "sugestões da IA",
  voz: "OS abertas por voz",
};
