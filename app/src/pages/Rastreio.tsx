import React, { useEffect, useState } from "react";
import { aviso } from "../components/Aviso";
import { useParams, useNavigate } from "react-router-dom";
import {
  Search,
  Wrench,
  CheckCircle2,
  Clock,
  Smartphone,
  ThumbsUp,
  ThumbsDown,
  ShieldCheck,
} from "lucide-react";
import { supabase, supabaseEnabled } from "../lib/supabase";
import { brl, formatDateTime, codigoOS } from "../lib/format";
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

/** Dados mínimos que o cliente pode ver — nada além disso sai do servidor */
interface OSPublica {
  numero: number;
  status: OSStatus;
  marca: string | null;
  modelo: string | null;
  primeiroNome: string | null;
  total: number | null;
  atualizadoEm: string | null;
}

/** A loja vem do link; sem ela a consulta não retorna nada */
const lojaDoLink = (): string =>
  new URLSearchParams(window.location.hash.split("?")[1] || "").get("loja") || "";

export const Rastreio: React.FC = () => {
  const { codigo } = useParams();
  const navigate = useNavigate();
  const [busca, setBusca] = useState(codigo || "");
  const [os, setOs] = useState<OSPublica | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const loja = lojaDoLink();

  const numero = codigo ? parseInt(codigo.replace(/\D/g, ""), 10) : 0;

  const consultar = React.useCallback(async () => {
    if (!numero || !supabaseEnabled || !supabase) return;
    if (!loja) {
      setErro("Link incompleto. Peça um novo link para a assistência.");
      return;
    }
    setCarregando(true);
    setErro("");
    try {
      const { data, error } = await supabase.rpc("consultar_os", {
        p_loja: loja,
        p_numero: numero,
      });
      if (error) throw error;
      const linha = Array.isArray(data) ? data[0] : data;
      if (!linha) {
        setOs(null);
        setErro("Ordem não encontrada.");
      } else {
        setOs(linha as OSPublica);
      }
    } catch {
      setErro("Não foi possível consultar agora. Tente novamente em instantes.");
    } finally {
      setCarregando(false);
    }
  }, [numero, loja]);

  useEffect(() => {
    consultar();
  }, [consultar]);

  const buscar = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(busca.replace(/\D/g, ""), 10);
    if (n) navigate(`/rastreio/${codigoOS(n)}?loja=${loja}`);
  };

  const decidir = async (aprovar: boolean) => {
    if (!os || enviando || !supabase) return;
    const texto = aprovar
      ? "Confirma a APROVAÇÃO do orçamento e a execução do serviço?"
      : "Confirma que NÃO deseja realizar o serviço?";
    if (!confirm(texto)) return;
    setEnviando(true);
    try {
      const { data, error } = await supabase.rpc("responder_orcamento", {
        p_loja: loja,
        p_numero: os.numero,
        p_aprovar: aprovar,
      });
      if (error || data === false) throw new Error();
      await consultar();
    } catch {
      aviso.erro("Não foi possível registrar sua resposta. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  };

  const meta = os ? OS_STATUS_META[os.status] : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-brand-900 p-4">
      <div className="mx-auto max-w-lg py-10">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 shadow-lg">
            <Wrench className="text-white" size={26} />
          </div>
          <h1 className="text-xl font-bold text-white">Acompanhe seu aparelho</h1>
          <p className="text-sm text-slate-400">Consulte pelo código da ordem de serviço</p>
        </div>

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

        {carregando ? (
          <div className="rounded-2xl bg-white p-10 text-center text-slate-400">Consultando...</div>
        ) : !codigo ? (
          <div className="rounded-2xl bg-white/10 p-8 text-center text-slate-300">
            Digite o código da sua ordem de serviço para ver o status.
          </div>
        ) : erro || !os || !meta ? (
          <div className="rounded-2xl bg-white p-8 text-center">
            <p className="font-semibold text-slate-700">{erro || "Ordem não encontrada"}</p>
            <p className="mt-1 text-sm text-slate-400">Confira o código e tente novamente.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="bg-brand-600 p-5 text-white">
              <p className="text-sm text-brand-100">{codigoOS(os.numero)}</p>
              <p className="text-lg font-bold">
                Olá{os.primeiroNome ? `, ${os.primeiroNome}` : ""}!
              </p>
              <div className="mt-3 flex items-center gap-2">
                <Smartphone size={18} />
                <span>{[os.marca, os.modelo].filter(Boolean).join(" ") || "Seu aparelho"}</span>
              </div>
            </div>

            <div className="p-5">
              <div className={`mb-5 rounded-xl p-4 text-center ${meta.color}`}>
                <p className="text-lg font-bold">{meta.label}</p>
                <p className="mt-1 text-sm opacity-90">{meta.cliente}</p>
              </div>

              {os.total != null && os.total > 0 && (
                <div className="mb-5 rounded-xl bg-emerald-50 p-4 text-center">
                  <p className="text-sm text-emerald-700">Valor do serviço</p>
                  <p className="text-2xl font-bold text-emerald-700">{brl(Number(os.total))}</p>
                </div>
              )}

              {os.status === "aguardando_aprovacao" && (
                <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="mb-3 text-center text-sm font-semibold text-amber-800">
                    Podemos executar o serviço?
                  </p>
                  <div className="flex gap-2">
                    <button className="btn-success flex-1" disabled={enviando} onClick={() => decidir(true)}>
                      <ThumbsUp size={16} /> Aprovar
                    </button>
                    <button className="btn-secondary flex-1" disabled={enviando} onClick={() => decidir(false)}>
                      <ThumbsDown size={16} /> Não quero
                    </button>
                  </div>
                </div>
              )}

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
                          {i < FLUXO.length - 1 && (
                            <div className={`h-6 w-0.5 ${i < atualIdx ? "bg-brand-600" : "bg-slate-200"}`} />
                          )}
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
                Última atualização: {formatDateTime(os.atualizadoEm || undefined)}
              </p>
            </div>
          </div>
        )}

        <p className="mt-6 flex items-center justify-center gap-1 text-center text-xs text-slate-500">
          <ShieldCheck size={12} /> Esta página mostra apenas o andamento do seu serviço
        </p>
      </div>
    </div>
  );
};
