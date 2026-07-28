import React, { useEffect, useMemo, useState } from "react";
import {
  Plus,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Trash2,
  Pencil,
  Check,
  Bell,
  BellOff,
  MessageCircle,
} from "lucide-react";
import { aviso } from "../components/Aviso";
import { useApp } from "../store/AppStore";
import { Modal, Field, EmptyState, SectionTitle } from "../components/ui";
import { uid, nowISO, txt, formatDate, abrirWhatsapp } from "../lib/format";
import { hojeISO, soData, diasAteVencer } from "../lib/contas";
import {
  agendaEntre,
  gradeDoMes,
  limitesDoMes,
  paraAvisarHoje,
  quandoTexto,
  avancarDias,
  type Ocorrencia,
} from "../lib/agenda";
import {
  notificar,
  permissaoAtual,
  pedirPermissao,
  type PermissaoAviso,
} from "../lib/notificacoes";
import {
  TIPO_EVENTO_META,
  REPETIR_META,
  type Evento,
  type RepetirEvento,
  type TipoEvento,
} from "../lib/types";

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const novoEvento = (data: string): Evento => ({
  id: uid(),
  titulo: "",
  tipo: "atendimento",
  data,
  hora: "",
  repetir: "nenhuma",
  avisarDiasAntes: 1,
  criadoEm: nowISO(),
});

