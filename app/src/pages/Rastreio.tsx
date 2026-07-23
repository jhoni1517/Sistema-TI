import React, { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Search, Wrench, CheckCircle2, Clock, Smartphone } from "lucide-react";
import { useApp } from "../store/AppStore";
import { brl, formatDateTime, codigoOS } from "../lib/format";
import { totalOS } from "../lib/calc";
import { OS_STATUS_META, type OSStatus } from "../lib/types";

const FLUXO: OSStatus[] = [
  "aberta",
  "em_analise",
  "aguardando_aprovacao",
  "aprovada",
  "em_reparo",
  "pronta",
  "entregue",
];

export const Rastreio: React.FC = () => {
  const { codigo } = useParams();
  const navigate = useNavigate();
  const { ordens, clientes, config, loading } = useApp();
  const [busca, setBusca] = useState(codigo || "");

  const os = useMemo(() => {
    if (!codigo) return null;
    const num = parseInt(codigo.replace(/\D/g, ""), 10);
    return ordens.find((o) => o.numero === num) || null;
  }, [codigo, ordens]);

  const clienteNome = os ? clientes.find((c) => c.id === os.clienteId)?.nome : "";
  const primeiroNome = clienteNome?.split(" ")[0] || "";

  const buscar = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(busca.replace(/\D/g, ""), 10);
    if (num) navigate(`/rastreio/${codigoOS(num)}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-brand-900 p-4">
      <div className="mx-auto max-w-lg py-10">
        {/* Cabeçalho */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 shadow-lg">
            <Wrench className="text-white" size={26} />
          </div>
          <h1 className="text-xl font-bold text-white">{config.nomeLoja}</h1>
          <p className="text-sm text-slate-400">Acompanhe sua ordem de serviço</p>
        </div>

        {/* Busca */}
        <form onSubmit={buscar} className="mb-6 flex gap-2">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-10"
              placeholder="Código da OS (ex: OS00001)"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-primary">Buscar</button>
        </form>

        {/* Resultado */}
        {loading ? (
          <div className="rounded-2xl bg-white p-10 text-center text-slate-400">Carregando...</div>
        ) : !codigo ? (
          <div className="rounded-2xl bg-white/10 p-8 text-center text-slate-300">
            Digite o código da sua ordem de serviço para ver o status.
          </div>
        ) : !os ? (
          <div className="rounded-2xl bg-white p-8 text-center">
            <p className="font-semibold text-slate-700">Ordem não encontrada</p>
            <p className="mt-1 text-sm text-slate-400">Confira o código {codigo} e tente novamente.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="bg-brand-600 p-5 text-white">
              <p className="text-sm text-brand-100">{codigoOS(os.numero)}</p>
              <p className="text-lg font-bold">Olá{primeiroNome ? `, ${primeiroNome}` : ""}! 👋</p>
              <div className="mt-3 flex items-center gap-2">
                <Smartphone size={18} />
                <span>{os.marca} {os.modelo}</span>
              </div>
            </div>

            <div className="p-5">
              {/* Status atual */}
              <div className={`mb-5 rounded-xl p-4 text-center ${OS_STATUS_META[os.status].color}`}>
                <p className="text-lg font-bold">{OS_STATUS_META[os.status].label}</p>
                <p className="mt-1 text-sm opacity-90">{OS_STATUS_META[os.status].cliente}</p>
              </div>

              {/* Valor quando pronta/aprovação */}
              {(os.status === "pronta" || os.status === "aguardando_aprovacao") && totalOS(os) > 0 && (
                <div className="mb-5 rounded-xl bg-emerald-50 p-4 text-center">
                  <p className="text-sm text-emerald-700">Valor do serviço</p>
                  <p className="text-2xl font-bold text-emerald-700">{brl(totalOS(os))}</p>
                </div>
              )}

              {/* Linha do tempo */}
              {os.status !== "cancelada" && (
                <div className="space-y-0">
                  {FLUXO.map((s, i) => {
                    const atualIdx = FLUXO.indexOf(os.status);
                    const feito = i <= atualIdx;
                    const atual = i === atualIdx;
                    return (
                      <div key={s} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className={`flex h-7 w-7 items-center justify-center rounded-full ${feito ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-400"}`}>
                            {feito ? <CheckCircle2 size={16} /> : <Clock size={14} />}
                          </div>
                          {i < FLUXO.length - 1 && <div className={`h-6 w-0.5 ${i < atualIdx ? "bg-brand-600" : "bg-slate-200"}`} />}
                        </div>
                        <div className={`pb-2 ${atual ? "font-bold text-slate-800" : feito ? "text-slate-600" : "text-slate-400"}`}>
                          {OS_STATUS_META[s].label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="mt-5 text-center text-xs text-slate-400">
                Última atualização: {formatDateTime(os.atualizadoEm)}
              </p>
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-slate-500">
          {config.telefoneLoja && `📞 ${config.telefoneLoja}`}
        </p>
      </div>
    </div>
  );
};
