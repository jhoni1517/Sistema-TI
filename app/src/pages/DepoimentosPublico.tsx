import React, { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { supabase, supabaseEnabled } from "../lib/supabase";
import { MarcaDaLoja } from "../components/MarcaDaLoja";
import { Estrelas } from "../components/AvaliarAtendimento";
import { formatDate, whatsappLink } from "../lib/format";
import { mediaEmTexto } from "../lib/depoimentos";

interface Dados {
  loja: string;
  logo: string | null;
  whatsapp: string | null;
  google: string | null;
  total: number;
  media: number | null;
  depoimentos: { nome: string; aparelho: string | null; nota: number; comentario: string; data: string }[];
}

/**
 * /depoimentos/:loja — o que os clientes disseram, com autorização deles.
 * Com ?embed=1 vira o widget que a loja cola no site (sem cabeçalho, fundo
 * transparente). Quem escolhe o que aparece é depoimentos_publicos.
 */
export const DepoimentosPublico: React.FC = () => {
  const { loja = "" } = useParams();
  const embed = new URLSearchParams(useLocation().search).get("embed") === "1";
  const [d, setD] = useState<Dados | null | undefined>(undefined);

  useEffect(() => {
    if (!supabaseEnabled || !supabase) return setD(null);
    supabase.rpc("depoimentos_publicos", { p_loja: loja }).then(({ data, error }) => setD(error || !data ? null : (data as Dados)));
  }, [loja]);

  const corpo =
    d === undefined ? (
      <p className="text-center text-tinta-suave">Abrindo...</p>
    ) : d === null ? (
      <p className="text-center text-tinta-suave">Página não disponível.</p>
    ) : (
      <div className="space-y-3">
        {d.media !== null && d.total > 0 && (
          <div className="flex items-center gap-3">
            <Estrelas nota={Number(d.media)} />
            <span className="font-bold">{mediaEmTexto(Number(d.media))}</span>
            <span className="text-sm text-tinta-suave">· {d.total} avaliações</span>
          </div>
        )}
        {d.depoimentos.length === 0 ? (
          <p className="py-6 text-center text-tinta-suave">Ainda sem depoimentos publicados.</p>
        ) : (
          d.depoimentos.map((x, i) => (
            <figure key={i} className="rounded-md border border-linha bg-cartao p-4">
              <Estrelas nota={x.nota} tamanho={16} />
              <blockquote className="mt-2">"{x.comentario}"</blockquote>
              <figcaption className="mt-2 text-sm text-tinta-suave">
                <b className="text-tinta">{x.nome}</b>
                {x.aparelho ? ` · ${x.aparelho}` : ""} · {formatDate(x.data)}
              </figcaption>
            </figure>
          ))
        )}
      </div>
    );

  if (embed) return <div className="bg-transparent p-2 font-grotesca text-tinta">{corpo}</div>;

  return (
    <div className="min-h-screen bg-papel p-4 font-grotesca text-tinta">
      <div className="mx-auto max-w-lg py-6">
        {d && (
          <div className="mb-4 flex items-center gap-3">
            <MarcaDaLoja logoUrl={d.logo || undefined} tamanho={44} />
            <div>
              <h1 className="text-xl font-bold">{d.loja}</h1>
              <p className="text-sm text-tinta-suave">O que os clientes dizem</p>
            </div>
          </div>
        )}
        {corpo}
        {d?.whatsapp && d.whatsapp.length >= 10 && (
          <a className="btn mt-4 w-full rounded-md bg-sinal text-white" href={whatsappLink(d.whatsapp, "Olá! Vi os depoimentos de vocês e quero um orçamento.")} target="_blank" rel="noreferrer">
            <MessageCircle size={18} /> Falar com a loja
          </a>
        )}
      </div>
    </div>
  );
};
