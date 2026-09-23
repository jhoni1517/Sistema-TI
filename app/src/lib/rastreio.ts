import { codigoOS, txt, whatsappLink } from "./format";
import { soData, hojeISO, diasAteVencer } from "./contas";
import { ACCENTS } from "./themes";
import { OS_STATUS_META, type OrdemServico, type OSStatus } from "./types";

/**
 * O link da página pública de acompanhamento.
 *
 * ## Por que existe um segredo no link
 *
 * O link leva o UUID da loja — precisa levar, porque a consulta pública é
 * por loja e número. E o número da OS é sequencial de propósito: é o que o
 * cliente lê no balcão e repete no telefone.
 *
 * Juntas, as duas coisas abriam a assistência inteira. Quem recebia um link
 * — todo cliente, e qualquer pessoa para quem ele encaminhasse — trocava o 7
 * por 1, 2, 3 e via primeiro nome, aparelho e valor de cada conserto da
 * loja. Nem era preciso montar URL: a própria página tinha um campo de busca
 * por número.
 *
 * Pior que ler era responder. `responder_orcamento` também pedia só loja e
 * número, e aceitava recusa — dava para percorrer a fila e CANCELAR, um por
 * um, todos os orçamentos aguardando aprovação.
 *
 * O código da OS não pode virar senha: ele é curto e sequencial porque
 * precisa ser. Então quem faz o papel de senha é um segredo por ordem,
 * sorteado no banco e que só existe dentro do link.
 *
 * ## Link antigo
 *
 * Link já enviado, sem o segredo, para de funcionar — não tem como aceitar
 * os dois e ao mesmo tempo impedir a adivinhação, porque o link antigo é
 * justamente o que se adivinha. A tela diz isso com todas as letras e manda
 * pedir um link novo, em vez de "ordem não encontrada", que faria o cliente
 * conferir um código que está certo.
 */

/** Nome do parâmetro do segredo na URL. Curto porque o link vai no WhatsApp. */
const PARAM = "t";

/**
 * Link completo, pronto para mandar. Vazio quando falta a loja ou o segredo:
 * é melhor não oferecer link do que mandar um que vai ser recusado na cara
 * do cliente.
 */
export function linkDeRastreio(
  origem: string,
  loja: string | null | undefined,
  os: Pick<OrdemServico, "numero" | "rastreio">
): string {
  const l = txt(loja).trim();
  const t = txt(os.rastreio).trim();
  if (!l || !t) return "";
  return `${origem}#/rastreio/${codigoOS(os.numero)}?loja=${encodeURIComponent(
    l
  )}&${PARAM}=${encodeURIComponent(t)}`;
}

/** O segredo que veio no endereço da página */
export const tokenDoLink = (hash: string): string =>
  new URLSearchParams(txt(hash).split("?")[1] || "").get(PARAM) || "";

/**
 * O que impede esta consulta, em português, já dizendo a saída.
 *
 * Vazio = o link está completo.
 */
export function problemaNoLink(loja: string, token: string): string {
  if (txt(loja).trim() && txt(token).trim()) return "";
  return (
    "Esse link tá incompleto ou é antigo. " +
    "Pede um novo pra loja — o número da sua OS continua o mesmo."
  );
}

/* ============================================================
 * A página no jeito de app de entrega
 *
 * Quem pede comida acompanha "saiu da cozinha, 19:42". Quem deixa o celular
 * na assistência liga para a loja perguntando — e cada ligação é o técnico
 * largando a bancada. A página responde antes da pergunta: o que já
 * aconteceu, quando, e para quando está previsto.
 *
 * Tudo aqui trabalha só com o que `consultar_os` devolve. O corte do que o
 * cliente pode ver é feito no banco (supabase-migracao-rastreio-delivery.sql);
 * estas funções só arrumam para a tela.
 * ============================================================ */

/** Um passo do histórico, como o banco devolve: só status e quando. */
export interface PassoPublico {
  status: OSStatus;
  /** ISO. Vazio quando a OS é antiga e o passo não foi registrado. */
  data: string;
}

/**
 * O caminho feliz, na ordem que o cliente entende.
 *
 * "Aguardando peça" e "cancelada" ficam de fora de propósito: são desvios,
 * não etapas. Aparecem na linha do tempo quando ACONTECEM, mas não entram
 * na lista do que ainda vem — prometer "aguardando peça" como próximo passo
 * seria anunciar um atraso que talvez nem exista.
 */
export const ETAPAS_CLIENTE: OSStatus[] = [
  "aberta",
  "em_analise",
  "aguardando_aprovacao",
  "aprovada",
  "em_reparo",
  "pronta",
  "entregue",
];

const statusValido = (s: unknown): s is OSStatus =>
  typeof s === "string" && Object.prototype.hasOwnProperty.call(OS_STATUS_META, s);

/**
 * O que já aconteceu, em ordem, com data.
 *
 * - Status repetido em sequência vira um passo só. Salvar a OS duas vezes
 *   sem mudar nada gravava dois "Em reparo", e na tela do cliente parecia
 *   que o conserto tinha voltado para o começo.
 * - Ida e volta é mantida: "em reparo → aguardando peça → em reparo" é o que
 *   aconteceu, e é justamente o que explica o atraso.
 * - O status de agora sempre fecha a lista. OS antiga, de antes do
 *   histórico, fica com o passo atual sem data em vez de lista vazia.
 */
