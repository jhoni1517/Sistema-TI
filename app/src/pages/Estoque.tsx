import React, { useMemo, useState } from "react";
import { Plus, Search, Package, Pencil, Trash2, AlertTriangle, TrendingUp, FolderTree, FolderPlus, CornerDownRight, Truck } from "lucide-react";
import { useApp } from "../store/AppStore";
import { Modal, Field, EmptyState, SectionTitle } from "../components/ui";
import { uid, nowISO, brl } from "../lib/format";
import type { Produto, Categoria, Fornecedor } from "../lib/types";

const vazio = (): Produto => ({
  id: uid(),
  nome: "",
  categoria: "",
  categoriaId: "",
  subcategoriaId: "",
  sku: "",
  quantidade: 0,
  estoqueMinimo: 2,
  custo: 0,
  preco: 0,
  fornecedor: "",
  fornecedorId: "",
  criadoEm: nowISO(),
});

export const Estoque: React.FC = () => {
  const { produtos, categorias, fornecedores, saveProduto, removeProduto, saveCategoria, removeCategoria, saveFornecedor, removeFornecedor } = useApp();
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Produto | null>(null);
  const [soBaixo, setSoBaixo] = useState(false);
  const [gerCategorias, setGerCategorias] = useState(false);
  const [gerFornecedores, setGerFornecedores] = useState(false);

  const classes = useMemo(
    () => categorias.filter((c) => !c.paiId).sort((a, b) => a.nome.localeCompare(b.nome)),
    [categorias]
  );
  const subde = (paiId?: string) =>
    categorias.filter((c) => c.paiId === paiId).sort((a, b) => a.nome.localeCompare(b.nome));

  const nomeCat = (p: Produto): string => {
    const cls = categorias.find((c) => c.id === p.categoriaId);
    const sub = categorias.find((c) => c.id === p.subcategoriaId);
    if (cls) return sub ? `${cls.nome} · ${sub.nome}` : cls.nome;
    return p.categoria || "sem categoria";
  };
  const nomeForn = (p: Produto): string =>
    fornecedores.find((f) => f.id === p.fornecedorId)?.nome || p.fornecedor || "";

  const lista = useMemo(() => {
    const b = busca.toLowerCase();
    return [...produtos]
      .filter((p) => p.nome.toLowerCase().includes(b) || (p.sku || "").toLowerCase().includes(b) || nomeCat(p).toLowerCase().includes(b))
      .filter((p) => (soBaixo ? p.quantidade <= p.estoqueMinimo : true))
      .sort((a, b) => a.nome.localeCompare(b.nome));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtos, busca, soBaixo, categorias]);

  const resumo = useMemo(() => {
    const valorCusto = produtos.reduce((s, p) => s + p.custo * p.quantidade, 0);
    const valorVenda = produtos.reduce((s, p) => s + p.preco * p.quantidade, 0);
    const baixos = produtos.filter((p) => p.quantidade <= p.estoqueMinimo).length;
    return { valorCusto, valorVenda, baixos, itens: produtos.length };
  }, [produtos]);

  const salvar = async () => {
    if (!editando) return;
    if (!editando.nome.trim()) return alert("Informe o nome do produto.");
    // grava os textos de categoria/fornecedor para exibição/compatibilidade
    const p = {
      ...editando,
      categoria: editando.categoriaId ? nomeCat(editando) : editando.categoria,
      fornecedor: editando.fornecedorId ? nomeForn(editando) : editando.fornecedor,
    };
    try {
      await saveProduto(p);
      setEditando(null);
    } catch (e) {
      alert("Não foi possível salvar o produto.\n\n" + (e instanceof Error ? e.message : String(e)) + "\n\nSe você usa a nuvem, confira se rodou o comando SQL de atualização das tabelas.");
    }
  };

  return (
    <div>
      <SectionTitle
        title="Estoque"
        subtitle="Peças e produtos"
        action={
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={() => setGerFornecedores(true)}>
              <Truck size={18} /> Fornecedores
            </button>
            <button className="btn-secondary" onClick={() => setGerCategorias(true)}>
              <FolderTree size={18} /> Categorias
            </button>
            <button className="btn-primary" onClick={() => setEditando(vazio())}>
              <Plus size={18} /> Novo item
            </button>
          </div>
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
        <input className="input pl-10" placeholder="Buscar produto, código ou categoria..." value={busca} onChange={(e) => setBusca(e.target.value)} />
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
                      <p className="text-xs text-slate-400">{nomeCat(p)}{p.sku ? ` · ${p.sku}` : ""}</p>
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

      {/* Modal produto */}
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
            <Field label="Categoria (classe)">
              <select
                className="input"
                value={editando.categoriaId || ""}
                onChange={(e) => setEditando({ ...editando, categoriaId: e.target.value, subcategoriaId: "" })}
              >
                <option value="">— selecione —</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </Field>
            <Field label="Subcategoria">
              <select
                className="input"
                value={editando.subcategoriaId || ""}
                onChange={(e) => setEditando({ ...editando, subcategoriaId: e.target.value })}
                disabled={!editando.categoriaId}
              >
                <option value="">{editando.categoriaId ? "— nenhuma —" : "escolha a classe primeiro"}</option>
                {subde(editando.categoriaId).map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </Field>
            {classes.length === 0 && (
              <p className="sm:col-span-2 -mt-2 text-xs text-amber-600">
                Nenhuma categoria cadastrada. Clique em <b>“Categorias”</b> (no topo) para criar classes e subclasses.
              </p>
            )}
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
              <select
                className="input"
                value={editando.fornecedorId || ""}
                onChange={(e) => setEditando({ ...editando, fornecedorId: e.target.value })}
              >
                <option value="">— nenhum —</option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>{f.nome}</option>
                ))}
              </select>
              {fornecedores.length === 0 && (
                <p className="mt-1 text-xs text-amber-600">Cadastre em <b>“Fornecedores”</b> (no topo) para poder selecionar.</p>
              )}
            </Field>
          </div>
        )}
      </Modal>

      {/* Modal categorias */}
      {gerCategorias && (
        <CategoriasManager
          classes={classes}
          subde={subde}
          onClose={() => setGerCategorias(false)}
          onAdd={saveCategoria}
          onRemove={removeCategoria}
        />
      )}

      {/* Modal fornecedores */}
      {gerFornecedores && (
        <FornecedoresManager
          fornecedores={fornecedores}
          onClose={() => setGerFornecedores(false)}
          onSave={saveFornecedor}
          onRemove={removeFornecedor}
        />
      )}
    </div>
  );
};

