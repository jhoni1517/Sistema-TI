import React, { useEffect, useMemo, useState } from "react";
import {
  ListChecks,
  Plus,
  Trash2,
  Pencil,
  Clock,
  Bell,
  BellOff,
  Flame,
  CheckCircle2,
  Circle,
  AlertTriangle,
} from "lucide-react";
import { aviso } from "../components/Aviso";
import { useApp } from "../store/AppStore";
import { Modal, Field, EmptyState, SectionTitle } from "../components/ui";
import { uid, nowISO, txt } from "../lib/format";
import { hojeISO } from "../lib/contas";
import {
  DIAS_SEMANA,
  estaFeita,
  horaAgora,
  horarioDe,
  marcar,
  pendentesAgora,
  problemaNaTarefa,
  progressoDoDia,
  proximaDoDia,
  sequencia,
  tarefasDoDia,
} from "../lib/checklist";
import { avisarChecklist } from "../lib/notificacoes";
import type { TarefaDiaria } from "../lib/types";

const nova = (): TarefaDiaria => ({
  id: uid(),
  titulo: "",
  horario: "",
  dias: [],
  feitoEm: [],
  avisar: false,
  ativo: true,
  criadoEm: nowISO(),
});

/**
 * Checklist diário.
 *
 * O que se repete todo dia e não tem data: beber água, conferir a bancada,
 * passar no fornecedor às duas, fechar o caixa antes de sair. A agenda
 * guarda compromisso COM data; enfiar rotina lá obrigaria a criar um evento
 * por dia, para sempre, e o compromisso de verdade se perderia no meio.
 *
 * A tela é uma lista e nada mais. Marcar precisa ser um toque, porque é o
 * que se faz vinte vezes por dia entre um cliente e outro — abrir janela
 * para dizer que bebeu água é o caminho mais curto para ninguém usar.
 */