export function linhaDoTempo(
  historico: PassoPublico[] | null | undefined,
  statusAtual: OSStatus
): PassoPublico[] {
  const validos = (Array.isArray(historico) ? historico : [])
    .filter((p) => p && statusValido(p.status))
    .map((p, i) => ({ status: p.status, data: txt(p.data), i }))
    // Sem data vai para o começo; entre iguais, vale a ordem gravada.
    .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.i - b.i));

  const passos: PassoPublico[] = [];
  for (const p of validos) {
    if (passos.length && passos[passos.length - 1].status === p.status) continue;
    passos.push({ status: p.status, data: p.data });
  }
  if (!passos.length || passos[passos.length - 1].status !== statusAtual) {
    passos.push({ status: statusAtual, data: "" });
  }
  return passos;
}

/**
 * O que ainda vem pela frente, em cinza.
 *
 * Aguardando peça continua de onde parou: o próximo é voltar para a
 * bancada. Entregue e cancelada não têm próximo.
 */
export function proximasEtapas(statusAtual: OSStatus): OSStatus[] {
  if (statusAtual === "entregue" || statusAtual === "cancelada") return [];
  const ancora = statusAtual === "aguardando_peca" ? "aprovada" : statusAtual;
  const i = ETAPAS_CLIENTE.indexOf(ancora);
  return i < 0 ? [] : ETAPAS_CLIENTE.slice(i + 1);
}

/**
 * Quando a foto foi tirada, lido do nome do arquivo.
 *
 * O depósito grava `nome-<milissegundos>.jpg` (ver `caminhoDoArquivo` em
 * lib/imagens.ts). É o horário do envio, que para foto de bancada é o
 * horário da foto — e sai sem coluna nova e sem o banco devolver mais nada.
 * Nome fora do padrão devolve vazio, e a tela não mostra hora nenhuma: hora
 * inventada numa prova é pior que hora nenhuma.
 */
export function dataDaFoto(url: string): string {
  const m = txt(url).match(/-(\d{13})\.(?:jpe?g|png|webp)(?:\?|$)/i);
  if (!m) return "";
  const ms = Number(m[1]);
  // Entre 2020 e 2100: fora disso é outro número que calhou de ter 13 dígitos.
  if (ms < 1577836800000 || ms > 4102444800000) return "";
  return new Date(ms).toISOString();
}

const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/**
 * A previsão de entrega, dita como gente fala.
 *
 * Vazio quando não há previsão, quando a data é inválida ou quando o
 * aparelho já está pronto — aí a previsão perdeu o sentido e só confunde.
 *
 * Previsão vencida é dita com todas as letras. Esconder deixaria o cliente
 * olhando uma data que já passou, achando que a página está parada; ele
 * liga do mesmo jeito, só que mais bravo.
 */
export function previsaoDeEntrega(
  previsao: string | null | undefined,
  status: OSStatus,
  hoje = hojeISO()
): { texto: string; atrasada: boolean } | null {
  const d = soData(previsao);
  // Ida e volta pela data: 31/02 não dá NaN, vira 03/03 calado.
  const t = Date.parse(d + "T00:00:00Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(t)) return null;
  if (new Date(t).toISOString().slice(0, 10) !== d) return null;
  if (status === "pronta" || status === "entregue" || status === "cancelada") return null;

  const dias = diasAteVencer(d, hoje);
  const ddmm = d.slice(8, 10) + "/" + d.slice(5, 7);
  if (dias < 0) {
    return {
      texto: `A previsão era ${ddmm} e passou. Chama a loja pra saber a nova data.`,
      atrasada: true,
    };
  }
  if (dias === 0) return { texto: "Previsão: hoje", atrasada: false };
  if (dias === 1) return { texto: "Previsão: amanhã", atrasada: false };
  const semana = DIAS_SEMANA[new Date(d + "T00:00:00Z").getUTCDay()];
  return { texto: `Previsão: ${semana}, ${ddmm}`, atrasada: false };
}

/**
 * "Falar com a loja" já com o número da OS na mensagem.
 *
 * Sem o número, a primeira resposta da loja é sempre "qual o número da
 * sua OS?" — e o cliente volta para a página para copiar. Sem telefone da
 * loja, nada: um botão que abre a lista de contatos do cliente parece
 * defeito.
 *
 * Sem emoji: em alguns aparelhos chegam como "?".
 */
export function linkFalarComLoja(telefone: string | null | undefined, numero: number): string {
  const num = txt(telefone).replace(/\D/g, "");
  if (num.length < 10) return "";
  return whatsappLink(num, `Oi! Queria saber da minha ordem de serviço ${codigoOS(numero)}.`);
}

/**
 * A cor que a loja escolheu, para a faixa do topo.
 *
 * Só as cores do próprio sistema, pelo nome: o banco devolve a CHAVE
 * ("laranja"), nunca um valor livre que viraria estilo na página pública.
 */
export const corDaLoja = (chave: string | null | undefined): string =>
  ACCENTS[txt(chave)]?.hex || "";
