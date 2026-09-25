import { aviso } from "./Aviso";
import { problemaNoMotivo, ACOES, type AcaoAuditoria } from "../lib/auditoria";

/**
 * Pergunta o motivo de uma ação sensível. Devolve null se a pessoa
 * desistiu — e aí a ação não acontece. Fica na auditoria (lib/auditoria.ts).
 */
export function pedirMotivo(acao: AcaoAuditoria, pergunta?: string): string | null {
  for (;;) {
    const m = window.prompt(`${pergunta || ACOES[acao].nome}\n\nMotivo (obrigatório, fica registrado):`);
    if (m === null) return null;
    const problema = problemaNoMotivo(acao, m);
    if (!problema) return m.trim();
    aviso.alerta(problema);
  }
}
