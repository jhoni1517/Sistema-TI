import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Wrench,
  CheckCircle2,
  Wallet,
  AlertTriangle,
  Clock,
  TrendingUp,
  Users,
  ArrowRight,
} from "lucide-react";
import { useApp } from "../store/AppStore";
import { brl, isToday, codigoOS, formatDate } from "../lib/format";
import { receitaBruta, totalOS, lucroLiquido } from "../lib/calc";
import { OS_STATUS_META, type OSStatus } from "../lib/types";

export const Dashboard: React.FC = () => {
  const { ordens, clientes, produtos, movimentos, config } = useApp();
  const navigate = useNavigate();

  const stats = useMemo(() => {
    const abertas = ordens.filter((o) => !["entregue", "cancelada"].includes(o.status));
    const prontas = ordens.filter((o) => o.status === "pronta");
    const movHoje = movimentos.filter((m) => isToday(m.data));
    const caixaHoje = receitaBruta(movHoje);
    const aReceber = abertas
      .filter((o) => ["pronta", "aprovada", "em_reparo", "aguardando_peca"].includes(o.status))
      .reduce((s, o) => s + totalOS(o), 0);
    const estoqueBaixo = produtos.filter((p) => p.quantidade <= p.estoqueMinimo);
    const lucroMes = lucroLiquido(
      movimentos.filter((m) => m.data.slice(0, 7) === new Date().toISOString().slice(0, 7))
    );
    return { abertas, prontas, caixaHoje, aReceber, estoqueBaixo, lucroMes, movHoje };
  }, [ordens, produtos, movimentos]);

  const recentes = useMemo(
    () => [...ordens].sort((a, b) => b.numero - a.numero).slice(0, 6),
    [ordens]
  );

  const nomeCliente = (id: string) => clientes.find((c) => c.id === id)?.nome || "—";

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Olá! 👋</h1>
        <p className="text-sm text-slate-500">Resumo de hoje · {config.nomeLoja}</p>
      </div>

      {/* Cards principais */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card onClick={() => navigate("/ordens")} icon={<Wrench />} color="from-blue-500 to-blue-700" label="OS em aberto" value={String(stats.abertas.length)} />
        <Card onClick={() => navigate("/ordens")} icon={<CheckCircle2 />} color="from-emerald-500 to-emerald-700" label="Prontas p/ entrega" value={String(stats.prontas.length)} />
        <Card onClick={() => navigate("/caixa")} icon={<Wallet />} color="from-violet-500 to-violet-700" label="Recebido hoje" value={brl(stats.caixaHoje)} />
        <Card onClick={() => navigate("/relatorios")} icon={<TrendingUp />} color="from-amber-500 to-orange-600" label="Lucro líquido (mês)" value={brl(stats.lucroMes)} />
      </div>

      {/* Alertas + a receber */}
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="card">
          <p className="flex items-center gap-2 text-sm text-slate-500"><Clock size={16} /> A receber (em serviço)</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{brl(stats.aReceber)}</p>
        </div>
        <div className="card">
          <p className="flex items-center gap-2 text-sm text-slate-500"><Users size={16} /> Clientes cadastrados</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{clientes.length}</p>
        </div>
        <button
          onClick={() => navigate("/estoque")}
          className={`card text-left ${stats.estoqueBaixo.length > 0 ? "ring-2 ring-amber-300" : ""}`}
        >
          <p className="flex items-center gap-2 text-sm text-slate-500"><AlertTriangle size={16} className={stats.estoqueBaixo.length ? "text-amber-500" : ""} /> Estoque baixo</p>
          <p className={`mt-1 text-2xl font-bold ${stats.estoqueBaixo.length ? "text-amber-600" : "text-slate-800"}`}>
            {stats.estoqueBaixo.length} {stats.estoqueBaixo.length === 1 ? "item" : "itens"}
          </p>
        </button>
      </div>

      {/* OS recentes */}
      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold text-slate-700">Ordens recentes</h2>
          <button className="flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline" onClick={() => navigate("/ordens")}>
            Ver todas <ArrowRight size={14} />
          </button>
        </div>
        {recentes.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">Nenhuma ordem de serviço ainda. Crie a primeira em "Ordens de Serviço".</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentes.map((o) => (
              <div key={o.id} className="flex items-center gap-3 py-3">
                <span className="font-mono text-xs font-bold text-slate-400">{codigoOS(o.numero)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{nomeCliente(o.clienteId)}</p>
                  <p className="truncate text-xs text-slate-400">{o.marca} {o.modelo}</p>
                </div>
                <span className={`badge ${OS_STATUS_META[o.status as OSStatus].color}`}>{OS_STATUS_META[o.status as OSStatus].label}</span>
                <span className="hidden text-xs text-slate-400 sm:block">{formatDate(o.criadoEm)}</span>
                <span className="w-20 text-right text-sm font-bold text-slate-700">{brl(totalOS(o))}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const Card: React.FC<{ icon: React.ReactNode; color: string; label: string; value: string; onClick: () => void }> = ({ icon, color, label, value, onClick }) => (
  <button onClick={onClick} className={`rounded-xl bg-gradient-to-br ${color} p-5 text-left text-white shadow-sm transition hover:scale-[1.02]`}>
    <div className="mb-2 opacity-90">{icon}</div>
    <p className="text-2xl font-bold">{value}</p>
    <p className="text-sm text-white/80">{label}</p>
  </button>
);
