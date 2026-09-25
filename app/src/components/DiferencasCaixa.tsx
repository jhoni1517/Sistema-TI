import React, { useMemo, useState } from "react";
import { Scale } from "lucide-react";
import { useApp } from "../store/AppStore";
import { brl } from "../lib/format";
import { hojeISO } from "../lib/contas";
import { diferencasPorOperador } from "../lib/caixa";

/** Relatório mensal: sobra e falta de caixa por quem fechou (lib/caixa.ts). */
export const DiferencasCaixa: React.FC = () => {
  const { sessoes, movimentos } = useApp();
  const [mes, setMes] = useState(hojeISO().slice(0, 7));
  const lista = useMemo(() => diferencasPorOperador(sessoes, movimentos, mes), [sessoes, movimentos, mes]);

  return (
    <div className="card lg:col-span-2">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-bold text-tinta">
          <Scale size={16} /> Diferenças de caixa por funcionário
        </h3>
        <input type="month" className="input !w-auto !py-1.5 text-sm" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} />
      </div>
      {lista.length === 0 ? (
        <p className="py-6 text-center text-sm text-tinta-suave">Nenhum caixa fechado neste mês.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-linha text-left text-xs uppercase text-tinta-suave">
              <tr>
                <th className="px-2 py-2">Quem fechou</th>
                <th className="px-2 py-2 text-center">Fechamentos</th>
                <th className="px-2 py-2 text-center">Com diferença</th>
                <th className="px-2 py-2 text-right">Sobra</th>
                <th className="px-2 py-2 text-right">Falta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linha">
              {lista.map((d) => (
                <tr key={d.operador}>
                  <td className="px-2 py-2 font-semibold">{d.operador}</td>
                  <td className="valor px-2 py-2 text-center">
                    {d.fechamentos}
                    {d.conferidos < d.fechamentos && <span className="text-tinta-suave"> ({d.fechamentos - d.conferidos} sem contagem)</span>}
                  </td>
                  <td className="valor px-2 py-2 text-center">{d.comDiferenca}</td>
                  <td className="valor px-2 py-2 text-right text-amber-700">{d.sobra ? brl(d.sobra) : "—"}</td>
                  <td className="valor px-2 py-2 text-right font-semibold text-red-700">{d.falta ? brl(d.falta) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-tinta-suave">
            Sobra e falta separadas: faltar num dia e sobrar no outro não se anula. Até R$ 0,50 é troco e não conta.
          </p>
        </div>
      )}
    </div>
  );
};
