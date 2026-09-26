import React from "react";
import { CreditCard } from "lucide-react";
import { InputNumero } from "./ui";
import type { Config } from "../lib/types";

/**
 * As taxas da maquininha, num lugar só: o "Quanto sobrou" desconta débito,
 * crédito e Pix; o simulador de parcelas usa também as do parcelado.
 */
export const TaxasMaquininha: React.FC<{ form: Config; mudar: (p: Partial<Config>) => void }> = ({ form, mudar }) => {
  const t = form.taxasCartao || {};
  const p = form.taxasParcelas || {};
  const campo = (rotulo: string, valor: number | undefined, onChange: (v: number | undefined) => void) => (
    <label key={rotulo} className="label">
      {rotulo}
      <InputNumero className="input valor !py-1.5" min={0} max={40} value={valor ?? null} onChange={onChange} placeholder="%" />
    </label>
  );
  return (
    <div>
      <h3 className="mb-1 flex items-center gap-2 font-bold text-tinta">
        <CreditCard size={16} /> Taxas da maquininha (%)
      </h3>
      <p className="mb-2 text-sm text-tinta-suave">
        Usadas no "Quanto sobrou" e no simulador de parcelas. No parcelado, preencha as que você sabe: a parcela sem taxa usa a da anterior.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {campo("Débito", t.debito, (v) => mudar({ taxasCartao: { ...t, debito: v } }))}
        {campo("Crédito à vista", t.credito, (v) => mudar({ taxasCartao: { ...t, credito: v } }))}
        {campo("Pix", t.pix, (v) => mudar({ taxasCartao: { ...t, pix: v } }))}
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
        {Array.from({ length: 11 }, (_, i) => i + 2).map((n) =>
          campo(`${n}x`, p[String(n)], (v) => {
            const novo = { ...p };
            if (v === undefined) delete novo[String(n)];
            else novo[String(n)] = v;
            mudar({ taxasParcelas: novo });
          })
        )}
      </div>
    </div>
  );
};
