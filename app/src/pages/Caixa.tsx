import React, { useMemo, useState } from "react";
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
} from "lucide-react";
import { useApp } from "../store/AppStore";
import { Modal, Field, SectionTitle, EmptyState } from "../components/ui";
import { uid, nowISO, brl, formatDateTime, isToday } from "../lib/format";
import { receitaBruta, totalDespesas, totalSangrias } from "../lib/calc";
import { printHTML } from "../lib/print";
import { reciboFechamento } from "../lib/recibo";
import type { MovimentoCaixa, TipoMovimento, FormaPagamento, SessaoCaixa, Produto } from "../lib/types";

const CATS_ENTRADA = ["Venda", "Serviço", "OS", "Sinal / Entrada", "Outro"];
const CATS_SAIDA = ["Despesa", "Compra de peça", "Fornecedor", "Aluguel", "Energia", "Água", "Internet", "Salário", "Marketing", "Outro"];

interface Extra {
  produtoId?: string;
  quantidade?: number;
  baixa?: boolean;
  custo?: number;
}

export const Caixa: React.FC = () => {
  const { movimentos, sessoes, produtos, config, saveMovimento, removeMovimento, saveSessao, saveProduto } = useApp();
  const [modal, setModal] = useState<TipoMovimento | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const [fechando, setFechando] = useState(false);

  const sessaoAberta = useMemo(() => sessoes.find((s) => !s.fechadoEm) || null, [sessoes]);

  const movsSessao = useMemo(() => {
    if (sessaoAberta) return movimentos.filter((m) => m.sessaoId === sessaoAberta.id);
    return movimentos.filter((m) => isToday(m.data));
  }, [movimentos, sessaoAberta]);

  const entradas = receitaBruta(movsSessao);
  const saidas = totalDespesas(movsSessao);
  const sangrias = totalSangrias(movsSessao);
  const abertura = sessaoAberta?.valorAbertura || 0;
  const saldo = abertura + entradas - saidas - sangrias;

  const listaMovs = useMemo(
    () => [...movimentos].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 100),
    [movimentos]
  );

  const abrirCaixa = async (valor: number) => {
    const s: SessaoCaixa = { id: uid(), abertoEm: nowISO(), valorAbertura: valor };
    await saveSessao(s);
    setAbrindo(false);
  };

  const confirmarFechamento = async () => {
    if (!sessaoAberta) return;
    await saveSessao({ ...sessaoAberta, fechadoEm: nowISO(), valorFechamento: saldo });
    setFechando(false);
  };

  const imprimirResumo = () => {
    printHTML(reciboFechamento(sessaoAberta, movsSessao, config), "Fechamento de caixa");
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

      {/* Movimentações */}
      <h2 className="mb-3 font-bold text-slate-700">Últimas movimentações</h2>
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
                    <button className="btn-ghost !p-1.5 text-red-400" onClick={() => { if (confirm("Excluir movimentação?")) removeMovimento(m.id); }}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AbrirCaixaModal open={abrindo} onClose={() => setAbrindo(false)} onConfirm={abrirCaixa} />

      <MovimentoModal
        tipo={modal}
        produtos={produtos}
        onClose={() => setModal(null)}
        onSave={async (m, extra) => {
          await saveMovimento({ ...m, sessaoId: sessaoAberta?.id, custoRelacionado: extra?.custo });
          if (extra?.baixa && extra.produtoId) {
            const prod = produtos.find((p) => p.id === extra.produtoId);
            if (prod) await saveProduto({ ...prod, quantidade: Math.max(0, prod.quantidade - (extra.quantidade || 1)) });
          }
          setModal(null);
        }}
      />

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
        <input type="number" autoFocus className="input" value={valor} onChange={(e) => setValor(+e.target.value)} />
      </Field>
    </Modal>
  );
};

// ====== Modal de movimentação (entrada/saída/sangria) ======
const MovimentoModal: React.FC<{
  tipo: TipoMovimento | null;
  produtos: Produto[];
  onClose: () => void;
  onSave: (m: MovimentoCaixa, extra?: Extra) => void;
}> = ({ tipo, produtos, onClose, onSave }) => {
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
    .filter((p) => p.nome.toLowerCase().includes(buscaProd.toLowerCase()) || (p.sku || "").toLowerCase().includes(buscaProd.toLowerCase()))
    .slice(0, 8);

  const salvar = () => {
    if (valor <= 0) return alert("Informe um valor válido.");
    const catFinal = categoria === "Outro" ? catCustom.trim() || "Outro" : categoria;
    onSave(
      {
        id: uid(),
        tipo,
        categoria: catFinal || (tipo === "entrada" ? "Venda" : "Despesa"),
        descricao: descricao || titulo,
        valor,
        formaPagamento: forma,
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
              <input type="number" min={1} className="input" value={quantidade} onChange={(e) => setQtd(Math.max(1, +e.target.value))} />
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
            <input type="number" className="input" value={valor} onChange={(e) => setValor(+e.target.value)} />
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
  onConfirm: () => void;
}> = ({ abertura, entradas, saidas, sangrias, saldo, movs, onImprimir, onClose, onConfirm }) => {
  const formas = useMemo(() => {
    const map: Record<string, number> = {};
    movs.filter((m) => m.tipo === "entrada").forEach((m) => (map[m.formaPagamento] = (map[m.formaPagamento] || 0) + m.valor));
    return Object.entries(map);
  }, [movs]);

  return (
    <Modal open onClose={onClose} title="Fechamento de caixa" maxWidth="max-w-lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onImprimir}><Printer size={16} /> Imprimir</button>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-danger" onClick={onConfirm}><Lock size={16} /> Confirmar fechamento</button>
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

        <p className="text-xs text-slate-400">Confira o dinheiro na gaveta com o saldo esperado antes de confirmar. Você pode imprimir este resumo para arquivar.</p>
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
