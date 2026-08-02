/**
 * Notificações do navegador (PC e celular).
 *
 * Funciona sem servidor de push: usa a API de Notificação, que o Chrome no
 * PC e no Android entregam enquanto o sistema estiver aberto ou instalado
 * como aplicativo. Não é push de verdade — com o app fechado, nada chega.
 * Por isso o lembrete importante também vai pelo Telegram, que alcança o
 * celular mesmo com o sistema desligado.
 *
 * No iPhone só funciona com o site instalado na tela de início (iOS 16.4+).
 */

import { hojeISO } from "./contas";

const CHAVE_VISTOS = "sistema-ti:avisos-vistos";

export type PermissaoAviso = "concedida" | "negada" | "pendente" | "indisponivel";

export const suportaNotificacao = (): boolean =>
  typeof window !== "undefined" && "Notification" in window;

export function permissaoAtual(): PermissaoAviso {
  if (!suportaNotificacao()) return "indisponivel";
  const p = Notification.permission;
  return p === "granted" ? "concedida" : p === "denied" ? "negada" : "pendente";
}

/** Pede autorização. Só funciona a partir de um clique do usuário. */
export async function pedirPermissao(): Promise<PermissaoAviso> {
  if (!suportaNotificacao()) return "indisponivel";
  try {
    const r = await Notification.requestPermission();
    return r === "granted" ? "concedida" : r === "denied" ? "negada" : "pendente";
  } catch {
    return "indisponivel";
  }
}

/**
 * Avisos que já foram mostrados, para não repetir a cada abertura da tela.
 * Guardado por aparelho: cada um avisa uma vez.
 */
function vistos(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_VISTOS) || "{}");
  } catch {
    return {};
  }
}

function marcarVisto(chave: string) {
  const v = vistos();
  v[chave] = hojeISO();
  // Mantém a lista enxuta: 200 chaves cobrem meses de uso
  const entradas = Object.entries(v);
  if (entradas.length > 200) {
    entradas.sort((a, b) => b[1].localeCompare(a[1]));
    localStorage.setItem(CHAVE_VISTOS, JSON.stringify(Object.fromEntries(entradas.slice(0, 150))));
    return;
  }
  localStorage.setItem(CHAVE_VISTOS, JSON.stringify(v));
}

/** Já avisamos isto hoje neste aparelho? */
export const jaAvisadoHoje = (chave: string): boolean =>
  vistos()[chave] === hojeISO();

/**
 * Mostra a notificação. Devolve false quando não foi possível — sem
 * permissão, sem suporte ou já avisado hoje.
 */
export function notificar(
  titulo: string,
  corpo: string,
  opcoes?: { chave?: string; url?: string }
): boolean {
  if (permissaoAtual() !== "concedida") return false;
  if (opcoes?.chave && jaAvisadoHoje(opcoes.chave)) return false;

  try {
    const n = new Notification(titulo, {
      body: corpo,
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: opcoes?.chave, // substitui a anterior em vez de empilhar
    });
    n.onclick = () => {
      window.focus();
      if (opcoes?.url) window.location.hash = opcoes.url;
      n.close();
    };
    if (opcoes?.chave) marcarVisto(opcoes.chave);
    return true;
  } catch {
    return false;
  }
}
