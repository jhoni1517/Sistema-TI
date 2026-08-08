import React, { useMemo, useState } from "react";
import { aviso } from "../components/Aviso";
import { Plus, Trash2, Utensils, Receipt, Clock, Pizza, X } from "lucide-react";
import { useApp } from "../store/AppStore";
import { Modal, Field, EmptyState, SectionTitle, InputNumero } from "../components/ui";
import { MontarPizza } from "../components/MontarPizza";
import { uid, nowISO, brl, txt, formatDateTime } from "../lib/format";
import { temRecurso } from "../lib/ramos";
import { produtosParaOS } from "../lib/busca";
import { precoEfetivo } from "../lib/promocao";
import { saldosApos } from "../lib/estoque";
import { proximoNumero, problemaParaNumerar } from "../lib/numeracao";
import { custoVenda } from "../lib/pdv";
import {
  totalComanda,
  quantosItens,
  problemaParaFechar,
  cancelarItem,
  comandasAbertas,
  comandaDaMesa,
  minutosEsperando,
  subtotalDoItem,
  preparoDe,
  PREPARO_META,
} from "../lib/comanda";
import type {
  Comanda,
  ItemComanda,
  ItemVenda,
  MovimentoCaixa,
  Produto,
  Venda,
  FormaPagamento,
} from "../lib/types";

const FORMAS: { k: FormaPagamento; nome: string }[] = [
  { k: "dinheiro", nome: "Dinheiro" },
  { k: "pix", nome: "Pix" },
  { k: "debito", nome: "Débito" },
  { k: "credito", nome: "Crédito" },
];

/**
 * Comanda de mesa.
 *
 * A conta que fica aberta enquanto a mesa come. Nada entra no caixa
 * enquanto ela está aberta: fechar é que gera a venda e o movimento, e ali
 * vale a regra de sempre — dinheiro primeiro, estoque depois.
 *
 * A tela é feita para o garçom em pé, com o celular numa mão: cartão grande
 * por mesa, e dentro dela a busca de produto no topo, que é o que ele mais
 * usa.
 */
