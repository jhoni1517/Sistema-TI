import React, { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { supabase, supabaseEnabled } from "../lib/supabase";
import { ehPromotora } from "../lib/depoimentos";

/**
 * "Como foi o atendimento?" no link de rastreio, depois da entrega.
 *
 * Nota 4 ou 5 mostra o botão do Google e pergunta se pode publicar o
 * comentário. Nota 1 a 3 agradece e avisa que a loja vai procurar — o
 * aviso vai só para o dono (lib/depoimentos.ts).
 */
export const AvaliarAtendimento: React.FC<{ loja: string; numero: number; token: string; nomeLoja?: string | null }> = ({
  loja,
  numero,
  token,
  nomeLoja,
}) => {
  const [nota, setNota] = useState(0);
  const [comentario, setComentario] = useState("");
  const [publicar, setPublicar] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [enviada, setEnviada] = useState<{ nota: number; google: string | null } | null>(null);
  const [disponivel, setDisponivel] = useState(true);

  useEffect(() => {
    if (!supabaseEnabled || !supabase) return;
    supabase.rpc("avaliacao_da_os", { p_loja: loja, p_numero: numero, p_token: token }).then(({ data, error }) => {
      // Migração ainda não rodada: some o quadro, a página continua.
      if (error) return setDisponivel(false);
      if (data && typeof data === "object" && "nota" in data) {
        const d = data as { nota: number; comentario: string | null; publicar: boolean };
        setNota(d.nota);
        setComentario(d.comentario || "");
        setPublicar(d.publicar);
        setEnviada({ nota: d.nota, google: null });
      }
    });
  }, [loja, numero, token]);

  if (!disponivel || !supabase) return null;

  const enviar = async () => {
    if (!nota || enviando) return;
    setEnviando(true);
    setErro("");
    const { data, error } = await supabase!.rpc("avaliar_atendimento", {
      p_loja: loja,
      p_numero: numero,
      p_token: token,
      p_nota: nota,
      p_comentario: comentario,
      p_publicar: ehPromotora(nota) && publicar,
    });
    setEnviando(false);
    if (error) return setErro(error.message || "Não chegou. Tente de novo.");
    setEnviada({ nota, google: (data as { google: string | null } | null)?.google || null });
  };

  if (enviada) {
    const boa = ehPromotora(enviada.nota);
    return (
      <section className="mb-6 rounded-md border-2 border-linha p-4 text-center">
        <Estrelas nota={enviada.nota} />
        <p className="mt-2 text-lg font-bold">Obrigado pela avaliação!</p>
        <p className="mt-1 text-sm text-tinta-suave">
          {boa
            ? "Ajuda muito outras pessoas a acharem a gente."
            : `Sentimos muito. A ${nomeLoja || "loja"} vai falar com você para resolver.`}
        </p>
        {boa && enviada.google && (
          <a href={enviada.google} target="_blank" rel="noreferrer" className="btn mt-3 w-full rounded-md bg-sinal text-white">
            Avaliar também no Google
          </a>
        )}
        <button className="mt-3 text-sm underline" onClick={() => setEnviada(null)}>
          Mudar minha avaliação
        </button>
      </section>
    );
  }

  return (
    <section className="mb-6 rounded-md border-2 border-linha p-4">
      <p className="text-center text-lg font-bold">Como foi o atendimento?</p>
      <div className="mt-2 flex justify-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} aria-label={`Nota ${n}`} className="p-1" onClick={() => setNota(n)}>
            <Star size={36} className={n <= nota ? "fill-amber-400 text-amber-500" : "text-linha"} />
          </button>
        ))}
      </div>
      {nota > 0 && (
        <div className="mt-3 space-y-3">
          <textarea
            className="input"
            rows={3}
            maxLength={500}
            placeholder={ehPromotora(nota) ? "Quer deixar um comentário? (opcional)" : "O que podia ter sido melhor?"}
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
          />
          {ehPromotora(nota) && comentario.trim() && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={publicar} onChange={(e) => setPublicar(e.target.checked)} />
              Podemos mostrar seu comentário no nosso site? Aparece só seu primeiro nome e o aparelho.
            </label>
          )}
          {erro && <p className="text-sm font-semibold text-red-700">{erro}</p>}
          <button className="btn w-full rounded-md bg-sinal text-white disabled:opacity-60" disabled={enviando} onClick={enviar}>
            {enviando ? "Enviando..." : "Enviar avaliação"}
          </button>
        </div>
      )}
    </section>
  );
};

export const Estrelas: React.FC<{ nota: number; tamanho?: number }> = ({ nota, tamanho = 22 }) => (
  <span className="inline-flex gap-0.5" aria-label={`${nota} de 5 estrelas`}>
    {[1, 2, 3, 4, 5].map((n) => (
      <Star key={n} size={tamanho} className={n <= Math.round(nota) ? "fill-amber-400 text-amber-500" : "text-linha"} />
    ))}
  </span>
);
