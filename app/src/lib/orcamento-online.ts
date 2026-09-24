import { normalizar, txt, brl } from "./format";
import { PROBLEMAS, modelosOrdenados, type Problema, type TabelaServicos } from "./tabela-precos";
import type { OrdemServico, PecaOS, PedidoSite } from "./types";

export type { PedidoSite };

/**
 * Orçamento pelo site da loja (/orcar/:loja).
 *
 * O cliente que procura "troca de tela iPhone 13" no Google escolhe a loja
 * que mostra o preço. Quem manda "chama no WhatsApp para orçamento" perde
 * para quem responde na hora — e perde de madrugada, que é quando a pessoa
 * com a tela quebrada está procurando.
 *
 * O preço vem da MESMA Tabela de serviços do balcão: preço diferente no
 * site e no balcão é a loja parecendo mentirosa.
 *
 * "A partir de": o site não vê o aparelho. A tela pode ser a original ou a
 * paralela, a placa pode ter mais coisa. O valor é o piso, e o texto diz
 * isso com todas as letras.
 */

// ---------- escolha na página ----------

export interface OpcaoModelo {
  id: string;
  marca: string;
  modelo: string;
}

export const marcasDaTabela = (t: TabelaServicos): string[] => {
  const vistas = new Map<string, string>();
  for (const m of t.modelos) {
    const k = normalizar(m.marca);
    if (k && !vistas.has(k)) vistas.set(k, m.marca.trim());
  }
  return [...vistas.values()].sort((a, b) => normalizar(a).localeCompare(normalizar(b)));
};

export const modelosDaMarca = (t: TabelaServicos, marca: string): OpcaoModelo[] =>
  modelosOrdenados(t)
    .filter((m) => normalizar(m.marca) === normalizar(marca))
    .map(({ id, marca: ma, modelo }) => ({ id, marca: ma, modelo }));

/**
 * O menor preço dos serviços daquele problema para o modelo. Nenhum
 * serviço do problema com preço = sem valor ("depois da avaliação").
 */
export function precoAPartirDe(t: TabelaServicos, modeloId: string, problema: Problema): number | null {
  if (problema === "outro") return null;
  const m = t.modelos.find((x) => x.id === modeloId);
  if (!m) return null;
  const valores = t.servicos
    .filter((s) => s.problema === problema)
    .map((s) => m.precos[s.id])
    .filter((v): v is number => typeof v === "number" && v > 0);
  return valores.length ? Math.min(...valores) : null;
}

export const nomeDoProblema = (p: Problema | string): string => PROBLEMAS.find((x) => x.id === p)?.nome || "Outro";

// ---------- horários livres ----------

export interface AgendaSite {
  /** 0 = domingo ... 6 = sábado */
  dias: number[];
  inicio: string; // HH:MM
  fim: string; // HH:MM: o último horário TERMINA aqui
  /** Minutos entre um horário e o próximo */
  intervalo: number;
  /** Quantas avaliações cabem no mesmo horário */
  porHorario: number;
}

export const AGENDA_SITE_PADRAO: AgendaSite = { dias: [1, 2, 3, 4, 5, 6], inicio: "09:00", fim: "18:00", intervalo: 60, porHorario: 1 };

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Conta em UTC: somar hora local desloca o dia conforme o fuso. */
export function somarDiasISO(data: string, n: number): string {
  const [a, m, d] = data.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}
const diaDaSemana = (data: string) => {
  const [a, m, d] = data.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
};

/** Configuração que veio da nuvem pode estar torta: corrige em vez de quebrar a página. */
export function agendaSegura(a: Partial<AgendaSite> | null | undefined): AgendaSite {
  const p = AGENDA_SITE_PADRAO;
  const dias = Array.isArray(a?.dias) ? a!.dias.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : p.dias;
  const inicio = HORA.test(txt(a?.inicio)) ? a!.inicio! : p.inicio;
  const fim = HORA.test(txt(a?.fim)) && minutos(a!.fim!) > minutos(inicio) ? a!.fim! : p.fim;
  const intervalo = Number(a?.intervalo) >= 15 && Number(a?.intervalo) <= 240 ? Math.round(Number(a!.intervalo)) : p.intervalo;
  const porHorario = Number(a?.porHorario) >= 1 && Number(a?.porHorario) <= 20 ? Math.round(Number(a!.porHorario)) : p.porHorario;
  return { dias, inicio, fim, intervalo, porHorario };
}

/** Os horários do dia, sem olhar ocupação. */
export function horariosDoDia(a: AgendaSite, data: string): string[] {
  if (!a.dias.includes(diaDaSemana(data))) return [];
  const saida: string[] = [];
  for (let m = minutos(a.inicio); m + a.intervalo <= minutos(a.fim); m += a.intervalo) saida.push(hhmm(m));
  return saida;
}

/**
 * Horários livres dos próximos dias.
 *
 * Hoje só vale com uma hora de folga: agendar para daqui a dez minutos é o
 * cliente chegando antes de alguém ver o pedido.
 */
