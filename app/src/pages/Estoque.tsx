import React, { useMemo, useState } from "react";
import { Plus, Search, Package, Pencil, Trash2, AlertTriangle, TrendingUp } from "lucide-react";
import { useApp } from "../store/AppStore";
import { Modal, Field, EmptyState, SectionTitle } from "../components/ui";
import { uid, nowISO, brl } from "../lib/format";
import type { Produto } from "../lib/types";

const vazio = (): Produto => ({
  id: uid(),
  nome: "",
  categoria: "",
  sku: "",
  quantidade: 0,
  estoqueMinimo: 2,
  custo: 0,
  preco: 0,
  fornecedor: "",
  criadoEm: nowISO(),
});

export const Estoque: React.FC = () => {
  const { produtos, saveProduto, removeProduto } = useApp();
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Produto | null>(null);
  const [soBaixo, setSoBaixo] = useState(false);

  const lista = useMemo(() => {
    const b = busca.toLowerCase();
    return [...produtos]
      .filter((p) => p.nome.toLowerCase().includes(b) || (p.sku || "").toLowerCase().includes(b))
      .filter((p) => (soBaixo ? p.quantidade <= p.estoqueMinimo : true))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [produtos, busca, soBaixo]);

  const resumo = useMemo(() => {
    const valorCusto = produtos.reduce((s, p) => s + p.custo * p.quantidade, 0);
    const valorVenda = produtos.reduce((s, p) => s + p.preco * p.quantidade, 0);
    const baixos = produtos.filter((p) => p.quantidade <= p.estoqueMinimo).length;
    return { valorCusto, valorVenda, baixos, itens: produtos.length };
  }, [produtos]);

  const salvar = async () => {
    if (!editando) return;
    if (!editando.nome.trim()) return alert("Informe o nome do produto.");
    await saveProduto(editando);
    setEditando(null);
  };

  return (
    <div>
      <SectionTitle
        title="Estoque"
        subtitle="Peças e produtos"
        action={
          <button className="btn-primary" onClick={() => setEditando(vazio())}>
            <Plus size={18} /> Novo item
          </button>
        }
      />

      {/* Resumo */}
      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <ResumoCard label="Itens cadastrados" value={String(resumo.itens)} icon={<Package size={18} />} />
        <ResumoCard label="Valor em custo" value={brl(resumo.valorCusto)} icon={<Package size={18} />} />
        <ResumoCard label="Valor de venda" value={brl(resumo.valorVenda)} icon={<TrendingUp size={18} />} accent="text-emerald-600" />
        <button
          onClick={() => setSoBaixo((v) => !v)}
          className={`card flex items-center gap-3 text-left transition ${soBaixo ? "ring-2 ring-amber-400" : ""}`}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
            <AlertTriangle size={18} />
          </div>
          <div>
            <p className="text-xs text-slate-500">Estoque baixo</p>
            <p className="text-lg font-bold text-amber-600">{resumo.baixos}</p>
          </div>
        </button>
      </div>

      <div className="relative mb-4 max-w-md">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="input pl-10" placeholder="Buscar produto ou código..." value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      {lista.length === 0 ? (
        <EmptyState icon={<Package size={48} />} title="Nenhum produto no estoque" hint="Cadastre peças, telas, baterias, acessórios..." />
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3 text-center">Qtd</th>
                <th className="px-4 py-3 text-right">Custo</th>
                <th className="px-4 py-3 text-right">Preço</th>
                <th className="px-4 py-3 text-right">Margem</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => {
                const baixo = p.quantidade <= p.estoqueMinimo;
                const margem = p.preco - p.custo;
                return (
                  <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{p.nome}</p>
                      <p className="text-xs text-slate-400">{p.categoria || "sem categoria"}{p.sku ? ` · ${p.sku}` : ""}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`badge ${baixo ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                        {p.quantidade}
                        {baixo && <AlertTriangle size={12} />}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500">{brl(p.custo)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">{brl(p.preco)}</td>
                    <td className="px-4 py-3 text-right text-emerald-600">{brl(margem)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button className="btn-ghost !p-2" onClick={() => setEditando(p)}><Pencil size={15} /></button>
                        <button className="btn-ghost !p-2 text-red-500" onClick={() => { if (confirm(`Excluir ${p.nome}?`)) removeProduto(p.id); }}><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={!!editando}
        onClose={() => setEditando(null)}
        title={editando && produtos.find((x) => x.id === editando.id) ? "Editar produto" : "Novo produto"}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setEditando(null)}>Cancelar</button>
            <button className="btn-primary" onClick={salvar}>Salvar</button>
          </>
        }
      >
        {editando && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome do produto *" className="sm:col-span-2">
              <input className="input" value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} />
            </Field>
            <Field label="Categoria">
              <input className="input" placeholder="Tela, Bateria, Cabo..." value={editando.categoria} onChange={(e) => setEditando({ ...editando, categoria: e.target.value })} />
            </Field>
            <Field label="Código / SKU">
              <input className="input" value={editando.sku} onChange={(e) => setEditando({ ...editando, sku: e.target.value })} />
            </Field>
            <Field label="Quantidade">
              <input type="number" className="input" value={editando.quantidade} onChange={(e) => setEditando({ ...editando, quantidade: +e.target.value })} />
            </Field>
            <Field label="Estoque mínimo (alerta)">
              <input type="number" className="input" value={editando.estoqueMinimo} onChange={(e) => setEditando({ ...editando, estoqueMinimo: +e.target.value })} />
            </Field>
            <Field label="Custo (R$)">
              <input type="number" className="input" value={editando.custo} onChange={(e) => setEditando({ ...editando, custo: +e.target.value })} />
            </Field>
            <Field label="Preço de venda (R$)">
              <input type="number" className="input" value={editando.preco} onChange={(e) => setEditando({ ...editando, preco: +e.target.value })} />
            </Field>
            <Field label="Fornecedor" className="sm:col-span-2">
              <input className="input" value={editando.fornecedor} onChange={(e) => setEditando({ ...editando, fornecedor: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
};

const ResumoCard: React.FC<{ label: string; value: string; icon: React.ReactNode; accent?: string }> = ({ label, value, icon, accent }) => (
  <div className="card flex items-center gap-3">
    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">{icon}</div>
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-lg font-bold ${accent || "text-slate-800"}`}>{value}</p>
    </div>
  </div>
);
