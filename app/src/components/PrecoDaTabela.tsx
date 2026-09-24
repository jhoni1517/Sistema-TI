import React, { useMemo } from "react";
import { Tags, Plus } from "lucide-react";
import { useApp } from "../store/AppStore";
import { brl } from "../lib/format";
import { sugestaoParaOS, tabelaSegura } from "../lib/tabela-precos";
import type { OrdemServico, PecaOS } from "../lib/types";

/**
 * O preço da Tabela de serviços para o aparelho da OS.
 *
 * Só sugere: nada entra na OS sem o atendente tocar em "Usar". O serviço
 * que o defeito menciona ("tela trincou") vem primeiro e destacado.
 */
export const PrecoDaTabela: React.FC<{ os: OrdemServico; onUsar: (p: PecaOS) => void }> = ({ os, onUsar }) => {
  const { config } = useApp();
  const sug = useMemo(
    () => (config.tabelaServicos ? sugestaoParaOS(tabelaSegura(config.tabelaServicos), os) : null),
    [config.tabelaServicos, os]
  );
  if (!sug) return null;
  const nome = [sug.modelo.marca, sug.modelo.modelo].filter(Boolean).join(" ");
  const jaTem = new Set((os.pecas || []).map((p) => p.descricao));
  return (
    <div className="rounded-md border border-linha bg-papel p-3">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-tinta">
        <Tags size={15} /> Tabela de serviços: {nome}
      </p>
      <div className="flex flex-wrap gap-2">
        {sug.itens.map(({ servico, preco, combina }) => {
          const descricao = `${servico.nome} - ${nome}`;
          const usado = jaTem.has(descricao);
          return (
            <button
              key={servico.id}
              type="button"
              disabled={usado}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm ${
                combina ? "border-sinal bg-sinal/10 font-semibold" : "border-linha bg-cartao"
              } disabled:opacity-50`}
              onClick={() => onUsar({ descricao, quantidade: 1, custoUnit: 0, precoUnit: preco })}
            >
              {!usado && <Plus size={14} />}
              {servico.nome} <span className="valor">{brl(preco)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
