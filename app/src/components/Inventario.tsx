import React, { useMemo, useState } from "react";
import { ClipboardCheck, Search, AlertTriangle } from "lucide-react";
import { aviso } from "./Aviso";
import { Modal, InputNumero } from "./ui";
import { useApp } from "../store/AppStore";
import { uid, nowISO, brl, txt } from "../lib/format";
import { sessaoAberta as achaSessaoAberta } from "../lib/caixa";
import {
  conferirInventario,
  ajustesDoInventario,
  descricaoDoAjuste,
  type Contagem,
} from "../lib/inventario";
import type { MovimentoCaixa } from "../lib/types";

/**
 * Contagem de estoque.
 *
 * Todo estoque descola da realidade — quebra, furto, venda lançada errada,
 * item que saiu para amostra e não voltou. Sem contagem, o descolamento só
 * aparece quando falta mercadoria na hora da venda, e aí já é tarde.
 *
 * O campo vazio significa NÃO CONTADO, e o zero significa "não tem nenhum".
 * Sem essa diferença, abrir a contagem e salvar zeraria o estoque de tudo
 * que não foi conferido naquele dia — e isso não tem desfazer.
 */
export const Inventario: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { produtos, sessoes, saveProduto, saveMovimento } = useApp();
  const [busca, setBusca] = useState("");
  const [contagem, setContagem] = useState<Contagem>({});
  const [soDivergentes, setSoDivergentes] = useState(false);
  const [gravando, setGravando] = useState(false);

  const sessao = useMemo(() => achaSessaoAberta(sessoes), [sessoes]);
  const resumo = useMemo(() => conferirInventario(produtos, contagem), [produtos, contagem]);
  const divergentes = new Set(resumo.divergentes.map((d) => d.produtoId));

  const lista = useMemo(() => {
    const t = txt(busca).trim().toLowerCase();
    return produtos
      .filter((p) => !p.servico)
      .filter((p) =>
        !t ? true : txt(p.nome).toLowerCase().includes(t) || txt(p.codigoBarras).includes(t)
      )
      .filter((p) => (soDivergentes ? divergentes.has(p.id) : true))
      .sort((a, b) => txt(a.nome).localeCompare(txt(b.nome)))
      .slice(0, 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtos, busca, soDivergentes, contagem]);

  const gravar = async () => {
    const ajustes = ajustesDoInventario(produtos, contagem);
    if (ajustes.length === 0) return aviso.info("Nada divergente para ajustar.");
    if (gravando) return;

    if (
      !confirm(
        `Ajustar ${ajustes.length} produto(s) para a quantidade contada?\n\n` +
          `Falta: ${brl(resumo.faltando)}\nSobra: ${brl(resumo.sobrando)}\n\n` +
          "O estoque passa a valer o que você contou. Não tem desfazer."
      )
    ) {
      return;
    }

    setGravando(true);
    try {
      for (const p of ajustes) await saveProduto(p);

      // A perda entra como DESPESA, não como compra de estoque: a mercadoria
      // não vai voltar. Contar como compra esconderia o buraco dentro de um
      // número que o dono já espera ver grande.
      if (resumo.faltando > 0) {
        const mov: MovimentoCaixa = {
          id: uid(),
          tipo: "saida",
          categoria: "Perda de estoque",
          descricao: descricaoDoAjuste(resumo),
          valor: resumo.faltando,
          formaPagamento: "outro",
          compraEstoque: false,
          sessaoId: sessao?.id,
          data: nowISO(),
        };
        await saveMovimento(mov);
      }

      aviso.sucesso(
        `${ajustes.length} produto(s) ajustado(s).` +
          (resumo.faltando > 0
            ? ` ${brl(resumo.faltando)} lançados como perda no caixa.`
            : "")
      );
      onClose();
    } catch (e) {
      aviso.erro(
        "Não foi possível gravar o ajuste:\n\n" + (e instanceof Error ? e.message : String(e))
      );
    } finally {
      setGravando(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Contagem de estoque"
      maxWidth="max-w-2xl"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Fechar sem ajustar
          </button>
          <button
            className="btn-primary"
            disabled={resumo.divergentes.length === 0 || gravando}
            onClick={gravar}
          >
            <ClipboardCheck size={16} /> Ajustar {resumo.divergentes.length || ""}
          </button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            autoFocus
            className="input pl-10"
            placeholder="Buscar ou passar o leitor"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <button
          onClick={() => setSoDivergentes((v) => !v)}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
            soDivergentes ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"
          }`}
        >
          Só o que não bateu
        </button>
      </div>

      <p className="mb-3 text-xs text-slate-500">
        Campo <b>vazio</b> = ainda não contei. Campo com <b>zero</b> = contei e não tem
        nenhum. São coisas diferentes, e só a segunda ajusta o estoque.
      </p>

      {resumo.conferidos > 0 && (
        <div className="mb-3 flex flex-wrap gap-4 rounded-xl bg-slate-50 p-3 text-sm">
          <span>
            Conferidos: <b>{resumo.conferidos}</b>
          </span>
          <span>
            Faltam conferir: <b>{resumo.pendentes}</b>
          </span>
          {resumo.faltando > 0 && (
            <span className="text-red-600">
              Falta: <b>{brl(resumo.faltando)}</b>
            </span>
          )}
          {resumo.sobrando > 0 && (
            <span className="text-emerald-600">
              Sobra: <b>{brl(resumo.sobrando)}</b>
            </span>
          )}
        </div>
      )}

      <div className="max-h-[45vh] space-y-1 overflow-y-auto">
        {lista.map((p) => {
          const linha = resumo.linhas.find((l) => l.produtoId === p.id);
          const difere = !!linha && Math.abs(linha.diferenca) > 0.0001;
          return (
            <div
              key={p.id}
              className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 ${
                difere ? "border-amber-300 bg-amber-50" : "border-slate-100"
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-700">
                  {p.nome}
                </span>
                <span className="block text-xs text-slate-400">
                  sistema: {p.quantidade}
                  {p.porPeso ? " kg" : ""}
                  {difere && (
                    <b className={linha.diferenca < 0 ? "text-red-600" : "text-emerald-600"}>
                      {" "}
                      · {linha.diferenca > 0 ? "+" : ""}
                      {linha.diferenca} ({brl(linha.valor)})
                    </b>
                  )}
                </span>
              </span>
              <div className="w-28">
                <InputNumero
                  className="input !py-1.5 text-sm"
                  min={0}
                  value={contagem[p.id]}
                  onChange={(v) =>
                    setContagem((c) => {
                      const novo = { ...c };
                      // Apagar o campo tem que APAGAR a contagem, não gravar
                      // zero: são informações diferentes.
                      if (v === undefined) delete novo[p.id];
                      else novo[p.id] = v;
                      return novo;
                    })
                  }
                />
              </div>
            </div>
          );
        })}
        {lista.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-400">Nenhum produto.</p>
        )}
      </div>

      {resumo.faltando > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          Ao ajustar, os {brl(resumo.faltando)} que faltam entram como <b>despesa</b> no
          caixa (perda de estoque). A mercadoria não vai voltar, então não é compra.
        </p>
      )}
    </Modal>
  );
};
