import React, { useMemo, useState } from "react";
import { Plus, Search, Pencil, Trash2, Users, Phone, MessageCircle, Wrench } from "lucide-react";
import { useApp } from "../store/AppStore";
import { Modal, Field, EmptyState, SectionTitle } from "../components/ui";
import { uid, nowISO, whatsappLink, formatDate } from "../lib/format";
import type { Cliente } from "../lib/types";

const vazio = (): Cliente => ({
  id: uid(),
  nome: "",
  telefone: "",
  cpf: "",
  email: "",
  endereco: "",
  observacoes: "",
  criadoEm: nowISO(),
});

export const Clientes: React.FC = () => {
  const { clientes, ordens, saveCliente, removeCliente } = useApp();
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Cliente | null>(null);

  const lista = useMemo(() => {
    const b = busca.toLowerCase();
    return [...clientes]
      .filter(
        (c) =>
          c.nome.toLowerCase().includes(b) ||
          c.telefone.includes(b) ||
          (c.cpf || "").includes(b)
      )
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [clientes, busca]);

  const osCount = (id: string) => ordens.filter((o) => o.clienteId === id).length;

  const salvar = async () => {
    if (!editando) return;
    if (!editando.nome.trim()) return alert("Informe o nome do cliente.");
    await saveCliente(editando);
    setEditando(null);
  };

  return (
    <div>
      <SectionTitle
        title="Clientes"
        subtitle={`${clientes.length} cadastrado(s)`}
        action={
          <button className="btn-primary" onClick={() => setEditando(vazio())}>
            <Plus size={18} /> Novo cliente
          </button>
        }
      />

      <div className="relative mb-4 max-w-md">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className="input pl-10"
          placeholder="Buscar por nome, telefone ou CPF..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {lista.length === 0 ? (
        <EmptyState
          icon={<Users size={48} />}
          title="Nenhum cliente encontrado"
          hint="Cadastre seu primeiro cliente para começar."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((c) => (
            <div key={c.id} className="card">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="truncate font-bold text-slate-800">{c.nome}</p>
                  <p className="flex items-center gap-1 text-sm text-slate-500">
                    <Phone size={13} /> {c.telefone || "sem telefone"}
                  </p>
                </div>
                <span className="badge bg-brand-50 text-brand-700">
                  <Wrench size={12} /> {osCount(c.id)} OS
                </span>
              </div>
              {c.cpf && <p className="mt-2 text-xs text-slate-400">CPF: {c.cpf}</p>}
              <p className="mt-1 text-xs text-slate-400">Desde {formatDate(c.criadoEm)}</p>
              <div className="mt-3 flex gap-2">
                {c.telefone && (
                  <a
                    href={whatsappLink(c.telefone, `Olá ${c.nome}, tudo bem?`)}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-success flex-1 !py-1.5 text-xs"
                  >
                    <MessageCircle size={14} /> WhatsApp
                  </a>
                )}
                <button
                  className="btn-secondary !py-1.5 !px-2.5"
                  onClick={() => setEditando(c)}
                >
                  <Pencil size={14} />
                </button>
                <button
                  className="btn-secondary !py-1.5 !px-2.5 text-red-600"
                  onClick={() => {
                    if (confirm(`Excluir ${c.nome}?`)) removeCliente(c.id);
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!editando}
        onClose={() => setEditando(null)}
        title={editando && clientes.find((x) => x.id === editando.id) ? "Editar cliente" : "Novo cliente"}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setEditando(null)}>
              Cancelar
            </button>
            <button className="btn-primary" onClick={salvar}>
              Salvar
            </button>
          </>
        }
      >
        {editando && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome completo *" className="sm:col-span-2">
              <input
                className="input"
                value={editando.nome}
                onChange={(e) => setEditando({ ...editando, nome: e.target.value })}
              />
            </Field>
            <Field label="Telefone / WhatsApp">
              <input
                className="input"
                placeholder="(00) 00000-0000"
                value={editando.telefone}
                onChange={(e) => setEditando({ ...editando, telefone: e.target.value })}
              />
            </Field>
            <Field label="CPF">
              <input
                className="input"
                value={editando.cpf}
                onChange={(e) => setEditando({ ...editando, cpf: e.target.value })}
              />
            </Field>
            <Field label="E-mail">
              <input
                className="input"
                value={editando.email}
                onChange={(e) => setEditando({ ...editando, email: e.target.value })}
              />
            </Field>
            <Field label="Endereço">
              <input
                className="input"
                value={editando.endereco}
                onChange={(e) => setEditando({ ...editando, endereco: e.target.value })}
              />
            </Field>
            <Field label="Observações" className="sm:col-span-2">
              <textarea
                className="input"
                rows={2}
                value={editando.observacoes}
                onChange={(e) => setEditando({ ...editando, observacoes: e.target.value })}
              />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
};
