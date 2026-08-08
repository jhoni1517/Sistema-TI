import React, { useMemo, useState } from "react";
import { Truck, Search, AlertTriangle, Plus, Trash2 } from "lucide-react";
import { aviso } from "./Aviso";
import { Modal, Field, InputNumero } from "./ui";
import { useApp } from "../store/AppStore";
import { uid, nowISO, brl, txt } from "../lib/format";
import { normalizar } from "../lib/busca";
import { sessaoAberta as achaSessaoAberta } from "../lib/caixa";
import {
  totalMercadoria,
  totalDaEntrada,
  custoRateado,
  aplicarEntrada,
  problemaNaEntrada,
  avisosDeMargem,
  type ItemEntrada,
} from "../lib/entrada";
import { FORMAS_DE_COMPRA } from "../lib/pagamento";
import type { FormaPagamento, MovimentoCaixa } from "../lib/types";

/**
 * Nota do fornecedor virando estoque.
 *
 * Repor era abrir produto por produto, somar a quantidade na mão e ajustar o
 * custo de cabeça. Com trinta itens é meia hora e pelo menos um erro — e o
 * erro mais comum é o pior: esquecer de atualizar o custo. O produto fica
 * com o custo de seis meses atrás e o relatório mostra uma margem que não
 * existe.
 *
 * A conta mora em lib/entrada.ts, com teste.
 */
