import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Wrench, Users, Package, X, CornerDownLeft } from "lucide-react";
import { useApp } from "../store/AppStore";
import { brl, codigoOS } from "../lib/format";
import { totalOS } from "../lib/calc";
import { OS_STATUS_META } from "../lib/types";

interface Item {
  tipo: "os" | "cliente" | "produto";
  titulo: string;
  sub: string;
  extra?: string;
  rota: string;
}

/** Busca única em clientes, ordens e produtos. Abre com Ctrl+K ou pelo botão. */
export const BuscaGlobal: React.FC<{ aberto: boolean; onClose: () => void }> = ({
  aberto,
  onClose,
}) => {
  const { clientes, ordens, produtos } = useApp();
  const [q, setQ] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (aberto) setQ("");
  }, [aberto]);

  const resultados = useMemo<Item[]>(() => {
    const termo = q.trim().toLowerCase();
    if (termo.length < 2) return [];
    const out: Item[] = [];

    for (const o of ordens) {
      const cli = clientes.find((c) => c.id === o.clienteId)?.nome || "";
      const alvo = `${codigoOS(o.numero)} ${cli} ${o.marca} ${o.modelo} ${o.imeiSerial || ""} ${o.defeitoRelatado}`.toLowerCase();
      if (alvo.includes(termo)) {
        out.push({
          tipo: "os",
          titulo: `${codigoOS(o.numero)} · ${cli || "sem cliente"}`,
          sub: `${o.marca} ${o.modelo} — ${OS_STATUS_META[o.status].label}`,
          extra: brl(totalOS(o)),
          rota: "/ordens",
        });
      }
    }

    for (const c of clientes) {
      const alvo = `${c.nome} ${c.telefone} ${c.cpf || ""} ${c.email || ""}`.toLowerCase();
      if (alvo.includes(termo)) {
        out.push({
          tipo: "cliente",
          titulo: c.nome,
          sub: c.telefone || "sem telefone",
          rota: "/clientes",
        });
      }
    }

    for (const p of produtos) {
      const alvo = `${p.nome} ${p.sku || ""} ${p.categoria || ""}`.toLowerCase();
      if (alvo.includes(termo)) {
        out.push({
          tipo: "produto",
          titulo: p.nome,
          sub: `${p.quantidade} em estoque${p.categoria ? ` · ${p.categoria}` : ""}`,
          extra: brl(p.preco),
          rota: "/estoque",
        });
      }
    }

    return out.slice(0, 12);
  }, [q, ordens, clientes, produtos]);

  if (!aberto) return null;

  const ir = (r: string) => {
    navigate(r);
    onClose();
  };

  const icone = (t: Item["tipo"]) =>
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
            placeholder="Buscar OS, cliente, aparelho, IMEI ou produto..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "Enter" && resultados[0]) ir(resultados[0].rota);
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
                key={i}
                onClick={() => ir(r.rota)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  {icone(r.tipo)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-800">{r.titulo}</span>
                  <span className="block truncate text-xs text-slate-400">{r.sub}</span>
                </span>
                {r.extra && <span className="text-sm font-bold text-slate-600">{r.extra}</span>}
              </button>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <CornerDownLeft size={12} /> Enter abre o primeiro
          </span>
          <span>Ctrl + K para abrir a qualquer momento</span>
        </div>
      </div>
    </div>
  );
};
