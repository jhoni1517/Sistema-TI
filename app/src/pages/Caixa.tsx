import React, { useMemo, useState } from "react";
import { aviso } from "../components/Aviso";
import {
  Plus,
  ArrowDownCircle,
  ArrowUpCircle,
  Scissors,
  Wallet,
  Lock,
  Unlock,
  Trash2,
  Printer,
  Search,
  Receipt,
  History,
  ListOrdered,
} from "lucide-react";
import { useApp } from "../store/AppStore";
import { Modal, Field, SectionTitle, EmptyState, InputNumero } from "../components/ui";
import { sangriaSugerida } from "../lib/desempenho";
import { uid, nowISO, brl, formatDate, formatDateTime, txt } from "../lib/format";
import { printHTML } from "../lib/print";
import { reciboFechamento, reciboVenda } from "../lib/recibo";
import {
  resumoCaixa,
  movimentosDaSessao,
  sessoesFechadas,
  sessaoAberta as achaSessaoAberta,
  conferencia,
  CONFERENCIA_META,
} from "../lib/caixa";
import type { MovimentoCaixa, TipoMovimento, FormaPagamento, SessaoCaixa, Produto, Cliente } from "../lib/types";

const CATS_ENTRADA = ["Venda", "Serviço", "OS", "Sinal / Entrada", "Outro"];
const CATS_SAIDA = ["Despesa", "Compra de peça", "Fornecedor", "Aluguel", "Energia", "Água", "Internet", "Salário", "Marketing", "Outro"];

interface Extra {
  produtoId?: string;
  quantidade?: number;
  baixa?: boolean;
  custo?: number;
}

