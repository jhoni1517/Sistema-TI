export const uid = (): string =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/**
 * Texto seguro para buscas e ordenações.
 * As colunas da nuvem aceitam nulo; sem isso, um registro incompleto
 * quebra a tela inteira ao chamar .toLowerCase()/.includes().
 */
export const txt = (v?: string | null): string => (v ?? "").toString();

/** Número seguro (a nuvem pode devolver nulo ou texto) */
export const num = (v?: number | string | null): number => {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n as number) ? (n as number) : 0;
};

export const brl = (v: number): string =>
  (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const nowISO = (): string => new Date().toISOString();

export const formatDate = (iso?: string): string => {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("pt-BR");
};

export const formatDateTime = (iso?: string): string => {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const monthKey = (iso: string): string => iso.slice(0, 7); // YYYY-MM

export const dayKey = (iso: string): string => iso.slice(0, 10); // YYYY-MM-DD

export const isToday = (iso?: string): boolean => {
  if (!iso) return false;
  return dayKey(iso) === dayKey(nowISO());
};

/** Limpa telefone e monta link do WhatsApp com mensagem pronta */
export const whatsappLink = (telefone: string, mensagem: string): string => {
  const num = telefone.replace(/\D/g, "");
  const full = num.startsWith("55") ? num : `55${num}`;
  return `https://wa.me/${full}?text=${encodeURIComponent(mensagem)}`;
};

/**
 * Nome fixo da janela do WhatsApp.
 * Com um alvo nomeado, o navegador REAPROVEITA a mesma aba em vez de abrir
 * uma nova a cada OS enviada — no fim do dia isso é a diferença entre uma
 * aba e quarenta.
 */
const JANELA_WHATSAPP = "sistema-ti-whatsapp";

/** Abre a conversa reusando a aba do WhatsApp que já estiver aberta */
export const abrirWhatsapp = (telefone: string, mensagem: string): void => {
  const janela = window.open(whatsappLink(telefone, mensagem), JANELA_WHATSAPP);
  // Traz a aba existente para a frente; alguns navegadores bloqueiam o focus
  // silenciosamente, e nesse caso a navegação sozinha já resolve.
  try {
    janela?.focus();
  } catch {
    /* sem foco, mas a mensagem já foi carregada na aba certa */
  }
};

/** Código público de acompanhamento a partir do número da OS */
export const codigoOS = (numero: number): string =>
  `OS${numero.toString().padStart(5, "0")}`;
