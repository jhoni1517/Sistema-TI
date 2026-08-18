import React, { useRef, useState } from "react";
import { Video, Trash2, Loader2, Play } from "lucide-react";
import { aviso } from "./Aviso";
import { obterLoja } from "../lib/db";
import {
  enviarVideo,
  apagarVideo,
  duracaoEscrita,
  MAX_SEGUNDOS,
} from "../lib/video";
import type { VideoLaudo } from "../lib/types";

/**
 * Vídeos do laudo.
 *
 * Foto resolve placa queimada; não resolve "faz um barulho estranho quando
 * liga" nem "a tela pisca de vez em quando". Quinze segundos de vídeo
 * encerram a conversa que três parágrafos não encerram.
 *
 * ------------------------------------------------------------
 * UM DE CADA VEZ, DE PROPÓSITO
 *
 * A foto sobe várias juntas porque é assim que se fotografa um aparelho:
 * frente, verso, o canto amassado. Vídeo é o contrário — são dezenas de MB
 * cada um, no 4G do balcão, e mandar três de uma vez daria três barras de
 * progresso paradas e nenhuma pista de qual está indo.
 *
 * Aqui vai um por vez, com o nome do arquivo na tela enquanto sobe. Quem está
 * esperando precisa saber que ALGUMA coisa está acontecendo, senão aperta de
 * novo — e o clique duplo já custou caro nesta base.
 * ------------------------------------------------------------
 */
export const VideosAparelho: React.FC<{
  videos: VideoLaudo[];
  onChange: (videos: VideoLaudo[]) => void;
  max?: number;
}> = ({ videos, onChange, max = 3 }) => {
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState("");

  const escolher = async (lista: FileList | null) => {
    const arquivo = lista?.[0];
    if (!arquivo) return;
    if (videos.length >= max) {
      return aviso.alerta(`O limite é ${max} vídeos por ordem.`);
    }
    if (enviando) return;

    setEnviando(arquivo.name);
    try {
      const novo = await enviarVideo(arquivo, obterLoja() || "", "laudos");
      onChange([...videos, novo]);
    } catch (e) {
      // Erro cru na tela: a mensagem já vem dizendo a saída (filmar mais
      // curto, assinatura vencida, migração não rodada).
      aviso.erro(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando("");
      if (entrada.current) entrada.current.value = "";
    }
  };

  const remover = async (v: VideoLaudo) => {
    if (!confirm("Remover este vídeo? O cliente deixa de ver.")) return;
    onChange(videos.filter((x) => x.url !== v.url));
    try {
      await apagarVideo(v, obterLoja() || "");
    } catch {
      /* arquivo órfão não vale um erro na tela */
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {videos.map((v) => (
          <div key={v.url} className="group relative">
            <a
              href={v.url}
              target="_blank"
              rel="noreferrer"
              className="block h-20 w-28 overflow-hidden rounded-lg border border-slate-200 bg-slate-900"
            >
              {v.capa ? (
                <img src={v.capa} alt="" loading="lazy" className="h-full w-full object-cover opacity-80" />
              ) : null}
              <span className="absolute inset-0 flex items-center justify-center text-white">
                <Play size={22} fill="currentColor" />
              </span>
              {duracaoEscrita(v.duracao) && (
                <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[10px] font-semibold text-white">
                  {duracaoEscrita(v.duracao)}
                </span>
              )}
            </a>
            <button
              type="button"
              onClick={() => remover(v)}
              className="absolute -right-1.5 -top-1.5 rounded-full bg-red-500 p-1 text-white shadow"
              title="Remover vídeo"
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}

        {videos.length < max && (
          <button
            type="button"
            disabled={!!enviando}
            onClick={() => entrada.current?.click()}
            className="flex h-20 w-28 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 px-1 text-xs text-slate-400 hover:border-slate-400"
          >
            {enviando ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span className="w-full truncate text-[10px]">enviando...</span>
              </>
            ) : (
              <>
                <Video size={18} />
                Vídeo
              </>
            )}
          </button>
        )}
      </div>

      {/*
        `capture` não vai aqui de propósito: ele força abrir a câmera e tira do
        técnico a opção de mandar um vídeo que ele já gravou enquanto
        trabalhava, que é o caso mais comum.
      */}
      <input
        ref={entrada}
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        className="hidden"
        onChange={(e) => escolher(e.target.files)}
      />

      <p className="mt-1.5 text-xs text-slate-500">
        Até {max} vídeos de {MAX_SEGUNDOS} segundos. Filme só a parte que mostra
        o defeito — vídeo longo o cliente não assiste até o fim.
      </p>
    </div>
  );
};