export const Agenda: React.FC = () => {
  const { eventos, clientes, saveEvento, removeEvento } = useApp();

  const hoje = hojeISO();
  const [ano, setAno] = useState(Number(hoje.slice(0, 4)));
  const [mes, setMes] = useState(Number(hoje.slice(5, 7)));
  const [diaAberto, setDiaAberto] = useState(hoje);
  const [editando, setEditando] = useState<Evento | null>(null);
  const [permissao, setPermissao] = useState<PermissaoAviso>("pendente");

  useEffect(() => setPermissao(permissaoAtual()), []);

  const nomeCliente = (id?: string) =>
    clientes.find((c) => c.id === id)?.nome || "";

  const doMes = useMemo(() => {
    const { de, ate } = limitesDoMes(ano, mes);
    return agendaEntre(eventos, clientes, de, ate);
  }, [eventos, clientes, ano, mes]);

  /** Ocorrências indexadas por dia, para a grade não varrer a lista 42 vezes */
  const porDia = useMemo(() => {
    const mapa = new Map<string, Ocorrencia[]>();
    const { de, ate } = limitesDoMes(ano, mes);
    // A grade mostra pontas dos meses vizinhos; busca um pouco além.
    for (const o of agendaEntre(eventos, clientes, avancarDias(de, -7), avancarDias(ate, 7))) {
      const lista = mapa.get(o.data) || [];
      lista.push(o);
      mapa.set(o.data, lista);
    }
    return mapa;
  }, [eventos, clientes, ano, mes]);

  const proximos = useMemo(
    () =>
      agendaEntre(eventos, clientes, hoje, avancarDias(hoje, 30)).filter((o) => !o.concluido),
    [eventos, clientes, hoje]
  );

  const avisar = useMemo(
    () => paraAvisarHoje(eventos, clientes, hoje),
    [eventos, clientes, hoje]
  );

  /**
   * Notificação do navegador, uma vez por dia.
   * Sem a trava de "já avisado hoje", trocar de tela repetiria o aviso e a
   * pessoa desligaria a permissão no segundo dia.
   */
  useEffect(() => {
    if (permissao !== "concedida" || avisar.length === 0) return;
    const deHoje = avisar.filter((o) => o.data === hoje);
    const lista = deHoje.length > 0 ? deHoje : avisar;
    notificar(
      deHoje.length > 0
        ? `${deHoje.length} compromisso(s) hoje`
        : `${avisar.length} compromisso(s) chegando`,
      lista
        .slice(0, 4)
        .map((o) => `${o.hora ? o.hora + " · " : ""}${o.titulo} (${quandoTexto(o.data, hoje)})`)
        .join("\n"),
      { chave: `agenda-${hoje}`, url: "/agenda" }
    );
  }, [avisar, permissao, hoje]);

  const mudarMes = (passo: number) => {
    const m = mes + passo;
    if (m < 1) {
      setMes(12);
      setAno(ano - 1);
    } else if (m > 12) {
      setMes(1);
      setAno(ano + 1);
    } else {
      setMes(m);
    }
  };

  const irParaHoje = () => {
    setAno(Number(hoje.slice(0, 4)));
    setMes(Number(hoje.slice(5, 7)));
    setDiaAberto(hoje);
  };

  const salvar = async () => {
    if (!editando) return;
    if (!editando.titulo.trim()) return aviso.alerta("Escreva o que é o compromisso.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(soData(editando.data))) {
      return aviso.alerta("Escolha a data.");
    }
    try {
      await saveEvento({ ...editando, data: soData(editando.data) });
      setEditando(null);
    } catch (e) {
      aviso.erro(e instanceof Error ? e.message : String(e));
    }
  };

  const concluir = async (o: Ocorrencia) => {
    const e = eventos.find((x) => x.id === o.eventoId);
    if (!e) return;
    try {
      await saveEvento({ ...e, concluido: !e.concluido });
    } catch (err) {
      aviso.erro(err instanceof Error ? err.message : String(err));
    }
  };

  const ligarAvisos = async () => {
    const p = await pedirPermissao();
    setPermissao(p);
    if (p === "concedida") aviso.sucesso("Avisos ligados neste aparelho.");
    else if (p === "negada") {
      aviso.alerta(
        "O navegador bloqueou. Libere nas permissões do site — no cadeado ao lado do endereço."
      );
    }
  };

  const parabenizar = (o: Ocorrencia) => {
    const c = clientes.find((x) => x.id === o.clienteId);
    if (!c?.telefone) return aviso.alerta("Este cliente não tem telefone cadastrado.");
    abrirWhatsapp(
      c.telefone,
      `Olá ${c.nome}! Passando para desejar um feliz aniversário. Um abraço da equipe.`
    );
  };

  const doDia = porDia.get(diaAberto) || [];

  return (
    <div>
      <SectionTitle
        title="Agenda"
        subtitle={`${doMes.length} compromisso(s) em ${MESES[mes - 1]}`}
        action={
          <div className="flex flex-wrap gap-2">
            {permissao !== "concedida" && (
              <button className="btn-secondary" onClick={ligarAvisos}>
                <Bell size={18} /> Ligar avisos
              </button>
            )}
            <button className="btn-primary" onClick={() => setEditando(novoEvento(diaAberto))}>
              <Plus size={18} /> Novo compromisso
            </button>
          </div>
        }
      />

      {permissao === "negada" && (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <BellOff size={16} className="mt-0.5 shrink-0" />
          Os avisos estão bloqueados neste navegador. Libere no cadeado ao lado do
          endereço. Os lembretes do Telegram continuam chegando normalmente.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ---------- Calendário ---------- */}
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <button className="btn-ghost !p-2" onClick={() => mudarMes(-1)} title="Mês anterior">
              <ChevronLeft size={20} />
            </button>
            <button className="text-base font-bold text-slate-800" onClick={irParaHoje}>
              {MESES[mes - 1]} {ano}
            </button>
            <button className="btn-ghost !p-2" onClick={() => mudarMes(1)} title="Próximo mês">
              <ChevronRight size={20} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {DIAS_SEMANA.map((d) => (
              <div key={d} className="pb-1 text-center text-[11px] font-semibold text-slate-400">
                {d}
              </div>
            ))}

            {gradeDoMes(ano, mes).map((dia) => {
              const doOutroMes = Number(dia.slice(5, 7)) !== mes;
              const ehHoje = dia === hoje;
              const selecionado = dia === diaAberto;
              const itens = porDia.get(dia) || [];
              return (
                <button
                  key={dia}
                  onClick={() => setDiaAberto(dia)}
                  className={`flex min-h-[52px] flex-col items-center rounded-lg p-1 text-sm transition-colors sm:min-h-[64px] ${
                    selecionado
                      ? "bg-brand-600 text-white"
                      : doOutroMes
                        ? "text-slate-300 hover:bg-slate-50"
                        : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                      ehHoje && !selecionado ? "bg-brand-100 text-brand-700" : ""
                    }`}
                  >
                    {Number(dia.slice(8, 10))}
                  </span>
                  {/* Pontos coloridos: dá para ver o mês inteiro sem abrir dia por dia */}
                  <span className="mt-0.5 flex flex-wrap justify-center gap-0.5">
                    {itens.slice(0, 4).map((o, i) => (
                      <span
                        key={i}
                        className={`h-1.5 w-1.5 rounded-full ${
                          selecionado ? "bg-white/80" : TIPO_EVENTO_META[o.tipo].corPonto
                        }`}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ---------- Dia escolhido ---------- */}
          <div className="mt-4 border-t border-slate-200 pt-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold text-slate-700">
                {formatDate(diaAberto)}
                <span className="ml-2 font-normal text-slate-400">
                  {quandoTexto(diaAberto, hoje)}
                </span>
              </p>
              <button
                className="btn-secondary !py-1 !px-2.5 text-xs"
                onClick={() => setEditando(novoEvento(diaAberto))}
              >
                <Plus size={14} /> Add
              </button>
            </div>

            {doDia.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">
                Nada marcado para este dia.
              </p>
            ) : (
              <div className="space-y-2">
                {doDia.map((o, i) => (
                  <ItemAgenda
                    key={`${o.eventoId || "auto"}-${i}`}
                    o={o}
                    nomeCliente={nomeCliente}
                    onEditar={() => {
                      const e = eventos.find((x) => x.id === o.eventoId);
                      if (e) setEditando({ ...e });
                    }}
                    onConcluir={() => concluir(o)}
                    onExcluir={async () => {
                      if (!o.eventoId) return;
                      if (!confirm(`Excluir "${o.titulo}"?`)) return;
                      await removeEvento(o.eventoId);
                    }}
                    onParabenizar={() => parabenizar(o)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ---------- Próximos 30 dias ---------- */}
        <div className="card">
          <p className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
            <CalendarDays size={16} /> Próximos 30 dias
          </p>
          {proximos.length === 0 ? (
            <EmptyState
              icon={<CalendarDays size={40} />}
              title="Agenda livre"
              hint="Marque visitas, entregas e aniversários para não depender da memória."
            />
          ) : (
            <div className="max-h-[520px] space-y-2 overflow-y-auto overscroll-contain pr-1">
              {proximos.map((o, i) => (
                <button
                  key={`${o.eventoId || "auto"}-${i}`}
                  onClick={() => {
                    setAno(Number(o.data.slice(0, 4)));
                    setMes(Number(o.data.slice(5, 7)));
                    setDiaAberto(o.data);
                  }}
                  className="flex w-full items-start gap-2 rounded-lg p-2 text-left hover:bg-slate-50"
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TIPO_EVENTO_META[o.tipo].corPonto}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-700">
                      {o.titulo}
                    </span>
                    <span className="block text-xs text-slate-400">
                      {quandoTexto(o.data, hoje)}
                      {o.hora && ` · ${o.hora}`}
                      {diasAteVencer(o.data, hoje) === 0 && " · é hoje"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ---------- Cadastro ---------- */}
      <Modal
        open={!!editando}
        onClose={() => setEditando(null)}
        title={editando && eventos.some((x) => x.id === editando.id) ? "Editar compromisso" : "Novo compromisso"}
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
            <Field label="O que é *" className="sm:col-span-2">
              <input
                className="input"
                autoFocus
                placeholder="Ex.: instalar rede na loja do Marcos"
                value={editando.titulo}
                onChange={(e) => setEditando({ ...editando, titulo: e.target.value })}
              />
            </Field>

            <div className="sm:col-span-2">
              <label className="label">Tipo</label>
              <div className="grid gap-2 sm:grid-cols-3">
                {(Object.keys(TIPO_EVENTO_META) as TipoEvento[]).map((k) => {
                  const meta = TIPO_EVENTO_META[k];
                  const ativo = editando.tipo === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setEditando({ ...editando, tipo: k })}
                      className={`rounded-lg border px-3 py-2 text-left transition ${
                        ativo ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                        <span className={`h-2.5 w-2.5 rounded-full ${meta.corPonto}`} />
                        {meta.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <Field label="Data *">
              <input
                type="date"
                className="input"
                value={soData(editando.data)}
                onChange={(e) => setEditando({ ...editando, data: e.target.value })}
              />
            </Field>
            <Field label="Hora">
              <input
                type="time"
                className="input"
                value={editando.hora || ""}
                onChange={(e) => setEditando({ ...editando, hora: e.target.value })}
              />
              <p className="mt-1 text-xs text-slate-400">Em branco = o dia todo</p>
            </Field>

            <Field label="Cliente">
              <select
                className="input"
                value={editando.clienteId || ""}
                onChange={(e) =>
                  setEditando({ ...editando, clienteId: e.target.value || undefined })
                }
              >
                <option value="">Nenhum</option>
                {[...clientes]
                  .sort((a, b) => txt(a.nome).localeCompare(txt(b.nome)))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Local">
              <input
                className="input"
                placeholder="Endereço ou referência"
                value={editando.local || ""}
                onChange={(e) => setEditando({ ...editando, local: e.target.value })}
              />
            </Field>

            <Field label="Repete">
              <select
                className="input"
                value={editando.repetir || "nenhuma"}
                onChange={(e) =>
                  setEditando({ ...editando, repetir: e.target.value as RepetirEvento })
                }
              >
                {(Object.keys(REPETIR_META) as RepetirEvento[]).map((k) => (
                  <option key={k} value={k}>
                    {REPETIR_META[k].label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Avisar quantos dias antes">
              <input
                type="number"
                min={0}
                max={30}
                className="input"
                value={editando.avisarDiasAntes ?? 0}
                onChange={(e) =>
                  setEditando({ ...editando, avisarDiasAntes: Math.max(0, +e.target.value) })
                }
              />
              <p className="mt-1 text-xs text-slate-400">0 = avisa só no dia</p>
            </Field>

            <Field label="Observações" className="sm:col-span-2">
              <textarea
                className="input"
                rows={2}
                value={editando.observacoes || ""}
                onChange={(e) => setEditando({ ...editando, observacoes: e.target.value })}
              />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
};

const ItemAgenda: React.FC<{
  o: Ocorrencia;
  nomeCliente: (id?: string) => string;
  onEditar: () => void;
  onConcluir: () => void;
  onExcluir: () => void;
  onParabenizar: () => void;
}> = ({ o, nomeCliente, onEditar, onConcluir, onExcluir, onParabenizar }) => {
  const meta = TIPO_EVENTO_META[o.tipo];
  const cliente = nomeCliente(o.clienteId);
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border border-slate-200 p-2.5 ${
        o.concluido ? "opacity-50" : ""
      }`}
    >
      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${meta.corPonto}`} />
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm font-semibold text-slate-800 ${
            o.concluido ? "line-through" : ""
          }`}
        >
          {o.titulo}
          {o.idade !== undefined && (
            <span className="ml-1 font-normal text-slate-400">({o.idade} anos)</span>
          )}
        </p>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
          <span className={`badge ${meta.cor}`}>{meta.label}</span>
          {o.hora && (
            <span className="flex items-center gap-0.5">
              <Clock size={11} /> {o.hora}
            </span>
          )}
          {o.local && (
            <span className="flex items-center gap-0.5 truncate">
              <MapPin size={11} /> {o.local}
            </span>
          )}
          {cliente && !o.automatico && <span className="truncate">{cliente}</span>}
        </p>
        {o.observacoes && <p className="mt-1 text-xs text-slate-400">{o.observacoes}</p>}
      </div>

      <div className="flex shrink-0 gap-1">
        {o.automatico ? (
          // Aniversário não se edita aqui: a data mora no cadastro do cliente.
          <button
            className="btn-ghost !p-1.5 text-emerald-600"
            title="Mandar parabéns no WhatsApp"
            onClick={onParabenizar}
          >
            <MessageCircle size={15} />
          </button>
        ) : (
          <>
            <button
              className={`btn-ghost !p-1.5 ${o.concluido ? "text-emerald-600" : "text-slate-400"}`}
              title={o.concluido ? "Reabrir" : "Marcar como feito"}
              onClick={onConcluir}
            >
              <Check size={15} />
            </button>
            <button className="btn-ghost !p-1.5" title="Editar" onClick={onEditar}>
              <Pencil size={15} />
            </button>
            <button
              className="btn-ghost !p-1.5 text-red-500"
              title="Excluir"
              onClick={onExcluir}
            >
              <Trash2 size={15} />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