export function horariosLivres(
  agenda: AgendaSite,
  ocupados: { data: string; hora: string }[],
  hoje: string,
  agora: string,
  dias = 7
): { data: string; horas: string[] }[] {
  const conta = new Map<string, number>();
  for (const o of ocupados) {
    const k = `${o.data} ${txt(o.hora).slice(0, 5)}`;
    conta.set(k, (conta.get(k) || 0) + 1);
  }
  const folga = HORA.test(agora) ? minutos(agora) + 60 : 0;
  const saida: { data: string; horas: string[] }[] = [];
  for (let i = 0; i < dias; i++) {
    const data = somarDiasISO(hoje, i);
    const horas = horariosDoDia(agenda, data).filter(
      (h) => (i > 0 || minutos(h) >= folga) && (conta.get(`${data} ${h}`) || 0) < agenda.porHorario
    );
    if (horas.length) saida.push({ data, horas });
  }
  return saida;
}

// ---------- pedido ----------


/** Confere o formulário antes de mandar. O banco confere de novo. */
export function problemaNoPedido(p: { nome: string; telefone: string; modelo: string }, canal: "agenda" | "whatsapp"): string {
  if (!p.modelo.trim()) return "Escolha ou escreva o modelo do aparelho.";
  if (canal === "whatsapp") return "";
  if (p.nome.trim().length < 2) return "Escreva seu nome.";
  const tel = p.telefone.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (tel.length < 10 || tel.length > 11) return "Escreva o WhatsApp com DDD.";
  return "";
}

/** Mensagem pronta para o WhatsApp da loja. Sem emoji: em alguns aparelhos chega como "?". */
export function mensagemWhatsApp(p: {
  marca: string;
  modelo: string;
  problema: string;
  detalhe?: string;
  preco?: number | null;
  data?: string | null;
  hora?: string | null;
}): string {
  const aparelho = [p.marca, p.modelo].filter((x) => txt(x).trim()).join(" ");
  const linhas = [`Olá! Vi o orçamento no site. Meu aparelho é ${aparelho}, problema: ${nomeDoProblema(p.problema).toLowerCase()}.`]; // texto-cru-proposital: monta a mensagem, não compara
  if (txt(p.detalhe).trim()) linhas.push(`Detalhe: ${txt(p.detalhe).trim()}`);
  if (p.preco) linhas.push(`O site mostrou a partir de ${brl(p.preco)}.`);
  if (p.data && p.hora) linhas.push(`Agendei a avaliação para ${p.data.split("-").reverse().join("/")} às ${p.hora}.`);
  else linhas.push("Pode me passar o valor e o prazo?");
  return linhas.join("\n");
}

// ---------- lead → OS ----------

/**
 * O que o pedido do site preenche na OS. Não inventa peça: o preço do site
 * vai como item "a partir de", para o técnico trocar depois de abrir.
 */
export function osDoPedido(p: PedidoSite): Pick<OrdemServico, "tipoAparelho" | "marca" | "modelo" | "defeitoRelatado" | "pecas" | "observacoes"> {
  const defeito = [nomeDoProblema(p.problema), txt(p.detalhe).trim()].filter(Boolean).join(": ");
  const pecas: PecaOS[] =
    p.preco && p.preco > 0
      ? [{ descricao: `${nomeDoProblema(p.problema)} - ${[p.marca, p.modelo].filter(Boolean).join(" ")} (a partir de, pelo site)`, quantidade: 1, custoUnit: 0, precoUnit: p.preco }]
      : [];
  return {
    tipoAparelho: "Celular",
    marca: p.marca,
    modelo: p.modelo,
    defeitoRelatado: defeito,
    pecas,
    observacoes: `Pedido pelo site em ${p.criadoEm.slice(0, 10).split("-").reverse().join("/")}.`,
  };
}

/** O cliente já existe? Pelo telefone, que é o que o site pede. */
export function clienteDoPedido<C extends { id: string; telefone?: string }>(p: PedidoSite, clientes: C[]): C | undefined {
  const tel = p.telefone.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (tel.length < 10) return undefined;
  return clientes.find((c) => txt(c.telefone).replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "") === tel);
}

/** Pedidos novos primeiro, e dentro deles o agendado mais cedo. */
export function ordenarPedidos(lista: PedidoSite[]): PedidoSite[] {
  const peso = { novo: 0, convertido: 1, descartado: 2 } as const;
  return [...lista].sort(
    (a, b) =>
      peso[a.status] - peso[b.status] ||
      (a.status === "novo" ? txt(a.data || "9999").localeCompare(txt(b.data || "9999")) : 0) ||
      b.criadoEm.localeCompare(a.criadoEm)
  );
}

/** Cor da loja no site: só hexadecimal, o resto vira a cor da marca do sistema. */
export const corSegura = (c?: string | null): string => (/^#[0-9a-fA-F]{6}$/.test(txt(c)) ? txt(c) : "#bf3f0b");

/** Texto branco ou preto sobre a cor da loja: amarelo com letra branca ninguém lê. */
export function textoSobre(cor: string): "#ffffff" | "#1c1917" {
  const c = corSegura(cor);
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Contraste com branco maior que 4,5:1 → branco.
  return 1.05 / (lum + 0.05) >= 4.5 ? "#ffffff" : "#1c1917";
}
