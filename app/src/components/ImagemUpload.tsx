import React, { useRef, useState } from "react";
import { ImagePlus, Trash2, Loader2 } from "lucide-react";
import { aviso } from "./Aviso";
import { obterLoja } from "../lib/db";
import { enviarImagem, apagarImagem } from "../lib/imagens";

/**
 * Escolher, ver e trocar uma imagem.
 *
 * Serve para a logo da loja e para a foto do produto — a mesma coisa nos dois
 * lugares, só muda o formato do quadro.
 *
 * Três decisões que vieram do balcão:
 *
 * - **`capture` não é usado.** Forçar a câmera tira do dono a opção de pegar
 *   a foto que o fornecedor já mandou no WhatsApp, que é como a maioria das
 *   fotos de produto chega.
 * - **A troca é imediata, não fica esperando o Salvar.** Quem sobe uma foto e
 *   não vê nada acontecer sobe de novo.
 * - **Erro aparece cru.** "Não foi possível enviar" sem o motivo faz a pessoa
 *   tentar dez vezes a mesma coisa.
 */
export const ImagemUpload: React.FC<{
  url?: string;
  onChange: (url: string | undefined) => void;
  /** Pasta dentro do depósito: "logo", "produtos" */
  pasta: string;
  /** Maior lado depois de encolher. Logo pode ser menor que foto. */
  lado?: number;
  /** Quadrado (produto) ou faixa larga (logo) */
  formato?: "quadrado" | "faixa";
  label?: string;
  dica?: string;
}> = ({ url, onChange, pasta, lado = 800, formato = "quadrado", label, dica }) => {
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  const escolher = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    setEnviando(true);
    try {
      const nova = await enviarImagem(arquivo, obterLoja() || "", pasta, lado);
      // A antiga sai do depósito depois que a nova está lá. Ao contrário, uma
      // falha no envio deixaria o produto sem imagem nenhuma.
      if (url) await apagarImagem(url, obterLoja() || "");
      onChange(nova);
    } catch (e) {
      aviso.erro(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
      // Sem isto, escolher o MESMO arquivo de novo não dispara nada: o
      // navegador entende que o valor não mudou.
      if (entrada.current) entrada.current.value = "";
    }
  };

  const remover = async () => {
    if (!url || !confirm("Remover esta imagem?")) return;
    const antiga = url;
    onChange(undefined);
    try {
      await apagarImagem(antiga, obterLoja() || "");
    } catch {
      /* arquivo órfão de alguns KB não vale um erro na cara de quem só
         queria tirar a foto da tela */
    }
  };

  const moldura =
    formato === "faixa" ? "h-24 w-full max-w-xs" : "h-28 w-28";

  return (
    <div>
      {label && <label className="label">{label}</label>}
      <div className="flex flex-wrap items-center gap-3">
        <div
          className={`${moldura} flex items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50`}
        >
          {url ? (
            // object-contain: cortar a logo de alguém no meio é pior do que
            // sobrar espaço em branco em volta dela.
            <img src={url} alt="" className="h-full w-full object-contain" />
          ) : (
            <ImagePlus size={22} className="text-slate-300" />
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <input
            ref={entrada}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => escolher(e.target.files?.[0])}
          />
          <button
            type="button"
            className="btn-secondary !py-1.5 text-xs"
            disabled={enviando}
            onClick={() => entrada.current?.click()}
          >
            {enviando ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Enviando...
              </>
            ) : (
              <>
                <ImagePlus size={14} /> {url ? "Trocar imagem" : "Escolher imagem"}
              </>
            )}
          </button>
          {url && !enviando && (
            <button
              type="button"
              className="btn-ghost !py-1 text-xs text-red-500"
              onClick={remover}
            >
              <Trash2 size={13} /> Remover
            </button>
          )}
        </div>
      </div>
      {dica && <p className="mt-1.5 text-xs text-slate-500">{dica}</p>}
    </div>
  );
};
