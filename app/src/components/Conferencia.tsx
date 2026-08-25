import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, AlertTriangle, Info, XCircle, ArrowRight } from "lucide-react";
import { Modal } from "./ui";
import { useApp } from "../store/AppStore";
import { brl } from "../lib/format";
import { vocabulario } from "../lib/ramos";
import {
  conferirTudo,
  dinheiroEmRisco,
  contarPorGravidade,
  type Gravidade,
} from "../lib/integridade";

/**
 * O sistema se conferindo.
 *
 * Todo problema listado aqui já aconteceu de verdade num sistema de balcão: a
 * venda que gravou e o movimento que não, o aparelho entregue sem ninguém
 * receber, o estoque negativo. Nenhum deles dá erro na hora — todos aparecem
 * no fechamento do mês, quando ninguém lembra mais o que aconteceu.
 *
 * Cada achado diz o que fazer e leva para a tela certa. Lista de problemas
 * sem saída vira tela que a pessoa aprende a fechar sem ler.
 */

const ESTILO: Record<Gravidade, { cor: string; icone: React.ReactNode; rotulo: string }> = {
  erro: {
    cor: "border-red-200 bg-red-50 text-red-800",
    icone: <XCircle size={16} />,
    rotulo: "Dinheiro em risco",
  },
  alerta: {
    cor: "border-amber-200 bg-amber-50 text-amber-800",
    icone: <AlertTriangle size={16} />,
    rotulo: "Precisa de acerto",
  },
  info: {
    cor: "border-slate-200 bg-slate-50 text-slate-700",
    icone: <Info size={16} />,
    rotulo: "Vale olhar",
  },
};

export const Conferencia: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { ordens, vendas, movimentos, produtos, fiados, clientes, sessoes, ramo } = useApp();
  const voc = vocabulario(ramo);
  const navigate = useNavigate();

  const achados = useMemo(
    () => conferirTudo({ ordens, vendas, movimentos, produtos, fiados, clientes, sessoes }),
    [ordens, vendas, movimentos, produtos, fiados, clientes, sessoes]
  );
  const contagem = contarPorGravidade(achados);
  const risco = dinheiroEmRisco(achados);

  const ir = (tela: string) => {
    onClose();
    navigate(tela);
  };

  return (
    <Modal open onClose={onClose} title="Conferência do sistema" maxWidth="max-w-2xl">
      {achados.length === 0 ? (
        <div className="py-12 text-center">
          <ShieldCheck className="mx-auto mb-3 text-emerald-500" size={40} />
          <p className="font-semibold text-slate-700">Nada fora do lugar.</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Venda sem lançamento no caixa, {voc.ordemCurta} entregue sem pagamento,
            estoque negativo, dívida sem dono e caixa esquecido aberto — nenhum desses
            aparece hoje.
          </p>
        </div>
      ) : (
        <>
          {risco > 0 && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="text-sm font-bold text-red-800">
                {brl(risco)} sem registro certo
              </p>
              <p className="mt-0.5 text-xs text-red-700">
                É dinheiro que saiu ou entrou e o sistema não sabe onde está. Nada disso
                dá erro na hora — tudo aparece no fechamento do mês.
              </p>
            </div>
          )}

          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            {(["erro", "alerta", "info"] as Gravidade[]).map((g) =>
              contagem[g] > 0 ? (
                <span key={g} className={`badge ${ESTILO[g].cor}`}>
                  {ESTILO[g].icone} {contagem[g]} {ESTILO[g].rotulo}
                </span>
              ) : null
            )}
          </div>

          <div className="max-h-[55vh] space-y-2 overflow-y-auto">
            {achados.map((a, i) => (
              <div key={i} className={`rounded-lg border p-3 ${ESTILO[a.gravidade].cor}`}>
                <div className="flex flex-wrap items-start gap-2">
                  <span className="mt-0.5 shrink-0">{ESTILO[a.gravidade].icone}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{a.titulo}</p>
                    <p className="mt-0.5 text-xs opacity-90">{a.saida}</p>
                  </div>
                  {a.valor != null && a.valor > 0 && (
                    <span className="shrink-0 text-sm font-bold">{brl(a.valor)}</span>
                  )}
                </div>
                {a.ref && (
                  <button
                    className="mt-2 flex items-center gap-1 text-xs font-semibold underline"
                    onClick={() => ir(a.ref!.tela)}
                  >
                    Abrir a tela <ArrowRight size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
};
