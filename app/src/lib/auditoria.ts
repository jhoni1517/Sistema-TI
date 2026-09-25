import { txt, normalizar } from "./format";
import { somarDiasISO } from "./orcamento-online";
import type { RegistroAuditoria } from "./types";

export type { RegistroAuditoria };

/**
 * Quem fez o quê.
 *
 * Desconto que ninguém autorizou, venda apagada depois que o cliente foi
 * embora, preço mexido na véspera: o prejuízo que vem de dentro não aparece
 * em relatório nenhum, porque o relatório lê exatamente o que foi mexido.
 *
 * O registro é imutável no banco (só inserção, sem update nem delete, e o
 * banco carimba quem e quando — a tela não escolhe). A tela "Auditoria" é
 * só do dono.
 */

export type AcaoAuditoria =
  | "desconto"
  | "venda_cancelada"
  | "os_excluida"
  | "os_reaberta"
  | "preco"
  | "sangria"
  | "estorno"
  | "estoque"
  | "permissao"
  | "entrega_sem_pin";

export const ACOES: Record<AcaoAuditoria, { nome: string; motivo: boolean; limiteDia: number }> = {
  desconto: { nome: "Desconto alto", motivo: false, limiteDia: 8 },
  venda_cancelada: { nome: "Venda cancelada / devolução", motivo: true, limiteDia: 5 },
  os_excluida: { nome: "OS excluída", motivo: true, limiteDia: 2 },
  os_reaberta: { nome: "OS reaberta", motivo: false, limiteDia: 4 },
  preco: { nome: "Preço alterado", motivo: false, limiteDia: 40 },
  sangria: { nome: "Sangria", motivo: false, limiteDia: 6 },
  estorno: { nome: "Lançamento apagado (estorno)", motivo: true, limiteDia: 5 },
  estoque: { nome: "Ajuste manual de estoque", motivo: true, limiteDia: 15 },
  permissao: { nome: "Permissão alterada", motivo: false, limiteDia: 3 },
  entrega_sem_pin: { nome: "Entrega sem código de retirada", motivo: true, limiteDia: 3 },
};

/** Desconto padrão a partir do qual registra, em % */
export const DESCONTO_AUDITADO_PADRAO = 10;

/**
 * O desconto passa do limite? Em % do valor ANTES do desconto: R$ 50 em
 * cima de R$ 500 é 10%, não 11,1%.
 */
export function descontoAcima(bruto: number, desconto: number, limitePct = DESCONTO_AUDITADO_PADRAO): number | null {
  if (!(bruto > 0) || !(desconto > 0)) return null;
  const pct = Math.round((desconto / bruto) * 1000) / 10;
  return pct > limitePct ? pct : null;
}

/** Motivo de três palavras não diz nada: "erro" não é motivo. */
export function problemaNoMotivo(acao: AcaoAuditoria, motivo?: string | null): string {
  if (!ACOES[acao].motivo) return "";
  const m = txt(motivo).trim();
  if (m.length < 5) return "Escreva o motivo (é obrigatório e fica registrado).";
  return "";
}

/** O que vai para o banco. Quem e quando o banco preenche sozinho. */
export function novoRegistro(
  id: string,
  acao: AcaoAuditoria,
  dados: { alvo: string; antes?: unknown; depois?: unknown; valor?: number | null; motivo?: string | null }
): RegistroAuditoria {
  const texto = (v: unknown) => (v === undefined || v === null ? null : typeof v === "string" ? v : JSON.stringify(v));
  return {
    id,
    acao,
    alvo: txt(dados.alvo).slice(0, 120),
    antes: texto(dados.antes),
    depois: texto(dados.depois),
    valor: typeof dados.valor === "number" && Number.isFinite(dados.valor) ? Math.round(dados.valor * 100) / 100 : null,
    motivo: txt(dados.motivo).trim().slice(0, 300) || null,
    criadoEm: new Date().toISOString(),
  };
}

