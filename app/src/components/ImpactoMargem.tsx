import React, { useState } from "react";
import { TrendingDown, Check } from "lucide-react";
import { useApp } from "../store/AppStore";
import { aviso } from "./Aviso";
import { brl } from "../lib/format";
import { definirPreco, tabelaSegura } from "../lib/tabela-precos";
import { textoDoAlerta, type ItemMargem } from "../lib/margem";

/**
 * Lista de margens apertadas com o botão que devolve a margem-alvo.
 * Serve à entrada de nota (o custo acabou de subir) e ao painel "Margens
 * em risco" (o que está apertado hoje). Conta em lib/margem.ts.
 */
export const ImpactoMargem: React.FC<{ itens: ItemMargem[]; titulo: string; subtitulo?: string; comTexto?: boolean }> = ({
  itens,
  titulo,
  subtitulo,
  comTexto,
}) => {
  const { produtos, config, saveProduto, saveConfig } = useApp();
  const [feitos, setFeitos] = useState<string[]>([]);
  const [gravando, setGravando] = useState("");
  if (!itens.length) return null;

  const chave = (i: ItemMargem) => `${i.tipo}|${i.produtoId}|${i.modeloId || ""}|${i.servicoId || ""}`;

  const ajustar = async (i: ItemMargem) => {
    if (gravando) return;
    setGravando(chave(i));
    try {
      if (i.tipo === "produto") {
        // O produto de AGORA: a entrada pode ter acabado de mudar quantidade e custo.
        const p = produtos.find((x) => x.id === i.produtoId);
        if (!p) throw new Error("Produto não encontrado.");
        await saveProduto({ ...p, preco: i.sugerido }); // preco-cru-proposital: é o cadastro do preço
      } else {
        const ok = await saveConfig({
          ...config,
          tabelaServicos: definirPreco(tabelaSegura(config.tabelaServicos), i.modeloId || "", i.servicoId || "", i.sugerido),
        });
        if (!ok) return;
      }
      setFeitos((f) => [...f, chave(i)]);
      aviso.sucesso(`${i.nome}: agora ${brl(i.sugerido)}.`);
    } catch (e) {
      aviso.erro("Não ajustou: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setGravando("");
    }
  };

  const pct = (v: number | null) => (v === null ? "—" : `${String(v).replace(".", ",")}%`);

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
      <p className="flex items-center gap-2 text-sm font-bold">
        <TrendingDown size={16} /> {titulo}
      </p>
      {subtitulo && <p className="mb-2 text-xs">{subtitulo}</p>}
      <div className="divide-y divide-amber-200">
        {itens.map((i) => {
          const k = chave(i);
          const feito = feitos.includes(k);
          return (
            <div key={k} className="flex flex-col gap-2 py-2 text-sm sm:flex-row sm:items-center">
              <div className="min-w-0 sm:flex-1">
                <p className="font-semibold">{i.nome}</p>
                <p className="valor text-xs">
                  {comTexto
                    ? textoDoAlerta(i)
                    : `venda ${brl(i.preco)} · custo ${brl(i.custoDepois)} · margem ${pct(i.margemDepois)}`}
                </p>
              </div>
              <button className="btn-secondary self-start !py-1.5 text-xs sm:self-auto" disabled={feito || !!gravando} onClick={() => ajustar(i)}>
                {feito ? (
                  <>
                    <Check size={14} /> Ajustado
                  </>
                ) : (
                  `Ajustar para ${brl(i.sugerido)}`
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
