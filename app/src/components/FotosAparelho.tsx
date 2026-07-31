import React, { useRef, useState } from "react";
import { Camera, Trash2, Loader2 } from "lucide-react";
import { aviso } from "./Aviso";
import { obterLoja } from "../lib/db";
import { enviarImagem, apagarImagem } from "../lib/imagens";

/**
 * Fotos do aparelho na entrada.
 *
 * O checklist diz "tela sem trincos". A foto mostra o trinco que já estava
 * lá. Sem ela, a discussão na retirada é a palavra do cliente contra a do
 * técnico, e quem perde essa discussão é sempre a loja.
 *
 * Aceita várias de uma vez porque é assim que se fotografa um aparelho:
 * frente, verso, o canto amassado. Parar para escolher uma por vez com o
 * cliente esperando no balcão faz ninguém fotografar nada.
 */
export const FotosAparelho: React.FC<{
  fotos: string[];
  onChange: (fotos: string[]) => void;
  max?: number;
}> = ({ fotos, onChange, max = 6 }) => {
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(0);

  const escolher = async (lista: FileList | null) => {
    if (!lista || lista.length === 0) return;
    const cabem = Math.max(0, max - fotos.length);
    if (cabem === 0) return aviso.alerta(`O limite é ${max} fotos por ordem.`);

    const arquivos = Array.from(lista).slice(0, cabem);
    if (arquivos.length < lista.length) {
      aviso.info(`Só cabem mais ${cabem}. As demais foram ignoradas.`);
    }

    setEnviando(arquivos.length);
    const novas: string[] = [];
    const falhas: string[] = [];
    for (const arquivo of arquivos) {
      try {
        novas.push(await enviarImagem(arquivo, obterLoja() || "", "aparelhos", 1000));
      } catch (e) {
        falhas.push(`${arquivo.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
      setEnviando((n) => n - 1);
    }
    // As que subiram ficam. Descartar tudo porque uma falhou obrigaria a
    // fotografar o aparelho de novo, com o cliente esperando.
    if (novas.length > 0) onChange([...fotos, ...novas]);
    if (falhas.length > 0) aviso.erro("Não subiram:\n\n" + falhas.join("\n"));
    if (entrada.current) entrada.current.value = "";
  };

  const remover = async (url: string) => {
    if (!confirm("Remover esta foto?")) return;
    onChange(fotos.filter((f) => f !== url));
    try {
      await apagarImagem(url, obterLoja() || "");
    } catch {
      /* arquivo órfão de alguns KB não vale um erro na tela */
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {fotos.map((url) => (
          <div key={url} className="group relative">
            <a href={url} target="_blank" rel="noreferrer">
              <img
                src={url}
                alt=""
                loading="lazy"
                className="h-20 w-20 rounded-lg border border-slate-200 object-cover"
              />
            </a>
            <button
              type="button"
              onClick={() => remover(url)}
              className="absolute -right-1.5 -top-1.5 rounded-full bg-red-500 p-1 text-white shadow"
              title="Remover foto"
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}

        {fotos.length < max && (
          <button
            type="button"
            disabled={enviando > 0}
            onClick={() => entrada.current?.click()}
            className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-xs text-slate-400 hover:border-slate-400"
          >
            {enviando > 0 ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <>
                <Camera size={18} />
                Foto
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={entrada}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => escolher(e.target.files)}
      />

      <p className="mt-1.5 text-xs text-slate-500">
        Estado do aparelho na entrada. É o que encerra discussão de arranhão na
        retirada. Até {max} fotos, enviadas na hora.
      </p>
    </div>
  );
};
