import React, { useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Send,
  ClipboardCheck,
  PackageCheck,
  X,
  TrendingUp,
  TrendingDown,
  Minus,
  ShoppingCart,
  FileQuestion,
} from "lucide-react";
import { aviso } from "./Aviso";
import { Modal, Field, EmptyState } from "./ui";
import { useApp } from "../store/AppStore";
import { uid, nowISO, brl, formatDate, txt, abrirWhatsapp } from "../lib/format";
import {
  mensagemFornecedor,
  ultimoPreco,
  melhorPreco,
  variacao,
  totalCotacao,
  aplicarCompra,
} from "../lib/cotacao";
import {
  COTACAO_STATUS_META,
  type Cotacao,
  type ItemCotacao,
  type Produto,
} from "../lib/types";

const novaCotacao = (numero: number): Cotacao => ({
  id: uid(),
  numero,
  itens: [{ descricao: "", quantidade: 1 }],
  status: "aberta",
  criadoEm: nowISO(),
});

/** Seta de variação de preço: sobe, desce ou ficou igual */
const Variacao: React.FC<{ pct: number | null }> = ({ pct }) => {
  if (pct === null) return null;
  const arred = Math.round(pct);
  if (Math.abs(arred) < 1) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-slate-400">
        <Minus size={11} /> igual
      </span>
    );
  }
  const subiu = arred > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
        subiu ? "text-red-600" : "text-emerald-600"
      }`}
    >
      {subiu ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {subiu ? "+" : ""}
      {arred}%
    </span>
  );
};

export const Cotacoes: React.FC<{
  aberto: boolean;
  onClose: () => void;
  /** Itens já sugeridos (ex.: peças em falta que vieram do estoque) */
  sugestao?: ItemCotacao[];
}> = ({ aberto, onClose, sugestao }) => {
  const {
    cotacoes,
    precos,
    fornecedores,
    produtos,
    sessoes,
    config,
    saveCotacao,
    removeCotacao,
    savePreco,
    saveProduto,
    saveMovimento,
  } = useApp();

  const [editando, setEditando] = useState<Cotacao | null>(null);
  const [respondendo, setRespondendo] = useState<Cotacao | null>(null);
  const [comprando, setComprando] = useState<Cotacao | null>(null);
  const [escolhidos, setEscolhidos] = useState<Set<number>>(new Set());
  const [processando, setProcessando] = useState(false);

  const proximoNumero = useMemo(
    () => (cotacoes.reduce((m, c) => Math.max(m, c.numero || 0), 0) || 0) + 1,
    [cotacoes]
  );

  const lista = useMemo(
    () =>
      [...cotacoes].sort((a, b) => {
        // as que ainda esperam resposta vêm primeiro
        const peso = (c: Cotacao) => (c.status === "aberta" ? 0 : c.status === "respondida" ? 1 : 2);
        const d = peso(a) - peso(b);
        return d !== 0 ? d : (b.numero || 0) - (a.numero || 0);
      }),
    [cotacoes]
  );

  const nomeForn = (id?: string) =>
    fornecedores.find((f) => f.id === id)?.nome || "sem fornecedor";

  const abrirNova = () => {
    const c = novaCotacao(proximoNumero);
    if (sugestao && sugestao.length > 0) c.itens = sugestao.map((i) => ({ ...i }));
    setEditando(c);
  };

  const salvar = async () => {
    if (!editando) return;
    const itens = editando.itens.filter((i) => txt(i.descricao).trim());
    if (itens.length === 0) return aviso.alerta("Adicione pelo menos um item.");
    try {
      await saveCotacao({ ...editando, itens });
      setEditando(null);
      aviso.sucesso("Cotação salva.");
    } catch (e) {
      aviso.erro(
        "Não foi possível salvar a cotação.\n\n" +
          (e instanceof Error ? e.message : String(e)) +
          "\n\nSe você usa a nuvem, confira se rodou o supabase-migracao-cotacoes.sql."
      );
    }
  };

  const enviar = async (c: Cotacao) => {
    const f = fornecedores.find((x) => x.id === c.fornecedorId);
    if (!txt(f?.telefone)) {
      return aviso.alerta("Este fornecedor não tem telefone cadastrado.");
    }
    abrirWhatsapp(
      txt(f?.telefone),
      mensagemFornecedor(c, f, precos, config.nomeLoja)
    );
    if (!c.enviadoEm) await saveCotacao({ ...c, enviadoEm: nowISO() });
  };

  /**
   * Registra a resposta do fornecedor.
   * Todo preço informado entra no histórico como REFERÊNCIA (comprado =
   * false), mesmo o de item que você não vai levar. Da próxima vez que
   * cotar essa peça, o valor já aparece como base de comparação.
   */
  const salvarResposta = async () => {
    if (!respondendo) return;
    try {
      await saveCotacao({
        ...respondendo,
        status: "respondida",
        respondidoEm: nowISO(),
      });
      for (const item of respondendo.itens) {
        const preco = Number(item.precoUnit) || 0;
        if (preco <= 0) continue;
        await savePreco({
          id: uid(),
          produtoId: item.produtoId,
          descricao: txt(item.descricao).trim(),
          fornecedorId: respondendo.fornecedorId,
          preco,
          quantidade: Number(item.quantidade) || 1,
          data: nowISO(),
          comprado: false,
        });
      }
      setRespondendo(null);
      aviso.sucesso("Resposta registrada. Os valores ficam de referência para as próximas cotações.");
    } catch (e) {
      aviso.erro(e instanceof Error ? e.message : String(e));
    }
  };

  /** Abre a seleção do que foi realmente comprado */
  const abrirCompra = (c: Cotacao) => {
    const comPreco = c.itens
      .map((i, idx) => ({ i, idx }))
      .filter(({ i }) => (Number(i.precoUnit) || 0) > 0);
    if (comPreco.length === 0) {
      return aviso.alerta("Registre a resposta do fornecedor antes de comprar.");
    }
    // Começa com tudo marcado: o caso comum é levar tudo que tem em estoque
    setEscolhidos(new Set(comPreco.filter(({ i }) => i.temEstoque !== false).map(({ idx }) => idx)));
    setComprando(c);
  };

  /** Converte APENAS os itens escolhidos em estoque, histórico e saída de caixa */
  const comprar = async () => {
    const c = comprando;
    if (!c) return;
    // Trava contra duplo clique e contra comprar a mesma cotação duas vezes.
    // Sem isto, cada disparo criava um produto novo em vez de somar ao que
    // já existia — foi assim que a mesma fonte virou duas linhas de 1 un.
    if (processando) return;
    if (c.status === "comprada") {
      setComprando(null);
      return aviso.alerta("Esta cotação já foi comprada e entrou no estoque.");
    }

    const itens = c.itens.filter((i, idx) => escolhidos.has(idx) && (Number(i.precoUnit) || 0) > 0);
    if (itens.length === 0) return aviso.alerta("Escolha pelo menos um item.");

    const total = itens.reduce(
      (s2, i) => s2 + (Number(i.precoUnit) || 0) * (Number(i.quantidade) || 0),
      0
    );

    setProcessando(true);
    try {
      const chave = (nome: string) => txt(nome).trim().toLowerCase();

      /**
       * O estado de produtos só é atualizado depois que a função termina, então
       * dentro do laço "produtos" continua com a foto antiga. Este mapa guarda
       * o que já foi gravado nesta execução para que o item seguinte com o
       * mesmo nome some quantidade em vez de criar outra linha.
       */
      const gravadosAgora = new Map<string, Produto>();
      for (const p of produtos) gravadosAgora.set(chave(p.nome), p);

      for (const item of itens) {
        const k = chave(item.descricao);
        const existente =
          (item.produtoId && produtos.find((p) => p.id === item.produtoId)) ||
          gravadosAgora.get(k);

        const produto = aplicarCompra(item, existente || undefined);
        if (produto) {
          const salvo = {
            ...produto,
            id: produto.id || uid(),
            fornecedorId: c.fornecedorId,
          } as Produto;
          await saveProduto(salvo);
          gravadosAgora.set(k, salvo);
        }
        // agora sim como COMPRA: é este valor que vira "última compra"
        await savePreco({
          id: uid(),
          produtoId: existente?.id || item.produtoId,
          descricao: txt(item.descricao).trim(),
          fornecedorId: c.fornecedorId,
          preco: Number(item.precoUnit) || 0,
          quantidade: Number(item.quantidade) || 1,
          data: nowISO(),
          comprado: true,
        });
      }

      // Amarra à sessão de caixa aberta: sem isto o dinheiro sai do caixa
      // mas não aparece no fechamento do dia, e a conta nunca bate.
      const sessaoAberta = sessoes.find((s) => !s.fechadoEm);
      await saveMovimento({
        id: uid(),
        tipo: "saida",
        valor: total,
        descricao: `Compra de peças — ${nomeForn(c.fornecedorId)}`,
        categoria: "Compra de peça",
        formaPagamento: "pix",
        sessaoId: sessaoAberta?.id,
        // Reposição de estoque: sai do caixa, mas não é despesa do resultado
        compraEstoque: true,
        // Sem custoRelacionado aqui: ele existe para marcar o custo embutido
        // numa ENTRADA. Numa saída, o lucro já desconta pelo próprio valor —
        // preencher os dois faria a compra ser descontada duas vezes.
        data: nowISO(),
      });

      await saveCotacao({ ...c, status: "comprada", compradoEm: nowISO() });
      setComprando(null);
      aviso.sucesso(
        `${itens.length} item(ns) no estoque e ${brl(total)} lançado no caixa.` +
          (itens.length < c.itens.length
            ? " Os demais ficaram só como referência de preço."
            : "")
      );
    } catch (e) {
      aviso.erro(
        "Não foi possível concluir a compra.\n\n" +
          (e instanceof Error ? e.message : String(e))
      );
    } finally {
      setProcessando(false);
    }
  };

  const apagar = async (c: Cotacao) => {
    if (!confirm(`Excluir a cotação nº ${c.numero}?`)) return;
    await removeCotacao(c.id);
  };

  return (
    <>
      <Modal open={aberto} onClose={onClose} title="Cotações com fornecedores" maxWidth="max-w-3xl">
        <div className="mb-4 flex items-center justify-between gap-2">
          <p className="text-sm text-slate-500">
            Peça que faltou? Cote antes de comprar — o sistema mostra quanto você
            pagou da última vez.
          </p>
          <button className="btn-primary shrink-0" onClick={abrirNova}>
            <Plus size={16} /> Nova cotação
          </button>
        </div>

        {lista.length === 0 ? (
          <EmptyState
            icon={<FileQuestion size={44} />}
            title="Nenhuma cotação ainda"
            hint="Crie uma cotação para perguntar preço e disponibilidade ao fornecedor."
          />
        ) : (
          <div className="space-y-3">
            {lista.map((c) => {
              const meta = COTACAO_STATUS_META[c.status];
              const total = totalCotacao(c);
              return (
                <div key={c.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-400">
                      #{String(c.numero).padStart(3, "0")}
                    </span>
                    <span className={`badge ${meta.color}`}>{meta.label}</span>
                    <span className="text-sm font-semibold text-slate-700">
                      {nomeForn(c.fornecedorId)}
                    </span>
                    <span className="ml-auto text-xs text-slate-400">
                      {formatDate(c.criadoEm)}
                    </span>
                  </div>

                  <ul className="mb-2 space-y-1 text-sm">
                    {c.itens.map((i, idx) => {
                      const ref = ultimoPreco(precos, i, c.fornecedorId);
                      const pct =
                        i.precoUnit && ref ? variacao(i.precoUnit, ref.preco) : null;
                      return (
                        <li key={idx} className="flex flex-wrap items-center gap-2">
                          <span className="text-slate-700">
                            {txt(i.descricao)} · {i.quantidade} un.
                          </span>
                          {i.temEstoque === false && (
                            <span className="badge bg-red-100 text-red-700">sem estoque</span>
                          )}
                          {i.precoUnit ? (
                            <>
                              <span className="font-semibold text-slate-800">
                                {brl(i.precoUnit)}
                              </span>
                              <Variacao pct={pct} />
                            </>
                          ) : ref ? (
                            <span className="text-xs text-slate-400">
                              última compra: {brl(ref.preco)}
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>

                  {total > 0 && (
                    <p className="mb-2 text-sm font-bold text-slate-700">
                      Total: {brl(total)}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {c.status !== "comprada" && (
                      <>
                        <button className="btn-secondary !py-1.5 text-xs" onClick={() => enviar(c)}>
                          <Send size={14} /> {c.enviadoEm ? "Reenviar" : "Enviar"}
                        </button>
                        <button
                          className="btn-secondary !py-1.5 text-xs"
                          onClick={() => setRespondendo({ ...c })}
                        >
                          <ClipboardCheck size={14} /> Registrar resposta
                        </button>
                      </>
                    )}
                    {c.status === "respondida" && (
                      <button className="btn-success !py-1.5 text-xs" disabled={processando} onClick={() => abrirCompra(c)}>
                        <ShoppingCart size={14} /> Comprei
                      </button>
                    )}
                    {c.status === "comprada" && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                        <PackageCheck size={14} /> Entrou no estoque em{" "}
                        {formatDate(c.compradoEm)}
                      </span>
                    )}
                    <button
                      className="btn-ghost !p-1.5 text-red-400"
                      onClick={() => apagar(c)}
                      title="Excluir cotação"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      {/* ---------- Nova / editar cotação ---------- */}
      <Modal
        open={!!editando}
        onClose={() => setEditando(null)}
        title={`Cotação nº ${editando?.numero ?? ""}`}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setEditando(null)}>
              Cancelar
            </button>
            <button className="btn-primary" onClick={salvar}>
              Salvar cotação
            </button>
          </>
        }
      >
        {editando && (
          <div className="space-y-4">
            <Field label="Fornecedor">
              <select
                className="input"
                value={editando.fornecedorId || ""}
                onChange={(e) => setEditando({ ...editando, fornecedorId: e.target.value })}
              >
                <option value="">Selecione...</option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </Field>

            <div>
              <label className="label">Itens</label>
              <div className="space-y-2">
                {editando.itens.map((item, idx) => {
                  const ref = melhorPreco(precos, item);
                  return (
                    <div key={idx}>
                      <div className="flex gap-2">
                        <input
                          className="input flex-1"
                          list="produtos-cotacao"
                          placeholder="Peça / produto"
                          value={item.descricao}
                          onChange={(e) => {
                            const itens = [...editando.itens];
                            const achado = produtos.find(
                              (p) =>
                                txt(p.nome).toLowerCase() ===
                                e.target.value.trim().toLowerCase()
                            );
                            itens[idx] = {
                              ...item,
                              descricao: e.target.value,
                              produtoId: achado?.id,
                            };
                            setEditando({ ...editando, itens });
                          }}
                        />
                        <input
                          type="number"
                          min={1}
                          className="input !w-20"
                          value={item.quantidade}
                          onChange={(e) => {
                            const itens = [...editando.itens];
                            itens[idx] = { ...item, quantidade: +e.target.value };
                            setEditando({ ...editando, itens });
                          }}
                        />
                        <button
                          className="btn-ghost !p-2 text-red-400"
                          onClick={() =>
                            setEditando({
                              ...editando,
                              itens: editando.itens.filter((_, i) => i !== idx),
                            })
                          }
                        >
                          <X size={16} />
                        </button>
                      </div>
                      {ref && (
                        <p className="mt-1 pl-1 text-xs text-slate-400">
                          Melhor preço já pago: <b>{brl(ref.preco)}</b> em{" "}
                          {formatDate(ref.data)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              <datalist id="produtos-cotacao">
                {produtos.map((p) => (
                  <option key={p.id} value={p.nome} />
                ))}
              </datalist>
              <button
                className="btn-secondary mt-2 !py-1.5 text-xs"
                onClick={() =>
                  setEditando({
                    ...editando,
                    itens: [...editando.itens, { descricao: "", quantidade: 1 }],
                  })
                }
              >
                <Plus size={14} /> Adicionar item
              </button>
            </div>

            <Field label="Observações (opcional)">
              <textarea
                className="input"
                rows={2}
                placeholder="Ex: preciso com urgência, cliente aguardando"
                value={editando.observacoes || ""}
                onChange={(e) => setEditando({ ...editando, observacoes: e.target.value })}
              />
            </Field>
          </div>
        )}
      </Modal>

      {/* ---------- Escolher o que foi realmente comprado ---------- */}
      <Modal
        open={!!comprando}
        onClose={() => setComprando(null)}
        title="O que você comprou"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setComprando(null)}>
              Cancelar
            </button>
            <button className="btn-success" onClick={comprar} disabled={processando}>
              <ShoppingCart size={16} /> {processando ? "Gravando..." : "Confirmar compra"}
            </button>
          </>
        }
      >
        {comprando && (
          <div>
            <p className="mb-4 text-sm text-slate-500">
              Marque só o que você levou. Os itens desmarcados não entram no
              estoque nem no caixa — o preço deles fica guardado como
              referência para as próximas cotações.
            </p>

            <div className="space-y-2">
              {comprando.itens.map((item, idx) => {
                const preco = Number(item.precoUnit) || 0;
                const qtd = Number(item.quantidade) || 1;
                const marcado = escolhidos.has(idx);
                const semPreco = preco <= 0;
                return (
                  <label
                    key={idx}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                      semPreco
                        ? "cursor-not-allowed border-slate-200 opacity-50"
                        : marcado
                          ? "border-emerald-300 bg-emerald-50"
                          : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0"
                      disabled={semPreco}
                      checked={marcado}
                      onChange={(e) => {
                        const novo = new Set(escolhidos);
                        if (e.target.checked) novo.add(idx);
                        else novo.delete(idx);
                        setEscolhidos(novo);
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">
                        {txt(item.descricao)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {qtd} un.
                        {item.temEstoque === false && " · fornecedor sem estoque"}
                        {item.prazoDias ? ` · entrega em ${item.prazoDias}d` : ""}
                        {semPreco && " · sem preço informado"}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-bold text-slate-700">
                      {brl(preco * qtd)}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 p-3">
              <span className="text-sm text-slate-600">
                {escolhidos.size} de {comprando.itens.length} selecionado(s)
              </span>
              <span className="text-lg font-bold text-slate-800">
                {brl(
                  comprando.itens.reduce(
                    (s2, i, idx) =>
                      escolhidos.has(idx)
                        ? s2 + (Number(i.precoUnit) || 0) * (Number(i.quantidade) || 0)
                        : s2,
                    0
                  )
                )}
              </span>
            </div>

            <p className="mt-3 text-xs text-slate-400">
              O valor selecionado entra como saída no caixa aberto.
            </p>
          </div>
        )}
      </Modal>

      {/* ---------- Registrar resposta do fornecedor ---------- */}
      <Modal
        open={!!respondendo}
        onClose={() => setRespondendo(null)}
        title="Resposta do fornecedor"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setRespondendo(null)}>
              Cancelar
            </button>
            <button className="btn-primary" onClick={salvarResposta}>
              Salvar resposta
            </button>
          </>
        }
      >
        {respondendo && (
          <div className="space-y-4">
            {respondendo.itens.map((item, idx) => {
              const ref = ultimoPreco(precos, item, respondendo.fornecedorId);
              const pct = item.precoUnit && ref ? variacao(item.precoUnit, ref.preco) : null;
              const atualizar = (campos: Partial<ItemCotacao>) => {
                const itens = [...respondendo.itens];
                itens[idx] = { ...item, ...campos };
                setRespondendo({ ...respondendo, itens });
              };
              return (
                <div key={idx} className="rounded-xl bg-slate-50 p-3">
                  <p className="mb-2 font-semibold text-slate-700">
                    {txt(item.descricao)} · {item.quantidade} un.
                  </p>

                  <label className="mb-3 flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={item.temEstoque !== false}
                      onChange={(e) => atualizar({ temEstoque: e.target.checked })}
                    />
                    Fornecedor tem em estoque
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Valor unitário (R$)">
                      <input
                        type="number"
                        step="0.01"
                        className="input"
                        value={item.precoUnit ?? ""}
                        onChange={(e) => atualizar({ precoUnit: +e.target.value })}
                      />
                    </Field>
                    <Field label="Prazo de entrega (dias)">
                      <input
                        type="number"
                        className="input"
                        value={item.prazoDias ?? ""}
                        onChange={(e) => atualizar({ prazoDias: +e.target.value })}
                      />
                    </Field>
                  </div>

                  {ref && (
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      Última compra: <b>{brl(ref.preco)}</b> em {formatDate(ref.data)}
                      <Variacao pct={pct} />
                    </p>
                  )}
                </div>
              );
            })}
            <p className="text-right text-sm font-bold text-slate-700">
              Total: {brl(totalCotacao(respondendo))}
            </p>
          </div>
        )}
      </Modal>
    </>
  );
};
