import { txt, codigoOS, brl } from "./format";
import { hojeISO, diasAteVencer } from "./contas";
import type { Config, OrdemServico } from "./types";

/**
 * Os prazos que a lei conta pela loja.
 *
 * São dois relógios diferentes, e os dois acabam em problema quando ninguém
 * olha:
 *
 * 1. **Retorno em garantia** — o cliente voltou porque o conserto não
 *    resolveu. O CDC (art. 18, § 1º) dá 30 dias corridos para sanar o
 *    vício; passou disso, o cliente pode exigir o dinheiro de volta ou outro
 *    aparelho. Na assistência, o que costuma acontecer é o retorno ficar
 *    esperando peça, ninguém lembrar, e o prazo estourar em silêncio — o
 *    primeiro aviso vem do Procon.
 *
 * 2. **Aparelho pronto e não retirado** — cada mês na prateleira é espaço
 *    de bancada, risco de extravio e, lá no fim, uma discussão sobre
 *    abandono. Os avisos em 30, 60 e 90 dias deixam registro de que a loja
 *    chamou, que é o que protege a loja quando o cliente reaparece.
 *
 * As datas seguem a regra da casa: texto AAAA-MM-DD, conta em UTC. Só o
 * DIA de um instante gravado (criadoEm, prontaEm) é lido no fuso do
 * balcão — uma OS aberta às 22h de segunda é de segunda, não de terça.
 */

/** Dias corridos que o CDC dá para sanar o vício (art. 18, § 1º) */
export const PRAZO_CONSERTO_DIAS = 30;

/** A partir de quantos dias restantes o selo passa a avisar */
export const AVISO_PRAZO_DIAS = 7;

/** Os marcos do aparelho pronto e não retirado */
export const MARCOS_ABANDONO = [30, 60, 90] as const;
export type MarcoAbandono = (typeof MARCOS_ABANDONO)[number];

/**
 * O dia (AAAA-MM-DD) de um instante gravado, no relógio do balcão.
 *
 * `soData` pegaria o dia de Greenwich: das 21h à meia-noite, a OS aberta
 * hoje contaria como aberta amanhã, e o prazo ganharia um dia que não tem.
 * Data pura (sem hora) passa direto.
 */