// ====== Gerenciador de fornecedores ======
const FornecedoresManager: React.FC<{
  fornecedores: Fornecedor[];
  onClose: () => void;
  onSave: (f: Fornecedor) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}> = ({ fornecedores, onClose, onSave, onRemove }) => {
  const vazioF = (): Fornecedor => ({ id: uid(), nome: "", telefone: "", contato: "", cnpj: "", observacoes: "", criadoEm: nowISO() });
  const [edit, setEdit] = useState<Fornecedor | null>(null);

  const salvar = async () => {
    if (!edit) return;
    if (!edit.nome.trim()) return alert("Informe o nome do fornecedor.");
    try {
      await onSave(edit);
      setEdit(null);
    } catch (e) {
      alert("Erro ao salvar: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  return (
    <Modal open onClose={onClose} title="Fornecedores" maxWidth="max-w-2xl"
      footer={<button className="btn-primary" onClick={onClose}>Concluir</button>}
    >
      {edit ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome / Empresa *" className="sm:col-span-2">
              <input className="input" value={edit.nome} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} />
            </Field>
            <Field label="Telefone / WhatsApp">
              <input className="input" value={edit.telefone} onChange={(e) => setEdit({ ...edit, telefone: e.target.value })} />
            </Field>
            <Field label="Pessoa de contato">
              <input className="input" value={edit.contato} onChange={(e) => setEdit({ ...edit, contato: e.target.value })} />
            </Field>
            <Field label="CNPJ">
              <input className="input" value={edit.cnpj} onChange={(e) => setEdit({ ...edit, cnpj: e.target.value })} />
            </Field>
            <Field label="Observações" className="sm:col-span-2">
              <textarea className="input" rows={2} value={edit.observacoes} onChange={(e) => setEdit({ ...edit, observacoes: e.target.value })} />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setEdit(null)}>Voltar</button>
            <button className="btn-primary" onClick={salvar}>Salvar</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <button className="btn-primary" onClick={() => setEdit(vazioF())}><Plus size={16} /> Novo fornecedor</button>
          {fornecedores.length === 0 ? (
            <EmptyState icon={<Truck size={40} />} title="Nenhum fornecedor" hint="Cadastre seus fornecedores para vincular aos produtos." />
          ) : (
            <div className="divide-y divide-slate-100">
              {[...fornecedores].sort((a, b) => a.nome.localeCompare(b.nome)).map((f) => (
                <div key={f.id} className="flex items-center gap-3 py-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Truck size={16} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-800">{f.nome}</p>
                    <p className="truncate text-xs text-slate-400">{[f.telefone, f.contato, f.cnpj].filter(Boolean).join(" · ") || "—"}</p>
                  </div>
                  <button className="btn-ghost !p-2" onClick={() => setEdit(f)}><Pencil size={15} /></button>
                  <button className="btn-ghost !p-2 text-red-500" onClick={() => { if (confirm(`Excluir ${f.nome}?`)) onRemove(f.id); }}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
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

// ====== Gerenciador de categorias (classes e subclasses) ======
const CategoriasManager: React.FC<{
  classes: Categoria[];
  subde: (paiId?: string) => Categoria[];
  onClose: () => void;
  onAdd: (c: Categoria) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}> = ({ classes, subde, onClose, onAdd, onRemove }) => {
  const [novaClasse, setNovaClasse] = useState("");
  const [novaSub, setNovaSub] = useState<Record<string, string>>({});

  const addClasse = async () => {
    const nome = novaClasse.trim();
    if (!nome) return;
    await onAdd({ id: uid(), nome, paiId: null, criadoEm: nowISO() });
    setNovaClasse("");
  };
  const addSub = async (paiId: string) => {
    const nome = (novaSub[paiId] || "").trim();
    if (!nome) return;
    await onAdd({ id: uid(), nome, paiId, criadoEm: nowISO() });
    setNovaSub((s) => ({ ...s, [paiId]: "" }));
  };

  return (
    <Modal open onClose={onClose} title="Categorias do estoque" maxWidth="max-w-2xl"
      footer={<button className="btn-primary" onClick={onClose}>Concluir</button>}
    >
      <div className="space-y-5">
        {/* Nova classe */}
        <div>
          <label className="label">Nova categoria (classe)</label>
          <div className="flex gap-2">
            <input
              className="input"
              placeholder="Ex: Informática, Celular, Acessórios..."
              value={novaClasse}
              onChange={(e) => setNovaClasse(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addClasse()}
            />
            <button className="btn-primary shrink-0" onClick={addClasse}><FolderPlus size={16} /> Criar</button>
          </div>
        </div>

        {classes.length === 0 ? (
          <EmptyState icon={<FolderTree size={40} />} title="Nenhuma categoria ainda" hint="Crie uma classe acima (ex: Informática) e depois adicione subclasses (ex: Mouses)." />
        ) : (
          <div className="space-y-4">
            {classes.map((cls) => (
              <div key={cls.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-2 font-bold text-slate-800">
                    <FolderTree size={16} className="text-brand-600" /> {cls.nome}
                  </p>
                  <button className="btn-ghost !p-1.5 text-red-500" title="Excluir classe e subclasses" onClick={() => { if (confirm(`Excluir a classe "${cls.nome}" e suas subclasses?`)) onRemove(cls.id); }}>
                    <Trash2 size={15} />
                  </button>
                </div>

                {/* subclasses */}
                <div className="mt-2 space-y-1 pl-5">
                  {subde(cls.id).map((sub) => (
                    <div key={sub.id} className="flex items-center justify-between text-sm text-slate-600">
                      <span className="flex items-center gap-1"><CornerDownRight size={13} className="text-slate-400" /> {sub.nome}</span>
                      <button className="btn-ghost !p-1 text-red-400" onClick={() => onRemove(sub.id)}><Trash2 size={13} /></button>
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <input
                      className="input !py-1.5 text-sm"
                      placeholder="Nova subclasse (ex: Mouses, Cabos de carregador...)"
                      value={novaSub[cls.id] || ""}
                      onChange={(e) => setNovaSub((s) => ({ ...s, [cls.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && addSub(cls.id)}
                    />
                    <button className="btn-secondary shrink-0 !py-1.5 text-sm" onClick={() => addSub(cls.id)}><Plus size={14} /> Add</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};
