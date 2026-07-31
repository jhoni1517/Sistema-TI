import React, { useMemo, useState } from "react";
import { Undo2, Search, AlertTriangle } from "lucide-react";
import { aviso } from "./Aviso";
import { Modal, Field, InputNumero } from "./ui";
import { useApp } from "../store/AppStore";
import { aposRetorno } from "../lib/estoque";
import { uid, nowISO, brl, formatDateTime } from "../lib/format";
import { sessaoAberta as achaSessaoAberta } from "../lib/caixa";
import {
  calcularDevolucao,
  problemaNaDevolucao,
  disponivelParaDevolver,
  podeDevolver,
  descricaoDaDevolucao,
  type Devolvidos,
} from "../lib/devolucao";
import type { MovimentoCaixa, Venda } from "../lib/types";

/**
 * Devolução e troca de mercadoria.
 *
 * Antes não existia caminho: quem devolvia obrigava o atendente a lançar uma
 * sangria "devolução" na mão e a corrigir o estoque por fora. Duas chances de
 * errar, e o cupom original continuava dizendo que a venda inteira aconteceu.
 *
 * A conta mora em lib/devolucao.ts, com teste. Aqui só tem tela e a ordem das
 * gravações.
 */
export const Devolucao: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { vendas, produtos, sessoes, saveVenda, saveMovimento, saveProduto } = useApp();
  const [busca, setBusca] = useState("");
  const [venda, setVenda] = useState<Venda | null>(null);
  const [escolha, setEscolha] = useState<Devolvidos>({});
  const [motivo, setMotivo] = useState("");
  const [gravando, setGravando] = useState(false);

  const sessao = useMemo(() => achaSessaoAberta(sessoes), [sessoes]);

  /** As últimas vendas que ainda têm o que devolver */
  const candidatas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return [...vendas]
      .filter(podeDevolver)
      .filter((v) =>
        !t
          ? true
          : String(v.numero) === t ||
            (v.itens || []).some((i) => (i.descricao || "").toLowerCase().includes(t))
      )
      .sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || ""))
      .slice(0, 12);
  }, [vendas, busca]);

  const disponivel = venda ? disponivelParaDevolver(venda) : [];
  const resumo = venda ? calcularDevolucao(venda, escolha) : null;
  const problema = venda ? problemaNaDevolucao(venda, escolha) : "";

  const escolherTudo = () => {
    if (!venda) return;
    const tudo: Devolvidos = {};
    disponivel.forEach((q, i) => {
      if (q > 0) tudo[i] = q;
    });
    setEscolha(tudo);
  };

  const confirmar = async () => {
    if (!venda || !resumo || gravando) return;
    if (problema) return aviso.alerta(problema);
    if (
      !confirm(
        `Devolver ${brl(resumo.valor)} ao cliente?\n\n` +
          "O dinheiro sai do caixa e a mercadoria volta ao estoque."
      )
    ) {
      return;
    }

    setGravando(true);
    try {
      // O dinheiro SAI primeiro, como na venda: se algo falhar depois, sobra
      // lançamento sem baixa — que se conserta olhando o estoque. O
      // contrário some com a devolução e ninguém percebe.
      const movimento: MovimentoCaixa = {
        id: uid(),
        tipo: "saida",
        categoria: "Devolução",
        descricao: descricaoDaDevolucao(venda, resumo) + (motivo ? ` - ${motivo}` : ""),
        valor: resumo.valor,
        formaPagamento: venda.formaPagamento,
        sessaoId: sessao?.id,
        // Estorna o custo da venda desfeita: sem isso o CMV do mês continua
        // contando mercadoria que voltou para a prateleira.
        custoRelacionado: -resumo.custo,
        data: nowISO(),
      };
      await saveMovimento(movimento);

      await saveVenda({
        ...venda,
        devolucoes: [
          ...(venda.devolucoes || []),
          {
            id: uid(),
            data: nowISO(),
            itens: escolha,
            valor: resumo.valor,
            motivo: motivo.trim() || undefined,
            movimentoId: movimento.id,
          },
        ],
      });

      // Mercadoria de volta à prateleira. Item avulso não tem produto para
      // repor, e isso é normal: ele nunca saiu do estoque.
      const semVolta: string[] = [];
      for (const item of resumo.itens) {
        const prod = produtos.find((p) => p.id === item.produtoId);
        if (!prod) {
          if (item.descricao) semVolta.push(item.descricao);
          continue;
        }
        if (prod.servico) continue;
        await saveProduto({
          ...prod,
          quantidade: aposRetorno(prod, item.quantidade),
        });
      }

      if (semVolta.length > 0) {
        aviso.alerta(
          `Devolução registrada. Estes itens não voltaram ao estoque porque não estão ` +
            `cadastrados: ${semVolta.join(", ")}.`
        );
      } else {
        aviso.sucesso(`Devolução de ${brl(resumo.valor)} registrada.`);
      }
      onClose();
    } catch (e) {
      aviso.erro(
        "Não foi possível registrar a devolução:\n\n" +
          (e instanceof Error ? e.message : String(e))
      );
    } finally {
      setGravando(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Devolução de mercadoria"
      maxWidth="max-w-2xl"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn-primary"
            disabled={!venda || !!problema || gravando}
            onClick={confirmar}
          >
            <Undo2 size={16} />
            {resumo && resumo.valor > 0 ? `Devolver ${brl(resumo.valor)}` : "Devolver"}
          </button>
        </>
      }
    >
      {!venda ? (
        <div>
          <div className="relative mb-3">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              className="input pl-10"
              placeholder="Número da venda ou nome do produto"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          {candidatas.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              Nenhuma venda com item disponível para devolver.
            </p>
          ) : (
            <div className="space-y-1">
              {candidatas.map((v) => (
                <button
                  key={v.id}
                  onClick={() => {
                    setVenda(v);
                    setEscolha({});
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left hover:bg-slate-50"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-800">
                      Venda {v.numero}
                      {(v.devolucoes || []).length > 0 && (
                        <span className="badge ml-2 bg-amber-100 text-amber-700">
                          devolução parcial
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-slate-400">
                      {formatDateTime(v.criadoEm)} ·{" "}
                      {(v.itens || []).map((i) => i.descricao).join(", ")}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-bold text-slate-800">
              Venda {venda.numero}{" "}
              <span className="text-sm font-normal text-slate-400">
                {formatDateTime(venda.criadoEm)}
              </span>
            </p>
            <button className="btn-ghost !py-1 text-xs" onClick={() => setVenda(null)}>
              Trocar venda
            </button>
          </div>

          <div className="space-y-2">
            {(venda.itens || []).map((item, i) => (
              <div
                key={i}
                className={`flex flex-wrap items-center gap-3 rounded-lg border p-2.5 ${
                  disponivel[i] > 0 ? "border-slate-200" : "border-slate-100 bg-slate-50"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-700">
                    {item.descricao}
                  </span>
                  <span className="block text-xs text-slate-400">
                    {brl(item.precoUnit)}
                    {item.porPeso ? "/kg" : ""} · vendido {item.quantidade}
                    {disponivel[i] < item.quantidade && ` · resta ${disponivel[i]}`}
                  </span>
                </span>
                {disponivel[i] > 0 ? (
                  <div className="w-28">
                    <InputNumero
                      className="input !py-1.5 text-sm"
                      min={0}
                      max={disponivel[i]}
                      value={escolha[i] ?? 0}
                      onChange={(v) => setEscolha((e) => ({ ...e, [i]: v ?? 0 }))}
                    />
                  </div>
                ) : (
                  <span className="badge bg-slate-200 text-slate-500">já devolvido</span>
                )}
              </div>
            ))}
          </div>

          <button className="btn-secondary !py-1.5 text-xs" onClick={escolherTudo}>
            Devolver tudo o que resta
          </button>

          <Field label="Motivo (sai no lançamento do caixa)">
            <input
              className="input"
              placeholder="Produto com defeito, tamanho errado, desistiu..."
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </Field>

          {resumo && resumo.valor > 0 && (
            <div className="rounded-xl bg-slate-50 p-3 text-sm">
              <div className="flex justify-between">
                <span>A devolver ao cliente</span>
                <b className="text-lg text-slate-800">{brl(resumo.valor)}</b>
              </div>
              {Number(venda.desconto) > 0 && (
                // O desconto volta na proporção. Sem dizer isso, o cliente
                // conta os itens, chega noutro número e a conversa azeda.
                <p className="mt-1 text-xs text-slate-500">
                  O desconto de {brl(venda.desconto)} da venda entra na proporção do que
                  está voltando.
                </p>
              )}
            </div>
          )}

          {problema && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              {problema}
            </p>
          )}

          {!sessao && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              Nenhum caixa aberto. A saída é registrada assim mesmo, mas fica fora do
              fechamento do dia.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
};
