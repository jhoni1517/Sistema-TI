import React, { useMemo, useRef, useState } from "react";
import { aviso } from "../components/Aviso";
import { Plus, Trash2, Utensils, Receipt, Clock, Pizza, X, AlertTriangle } from "lucide-react";
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
import { sessaoAberta as achaSessaoAberta } from "../lib/caixa";
import { soMesas } from "../lib/entrega";
import {
  consolidar,
  formaPrincipal,
  problemaNoPagamento,
  faltaNoPagamento,
  trocoDoPagamento,
  type Parcela,
} from "../lib/pagamento";
import {
  totalComanda,
  totalAPagar,
  taxaDaComanda,
  itensParaVenda,
  quantosItens,
  problemaParaFechar,
  cancelarItem,
  comPreparo,
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
  PreparoItem,
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

  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [novaMesa, setNovaMesa] = useState("");
  const [abrindo, setAbrindo] = useState(false);
  const [fechandoId, setFechandoId] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);

  // Só as MESAS: o pedido de entrega mora na mesma tabela, com os mesmos
  // campos por dentro, mas quem cuida dele é a tela da moto.
  const lista = useMemo(() => comandasAbertas(soMesas(comandas)), [comandas]);
  const usaMeioAMeio = temRecurso(ramo, "meioAMeio");
  const sessao = achaSessaoAberta(sessoes);

  /**
   * A comanda que está na tela vem sempre do estado, pelo id.
   *
   * Guardar o objeto inteiro fazia a tela segurar uma FOTO: o item lançado
   * pelo outro celular do salão não aparecia, e a janela de fechar a conta
   * mostrava o total de antes do último pedido — que é o valor que o cliente
   * ia pagar.
   */
  const atual = abertaId ? comandas.find((c) => c.id === abertaId) || null : null;
  const fechando = fechandoId ? comandas.find((c) => c.id === fechandoId) || null : null;

  /**
   * A versão que ACABOU de ser gravada, antes de a nuvem responder.
   *
   * O garçom toca em dois pratos seguidos. `saveComanda` leva o tempo do 4G
   * para voltar, e até lá `comandas` ainda é a lista sem o primeiro item —
   * então o segundo toque montava a comanda em cima da versão velha e o
   * primeiro prato SUMIA. Ninguém percebe: só chega um prato na mesa.
   *
   * Se a comanda mudou por fora (o outro celular do salão), `atualizadoEm`
   * da nuvem é mais novo e manda nela.
   */
  const recemGravada = useRef<Comanda | null>(null);
  const base = (c: Comanda): Comanda => {
    const r = recemGravada.current;
    return r && r.id === c.id && txt(r.atualizadoEm) >= txt(c.atualizadoEm) ? r : c;
  };

  const abrirMesa = async () => {
    const mesa = novaMesa.trim();
    if (!mesa) return aviso.alerta("Diga qual é a mesa.");

    // Duas comandas na mesma mesa é o jeito mais fácil de a conta sair pela
    // metade: o garçom lança na que achou primeiro.
    const jaTem = comandaDaMesa(soMesas(comandas), mesa);
    if (jaTem) {
      setAbrindo(false);
      setNovaMesa("");
      setAbertaId(jaTem.id);
      return aviso.info(`A mesa ${jaTem.mesa} já tem uma comanda aberta. Abri ela para você.`);
    }

    // Numerar em cima de uma lista que não carregou repete número.
    const problema = problemaParaNumerar(fontesComFalha, "comandas", "uma comanda");
    if (problema) return aviso.erro(problema);

    const nova: Comanda = {
      id: uid(),
      numero: proximoNumero(comandas),
      mesa,
      tipo: "mesa",
      itens: [],
      status: "aberta",
      // Já nasce com a taxa que a casa cobra. O garçom tira quando o cliente
      // recusa, que é o caminho raro — o contrário faria a casa esquecer de
      // cobrar o serviço na correria.
      taxaServico: Number(config.taxaServicoPadrao) || 0,
      abertaEm: nowISO(),
      atualizadoEm: nowISO(),
    };
    try {
      await saveComanda(nova);
      setAbrindo(false);
      setNovaMesa("");
      setAbertaId(nova.id);
    } catch (e) {
      aviso.erro("Não foi possível abrir a comanda:\n\n" + msg(e));
    }
  };

  /**
   * Grava a comanda a partir da versão mais nova que existe.
   *
   * Recebe uma FUNÇÃO e não um objeto pronto de propósito: quem chama não
   * tem como saber se o toque anterior já voltou da nuvem. Ver `base`.
   */
  const gravar = async (mudar: (c: Comanda) => Comanda) => {
    if (!atual) return;
    const nova = { ...mudar(base(atual)), atualizadoEm: nowISO() };
    recemGravada.current = nova;
    try {
      await saveComanda(nova);
    } catch (e) {
      // A janela fechava como se tivesse dado certo e o pedido não chegava
      // na cozinha.
      recemGravada.current = null;
      aviso.erro("Não foi possível gravar a comanda:\n\n" + msg(e));
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

  const mudarItem = (id: string, patch: Partial<ItemComanda>) => {
    gravar((c) => ({
      ...c,
      itens: (c.itens || []).map((i) => (i.id === id ? { ...i, ...patch } : i)),
    }));
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
    gravar((c) => cancelarItem(c, id));
  };

  /**
   * Toque no selo do item anda com o preparo: na fila -> preparando ->
   * pronto -> entregue.
   *
   * Sem isso TODO item ficava "na fila" para sempre, e o aviso "N itens
   * ainda na cozinha" aparecia no fechamento de toda mesa, todo dia. Aviso
   * que aparece sempre é aviso que a pessoa aprende a ignorar — e aí ele
   * deixa de existir justamente no dia em que a sobremesa não saiu.
   */
  const andarPreparo = (id: string) => {
    if (!atual) return;
    const item = (atual.itens || []).find((i) => i.id === id);
    if (!item) return;
    const ordem: PreparoItem[] = ["pendente", "preparando", "pronto", "entregue"];
    const proximo = ordem[(ordem.indexOf(preparoDe(item.preparo)) + 1) % ordem.length];
    gravar((c) => comPreparo(c, id, proximo));
  };

  /**
   * Fecha a comanda: vira venda, vira dinheiro no caixa, baixa o estoque.
   *
   * A ordem é a de sempre — dinheiro primeiro. Falhando no meio sobra
   * lançamento sem baixa, que se conserta olhando o estoque; ao contrário
   * some a venda e ninguém procura por lucro inflado.
   */
  const fecharComanda = async (c: Comanda, parcelas: Parcela[]) => {
    const problema = problemaParaFechar(c);
    if (problema) return aviso.alerta(problema);
    if (gravando) return;

    const total = totalAPagar(c);
    const problemaPag = problemaNoPagamento(total, parcelas);
    if (problemaPag) return aviso.alerta(problemaPag);

    const problemaNum = problemaParaNumerar(fontesComFalha, "vendas", "uma venda");
    if (problemaNum) return aviso.erro(problemaNum);

    setGravando(true);
    // A taxa de serviço entra como LINHA da venda: é assim que ela aparece
    // no cupom com o nome dela, e sem produtoId ela não passa pelo estoque.
    const itens: ItemVenda[] = itensParaVenda(c);
    const formas = consolidar(parcelas);

    const venda: Venda = {
      id: uid(),
      numero: proximoNumero(vendas),
      itens,
      desconto: Math.max(0, Number(c.desconto) || 0),
      formaPagamento: formaPrincipal(formas),
      pagamentos: formas.length > 1 ? formas : undefined,
      clienteId: c.clienteId,
      sessaoId: sessao?.id,
      criadoEm: nowISO(),
    } as Venda;

    try {
      /*
       * Um lançamento POR FORMA, igual ao PDV. O fechamento do caixa separa
       * o dinheiro da gaveta do que caiu na maquininha; um lançamento só,
       * com a forma "principal", jogaria os R$ 20 em espécie da mesa dentro
       * do cartão — e a gaveta acusaria falta todo dia.
       */
      const custo = custoVenda(itens);
      let movimentoId = "";
      for (const [i, f] of formas.entries()) {
        const movimento: MovimentoCaixa = {
          id: uid(),
          tipo: "entrada",
          categoria: "Venda",
          descricao:
            `Mesa ${c.mesa} - comanda ${c.numero} (${itens.length} item(ns))` +
            (formas.length > 1 ? ` - ${f.forma}` : ""),
          valor: f.valor,
          formaPagamento: f.forma,
          clienteId: c.clienteId,
          // O custo vai INTEIRO no primeiro lançamento: dividir o CMV entre
          // as formas de pagamento não significa nada.
          custoRelacionado: i === 0 ? custo : 0,
          data: nowISO(),
          sessaoId: sessao?.id,
        } as MovimentoCaixa;
        await saveMovimento(movimento);
        if (i === 0) movimentoId = movimento.id;
      }

      await saveVenda({ ...venda, movimentoId });

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
      setFechandoId(null);
      setAbertaId(null);
      const troco = trocoDoPagamento(total, formas);
      aviso.sucesso(
        `Mesa ${c.mesa} fechada: ${brl(total)}.` +
          (troco > 0 ? ` Troco: ${brl(troco)}.` : "")
      );
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

      {/* O mesmo aviso do PDV: sem caixa aberto o dinheiro entra, mas fica
          fora do fechamento do dia — e ninguém confere o que não aparece. */}
      {!sessao && (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          Nenhum caixa aberto. A mesa fecha assim mesmo, mas fica fora do
          fechamento do dia. Abra o caixa em Caixa para conferir certo depois.
        </p>
      )}

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
                onClick={() => setAbertaId(c.id)}
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
          onFechar={() => setAbertaId(null)}
          onAddProduto={addProduto}
          onAddItem={(item) => gravar((c) => ({ ...c, itens: [...(c.itens || []), item] }))}
          onMudarItem={mudarItem}
          onCancelarItem={cancelar}
          onAndarPreparo={andarPreparo}
          onPedirConta={() => setFechandoId(atual.id)}
        />
      )}

      {fechando && (
        <FecharComanda
          comanda={fechando}
          gravando={gravando}
          onClose={() => setFechandoId(null)}
          onMudarConta={(patch) => gravar((c) => ({ ...c, ...patch }))}
          onConfirmar={(parcelas) => fecharComanda(fechando, parcelas)}
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
  onAndarPreparo: (id: string) => void;
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
  onAndarPreparo,
  onPedirConta,
}) => {
  const [termo, setTermo] = useState("");
  const [montandoPizza, setMontandoPizza] = useState(false);
  const sugestoes = useMemo(() => produtosParaOS(produtos, termo, 6), [produtos, termo]);
  const total = totalAPagar(comanda);

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
            {(comanda.itens || []).map((i) => (
              <LinhaItem
                key={i.id}
                item={i}
                onMudar={(patch) => onMudarItem(i.id, patch)}
                onCancelar={() => onCancelarItem(i.id)}
                onAndarPreparo={() => onAndarPreparo(i.id)}
              />
            ))}
          </div>
        )}

        <ResumoDaConta comanda={comanda} />
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
/* Uma linha da comanda                                                */
/* ------------------------------------------------------------------ */

/**
 * A linha do pedido, com o campo de recado em estado LOCAL.
 *
 * Ligar o `onChange` do recado direto na gravação mandava uma escrita para a
 * nuvem POR TECLA: "sem cebola" eram onze idas ao Supabase no 4G do salão, e
 * as respostas voltando fora de ordem apagavam letra. Aqui o texto é local
 * enquanto se digita e sobe quando o campo perde o foco.
 *
 * Enquanto ninguém está digitando, o campo acompanha o que veio da nuvem —
 * é a mesma regra da tela de Configurações, e pelo mesmo motivo: recarregar
 * por cima de quem digita é o outro jeito de perder o que a pessoa escreveu.
 */
const LinhaItem: React.FC<{
  item: ItemComanda;
  onMudar: (patch: Partial<ItemComanda>) => void;
  onCancelar: () => void;
  onAndarPreparo: () => void;
}> = ({ item, onMudar, onCancelar, onAndarPreparo }) => {
  const [recado, setRecado] = useState(item.observacao || "");
  const [digitando, setDigitando] = useState(false);
  const p = preparoDe(item.preparo);

  if (!digitando && (item.observacao || "") !== recado) setRecado(item.observacao || "");

  return (
    <div
      className={`rounded-lg border p-3 ${
        item.cancelado ? "border-slate-200 bg-slate-50 opacity-60" : "border-slate-200"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p
            className={`truncate font-semibold text-slate-800 ${item.cancelado ? "line-through" : ""}`}
          >
            {item.descricao}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {item.cancelado ? (
              <span className="badge bg-red-100 text-red-700">Cancelado</span>
            ) : (
              <>
                {/* Tocar anda com o preparo. Sem isto o item ficava "na fila"
                    para sempre e o aviso da cozinha aparecia em toda mesa. */}
                <button
                  onClick={onAndarPreparo}
                  className={`badge ${PREPARO_META[p].cor}`}
                  title="Tocar para andar: na fila, preparando, pronto, entregue"
                >
                  {PREPARO_META[p].label}
                </button>
                {(p === "pendente" || p === "preparando") && (
                  <span className="text-xs text-slate-400">{minutosEsperando(item)} min</span>
                )}
              </>
            )}
          </div>
        </div>
        <span className="shrink-0 font-bold text-slate-800">{brl(subtotalDoItem(item))}</span>
      </div>

      {!item.cancelado && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <InputNumero
            className="input !w-20 !py-1.5 text-sm"
            min={1}
            value={item.quantidade}
            onChange={(v) => onMudar({ quantidade: v ?? 1 })}
          />
          <input
            className="input !py-1.5 flex-1 text-sm"
            placeholder="Sem cebola, bem passado..."
            value={recado}
            onFocus={() => setDigitando(true)}
            onChange={(e) => setRecado(e.target.value)}
            onBlur={() => {
              setDigitando(false);
              if (recado !== (item.observacao || "")) onMudar({ observacao: recado });
            }}
          />
          <button
            className="btn-ghost !p-2 text-red-500"
            title="Cancelar item"
            onClick={onCancelar}
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* O resumo da conta                                                   */
/* ------------------------------------------------------------------ */

/** Consumo, taxa e desconto separados: é o que o cliente confere na conta */
const ResumoDaConta: React.FC<{ comanda: Comanda }> = ({ comanda }) => {
  const consumo = totalComanda(comanda);
  const taxa = taxaDaComanda(comanda);
  const desconto = Math.max(0, Number(comanda.desconto) || 0);
  if (consumo === 0) return null;

  return (
    <div className="rounded-lg bg-slate-50 p-3 text-sm">
      <div className="flex justify-between text-slate-600">
        <span>Consumo</span>
        <span>{brl(consumo)}</span>
      </div>
      {taxa > 0 && (
        <div className="flex justify-between text-slate-600">
          <span>Serviço {Number(comanda.taxaServico) || 0}%</span>
          <span>{brl(taxa)}</span>
        </div>
      )}
      {desconto > 0 && (
        <div className="flex justify-between text-slate-600">
          <span>Desconto</span>
          <span>- {brl(desconto)}</span>
        </div>
      )}
      <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 font-bold text-slate-800">
        <span>Total</span>
        <span>{brl(totalAPagar(comanda))}</span>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Fechar a conta                                                      */
/* ------------------------------------------------------------------ */

const FecharComanda: React.FC<{
  comanda: Comanda;
  gravando: boolean;
  onClose: () => void;
  onMudarConta: (patch: Partial<Comanda>) => void;
  onConfirmar: (parcelas: Parcela[]) => void;
}> = ({ comanda, gravando, onClose, onMudarConta, onConfirmar }) => {
  const [forma, setForma] = useState<FormaPagamento>("dinheiro");
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [dividido, setDividido] = useState(false);
  const [recebido, setRecebido] = useState<number | undefined>(undefined);

  const consumo = totalComanda(comanda);
  const taxa = taxaDaComanda(comanda);
  const desconto = Math.max(0, Number(comanda.desconto) || 0);
  const total = totalAPagar(comanda);
  const temTaxa = (Number(comanda.taxaServico) || 0) > 0;

  const falta = faltaNoPagamento(total, parcelas);
  const parcelasFinais: Parcela[] = dividido ? parcelas : [{ forma, valor: total, recebido }];
  const troco = trocoDoPagamento(total, parcelasFinais);
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
            onClick={() => onConfirmar(parcelasFinais)}
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
            {quantosItens(comanda)} item(ns) · consumo {brl(consumo)}
            {taxa > 0 && ` + serviço ${brl(taxa)}`}
            {desconto > 0 && ` - desconto ${brl(desconto)}`}
          </p>
        </div>

        {/* Avisa, mas não trava: a pessoa pede a conta e vai embora enquanto
            a sobremesa sai. Travar o caixa por isso o prenderia numa fila
            que não é dele. */}
        {naCozinha > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle size={14} className="mr-1 inline" />
            {naCozinha} item(ns) ainda na cozinha. Dá para fechar, mas confira
            se tudo já foi entregue.
          </div>
        )}

        {/* A taxa de serviço é o único item da conta que o cliente pode
            recusar por lei. Tirar precisa ser um toque, não uma discussão
            com o sistema na frente dele. */}
        {temTaxa && (
          <button
            className="chip w-full justify-center bg-white text-sm text-slate-600 ring-1 ring-slate-200"
            onClick={() => onMudarConta({ taxaServico: 0 })}
          >
            <X size={14} /> Cliente recusou o serviço ({brl(taxa)})
          </button>
        )}

        <Field label="Desconto na conta">
          <InputNumero
            className="input"
            min={0}
            value={comanda.desconto}
            onChange={(v) => onMudarConta({ desconto: v ?? 0 })}
          />
        </Field>

        {!dividido ? (
          <>
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

            {forma === "dinheiro" && (
              <Field label="Dinheiro entregue (para o troco)">
                <InputNumero
                  className="input"
                  min={0}
                  value={recebido}
                  onChange={setRecebido}
                />
                {troco > 0 && (
                  <p className="mt-1 text-sm font-bold text-emerald-700">
                    Troco: {brl(troco)}
                  </p>
                )}
              </Field>
            )}

            {/* Mesa de quatro pagando metade no cartão e metade em dinheiro é
                a regra, não a exceção. Lançar tudo numa forma só faz a gaveta
                acusar falta e a maquininha acusar sobra, todo dia. */}
            <button
              className="btn-secondary w-full"
              onClick={() => {
                setDividido(true);
                setParcelas([{ forma, valor: total }]);
              }}
            >
              Dividir entre formas de pagamento
            </button>
          </>
        ) : (
          <Field label="Como a mesa vai pagar">
            <div className="space-y-2">
              {parcelas.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    className="input !py-1.5 flex-1 text-sm"
                    value={p.forma}
                    onChange={(e) =>
                      setParcelas((v) =>
                        v.map((x, n) =>
                          n === i ? { ...x, forma: e.target.value as FormaPagamento } : x
                        )
                      )
                    }
                  >
                    {FORMAS.map((f) => (
                      <option key={f.k} value={f.k}>
                        {f.nome}
                      </option>
                    ))}
                  </select>
                  <InputNumero
                    className="input !w-28 !py-1.5 text-sm"
                    min={0}
                    value={p.valor}
                    onChange={(v) =>
                      setParcelas((x) => x.map((y, n) => (n === i ? { ...y, valor: v ?? 0 } : y)))
                    }
                  />
                  <button
                    className="btn-ghost !p-2 text-red-500"
                    onClick={() => setParcelas((v) => v.filter((_, n) => n !== i))}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}

              <div className="flex items-center justify-between gap-2 text-sm">
                <span className={falta > 0 ? "font-bold text-amber-700" : "text-slate-500"}>
                  {falta > 0 ? `Faltam ${brl(falta)}` : "Fechou certo"}
                </span>
                <div className="flex gap-2">
                  <button
                    className="btn-ghost text-sm"
                    onClick={() =>
                      setParcelas((v) => [
                        ...v,
                        // A linha nova nasce numa forma que ainda não está na
                        // lista. Nascendo sempre em "dinheiro", o toque não
                        // servia para nada quando a primeira já era dinheiro:
                        // `consolidar` juntava as duas e o caixa recebia um
                        // lançamento só.
                        {
                          forma:
                            FORMAS.find((f) => !v.some((x) => x.forma === f.k))?.k || "dinheiro",
                          valor: falta,
                        },
                      ])
                    }
                  >
                    <Plus size={14} /> Forma
                  </button>
                  <button
                    className="btn-ghost text-sm"
                    onClick={() => {
                      setDividido(false);
                      setParcelas([]);
                    }}
                  >
                    Uma forma só
                  </button>
                </div>
              </div>
            </div>
          </Field>
        )}
      </div>
    </Modal>
  );
};
