import { supabase, supabaseEnabled } from "./supabase";
import { caminhoDoArquivo, caminhoDaUrl, daLoja, prepararImagem } from "./imagens";
import { txt } from "./format";

/**
 * Vídeo do laudo: o barulho do cooler, a tela piscando, o curto que só
 * aparece quando liga.
 *
 * Foto resolve placa queimada. Não resolve "faz um barulho estranho quando
 * liga" nem "a tela pisca de vez em quando" — que é metade do que chega no
 * balcão e a parte mais difícil de explicar por escrito. Quinze segundos de
 * vídeo encerram a conversa.
 *
 * ============================================================
 * A DECISÃO DIFÍCIL: NÃO CONVERTER O VÍDEO NO NAVEGADOR
 * ============================================================
 *
 * A foto sai do celular com 5 MB e o sistema encolhe para 200 KB antes de
 * subir. O reflexo é fazer o mesmo com o vídeo — e ele está errado.
 *
 * Converter vídeo no navegador só existe em três formas, e as três custam
 * mais do que resolvem numa base mantida por uma pessoa:
 *
 * 1. `MediaRecorder` sobre um canvas roda EM TEMPO REAL: converter 30
 *    segundos leva 30 segundos, com o cliente no balcão. Perde o áudio (que
 *    aqui é justamente a prova), perde a orientação do celular, e o formato
 *    de saída muda conforme o navegador — o Chrome grava WebM, que o iPhone
 *    do cliente pode não abrir. O vídeo chegaria menor e sem tocar.
 * 2. `WebCodecs` é rápido e não está em todo celular de balcão; e ainda
 *    precisaria de uma biblioteca para montar o MP4.
 * 3. `ffmpeg.wasm` são 30 MB de download antes do primeiro vídeo.
 *
 * Então o caminho é o oposto: NÃO MEXER no arquivo, e cuidar dos dois
 * números que decidem se dá certo — quanto tempo ele tem e quanto ele pesa.
 *
 * ------------------------------------------------------------
 * O QUE FAZ A PÁGINA DO CLIENTE ABRIR RÁPIDO
 *
 * Não é o vídeo ser pequeno: é o vídeo NÃO BAIXAR até a pessoa tocar nele.
 *
 * A capa é um quadro do próprio vídeo, salvo em JPEG de poucos KB. A página
 * mostra a capa na hora, e o arquivo grande só desce quando alguém aperta o
 * play. Sem capa, o navegador ou baixa o vídeo inteiro para saber o que
 * desenhar, ou mostra um retângulo preto — e retângulo preto numa página de
 * assistência técnica parece defeito do sistema.
 * ------------------------------------------------------------
 */

/** Depósito próprio, para o limite do vídeo não afrouxar o da imagem */
export const BUCKET_VIDEOS = "videos";

/**
 * Teto de duração.
 *
 * Trinta segundos não é economia de espaço: é o que faz o vídeo ser assistido.
 * Ninguém abre o link do conserto e vê dois minutos de bancada — e um vídeo
 * longo é também um vídeo em que a parte que importa está no meio, onde o
 * cliente não vai procurar. Filmar só o defeito é o que se pede.
 */
export const MAX_SEGUNDOS = 30;

/**
 * Teto de tamanho, com folga proposital.
 *
 * Trinta segundos de 1080p num celular novo dão uns 45 MB. O limite existe
 * para barrar o vídeo de dez minutos escolhido por engano na galeria, não
 * para brigar com a câmera do aparelho de quem trabalha aqui.
 */
export const MAX_BYTES = 60 * 1024 * 1024;

/**
 * Formatos que tocam no celular do cliente sem instalar nada.
 *
 * MP4 é o que sai de todo celular e toca em todo lugar. WebM entra porque
 * alguns Android gravam nele; MOV porque é o do iPhone.
 */
const TIPOS = ["video/mp4", "video/quicktime", "video/webm"];

/**
 * Megabytes para o recado da tela.
 *
 * Arredonda PARA CIMA, e é isso que faz a frase ter sentido: com
 * `toFixed(0)`, um arquivo de 60,0001 MB produzia "o vídeo tem 60 MB e o
 * limite é 60 MB" — uma recusa que se contradiz na mesma linha, e que faz a
 * pessoa achar que o sistema quebrou em vez de gravar outro vídeo.
 */
