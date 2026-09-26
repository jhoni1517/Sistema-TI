import React, { useState } from "react";
import { Smartphone, Trash2, Plus } from "lucide-react";
import { uid } from "../lib/format";
import type { AparelhoReserva } from "../lib/types";

/** Cadastro dos aparelhos da loja para emprestar (Configurações). */
export const AparelhosReservaConfig: React.FC<{ valor?: AparelhoReserva[]; onMudar: (v: AparelhoReserva[]) => void }> = ({ valor, onMudar }) => {
  const lista = valor || [];
  const [nome, setNome] = useState("");
  const [imei, setImei] = useState("");
  const incluir = () => {
    if (!nome.trim()) return;
    onMudar([...lista, { id: uid(), nome: nome.trim(), imei: imei.trim() || undefined }]);
    setNome("");
    setImei("");
  };
  return (
    <div>
      <h3 className="mb-1 flex items-center gap-2 font-bold text-tinta">
        <Smartphone size={16} /> Aparelhos reserva
      </h3>
      <p className="mb-2 text-sm text-tinta-suave">Celulares da loja para emprestar durante o conserto. Na OS aparece "Emprestar reserva".</p>
      {lista.map((a) => (
        <div key={a.id} className="flex items-center justify-between gap-2 border-b border-linha py-1.5 text-sm">
          <span>
            <b>{a.nome}</b>
            {a.imei && <span className="text-tinta-suave"> · {a.imei}</span>}
          </span>
          <button
            type="button"
            className="p-1 text-tinta-suave hover:text-red-600"
            aria-label={`Tirar ${a.nome}`}
            onClick={() => confirm(`Tirar "${a.nome}" dos reservas?`) && onMudar(lista.filter((x) => x.id !== a.id))}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <div className="mt-2 flex flex-wrap gap-2">
        <input className="input min-w-0 flex-1" placeholder="Ex.: Moto G22 preto" value={nome} onChange={(e) => setNome(e.target.value)} />
        <input className="input min-w-0 flex-1" placeholder="IMEI (opcional)" inputMode="numeric" value={imei} onChange={(e) => setImei(e.target.value)} />
        <button type="button" className="btn-secondary" onClick={incluir}>
          <Plus size={16} /> Incluir
        </button>
      </div>
    </div>
  );
};
