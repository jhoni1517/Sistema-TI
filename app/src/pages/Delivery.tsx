import React, { useEffect, useMemo, useRef, useState } from "react";
import { aviso } from "../components/Aviso";
import { Plus, Trash2, Bike, Receipt, Pizza, MapPin, Phone, X } from "lucide-react";
import { useApp } from "../store/AppStore";
import { Modal, Field, EmptyState, SectionTitle, InputNumero } from "../components/ui";
import { MontarPizza } from "../components/MontarPizza";
import { uid, nowISO, brl, txt, abrirWhatsapp } from "../lib/format";
import { temRecurso } from "../lib/ramos";
import { produtosParaOS } from "../lib/busca";
import { precoEfetivo } from "../lib/promocao";
import { saldosApos } from "../lib/estoque";
import { proximoNumero, problemaParaNumerar } from "../lib/numeracao";
import { custoVenda } from "../lib/pdv";
import { sessaoAberta as achaSessaoAberta } from "../lib/caixa";
import { consolidar, formaPrincipal, FORMAS_META } from "../lib/pagamento";
import {
  itensAtivos,
  cancelarItem,
  subtotalDoItem,
  preparoDe,
  PREPARO_META,
  problemaNasLinhasDaComanda,
} from "../lib/comanda";
import {
  entregasAbertas,
  situacaoEntrega,
  minutosNaRua,
  taxaDaEntrega,
  trocoDaEntrega,
  problemaParaSair,
  totalDaEntrega,
  ENTREGA_META,
} from "../lib/entrega";
import type {
  Comanda,
  ItemComanda,
  ItemVenda,
  MovimentoCaixa,
  Produto,
  Venda,
  FormaPagamento,
} from "../lib/types";

/**
 * Entrega.
 *
 * Por dentro é uma comanda — a mesma conta aberta que recebe itens, manda
 * para a cozinha e vira venda, caixa e baixa de estoque. Ver lib/entrega.ts
 * para o porquê de não ser uma tabela nova.
 *
 * A tela é outra porque a rotina é outra. No salão o garçom volta na mesa;
 * aqui o pedido some de vista quando a moto sai, e o que a casa precisa
 * saber é: o que está pronto esperando entregador, o que já saiu e há quanto
 * tempo, e quanto de troco cada moto está levando.
 *
 * Um pedido só sai da tela quando o dinheiro volta.
 */

/** De quanto em quanto tempo o relógio da rua anda sozinho */
const SEGUNDOS_PARA_ATUALIZAR = 60;