const mb = (bytes: number): string => {
  const v = Math.ceil((bytes / 1024 / 1024) * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};

/**
 * O que está errado com o arquivo, ou vazio se estiver tudo certo.
 *
 * Cada recusa diz a saída. "Arquivo inválido" faria a pessoa tentar o mesmo
 * vídeo três vezes antes de desistir.
 */
export function problemaNoVideo(arquivo: { type: string; size: number }): string {
  const tipo = txt(arquivo.type).toLowerCase(); // texto-cru-proposital
  if (!tipo.startsWith("video/")) {
    return "Escolha um vídeo. Para foto, use o botão de foto ao lado.";
  }
  if (!TIPOS.includes(tipo)) {
    return "Este formato de vídeo não toca no celular de todo mundo. Grave pela câmera do próprio aparelho.";
  }
  if (arquivo.size > MAX_BYTES) {
    return (
      `O vídeo tem ${mb(arquivo.size)} MB e o limite é ${mb(MAX_BYTES)} MB. ` +
      `Grave um trecho curto, só da parte que mostra o defeito.`
    );
  }
  return "";
}

/**
 * O que está errado com a duração, ou vazio.
 *
 * Separado do tamanho porque só dá para saber depois que o navegador leu o
 * arquivo, e porque o recado é outro: aqui não adianta escolher outro vídeo,
 * tem que filmar mais curto.
 */
export function problemaNaDuracao(segundos: number): string {
  const s = Number(segundos);
  // Duração que o navegador não soube ler (Infinity em alguns MOV) não pode
  // virar recusa: o arquivo pode estar perfeito, e barrar por isso deixaria o
  // técnico sem entender o que fazer.
  if (!Number.isFinite(s) || s <= 0) return "";
  if (s <= MAX_SEGUNDOS) return "";
  return (
    `O vídeo tem ${Math.round(s)} segundos e o limite é ${MAX_SEGUNDOS}. ` +
    `Filme de novo só a parte que mostra o defeito.`
  );
}

/** "0:12" — a duração escrita como o player mostra */
export function duracaoEscrita(segundos?: number | null): string {
  const s = Math.max(0, Math.round(Number(segundos) || 0));
  if (!s) return "";
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/* ---------- Daqui para baixo depende do navegador ---------- */

/** Duração e medidas, lidas sem baixar o arquivo inteiro de novo */
export function dadosDoVideo(
  arquivo: File
): Promise<{ duracao: number; largura: number; altura: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => {
      const dados = {
        duracao: v.duration,
        largura: v.videoWidth,
        altura: v.videoHeight,
      };
      URL.revokeObjectURL(url);
      resolve(dados);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler este vídeo. Tente gravar de novo."));
    };
    v.src = url;
  });
}

/**
 * Um quadro do vídeo, em JPEG, para servir de capa.
 *
 * O quadro é pego perto de um segundo e nunca no zero: o primeiro quadro de
 * quase todo vídeo de celular é preto (o sensor ainda está abrindo), e uma
 * capa preta é o mesmo que capa nenhuma.
 */
export function capaDoVideo(arquivo: File, lado = 800): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const v = document.createElement("video");
    let pronto = false;

    const desistir = (msg: string) => {
      if (pronto) return;
      pronto = true;
      URL.revokeObjectURL(url);
      reject(new Error(msg));
    };

    // Trava de tempo: em alguns aparelhos o evento `seeked` simplesmente não
    // chega, e sem isto o envio ficaria girando para sempre. A capa é um
    // luxo — quem chamou decide seguir sem ela.
    const prazo = setTimeout(() => desistir("A capa do vídeo demorou demais."), 8000);

    v.preload = "metadata";
    v.muted = true;
    // Sem isto o iPhone abre o vídeo em tela cheia em vez de desenhar o quadro.
    v.playsInline = true;

    v.onloadedmetadata = () => {
      const alvo = Number.isFinite(v.duration) && v.duration > 0
        ? Math.min(1, v.duration / 2)
        : 0.1;
      v.currentTime = alvo;
    };

    v.onseeked = () => {
      if (pronto) return;
      try {
        const escala = Math.min(lado / (v.videoWidth || lado), lado / (v.videoHeight || lado), 1);
        const tela = document.createElement("canvas");
        tela.width = Math.max(1, Math.round((v.videoWidth || lado) * escala));
        tela.height = Math.max(1, Math.round((v.videoHeight || lado) * escala));
        const ctx = tela.getContext("2d");
        if (!ctx) return desistir("Este navegador não conseguiu gerar a capa.");
        ctx.drawImage(v, 0, 0, tela.width, tela.height);
        tela.toBlob(
          (b) => {
            if (!b) return desistir("Não foi possível gerar a capa do vídeo.");
            pronto = true;
            clearTimeout(prazo);
            URL.revokeObjectURL(url);
            resolve(b);
          },
          "image/jpeg",
          0.8
        );
      } catch {
        desistir("Não foi possível gerar a capa do vídeo.");
      }
    };

    v.onerror = () => desistir("Não foi possível ler este vídeo.");
    v.src = url;
  });
}

