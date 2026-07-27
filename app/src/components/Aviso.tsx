import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from "lucide-react";

/**
 * Avisos flutuantes no lugar do alert() do navegador.
 *
 * O alert() trava a página inteira, aparece com a cara do sistema
 * operacional (e no celular ainda mostra o endereço do site em cima) e
 * obriga um toque a mais para qualquer confirmação boba. Aqui o aviso
 * aparece, informa e some sozinho, sem interromper o trabalho no balcão.
 */

type Tipo = "sucesso" | "erro" | "alerta" | "info";

interface Item {
  id: number;
  texto: string;
  tipo: Tipo;
}

interface AvisoAPI {
  sucesso: (texto: string) => void;
  erro: (texto: string) => void;
  alerta: (texto: string) => void;
  info: (texto: string) => void;
}

const Ctx = createContext<AvisoAPI | null>(null);

export const useAviso = (): AvisoAPI => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAviso deve estar dentro de <AvisoProvider>");
  return v;
};

/**
 * Mesma API, porém chamável de qualquer lugar — inclusive de funções que não
 * são componentes. Enquanto o provider não montou (ou se algo der errado),
 * cai no alert() do navegador em vez de engolir a mensagem em silêncio.
 */
let atual: AvisoAPI | null = null;

const fallback = (t: string) => {
  if (typeof window !== "undefined") window.alert(t);
};

export const aviso: AvisoAPI = {
  sucesso: (t) => (atual ? atual.sucesso(t) : fallback(t)),
  erro: (t) => (atual ? atual.erro(t) : fallback(t)),
  alerta: (t) => (atual ? atual.alerta(t) : fallback(t)),
  info: (t) => (atual ? atual.info(t) : fallback(t)),
};

const ESTILO: Record<Tipo, { cor: string; icone: React.ReactNode }> = {
  sucesso: {
    cor: "border-emerald-200 bg-emerald-50 text-emerald-800",
    icone: <CheckCircle2 size={18} className="text-emerald-600" />,
  },
  erro: {
    cor: "border-red-200 bg-red-50 text-red-800",
    icone: <XCircle size={18} className="text-red-600" />,
  },
  alerta: {
    cor: "border-amber-200 bg-amber-50 text-amber-800",
    icone: <AlertTriangle size={18} className="text-amber-600" />,
  },
  info: {
    cor: "border-slate-200 bg-white text-slate-700",
    icone: <Info size={18} className="text-brand-600" />,
  },
};

export const AvisoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [itens, setItens] = useState<Item[]>([]);

  const remover = useCallback((id: number) => {
    setItens((l) => l.filter((i) => i.id !== id));
  }, []);

  const empurrar = useCallback(
    (texto: string, tipo: Tipo) => {
      const id = Date.now() + Math.random();
      setItens((l) => [...l, { id, texto, tipo }]);
      // Erro fica mais tempo: costuma ter instrução para ler
      setTimeout(() => remover(id), tipo === "erro" ? 7000 : 4000);
    },
    [remover]
  );

  const api = useMemo<AvisoAPI>(
    () => ({
      sucesso: (t) => empurrar(t, "sucesso"),
      erro: (t) => empurrar(t, "erro"),
      alerta: (t) => empurrar(t, "alerta"),
      info: (t) => empurrar(t, "info"),
    }),
    [empurrar]
  );

  // Publica a API para uso fora de componentes
  atual = api;

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-auto sm:right-4 sm:top-4 sm:items-end sm:px-0">
        {itens.map((i) => (
          <div
            key={i.id}
            role="status"
            className={`animar-entrada pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm font-medium shadow-lg ${
              ESTILO[i.tipo].cor
            }`}
          >
            <span className="mt-0.5 shrink-0">{ESTILO[i.tipo].icone}</span>
            <span className="flex-1 whitespace-pre-line">{i.texto}</span>
            <button
              onClick={() => remover(i.id)}
              className="shrink-0 opacity-40 transition-opacity hover:opacity-100"
              aria-label="Fechar aviso"
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
};
