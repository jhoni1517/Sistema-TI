import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, ChevronRight } from "lucide-react";
import texto from "../../NOVIDADES.md?raw";
import { useApp } from "../store/AppStore";
import { Modal } from "./ui";
import { formatDate } from "../lib/format";
import { hojeISO } from "../lib/contas";
import { lerNovidades, novidadesDoRamo, naoVistas, maisNova, CHAVE_VISTAS } from "../lib/novidades";

const TODAS = lerNovidades(texto);
const AVISO = "sistema-ti:novidades-mudou";

const lerVisto = (): string | null => {
  try {
    return localStorage.getItem(CHAVE_VISTAS);
  } catch {
    return null;
  }
};

/**
 * O sininho das novidades. Aparece duas vezes (menu do computador e topo
 * do celular); marcar como visto num avisa o outro pelo evento.
 */
export const Sino: React.FC<{ variante: "menu" | "topo" }> = ({ variante }) => {
  const { ramo } = useApp();
  const navigate = useNavigate();
  const [aberto, setAberto] = useState(false);
  const [visto, setVisto] = useState(lerVisto);

  useEffect(() => {
    const atualizar = () => setVisto(lerVisto());
    window.addEventListener(AVISO, atualizar);
    return () => window.removeEventListener(AVISO, atualizar);
  }, []);

  const lista = useMemo(() => novidadesDoRamo(TODAS, ramo), [ramo]);
  const novas = naoVistas(lista, visto, hojeISO());

  // O que era novo NA HORA de abrir: o selo "Novo" fica até fechar, mesmo
  // com o número do sino já zerado.
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());

  const abrir = () => {
    setMarcadas(new Set(novas.map((n) => n.data + n.titulo)));
    setAberto(true);
    try {
      localStorage.setItem(CHAVE_VISTAS, maisNova(lista));
    } catch {
      /* sem armazenamento: o sino só volta a acender na próxima abertura */
    }
  };

  const fechar = () => {
    setAberto(false);
    window.dispatchEvent(new Event(AVISO));
  };

  if (lista.length === 0) return null;

  return (
    <>
      <button
        onClick={abrir}
        aria-label={novas.length ? `${novas.length} novidade(s)` : "Novidades"}
        title="Novidades"
        className={
          variante === "menu"
            ? "relative flex shrink-0 items-center justify-center rounded-lg bg-menu-2 px-3 text-menu-suave hover:bg-menu-3 hover:text-menu-texto"
            : "alvo-toque relative rounded-lg text-slate-600 hover:bg-slate-100"
        }
      >
        <Bell size={variante === "menu" ? 18 : 20} />
        {novas.length > 0 && (
          <span className="valor absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-sinal px-1 text-[11px] font-bold text-white">
            {novas.length}
          </span>
        )}
      </button>
      <Modal open={aberto} onClose={fechar} title="Novidades do sistema" maxWidth="max-w-md">
        <ul className="divide-y divide-linha">
          {lista.map((n) => (
            <li key={n.data + n.titulo}>
              <button
                className="flex w-full items-center gap-3 py-3 text-left"
                onClick={() => {
                  fechar();
                  navigate(n.rota);
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    {marcadas.has(n.data + n.titulo) && (
                      <span className="rounded bg-sinal px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Novo</span>
                    )}
                    <span className="font-bold text-tinta">{n.titulo}</span>
                  </span>
                  <span className="mt-0.5 block text-sm text-tinta-suave">{n.frase}</span>
                  <span className="valor mt-0.5 block text-xs text-tinta-suave">{formatDate(n.data)}</span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-tinta-suave" />
              </button>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
};
