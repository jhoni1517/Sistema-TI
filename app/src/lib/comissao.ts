import { soData } from "./contas";
import { txt, normalizar, brl, formatDate } from "./format";
import { centavos } from "./pdv";
import { totalOS, lucroOS, totalPecas } from "./calc";
import { mesmoAparelho } from "./imei";
import type { OrdemServico, Config } from "./types";

/**
 * Comissão e produtividade do técnico. É a ÚNICA conta de comissão do
 * sistema (comissao-unica.test.ts reprova conta feita na tela).
 *
 * Cada loja paga de um jeito: sobre o lucro (o padrão, e o mais justo —
 * sobre faturamento, quem usa peça cara recebe mais sem consertar melhor),
 * sobre a mão de obra, sobre a peça, ou um valor fixo por OS. A regra é por
 * técnico; sem regra, vale o percentual padrão sobre o lucro.
 *
 * Só OS ENTREGUE conta: comissão sobre serviço que ainda pode ser cancelado
 * é dinheiro que vai ter que voltar.
 */

export type TipoComissao = "lucro" | "mao_de_obra" | "peca" | "fixo";

export interface RegraComissao {
  tipo: TipoComissao;
  /** % para os três primeiros; R$ por OS no fixo */
  valor: number;
}

export const TIPO_COMISSAO: Record<TipoComissao, string> = {
  lucro: "% sobre o lucro",
  mao_de_obra: "% sobre a mão de obra",
  peca: "% sobre as peças",
  fixo: "R$ fixo por OS",
};

const n = (v?: number | null): number => Number(v) || 0;
export const chaveDoTecnico = (nome?: string | null): string => normalizar(nome) || "sem tecnico";

export function regraDoTecnico(nome: string, config: Pick<Config, "comissaoPadrao" | "regrasComissao">): RegraComissao {
  const r = config.regrasComissao?.[chaveDoTecnico(nome)];
  if (r && TIPO_COMISSAO[r.tipo] && n(r.valor) >= 0) return { tipo: r.tipo, valor: n(r.valor) };
  return { tipo: "lucro", valor: n(config.comissaoPadrao) };
}

export interface Comissao {
  tecnico: string;
  ordens: number;
  faturado: number;
  lucro: number;
  maoDeObra: number;
  pecas: number;
  /** Mantido para as telas antigas: o % quando a regra é percentual */
  percentual: number;
  regra: RegraComissao;
  valor: number;
}

/** A mão de obra que o cliente pagou (o desconto sai dela, não da peça) */
const maoDeObraDa = (o: OrdemServico) => Math.max(0, n(o.maoDeObra) - n(o.desconto));

export function comissoes(
  ordens: OrdemServico[],
  config: Pick<Config, "comissaoPadrao" | "regrasComissao">,
  de?: string,
  ate?: string
): Comissao[] {
  const mapa = new Map<string, Omit<Comissao, "regra" | "valor" | "percentual">>();
  for (const o of ordens) {
    if (o.status !== "entregue") continue;
    const dia = soData(o.entregueEm || o.atualizadoEm);
    if (de && dia < de) continue;
    if (ate && dia > ate) continue;
    const nome = txt(o.tecnico).trim() || "Sem técnico";
    const a = mapa.get(nome) || { tecnico: nome, ordens: 0, faturado: 0, lucro: 0, maoDeObra: 0, pecas: 0 };
    a.ordens += 1;
    a.faturado = centavos(a.faturado + totalOS(o));
    a.lucro = centavos(a.lucro + lucroOS(o));
    a.maoDeObra = centavos(a.maoDeObra + maoDeObraDa(o));
    a.pecas = centavos(a.pecas + totalPecas(o));
    mapa.set(nome, a);
  }

  return [...mapa.values()]
    .map((c) => {
      const regra = regraDoTecnico(c.tecnico, config);
      const base = regra.tipo === "lucro" ? Math.max(0, c.lucro) : regra.tipo === "mao_de_obra" ? c.maoDeObra : regra.tipo === "peca" ? c.pecas : 0;
      // Lucro negativo não gera comissão negativa: descontar do técnico um
      // prejuízo que foi decisão da loja é briga garantida.
      const valor = regra.tipo === "fixo" ? centavos(regra.valor * c.ordens) : centavos(base * (regra.valor / 100));
      return { ...c, regra, percentual: regra.tipo === "fixo" ? 0 : regra.valor, valor };
    })
    .sort((a, b) => b.lucro - a.lucro);
}

// ---------- Produtividade ----------

export interface Produtividade {
  tecnico: string;
  concluidas: number;
  /** Dias, da abertura até ficar pronta (ou entregue, se não marcou pronta) */
  tempoMedio: number | null;
  retornos: number;
  /** % das concluídas que voltaram na garantia */
  retrabalho: number;
  gerado: number;
  /** Horas de mão na OS, pelo cronômetro do modo bancada (só as OS que usaram) */
  horasBancada: number;
  /** Quantas das concluídas têm tempo de bancada: média sobre elas, não sobre todas */
  comCronometro: number;
}

