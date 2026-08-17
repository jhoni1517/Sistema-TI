import { txt } from "./format";
import type { OrdemServico } from "./types";

/**
 * As fotos do laudo — as que o cliente vê na página de acompanhamento.
 *
 * ------------------------------------------------------------
 * O PROBLEMA QUE ISTO RESOLVE
 *
 * "A placa está queimada, vai sair R$ 480" é uma frase que o cliente tem que
 * acreditar. Ele não abriu o aparelho, não viu nada, e do outro lado do
 * balcão está quem ganha com o conserto. Metade da desconfiança de quem leva
 * um aparelho para consertar nasce aí, e nenhuma explicação por texto
 * resolve.
 *
 * Uma foto de perto da trilha queimada é a mesma frase sem precisar de fé.
 *
 * ------------------------------------------------------------
 * DUAS LISTAS, E A SEPARAÇÃO É A REGRA DE SEGURANÇA
 *
 * `fotos` são as da ENTRADA: prova da loja de que o trinco já estava lá.
 * Elas pegam o aparelho ligado, a tela de bloqueio, o que estiver aberto —
 * publicá-las seria pôr a tela do celular do cliente numa página aberta.
 *
 * `fotosLaudo` são as que alguém colocou, deliberadamente, no lugar que diz
 * que vão para o cliente. Só essas saem, e o corte é feito no BANCO, na
 * função `consultar_os` — filtrar na tela não esconde nada de quem abre o
 * painel do navegador. Esta função existe para a tela combinar com o banco,
 * não para proteger.
 * ------------------------------------------------------------
 */

const MAX = 6;

/** Endereço de imagem que vale a pena tentar mostrar */
const endereco = (v: unknown): string => {
  const s = txt(typeof v === "string" ? v : "").trim();
  return /^https?:\/\//i.test(s) ? s : "";
};

/**
 * As fotos que saem para o cliente, limpas e sem repetição.
 *
 * Repetida não é detalhe: o técnico fotografa o mesmo ponto duas vezes com o
 * cliente esperando, e a página pública ficava com a mesma imagem duas vezes,
 * como se fossem dois problemas.
 */
export function fotosParaOCliente(
  os: Pick<OrdemServico, "fotosLaudo">
): string[] {
  const vistas = new Set<string>();
  const saida: string[] = [];
  for (const f of os.fotosLaudo || []) {
    const url = endereco(f);
    if (!url || vistas.has(url)) continue;
    vistas.add(url);
    saida.push(url);
    if (saida.length >= MAX) break;
  }
  return saida;
}

/**
 * A linha que entra na mensagem do WhatsApp quando há foto.
 *
 * Sem ela o cliente recebe o valor e o link, e não tem por que abrir o link:
 * ele já sabe o status. A foto é o motivo de abrir, então precisa ser
 * anunciada — senão a única coisa que explica o preço fica escondida atrás de
 * um clique que ninguém dá.
 *
 * Sem emoji: esta linha vai para o WhatsApp.
 */
export function avisoDeFotoNaMensagem(
  os: Pick<OrdemServico, "fotosLaudo">,
  temLink: boolean
): string {
  const quantas = fotosParaOCliente(os).length;
  if (quantas === 0 || !temLink) return "";
  return quantas === 1
    ? "Tiramos uma foto do problema. Ela está no link abaixo."
    : `Tiramos ${quantas} fotos do problema. Elas estão no link abaixo.`;
}
