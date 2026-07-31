import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ShoppingCart,
  Barcode,
  Trash2,
  Plus,
  Minus,
  Scale,
  Printer,
  Undo2,
  PauseCircle,
  CheckCircle2,
  AlertTriangle,
  X,
} from "lucide-react";
import { aviso } from "../components/Aviso";
import { useApp } from "../store/AppStore";
import { SectionTitle, EmptyState, InputNumero } from "../components/ui";
import { uid, nowISO, brl, txt } from "../lib/format";
import { printHTML } from "../lib/print";
import { reciboPDV } from "../lib/recibo";
import { sessaoAberta as achaSessaoAberta } from "../lib/caixa";
import {
  lerEtiqueta,
  produtoDaEtiqueta,
  quantidadeDaEtiqueta,
  ehEtiquetaBalanca,
} from "../lib/balanca";
import {
  subtotalItem,
  subtotalVenda,
  totalVenda,
  custoVenda,
  trocoDe,
  faltaPara,
  itemDoProduto,
  adicionar,
  buscarProduto,
  sugerirProdutos,
  situacaoValidade,
  VALIDADE_META,
} from "../lib/pdv";
import { precoEfetivo, promocaoValendo } from "../lib/promocao";
import {
  trocoDoPagamento,
  faltaNoPagamento,
  problemaNoPagamento,
  consolidar,
  formaPrincipal,
  type Parcela,
} from "../lib/pagamento";
import { Devolucao } from "../components/Devolucao";
import type {
  FormaPagamento,
  ItemVenda,
  MovimentoCaixa,
  Produto,
  Venda,
} from "../lib/types";

const FORMAS: { k: FormaPagamento; nome: string }[] = [
  { k: "dinheiro", nome: "Dinheiro" },
  { k: "pix", nome: "Pix" },
  { k: "debito", nome: "Débito" },
  { k: "credito", nome: "Crédito" },
];

/**
 * Frente de caixa da mercearia.
 *
 * A regra de ouro desta tela é que tem gente na fila: nada de janela entre
 * o produto e o troco. O foco vive na busca, o leitor de código de barras
 * digita e dá Enter sozinho, e o item cai no carrinho sem confirmação.
 *
 * Cliente é opcional de propósito. Parar a fila para cadastrar quem só quer
 * um pão é o caminho mais curto para o sistema não ser usado.
 */