export const Mesas: React.FC = () => {
  const {
    comandas,
    produtos,
    vendas,
    config,
    ramo,
    sessoes,
    fontesComFalha,
    saveComanda,
    saveVenda,
    saveMovimento,
    saveProduto,
  } = useApp();

  const [aberta, setAberta] = useState<Comanda | null>(null);
  const [novaMesa, setNovaMesa] = useState("");
  const [abrindo, setAbrindo] = useState(false);
  const [fechando, setFechando] = useState<Comanda | null>(null);
  const [gravando, setGravando] = useState(false);

  const lista = useMemo(() => comandasAbertas(comandas), [comandas]);
  const usaMeioAMeio = temRecurso(ramo, "meioAMeio");

  /** A comanda que está na tela, sempre na versão mais nova do estado */
  const atual = aberta ? comandas.find((c) => c.id === aberta.id) || aberta : null;

  const abrirMesa = async () => {
    const mesa = novaMesa.trim();
    if (!mesa) return aviso.alerta("Diga qual é a mesa.");

    // Duas comandas na mesma mesa é o jeito mais fácil de a conta sair pela
    // metade: o garçom lança na que achou primeiro.
    const jaTem = comandaDaMesa(comandas, mesa);
    if (jaTem) {
      setAbrindo(false);
      setNovaMesa("");
      setAberta(jaTem);
      return aviso.info(`A mesa ${jaTem.mesa} já tem uma comanda aberta. Abri ela para você.`);
    }

    // Numerar em cima de uma lista que não carregou repete número.
    const problema = problemaParaNumerar(fontesComFalha, "comandas", "uma comanda");
    if (problema) return aviso.erro(problema);

    const nova: Comanda = {
      id: uid(),
      numero: proximoNumero(comandas),
      mesa,
      itens: [],
      status: "aberta",
      abertaEm: nowISO(),
      atualizadoEm: nowISO(),
    };
    try {
      await saveComanda(nova);
      setAbrindo(false);
      setNovaMesa("");
      setAberta(nova);
    } catch (e) {
      aviso.erro("Não foi possível abrir a comanda:\n\n" + msg(e));
    }
  };

  const gravar = async (c: Comanda) => {
    try {
      await saveComanda({ ...c, atualizadoEm: nowISO() });
    } catch (e) {
      // A janela fechava como se tivesse dado certo e o pedido não chegava
      // na cozinha.
      aviso.erro("Não foi possível gravar a comanda:\n\n" + msg(e));
    }
  };

  const addProduto = (p: Produto) => {
    if (!atual) return;
    const item: ItemComanda = {
      id: uid(),
      produtoId: p.id,
      descricao: p.nome,
      quantidade: 1,
      precoUnit: precoEfetivo(p),
      custoUnit: Number(p.custo) || 0,
      pedidoEm: nowISO(),
      preparo: "pendente",
    };
    gravar({ ...atual, itens: [...(atual.itens || []), item] });
  };

  const mudarItem = (id: string, patch: Partial<ItemComanda>) => {
    if (!atual) return;
    gravar({
      ...atual,
      itens: (atual.itens || []).map((i) => (i.id === id ? { ...i, ...patch } : i)),
    });
  };

  const cancelar = (id: string) => {
    if (!atual) return;
    const item = (atual.itens || []).find((i) => i.id === id);
    const jaSaiu = item && preparoDe(item.preparo) !== "pendente";
    if (
      !confirm(
        jaSaiu
          ? `Cancelar "${item?.descricao}"?\n\nA cozinha já começou este item. Avise lá antes.`
          : `Cancelar "${item?.descricao}"?`
      )
    ) {
      return;
    }
    gravar(cancelarItem(atual, id));
  };

  /**
   * Fecha a comanda: vira venda, vira dinheiro no caixa, baixa o estoque.
   *
   * A ordem é a de sempre — dinheiro primeiro. Falhando no meio sobra
   * lançamento sem baixa, que se conserta olhando o estoque; ao contrário
   * some a venda e ninguém procura por lucro inflado.
   */
  const fecharComanda = async (c: Comanda, forma: FormaPagamento) => {
    const problema = problemaParaFechar(c);
    if (problema) return aviso.alerta(problema);
    if (gravando) return;

    const problemaNum = problemaParaNumerar(fontesComFalha, "vendas", "uma venda");
    if (problemaNum) return aviso.erro(problemaNum);

    setGravando(true);
    const itens: ItemVenda[] = (c.itens || [])
      .filter((i) => !i.cancelado)
      .map(({ id: _id, preparo: _p, pedidoEm: _pe, prontoEm: _pr, ...resto }) => resto);
    const total = totalComanda(c);
    const sessao = sessoes.find((s) => !s.fechadoEm) || null;

    const venda: Venda = {
      id: uid(),
      numero: proximoNumero(vendas),
      itens,
      desconto: 0,
      formaPagamento: forma,
      clienteId: c.clienteId,
      sessaoId: sessao?.id,
      criadoEm: nowISO(),
    } as Venda;

    try {
      const movimento: MovimentoCaixa = {
        id: uid(),
        tipo: "entrada",
        categoria: "Venda",
        descricao: `Mesa ${c.mesa} - comanda ${c.numero} (${itens.length} item(ns))`,
        valor: total,
        formaPagamento: forma,
        clienteId: c.clienteId,
        custoRelacionado: custoVenda(itens),
        data: nowISO(),
        sessaoId: sessao?.id,
      } as MovimentoCaixa;

      await saveMovimento(movimento);
      await saveVenda({ ...venda, movimentoId: movimento.id });

      for (const { produto, quantidade } of saldosApos(itens, produtos)) {
        await saveProduto({ ...produto, quantidade });
      }

      await saveComanda({
        ...c,
        status: "fechada",
        fechadaEm: nowISO(),
        vendaId: venda.id,
        atualizadoEm: nowISO(),
      });

      setFechando(null);
      setAberta(null);
      aviso.sucesso(`Mesa ${c.mesa} fechada: ${brl(total)}.`);
    } catch (e) {
      aviso.erro("Não foi possível fechar a comanda:\n\n" + msg(e));
    } finally {
      setGravando(false);
    }
  };

  return (
    <div>
      <SectionTitle
        title="Comandas"
        subtitle="A conta que fica aberta enquanto a mesa come"
        action={
          <button className="btn-primary" onClick={() => setAbrindo(true)}>
            <Plus size={18} /> Abrir mesa
          </button>
        }
      />

      {lista.length === 0 ? (
        <EmptyState
          icon={<Utensils size={48} />}
          title="Nenhuma mesa aberta"
          hint="Abra uma mesa para começar a lançar os pedidos."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((c) => {
            const naCozinha = (c.itens || []).filter(
              (i) => !i.cancelado && ["pendente", "preparando"].includes(preparoDe(i.preparo))
            ).length;
            return (
              <button
                key={c.id}
                onClick={() => setAberta(c)}
                className="card toca text-left"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-lg font-bold text-slate-800">Mesa {c.mesa}</span>
                  <span className="text-lg font-bold text-brand-600">{brl(totalComanda(c))}</span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Comanda {c.numero} · aberta {formatDateTime(c.abertaEm)}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="badge bg-slate-100 text-slate-600">
                    {quantosItens(c)} item(ns)
                  </span>
                  {naCozinha > 0 && (
                    <span className="badge bg-amber-100 text-amber-700">
                      <Clock size={11} /> {naCozinha} na cozinha
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Abrir mesa */}
      {abrindo && (
        <Modal
          open
          onClose={() => setAbrindo(false)}
          title="Abrir mesa"
          maxWidth="max-w-sm"
          footer={
            <>
              <button className="btn-secondary" onClick={() => setAbrindo(false)}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={abrirMesa}>
                Abrir
              </button>
            </>
          }
        >
          <Field label="Mesa">
            <input
              autoFocus
              className="input"
              placeholder="5, Balcão, Viagem..."
              value={novaMesa}
              onChange={(e) => setNovaMesa(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && abrirMesa()}
            />
            {/* Texto livre de propósito: restaurante de bairro não tem mesa
                numerada em cadastro, e um cadastro de mesas seria mais uma
                tela que ninguém preenche. */}
            <p className="mt-1 text-xs text-slate-400">
              Pode ser número, "Balcão" ou "Viagem".
            </p>
          </Field>
        </Modal>
      )}

      {atual && (
        <ComandaAberta
          comanda={atual}
          produtos={produtos}
          usaMeioAMeio={usaMeioAMeio}
          regraMeioAMeio={config.regraMeioAMeio}
          onFechar={() => setAberta(null)}
          onAddProduto={addProduto}
          onAddItem={(item) => gravar({ ...atual, itens: [...(atual.itens || []), item] })}
          onMudarItem={mudarItem}
          onCancelarItem={cancelar}
          onPedirConta={() => setFechando(atual)}
        />
      )}

      {fechando && (
        <FecharComanda
          comanda={fechando}
          gravando={gravando}
          onClose={() => setFechando(null)}
          onConfirmar={(forma) => fecharComanda(fechando, forma)}
        />
      )}
    </div>
  );
};

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/* ------------------------------------------------------------------ */
/* A comanda aberta                                                    */
/* ------------------------------------------------------------------ */

const ComandaAberta: React.FC<{
  comanda: Comanda;
  produtos: Produto[];
  usaMeioAMeio: boolean;
  regraMeioAMeio?: string;
  onFechar: () => void;
  onAddProduto: (p: Produto) => void;
  onAddItem: (i: ItemComanda) => void;
  onMudarItem: (id: string, patch: Partial<ItemComanda>) => void;
  onCancelarItem: (id: string) => void;
  onPedirConta: () => void;
}> = ({
  comanda,
  produtos,
  usaMeioAMeio,
  regraMeioAMeio,
  onFechar,
  onAddProduto,
  onAddItem,
  onMudarItem,
  onCancelarItem,
  onPedirConta,
}) => {
  const [termo, setTermo] = useState("");
  const [montandoPizza, setMontandoPizza] = useState(false);
  const sugestoes = useMemo(() => produtosParaOS(produtos, termo, 6), [produtos, termo]);
  const total = totalComanda(comanda);

  return (
    <Modal
      open
      onClose={onFechar}
      title={`Mesa ${comanda.mesa}`}
      maxWidth="max-w-2xl"
      footer={
        <>
          <button className="btn-secondary" onClick={onFechar}>
            Voltar
          </button>
          <button className="btn-primary" onClick={onPedirConta}>
            <Receipt size={16} /> Fechar conta · {brl(total)}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* A busca fica no topo: é o que o garçom mais usa, em pé, com o
            celular numa mão. */}
        <Field label="Lançar pedido">
          <input
            autoFocus
            className="input"
            placeholder="Buscar no cardápio..."
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
          />
        </Field>

        {termo.trim() && (
          <div className="space-y-1">
            {sugestoes.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  onAddProduto(p);
                  setTermo("");
                }}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">
                  {txt(p.nome)}
                </span>
                <span className="shrink-0 text-sm font-bold text-slate-800">
                  {brl(precoEfetivo(p))}
                </span>
              </button>
            ))}
            {sugestoes.length === 0 && (
              <p className="py-4 text-center text-sm text-slate-400">
                Nada encontrado com esse nome.
              </p>
            )}
          </div>
        )}

        {usaMeioAMeio && (
          <button className="btn-secondary w-full" onClick={() => setMontandoPizza(true)}>
            <Pizza size={16} /> Montar pizza de mais de um sabor
          </button>
        )}

        {(comanda.itens || []).length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            Nenhum pedido lançado ainda.
          </p>
        ) : (
          <div className="space-y-2">
            {(comanda.itens || []).map((i) => {
              const p = preparoDe(i.preparo);
              return (
                <div
                  key={i.id}
                  className={`rounded-lg border p-3 ${
                    i.cancelado ? "border-slate-200 bg-slate-50 opacity-60" : "border-slate-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate font-semibold text-slate-800 ${i.cancelado ? "line-through" : ""}`}
                      >
                        {i.descricao}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {i.cancelado ? (
                          <span className="badge bg-red-100 text-red-700">Cancelado</span>
                        ) : (
                          <>
                            <span className={`badge ${PREPARO_META[p].cor}`}>
                              {PREPARO_META[p].label}
                            </span>
                            {(p === "pendente" || p === "preparando") && (
                              <span className="text-xs text-slate-400">
                                {minutosEsperando(i)} min
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 font-bold text-slate-800">
                      {brl(subtotalDoItem(i))}
                    </span>
                  </div>

                  {!i.cancelado && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <InputNumero
                        className="input !w-20 !py-1.5 text-sm"
                        min={1}
                        value={i.quantidade}
                        onChange={(v) => onMudarItem(i.id, { quantidade: v ?? 1 })}
                      />
                      <input
                        className="input !py-1.5 flex-1 text-sm"
                        placeholder="Sem cebola, bem passado..."
                        value={i.observacao || ""}
                        onChange={(e) => onMudarItem(i.id, { observacao: e.target.value })}
                      />
                      <button
                        className="btn-ghost !p-2 text-red-500"
                        title="Cancelar item"
                        onClick={() => onCancelarItem(i.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {montandoPizza && (
        <MontarPizza
          produtos={produtos}
          regra={regraMeioAMeio}
          onFechar={() => setMontandoPizza(false)}
          onMontou={(item) => {
            onAddItem({
              ...item,
              id: uid(),
              pedidoEm: nowISO(),
              preparo: "pendente",
            } as ItemComanda);
            setMontandoPizza(false);
          }}
        />
      )}
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Fechar a conta                                                      */
/* ------------------------------------------------------------------ */

const FecharComanda: React.FC<{
  comanda: Comanda;
  gravando: boolean;
  onClose: () => void;
  onConfirmar: (forma: FormaPagamento) => void;
}> = ({ comanda, gravando, onClose, onConfirmar }) => {
  const [forma, setForma] = useState<FormaPagamento>("dinheiro");
  const total = totalComanda(comanda);
  const naCozinha = (comanda.itens || []).filter(
    (i) => !i.cancelado && ["pendente", "preparando"].includes(preparoDe(i.preparo))
  ).length;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Fechar mesa ${comanda.mesa}`}
      maxWidth="max-w-sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Voltar
          </button>
          <button
            className="btn-success"
            disabled={gravando}
            onClick={() => onConfirmar(forma)}
          >
            {gravando ? "Fechando..." : `Receber ${brl(total)}`}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-emerald-50 p-4 text-center">
          <p className="text-sm text-emerald-700">Total da mesa</p>
          <p className="text-3xl font-bold text-emerald-700">{brl(total)}</p>
          <p className="mt-1 text-xs text-emerald-700/80">
            {quantosItens(comanda)} item(ns)
          </p>
        </div>

        {/* Avisa, mas não trava: a pessoa pede a conta e vai embora enquanto
            a sobremesa sai. Travar o caixa por isso o prenderia numa fila
            que não é dele. */}
        {naCozinha > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <X size={14} className="mr-1 inline" />
            {naCozinha} item(ns) ainda na cozinha. Dá para fechar, mas confira
            se tudo já foi entregue.
          </div>
        )}

        <Field label="Forma de pagamento">
          <div className="grid grid-cols-2 gap-2">
            {FORMAS.map((f) => (
              <button
                key={f.k}
                onClick={() => setForma(f.k)}
                className={`chip justify-center text-sm ${
                  forma === f.k
                    ? "bg-brand-600 text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200"
                }`}
              >
                {f.nome}
              </button>
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  );
};
