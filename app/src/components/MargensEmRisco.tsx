import React, { useMemo, useState } from "react";
import { useApp } from "../store/AppStore";
import { ImpactoMargem } from "./ImpactoMargem";
import { tabelaSegura } from "../lib/tabela-precos";
import { margensEmRisco, MARGEM_ALVO_PADRAO } from "../lib/margem";

/** Relatórios: o que hoje vende abaixo da margem-alvo (lib/margem.ts). */
export const MargensEmRisco: React.FC = () => {
  const { produtos, config } = useApp();
  const alvo = config.margemAlvo ?? MARGEM_ALVO_PADRAO;
  const [todos, setTodos] = useState(false);
  const lista = useMemo(
    () => margensEmRisco(produtos, config.tabelaServicos ? tabelaSegura(config.tabelaServicos) : undefined, alvo),
    [produtos, config.tabelaServicos, alvo]
  );
  return (
    <div className="card lg:col-span-2">
      {lista.length === 0 ? (
        <p className="text-sm text-tinta-suave">
          <b className="text-tinta">Margens em risco:</b> nada abaixo de {alvo}% (produtos com custo cadastrado e serviços da tabela com peça ligada).
        </p>
      ) : (
        <>
          <ImpactoMargem
            itens={todos ? lista : lista.slice(0, 15)}
            titulo={`Margens em risco: ${lista.length} abaixo de ${alvo}%`}
            subtitulo="Do pior para o melhor. O botão põe o preço que devolve a sua margem-alvo (Configurações)."
          />
          {lista.length > 15 && (
            <button className="mt-2 text-sm underline" onClick={() => setTodos(!todos)}>
              {todos ? "Mostrar só os 15 piores" : `Mostrar todos os ${lista.length}`}
            </button>
          )}
        </>
      )}
    </div>
  );
};