export const PDV: React.FC = () => {
  const { produtos, clientes, sessoes, vendas, config, saveVenda, saveMovimento, saveProduto } =
    useApp();

  const [itens, setItens] = useState<ItemVenda[]>([]);
  const [termo, setTermo] = useState("");
  const [desconto, setDesconto] = useState(0);
  const [forma, setForma] = useState<FormaPagamento>("dinheiro");
  const [recebido, setRecebido] = useState<number | undefined>(undefined);
  /**
   * Venda dividida ("50 no cartão e o resto em dinheiro").
   *
   * Vazio = uma forma só, que é a esmagadora maioria e não pode ficar mais
   * lenta por causa da exceção. Quando alguém divide, cada forma vira um
   * lançamento próprio no caixa — senão o fechamento acusa sobra no cartão e
   * falta na gaveta, todo dia, sem origem rastreável.
   */
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const dividido = parcelas.length > 0;
  const [clienteId, setClienteId] = useState("");
  const [gravando, setGravando] = useState(false);
  const [ultima, setUltima] = useState<Venda | null>(null);
  const [devolvendo, setDevolvendo] = useState(false);

  const buscaRef = useRef<HTMLInputElement>(null);
  const sessao = useMemo(() => achaSessaoAberta(sessoes), [sessoes]);

  // O foco volta para a busca depois de qualquer ação: é onde ele precisa
  // estar quando o próximo produto passar pelo leitor.
  const focarBusca = () => setTimeout(() => buscaRef.current?.focus(), 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    focarBusca();
  }, []);

  /**
   * O atalho precisa sempre chamar a versão ATUAL da função.
   *
   * Prender a função de fechar venda no efeito uma vez só congelaria o
   * carrinho daquele instante: F2 fecharia a venda anterior, com os itens e
   * o valor antigos.
   */
  const finalizarRef = useRef<() => void>(undefined);
  const limparRef = useRef<() => void>(undefined);
  const consultaRef = useRef<() => void>(undefined);

  /**
   * Atalhos de balcão.
   *
   * Com fila, tirar a mão do teclado para achar o botão de pagar custa mais
   * do que parece — e o leitor de código de barras já mantém o foco no campo
   * de busca o tempo todo. F2 fecha a venda, F4 limpa o carrinho, Esc apaga
   * o que está digitado sem mexer no carrinho.
   *
   * Não usa Ctrl+letra de propósito: quase toda combinação dessas já é do
   * navegador, e o que o operador ganharia num atalho perderia numa aba
   * fechada sem querer no meio da venda.
   */
  useEffect(() => {
    const atalho = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        finalizarRef.current?.();
      } else if (e.key === "F4") {
        e.preventDefault();
        limparRef.current?.();
      } else if (e.key === "F3") {
        e.preventDefault();
        consultaRef.current?.();
      } else if (e.key === "Escape") {
        setTermo("");
        focarBusca();
      }
    };
    window.addEventListener("keydown", atalho);
    return () => window.removeEventListener("keydown", atalho);
  }, []);

  const total = totalVenda({ itens, desconto });
  const bruto = subtotalVenda(itens);
  const troco = dividido ? trocoDoPagamento(total, parcelas) : trocoDe(total, recebido);
  const falta = dividido ? faltaNoPagamento(total, parcelas) : faltaPara(total, recebido);
  const sugestoes = useMemo(() => sugerirProdutos(produtos, termo), [produtos, termo]);

  const proximoNumero = useMemo(
    () => (vendas.reduce((m, v) => Math.max(m, v.numero || 0), 0) || 0) + 1,
    [vendas]
  );

  const addProduto = (p: Produto, quantidade = 1) => {
    // Sem etiqueta de balança, peso entra com 1 kg e o campo fica editável
    // na linha — digitar ali é mais rápido do que abrir uma janela por
    // pesagem. Com etiqueta, a quantidade já vem certa e ninguém digita.
    setItens((prev) => adicionar(prev, itemDoProduto(p, quantidade)));
    setTermo("");
    focarBusca();

    const val = situacaoValidade(p);
    if (val === "vencido") {
      aviso.alerta(`${p.nome} está com a validade vencida. Confira antes de vender.`);
    } else if (val === "vence_perto") {
      aviso.info(`${p.nome} vence em breve.`);
    }
    if (!p.servico && Number(p.quantidade) <= 0) {
      aviso.alerta(`${p.nome} está sem estoque. A venda passa, mas o saldo fica negativo.`);
    }
  };

  const lerCodigo = () => {
    const t = termo.trim();
    if (!t) return;

    // Etiqueta de balança vem primeiro: ela é única por pacote, então nunca
    // vai casar com um código de barras cadastrado. Se caísse na busca
    // comum, o operador levaria "nada encontrado" a cada pesagem.
    if (ehEtiquetaBalanca(t)) {
      const etiqueta = lerEtiqueta(t, config.formatoBalanca || "peso");
      if (!etiqueta) {
        setTermo("");
        focarBusca();
        return aviso.alerta(
          "Etiqueta de balança ilegível — o dígito verificador não fecha. Passe o produto de novo."
        );
      }
      const p = produtoDaEtiqueta(produtos, etiqueta);
      if (!p) {
        setTermo("");
        focarBusca();
        return aviso.alerta(
          `Nenhum produto com o código de balança ${etiqueta.codigo}. Cadastre esse código em Estoque.`
        );
      }
      // Preço efetivo: com promoção valendo, a etiqueta da balança
      // precisa render o mesmo valor que a gôndola anuncia.
      const qtd = quantidadeDaEtiqueta(etiqueta, precoEfetivo(p));
      if (qtd <= 0) {
        setTermo("");
        focarBusca();
        return aviso.alerta(
          `${p.nome} está sem preço por quilo cadastrado — não dá para calcular o peso.`
        );
      }
      return addProduto({ ...p, porPeso: true }, qtd);
    }

    const p = buscarProduto(produtos, t);
    if (p) return addProduto(p);
    if (sugestoes.length === 1) return addProduto(sugestoes[0]);
    aviso.alerta(`Nada encontrado para "${t}". Cadastre em Estoque ou use item avulso.`);
  };

  /** Item digitado na mão, para o que não está cadastrado */
  const addAvulso = () => {
    const nome = termo.trim() || "Item avulso";
    setItens((prev) => [...prev, { descricao: nome, quantidade: 1, precoUnit: 0, custoUnit: 0 }]);
    setTermo("");
    focarBusca();
  };

  const mudarItem = (i: number, patch: Partial<ItemVenda>) =>
    setItens((prev) => prev.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  const removerItem = (i: number) => setItens((prev) => prev.filter((_, idx) => idx !== i));

  /**
   * Vendas em espera.
   *
   * O cliente esqueceu a carteira no carro, ou volta para pegar mais uma
   * coisa — e a fila para junto. Antes disso a saída era anotar no papel ou
   * pedir para todo mundo esperar. Fica no aparelho porque é uma pausa de
   * minutos, e sobrevive ao F5 porque o navegador do balcão trava.
   */
  const CHAVE_ESPERA = "sistema-ti:vendas-em-espera";

  const lerEspera = (): { id: string; itens: ItemVenda[]; desconto: number; em: string }[] => {
    try {
      const v = JSON.parse(localStorage.getItem(CHAVE_ESPERA) || "[]");
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };
  const [espera, setEspera] = useState(lerEspera);
  const gravarEspera = (lista: typeof espera) => {
    setEspera(lista);
    try {
      localStorage.setItem(CHAVE_ESPERA, JSON.stringify(lista));
    } catch {
      /* aparelho sem armazenamento: a espera só não sobrevive ao F5 */
    }
  };

  const segurarVenda = () => {
    if (itens.length === 0) return aviso.alerta("Carrinho vazio.");
    gravarEspera([...espera, { id: uid(), itens, desconto, em: nowISO() }]);
    limpar();
    aviso.sucesso("Venda guardada. Chame o próximo.");
  };

  const retomarVenda = (id: string) => {
    const alvo = espera.find((e) => e.id === id);
    if (!alvo) return;
    // Carrinho aberto não pode ser sobrescrito em silêncio: são duas vendas
    // diferentes, e a atual sumiria sem aviso.
    if (itens.length > 0) {
      if (!confirm("O carrinho atual será guardado para você retomar depois. Continuar?")) {
        return;
      }
      gravarEspera([
        ...espera.filter((e) => e.id !== id),
        { id: uid(), itens, desconto, em: nowISO() },
      ]);
    } else {
      gravarEspera(espera.filter((e) => e.id !== id));
    }
    setItens(alvo.itens);
    setDesconto(alvo.desconto);
    focarBusca();
  };

  /**
   * Consulta de preço, sem lançar no carrinho.
   *
   * "Quanto é esse aqui?" no meio de outra venda obrigava a lançar o item,
   * ler o preço e tirar de novo — com risco real de esquecer de tirar e o
   * cliente pagar por algo que nem viu.
   */
  const consultarPreco = () => {
    const t = termo.trim();
    if (!t) return aviso.info("Passe o produto no leitor ou digite o nome, e aperte F3.");
    const p = buscarProduto(produtos, t) || sugestoes[0];
    if (!p) return aviso.alerta(`Nada encontrado para "${t}".`);
    const promo = promocaoValendo(p);
    aviso.info(
      `${p.nome}\n\n${brl(precoEfetivo(p))}${p.porPeso ? " por quilo" : ""}` +
        (promo ? `\nPromoção — de ${brl(p.preco)}` : "") +
        (p.servico ? "" : `\n${p.quantidade}${p.porPeso ? " kg" : " un"} em estoque`)
    );
    setTermo("");
    focarBusca();
  };

  const limpar = () => {
    setItens([]);
    setDesconto(0);
    setRecebido(undefined);
    setParcelas([]);
    setClienteId("");
    setTermo("");
    focarBusca();
  };

  const finalizar = async () => {
    if (itens.length === 0) return aviso.alerta("Carrinho vazio.");
    if (itens.some((i) => (Number(i.precoUnit) || 0) <= 0)) {
      return aviso.alerta("Tem item sem preço. Informe o valor antes de fechar.");
    }
    if (dividido) {
      const erro = problemaNoPagamento(total, parcelas);
      if (erro) return aviso.alerta(erro);
    } else if (forma === "dinheiro" && falta > 0 && recebido !== undefined) {
      return aviso.alerta(`Faltam ${brl(falta)} para fechar a venda.`);
    }
    if (gravando) return; // clique duplo no balcão acontece o tempo todo
    setGravando(true);

    const venda: Venda = {
      id: uid(),
      numero: proximoNumero,
      itens,
      desconto,
      formaPagamento: dividido ? formaPrincipal(parcelas) : forma,
      valorRecebido: forma === "dinheiro" ? recebido : undefined,
      pagamentos: dividido ? consolidar(parcelas) : undefined,
      clienteId: clienteId || undefined,
      sessaoId: sessao?.id,
      criadoEm: nowISO(),
    };

    try {
      // A ordem importa: dinheiro primeiro. Se algo falhar depois, sobra
      // lançamento sem baixa — que se conserta olhando o estoque. O
      // contrário some com a venda e ninguém percebe.
      // Um lançamento POR FORMA. O fechamento do caixa separa o dinheiro da
      // gaveta do que caiu na maquininha; um lançamento só, com a forma
      // "principal", jogaria os R$ 10 em espécie dentro do cartão.
      const formas = dividido
        ? consolidar(parcelas)
        : [{ forma, valor: total, recebido }];
      const custo = custoVenda(itens);
      let movimentoId = "";
      for (const [i, f] of formas.entries()) {
        const movimento: MovimentoCaixa = {
          id: uid(),
          tipo: "entrada",
          categoria: "Venda",
          descricao:
            `Venda ${venda.numero} (${itens.length} item(ns))` +
            (formas.length > 1 ? ` - ${f.forma}` : ""),
          valor: f.valor,
          formaPagamento: f.forma,
          clienteId: clienteId || undefined,
          // O custo vai INTEIRO no primeiro lançamento. Dividir o CMV entre
          // as formas de pagamento não significa nada e só dificultaria
          // conferir de onde saiu cada número.
          custoRelacionado: i === 0 ? custo : 0,
          data: nowISO(),
          sessaoId: sessao?.id,
        };
        await saveMovimento(movimento);
        if (i === 0) movimentoId = movimento.id;
      }
      await saveVenda({ ...venda, movimentoId });

      for (const item of itens) {
        if (!item.produtoId) continue;
        const p = produtos.find((x) => x.id === item.produtoId);
        if (!p || p.servico) continue;
        await saveProduto({
          ...p,
          quantidade: Math.max(0, (Number(p.quantidade) || 0) - (Number(item.quantidade) || 0)),
        });
      }

      setUltima({ ...venda, movimentoId });
      limpar();
      aviso.sucesso(
        troco > 0 ? `Venda registrada. Troco: ${brl(troco)}` : "Venda registrada."
      );
    } catch (e) {
      aviso.erro(
        "Não foi possível fechar a venda:\n\n" + (e instanceof Error ? e.message : String(e))
      );
    } finally {
      setGravando(false);
    }
  };

  finalizarRef.current = finalizar;
  limparRef.current = limpar;
  consultaRef.current = consultarPreco;

  const imprimir = (v: Venda) => {
    printHTML(
      reciboPDV(v, config, clientes.find((c) => c.id === v.clienteId)),
      `Venda ${v.numero}`,
      config.papelImpressao || "a4"
    );
  };

  return (
    <div>
      <SectionTitle
        title="Frente de caixa"
        subtitle={
          sessao
            ? "Leia o código ou digite o nome — F2 fecha, F3 consulta preço, F4 limpa"
            : "Caixa fechado — abra o caixa para a venda entrar no fechamento do dia"
        }
        action={
          <div className="flex flex-wrap gap-2">
            {ultima && (
              <button className="btn-secondary" onClick={() => imprimir(ultima)}>
                <Printer size={18} /> Cupom da venda {ultima.numero}
              </button>
            )}
            <button className="btn-secondary" onClick={segurarVenda}>
              <PauseCircle size={18} /> Guardar venda
            </button>
            <button className="btn-secondary" onClick={() => setDevolvendo(true)}>
              <Undo2 size={18} /> Devolução
            </button>
          </div>
        }
      />

      {devolvendo && <Devolucao onClose={() => setDevolvendo(false)} />}

      {/* Vendas guardadas ficam à vista: guardada e esquecida é mercadoria
          separada que nunca foi vendida. */}
      {espera.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 p-3">
          <span className="text-sm font-semibold text-brand-800">
            {espera.length} venda(s) guardada(s):
          </span>
          {espera.map((e) => (
            <span key={e.id} className="flex items-center gap-1">
              <button
                className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-200"
                onClick={() => retomarVenda(e.id)}
              >
                {e.itens.length} item(ns) · {brl(totalVenda({ itens: e.itens, desconto: e.desconto }))}
              </button>
              <button
                className="text-xs text-slate-400 hover:text-red-500"
                title="Descartar esta venda guardada"
                onClick={() => {
                  if (confirm("Descartar esta venda guardada?")) {
                    gravarEspera(espera.filter((x) => x.id !== e.id));
                  }
                }}
              >
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}

      {!sessao && (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          Nenhum caixa aberto. A venda é registrada assim mesmo, mas fica fora do
          fechamento do dia. Abra o caixa em Caixa para conferir certo depois.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ---------- Carrinho ---------- */}
        <div>
          <div className="card mb-3">
            <div className="relative">
              <Barcode size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={buscaRef}
                className="input !py-3 pl-11 text-base"
                placeholder="Código de barras, nome ou SKU"
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                onKeyDown={(e) => {
                  // O leitor termina a leitura com Enter, igual a um teclado.
                  if (e.key === "Enter") {
                    e.preventDefault();
                    lerCodigo();
                  }
                  if (e.key === "Escape") setTermo("");
                }}
              />
            </div>

            {termo.trim() !== "" && (
              <div className="mt-2 space-y-1">
                {sugestoes.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addProduto(p)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left hover:bg-slate-50"
                  >
                    {/* Com o balcão cheio, reconhecer pela foto é mais rápido
                        do que ler o nome de dez itens parecidos. */}
                    {p.imagemUrl && (
                      <img
                        src={p.imagemUrl}
                        alt=""
                        loading="lazy"
                        className="h-8 w-8 shrink-0 rounded border border-slate-200 object-cover"
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      <span className="text-sm font-medium text-slate-700">{p.nome}</span>
                      <span className="ml-2 text-xs text-slate-400">
                        {p.porPeso ? "por kg" : `${p.quantidade} un`}
                        {p.codigoBarras && ` · ${p.codigoBarras}`}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      {promocaoValendo(p) ? (
                        <>
                          <span className="block text-xs text-slate-400 line-through">
                            {brl(p.preco)}
                          </span>
                          <span className="block font-semibold text-emerald-600">
                            {brl(precoEfetivo(p))}
                          </span>
                        </>
                      ) : (
                        <span className="font-semibold text-slate-800">{brl(p.preco)}</span>
                      )}
                    </span>
                  </button>
                ))}
                <button
                  onClick={addAvulso}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-50"
                >
                  <Plus size={14} className="mr-1 inline" />
                  Lançar &quot;{termo.trim()}&quot; como item avulso
                </button>
              </div>
            )}
          </div>

          {itens.length === 0 ? (
            <EmptyState
              icon={<ShoppingCart size={48} />}
              title="Carrinho vazio"
              hint="Passe o produto no leitor ou digite o nome para começar."
            />
          ) : (
            <div className="space-y-2">
              {itens.map((item, i) => {
                const prod = produtos.find((p) => p.id === item.produtoId);
                const val = prod ? situacaoValidade(prod) : "sem_validade";
                return (
                  <div key={i} className="card flex flex-wrap items-center gap-3 !p-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate font-semibold text-slate-800">
                        {item.descricao}
                        {item.porPeso && (
                          <span className="badge bg-blue-100 text-blue-700">
                            <Scale size={11} /> kg
                          </span>
                        )}
                        {(val === "vencido" || val === "vence_perto") && (
                          <span className={`badge ${VALIDADE_META[val].cor}`}>
                            {VALIDADE_META[val].label}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400">
                        {brl(item.precoUnit)} {item.porPeso ? "por kg" : "cada"}
                      </p>
                    </div>

                    {/* Quantidade: no peso, campo livre; no resto, mais e menos */}
                    {item.porPeso ? (
                      <div className="flex items-center gap-1">
                        <InputNumero
                          className="input !w-24 !py-1.5 text-sm"
                          value={item.quantidade}
                          onChange={(v) => mudarItem(i, { quantidade: v ?? 0 })}
                        />
                        <span className="text-xs text-slate-400">kg</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button
                          className="btn-ghost !p-1.5"
                          onClick={() =>
                            mudarItem(i, { quantidade: Math.max(1, item.quantidade - 1) })
                          }
                        >
                          <Minus size={14} />
                        </button>
                        <span className="w-8 text-center text-sm font-semibold">
                          {item.quantidade}
                        </span>
                        <button
                          className="btn-ghost !p-1.5"
                          onClick={() => mudarItem(i, { quantidade: item.quantidade + 1 })}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    )}

                    {/* Preço editável: item avulso nasce sem valor */}
                    <InputNumero
                      className="input !w-24 !py-1.5 text-sm"
                      value={item.precoUnit}
                      onChange={(v) => mudarItem(i, { precoUnit: v ?? 0 })}
                    />

                    <span className="w-24 text-right font-bold text-slate-800">
                      {brl(subtotalItem(item))}
                    </span>

                    <button
                      className="btn-ghost !p-1.5 text-red-500"
                      title="Tirar do carrinho"
                      onClick={() => removerItem(i)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ---------- Fechamento ---------- */}
        <div className="card lg:sticky lg:top-4 lg:self-start">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-sm text-slate-500">
              {itens.length} item(ns)
            </span>
            {itens.length > 0 && (
              <button className="text-xs text-slate-400 hover:text-red-500" onClick={limpar}>
                <X size={12} className="mr-0.5 inline" /> Limpar
              </button>
            )}
          </div>

          <div className="mb-3 border-b border-slate-200 pb-3">
            <div className="flex justify-between py-0.5 text-sm">
              <span className="text-slate-600">Subtotal</span>
              <span className="font-semibold">{brl(bruto)}</span>
            </div>
            <div className="flex items-center justify-between py-0.5 text-sm">
              <span className="text-slate-600">Desconto</span>
              <InputNumero
                className="input !w-24 !py-1 text-right text-sm"
                value={desconto}
                onChange={(v) => setDesconto(v ?? 0)}
              />
            </div>
          </div>

          <p className="text-xs uppercase tracking-wide text-slate-400">Total</p>
          <p className="mb-4 text-4xl font-bold text-slate-800">{brl(total)}</p>

          {!dividido ? (
            <>
              <div className="mb-3 grid grid-cols-2 gap-2">
                {FORMAS.map((f) => (
                  <button
                    key={f.k}
                    onClick={() => setForma(f.k)}
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                      forma === f.k
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {f.nome}
                  </button>
                ))}
              </div>

              {/* Troco só no dinheiro: no cartão não existe troco */}
              {forma === "dinheiro" && (
                <div className="mb-3">
                  <label className="label">Valor recebido</label>
                  <InputNumero
                    className="input"
                    placeholder={brl(total)}
                    value={recebido}
                    onChange={setRecebido}
                  />
                  {recebido !== undefined && (
                    <p
                      className={`mt-1 text-lg font-bold ${
                        falta > 0 ? "text-red-600" : "text-emerald-600"
                      }`}
                    >
                      {falta > 0 ? `Falta ${brl(falta)}` : `Troco ${brl(troco)}`}
                    </p>
                  )}
                </div>
              )}

              {/* Dividir é exceção: fica atrás de um clique para não deixar
                  a venda normal mais lenta por causa dela. */}
              <button
                className="mb-3 text-xs text-brand-600 underline"
                onClick={() =>
                  setParcelas([
                    { forma, valor: total },
                    { forma: forma === "dinheiro" ? "pix" : "dinheiro", valor: 0 },
                  ])
                }
              >
                Dividir em mais de uma forma
              </button>
            </>
          ) : (
            <div className="mb-3 space-y-2">
              <div className="flex items-center justify-between">
                <label className="label !mb-0">Formas de pagamento</label>
                <button
                  className="text-xs text-slate-500 underline"
                  onClick={() => setParcelas([])}
                >
                  Voltar para uma forma
                </button>
              </div>

              {parcelas.map((pc, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <select
                    className="input !w-auto !py-1.5 flex-1 text-sm"
                    value={pc.forma}
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
                  <div className="w-28">
                    <InputNumero
                      className="input !py-1.5 text-sm"
                      value={pc.valor}
                      onChange={(v) =>
                        setParcelas((x) =>
                          x.map((y, n) => (n === i ? { ...y, valor: v ?? 0 } : y))
                        )
                      }
                    />
                  </div>
                  {parcelas.length > 2 && (
                    <button
                      className="text-slate-400 hover:text-red-500"
                      onClick={() => setParcelas((v) => v.filter((_, n) => n !== i))}
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
              ))}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  className="btn-secondary !py-1 text-xs"
                  onClick={() => setParcelas((v) => [...v, { forma: "dinheiro", valor: falta }])}
                >
                  <Plus size={13} /> Outra forma
                </button>
                {falta > 0 && (
                  <button
                    className="btn-secondary !py-1 text-xs"
                    onClick={() =>
                      setParcelas((v) =>
                        v.map((x, n) =>
                          n === v.length - 1 ? { ...x, valor: (Number(x.valor) || 0) + falta } : x
                        )
                      )
                    }
                  >
                    Completar {brl(falta)} na última
                  </button>
                )}
              </div>

              {/* Recebido em espécie: é o único lugar de onde sai troco */}
              {parcelas.some((x) => x.forma === "dinheiro") && (
                <div>
                  <label className="label">Recebido em dinheiro</label>
                  <InputNumero
                    className="input !py-1.5 text-sm"
                    placeholder={brl(
                      parcelas
                        .filter((x) => x.forma === "dinheiro")
                        .reduce((s, x) => s + (Number(x.valor) || 0), 0)
                    )}
                    value={parcelas.find((x) => x.forma === "dinheiro")?.recebido}
                    onChange={(v) =>
                      setParcelas((lista) => {
                        const i = lista.findIndex((x) => x.forma === "dinheiro");
                        return lista.map((x, n) => (n === i ? { ...x, recebido: v } : x));
                      })
                    }
                  />
                </div>
              )}

              <p
                className={`text-lg font-bold ${
                  falta > 0 ? "text-red-600" : troco > 0 ? "text-emerald-600" : "text-slate-600"
                }`}
              >
                {falta > 0
                  ? `Falta ${brl(falta)}`
                  : troco > 0
                    ? `Troco ${brl(troco)}`
                    : "Pagamento fechado"}
              </p>

              {problemaNoPagamento(total, parcelas) && falta === 0 && (
                <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
                  {problemaNoPagamento(total, parcelas)}
                </p>
              )}
            </div>
          )}

          {clientes.length > 0 && (
            <div className="mb-3">
              <label className="label">Cliente (opcional)</label>
              <select
                className="input"
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
              >
                <option value="">Sem cliente</option>
                {[...clientes]
                  .sort((a, b) => txt(a.nome).localeCompare(txt(b.nome)))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
              </select>
            </div>
          )}

          <button
            className="btn-success w-full !py-3 text-base"
            disabled={itens.length === 0 || gravando}
            onClick={finalizar}
          >
            <CheckCircle2 size={20} /> {gravando ? "Registrando..." : "Fechar venda"}
          </button>
        </div>
      </div>
    </div>
  );
};
