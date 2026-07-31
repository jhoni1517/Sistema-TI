import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Wrench, Users, Package, X, CornerDownLeft } from "lucide-react";
import { useApp } from "../store/AppStore";
import { buscarTudo, type Resultado, type TipoResultado } from "../lib/busca";

/**
 * Busca única em clientes, ordens e produtos. Abre com Ctrl+K ou pelo botão.
 *
 * A regra de o QUE casa com o QUÊ mora em lib/busca.ts, com teste. Ela
 * estava aqui dentro e por isso não cobria o jeito como se digita de
 * verdade no balcão: "12" em vez de "OS00012", telefone com a máscara que
 * veio colada do WhatsApp, nome sem acento.
 */
export const BuscaGlobal: React.FC<{ aberto: boolean; onClose: () => void }> = ({
  aberto,
  onClose,
}) => {
  const { clientes, ordens, produtos } = useApp();
  const [q, setQ] = useState("");
  const [escolhido, setEscolhido] = useState(0);
  const navigate = useNavigate();

  // Reabrir limpo: a busca de dois minutos atrás não ajuda em nada agora.
  useEffect(() => {
    if (aberto) {
      setQ("");
      setEscolhido(0);
    }
  }, [aberto]);

  useEffect(() => setEscolhido(0), [q]);

  const resultados = useMemo<Resultado[]>(
    () => buscarTudo(q, { clientes, ordens, produtos }),
    [q, ordens, clientes, produtos]
  );

  if (!aberto) return null;

  const abrir = (r: Resultado | undefined) => {
    if (!r) return;
    navigate(r.rota);
    onClose();
  };

  const icone = (t: TipoResultado) =>
    t === "os" ? <Wrench size={16} /> : t === "cliente" ? <Users size={16} /> : <Package size={16} />;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/50 p-4 pt-24 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-4">
          <Search size={18} className="text-slate-400" />
          <input
            autoFocus
            className="flex-1 bg-transparent py-4 text-sm text-slate-800 outline-none placeholder:text-slate-400"
            placeholder="OS, cliente, telefone, IMEI, código de barras..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") return onClose();
              if (e.key === "Enter") {
                e.preventDefault();
                return abrir(resultados[escolhido]);
              }
              // Escolher pelo teclado: no balcão a mão já está no teclado, e
              // ir para o mouse a cada busca custa mais do que parece.
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setEscolhido((i) => Math.min(i + 1, resultados.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setEscolhido((i) => Math.max(i - 1, 0));
              }
            }}
          />
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {q.trim().length < 2 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">
              Digite ao menos 2 letras para buscar em tudo.
            </p>
          ) : resultados.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">Nada encontrado.</p>
          ) : (
            resultados.map((r, i) => (
              <button
                key={`${r.tipo}-${r.id}`}
                onMouseEnter={() => setEscolhido(i)}
                onClick={() => abrir(r)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left ${
                  i === escolhido ? "bg-brand-50" : "hover:bg-slate-50"
                }`}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  {icone(r.tipo)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-800">
                    {r.titulo}
                  </span>
                  <span className="block truncate text-xs text-slate-400">{r.detalhe}</span>
                </span>
                {r.extra && <span className="text-sm font-bold text-slate-600">{r.extra}</span>}
              </button>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <CornerDownLeft size={12} /> Enter abre · setas escolhem
          </span>
          <span>Ctrl + K para abrir a qualquer momento</span>
        </div>
      </div>
    </div>
  );
};
