export const uid = (): string =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

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

/** Código público de acompanhamento a partir do número da OS */
export const codigoOS = (numero: number): string =>
  `OS${numero.toString().padStart(5, "0")}`;