export interface VideoEnviado {
  url: string;
  capa: string;
  duracao: number;
}

/**
 * Sobe o vídeo e a capa, e devolve os dois endereços.
 *
 * A capa é opcional de propósito: se a geração falhar, o vídeo sobe assim
 * mesmo. Perder o vídeo inteiro porque um quadro não foi desenhado seria
 * trocar a prova por um enfeite.
 */
export async function enviarVideo(
  arquivo: File,
  lojaId: string,
  pasta = "laudos"
): Promise<VideoEnviado> {
  if (!supabaseEnabled || !supabase) {
    throw new Error("Vídeos precisam da nuvem ligada. Configure o Supabase primeiro.");
  }
  if (!lojaId) throw new Error("Loja não identificada. Entre de novo no sistema.");

  const problema = problemaNoVideo(arquivo);
  if (problema) throw new Error(problema);

  let duracao = 0;
  try {
    duracao = (await dadosDoVideo(arquivo)).duracao;
  } catch {
    // Metadado ilegível não barra o envio: o teto de tamanho já segurou o
    // caso que importa, e recusar aqui deixaria o técnico sem saída.
  }
  const longo = problemaNaDuracao(duracao);
  if (longo) throw new Error(longo);

  const base = arquivo.name.replace(/\.[^.]+$/, "");
  const extensao = arquivo.type === "video/webm" ? "webm" : "mp4";
  const caminho = caminhoDoArquivo(lojaId, pasta, base, extensao);

  const { error } = await supabase.storage
    .from(BUCKET_VIDEOS)
    .upload(caminho, arquivo, {
      // O MOV do iPhone sobe com o cabeçalho de MP4: os dois são o mesmo
      // contêiner, e é assim que ele toca no Android sem conversão.
      contentType: arquivo.type === "video/webm" ? "video/webm" : "video/mp4",
      upsert: true,
    });

  if (error) {
    if (/bucket.*not.*found/i.test(error.message)) {
      throw new Error(
        "O depósito de vídeos não existe no banco. Rode o supabase-migracao-video-laudo.sql."
      );
    }
    if (/policy|denied|unauthorized|403/i.test(error.message)) {
      throw new Error(
        "O banco recusou a gravação do vídeo. Se a assinatura desta loja está " +
          "vencida, o sistema continua consultando mas não grava."
      );
    }
    if (/exceeded|too large|413/i.test(error.message)) {
      throw new Error(
        `O depósito recusou o arquivo por tamanho. O limite é ${mb(MAX_BYTES)} MB.`
      );
    }
    throw new Error(`Não foi possível enviar o vídeo: ${error.message}`);
  }

  const url = supabase.storage.from(BUCKET_VIDEOS).getPublicUrl(caminho).data.publicUrl;

  let capa = "";
  try {
    const quadro = await capaDoVideo(arquivo, 800);
    const menor = await prepararImagem(
      new File([quadro], "capa.jpg", { type: "image/jpeg" }),
      800
    );
    const caminhoCapa = caminhoDoArquivo(lojaId, pasta, base + "-capa", "jpg");
    const { error: erroCapa } = await supabase.storage
      .from("imagens")
      .upload(caminhoCapa, menor, { contentType: "image/jpeg", upsert: true });
    if (!erroCapa) {
      capa = supabase.storage.from("imagens").getPublicUrl(caminhoCapa).data.publicUrl;
    }
  } catch {
    // Sem capa o player mostra o primeiro quadro. Menos bonito, e o vídeo
    // continua lá — que é o que importa.
  }

  return { url, capa, duracao: Number.isFinite(duracao) ? Math.round(duracao) : 0 };
}

/** Apaga o vídeo e a capa. Falhar aqui deixa arquivo órfão, e só. */
export async function apagarVideo(
  video: { url: string; capa?: string },
  lojaId: string
): Promise<void> {
  if (!supabaseEnabled || !supabase) return;

  const caminho = caminhoDaUrl(txt(video.url), BUCKET_VIDEOS);
  if (caminho && daLoja(caminho, lojaId)) {
    await supabase.storage.from(BUCKET_VIDEOS).remove([caminho]);
  }
  const capa = caminhoDaUrl(txt(video.capa), "imagens");
  if (capa && daLoja(capa, lojaId)) {
    await supabase.storage.from("imagens").remove([capa]);
  }
}