export const Checklist: React.FC = () => {
  const { tarefas, config, saveTarefa, removeTarefa } = useApp();
  const [editando, setEditando] = useState<TarefaDiaria | null>(null);
  const [gravando, setGravando] = useState(false);

  /**
   * O relógio anda enquanto a tela está aberta.
   *
   * Sem isso, quem deixa o sistema aberto no balcão o dia inteiro veria
   * "próxima: 14:00" às cinco da tarde — e o aviso do horário nunca
   * chegaria, porque nada reavalia.
   */
  const [agora, setAgora] = useState(horaAgora);
  useEffect(() => {
    const t = setInterval(() => setAgora(horaAgora()), 30000);
    return () => clearInterval(t);
  }, []);

  const hoje = hojeISO();
  const doDia = useMemo(() => tarefasDoDia(tarefas, hoje), [tarefas, hoje]);
  const progresso = useMemo(() => progressoDoDia(tarefas, hoje), [tarefas, hoje]);
  const atrasadas = useMemo(
    () => pendentesAgora(tarefas, hoje, agora),
    [tarefas, hoje, agora]
  );
  const proxima = useMemo(
    () => proximaDoDia(tarefas, hoje, agora),
    [tarefas, hoje, agora]
  );

  /*
   * Aviso na tela, no horário, com o sistema ABERTO.
   *
   * É o que dá para fazer sem servidor de push: a notificação do navegador
   * só chega enquanto o app está aberto ou instalado. Quem precisa ser
   * alcançado com o sistema desligado vai pelo Telegram, no robô diário —
   * por isso a tarefa tem o campo "avisar" separado.
   */
  useEffect(() => {
    if (atrasadas.length > 0) avisarChecklist(atrasadas, hoje);
  }, [atrasadas, hoje]);

  const alternar = async (t: TarefaDiaria) => {
    const feito = !estaFeita(t, hoje);
    try {
      await saveTarefa({ ...marcar(t, hoje, feito), atualizadoEm: nowISO() });
    } catch (e) {
      // Marcar e o banco recusar deixaria a lista mentindo até o próximo F5.
      aviso.erro(
        "Não foi possível marcar a tarefa:\n\n" + (e instanceof Error ? e.message : String(e))
      );
    }
  };

  const salvar = async () => {
    if (!editando) return;
    const problema = problemaNaTarefa(editando);
    if (problema) return aviso.alerta(problema);
    if (gravando) return;
    setGravando(true);
    try {
      await saveTarefa({ ...editando, titulo: editando.titulo.trim(), atualizadoEm: nowISO() });
      setEditando(null);
    } catch (e) {
      aviso.erro(
        "Não foi possível salvar a tarefa:\n\n" + (e instanceof Error ? e.message : String(e))
      );
    } finally {
      setGravando(false);
    }
  };

  const apagar = async (t: TarefaDiaria) => {
    // Diz o que some junto: uma sequência de 40 dias é a única coisa que a
    // pessoa não imagina que vai perder ao apagar a linha.
    const seq = sequencia(t, hoje);
    const texto =
      `Apagar "${txt(t.titulo)}"?` +
      (seq > 1 ? `\n\nVocê perde a sequência de ${seq} dias seguidos.` : "");
    if (!confirm(texto)) return;
    try {
      await removeTarefa(t.id);
    } catch (e) {
      aviso.erro(
        "Não foi possível excluir a tarefa:\n\n" + (e instanceof Error ? e.message : String(e))
      );
    }
  };

  const mudar = (patch: Partial<TarefaDiaria>) =>
    setEditando((t) => (t ? { ...t, ...patch } : t));

  const alternarDia = (d: number) =>
    setEditando((t) => {
      if (!t) return t;
      const dias = t.dias || [];
      return { ...t, dias: dias.includes(d) ? dias.filter((x) => x !== d) : [...dias, d].sort() };
    });

  return (
    <div className="max-w-2xl">
      <SectionTitle
        title="Checklist diário"
        subtitle={
          progresso.total === 0
            ? "O que precisa acontecer todo dia"
            : `${progresso.feitas} de ${progresso.total} hoje`
        }
        action={
          <button className="btn-primary" onClick={() => setEditando(nova())}>
            <Plus size={18} /> Nova tarefa
          </button>
        }
      />

      {/* Barra do dia: o número que diz se o dia fechou */}
      {progresso.total > 0 && (
        <div className="card mb-4">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm font-semibold text-slate-700">
              {progresso.completo ? "Dia fechado" : `${progresso.percentual}% do dia`}
            </span>
            <span className="text-xs text-slate-400">
              {proxima
                ? `Próxima: ${horarioDe(proxima)} ${txt(proxima.titulo)}`
                : progresso.completo
                  ? "Nada pendente"
                  : "Sem horário marcado"}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                progresso.completo ? "bg-emerald-500" : "bg-gradient-to-r from-amber-400 to-orange-500"
              }`}
              style={{ width: `${progresso.percentual}%` }}
            />
          </div>
        </div>
      )}

      {atrasadas.length > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {atrasadas.length} tarefa(s) passaram da hora e ainda não foram marcadas.
        </p>
      )}

      {doDia.length === 0 ? (
        <EmptyState
          icon={<ListChecks size={48} />}
          title="Nada no checklist de hoje"
          hint="Beber água, conferir a bancada, passar no fornecedor. O que se repete todo dia mora aqui."
        />
      ) : (
        <div className="space-y-2">
          {doDia.map((t) => {
            const feita = estaFeita(t, hoje);
            const hora = horarioDe(t);
            const atrasada = !!hora && hora <= agora && !feita;
            const seq = sequencia(t, hoje);
            return (
              <div
                key={t.id}
                className={`card flex items-center gap-3 !p-3 transition-colors ${
                  atrasada ? "ring-2 ring-amber-200" : ""
                }`}
              >
                {/* Marcar é um TOQUE: é o que se faz vinte vezes por dia,
                    entre um cliente e outro. */}
                <button
                  className="shrink-0 text-slate-300 transition-colors hover:text-emerald-500"
                  title={feita ? "Desmarcar" : "Marcar como feita"}
                  onClick={() => alternar(t)}
                >
                  {feita ? (
                    <CheckCircle2 size={26} className="text-emerald-500" />
                  ) : (
                    <Circle size={26} />
                  )}
                </button>

                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => alternar(t)}
                >
                  <p
                    className={`truncate font-semibold ${
                      feita ? "text-slate-400 line-through" : "text-slate-800"
                    }`}
                  >
                    {t.titulo}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
                    {hora && (
                      <span className={`flex items-center gap-1 ${atrasada ? "font-semibold text-amber-600" : ""}`}>
                        <Clock size={11} /> {hora}
                      </span>
                    )}
                    {t.avisar && (
                      <span className="flex items-center gap-1 text-brand-600">
                        <Bell size={11} /> avisa
                      </span>
                    )}
                    {(t.dias || []).length > 0 && (
                      <span>{(t.dias || []).map((d) => DIAS_SEMANA[d]).join(", ")}</span>
                    )}
                    {seq > 1 && (
                      <span className="flex items-center gap-1 text-orange-500">
                        <Flame size={11} /> {seq} dias
                      </span>
                    )}
                  </p>
                </button>

                <button
                  className="btn-ghost !p-2 shrink-0"
                  title="Editar"
                  onClick={() => setEditando({ ...t })}
                >
                  <Pencil size={15} />
                </button>
                <button
                  className="btn-ghost !p-2 shrink-0 text-red-400"
                  title="Excluir"
                  onClick={() => apagar(t)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Tarefas que existem mas não valem hoje: ficam à vista para não
          parecerem perdidas quando a pessoa procurar por elas. */}
      {tarefas.length > doDia.length && (
        <p className="mt-4 text-center text-xs text-slate-400">
          {tarefas.length - doDia.length} tarefa(s) não valem para hoje (outros dias da semana
          ou desligadas).
        </p>
      )}

      {editando && (
        <Modal
          open
          onClose={() => setEditando(null)}
          title={tarefas.some((t) => t.id === editando.id) ? "Editar tarefa" : "Nova tarefa"}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setEditando(null)}>
                Cancelar
              </button>
              <button className="btn-primary" disabled={gravando} onClick={salvar}>
                {gravando ? "Salvando..." : "Salvar"}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <Field label="O que precisa ser feito">
              <input
                autoFocus
                className="input"
                placeholder="Beber água, conferir a bancada, passar no fornecedor..."
                value={editando.titulo}
                onChange={(e) => mudar({ titulo: e.target.value })}
              />
            </Field>

            <Field label="Horário (opcional)">
              <input
                type="time"
                className="input"
                value={editando.horario || ""}
                onChange={(e) => mudar({ horario: e.target.value })}
              />
              <p className="mt-1 text-xs text-slate-400">
                Sem horário, ela vale para o dia todo e não cobra hora nenhuma.
              </p>
            </Field>

            <Field label="Dias da semana">
              <div className="flex flex-wrap gap-1.5">
                {DIAS_SEMANA.map((nome, d) => {
                  const marcado = (editando.dias || []).includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => alternarDia(d)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                        marcado
                          ? "border-brand-500 bg-brand-50 text-brand-700"
                          : "border-slate-200 text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      {nome}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Nenhum marcado = todo dia. É o caso comum e não dá trabalho.
              </p>
            </Field>

            <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-slate-50 p-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={!!editando.avisar}
                onChange={(e) => mudar({ avisar: e.target.checked })}
              />
              <span className="text-sm">
                <span className="font-semibold text-slate-700">
                  Avisar no Telegram no horário
                </span>
                <span className="block text-xs text-slate-500">
                  {txt(config.telegramChatId).trim()
                    ? "Chega no celular mesmo com o sistema fechado."
                    : "Configure o chat do Telegram em Configurações para este aviso funcionar."}
                </span>
              </span>
            </label>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={editando.ativo !== false}
                onChange={(e) => mudar({ ativo: e.target.checked })}
              />
              {editando.ativo === false ? (
                <span className="flex items-center gap-1 text-slate-400">
                  <BellOff size={13} /> Desligada
                </span>
              ) : (
                "Ativa"
              )}
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
};
