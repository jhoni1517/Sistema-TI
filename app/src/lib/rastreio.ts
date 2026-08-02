import { codigoOS, txt } from "./format";
import type { OrdemServico } from "./types";

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
    "Este link está incompleto ou é de uma versão antiga. " +
    "Peça um link novo para a assistência — o código da sua ordem continua o mesmo."
  );
}
