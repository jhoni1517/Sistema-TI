import React, { useMemo, useState } from "react";
import { Lightbulb, Sparkles, Check } from "lucide-react";
import { aviso } from "./Aviso";
import { useIaLigada } from "./useIaLigada";
import { brl, normalizar } from "../lib/format";
import { perguntarIA, usoDoMes } from "../lib/ia";
import {
  sugerir,
  resumoParaIA,
  lerDiagnosticoDaIA,
  laudoSugerido,
  temDadosParaSugerir,
  type DiagnosticoIA,
} from "../lib/sugestao";
import type { OrdemServico, PecaOS, Produto } from "../lib/types";

/**
 * A sugestão ao abrir a OS: primeiro o histórico da PRÓPRIA loja, e só se
 * o técnico pedir, a IA.
 *
 * Tudo é sugestão. Cada número diz de onde veio ("baseado em 12 OS suas"),
 * e nada muda na OS sem clicar em "Usar" — o técnico é quem assina o
 * orçamento, não o sistema.
 */
export const SugestaoDaOS: React.FC<{
  os: OrdemServico;
  ordens: OrdemServico[];
  produtos: Produto[];
  onUsarOrcamento: (pecas: PecaOS[], maoDeObra: number | null) => void;
  onUsarLaudo: (texto: string) => void;
}> = ({ os, ordens, produtos, onUsarOrcamento, onUsarLaudo }) => {
  const s = useMemo(
    () => sugerir(ordens, os),
    // Recalcula só quando muda o que entra na conta, e não a cada tecla em outro campo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ordens, os.id, os.marca, os.modelo, os.defeitoRelatado]
  );
  const [ia, setIa] = useState<DiagnosticoIA | null>(null);
  const [perguntando, setPerguntando] = useState(false);
  const [uso, setUso] = useState("");
  const ligada = useIaLigada();

  if (!temDadosParaSugerir(os)) return null;

  const perguntar = async () => {
    if (perguntando) return;
    setPerguntando(true);
    try {
      const r = await perguntarIA("diagnostico", {
        tipo: os.tipoAparelho,
        marca: os.marca,
        modelo: os.modelo,
        defeito: os.defeitoRelatado,
        resumoLocal: resumoParaIA(s),
      });
      setIa(lerDiagnosticoDaIA(r.bruto));
      setUso(usoDoMes(r.usados, r.limite));
    } catch (e) {
      aviso.erro("A IA não respondeu:\n\n" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setPerguntando(false);
    }
  };

  const usarOrcamento = () => {
    if (!s) return;
    // Peça que já está na OS não entra de novo: "Usar" duas vezes não pode
    // dobrar o orçamento.
    const jaTem = new Set((os.pecas || []).map((p) => normalizar(p.descricao)));
    const novas: PecaOS[] = s.pecas
      .filter((p) => !jaTem.has(normalizar(p.descricao)))
      .map((p) => {
        const prod = p.produtoId ? produtos.find((x) => x.id === p.produtoId) : undefined;
        return {
          produtoId: prod?.id,
          descricao: p.descricao,
          quantidade: 1,
          // O custo de HOJE, quando a peça está no estoque: a média do
          // histórico pode ser de antes do fornecedor subir o preço.
          custoUnit: prod ? Number(prod.custo) || 0 : p.custoMedio,
          precoUnit: p.precoMedio,
        };
      });
    // Mão de obra só entra se estiver vazia: o técnico pode já ter digitado.
    onUsarOrcamento(novas, Number(os.maoDeObra) > 0 ? null : s.maoDeObraMedia);
    aviso.sucesso("Sugestão aplicada. Confira as peças e os valores antes de salvar.");
  };

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
      <p className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-900">
        <Lightbulb size={16} /> Sugestão
      </p>

      {s ? (
        <div className="text-sm text-slate-700">
          <p>
            Consertos parecidos saíram por <b>{brl(s.precoMedio)}</b>
            {s.precoMin !== s.precoMax && (
              <>
                {" "}
                (de {brl(s.precoMin)} a {brl(s.precoMax)})
              </>
            )}
            {s.diasMedios !== null && <>, prontos em {s.diasMedios} dia(s)</>}.
          </p>
          {s.pecas.length > 0 && (
            <p className="mt-1 text-xs text-slate-600">
              Peças que mais apareceram:{" "}
              {s.pecas.map((p) => `${p.descricao} (${p.vezes}x, ${brl(p.precoMedio)})`).join(" · ")}
            </p>
          )}
          <p className="mt-1 text-xs text-slate-500">
            {s.origem}: {s.numeros.slice(0, 6).map((n) => `OS${String(n).padStart(5, "0")}`).join(", ")}
            {s.numeros.length > 6 ? "…" : ""}
          </p>
          <button className="btn-secondary mt-2 !py-1 text-xs" onClick={usarOrcamento}>
            <Check size={13} /> Usar peças e mão de obra
          </button>
        </div>
      ) : (
        <p className="text-xs text-slate-600">
          Ainda não tem OS parecida concluída na loja para comparar preço.
        </p>
      )}

      {ligada && (
      <div className="mt-3 border-t border-amber-200 pt-2">
        {!ia ? (
          <button className="btn-ghost !py-1 text-xs" disabled={perguntando} onClick={perguntar}>
            <Sparkles size={13} /> {perguntando ? "Perguntando..." : "Perguntar à IA: causas prováveis e testes"}
          </button>
        ) : (
          <div className="text-sm text-slate-700">
            <p className="text-xs font-semibold text-slate-500">
              Da IA, sem garantia — confira na bancada{uso ? ` · ${uso}` : ""}
            </p>
            <ul className="mt-1 list-disc pl-5">
              {ia.causas.map((c, i) => (
                <li key={i}>
                  {c.causa} <span className="text-xs text-slate-500">({c.chance})</span>
                </li>
              ))}
            </ul>
            {ia.testes.length > 0 && (
              <p className="mt-1 text-xs text-slate-600">Testes: {ia.testes.join(" · ")}</p>
            )}
            <button
              className="btn-secondary mt-2 !py-1 text-xs"
              onClick={() => {
                onUsarLaudo(laudoSugerido(ia));
                aviso.sucesso("Colado no laudo. Edite antes de mandar ao cliente.");
              }}
            >
              <Check size={13} /> Usar no laudo
            </button>
          </div>
        )}
      </div>
      )}
    </div>
  );
};
