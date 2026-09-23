import { supabase } from "./supabase";
import { statusQueAvisa } from "./whatsapp-os";
import type { OSStatus } from "./types";

/**
 * Pede ao servidor o aviso de status pelo WhatsApp (plano completo).
 *
 * Nunca lança: aviso é EXTRA. A OS já foi gravada quando isto roda, e um
 * erro aqui não pode aparecer como "não salvou". Quem decide se manda é o
 * servidor (plano, número configurado, telefone do cliente, um envio por
 * status); a tela só pergunta e mostra o que aconteceu.
 */
export async function avisarPorWhatsapp(
  osId: string,
  status: OSStatus
): Promise<{ situacao?: string; erro?: string; ignorado?: string }> {
  if (!statusQueAvisa(status)) return { ignorado: "status sem aviso" };
  try {
    const sessao = (await supabase?.auth.getSession())?.data.session?.access_token;
    if (!sessao) return { ignorado: "sem sessão" };
    const r = await fetch("/api/whatsapp-os?acao=avisar", {
      method: "POST",
      headers: { Authorization: `Bearer ${sessao}`, "Content-Type": "application/json" },
      body: JSON.stringify({ osId, status }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { situacao: "falhou", erro: d?.erro || `servidor respondeu ${r.status}` };
    return d;
  } catch (e) {
    return { situacao: "falhou", erro: e instanceof Error ? e.message : String(e) };
  }
}

/** O recado para a tela, ou vazio quando não há o que dizer */
export function recadoDoAviso(r: { situacao?: string; erro?: string; ignorado?: string }): {
  tipo: "sucesso" | "alerta" | "";
  texto: string;
} {
  if (r.ignorado) return { tipo: "", texto: "" };
  if (r.situacao === "enviado") return { tipo: "sucesso", texto: "Cliente avisado no WhatsApp." };
  if (r.situacao === "falhou" || r.situacao === "desistiu") {
    return {
      tipo: "alerta",
      texto:
        "O WhatsApp automático não mandou" +
        (r.erro ? `: ${r.erro}` : ".") +
        " Use o botão do WhatsApp da OS para avisar o cliente.",
    };
  }
  return { tipo: "", texto: "" };
}