export const Delivery: React.FC = () => {
  const {
    comandas,
    produtos,
    vendas,
    clientes,
    config,
    ramo,
    sessoes,
    fontesComFalha,
    saveComanda,
    saveVenda,
    saveMovimento,
    saveProduto,
  } = useApp();

  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [novo, setNovo] = useState<Partial<Comanda> | null>(null);
  const [recebendoId, setRecebendoId] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);

  // O relógio da rua anda mesmo sem nada mudar: sem isto os minutos
  // congelam e "saiu há 12 min" continua dizendo 12 uma hora depois.
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), SEGUNDOS_PARA_ATUALIZAR * 1000);
    return () => clearInterval(t);
  }, []);

  const lista = useMemo(() => entregasAbertas(comandas), [comandas]);
  const usaMeioAMeio = temRecurso(ramo, "meioAMeio");
  const sessao = achaSessaoAberta(sessoes);

  const atual = abertoId ? comandas.find((c) => c.id === abertoId) || null : null;
  const recebendo = recebendoId ? comandas.find((c) => c.id === recebendoId) || null : null;

  // A versão recém-gravada, antes de a nuvem responder: dois toques seguidos
  // no cardápio perdiam um item. Mesma razão da tela de Comandas.
  const recemGravada = useRef<Comanda | null>(null);
  const base = (c: Comanda): Comanda => {
    const r = recemGravada.current;
    return r && r.id === c.id && txt(r.atualizadoEm) >= txt(c.atualizadoEm) ? r : c;
  };

  const gravar = async (mudar: (c: Comanda) => Comanda) => {
    if (!atual) return;
    const nova = { ...mudar(base(atual)), atualizadoEm: nowISO() };
    recemGravada.current = nova;
    try {
      await saveComanda(nova);
    } catch (e) {
      recemGravada.current = null;
      aviso.erro("Não foi possível gravar o pedido:\n\n" + msg(e));
    }
  };

  const abrirPedido = async () => {
    if (!novo) return;
    if (!txt(novo.telefone).trim()) return aviso.alerta("Informe o telefone de quem pediu.");
    if (!txt(novo.endereco).trim()) return aviso.alerta("Informe o endereço da entrega.");

    const problema = problemaParaNumerar(fontesComFalha, "comandas", "um pedido");
    if (problema) return aviso.erro(problema);

    const pedido: Comanda = {
      id: uid(),
      numero: proximoNumero(comandas),
      // Mesa vazia de propósito: o "onde" de uma entrega é o endereço.
      mesa: "",
      tipo: "entrega",
      telefone: txt(novo.telefone).trim(),
      endereco: txt(novo.endereco).trim(),
      clienteId: novo.clienteId,
      taxaEntrega: Number(novo.taxaEntrega ?? config.taxaEntregaPadrao) || 0,
      itens: [],
      status: "aberta",
      abertaEm: nowISO(),
      atualizadoEm: nowISO(),
    };
    try {
      await saveComanda(pedido);
      setNovo(null);
      setAbertoId(pedido.id);
    } catch (e) {
      aviso.erro("Não foi possível abrir o pedido:\n\n" + msg(e));
    }
  };

  const addProduto = (p: Produto) => {
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
    gravar((c) => ({ ...c, itens: [...(c.itens || []), item] }));
  };

  /**
   * Despacha a moto.
   *
   * Grava QUEM levou e a QUE HORAS: sem o nome, quando o cliente liga
   * reclamando ninguém sabe a quem perguntar; sem a hora, não existe "há
   * quanto tempo saiu", que é a única pergunta que a casa faz depois disso.
   */
  const despachar = async (c: Comanda, entregador: string) => {
    const problema = problemaParaSair(c);
    if (problema) return aviso.alerta(problema);
    if (gravando) return;
    setGravando(true);
    try {
      await saveComanda({
        ...c,
        entregador: txt(entregador).trim(),
        saiuEm: nowISO(),
        atualizadoEm: nowISO(),
      });
      const troco = trocoDaEntrega(totalDaEntrega(c), c.trocoPara);
      aviso.sucesso(
        `Pedido ${c.numero} saiu para entrega.` +
          (troco > 0 ? ` Leve ${brl(troco)} de troco.` : "")
      );
      setAbertoId(null);
    } catch (e) {
      aviso.erro("Não foi possível despachar o pedido:\n\n" + msg(e));
    } finally {
      setGravando(false);
    }
  };

  /**
   * O dinheiro voltou: vira venda, entra no caixa e baixa o estoque.
   *
   * Dinheiro primeiro, como em toda gravação do sistema. E só aqui — nem na
   * abertura, nem no despacho — porque até o entregador voltar não existe
   * dinheiro nenhum, e lançar antes faria o fechamento do dia contar pedido
   * que voltou sem pagar.
   */
  const receber = async (c: Comanda, forma: FormaPagamento) => {
    const linha = problemaNasLinhasDaComanda(c);
    if (linha) return aviso.alerta(linha);
    if (gravando) return;

    const total = totalDaEntrega(c);
    if (!(total > 0)) {
      return aviso.alerta(
        "Pedido com valor zero. Confira os itens antes de fechar: pedido de " +
          "R$ 0,00 vira uma venda de zero no caixa."
      );
    }

    const problemaNum = problemaParaNumerar(fontesComFalha, "vendas", "uma venda");
    if (problemaNum) return aviso.erro(problemaNum);

    setGravando(true);
    const itens: ItemVenda[] = itensAtivos(c).map(
      ({ id: _i, preparo: _p, pedidoEm: _pe, prontoEm: _pr, cancelado: _c, motivoCancelamento: _m, ...resto }) =>
        resto
    );
    const taxa = taxaDaEntrega(c);
    if (taxa > 0) {
      // A taxa entra como LINHA, sem produtoId: aparece no cupom com o nome
      // dela e não passa pelo estoque — frete não é mercadoria.
      itens.push({
        descricao: "Taxa de entrega",
        quantidade: 1,
        precoUnit: taxa,
        custoUnit: 0,
        taxaServico: true,
      });
    }
    const formas = consolidar([{ forma, valor: total }]);

    try {
      const custo = custoVenda(itens);
      let movimentoId = "";
      for (const [i, f] of formas.entries()) {
        const movimento: MovimentoCaixa = {
          id: uid(),
          tipo: "entrada",
          categoria: "Venda",
          descricao: `Entrega ${c.numero} - ${txt(c.endereco).slice(0, 40)}`,
          valor: f.valor,
          formaPagamento: f.forma,
          clienteId: c.clienteId,
          custoRelacionado: i === 0 ? custo : 0,
          data: nowISO(),
          sessaoId: sessao?.id,
        } as MovimentoCaixa;
        await saveMovimento(movimento);
        if (i === 0) movimentoId = movimento.id;
      }

      const venda: Venda = {
        id: uid(),
        numero: proximoNumero(vendas),
        itens,
        desconto: Math.max(0, Number(c.desconto) || 0),
        formaPagamento: formaPrincipal(formas),
        clienteId: c.clienteId,
        sessaoId: sessao?.id,
        movimentoId,
        criadoEm: nowISO(),
      } as Venda;
      await saveVenda(venda);

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

      recemGravada.current = null;
      setRecebendoId(null);
      setAbertoId(null);
      aviso.sucesso(`Entrega ${c.numero} recebida: ${brl(total)}.`);
    } catch (e) {
      aviso.erro("Não foi possível fechar a entrega:\n\n" + msg(e));
    } finally {
      setGravando(false);
    }
  };

  return (
    <div>
      <SectionTitle
        title="Entrega"
        subtitle="Pedidos que saem na moto"
        action={
          <button
            className="btn-primary"
            onClick={() =>
              setNovo({ telefone: "", endereco: "", taxaEntrega: config.taxaEntregaPadrao })
            }
          >
            <Plus size={18} /> Novo pedido
          </button>
        }
      />

      {!sessao && (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <X size={16} className="mt-0.5 shrink-0" />
          Nenhum caixa aberto. O pedido fecha assim mesmo, mas fica fora do
          fechamento do dia.
        </p>
      )}

      {lista.length === 0 ? (
        <EmptyState
          icon={<Bike size={48} />}
          title="Nenhum pedido em aberto"
          hint="Abra um pedido para lançar o que vai na bolsa."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map((c) => {
            const sit = situacaoEntrega(c);
            const naRua = minutosNaRua(c, agora);
            const troco = trocoDaEntrega(totalDaEntrega(c), c.trocoPara);
            return (
              <div key={c.id} className="card">
                <button className="w-full text-left" onClick={() => setAbertoId(c.id)}>
                  <div className="flex items-start justify-between gap-2">
                    <span className={`badge ${ENTREGA_META[sit].cor}`}>
                      {ENTREGA_META[sit].label}
                      {sit === "na_rua" && ` · ${naRua} min`}
                    </span>
                    <span className="text-lg font-bold text-brand-600">
                      {brl(totalDaEntrega(c))}
                    </span>
                  </div>
                  <p className="mt-2 flex items-start gap-1.5 text-sm font-semibold text-slate-800">
                    <MapPin size={14} className="mt-0.5 shrink-0 text-slate-400" />
                    {txt(c.endereco) || "sem endereço"}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                    <Phone size={11} /> {txt(c.telefone) || "sem telefone"} · pedido {c.numero}
                    {txt(c.entregador).trim() && ` · ${txt(c.entregador)}`}
                  </p>
                  {/* O troco fica na CARA de quem despacha. Descobrir que o
                      cliente pediu troco para R$ 100 quando a moto já saiu é
                      o pedido voltando ou a conta saindo errada. */}
                  {troco > 0 && (
                    <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-sm font-bold text-amber-800">
                      Levar {brl(troco)} de troco
                    </p>
                  )}
                </button>

                <div className="mt-3 flex flex-wrap gap-2">
                  {sit === "na_rua" ? (
                    <button
                      className="btn-success !py-1.5 text-sm"
                      onClick={() => setRecebendoId(c.id)}
                    >
                      <Receipt size={15} /> Recebi {brl(totalDaEntrega(c))}
                    </button>
                  ) : (
                    <button className="btn-secondary !py-1.5 text-sm" onClick={() => setAbertoId(c.id)}>
                      Abrir pedido
                    </button>
                  )}
                  {txt(c.telefone).trim() && (
                    <button
                      className="btn-ghost !p-2"
                      title="Falar no WhatsApp"
                      onClick={() =>
                        abrirWhatsapp(
                          txt(c.telefone),
                          `${txt(config.nomeLoja)}\n\nSobre o seu pedido: `
                        )
                      }
                    >
                      <Phone size={15} className="text-emerald-600" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {novo && (
        <NovoPedido
          dados={novo}
          clientes={clientes}
          onMudar={(patch) => setNovo({ ...novo, ...patch })}
          onClose={() => setNovo(null)}
          onAbrir={abrirPedido}
        />
      )}

      {atual && (
        <PedidoAberto
          pedido={atual}
          produtos={produtos}
          usaMeioAMeio={usaMeioAMeio}
          regraMeioAMeio={config.regraMeioAMeio}
          gravando={gravando}
          onClose={() => setAbertoId(null)}
          onAddProduto={addProduto}
          onAddItem={(item) => gravar((c) => ({ ...c, itens: [...(c.itens || []), item] }))}
          onMudarPedido={(patch) => gravar((c) => ({ ...c, ...patch }))}
          onCancelarItem={(id) => {
            const item = (atual.itens || []).find((i) => i.id === id);
            if (!confirm(`Cancelar "${item?.descricao}"?`)) return;
            gravar((c) => cancelarItem(c, id));
          }}
          onDespachar={(entregador) => despachar(atual, entregador)}
          onReceber={() => setRecebendoId(atual.id)}
        />
      )}

      {recebendo && (
        <ReceberEntrega
          pedido={recebendo}
          gravando={gravando}
          onClose={() => setRecebendoId(null)}
          onConfirmar={(forma) => receber(recebendo, forma)}
        />
      )}
    </div>
  );
};

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/* ------------------------------------------------------------------ */
/* Abrir o pedido                                                      */
/* ------------------------------------------------------------------ */

const NovoPedido: React.FC<{
  dados: Partial<Comanda>;
  clientes: { id: string; nome: string; telefone: string; endereco?: string }[];
  onMudar: (patch: Partial<Comanda>) => void;
  onClose: () => void;
  onAbrir: () => void;
}> = ({ dados, clientes, onMudar, onClose, onAbrir }) => {
  /*
   * O telefone vem PRIMEIRO, e é ele que busca o cliente.
   *
   * É assim que o pedido chega: o telefone toca. Quem atende já tem o número
   * na tela antes de saber o nome, e nove em cada dez pedidos são de quem já
   * pediu antes — reaproveitar o endereço da última vez economiza a parte
   * mais demorada do atendimento.
   */
  const jaConhecido = useMemo(() => {
    const d = txt(dados.telefone).replace(/\D/g, "");
    if (d.length < 8) return undefined;
    return clientes.find((c) => txt(c.telefone).replace(/\D/g, "").endsWith(d));
  }, [clientes, dados.telefone]);

  return (
    <Modal
      open
      onClose={onClose}
      title="Novo pedido de entrega"
      maxWidth="max-w-md"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={onAbrir}>
            Abrir pedido
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Telefone *">
          <input
            autoFocus
            className="input"
            inputMode="tel"
            placeholder="(41) 99999-9999"
            value={txt(dados.telefone)}
            onChange={(e) => onMudar({ telefone: e.target.value })}
          />
        </Field>

        {jaConhecido && (
          <button
            className="w-full rounded-lg border border-brand-200 bg-brand-50 p-3 text-left text-sm"
            onClick={() =>
              onMudar({
                clienteId: jaConhecido.id,
                endereco: txt(jaConhecido.endereco) || txt(dados.endereco),
              })
            }
          >
            <span className="font-bold text-brand-700">{jaConhecido.nome}</span>
            <span className="block text-xs text-brand-700/80">
              {txt(jaConhecido.endereco) || "sem endereço no cadastro"} — tocar para usar
            </span>
          </button>
        )}

        <Field label="Endereço *">
          {/* Texto livre, como a mesa: endereço de bairro não cabe em campo
              partido, e "casa amarela depois da padaria" é informação. */}
          <textarea
            className="input"
            rows={2}
            placeholder="Rua, número, bairro e referência"
            value={txt(dados.endereco)}
            onChange={(e) => onMudar({ endereco: e.target.value })}
          />
        </Field>

        <Field label="Taxa de entrega">
          <InputNumero
            className="input"
            min={0}
            value={dados.taxaEntrega}
            onChange={(v) => onMudar({ taxaEntrega: v ?? 0 })}
          />
        </Field>
      </div>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* O pedido aberto                                                     */
/* ------------------------------------------------------------------ */

const PedidoAberto: React.FC<{
  pedido: Comanda;
  produtos: Produto[];
  usaMeioAMeio: boolean;
  regraMeioAMeio?: string;
  gravando: boolean;
  onClose: () => void;
  onAddProduto: (p: Produto) => void;
  onAddItem: (i: ItemComanda) => void;
  onMudarPedido: (patch: Partial<Comanda>) => void;
  onCancelarItem: (id: string) => void;
  onDespachar: (entregador: string) => void;
  onReceber: () => void;
}> = ({
  pedido,
  produtos,
  usaMeioAMeio,
  regraMeioAMeio,
  gravando,
  onClose,
  onAddProduto,
  onAddItem,
  onMudarPedido,
  onCancelarItem,
  onDespachar,
  onReceber,
}) => {
  const [termo, setTermo] = useState("");
  const [montandoPizza, setMontandoPizza] = useState(false);
  const [entregador, setEntregador] = useState(txt(pedido.entregador));
  const sugestoes = useMemo(() => produtosParaOS(produtos, termo, 6), [produtos, termo]);

  const sit = situacaoEntrega(pedido);
  const total = totalDaEntrega(pedido);
  const taxa = taxaDaEntrega(pedido);
  const troco = trocoDaEntrega(total, pedido.trocoPara);
  const impedimento = problemaParaSair(pedido);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Pedido ${pedido.numero}`}
      maxWidth="max-w-2xl"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Voltar
          </button>
          {sit === "na_rua" ? (
            <button className="btn-success" onClick={onReceber}>
              <Receipt size={16} /> Recebi {brl(total)}
            </button>
          ) : (
            <button
              className="btn-primary"
              disabled={gravando || !!impedimento}
              title={impedimento || undefined}
              onClick={() => onDespachar(entregador)}
            >
              <Bike size={16} /> Despachar {brl(total)}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <p className="font-semibold text-slate-800">{txt(pedido.endereco)}</p>
          <p className="text-xs text-slate-500">{txt(pedido.telefone)}</p>
        </div>

        {/* O que impede a moto de sair fica à vista, e não escondido num
            aviso que só aparece ao clicar. */}
        {impedimento && sit !== "na_rua" && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {impedimento}
          </p>
        )}

        {sit !== "na_rua" && (
          <>
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
          </>
        )}

        {itensAtivos(pedido).length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">Nada lançado ainda.</p>
        ) : (
          <div className="space-y-2">
            {(pedido.itens || []).map((i) => {
              const p = preparoDe(i.preparo);
              return (
                <div
                  key={i.id}
                  className={`flex items-center gap-2 rounded-lg border border-slate-200 p-3 ${
                    i.cancelado ? "bg-slate-50 opacity-60" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className={`truncate font-semibold text-slate-800 ${i.cancelado ? "line-through" : ""}`}>
                      {i.quantidade > 1 && `${i.quantidade}x `}
                      {i.descricao}
                    </p>
                    {!i.cancelado && (
                      <span className={`badge mt-1 ${PREPARO_META[p].cor}`}>
                        {PREPARO_META[p].label}
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 font-bold text-slate-800">{brl(subtotalDoItem(i))}</span>
                  {!i.cancelado && sit !== "na_rua" && (
                    <button
                      className="btn-ghost !p-2 text-red-500"
                      onClick={() => onCancelarItem(i.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/*
          O troco é perguntado ANTES de a moto sair, e por isso mora aqui e
          não na hora de receber: descobrir que o cliente pediu troco para
          R$ 100 quando a moto já foi é o pedido voltando.
        */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Taxa de entrega">
            <InputNumero
              className="input"
              min={0}
              value={pedido.taxaEntrega}
              onChange={(v) => onMudarPedido({ taxaEntrega: v ?? 0 })}
            />
          </Field>
          <Field label="Cliente paga com (troco)">
            <InputNumero
              className="input"
              min={0}
              value={pedido.trocoPara}
              onChange={(v) => onMudarPedido({ trocoPara: v ?? 0 })}
            />
            {troco > 0 && (
              <p className="mt-1 text-sm font-bold text-amber-700">
                Levar {brl(troco)} de troco
              </p>
            )}
          </Field>
        </div>

        {sit !== "na_rua" && (
          <Field label="Entregador">
            {/* Texto livre: entregador de bairro não tem cadastro, e obrigar
                um seria uma tela a mais que ninguém preenche. */}
            <input
              className="input"
              placeholder="Quem vai levar"
              value={entregador}
              onChange={(e) => setEntregador(e.target.value)}
            />
          </Field>
        )}

        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>Itens</span>
            <span>{brl(total - taxa + Math.max(0, Number(pedido.desconto) || 0))}</span>
          </div>
          {taxa > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>Entrega</span>
              <span>{brl(taxa)}</span>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 font-bold text-slate-800">
            <span>Total</span>
            <span>{brl(total)}</span>
          </div>
        </div>
      </div>

      {montandoPizza && (
        <MontarPizza
          produtos={produtos}
          regra={regraMeioAMeio}
          onFechar={() => setMontandoPizza(false)}
          onMontou={(item) => {
            onAddItem({ ...item, id: uid(), pedidoEm: nowISO(), preparo: "pendente" } as ItemComanda);
            setMontandoPizza(false);
          }}
        />
      )}
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* O dinheiro voltou                                                   */
/* ------------------------------------------------------------------ */

const ReceberEntrega: React.FC<{
  pedido: Comanda;
  gravando: boolean;
  onClose: () => void;
  onConfirmar: (forma: FormaPagamento) => void;
}> = ({ pedido, gravando, onClose, onConfirmar }) => {
  const [forma, setForma] = useState<FormaPagamento>("dinheiro");
  const total = totalDaEntrega(pedido);
  const troco = trocoDaEntrega(total, pedido.trocoPara);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Receber pedido ${pedido.numero}`}
      maxWidth="max-w-sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Voltar
          </button>
          <button className="btn-success" disabled={gravando} onClick={() => onConfirmar(forma)}>
            {gravando ? "Fechando..." : `Recebi ${brl(total)}`}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-emerald-50 p-4 text-center">
          <p className="text-sm text-emerald-700">Total do pedido</p>
          <p className="text-3xl font-bold text-emerald-700">{brl(total)}</p>
          {troco > 0 && (
            <p className="mt-1 text-sm text-emerald-700/80">
              Troco combinado: {brl(troco)}
            </p>
          )}
        </div>

        <Field label="Como o cliente pagou">
          <div className="grid grid-cols-2 gap-2">
            {FORMAS_META.map((f) => (
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
