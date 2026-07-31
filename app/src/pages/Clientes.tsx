import React, { useMemo, useState } from "react";
import { aviso } from "../components/Aviso";
import { Plus, Search, Pencil, Trash2, Users, Phone, MessageCircle, Wrench, User, Building2, ShieldAlert, Cake } from "lucide-react";
import { useApp } from "../store/AppStore";
import { Modal, Field, EmptyState, SectionTitle, InputNumero } from "../components/ui";
import { uid, nowISO, whatsappLink, formatDate, brl, txt, mascaraDocumento, soDigitos, documentoValido } from "../lib/format";
import { avaliarCliente, classificacaoDe, travaFiado } from "../lib/clientes";
import { Relacionamento } from "../components/Relacionamento";
import { CLASSIFICACAO_META, type Classificacao, type Cliente } from "../lib/types";

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
  const { clientes, ordens, fiados, saveCliente, removeCliente } = useApp();
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [relacionamento, setRelacionamento] = useState(false);
  const [filtroClasse, setFiltroClasse] = useState<Classificacao | "todos">("todos");

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
      .filter((c) => filtroClasse === "todos" || classificacaoDe(c) === filtroClasse)
      .sort((a, b) => txt(a.nome).localeCompare(txt(b.nome)));
  }, [clientes, busca, filtroClasse]);

  const osCount = (id: string) => ordens.filter((o) => o.clienteId === id).length;

  // Fatos do histórico do cliente aberto, para o dono decidir com dado na mão
  // em vez de memória do atendente.
  const avaliacao = useMemo(
    () =>
      editando
        ? avaliarCliente(editando, ordens, fiados)
        : { sinais: [], pontos: 0, sugestao: "normal" as Classificacao, atual: "normal" as Classificacao, divergente: false },
    [editando, ordens, fiados]
  );

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
    // Classificação sem motivo vira boato dentro do sistema: daqui a seis
    // meses ninguém sabe por que o cliente está marcado.
    if (
      classificacaoDe(editando) !== "normal" &&
      !txt(editando.motivoClassificacao).trim()
    ) {
      return aviso.alerta("Escreva o motivo da classificação. Sem isso, ninguém depois entende a marcação.");
    }
    try {
      await saveCliente({
        ...editando,
        classificadoEm:
          classificacaoDe(editando) !== "normal" ? editando.classificadoEm || nowISO() : undefined,
      });
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
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={() => setRelacionamento(true)}>
              <Cake size={18} /> Quem chamar hoje
            </button>
            <button className="btn-primary" onClick={() => setEditando(vazio())}>
              <Plus size={18} /> Novo cliente
            </button>
          </div>
        }
      />

      {relacionamento && <Relacionamento onClose={() => setRelacionamento(false)} />}

      <div className="mb-4 flex flex-wrap gap-2">
        {(["todos", "normal", "atencao", "bloqueado"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltroClasse(f)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              filtroClasse === f
                ? "bg-brand-600 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {f !== "todos" && (
              <span className={`h-2 w-2 rounded-full ${CLASSIFICACAO_META[f].corPonto}`} />
            )}
            {f === "todos" ? "Todos" : CLASSIFICACAO_META[f].label}
            {f !== "todos" && (
              <span className="opacity-60">
                {clientes.filter((c) => classificacaoDe(c) === f).length}
              </span>
            )}
          </button>
        ))}
      </div>

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
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {c.tipoPessoa === "juridica" && (
                      <span className="badge bg-slate-100 text-slate-600">
                        <Building2 size={11} /> Empresa
                      </span>
                    )}
                    {classificacaoDe(c) !== "normal" && (
                      <span
                        className={`badge ${CLASSIFICACAO_META[classificacaoDe(c)].cor}`}
                        title={txt(c.motivoClassificacao)}
                      >
                        <ShieldAlert size={11} /> {CLASSIFICACAO_META[classificacaoDe(c)].label}
                      </span>
                    )}
                  </div>
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
            <Field label={juridica ? "Fundação da empresa" : "Aniversário"}>
              <input
                type="date"
                className="input"
                value={editando.nascimento || ""}
                onChange={(e) => setEditando({ ...editando, nascimento: e.target.value })}
              />
              <p className="mt-1 text-xs text-slate-400">
                Aparece sozinho na Agenda todo ano. Se não souber o ano, use 1900.
              </p>
            </Field>
            {/* Teto do fiado: decisão de dono, tomada uma vez com a cabeça
                fria, em vez de decisão do atendente no balcão com fila. */}
            <Field label="Limite de fiado (R$)">
              <InputNumero
                className="input"
                value={editando.limiteFiado}
                onChange={(v) => setEditando({ ...editando, limiteFiado: v })}
              />
              <p className="mt-1 text-xs text-slate-400">
                {(() => {
                  const t = travaFiado(editando, fiados);
                  if (!t.temLimite) return `Vazio = sem teto. Deve hoje: ${brl(t.devendo)}.`;
                  return `Deve hoje ${brl(t.devendo)} — ainda cabem ${brl(t.disponivel)}.`;
                })()}
              </p>
            </Field>
            <Field label="Observações" className="sm:col-span-2">
              <textarea
                className="input"
                rows={2}
                value={editando.observacoes}
                onChange={(e) => setEditando({ ...editando, observacoes: e.target.value })}
              />
            </Field>

            {/* Classificação de risco: decisão da loja, com os fatos do lado */}
            <div className="sm:col-span-2 rounded-xl border border-slate-200 p-3">
              <label className="label">Classificação do cliente</label>
              <p className="mb-2 text-xs text-slate-500">
                Fica só aqui dentro. Não aparece no recibo nem na página de acompanhamento.
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                {(["normal", "atencao", "bloqueado"] as const).map((k) => {
                  const meta = CLASSIFICACAO_META[k];
                  const ativo = classificacaoDe(editando) === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setEditando({ ...editando, classificacao: k })}
                      className={`rounded-lg border px-3 py-2 text-left transition ${
                        ativo
                          ? "border-brand-500 bg-brand-50"
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                        <span className={`h-2.5 w-2.5 rounded-full ${meta.corPonto}`} />
                        {meta.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {meta.descricao}
                      </span>
                    </button>
                  );
                })}
              </div>

              {classificacaoDe(editando) !== "normal" && (
                <div className="mt-3">
                  <label className="label">Motivo *</label>
                  <textarea
                    className="input"
                    rows={2}
                    placeholder="Ex.: deixou o notebook 4 meses parado e sumiu com R$ 380 em aberto"
                    value={editando.motivoClassificacao || ""}
                    onChange={(e) =>
                      setEditando({ ...editando, motivoClassificacao: e.target.value })
                    }
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Quem atender daqui a seis meses vai ler isso e entender na hora.
                    {editando.classificadoEm &&
                      ` Marcado em ${formatDate(editando.classificadoEm)}.`}
                  </p>
                </div>
              )}

              {/* O que o histórico mostra */}
              {avaliacao.sinais.length > 0 && (
                <div className="mt-3 rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    O que o histórico mostra
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {avaliacao.sinais.map((s, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-sm text-slate-600">
                        <span
                          className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                            s.peso > 0 ? "bg-red-400" : "bg-emerald-400"
                          }`}
                        />
                        {s.texto}
                      </li>
                    ))}
                  </ul>
                  {avaliacao.divergente && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2.5">
                      <span className="text-sm text-slate-600">
                        Pelos fatos, esse cliente estaria em{" "}
                        <strong>{CLASSIFICACAO_META[avaliacao.sugestao].label}</strong>.
                      </span>
                      <button
                        type="button"
                        className="btn-secondary !py-1 !px-2.5 text-xs"
                        onClick={() =>
                          setEditando({ ...editando, classificacao: avaliacao.sugestao })
                        }
                      >
                        Aplicar
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
