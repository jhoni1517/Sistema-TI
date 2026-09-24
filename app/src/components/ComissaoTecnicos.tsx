import React, { useMemo, useState } from "react";
import { Users, Printer, Settings2 } from "lucide-react";
import { useApp } from "../store/AppStore";
import { Modal, InputNumero } from "./ui";
import { brl } from "../lib/format";
import { printHTML } from "../lib/print";
import { hojeISO } from "../lib/contas";
import {
  comissoes,
  produtividade,
  regraDoTecnico,
  reciboComissao,
  chaveDoTecnico,
  TIPO_COMISSAO,
  type TipoComissao,
} from "../lib/comissao";

const ultimoDia = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
};

/**
 * Comissão e produtividade por técnico, por mês, com o recibo do
 * fechamento. Nenhuma conta aqui: tudo em lib/comissao.ts.
 */
export const ComissaoTecnicos: React.FC = () => {
  const { ordens, config, saveConfig } = useApp();
  const [mes, setMes] = useState(hojeISO().slice(0, 7));
  const [editando, setEditando] = useState<string | null>(null);
  const de = `${mes}-01`;
  const ate = ultimoDia(mes);

  const lista = useMemo(() => comissoes(ordens, config, de, ate), [ordens, config, de, ate]);
  const prod = useMemo(() => new Map(produtividade(ordens, de, ate).map((p) => [p.tecnico, p])), [ordens, de, ate]);

  return (
    <div className="card lg:col-span-2">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-bold text-tinta">
          <Users size={16} /> Técnicos: produtividade e comissão
        </h3>
        <input type="month" className="input !w-auto !py-1.5 text-sm" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} />
      </div>
      {lista.length === 0 ? (
        <p className="py-8 text-center text-sm text-tinta-suave">Nenhuma OS entregue neste mês.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-linha text-left text-xs uppercase text-tinta-suave">
              <tr>
                <th className="px-2 py-2">Técnico</th>
                <th className="px-2 py-2 text-center">OS</th>
                <th className="px-2 py-2 text-center">Bancada</th>
                <th className="px-2 py-2 text-center">Retrabalho</th>
                <th className="px-2 py-2 text-right">Gerado</th>
                <th className="px-2 py-2">Regra</th>
                <th className="px-2 py-2 text-right">Comissão</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => {
                const p = prod.get(c.tecnico);
                return (
                  <tr key={c.tecnico} className="border-b border-linha">
                    <td className="px-2 py-2 font-semibold">{c.tecnico}</td>
                    <td className="valor px-2 py-2 text-center">{c.ordens}</td>
                    <td className="valor px-2 py-2 text-center">{p?.tempoMedio != null ? `${String(p.tempoMedio).replace(".", ",")}d` : "-"}</td>
                    <td className={`valor px-2 py-2 text-center ${p && p.retrabalho >= 10 ? "font-bold text-red-700" : ""}`}>
                      {p ? `${p.retrabalho}% (${p.retornos})` : "-"}
                    </td>
                    <td className="valor px-2 py-2 text-right">{brl(c.faturado)}</td>
                    <td className="px-2 py-2 text-xs text-tinta-suave">
                      <button className="underline decoration-dotted" onClick={() => setEditando(c.tecnico)}>
                        {c.regra.tipo === "fixo" ? `${brl(c.regra.valor)} por OS` : `${c.regra.valor}% ${TIPO_COMISSAO[c.regra.tipo].replace("% ", "")}`}
                      </button>
                    </td>
                    <td className="valor px-2 py-2 text-right font-bold text-status-pronta">{brl(c.valor)}</td>
                    <td className="px-2 py-2 text-right">
                      <button
                        className="btn-ghost !p-1.5"
                        title="Recibo do mês"
                        onClick={() => printHTML(reciboComissao(c, mes, config.nomeLoja), `Comissão ${c.tecnico} ${mes}`, "a4")}
                      >
                        <Printer size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-tinta-suave">
            Bancada: dias da abertura até ficar pronta. Retrabalho: quantas voltaram na garantia, cobradas de quem fez o
            conserto original (pelo IMEI).
          </p>
        </div>
      )}
      {editando && (
        <EditarRegra
          tecnico={editando}
          onFechar={() => setEditando(null)}
          onSalvar={(tipo, valor) => {
            saveConfig({
              ...config,
              regrasComissao: { ...(config.regrasComissao || {}), [chaveDoTecnico(editando)]: { tipo, valor } },
            });
            setEditando(null);
          }}
        />
      )}
    </div>
  );
};

const EditarRegra: React.FC<{
  tecnico: string;
  onFechar: () => void;
  onSalvar: (tipo: TipoComissao, valor: number) => void;
}> = ({ tecnico, onFechar, onSalvar }) => {
  const { config } = useApp();
  const atual = regraDoTecnico(tecnico, config);
  const [tipo, setTipo] = useState<TipoComissao>(atual.tipo);
  const [valor, setValor] = useState<number | undefined>(atual.valor);
  return (
    <Modal
      open
      onClose={onFechar}
      title={`Comissão de ${tecnico}`}
      maxWidth="max-w-sm"
      footer={
        <button className="btn-primary ml-auto" onClick={() => onSalvar(tipo, Math.max(0, valor || 0))}>
          Salvar
        </button>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-1.5">
          {(Object.keys(TIPO_COMISSAO) as TipoComissao[]).map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input type="radio" name="tipo-comissao" checked={tipo === k} onChange={() => setTipo(k)} />
              {TIPO_COMISSAO[k]}
            </label>
          ))}
        </div>
        <label className="block text-sm">
          {tipo === "fixo" ? "Valor por OS (R$)" : "Percentual (%)"}
          <InputNumero className="input mt-1" value={valor} onChange={setValor} />
        </label>
        <p className="flex items-center gap-1 text-xs text-tinta-suave">
          <Settings2 size={12} /> Vale para as OS entregues de todos os meses, inclusive o recibo.
        </p>
      </div>
    </Modal>
  );
};