export function diaLocal(iso?: string | null): string {
  const s = txt(iso);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return "";
  const d = new Date(t);
  return new Date(t - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

const somaDias = (dia: string, n: number): string =>
  new Date(Date.parse(dia + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);

const ddmm = (dia: string): string => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

/* ------------------------------------------------------------------ */
/* 1. Retorno em garantia: 30 dias corridos da abertura                */
/* ------------------------------------------------------------------ */

export type SituacaoPrazo = "no_prazo" | "vence_logo" | "vencido";

/**
 * Cores do selo, dos tokens de docs/DESIGN.md. Fundo cheio sempre: status
 * como letra colorida some no modo escuro.
 */
export const PRAZO_META: Record<SituacaoPrazo, { cor: string }> = {
  no_prazo: { cor: "bg-concreto text-tinta" },
  vence_logo: { cor: "bg-status-aprovacao text-white" },
  vencido: { cor: "bg-status-cancelada text-white" },
};

export interface PrazoConserto {
  situacao: SituacaoPrazo;
  /** Último dia do prazo (AAAA-MM-DD) */
  limite: string;
  /** Negativo = venceu há tantos dias */
  diasRestantes: number;
  /** Curto, para o selo */
  texto: string;
}

/**
 * O prazo de um retorno em garantia.
 *
 * Nulo quando a OS não é retorno, ou quando o conserto já saiu da bancada
 * (pronta, entregue, cancelada): aí o relógio parou, e um selo vermelho
 * numa OS resolvida é o tipo de alarme que ensina a ignorar alarme.
 *
 * Conta da ABERTURA, não da entrega: é quando o cliente trouxe o aparelho
 * de volta que o prazo de sanar o vício começa.
 */
export function prazoDoConserto(o: OrdemServico, hoje = hojeISO()): PrazoConserto | null {
  if (!o.retornoGarantia) return null;
  if (o.status === "pronta" || o.status === "entregue" || o.status === "cancelada") return null;
  const inicio = diaLocal(o.criadoEm);
  if (!inicio) return null;

  const limite = somaDias(inicio, PRAZO_CONSERTO_DIAS);
  const r = diasAteVencer(limite, hoje);

  if (r < 0) {
    return { situacao: "vencido", limite, diasRestantes: r, texto: `Prazo CDC vencido há ${-r} dia(s)` };
  }
  if (r <= AVISO_PRAZO_DIAS) {
    return {
      situacao: "vence_logo",
      limite,
      diasRestantes: r,
      texto: r === 0 ? "Prazo CDC vence hoje" : `Prazo CDC vence em ${r} dia(s)`,
    };
  }
  return { situacao: "no_prazo", limite, diasRestantes: r, texto: `No prazo CDC (${r} dias)` };
}

/* ------------------------------------------------------------------ */
/* 2. Pronto e não retirado: avisos em 30, 60 e 90 dias                */
/* ------------------------------------------------------------------ */

export interface AlertaAbandono {
  marco: MarcoAbandono;
  /** Dias desde que ficou pronta */
  diasParado: number;
  /** Dia em que ficou pronta (AAAA-MM-DD) */
  desde: string;
  texto: string;
}

export const ABANDONO_META: Record<MarcoAbandono, { cor: string }> = {
  30: { cor: "bg-concreto text-tinta" },
  60: { cor: "bg-status-aprovacao text-white" },
  90: { cor: "bg-status-cancelada text-white" },
};

/**
 * Em que marco está o aparelho parado. Nulo antes de 30 dias, ou quando a
 * OS não está pronta (entregue saiu da loja; em reparo ainda é da loja).
 */
export function alertaDeAbandono(o: OrdemServico, hoje = hojeISO()): AlertaAbandono | null {
  if (o.status !== "pronta") return null;
  const desde = diaLocal(o.prontaEm);
  if (!desde) return null;
  const diasParado = diasAteVencer(hoje, desde);
  const marco = [...MARCOS_ABANDONO].reverse().find((m) => diasParado >= m);
  if (!marco) return null;
  return { marco, diasParado, desde, texto: `Pronto há ${diasParado} dias` };
}

/**
 * A mensagem de WhatsApp de cada marco, pronta para mandar.
 *
 * Sobe o tom de um marco para o outro, mas nunca ameaça: quem esqueceu o
 * celular na loja não é inimigo, e mensagem agressiva no dia 30 faz a
 * pessoa sumir de vez. O de 90 lembra o termo que o cliente assinou,
 * porque é o que vale se chegar a haver discussão.
 *
 * Sem emoji: em alguns aparelhos chegam como "?".
 */
export function mensagemDeAbandono(
  o: OrdemServico,
  cliente: { nome?: string } | undefined,
  config: Pick<Config, "nomeLoja" | "horarioAtendimento" | "enderecoLoja" | "diasAbandono" | "taxaArmazenamentoDia">,
  hoje = hojeISO()
): string {
  const a = alertaDeAbandono(o, hoje);
  if (!a) return "";

  const nome = txt(cliente?.nome).trim().split(/\s+/)[0];
  const loja = txt(config.nomeLoja).trim() || "a assistência";
  const aparelho = [txt(o.marca), txt(o.modelo)].filter(Boolean).join(" ") || "seu aparelho";
  const cod = codigoOS(o.numero);
  const onde = [txt(config.enderecoLoja).trim(), txt(config.horarioAtendimento).trim()]
    .filter(Boolean)
    .join(" - ");

  const partes: string[] = [`Oi${nome ? `, ${nome}` : ""}! Aqui é da ${loja}.`];

  if (a.marco === 30) {
    partes.push(
      `Seu ${aparelho} (${cod}) tá pronto desde ${ddmm(a.desde)} e ainda tá aqui com a gente. ` +
        "Pode vir buscar quando quiser."
    );
  } else if (a.marco === 60) {
    const taxa = Number(config.taxaArmazenamentoDia) || 0;
    partes.push(
      `Seu ${aparelho} (${cod}) tá pronto há ${a.diasParado} dias esperando você. ` +
        "Consegue passar essa semana?" +
        (taxa > 0 ? ` Lembrando que depois do prazo de retirada entra a taxa de guarda de ${brl(taxa)} por dia.` : "")
    );
  } else {
    const prazo = Number(config.diasAbandono) || 90;
    partes.push(
      `Seu ${aparelho} (${cod}) tá pronto há ${a.diasParado} dias. ` +
        `Pelo termo assinado na entrada, depois de ${prazo} dias sem retirada o aparelho ` +
        "pode ser considerado abandonado. Passa aqui ou responde esta mensagem pra gente combinar."
    );
  }

  if (onde) partes.push(onde);
  return partes.join("\n\n");
}

/* ------------------------------------------------------------------ */
/* O card do painel                                                    */
/* ------------------------------------------------------------------ */

export type PrazoEmRisco =
  | { tipo: "conserto"; os: OrdemServico; prazo: PrazoConserto; peso: number }
  | { tipo: "abandono"; os: OrdemServico; alerta: AlertaAbandono; peso: number };

/**
 * O que precisa de ação, do mais urgente para o menos.
 *
 * Retorno em garantia vencido ou vencendo vem primeiro: é prazo legal, e
 * o próximo passo depois dele é o cliente com direito a pedir o dinheiro
 * de volta. Retorno ainda folgado não entra — o card é de RISCO, e item
 * tranquilo nele é ruído. Abandono entra a partir de 30 dias, o mais antigo
 * primeiro.
 */
export function prazosEmRisco(ordens: OrdemServico[], hoje = hojeISO()): PrazoEmRisco[] {
  const lista: PrazoEmRisco[] = [];
  for (const os of ordens) {
    const prazo = prazoDoConserto(os, hoje);
    if (prazo && prazo.situacao !== "no_prazo") {
      // Vencido pesa mais que qualquer abandono; entre eles, o mais atrasado.
      lista.push({ tipo: "conserto", os, prazo, peso: 100000 - prazo.diasRestantes });
    }
    const alerta = alertaDeAbandono(os, hoje);
    if (alerta) lista.push({ tipo: "abandono", os, alerta, peso: alerta.diasParado });
  }
  return lista.sort((a, b) => b.peso - a.peso);
}

/* ------------------------------------------------------------------ */
/* O termo impresso                                                    */
/* ------------------------------------------------------------------ */

/**
 * O parágrafo de garantia do papel que o cliente assina.
 *
 * O recibo imprimia o termo de guarda e nada sobre garantia. Os 90 dias do
 * CDC (art. 26, II) valem com ou sem papel — a loja não escolhe dar ou não —
 * e ter isso impresso encerra a discussão do "vocês não me falaram".
 *
 * A garantia da LOJA (`garantiaDias`) sai à parte, só quando cadastrada:
 * inventar prazo que a loja não combinou é o erro que `lib/garantia.ts` já
 * evita.
 */
export function termoDeGarantia(o: Pick<OrdemServico, "garantiaDias">): string {
  const legal =
    "Garantia legal: 90 dias, contados da entrega, para reclamar de defeito no serviço " +
    "realizado (Código de Defesa do Consumidor, art. 26, II).";
  const dias = Number(o.garantiaDias) || 0;
  if (dias <= 0) return legal;
  return `${legal} Garantia da loja: ${dias} dias a partir da entrega.`;
}

