export const uid = (): string =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/**
 * Texto seguro para buscas e ordenações.
 * As colunas da nuvem aceitam nulo; sem isso, um registro incompleto
 * quebra a tela inteira ao chamar .toLowerCase()/.includes().
 */
export const txt = (v?: string | null): string => (v ?? "").toString();

/**
 * Minúsculo, sem acento: é assim que os dois lados são comparados.
 *
 * Mora aqui, no arquivo que não importa ninguém, porque quase todo lugar do
 * sistema precisa dela — inclusive `calc.ts`, que a busca já importa. Se
 * ficasse em `busca.ts`, o caminho de volta viraria import circular.
 *
 * Quem atende digita "acucar", "pao", "agua", "feijao"; o cadastro tem
 * "Açúcar", "Pão", "Água", "Feijão". Comparar com `.toLowerCase()` resolve a
 * maiúscula e deixa o acento — e o operador conclui que o produto não está
 * cadastrado. Ver `busca-sem-acento.test.ts`.
 */
export const normalizar = (v?: string | null): string =>
  txt(v)
    .toLowerCase() // texto-cru-proposital: é ESTA a função que normaliza
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

/**
 * Negrito do WhatsApp.
 *
 * Espaço encostado no asterisco CANCELA a formatação: "*NOVA GERAÇÃO *" chega
 * no celular do cliente com os asteriscos à mostra e sem negrito nenhum. Um
 * espaço sobrando no fim do nome da loja — que ninguém enxerga no campo de
 * cadastro, porque espaço não se vê — estragava assim a primeira linha de
 * toda mensagem que a loja mandava, na cobrança e na cotação também.
 *
 * Todo negrito que embrulha texto digitado por gente passa por aqui.
 */
export const negrito = (v?: string | null): string => `*${txt(v).trim()}*`;

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

export const monthKey = (iso?: string | null): string => txt(iso).slice(0, 7); // YYYY-MM

export const dayKey = (iso?: string | null): string => txt(iso).slice(0, 10); // YYYY-MM-DD

export const isToday = (iso?: string): boolean => {
  if (!iso) return false;
  return dayKey(iso) === dayKey(nowISO());
};

/** Limpa telefone e monta link do WhatsApp com mensagem pronta */
export const whatsappLink = (telefone: string, mensagem: string): string => {
  const num = telefone.replace(/\D/g, "");
  // Sem número, o wa.me abre a lista de contatos com o texto pronto. Montar
  // "wa.me/55" nesse caso levaria para um número inexistente.
  if (!num) return `https://wa.me/?text=${encodeURIComponent(mensagem)}`;
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

/**
 * Texto digitado -> número.
 *
 * Existe porque `+e.target.value` transforma campo vazio em zero, e aí o
 * input controlado devolve "0" na tela no mesmo instante: apagar o zero
 * ficava impossível, e a pessoa tinha que digitar outro número antes de
 * conseguir tirar ele. Aqui o vazio continua vazio, e quem decide o que
 * fazer com isso é quem chama.
 *
 * Aceita vírgula porque o teclado do celular brasileiro oferece vírgula, e
 * "12,50" virava NaN.
 */
export const paraNumero = (texto: string): number | undefined => {
  const limpo = txt(texto).replace(/\s/g, "").replace(",", ".");
  if (limpo === "" || limpo === "-" || limpo === "." || limpo === "-.") return undefined;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : undefined;
};

/** Número -> texto do campo. Undefined e NaN viram campo vazio, não "0". */
export const paraTexto = (v?: number | null): string =>
  v === undefined || v === null || Number.isNaN(v) ? "" : String(v);

/**
 * O que fica no campo depois de a pessoa digitar.
 *
 * O campo de quantidade nasce mostrando "0". Digitar 5 no fim dele deixa
 * "05" — e o "05" FICAVA na tela, porque o campo só se reescreve quando o
 * NÚMERO muda, e 05 e 5 são o mesmo número. A pessoa tinha que digitar o
 * valor e voltar para apagar o zero, item por item, com a fila andando.
 *
 * O zero só cai quando vem outro dígito atrás dele. "0" sozinho continua
 * "0" — é um valor legítimo — e "0," continua, senão seria impossível
 * digitar "0,50".
 */
export const textoDigitado = (bruto: string, anterior = ""): string => {
  // Só o que pode fazer parte de um número: letra some antes de aparecer
  const limpo = txt(bruto).replace(/[^\d.,-]/g, "");

  /*
   * Campo que valia exatamente "0": a PRIMEIRA tecla substitui o zero,
   * esteja o cursor antes ou depois dele.
   *
   * Tirar zero à esquerda resolve quem digita no fim ("05" -> "5"), mas não
   * quem toca no começo: ali "7" virava "70", que é setenta. No celular o
   * dedo cai onde cai, e os dois casos têm que dar no mesmo lugar.
   *
   * Vale só quando o campo valia "0" — ou seja, na primeira tecla. Quem
   * quer setenta digita 7 e depois 0: na segunda tecla o campo já vale "7"
   * e esta regra não se aplica.
   */
  if (anterior === "0" && /^(0\d|\d0)$/.test(limpo)) return limpo.replace("0", "");

  return limpo.replace(/^(-?)0+(\d)/, "$1$2");
};
