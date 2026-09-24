import React, { useMemo, useState } from "react";
import { PiggyBank, Settings2, TrendingUp, TrendingDown } from "lucide-react";
import { useApp } from "../store/AppStore";
import { InputNumero } from "./ui";
import { brl } from "../lib/format";
import { sobraDoMes, mesAnterior, mesDoLancamento, comparar, metaProLabore } from "../lib/sobra";

/**
 * O card do Painel. Nenhuma conta aqui: tudo vem de lib/sobra.ts.
 * Voz de balcão: "sobrou", "a maquininha ficou", nada de EBITDA.
 */
export const QuantoSobrou: React.FC = () => {
  const { movimentos, config, saveConfig } = useApp();
  const [ajustando, setAjustando] = useState(false);
  const mes = mesDoLancamento(new Date().toISOString());
  const taxas = useMemo(() => config.taxasCartao || {}, [config.taxasCartao]);
  const atual = useMemo(() => sobraDoMes(movimentos, mes, taxas), [movimentos, mes, taxas]);
  const antes = useMemo(() => sobraDoMes(movimentos, mesAnterior(mes), taxas), [movimentos, mes, taxas]);
  const cmp = comparar(atual.sobra, antes.sobra);
  const meta = metaProLabore(atual.sobra, config.metaProLabore);

  const [f, setF] = useState({ meta: config.metaProLabore, debito: taxas.debito, credito: taxas.credito, pix: taxas.pix });

  if (ajustando) {
    return (
      <div className="card mb-6">
        <h2 className="font-bold">Ajustar a conta</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <label className="text-sm">
            Quanto quero tirar por mês
            <InputNumero className="input mt-1" value={f.meta} onChange={(v) => setF({ ...f, meta: v })} />
          </label>
          <label className="text-sm">
            Taxa no débito (%)
            <InputNumero className="input mt-1" value={f.debito} onChange={(v) => setF({ ...f, debito: v })} />
          </label>
          <label className="text-sm">
            Taxa no crédito (%)
            <InputNumero className="input mt-1" value={f.credito} onChange={(v) => setF({ ...f, credito: v })} />
          </label>
          <label className="text-sm">
            Taxa no Pix (%)
            <InputNumero className="input mt-1" value={f.pix} onChange={(v) => setF({ ...f, pix: v })} />
          </label>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setAjustando(false)}>
            Cancelar
          </button>
          <button
            className="btn-primary"
            onClick={async () => {
              const ok = await saveConfig({
                ...config,
                metaProLabore: f.meta || undefined,
                taxasCartao: { debito: f.debito, credito: f.credito, pix: f.pix },
              });
              if (ok) setAjustando(false);
            }}
          >
            Salvar
          </button>
        </div>
      </div>
    );
  }

  const linha = (rotulo: string, valor: number, menos = true) => (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-tinta-suave">{rotulo}</span>
      <span className="valor">{menos && valor > 0 ? "− " : ""}{brl(valor)}</span>
    </div>
  );

  return (
    <div className="card mb-6">
      <div className="flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 font-bold">
          <PiggyBank size={20} className="text-sinal" /> Quanto sobrou pra você este mês
        </h2>
        <button className="btn-ghost shrink-0 !py-1 text-xs" onClick={() => setAjustando(true)}>
          <Settings2 size={14} /> Ajustar
        </button>
      </div>
      <p className={`valor mt-2 text-3xl font-bold ${atual.sobra < 0 ? "text-red-700" : "text-tinta"}`}>{brl(atual.sobra)}</p>
      {(antes.faturamento > 0 || antes.despesas > 0) && (
        <p className={`mt-1 flex items-center gap-1 text-sm ${cmp.diferenca >= 0 ? "text-status-pronta" : "text-red-700"}`}>
          {cmp.diferenca >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
          <span className="valor">{brl(Math.abs(cmp.diferenca))}</span> {cmp.diferenca >= 0 ? "a mais" : "a menos"} que o mês passado
          {cmp.pct !== null && <span className="valor">({cmp.pct > 0 ? "+" : ""}{cmp.pct}%)</span>}
        </p>
      )}
      {meta && (
        <div className="mt-3">
          <div className="h-2 rounded-full bg-concreto">
            <div className="h-2 rounded-full bg-sinal" style={{ width: `${meta.pct}%` }} />
          </div>
          <p className="mt-1 text-xs text-tinta-suave">
            {meta.falta > 0 ? (
              <>
                {meta.pct}% da sua meta. Faltam <span className="valor">{brl(meta.falta)}</span>.
              </>
            ) : (
              "Meta do mês batida."
            )}
          </p>
        </div>
      )}
      <div className="mt-4 space-y-1 border-t border-dashed border-linha pt-3">
        {linha("Entrou no caixa", atual.faturamento, false)}
        {linha("Custo das peças e produtos que saíram", atual.custoMercadoria)}
        {linha("Contas e despesas pagas", atual.despesas)}
        {linha(
          Object.values(taxas).some((t) => Number(t) > 0) ? "O que a maquininha ficou" : "Maquininha (informe a taxa em Ajustar)",
          atual.taxas
        )}
      </div>
    </div>
  );
};
