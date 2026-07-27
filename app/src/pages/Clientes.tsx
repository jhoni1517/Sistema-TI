import React, { useMemo, useState } from "react";
import { aviso } from "../components/Aviso";
import { Plus, Search, Pencil, Trash2, Users, Phone, MessageCircle, Wrench, User, Building2 } from "lucide-react";
import { useApp } from "../store/AppStore";
import { Modal, Field, EmptyState, SectionTitle } from "../components/ui";
import { uid, nowISO, whatsappLink, formatDate, txt, mascaraDocumento, soDigitos, documentoValido } from "../lib/format";
import type { Cliente } from "../lib/types";

const vazio = (): Cliente => ({
  id: uid(),
  nome: "",
  telefone: "",
  cpf: "",
  tipoPessoa: "fisica",
  email: "",
  endereco: "",
  observacoes: "",
  criadoEm: nowISO(),
});

export const Clientes: React.FC = () => {
  const { clientes, ordens, saveCliente, removeCliente } = useApp();
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Cliente | null>(null);

  const juridica = editando?.tipoPessoa === "juridica";

  const lista = useMemo(() => {
    const b = busca.toLowerCase();
    return [...clientes]
      .filter(
        (c) =>
          txt(c.nome).toLowerCase().includes(b) ||
          txt(c.nomeFantasia).toLowerCase().includes(b) ||
          txt(c.telefone).includes(b) ||
          // compara só os dígitos: quem busca "52679" acha "52.679.376/0001-78"
          (soDigitos(b) !== "" && soDigitos(c.cpf).includes(soDigitos(b)))
      )
      .sort((a, b) => txt(a.nome).localeCompare(txt(b.nome)));
  }, [clientes, busca]);

  const osCount = (id: string) => ordens.filter((o) => o.clienteId === id).length;

  const salvar = async () => {
    if (!editando) return;
    if (!editando.nome.trim()) {
      return aviso.alerta(
        juridica ? "Informe a razão social." : "Informe o nome do cliente."
      );
    }
    if (!documentoValido(editando.cpf)) {
      return aviso.alerta(
        juridica
          ? "CNPJ inválido. Confira os números ou deixe o campo em branco."
          : "CPF inválido. Confira os números ou deixe o campo em branco."
      );
    }
    try {
      await saveCliente(editando);
      setEditando(null);
    } catch (e) {
      aviso.erro(e instanceof Error ? e.message : String(e));
    }
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
          placeholder="Buscar por nome, telefone, CPF ou CNPJ..."
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
                  <p className="truncate font-bold text-slate-800">
                    {c.nomeFantasia || c.nome}
                  </p>
                  {c.tipoPessoa === "juridica" && (
                    <span className="badge mt-0.5 bg-slate-100 text-slate-600">
                      <Building2 size={11} /> Empresa
                    </span>
                  )}
                  <p className="flex items-center gap-1 text-sm text-slate-500">
                    <Phone size={13} /> {c.telefone || "sem telefone"}
                  </p>
                </div>
                <span className="badge bg-brand-50 text-brand-700">
                  <Wrench size={12} /> {osCount(c.id)} OS
                </span>
              </div>
              {c.cpf && (
                <p className="mt-2 text-xs text-slate-400">
                  {soDigitos(c.cpf).length > 11 ? "CNPJ" : "CPF"}: {mascaraDocumento(c.cpf)}
                </p>
              )}
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
            {/* Pessoa física ou jurídica: muda os rótulos e o documento */}
            <div className="sm:col-span-2">
              <label className="label">Tipo de cliente</label>
              <div className="grid max-w-sm grid-cols-2 gap-2">
                {([
                  { k: "fisica", nome: "Pessoa física", icon: <User size={16} /> },
                  { k: "juridica", nome: "Empresa (CNPJ)", icon: <Building2 size={16} /> },
                ] as const).map((t) => (
                  <button
                    key={t.k}
                    type="button"
                    onClick={() => setEditando({ ...editando, tipoPessoa: t.k })}
                    className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition ${
                      (editando.tipoPessoa || "fisica") === t.k
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {t.icon} {t.nome}
                  </button>
                ))}
              </div>
            </div>

            <Field
              label={juridica ? "Razão social *" : "Nome completo *"}
              className="sm:col-span-2"
            >
              <input
                className="input"
                value={editando.nome}
                onChange={(e) => setEditando({ ...editando, nome: e.target.value })}
              />
            </Field>

            {juridica && (
              <Field label="Nome fantasia" className="sm:col-span-2">
                <input
                  className="input"
                  placeholder="Como a empresa é conhecida"
                  value={editando.nomeFantasia || ""}
                  onChange={(e) => setEditando({ ...editando, nomeFantasia: e.target.value })}
                />
              </Field>
            )}

            <Field label="Telefone / WhatsApp">
              <input
                className="input"
                placeholder="(00) 00000-0000"
                value={editando.telefone}
                onChange={(e) => setEditando({ ...editando, telefone: e.target.value })}
              />
            </Field>

            <Field label={juridica ? "CNPJ" : "CPF"}>
              <input
                className="input"
                inputMode="numeric"
                placeholder={juridica ? "00.000.000/0000-00" : "000.000.000-00"}
                value={mascaraDocumento(editando.cpf)}
                onChange={(e) =>
                  setEditando({ ...editando, cpf: soDigitos(e.target.value) })
                }
              />
              {!documentoValido(editando.cpf) && (
                <p className="mt-1 text-xs font-medium text-red-600">
                  Documento incompleto ou inválido
                </p>
              )}
            </Field>

            {juridica && (
              <Field label="Inscrição estadual">
                <input
                  className="input"
                  placeholder="Isento, se for o caso"
                  value={editando.inscricaoEstadual || ""}
                  onChange={(e) =>
                    setEditando({ ...editando, inscricaoEstadual: e.target.value })
                  }
                />
              </Field>
            )}
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
