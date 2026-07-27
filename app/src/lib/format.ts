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


/* ------------------------------------------------------------------ */
/* CPF / CNPJ                                                          */
/* ------------------------------------------------------------------ */

/** Só os dígitos — é assim que o documento é guardado no banco */
export const soDigitos = (v?: string | null): string => txt(v).replace(/\D/g, "");

/** Aplica a máscara conforme o tamanho: 000.000.000-00 ou 00.000.000/0000-00 */
export const mascaraDocumento = (v?: string | null): string => {
  const d = soDigitos(v).slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
  }
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
};

/** Dígitos verificadores do CPF */
export const cpfValido = (v?: string | null): boolean => {
  const d = soDigitos(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (base: string, pesoInicial: number): number => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += +base[i] * (pesoInicial - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(d.slice(0, 9), 10) === +d[9] && dv(d.slice(0, 10), 11) === +d[10];
};

/** Dígitos verificadores do CNPJ */
export const cnpjValido = (v?: string | null): boolean => {
  const d = soDigitos(v);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (base: string): number => {
    let peso = base.length - 7;
    let soma = 0;
    for (let i = 0; i < base.length; i++) {
      soma += +base[i] * peso--;
      if (peso < 2) peso = 9;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(d.slice(0, 12)) === +d[12] && dv(d.slice(0, 13)) === +d[13];
};

/**
 * Documento válido para o tipo informado.
 * Campo vazio passa: nem todo cliente de balcão deixa o documento, e travar
 * o cadastro por isso só faz o atendente inventar número.
 */
export const documentoValido = (v?: string | null): boolean => {
  const d = soDigitos(v);
  if (!d) return true;
  if (d.length === 11) return cpfValido(d);
  if (d.length === 14) return cnpjValido(d);
  return false;
};
