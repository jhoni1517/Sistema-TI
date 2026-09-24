import { txt, normalizar, codigoOS } from "./format";
import { soData, hojeISO, diasAteVencer } from "./contas";
import type { Cliente, OrdemServico } from "./types";

/**
 * Lembretes que trazem o cliente de volta.
 *
 * Quem trocou a bateria há um ano vai precisar de novo, e quem pôs película
 * há seis meses já está com ela riscada. Se a loja não lembrar, a próxima
 * compra acontece na loja do shopping. Aqui cada serviço entregue vira uma
 * data de "chamar de novo" — e a lista do dia sai com o texto pronto.
 *
 * Nada dispara sozinho (mesma regra de "Quem chamar hoje"): a loja escolhe
 * quem chamar. E "chamado" fica marcado na própria OS, para não repetir.
 */

export interface RegraLembrete {
  id: string;
  /** Palavra que aparece na peça ou no defeito: "bateria", "película" */
  palavra: string;
  meses: number;
  /** O que oferecer, no fim do recado: "uma revisão da bateria" */
  oferta: string;
}

export const REGRAS_PADRAO: RegraLembrete[] = [
  { id: "bateria", palavra: "bateria", meses: 12, oferta: "uma revisão da bateria" },
  { id: "pelicula", palavra: "película", meses: 6, oferta: "trocar a película por uma nova" },
  { id: "limpeza", palavra: "limpeza", meses: 12, oferta: "uma nova limpeza interna" },
];

/** Depois disto o lembrete sai da lista: um ano atrasado já não é lembrete */
export const JANELA_DIAS = 60;

/** Soma meses a uma data AAAA-MM-DD, sem pular mês: 31/01 + 1 = 28/02 */
export function somarMeses(dia: string, meses: number): string {
  const d = new Date(soData(dia) + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return "";
  const ano = d.getUTCFullYear();
  const mes = d.getUTCMonth() + meses;
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ano, mes, Math.min(d.getUTCDate(), ultimo))).toISOString().slice(0, 10);
}

/** O que foi feito na OS, num texto só para procurar a palavra */
const textoDaOS = (o: OrdemServico): string =>
  normalizar(
    [o.defeitoRelatado, o.defeitoConstatado, ...(o.pecas || []).filter((p) => !txt(p.opcao).trim() || txt(p.opcao).trim() === txt(o.opcaoEscolhida).trim()).map((p) => p.descricao)].join(" ")
  );

export const regraCasa = (o: OrdemServico, r: RegraLembrete): boolean =>
  !!normalizar(r.palavra) && textoDaOS(o).includes(normalizar(r.palavra));

export interface Lembrete {
  chave: string;
  os: OrdemServico;
  cliente: Cliente;
  regra: RegraLembrete;
  /** Quando chamar (AAAA-MM-DD) */
  quando: string;
  /** Dias de atraso em relação a quando (0 = hoje) */
  atraso: number;
}

/**
 * Quem chamar hoje. Entra se:
 *  - a OS foi entregue e casa com a regra;
 *  - a data de chamar já chegou e não passou da janela;
 *  - ainda não foi marcado como chamado nesta OS;
 *  - o cliente não voltou depois para o mesmo serviço (já trocou de novo);
 *  - o cliente tem telefone (sem telefone não tem como chamar).
 */
export function lembretesDoDia(
  ordens: OrdemServico[],
  clientes: Cliente[],
  regras: RegraLembrete[] = REGRAS_PADRAO,
  hoje = hojeISO()
): Lembrete[] {
  const porId = new Map(clientes.map((c) => [c.id, c]));
  const lista: Lembrete[] = [];
  for (const o of ordens) {
    if (o.status !== "entregue" || !o.entregueEm) continue;
    const cliente = porId.get(o.clienteId);
    if (!cliente || txt(cliente.telefone).replace(/\D/g, "").length < 10) continue;
    for (const r of regras) {
      if (!(r.meses > 0) || !regraCasa(o, r)) continue;
      if ((o.lembretesFeitos || []).includes(r.id)) continue;
      const quando = somarMeses(soData(o.entregueEm), r.meses);
      const atraso = diasAteVencer(hoje, quando);
      if (atraso < 0 || atraso > JANELA_DIAS) continue;
      const voltou = ordens.some(
        (x) => x.id !== o.id && x.clienteId === o.clienteId && soData(x.criadoEm) > soData(o.entregueEm) && regraCasa(x, r)
      );
      if (voltou) continue;
      lista.push({ chave: `${o.id}:${r.id}`, os: o, cliente, regra: r, quando, atraso });
    }
  }
  return lista.sort((a, b) => b.atraso - a.atraso);
}

/** O recado pronto. Sem emoji: chega como "?" em alguns aparelhos. */
export function mensagemDoLembrete(l: Lembrete, nomeLoja: string): string {
  const primeiro = txt(l.cliente.nome).trim().split(/\s+/)[0] || "";
  const aparelho = [l.os.marca, l.os.modelo].map((x) => txt(x).trim()).filter(Boolean).join(" ") || "seu aparelho";
  const tempo = l.regra.meses === 12 ? "um ano" : l.regra.meses % 12 === 0 ? `${l.regra.meses / 12} anos` : `${l.regra.meses} meses`;
  return [
    `Oi${primeiro ? `, ${primeiro}` : ""}! Aqui é da ${txt(nomeLoja).trim() || "loja"}.`,
    "",
    `Faz ${tempo} que cuidamos do ${aparelho} (${codigoOS(l.os.numero)}). Que tal ${txt(l.regra.oferta).trim() || "passar aqui para uma revisão"}?`,
    "É só responder aqui que a gente combina o melhor horário.",
  ].join("\n");
}

/** A OS com o lembrete marcado como feito, para não aparecer de novo */
export const marcarChamado = (o: OrdemServico, regraId: string): OrdemServico => ({
  ...o,
  lembretesFeitos: [...new Set([...(o.lembretesFeitos || []), regraId])],
});

/** Regra editada na tela: sem palavra ou sem meses não vale */
export const regrasValidas = (regras: RegraLembrete[]): RegraLembrete[] =>
  regras
    .map((r) => ({ ...r, palavra: txt(r.palavra).trim(), meses: Math.round(Number(r.meses) || 0), oferta: txt(r.oferta).trim() }))
    .filter((r) => r.palavra && r.meses > 0 && r.meses <= 60);