export const EntradaNota: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { produtos, fornecedores, sessoes, saveProduto, saveMovimento } = useApp();
  const [busca, setBusca] = useState("");
  const [itens, setItens] = useState<ItemEntrada[]>([]);
  const [frete, setFrete] = useState(0);
  const [desconto, setDesconto] = useState(0);
  const [fornecedor, setFornecedor] = useState("");
  const [nota, setNota] = useState("");
  const [forma, setForma] = useState<FormaPagamento>("dinheiro");
  const [gravando, setGravando] = useState(false);

  const sessao = useMemo(() => achaSessaoAberta(sessoes), [sessoes]);
  // useMemo aqui: "entrada" é recriado a cada render, então o cache nunca
  // valia e as dependências declaradas mentiam sobre o que ele observa.
  const entrada = useMemo(() => ({ itens, frete, desconto }), [itens, frete, desconto]);
  const problema = problemaNaEntrada(entrada, produtos);
  const avisos = useMemo(() => avisosDeMargem(entrada, produtos), [entrada, produtos]);

  const sugestoes = useMemo(() => {
    const t = normalizar(busca);
    if (!t) return [];
    return produtos
      .filter((p) => !p.servico && !itens.some((i) => i.produtoId === p.id))
      .filter(
        (p) => normalizar(p.nome).includes(t) || txt(p.codigoBarras).includes(t)
      )
      .slice(0, 6);
  }, [produtos, busca, itens]);

  const add = (produtoId: string) => {
    const p = produtos.find((x) => x.id === produtoId);
    if (!p) return;
    // O custo atual entra como sugestão: na maioria das notas ele não mudou,
    // e digitar tudo de novo é onde o erro acontece.
    setItens((v) => [
      ...v,
      { produtoId: p.id, descricao: p.nome, quantidade: 1, custoUnit: Number(p.custo) || 0 },
    ]);
    setBusca("");
  };

  const mudar = (i: number, patch: Partial<ItemEntrada>) =>
    setItens((v) => v.map((x, n) => (n === i ? { ...x, ...patch } : x)));

  const gravar = async () => {
    if (problema) return aviso.alerta(problema);
    if (gravando) return;

    const total = totalDaEntrada(entrada);
    if (
      !confirm(
        `Lançar a entrada de ${itens.length} item(ns)?\n\n` +
          `Total: ${brl(total)}\n` +
          `Pago em: ${FORMAS_DE_COMPRA.find((f) => f.k === forma)?.nome}\n\n` +
          "O estoque sobe, o custo vira a média ponderada e a compra sai do caixa."
      )
    ) {
      return;
    }

    setGravando(true);
    try {
      /*
       * O DINHEIRO PRIMEIRO, como em toda gravação do sistema.
       *
       * Estava ao contrário: o estoque subia e a compra saía do caixa depois.
       * Falhando no meio, a loja ficava com mercadoria que ninguém pagou — e
       * lucro inflado é invisível, ninguém procura por ele. Uma saída de
       * caixa sem mercadoria, ao contrário, salta aos olhos na conferência e
       * se conserta olhando o estoque.
       *
       * Compra de estoque NÃO é despesa do mês: é troca de dinheiro por
       * mercadoria, e vira custo quando a peça sai. Contar como despesa e
       * como custo mostrava prejuízo em venda lucrativa.
       */
      if (total > 0) {
        const mov: MovimentoCaixa = {
          id: uid(),
          tipo: "saida",
          categoria: "Compra de peça",
          descricao:
            `Entrada de mercadoria${fornecedor ? ` - ${fornecedor}` : ""}` +
            `${nota ? ` (nota ${nota})` : ""}`,
          valor: total,
          /*
           * A forma é ESCOLHIDA, não chutada.
           *
           * Aqui era "dinheiro" fixo. Só que quase nenhuma nota de
           * fornecedor se paga em papel: é pix, boleto ou cartão. O
           * fechamento do dia desconta da gaveta tudo que sai em espécie,
           * então cada entrada lançada errada fazia o sistema esperar MENOS
           * papel do que a gaveta tinha e acusar SOBRA — todo dia que
           * chegava mercadoria.
           *
           * E diferença que aparece sempre é diferença que a pessoa aprende
           * a ignorar, justamente para o dia em que falta dinheiro de
           * verdade. Ver `emEspecie` em lib/caixa.ts.
           */
          formaPagamento: forma,
          compraEstoque: true,
          sessaoId: sessao?.id,
          data: nowISO(),
        };
        await saveMovimento(mov);
      }

      const rateado = custoRateado(entrada);
      for (const i of itens) {
        const p = produtos.find((x) => x.id === i.produtoId);
        if (!p || Number(i.quantidade) <= 0) continue;
        await saveProduto(
          aplicarEntrada(p, i.quantidade, rateado[i.produtoId] ?? i.custoUnit)
        );
      }

      aviso.sucesso(`Entrada lançada. ${itens.length} item(ns) no estoque.`);
      onClose();
    } catch (e) {
      aviso.erro(
        "Não foi possível lançar a entrada:\n\n" + (e instanceof Error ? e.message : String(e))
      );
    } finally {
      setGravando(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Entrada de mercadoria"
      maxWidth="max-w-3xl"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" disabled={!!problema || gravando} onClick={gravar}>
            <Truck size={16} /> Lançar {totalDaEntrada(entrada) > 0 && brl(totalDaEntrada(entrada))}
          </button>
        </>
      }
    >
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <Field label="Fornecedor">
          <input
            className="input"
            list="fornecedores-entrada"
            value={fornecedor}
            onChange={(e) => setFornecedor(e.target.value)}
          />
          <datalist id="fornecedores-entrada">
            {fornecedores.map((f) => (
              <option key={f.id} value={f.nome} />
            ))}
          </datalist>
        </Field>
        <Field label="Número da nota">
          <input className="input" value={nota} onChange={(e) => setNota(e.target.value)} />
        </Field>
        <Field label="Pago em" className="sm:col-span-2">
          <div className="flex flex-wrap gap-2">
            {FORMAS_DE_COMPRA.map((f) => (
              <button
                key={f.k}
                type="button"
                onClick={() => setForma(f.k)}
                className={`chip text-sm ${
                  forma === f.k
                    ? "bg-brand-600 text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200"
                }`}
              >
                {f.nome}
              </button>
            ))}
          </div>
          {/* Só o que sai em espécie desconta da gaveta. Marcar pix como
              dinheiro faz o fechamento acusar sobra todo dia. */}
          <p className="mt-1 text-xs text-slate-400">
            Só "Dinheiro" sai da gaveta. As outras não entram na conferência do
            caixa.
          </p>
        </Field>
      </div>

      <div className="relative mb-2">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className="input pl-10"
          placeholder="Buscar produto para adicionar (nome ou código de barras)"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>
      {sugestoes.length > 0 && (
        <div className="mb-3 space-y-1">
          {sugestoes.map((p) => (
            <button
              key={p.id}
              onClick={() => add(p.id)}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <span className="truncate">{p.nome}</span>
              <span className="shrink-0 text-xs text-slate-400">
                <Plus size={12} className="mr-1 inline" />
                {p.quantidade} em estoque · custo {brl(p.custo)}
              </span>
            </button>
          ))}
        </div>
      )}

      {itens.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">
          Busque os produtos da nota acima. Só entra o que já está cadastrado.
        </p>
      ) : (
        <div className="mb-3 space-y-2">
          {itens.map((i, n) => (
            <div key={i.produtoId} className="grid grid-cols-12 items-end gap-2">
              <div className="col-span-12 sm:col-span-6">
                <p className="truncate text-sm font-medium text-slate-700">{i.descricao}</p>
              </div>
              <div className="col-span-5 sm:col-span-2">
                <label className="label">Qtd</label>
                <InputNumero
                  className="input !py-1.5 text-sm"
                  min={0}
                  value={i.quantidade}
                  onChange={(v) => mudar(n, { quantidade: v ?? 0 })}
                />
              </div>
              <div className="col-span-6 sm:col-span-3">
                <label className="label">Custo unitário</label>
                <InputNumero
                  className="input !py-1.5 text-sm"
                  value={i.custoUnit}
                  onChange={(v) => mudar(n, { custoUnit: v ?? 0 })}
                />
              </div>
              <div className="col-span-1">
                <button
                  className="btn-ghost !p-2 text-red-500"
                  onClick={() => setItens((v) => v.filter((_, x) => x !== n))}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Frete (R$)">
          <InputNumero className="input" value={frete} onChange={(v) => setFrete(v ?? 0)} />
          <p className="mt-1 text-xs text-slate-400">
            Entra no custo, rateado pelo valor de cada item. Frete fora do custo é margem
            fantasma: ele foi pago do mesmo jeito.
          </p>
        </Field>
        <Field label="Desconto do fornecedor (R$)">
          <InputNumero className="input" value={desconto} onChange={(v) => setDesconto(v ?? 0)} />
        </Field>
      </div>

      {itens.length > 0 && (
        <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
          <div className="flex justify-between">
            <span>Mercadoria</span>
            <span>{brl(totalMercadoria(entrada))}</span>
          </div>
          {frete > 0 && (
            <div className="flex justify-between">
              <span>Frete</span>
              <span>{brl(frete)}</span>
            </div>
          )}
          {desconto > 0 && (
            <div className="flex justify-between">
              <span>Desconto</span>
              <span>- {brl(desconto)}</span>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t pt-1 font-bold">
            <span>Sai do caixa</span>
            <span className="text-lg">{brl(totalDaEntrada(entrada))}</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Compra de estoque não é despesa do mês: ela vira custo quando a peça for
            vendida. Por isso não derruba o lucro do relatório.
          </p>
        </div>
      )}

      {avisos.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="flex items-center gap-2 text-sm font-bold text-amber-800">
            <AlertTriangle size={16} /> A margem apertou nestes itens
          </p>
          <p className="mb-2 text-xs text-amber-700">
            O fornecedor subiu o preço e o seu preço de venda continua o mesmo. Reveja
            antes de vender o lote inteiro apertado.
          </p>
          <div className="space-y-1">
            {avisos.map((a) => (
              <div key={a.produtoId} className="flex flex-wrap gap-2 text-xs text-amber-800">
                <b className="min-w-0 flex-1 truncate">{a.nome}</b>
                <span>
                  custo {brl(a.custoAntes)} → {brl(a.custoDepois)} · venda {brl(a.preco)} ·{" "}
                  {a.noPrejuizo ? (
                    <b>vende no prejuízo</b>
                  ) : (
                    <>margem {a.margemDepois}%</>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {problema && itens.length > 0 && (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{problema}</p>
      )}
    </Modal>
  );
};
