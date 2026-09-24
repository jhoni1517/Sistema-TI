import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, XCircle, ShieldCheck, MessageCircle, BatteryMedium } from "lucide-react";
import { supabase, supabaseEnabled } from "../lib/supabase";
import { MarcaDaLoja } from "../components/MarcaDaLoja";
import { brl, formatDate, whatsappLink } from "../lib/format";
import { CHECKLIST_USADO, textoGarantiaSeminovo } from "../lib/seminovo";

interface FichaPublica {
  nome: string;
  preco: number;
  precoDe: number | null;
  disponivel: boolean;
  ok: Record<string, boolean>;
  bateria: number | null;
  imeiFinal: string | null;
  fotos: string[];
  garantiaDias: number;
  avaliadoEm: string | null;
  loja: string;
  logo: string | null;
  whatsapp: string | null;
}

/**
 * A ficha do seminovo que a loja manda ou cola no aparelho da vitrine.
 * Quem corta o que sai é a função ficha_seminovo: aqui não chega custo.
 */
export const SeminovoPublico: React.FC = () => {
  const { loja = "", token = "" } = useParams();
  const [f, setF] = useState<FichaPublica | null | undefined>(undefined);

  useEffect(() => {
    if (!supabaseEnabled || !supabase) return setF(null);
    supabase.rpc("ficha_seminovo", { p_loja: loja, p_token: token }).then(({ data, error }) => {
      const linha = !error && (Array.isArray(data) ? data[0] : data);
      setF(linha ? (linha as FichaPublica) : null);
    });
  }, [loja, token]);

  const zap =
    f?.whatsapp && f.whatsapp.length >= 10
      ? whatsappLink(f.whatsapp, `Oi! Vi a ficha do ${f.nome} por ${brl(Number(f.preco))}. Ainda está disponível?`)
      : "";

  return (
    <div className="min-h-screen bg-papel p-4 font-grotesca text-tinta">
      <div className="mx-auto max-w-lg py-6">
        {f === undefined ? (
          <p className="text-center text-tinta-suave">Abrindo...</p>
        ) : f === null ? (
          <div className="rounded-md border border-linha bg-cartao p-6 text-center">
            <p className="font-semibold">Esta ficha não está disponível.</p>
            <p className="mt-1 text-sm text-tinta-suave">Peça o link de novo para a loja.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-linha bg-cartao">
            <div className="flex items-center gap-3 border-b border-linha p-4">
              <MarcaDaLoja logoUrl={f.logo || undefined} tamanho={40} />
              <p className="font-bold">{f.loja}</p>
            </div>
            {f.fotos.length > 0 && (
              <div className="flex snap-x gap-2 overflow-x-auto p-3">
                {f.fotos.map((u) => (
                  <img key={u} src={u} alt="" className="h-56 w-56 shrink-0 snap-center rounded object-cover" />
                ))}
              </div>
            )}
            <div className="p-4">
              <h1 className="text-2xl font-bold">{f.nome}</h1>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="valor text-3xl font-bold text-sinal">{brl(Number(f.preco))}</span>
                {f.precoDe && <span className="valor text-sm text-tinta-suave line-through">{brl(Number(f.precoDe))}</span>}
              </div>
              {!f.disponivel && <p className="mt-1 font-semibold text-red-700">Já foi vendido.</p>}

              <p className="mt-3 flex items-center gap-2 font-semibold text-status-pronta">
                <ShieldCheck size={18} /> {textoGarantiaSeminovo(f.garantiaDias)}
              </p>
              {f.bateria != null && (
                <p className="mt-1 flex items-center gap-2 text-sm">
                  <BatteryMedium size={18} /> Saúde da bateria: <b className="valor">{f.bateria}%</b>
                </p>
              )}

              <h2 className="rotulo mt-5">Testado pela loja</h2>
              <ul className="mt-2 space-y-1.5 text-sm">
                {CHECKLIST_USADO.map((i) => (
                  <li key={i.k} className="flex items-center gap-2">
                    {f.ok?.[i.k] ? (
                      <CheckCircle2 size={17} className="shrink-0 text-status-pronta" />
                    ) : (
                      <XCircle size={17} className="shrink-0 text-red-700" />
                    )}
                    <span className={f.ok?.[i.k] ? "" : "text-tinta-suave"}>{i.rotulo}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-tinta-suave">
                {f.avaliadoEm && <>Avaliado em <span className="valor">{formatDate(f.avaliadoEm)}</span>. </>}
                {f.imeiFinal && <>IMEI final <span className="valor">{f.imeiFinal}</span>.</>}
              </p>

              {zap && f.disponivel && (
                <a href={zap} target="_blank" rel="noreferrer" className="btn mt-5 w-full rounded-md bg-status-pronta text-white">
                  <MessageCircle size={16} /> Quero este aparelho
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
