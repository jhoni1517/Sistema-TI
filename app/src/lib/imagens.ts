/**
 * Imagens da loja: logo e foto de produto.
 *
 * Três regras que valem mais do que parecem numa loja de bairro:
 *
 * 1. **Encolher antes de subir.** A foto sai do celular com 4000px e 5 MB. No
 *    4G do balcão isso é meio minuto por produto, e a tela de estoque depois
 *    baixa tudo de novo a cada abertura. Aqui vai redimensionada e em JPEG.
 *
 * 2. **O arquivo não é do banco.** Guardar a imagem em base64 dentro da linha
 *    engordaria `produtos`, que é lido inteiro em toda carga — cem produtos
 *    com foto viram dezenas de MB em cada F5. No banco fica só o endereço.
 *
 * 3. **Cada loja no seu canto.** O caminho começa com o id da loja, e a
 *    política do Storage só deixa escrever ali dentro. A trava é no servidor:
 *    caminho montado na tela não protege nada.
 */

import { supabase, supabaseEnabled } from "./supabase";

/** Onde as imagens moram no Supabase Storage */
export const BUCKET = "imagens";

/** Tipos que o navegador do balcão abre sem susto */
const TIPOS = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * Limite do arquivo ORIGINAL, antes de encolher.
 *
 * Serve para barrar o vídeo escolhido por engano e o PNG gigante de scanner,
 * não a foto normal de celular — essa passa e sai daqui com poucos KB.
 */
const MAX_ORIGINAL = 15 * 1024 * 1024;

export interface Medidas {
  largura: number;
  altura: number;
}

/**
 * Cabe dentro do quadrado sem distorcer, e nunca AUMENTA.
 *
 * Esticar uma foto pequena só cria arquivo maior com a mesma informação.
 */
export function encaixar(origem: Medidas, lado: number): Medidas {
  const { largura, altura } = origem;
  if (largura <= 0 || altura <= 0) return { largura: lado, altura: lado };
  const fator = Math.min(lado / largura, lado / altura, 1);
  return {
    largura: Math.max(1, Math.round(largura * fator)),
    altura: Math.max(1, Math.round(altura * fator)),
  };
}

/** Diz o que está errado com o arquivo, ou vazio se estiver tudo certo */
export function problemaNoArquivo(arquivo: { type: string; size: number }): string {
  if (!TIPOS.includes(arquivo.type)) {
    return "Escolha uma imagem JPG, PNG ou WEBP.";
  }
  if (arquivo.size > MAX_ORIGINAL) {
    return `A imagem tem ${(arquivo.size / 1024 / 1024).toFixed(1)} MB. O limite é 15 MB.`;
  }
  return "";
}

/**
 * Caminho do arquivo dentro do bucket.
 *
 * O carimbo de tempo no nome existe por causa do cache: trocar a logo e o
 * navegador continuar mostrando a antiga é o tipo de coisa que faz a pessoa
 * achar que não salvou e tentar de novo cinco vezes.
 */
export function caminhoDoArquivo(
  lojaId: string,
  pasta: string,
  nome: string,
  extensao = "jpg"
): string {
  const limpo = nome
    // Nao e comparacao: e a limpeza do nome do arquivo que vai para o
    // Storage, porque acento em caminho de URL da problema.
    .toLowerCase() // texto-cru-proposital

    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${lojaId}/${pasta}/${limpo || "img"}-${Date.now()}.${extensao}`;
}

export const caminhoDaImagem = (lojaId: string, pasta: string, nome: string): string =>
  caminhoDoArquivo(lojaId, pasta, nome, "jpg");

/**
 * A imagem pertence a esta loja?
 *
 * Usado antes de apagar: um endereço colado à mão apontando para a pasta de
 * outra loja não pode virar um delete. O servidor também recusa, mas o erro
 * chegaria como "sem permissão", sem dizer o que aconteceu.
 */
export const daLoja = (caminho: string, lojaId: string): boolean =>
  !!lojaId && caminho.startsWith(`${lojaId}/`);

/** Extrai o caminho interno a partir da URL pública gravada no banco */
export function caminhoDaUrl(url: string, bucket = BUCKET): string {
  const marca = `/${bucket}/`;
  const i = url.indexOf(marca);
  return i < 0 ? "" : decodeURIComponent(url.slice(i + marca.length));
}

/**
 * Encolhe e converte para JPEG dentro do navegador.
 *
 * Fundo branco de propósito: PNG com transparência vira preto no JPEG, e uma
 * logo que fica com fundo preto no recibo impresso parece defeito do sistema.
 */
export function prepararImagem(arquivo: File, lado = 800): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { largura, altura } = encaixar(
        { largura: img.naturalWidth, altura: img.naturalHeight },
        lado
      );
      const tela = document.createElement("canvas");
      tela.width = largura;
      tela.height = altura;
      const ctx = tela.getContext("2d");
      if (!ctx) return reject(new Error("Este navegador não conseguiu processar a imagem."));
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, largura, altura);
      ctx.drawImage(img, 0, 0, largura, altura);
      tela.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Não foi possível preparar a imagem."))),
        "image/jpeg",
        0.82
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Arquivo de imagem inválido ou corrompido."));
    };
    img.src = url;
  });
}

/** Sobe a imagem e devolve o endereço público para gravar no banco */
export async function enviarImagem(
  arquivo: File,
  lojaId: string,
  pasta: string,
  lado = 800
): Promise<string> {
  if (!supabaseEnabled || !supabase) {
    throw new Error("Imagens precisam da nuvem ligada. Configure o Supabase primeiro.");
  }
  if (!lojaId) throw new Error("Loja não identificada. Entre de novo no sistema.");

  const problema = problemaNoArquivo(arquivo);
  if (problema) throw new Error(problema);

  const menor = await prepararImagem(arquivo, lado);
  const caminho = caminhoDaImagem(lojaId, pasta, arquivo.name.replace(/\.[^.]+$/, ""));

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(caminho, menor, { contentType: "image/jpeg", upsert: true });

  if (error) {
    // O erro cru do Storage é críptico. Estes dois são os que aparecem de
    // verdade, e cada um tem uma saída diferente.
    if (/bucket.*not.*found/i.test(error.message)) {
      throw new Error(
        "O depósito de imagens não existe no banco. Rode o supabase-migracao-imagens.sql."
      );
    }
    if (/policy|denied|unauthorized|403/i.test(error.message)) {
      throw new Error(
        "O banco recusou a gravação da imagem. Se a assinatura desta loja está " +
          "vencida, o sistema continua consultando mas não grava."
      );
    }
    throw new Error(`Não foi possível enviar a imagem: ${error.message}`);
  }

  return supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;
}

/**
 * Apaga a imagem do depósito.
 *
 * Falhar aqui não pode derrubar quem só queria trocar a foto: o pior caso é
 * um arquivo órfão ocupando alguns KB, e insistir num erro de limpeza
 * impediria a troca da imagem que a pessoa realmente quer.
 */
export async function apagarImagem(url: string, lojaId: string): Promise<void> {
  if (!supabaseEnabled || !supabase || !url) return;
  const caminho = caminhoDaUrl(url);
  if (!caminho || !daLoja(caminho, lojaId)) return;
  await supabase.storage.from(BUCKET).remove([caminho]);
}
