import { normalizar } from "./busca";
import { txt } from "./format";
import type { OrdemServico, VersaoWindows } from "./types";

/**
 * Perguntas que só existem para ALGUNS aparelhos e ALGUNS serviços.
 *
 * Campo que aparece sempre vira campo que ninguém preenche. Estas duas
 * perguntas só fazem sentido num caso cada uma, e é só nele que a tela as
 * mostra — igual à regra do ramo: IMEI não aparece para motor.
 *
 *   FORMATAÇÃO ....... qual Windows vai ser instalado
 *   NOTEBOOK ......... deixou a fonte? qual?
 */

/* ------------------------------------------------------------------ */
/* Qual Windows                                                        */
/* ------------------------------------------------------------------ */

/**
 * As versões que a loja instala.
 *
 * Perguntar na ENTRADA, e não na bancada: o técnico que descobre na hora de
 * instalar que ninguém perguntou tem que parar e ligar para o cliente — e
 * o cliente que pediu 11 Pro e recebeu 10 Lite volta reclamando.
 */
export const WINDOWS_META: Record<VersaoWindows, { label: string }> = {
  "10_lite": { label: "Windows 10 Lite" },
  "10_pro": { label: "Windows 10 Pro" },
  "11_pro": { label: "Windows 11 Pro" },
};

export const versaoWindowsDe = (v?: string | null): VersaoWindows | undefined =>
  v && v in WINDOWS_META ? (v as VersaoWindows) : undefined;

/**
 * O que caracteriza um serviço que instala sistema.
 *
 * Lista própria, e não a do aviso de backup: troca de SSD apaga os dados
 * mas não diz que vai instalar Windows (pode ser clonagem). Aqui só entra o
 * que é, com certeza, sistema novo. Sem acento, porque a comparação é feita
 * sem acento dos dois lados — quem digita no balcão escreve "formatacao".
 */
const INSTALA_SISTEMA = [
  "formata",
  "reinstala",
  "instala windows",
  "instalacao de windows",
  "instalacao do windows",
  "sistema operacional",
];

/**
 * Esta OS vai instalar Windows? Olha as peças/serviços e o defeito.
 *
 * O defeito entra porque o cliente diz "quero formatar" no balcão e isso é
 * digitado ali, antes de alguém lançar o serviço na lista de peças.
 */
export function pedeWindows(o: Pick<OrdemServico, "pecas" | "defeitoRelatado" | "defeitoConstatado">): boolean {
  const alvo = normalizar(
    [
      txt(o.defeitoRelatado),
      txt(o.defeitoConstatado),
      ...(o.pecas || []).map((p) => txt(p.descricao)),
    ].join(" ")
  );
  return INSTALA_SISTEMA.some((t) => alvo.includes(t));
}

/* ------------------------------------------------------------------ */
/* Fonte / carregador do notebook                                      */
/* ------------------------------------------------------------------ */

/**
 * O aparelho é notebook?
 *
 * Por pedaço do texto e sem caixa: o tipo vem de uma lista, mas OS antiga
 * pode ter "NOTEBOOK" ou "notebook gamer" digitado à mão.
 */
export const ehNotebook = (tipo?: string | null): boolean =>
  normalizar(txt(tipo)).includes("notebook");

/**
 * Por que perguntar da fonte: é o acessório que mais some e o mais caro de
 * repor. "Eu deixei a fonte aí" na retirada, sem nada escrito, vira palavra
 * contra palavra — e fonte original de notebook custa centenas de reais.
 *
 * Três estados e não dois: `undefined` é "ninguém perguntou", que é
 * diferente de "perguntou e ele não deixou". Só o segundo protege a loja.
 */
export function problemaNaFonte(
  o: Pick<OrdemServico, "tipoAparelho" | "fonteDeixada" | "fonteModelo">
): string {
  if (!ehNotebook(o.tipoAparelho)) return "";
  if (o.fonteDeixada === true && !txt(o.fonteModelo).trim()) {
    /*
     * "Deixou a fonte" sem dizer qual não protege ninguém: na retirada o
     * cliente diz que a dele era a original de 90W e a que está na gaveta
     * é uma genérica de 65W. O modelo escrito no papel assinado é a prova.
     */
    return "Informe o modelo da fonte/carregador que o cliente deixou (ex.: Dell 65W original).";
  }
  return "";
}

/** O texto da fonte para o recibo e o detalhe. Vazio quando não se aplica. */
export function textoDaFonte(
  o: Pick<OrdemServico, "tipoAparelho" | "fonteDeixada" | "fonteModelo">
): string {
  if (!ehNotebook(o.tipoAparelho) || o.fonteDeixada === undefined) return "";
  if (!o.fonteDeixada) return "Não deixou";
  return `Deixou — ${txt(o.fonteModelo).trim() || "modelo não informado"}`;
}
