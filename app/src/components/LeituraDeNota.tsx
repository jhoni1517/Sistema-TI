import React, { useMemo, useRef, useState } from "react";
import { Camera, Check, X, AlertTriangle } from "lucide-react";
import { aviso } from "./Aviso";
import { useIaLigada } from "./useIaLigada";
import { InputNumero } from "./ui";
import { brl } from "../lib/format";
import { prepararImagem } from "../lib/imagens";
import { perguntarIA, paraBase64, usoDoMes } from "../lib/ia";
import {
  lerRespostaDaIA,
  casarItens,
  parecenca,
  type ItemCasado,
  type NotaLida,
} from "../lib/leitura-nota";
import type { Produto } from "../lib/types";

/**
 * "Ler por foto": a nota do fornecedor lida pela IA, para REVISÃO.
 *
 * Nada aqui grava. A pessoa vê cada linha, troca o produto casado se a IA
 * errou, corrige quantidade e custo, e só então os itens vão para a entrada
 * — que ainda pede o "Lançar" de sempre. A IA erra com cara de certo, e
 * número errado no estoque é custo médio errado no mês inteiro.
 */
export const LeituraDeNota: React.FC<{
  produtos: Produto[];
  onUsar: (itens: ItemCasado[], nota: NotaLida) => void;
}> = ({ produtos, onUsar }) => {
  const arquivo = useRef<HTMLInputElement>(null);
  const [lendo, setLendo] = useState(false);
  const [nota, setNota] = useState<NotaLida | null>(null);
  const [linhas, setLinhas] = useState<ItemCasado[]>([]);
  const [uso, setUso] = useState("");
  const ligada = useIaLigada();

  const usaveis = useMemo(
    () => produtos.filter((p) => !p.servico).sort((a, b) => a.nome.localeCompare(b.nome)),
    [produtos]
  );

  const ler = async (f: File | undefined) => {
    if (!f || lendo) return;
    setLendo(true);
    try {
      // 1600px: nota tem letra miúda. Os 800px do cadastro de produto
      // deixariam o custo ilegível — e a foto crua do celular (5 MB) não
      // passa do limite do servidor.
      const jpeg = await prepararImagem(f, 1600);
      const r = await perguntarIA("ler-nota", { imagem: await paraBase64(jpeg), tipo: "image/jpeg" });
      const lida = lerRespostaDaIA(r.bruto);
      setNota(lida);
      setLinhas(casarItens(lida.itens, produtos));
      setUso(usoDoMes(r.usados, r.limite));
    } catch (e) {
      aviso.erro("Não deu para ler a nota:\n\n" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLendo(false);
      if (arquivo.current) arquivo.current.value = "";
    }
  };

  const mudar = (n: number, patch: Partial<ItemCasado>) =>
    setLinhas((v) => v.map((x, i) => (i === n ? { ...x, ...patch } : x)));

  /** As opções do seletor: as mais parecidas primeiro, depois o resto */
  const opcoesPara = (descricao: string) =>
    [...usaveis].sort((a, b) => parecenca(descricao, b.nome) - parecenca(descricao, a.nome)).slice(0, 30);

  // IA desligada: a entrada volta a ser a de sempre, por busca.
  if (!ligada) return null;

  if (!nota) {
    return (
      <div className="mb-3">
        <input
          ref={arquivo}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => ler(e.target.files?.[0])}
        />
        <button className="btn-secondary w-full" disabled={lendo} onClick={() => arquivo.current?.click()}>
          <Camera size={16} /> {lendo ? "Lendo a nota..." : "Ler por foto (DANFE, cupom ou print)"}
        </button>
      </div>
    );
  }

  const novos = linhas.filter((l) => !l.produtoId).length;

  return (
    <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50/40 p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-slate-700">
          Confira o que a IA leu{nota.fornecedor ? ` — ${nota.fornecedor}` : ""}
        </p>
        {uso && <span className="text-xs text-slate-400">{uso}</span>}
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Nada foi gravado. Troque o produto onde a IA errou e corrija quantidade e custo antes de usar.
      </p>

      {nota.avisos.length > 0 && (
        <div className="mb-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
          <p className="mb-1 flex items-center gap-1 font-bold">
            <AlertTriangle size={13} /> Confira estes pontos
          </p>
          {nota.avisos.map((a, i) => (
            <p key={i}>{a}</p>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {linhas.map((l, n) => (
          <div key={n} className="rounded-lg bg-white p-2 ring-1 ring-slate-200">
            <p className="text-xs text-slate-500">
              Na nota: <b className="text-slate-700">{l.descricao}</b>
              {l.codigo && <span className="font-mono"> · {l.codigo}</span>}
            </p>
            <div className="mt-1 grid grid-cols-12 gap-2">
              <select
                className="input col-span-12 !py-1.5 text-sm sm:col-span-6"
                value={l.produtoId}
                onChange={(e) => mudar(n, { produtoId: e.target.value, motivo: e.target.value ? "nome" : "novo" })}
              >
                <option value="">+ Produto novo: {l.descricao}</option>
                {opcoesPara(l.descricao).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
              <div className="col-span-5 sm:col-span-2">
                <InputNumero
                  className="input !py-1.5 text-sm"
                  min={0}
                  value={l.quantidade}
                  onChange={(v) => mudar(n, { quantidade: v ?? 0 })}
                />
              </div>
              <div className="col-span-5 sm:col-span-3">
                <InputNumero
                  className="input !py-1.5 text-sm"
                  value={l.custoUnitario}
                  onChange={(v) => mudar(n, { custoUnitario: v ?? 0 })}
                />
              </div>
              <button
                className="btn-ghost col-span-2 !p-2 text-red-500 sm:col-span-1"
                title="Tirar esta linha"
                onClick={() => setLinhas((v) => v.filter((_, i) => i !== n))}
              >
                <X size={15} />
              </button>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              {l.motivo === "codigo"
                ? "Casou pelo código de barras."
                : l.motivo === "nome"
                  ? "Casou pelo nome — confira."
                  : "Sem par no estoque: vira produto novo, sem preço de venda."}{" "}
              Linha: {brl(l.quantidade * l.custoUnitario)}
            </p>
          </div>
        ))}
      </div>

      {novos > 0 && (
        <p className="mt-2 text-xs text-amber-700">
          {novos} produto(s) novo(s) vão ser cadastrados ao lançar, com preço de venda zero. Defina
          o preço em Estoque antes de vender.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-primary" disabled={linhas.length === 0} onClick={() => {
            onUsar(linhas, nota);
            setNota(null);
            setLinhas([]);
          }}>
          <Check size={16} /> Usar estes {linhas.length} itens
        </button>
        <button
          className="btn-secondary"
          onClick={() => {
            setNota(null);
            setLinhas([]);
          }}
        >
          Descartar leitura
        </button>
      </div>
    </div>
  );
};