const dias = (de?: string, ate?: string): number | null => {
  const a = Date.parse(soData(de) + "T00:00:00Z");
  const b = Date.parse(soData(ate) + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.round((b - a) / 86400000);
};

/**
 * Quem consertou e quanto voltou.
 *
 * O retorno em garantia é cobrado de quem fez o conserto ORIGINAL, não de
 * quem atendeu a volta: acha-se a OS anterior do mesmo aparelho (IMEI/série)
 * que foi entregue antes. Sem IMEI para ligar as duas, fica com o técnico da
 * própria OS de retorno — é o melhor palpite, e sem ele o número some.
 */
export function produtividade(ordens: OrdemServico[], de?: string, ate?: string): Produtividade[] {
  const noPeriodo = (o: OrdemServico) => {
    const d = soData(o.entregueEm || o.atualizadoEm);
    return (!de || d >= de) && (!ate || d <= ate);
  };
  const mapa = new Map<string, { concluidas: number; tempos: number[]; retornos: number; gerado: number; seg: number; comCron: number }>();
  const pegar = (nome: string) => {
    if (!mapa.has(nome)) mapa.set(nome, { concluidas: 0, tempos: [], retornos: 0, gerado: 0, seg: 0, comCron: 0 });
    return mapa.get(nome)!;
  };

  for (const o of ordens) {
    if (o.status !== "entregue" || !noPeriodo(o)) continue;
    const t = pegar(txt(o.tecnico).trim() || "Sem técnico");
    t.concluidas++;
    t.gerado = centavos(t.gerado + totalOS(o));
    const d = dias(o.criadoEm, o.prontaEm || o.entregueEm);
    if (d !== null) t.tempos.push(d);
    const seg = Number(o.bancada?.acumulado) || 0;
    if (seg > 0) {
      t.seg += seg;
      t.comCron++;
    }
  }

  for (const r of ordens) {
    if (!r.retornoGarantia || !noPeriodo({ ...r, entregueEm: r.criadoEm } as OrdemServico)) continue;
    const original = ordens
      .filter((o) => o.id !== r.id && o.status === "entregue" && mesmoAparelho(o.imeiSerial, r.imeiSerial) && soData(o.entregueEm) <= soData(r.criadoEm))
      .sort((a, b) => soData(b.entregueEm).localeCompare(soData(a.entregueEm)))[0];
    pegar(txt((original || r).tecnico).trim() || "Sem técnico").retornos++;
  }

  return [...mapa.entries()]
    .map(([tecnico, t]) => ({
      tecnico,
      concluidas: t.concluidas,
      tempoMedio: t.tempos.length ? Math.round((t.tempos.reduce((s, x) => s + x, 0) / t.tempos.length) * 10) / 10 : null,
      retornos: t.retornos,
      retrabalho: t.concluidas ? Math.round((t.retornos / t.concluidas) * 100) : 0,
      gerado: t.gerado,
      horasBancada: Math.round((t.seg / 3600) * 10) / 10,
      comCronometro: t.comCron,
    }))
    .sort((a, b) => b.concluidas - a.concluidas || a.tecnico.localeCompare(b.tecnico));
}

// ---------- Fechamento ----------

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Recibo do fechamento do mês, para imprimir e o técnico assinar */
export function reciboComissao(c: Comissao, mes: string, nomeLoja: string): string {
  const [a, m] = mes.split("-");
  const base =
    c.regra.tipo === "fixo"
      ? `${c.ordens} OS × ${brl(c.regra.valor)}`
      : `${c.regra.valor}% ${TIPO_COMISSAO[c.regra.tipo].replace("% ", "")} (${brl(c.regra.tipo === "lucro" ? Math.max(0, c.lucro) : c.regra.tipo === "mao_de_obra" ? c.maoDeObra : c.pecas)})`;
  return `
  <div style="font-family:Arial,Helvetica,sans-serif">
    <h2 style="margin:0">${esc(nomeLoja || "Loja")}</h2>
    <h3 style="margin:6px 0 14px">Recibo de comissão · ${m}/${a}</h3>
    <p>Técnico: <b>${esc(c.tecnico)}</b></p>
    <p>OS entregues no mês: ${c.ordens}</p>
    <p>Faturado: ${brl(c.faturado)} · Lucro: ${brl(c.lucro)}</p>
    <p>Regra: ${esc(base)}</p>
    <p style="font-size:18px;margin-top:10px">Comissão: <b>${brl(c.valor)}</b></p>
    <p style="margin-top:40px">Recebi a quantia acima em ____/____/______.</p>
    <p style="margin-top:40px;border-top:1px solid #000;width:70%;padding-top:4px">${esc(c.tecnico)}</p>
    <p style="font-size:10px;color:#555;margin-top:20px">Emitido em ${formatDate(new Date().toISOString().slice(0, 10))}</p>
  </div>`;
}
