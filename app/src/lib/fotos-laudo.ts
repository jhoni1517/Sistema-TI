import { txt } from "./format";
import type { OrdemServico, VideoLaudo } from "./types";

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
 * Os vídeos que saem para o cliente.
 *
 * Mesma régua das fotos, com uma diferença: o vídeo carrega a capa junto, e
 * uma capa apontando para lugar nenhum é pior que capa nenhuma — o navegador
 * desenha o ícone de imagem quebrada em cima do player. Endereço de capa
 * inválido vira vazio, e aí o player mostra o primeiro quadro.
 */
export function videosParaOCliente(
  os: Pick<OrdemServico, "videosLaudo">
): VideoLaudo[] {
  const vistos = new Set<string>();
  const saida: VideoLaudo[] = [];
  for (const v of os.videosLaudo || []) {
    const url = endereco(v?.url);
    if (!url || vistos.has(url)) continue;
    vistos.add(url);
    const duracao = Number(v?.duracao);
    saida.push({
      url,
      capa: endereco(v?.capa),
      duracao: Number.isFinite(duracao) && duracao > 0 ? Math.round(duracao) : 0,
    });
    if (saida.length >= MAX) break;
  }
  return saida;
}

/**
 * A linha que entra na mensagem do WhatsApp quando há foto ou vídeo.
 *
 * Sem ela o cliente recebe o valor e o link, e não tem por que abrir o link:
 * ele já sabe o status. A prova é o motivo de abrir, então precisa ser
 * anunciada — senão a única coisa que explica o preço fica escondida atrás de
 * um clique que ninguém dá.
 *
 * Uma frase só, mesmo com os dois: duas linhas seguidas dizendo quase a mesma
 * coisa é o que faz a pessoa parar de ler a mensagem.
 *
 * Sem emoji: esta linha vai para o WhatsApp.
 */
export function avisoDeFotoNaMensagem(
  os: Pick<OrdemServico, "fotosLaudo" | "videosLaudo">,
  temLink: boolean
): string {
  if (!temLink) return "";
  const fotos = fotosParaOCliente(os).length;
  const videos = videosParaOCliente(os).length;
  if (fotos === 0 && videos === 0) return "";

  const pedacos: string[] = [];
  if (fotos > 0) pedacos.push(fotos === 1 ? "uma foto" : `${fotos} fotos`);
  if (videos > 0) pedacos.push(videos === 1 ? "um vídeo" : `${videos} vídeos`);

  const o = pedacos.join(" e ");
  const plural = fotos + videos > 1;
  return (
    `Registramos ${o} do problema. ` +
    (plural ? "Estão no link abaixo." : "Está no link abaixo.")
  );
}
