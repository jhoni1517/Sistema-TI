import { txt } from "./format";

/**
 * Indique e ganhe: lojista indica lojista.
 *
 * Quem dá o bônus é o banco (supabase-migracao-indicacao.sql): 30 dias a
 * mais para a loja nova, 1 mês para quem indicou quando a nova pagar. Aqui
 * mora só o que a tela precisa: o link, o recado e o código guardado entre
 * abrir o link e a conta ficar pronta — que pode levar dias (convite,
 * e-mail de confirmação).
 */

/** O código viaja no aparelho até a loja nova existir */
export const INDICACAO_PENDENTE = "sistema-ti:indicacao-pendente";

/** Código como o banco guarda: 6 letras e números, maiúsculo */
export const normalizarCodigo = (v?: string | null): string =>
  txt(v).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);

export const codigoValido = (v?: string | null): boolean => /^[A-Z2-9]{6}$/.test(normalizarCodigo(v));

export const linkDeIndicacao = (origem: string, codigo?: string | null): string => {
  const c = normalizarCodigo(codigo);
  return c ? `${origem}#/indicar/${c}` : "";
};

/** Recado para o lojista mandar no WhatsApp. Sem emoji: chega como "?". */
export function mensagemDeIndicacao(nomeLoja: string, link: string): string {
  const loja = txt(nomeLoja).trim();
  return [
    `Oi! Aqui é ${loja ? `da ${loja}` : "eu"}.`,
    "",
    "Uso um sistema na loja que resolveu minha vida: ordem de serviço, caixa, estoque e o cliente acompanha o conserto pelo celular.",
    "",
    "Entrando por este link você ganha 30 dias a mais de teste grátis:",
    link,
  ].join("\n");
}

/** Recado de quem abriu o link e quer a conta. Leva o código junto. */
export const mensagemQueroPorIndicacao = (nomeQuemIndicou: string, codigo: string): string =>
  `Oi! A ${txt(nomeQuemIndicou).trim() || "uma loja"} me indicou o Sistema TI (código ${normalizarCodigo(codigo)}). Quero criar a conta da minha loja.`;

export type SituacaoIndicada = "em_teste" | "pagou" | "nao_pagou";

export const SITUACAO_INDICADA: Record<SituacaoIndicada, { texto: string; cor: string }> = {
  em_teste: { texto: "Testando", cor: "bg-concreto text-tinta" },
  pagou: { texto: "Pagou: você ganhou 1 mês", cor: "bg-status-pronta text-white" },
  nao_pagou: { texto: "Não assinou", cor: "bg-concreto text-tinta-suave" },
};

export const situacaoIndicada = (v: unknown): SituacaoIndicada =>
  v === "pagou" || v === "nao_pagou" ? v : "em_teste";

/** "2 indicadas, 1 pagou: 1 mês ganho" */
export function resumoIndicacoes(lista: { situacao: SituacaoIndicada }[]): string {
  if (lista.length === 0) return "Nenhuma loja entrou pelo seu link ainda.";
  const pagas = lista.filter((x) => x.situacao === "pagou").length;
  const n = lista.length;
  return (
    `${n} ${n === 1 ? "loja entrou" : "lojas entraram"} pelo seu link` +
    (pagas ? `, ${pagas} ${pagas === 1 ? "pagou" : "pagaram"}: ${pagas} ${pagas === 1 ? "mês ganho" : "meses ganhos"}.` : ".")
  );
}
