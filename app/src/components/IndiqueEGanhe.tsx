import React, { useEffect, useState } from "react";
import { Gift, Copy, MessageCircle } from "lucide-react";
import { supabase } from "../lib/supabase";
import { emDemo } from "../lib/db";
import { useApp } from "../store/AppStore";
import { aviso } from "./Aviso";
import { abrirWhatsapp, formatDate } from "../lib/format";
import {
  INDICACAO_PENDENTE,
  linkDeIndicacao,
  mensagemDeIndicacao,
  normalizarCodigo,
  resumoIndicacoes,
  situacaoIndicada,
  SITUACAO_INDICADA,
  type SituacaoIndicada,
} from "../lib/indicacao";

interface Indicada {
  nome: string;
  desde: string | null;
  situacao: SituacaoIndicada;
}

const origem = () => window.location.origin + window.location.pathname;

/** Resposta de usar_indicacao, dita em uma frase */
export async function usarIndicacao(codigo: string): Promise<string> {
  if (!supabase) throw new Error("Sem conexão com a nuvem.");
  const { data, error } = await supabase.rpc("usar_indicacao", { p_codigo: normalizarCodigo(codigo) });
  if (error) {
    if (/function|does not exist|schema cache|PGRST202/i.test(error.message)) {
      throw new Error("Falta rodar o SQL da indicação no Supabase (supabase-migracao-indicacao.sql).");
    }
    throw new Error(error.message);
  }
  const r = data as { ok?: boolean; erro?: string; venceEm?: string };
  if (!r?.ok) throw new Error(r?.erro || "O código não foi aceito.");
  return `Código aceito: você ganhou 30 dias a mais. Teste grátis até ${formatDate(r.venceEm)}.`;
}

/** "Indique e ganhe", na tela de Assinatura */
export const IndiqueEGanhe: React.FC = () => {
  const { config } = useApp();
  const [codigo, setCodigo] = useState("");
  const [lista, setLista] = useState<Indicada[] | null>(null);
  const [erro, setErro] = useState("");
  const [digitado, setDigitado] = useState("");
  const [usando, setUsando] = useState(false);

  useEffect(() => {
    if (emDemo() || !supabase) return;
    supabase.rpc("meu_codigo_indicacao").then(({ data, error }) => {
      if (error) return setErro(/function|does not exist|PGRST202/i.test(error.message) ? "Falta rodar o SQL da indicação no Supabase." : error.message);
      setCodigo(typeof data === "string" ? data : "");
    });
    supabase.rpc("minhas_indicacoes").then(({ data, error }) => {
      if (error) return setLista([]);
      setLista(
        ((data as { nome: string; desde: string | null; situacao: string }[]) || []).map((x) => ({
          ...x,
          situacao: situacaoIndicada(x.situacao),
        }))
      );
    });
  }, []);

  if (emDemo()) return null;
  const link = linkDeIndicacao(origem(), codigo);

  const usar = async () => {
    setUsando(true);
    try {
      aviso.sucesso(await usarIndicacao(digitado));
      setDigitado("");
    } catch (e) {
      aviso.erro(e instanceof Error ? e.message : String(e));
    } finally {
      setUsando(false);
    }
  };

  return (
    <div className="card mb-5">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Gift size={20} className="text-sinal" /> Indique e ganhe
      </h2>
      <p className="mt-1 text-sm text-tinta-suave">
        Mande seu link para outro lojista. Ele ganha 30 dias a mais de teste, e você ganha <b>1 mês grátis</b> quando ele
        pagar a primeira mensalidade.
      </p>

      {erro ? (
        <p className="mt-3 text-sm text-red-700">{erro}</p>
      ) : (
        link && (
          <>
            <p className="mt-3 break-all rounded bg-papel p-3 font-mono text-xs">{link}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <button className="btn-primary" onClick={() => abrirWhatsapp("", mensagemDeIndicacao(config.nomeLoja, link))}>
                <MessageCircle size={16} /> Mandar no WhatsApp
              </button>
              <button
                className="btn-secondary"
                onClick={() =>
                  navigator.clipboard
                    .writeText(link)
                    .then(() => aviso.sucesso("Link copiado."))
                    .catch(() => aviso.alerta("Não deu para copiar. Segure o dedo no link e copie."))
                }
              >
                <Copy size={16} /> Copiar link
              </button>
            </div>
          </>
        )
      )}

      <div className="mt-4 border-t border-linha pt-3">
        <p className="text-sm font-semibold">{lista ? resumoIndicacoes(lista) : "Carregando indicações..."}</p>
        {lista && lista.length > 0 && (
          <ul className="mt-2 divide-y divide-linha">
            {lista.map((x, i) => (
              <li key={i} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0 truncate">
                  {x.nome}
                  {x.desde && <span className="text-tinta-suave"> · desde {formatDate(x.desde)}</span>}
                </span>
                <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-bold ${SITUACAO_INDICADA[x.situacao].cor}`}>
                  {SITUACAO_INDICADA[x.situacao].texto}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-tinta-suave">Outra loja me indicou</summary>
        <div className="mt-2 flex gap-2">
          <input
            className="input font-mono uppercase tracking-widest"
            placeholder="CÓDIGO"
            maxLength={8}
            value={digitado}
            onChange={(e) => setDigitado(normalizarCodigo(e.target.value))}
          />
          <button className="btn-secondary" onClick={usar} disabled={usando || digitado.length < 6}>
            {usando ? "..." : "Usar"}
          </button>
        </div>
        <p className="mt-1 text-xs text-tinta-suave">Vale nos primeiros 30 dias, antes do primeiro pagamento.</p>
      </details>
    </div>
  );
};

/**
 * Usa sozinho o código que ficou guardado ao abrir o link de indicação.
 * Só o dono; roda uma vez por abertura. Recusa definitiva (já usou, código
 * errado) apaga o guardado; falha de rede deixa para a próxima.
 */
export const AplicarIndicacao: React.FC<{ dono: boolean }> = ({ dono }) => {
  useEffect(() => {
    if (!dono || emDemo()) return;
    let codigo = "";
    try {
      codigo = localStorage.getItem(INDICACAO_PENDENTE) || "";
    } catch {
      return;
    }
    if (!codigo) return;
    usarIndicacao(codigo)
      .then((msg) => {
        localStorage.removeItem(INDICACAO_PENDENTE);
        aviso.sucesso(msg);
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        if (/internet|fetch|network|SQL/i.test(msg)) return;
        localStorage.removeItem(INDICACAO_PENDENTE);
      });
  }, [dono]);
  return null;
};