export interface FiltroAuditoria {
  acao?: AcaoAuditoria | "";
  usuario?: string;
  de?: string;
  ate?: string;
  busca?: string;
}

export function filtrarAuditoria(lista: RegistroAuditoria[], f: FiltroAuditoria): RegistroAuditoria[] {
  const busca = normalizar(f.busca);
  return lista
    .filter((r) => {
      const dia = txt(r.criadoEm).slice(0, 10);
      if (f.acao && r.acao !== f.acao) return false;
      if (f.usuario && r.usuario !== f.usuario) return false;
      if (f.de && dia < f.de) return false;
      if (f.ate && dia > f.ate) return false;
      if (busca && !normalizar(`${r.alvo} ${r.motivo} ${r.usuario}`).includes(busca)) return false;
      return true;
    })
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
}

export interface AlertaAuditoria {
  acao: AcaoAuditoria;
  usuario: string;
  hoje: number;
  mediaDia: number;
  texto: string;
}

/**
 * O que fugiu do padrão hoje, por pessoa e ação.
 *
 * Dispara quando passa do limite fixo da ação (5 cancelamentos no dia) OU
 * quando é pelo menos 3 vezes a média diária dela nos últimos 30 dias, com
 * no mínimo 3 no dia — um cancelamento num dia em que a média é 0,1 não é
 * alarme, é terça-feira.
 */
export function alertasDoDia(lista: RegistroAuditoria[], hoje: string): AlertaAuditoria[] {
  const inicio = somarDiasISO(hoje, -30);
  const conta = new Map<string, { hoje: number; antes: number }>();
  for (const r of lista) {
    const dia = txt(r.criadoEm).slice(0, 10);
    if (dia < inicio || dia > hoje) continue;
    const k = `${r.acao}|${r.usuario || "?"}`;
    const c = conta.get(k) || { hoje: 0, antes: 0 };
    if (dia === hoje) c.hoje++;
    else c.antes++;
    conta.set(k, c);
  }
  const alertas: AlertaAuditoria[] = [];
  for (const [k, c] of conta) {
    const [acao, usuario] = k.split("|") as [AcaoAuditoria, string];
    const meta = ACOES[acao];
    if (!meta || c.hoje === 0) continue;
    const mediaDia = Math.round((c.antes / 30) * 10) / 10;
    const porLimite = c.hoje >= meta.limiteDia;
    const porMedia = c.hoje >= 3 && c.hoje >= 3 * Math.max(mediaDia, 0.1) && c.antes > 0;
    if (!porLimite && !porMedia) continue;
    alertas.push({
      acao,
      usuario,
      hoje: c.hoje,
      mediaDia,
      texto: `${usuario}: ${c.hoje} × ${meta.nome.toLowerCase()} hoje${c.antes > 0 ? ` (média ${String(mediaDia).replace(".", ",")} por dia)` : ""}`, // texto-cru-proposital: monta frase, não compara
    });
  }
  return alertas.sort((a, b) => b.hoje - a.hoje);
}

export const usuariosDaAuditoria = (lista: RegistroAuditoria[]): string[] =>
  [...new Set(lista.map((r) => r.usuario || "").filter(Boolean))].sort();

/** "antes"/"depois" guardados como JSON viram "valor: 119 · forma: pix" na tela. */
export function valorLegivel(v?: string | null): string {
  if (v === null || v === undefined || v === "") return "—";
  try {
    const o = JSON.parse(v);
    if (o && typeof o === "object" && !Array.isArray(o)) {
      return Object.entries(o)
        .filter(([, x]) => x !== null && x !== undefined && x !== "")
        .map(([k, x]) => `${k}: ${typeof x === "string" && /^\d{4}-\d{2}-\d{2}T/.test(x) ? x.slice(0, 10).split("-").reverse().join("/") : typeof x === "object" ? JSON.stringify(x) : x}`)
        .join(" · ");
    }
  } catch {
    // Não é JSON: é texto, mostra como veio.
  }
  return v;
}