export const Caixa: React.FC = () => {
  const { movimentos, sessoes, produtos, clientes, config, saveMovimento, removeMovimento, saveSessao, saveProduto } = useApp();
  const [modal, setModal] = useState<TipoMovimento | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const [fechando, setFechando] = useState(false);
  const [aba, setAba] = useState<"movimentos" | "fechamentos">("movimentos");
  const [verSessao, setVerSessao] = useState<SessaoCaixa | null>(null);

  const sessaoAberta = useMemo(() => achaSessaoAberta(sessoes), [sessoes]);

  const movsSessao = useMemo(
    () => movimentosDaSessao(sessaoAberta, movimentos),
    [movimentos, sessaoAberta]
  );

  const resumo = useMemo(
    () => resumoCaixa(sessaoAberta, movsSessao),
    [sessaoAberta, movsSessao]
  );
  const { entradas, saidas, sangrias, abertura, saldo } = resumo;

  const fechadas = useMemo(() => sessoesFechadas(sessoes), [sessoes]);

  const listaMovs = useMemo(
    () => [...movimentos].sort((a, b) => txt(b.data).localeCompare(txt(a.data))).slice(0, 100),
    [movimentos]
  );

  const abrirCaixa = async (valor: number) => {
    const s: SessaoCaixa = { id: uid(), abertoEm: nowISO(), valorAbertura: valor };
    await saveSessao(s);
    setAbrindo(false);
  };

  const confirmarFechamento = async (contado?: number) => {
    if (!sessaoAberta) return;
    try {
      await saveSessao({
        ...sessaoAberta,
        fechadoEm: nowISO(),
        valorFechamento: saldo,
        // Só grava a contagem se a pessoa realmente contou. Gravar o saldo
        // calculado aqui faria o sistema concordar consigo mesmo para sempre
        // e a quebra de caixa nunca apareceria.
        valorContado: typeof contado === "number" ? contado : undefined,
      });
      setFechando(false);
      aviso.sucesso("Caixa fechado. O resumo fica guardado na aba Fechamentos.");
    } catch (e) {
      aviso.erro(
        "Não foi possível fechar o caixa:\n\n" + (e instanceof Error ? e.message : String(e))
      );
    }
  };

  const imprimirResumo = () => {
    printHTML(
      reciboFechamento(sessaoAberta, movsSessao, config),
      "Fechamento de caixa",
      config.papelImpressao || "a4"
    );
  };

  /** Recibo da compra, para o cliente levar. Nada de despesa nem sangria. */
  const imprimirVenda = (m: MovimentoCaixa) => {
    const cli = clientes.find((c) => c.id === m.clienteId);
    printHTML(reciboVenda(m, config, cli), "Recibo de venda", config.papelImpressao || "a4");
  };

  const imprimirFechamentoAntigo = (s: SessaoCaixa) => {
    printHTML(
      reciboFechamento(s, movimentosDaSessao(s, movimentos), config),
      "Fechamento de caixa",
      config.papelImpressao || "a4"
    );
  };

  return (
    <div>
      <SectionTitle
        title="Caixa"
        subtitle={sessaoAberta ? `Caixa aberto em ${formatDateTime(sessaoAberta.abertoEm)}` : "Caixa fechado (mostrando o dia)"}
        action={
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={imprimirResumo}><Printer size={16} /> Imprimir resumo</button>
            {sessaoAberta ? (
              <button className="btn-danger" onClick={() => setFechando(true)}><Lock size={16} /> Fechar caixa</button>
            ) : (
              <button className="btn-success" onClick={() => setAbrindo(true)}><Unlock size={16} /> Abrir caixa</button>
            )}
          </div>
        }
      />

      {/* Saldo e resumo */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card bg-gradient-to-br from-brand-600 to-brand-800 text-white ring-brand-700">
          <p className="flex items-center gap-2 text-sm text-brand-100"><Wallet size={16} /> Saldo em caixa</p>
          <p className="mt-1 text-3xl font-bold">{brl(saldo)}</p>
          {(() => {
            // Loja de bairro guarda o dia inteiro em espécie sem pensar. O
            // limite não é sobre desconfiar de ninguém: é sobre quanto se
            // perde num assalto.
            const s = sangriaSugerida(saldo, config.limiteGaveta || 0);
            if (!s.passou) return null;
            return (
              <p className="mt-2 rounded-lg bg-amber-400/20 p-2 text-xs">
                Passou {brl(s.excedente)} do limite da gaveta.
                {s.sugestao > 0 && <> Sugestão: sangrar <b>{brl(s.sugestao)}</b>.</>}
              </p>
            );
          })()}
          <p className="mt-1 text-xs text-brand-200">Abertura: {brl(abertura)}</p>
        </div>
        <Resumo label="Entradas" value={entradas} color="text-emerald-600" icon={<ArrowDownCircle size={18} className="text-emerald-600" />} />
        <Resumo label="Saídas" value={saidas} color="text-red-600" icon={<ArrowUpCircle size={18} className="text-red-600" />} />
        <Resumo label="Sangrias" value={sangrias} color="text-amber-600" icon={<Scissors size={18} className="text-amber-600" />} />
      </div>

      {/* Ações */}
      <div className="mb-6 flex flex-wrap gap-3">
        <button className="btn-success" onClick={() => setModal("entrada")}><Plus size={16} /> Entrada / Venda</button>
        <button className="btn-danger" onClick={() => setModal("saida")}><ArrowUpCircle size={16} /> Saída / Despesa</button>
        <button className="btn-secondary" onClick={() => setModal("sangria")}><Scissors size={16} /> Sangria</button>
      </div>

      {/* Abas: o dia a dia e o histórico de conferência */}
      <div className="mb-4 flex gap-2">
        {([
          { k: "movimentos", nome: "Movimentações", icon: <ListOrdered size={15} /> },
          { k: "fechamentos", nome: `Fechamentos (${fechadas.length})`, icon: <History size={15} /> },
        ] as const).map((t) => (
          <button
            key={t.k}
            onClick={() => setAba(t.k)}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              aba === t.k
                ? "bg-brand-600 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {t.icon} {t.nome}
          </button>
        ))}
      </div>

      {aba === "fechamentos" ? (
        <Fechamentos
          sessoes={fechadas}
          movimentos={movimentos}
          onVer={setVerSessao}
          onImprimir={imprimirFechamentoAntigo}
        />
      ) : (
      <>
      {listaMovs.length === 0 ? (
        <EmptyState icon={<Wallet size={48} />} title="Nenhuma movimentação" hint="Registre entradas e saídas do caixa." />
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">Descrição</th>
                <th className="px-4 py-3">Forma</th>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {listaMovs.map((m) => (
                <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {m.tipo === "entrada" ? (
                        <ArrowDownCircle size={16} className="text-emerald-500" />
                      ) : m.tipo === "sangria" ? (
                        <Scissors size={16} className="text-amber-500" />
                      ) : (
                        <ArrowUpCircle size={16} className="text-red-500" />
                      )}
                      <div>
                        <p className="font-medium text-slate-800">{m.descricao}</p>
                        <p className="text-xs text-slate-400">{m.categoria}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 capitalize text-slate-500">{m.formaPagamento}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(m.data)}</td>
                  <td className={`px-4 py-3 text-right font-bold ${m.tipo === "entrada" ? "text-emerald-600" : "text-red-600"}`}>
                    {m.tipo === "entrada" ? "+" : "-"} {brl(m.valor)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      {/* Recibo só de venda: despesa e sangria são conta da
                          loja, não têm o que entregar para cliente nenhum. */}
                      {m.tipo === "entrada" && (
                        <button
                          className="btn-ghost !p-1.5 text-brand-600"
                          title="Imprimir recibo para o cliente"
                          onClick={() => imprimirVenda(m)}
                        >
                          <Receipt size={14} />
                        </button>
                      )}
                      <button className="btn-ghost !p-1.5 text-red-400" title="Excluir" onClick={() => { if (confirm("Excluir movimentação?")) removeMovimento(m.id); }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </>
      )}

      <AbrirCaixaModal open={abrindo} onClose={() => setAbrindo(false)} onConfirm={abrirCaixa} />

      <MovimentoModal
        tipo={modal}
        produtos={produtos}
        clientes={clientes}
        onClose={() => setModal(null)}
        onSave={async (m, extra) => {
          try {
            // Lança o dinheiro primeiro e só então mexe no estoque. Se algo
            // falhar, o erro APARECE — antes a falha era engolida e sobrava
            // baixa de estoque sem lançamento correspondente no caixa.
            await saveMovimento({ ...m, sessaoId: sessaoAberta?.id, custoRelacionado: extra?.custo });
            if (extra?.baixa && extra.produtoId) {
              const prod = produtos.find((p) => p.id === extra.produtoId);
              if (prod && !prod.servico) {
                await saveProduto({
                  ...prod,
                  quantidade: Math.max(0, prod.quantidade - (extra.quantidade || 1)),
                });
              }
            }
            setModal(null);
            aviso.sucesso(
              `${m.tipo === "entrada" ? "Entrada" : m.tipo === "sangria" ? "Sangria" : "Saída"} de ${brl(m.valor)} registrada.`
            );
          } catch (e) {
            aviso.erro(
              "Não foi possível registrar no caixa:\n\n" +
                (e instanceof Error ? e.message : String(e))
            );
          }
        }}
      />

      {verSessao && (
        <DetalheFechamento
          sessao={verSessao}
          movimentos={movimentos}
          onClose={() => setVerSessao(null)}
          onImprimir={() => imprimirFechamentoAntigo(verSessao)}
        />
      )}

      {/* Fechamento de caixa */}
      {fechando && sessaoAberta && (
        <FecharCaixaModal
          abertura={abertura}
          entradas={entradas}
          saidas={saidas}
          sangrias={sangrias}
          saldo={saldo}
          movs={movsSessao}
          onImprimir={imprimirResumo}
          onClose={() => setFechando(false)}
          onConfirm={confirmarFechamento}
        />
      )}
    </div>
  );
};

const Resumo: React.FC<{ label: string; value: number; color: string; icon: React.ReactNode }> = ({ label, value, color, icon }) => (
  <div className="card">
    <p className="flex items-center gap-2 text-sm text-slate-500">{icon} {label}</p>
    <p className={`mt-1 text-2xl font-bold ${color}`}>{brl(value)}</p>
  </div>
);

const AbrirCaixaModal: React.FC<{ open: boolean; onClose: () => void; onConfirm: (v: number) => void }> = ({ open, onClose, onConfirm }) => {
  const [valor, setValor] = useState(0);
  return (
    <Modal open={open} onClose={onClose} title="Abrir caixa" maxWidth="max-w-md"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-success" onClick={() => onConfirm(valor)}>Abrir caixa</button></>}
    >
      <Field label="Valor de abertura (troco inicial)">
        <InputNumero autoFocus value={valor} onChange={(v) => setValor(v ?? 0)} />
      </Field>
    </Modal>
  );
};

// ====== Modal de movimentação (entrada/saída/sangria) ======
const MovimentoModal: React.FC<{
  tipo: TipoMovimento | null;
  produtos: Produto[];
  clientes: Cliente[];
  onClose: () => void;
  onSave: (m: MovimentoCaixa, extra?: Extra) => void;
}> = ({ tipo, produtos, clientes, onClose, onSave }) => {
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState(0);
  const [categoria, setCategoria] = useState("");
  const [catCustom, setCatCustom] = useState("");
  const [forma, setForma] = useState<FormaPagamento>("dinheiro");
  // produto
  const [prodId, setProdId] = useState("");
  const [prodCusto, setProdCusto] = useState(0);
  const [quantidade, setQuantidade] = useState(1);
  const [baixa, setBaixa] = useState(true);
  const [buscaProd, setBuscaProd] = useState("");
  const [abertoProd, setAbertoProd] = useState(false);
  const [clienteId, setClienteId] = useState("");

  React.useEffect(() => {
    if (tipo) {
      setDescricao("");
      setValor(0);
      setCategoria(tipo === "entrada" ? "Venda" : tipo === "sangria" ? "Sangria" : "Despesa");
      setCatCustom("");
      setForma("dinheiro");
      setProdId("");
      setProdCusto(0);
      setQuantidade(1);
      setBaixa(true);
      setBuscaProd("");
      setClienteId("");
    }
  }, [tipo]);

  if (!tipo) return null;
  const titulo = tipo === "entrada" ? "Nova entrada / venda" : tipo === "sangria" ? "Sangria (retirada)" : "Saída / Despesa";
  const cats = tipo === "entrada" ? CATS_ENTRADA : CATS_SAIDA;

  const pickProduto = (p: Produto) => {
    setProdId(p.id);
    setDescricao(p.nome);
    setProdCusto(p.custo || 0);
    setValor((p.preco || 0) * quantidade);
    setCategoria("Venda");
    setBuscaProd(p.nome);
    setAbertoProd(false);
  };
  const setQtd = (q: number) => {
    setQuantidade(q);
    if (prodId) {
      const p = produtos.find((x) => x.id === prodId);
      if (p) setValor((p.preco || 0) * q);
    }
  };

  const filtroProd = produtos
    .filter(
      (p) =>
        txt(p.nome).toLowerCase().includes(buscaProd.toLowerCase()) ||
        txt(p.sku).toLowerCase().includes(buscaProd.toLowerCase())
    )
    .slice(0, 8);

  const salvar = () => {
    if (valor <= 0) return aviso.alerta("Informe um valor válido.");
    const catFinal = categoria === "Outro" ? catCustom.trim() || "Outro" : categoria;
    onSave(
      {
        id: uid(),
        tipo,
        categoria: catFinal || (tipo === "entrada" ? "Venda" : "Despesa"),
        descricao: descricao || titulo,
        valor,
        formaPagamento: forma,
        clienteId: tipo === "entrada" && clienteId ? clienteId : undefined,
        // Compra de peça é reposição de estoque, não despesa do mês: o custo
        // entra no resultado quando a peça for vendida.
        compraEstoque:
          tipo === "saida" &&
          ["Compra de peça", "Fornecedor"].includes(categoria),
        data: nowISO(),
      },
      tipo === "entrada" && prodId ? { produtoId: prodId, quantidade, baixa, custo: prodCusto * quantidade } : undefined
    );
  };

  return (
    <Modal open={!!tipo} onClose={onClose} title={titulo} maxWidth="max-w-md"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className={tipo === "entrada" ? "btn-success" : "btn-primary"} onClick={salvar}>Registrar</button></>}
    >
      <div className="space-y-4">
        {/* Busca de produto (só entrada) */}
        {tipo === "entrada" && produtos.length > 0 && (
          <Field label="Buscar produto do estoque (opcional)">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-9"
                placeholder="Digite o nome do produto..."
                value={buscaProd}
                onChange={(e) => { setBuscaProd(e.target.value); setAbertoProd(true); if (!e.target.value) setProdId(""); }}
                onFocus={() => setAbertoProd(true)}
                onBlur={() => setTimeout(() => setAbertoProd(false), 150)}
              />
              {abertoProd && filtroProd.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg bg-white shadow-lg ring-1 ring-slate-200">
                  {filtroProd.map((p) => (
                    <button key={p.id} type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50" onMouseDown={() => pickProduto(p)}>
                      <span className="text-slate-700">{p.nome}</span>
                      <span className="font-semibold text-emerald-600">{brl(p.preco)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Field>
        )}

        {/* Quantidade + baixa quando há produto */}
        {tipo === "entrada" && prodId && (
          <div className="grid grid-cols-2 items-end gap-4">
            <Field label="Quantidade">
              <InputNumero min={1} value={quantidade} onChange={(v) => setQtd(Math.max(1, v ?? 1))} />
            </Field>
            <label className="flex items-center gap-2 pb-2 text-sm text-slate-600">
              <input type="checkbox" className="h-4 w-4" checked={baixa} onChange={(e) => setBaixa(e.target.checked)} />
              Dar baixa no estoque
            </label>
          </div>
        )}

        <Field label="Descrição">
          <input className="input" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={tipo === "sangria" ? "Retirada para banco..." : "Ex: Venda de película"} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Valor (R$)">
            <InputNumero value={valor} onChange={(v) => setValor(v ?? 0)} />
          </Field>
          {tipo !== "sangria" && (
            <Field label="Categoria">
              <select className="input" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                {cats.map((c) => (<option key={c} value={c}>{c}</option>))}
              </select>
            </Field>
          )}
        </div>

        {tipo !== "sangria" && categoria === "Outro" && (
          <Field label="Qual categoria?">
            <input className="input" value={catCustom} onChange={(e) => setCatCustom(e.target.value)} placeholder="Digite a categoria" />
          </Field>
        )}

        {tipo !== "sangria" && (
          <Field label="Forma de pagamento">
            <select className="input" value={forma} onChange={(e) => setForma(e.target.value as FormaPagamento)}>
              <option value="dinheiro">Dinheiro</option>
              <option value="pix">Pix</option>
              <option value="debito">Débito</option>
              <option value="credito">Crédito</option>
              <option value="transferencia">Transferência</option>
              <option value="outro">Outro</option>
            </select>
          </Field>
        )}

        {/* Cliente é opcional: no balcão, parar a fila para cadastrar
            alguém que só quer um cabo é o caminho para ninguém usar. Quando
            informado, o nome sai no recibo. */}
        {tipo === "entrada" && clientes.length > 0 && (
          <Field label="Cliente (opcional, sai no recibo)">
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
          </Field>
        )}
      </div>
    </Modal>
  );
};

// ====== Modal de fechamento de caixa ======
const FecharCaixaModal: React.FC<{
  abertura: number;
  entradas: number;
  saidas: number;
  sangrias: number;
  saldo: number;
  movs: MovimentoCaixa[];
  onImprimir: () => void;
  onClose: () => void;
  onConfirm: (contado?: number) => void;
}> = ({ abertura, entradas, saidas, sangrias, saldo, movs, onImprimir, onClose, onConfirm }) => {
  const formas = useMemo(() => {
    const map: Record<string, number> = {};
    movs.filter((m) => m.tipo === "entrada").forEach((m) => (map[m.formaPagamento] = (map[m.formaPagamento] || 0) + m.valor));
    return Object.entries(map);
  }, [movs]);

  // Texto, e não número, porque campo vazio precisa ser diferente de zero:
  // "não contei" e "contei e deu zero" são conclusões bem diferentes.
  const [contadoTxt, setContadoTxt] = useState("");
  const contado = contadoTxt.trim() === "" ? undefined : Number(contadoTxt.replace(",", "."));
  const invalido = contado !== undefined && Number.isNaN(contado);
  const diferenca = contado === undefined || invalido ? undefined : Math.round((contado - saldo) * 100) / 100 + 0;

  return (
    <Modal open onClose={onClose} title="Fechamento de caixa" maxWidth="max-w-lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onImprimir}><Printer size={16} /> Imprimir</button>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-danger" disabled={invalido} onClick={() => onConfirm(contado)}><Lock size={16} /> Confirmar fechamento</button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-50 p-4">
          <Linha label="Abertura (troco)" value={brl(abertura)} />
          <Linha label="Entradas" value={`+ ${brl(entradas)}`} cls="text-emerald-600" />
          <Linha label="Saídas / despesas" value={`- ${brl(saidas)}`} cls="text-red-600" />
          <Linha label="Sangrias" value={`- ${brl(sangrias)}`} cls="text-amber-600" />
          <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 text-lg font-bold">
            <span>Saldo esperado em caixa</span><span>{brl(saldo)}</span>
          </div>
        </div>

        <div>
          <p className="label">Entradas por forma de pagamento</p>
          {formas.length === 0 ? (
            <p className="text-sm text-slate-400">Sem entradas.</p>
          ) : (
            <div className="rounded-lg border border-slate-200 p-3">
              {formas.map(([f, v]) => (
                <div key={f} className="flex justify-between py-0.5 text-sm">
                  <span className="capitalize text-slate-600">{f}</span>
                  <span className="font-semibold text-slate-800">{brl(v)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Contagem da gaveta: é o que transforma o fechamento em conferência
            de verdade. Sem isso o sistema só concorda consigo mesmo. */}
        <div>
          <label className="label">Dinheiro contado na gaveta (opcional)</label>
          <input
            className="input"
            inputMode="decimal"
            placeholder={`Esperado: ${brl(saldo)}`}
            value={contadoTxt}
            onChange={(e) => setContadoTxt(e.target.value)}
          />
          {invalido && (
            <p className="mt-1 text-xs font-medium text-red-600">
              Valor inválido. Use apenas números, com vírgula nos centavos.
            </p>
          )}
          {diferenca !== undefined && (
            <p
              className={`mt-1 text-sm font-semibold ${
                Math.abs(diferenca) <= 0.5
                  ? "text-emerald-600"
                  : diferenca > 0
                    ? "text-amber-600"
                    : "text-red-600"
              }`}
            >
              {Math.abs(diferenca) <= 0.5
                ? "Bateu com o esperado."
                : diferenca > 0
                  ? `Sobrou ${brl(diferenca)} na gaveta.`
                  : `Faltou ${brl(Math.abs(diferenca))} na gaveta.`}
            </p>
          )}
          <p className="mt-1 text-xs text-slate-400">
            Em branco, o caixa fecha sem conferência — e a diferença do dia
            não fica registrada.
          </p>
        </div>
      </div>
    </Modal>
  );
};

/**
 * Histórico de fechamentos.
 *
 * Antes o caixa só abria e fechava: a sessão de ontem sumia da tela e não
 * havia como conferir depois. Quem precisa bater o dinheiro no fim do dia —
 * ou explicar uma diferença três dias atrás — não tinha onde olhar.
 */
const Fechamentos: React.FC<{
  sessoes: SessaoCaixa[];
  movimentos: MovimentoCaixa[];
  onVer: (s: SessaoCaixa) => void;
  onImprimir: (s: SessaoCaixa) => void;
}> = ({ sessoes, movimentos, onVer, onImprimir }) => {
  if (sessoes.length === 0) {
    return (
      <EmptyState
        icon={<History size={48} />}
        title="Nenhum caixa fechado ainda"
        hint="Ao fechar o caixa, o resumo do dia fica guardado aqui para conferência."
      />
    );
  }
  return (
    <div className="space-y-2">
      {sessoes.map((s) => {
        const r = resumoCaixa(s, movimentosDaSessao(s, movimentos));
        const conf = conferencia(r);
        return (
          <div key={s.id} className="card flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-800">
                {formatDate(s.abertoEm)}
                <span className={`badge ${CONFERENCIA_META[conf].cor}`}>
                  {CONFERENCIA_META[conf].label}
                  {r.diferenca !== undefined && conf !== "certo" && (
                    <> {r.diferenca > 0 ? "+" : "-"} {brl(Math.abs(r.diferenca))}</>
                  )}
                </span>
              </p>
              <p className="text-xs text-slate-500">
                {formatDateTime(s.abertoEm)} até {s.fechadoEm ? formatDateTime(s.fechadoEm) : "-"}
                {" · "}
                {r.quantidade} movimentação(ões)
              </p>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <span className="text-emerald-600">+ {brl(r.entradas)}</span>
              <span className="text-red-600">- {brl(r.saidas + r.sangrias)}</span>
              <span className="font-bold text-slate-800">{brl(r.saldo)}</span>
            </div>

            <div className="flex gap-1">
              <button className="btn-secondary !py-1.5 text-xs" onClick={() => onVer(s)}>
                Ver
              </button>
              <button className="btn-ghost !p-2" title="Imprimir" onClick={() => onImprimir(s)}>
                <Printer size={15} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

/** Detalhe de um fechamento antigo, com a lista completa de movimentos */
const DetalheFechamento: React.FC<{
  sessao: SessaoCaixa;
  movimentos: MovimentoCaixa[];
  onClose: () => void;
  onImprimir: () => void;
}> = ({ sessao, movimentos, onClose, onImprimir }) => {
  const movs = movimentosDaSessao(sessao, movimentos);
  const r = resumoCaixa(sessao, movs);
  const conf = conferencia(r);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Caixa de ${formatDate(sessao.abertoEm)}`}
      maxWidth="max-w-2xl"
      footer={
        <>
          <button className="btn-secondary" onClick={onImprimir}>
            <Printer size={16} /> Imprimir
          </button>
          <button className="btn-primary" onClick={onClose}>
            Fechar
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          Aberto em {formatDateTime(sessao.abertoEm)} · fechado em{" "}
          {sessao.fechadoEm ? formatDateTime(sessao.fechadoEm) : "-"}
        </p>

        <div className="rounded-xl bg-slate-50 p-4">
          <Linha label="Abertura (troco)" value={brl(r.abertura)} />
          <Linha label="Entradas" value={`+ ${brl(r.entradas)}`} cls="text-emerald-600" />
          <Linha label="Saídas / despesas" value={`- ${brl(r.saidas)}`} cls="text-red-600" />
          <Linha label="Sangrias" value={`- ${brl(r.sangrias)}`} cls="text-amber-600" />
          <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 text-lg font-bold">
            <span>Saldo esperado</span>
            <span>{brl(r.saldo)}</span>
          </div>
          {r.contado !== undefined && (
            <>
              <Linha label="Contado na gaveta" value={brl(r.contado)} />
              <div className="mt-1 flex items-center justify-between">
                <span className={`badge ${CONFERENCIA_META[conf].cor}`}>
                  {CONFERENCIA_META[conf].label}
                </span>
                <span className="font-bold text-slate-700">
                  {(r.diferenca || 0) > 0 ? "+" : (r.diferenca || 0) < 0 ? "-" : ""}{" "}
                  {brl(Math.abs(r.diferenca || 0))}
                </span>
              </div>
            </>
          )}
        </div>

        {Object.keys(r.porForma).length > 0 && (
          <div>
            <p className="label">Entradas por forma de pagamento</p>
            <div className="rounded-lg border border-slate-200 p-3">
              {Object.entries(r.porForma).map(([f, v]) => (
                <div key={f} className="flex justify-between py-0.5 text-sm">
                  <span className="capitalize text-slate-600">{f}</span>
                  <span className="font-semibold text-slate-800">{brl(v)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="label">Movimentações ({movs.length})</p>
          {movs.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhuma movimentação nesta sessão.</p>
          ) : (
            <div className="max-h-72 overflow-y-auto overscroll-contain rounded-lg border border-slate-200">
              {[...movs]
                .sort((a, b) => txt(a.data).localeCompare(txt(b.data)))
                .map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-sm last:border-0"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <span className="text-slate-700">{m.descricao}</span>
                      <span className="ml-2 text-xs text-slate-400">
                        {formatDateTime(m.data)}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 font-semibold ${
                        m.tipo === "entrada" ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {m.tipo === "entrada" ? "+" : "-"} {brl(m.valor)}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

const Linha: React.FC<{ label: string; value: string; cls?: string }> = ({ label, value, cls }) => (
  <div className="flex justify-between py-0.5 text-sm">
    <span className="text-slate-600">{label}</span>
    <span className={`font-semibold ${cls || "text-slate-800"}`}>{value}</span>
  </div>
);
