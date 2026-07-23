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
} from "lucide-react";
import { useApp } from "../store/AppStore";
import { Modal, Field, SectionTitle, EmptyState } from "../components/ui";
import { uid, nowISO, brl, formatDateTime, isToday } from "../lib/format";
import { receitaBruta, totalDespesas, totalSangrias } from "../lib/calc";
import type { MovimentoCaixa, TipoMovimento, FormaPagamento, SessaoCaixa } from "../lib/types";

export const Caixa: React.FC = () => {
  const { movimentos, sessoes, saveMovimento, removeMovimento, saveSessao } = useApp();
  const [modal, setModal] = useState<TipoMovimento | null>(null);
  const [abrindo, setAbrindo] = useState(false);

  const sessaoAberta = useMemo(
    () => sessoes.find((s) => !s.fechadoEm) || null,
    [sessoes]
  );

  // movimentos da sessão aberta (ou de hoje se não houver sessão)
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
  const fecharCaixa = async () => {
    if (!sessaoAberta) return;
    if (!confirm(`Fechar o caixa? Saldo atual: ${brl(saldo)}`)) return;
    await saveSessao({ ...sessaoAberta, fechadoEm: nowISO(), valorFechamento: saldo });
  };

  return (
    <div>
      <SectionTitle
        title="Caixa"
        subtitle={sessaoAberta ? `Caixa aberto em ${formatDateTime(sessaoAberta.abertoEm)}` : "Caixa fechado"}
        action={
          sessaoAberta ? (
            <button className="btn-danger" onClick={fecharCaixa}><Lock size={16} /> Fechar caixa</button>
          ) : (
            <button className="btn-success" onClick={() => setAbrindo(true)}><Unlock size={16} /> Abrir caixa</button>
          )
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
        <button className="btn-success" onClick={() => setModal("entrada")}><Plus size={16} /> Entrada</button>
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

      {/* Modal abrir caixa */}
      <AbrirCaixaModal open={abrindo} onClose={() => setAbrindo(false)} onConfirm={abrirCaixa} />

      {/* Modal movimento */}
      <MovimentoModal
        tipo={modal}
        onClose={() => setModal(null)}
        onSave={async (m) => {
          await saveMovimento({ ...m, sessaoId: sessaoAberta?.id });
          setModal(null);
        }}
      />
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
    <Modal
      open={open}
      onClose={onClose}
      title="Abrir caixa"
      maxWidth="max-w-md"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-success" onClick={() => onConfirm(valor)}>Abrir caixa</button>
        </>
      }
    >
      <Field label="Valor de abertura (troco inicial)">
        <input type="number" autoFocus className="input" value={valor} onChange={(e) => setValor(+e.target.value)} />
      </Field>
    </Modal>
  );
};

const MovimentoModal: React.FC<{
  tipo: TipoMovimento | null;
  onClose: () => void;
  onSave: (m: MovimentoCaixa) => void;
}> = ({ tipo, onClose, onSave }) => {
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState(0);
  const [categoria, setCategoria] = useState("");
  const [forma, setForma] = useState<FormaPagamento>("dinheiro");

  React.useEffect(() => {
    if (tipo) {
      setDescricao("");
      setValor(0);
      setCategoria(tipo === "entrada" ? "Venda" : tipo === "sangria" ? "Sangria" : "Despesa");
      setForma("dinheiro");
    }
  }, [tipo]);

  if (!tipo) return null;
  const titulo = tipo === "entrada" ? "Nova entrada" : tipo === "sangria" ? "Sangria (retirada)" : "Saída / Despesa";

  const salvar = () => {
    if (valor <= 0) return alert("Informe um valor válido.");
    onSave({
      id: uid(),
      tipo,
      categoria: categoria || (tipo === "entrada" ? "Venda" : "Despesa"),
      descricao: descricao || titulo,
      valor,
      formaPagamento: forma,
      data: nowISO(),
    });
  };

  return (
    <Modal
      open={!!tipo}
      onClose={onClose}
      title={titulo}
      maxWidth="max-w-md"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className={tipo === "entrada" ? "btn-success" : "btn-primary"} onClick={salvar}>Registrar</button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Descrição">
          <input className="input" autoFocus value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={tipo === "sangria" ? "Retirada para banco..." : "Ex: Venda de película"} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Valor (R$)">
            <input type="number" className="input" value={valor} onChange={(e) => setValor(+e.target.value)} />
          </Field>
          <Field label="Categoria">
            <input className="input" value={categoria} onChange={(e) => setCategoria(e.target.value)} />
          </Field>
        </div>
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
