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
  ListChecks,
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

/**
 * Uma alternativa do orçamento, como o servidor devolve.
 *
 * O índice é a identidade: peça dentro do jsonb não tem id próprio, e casar
 * por descrição erra quando duas opções se chamam igual.
 */
interface OpcaoPublica {
  indice: number;
  grupo: string;
  descricao: string;
  valor: number;
  escolhida: boolean;
}

/** Dados mínimos que o cliente pode ver — nada além disso sai do servidor */
interface OSPublica {
  numero: number;
  status: OSStatus;
  marca: string | null;
  modelo: string | null;
  primeiroNome: string | null;
  total: number | null;
  opcoes: OpcaoPublica[] | null;
  atualizadoEm: string | null;
}

/** Alternativas agrupadas, na ordem em que a loja montou o orçamento */
const agrupar = (opcoes: OpcaoPublica[]): { nome: string; itens: OpcaoPublica[] }[] => {
  const mapa = new Map<string, OpcaoPublica[]>();
  for (const o of opcoes) {
    const lista = mapa.get(o.grupo);
    if (lista) lista.push(o);
    else mapa.set(o.grupo, [o]);
  }
  // Grupo de um item só não é escolha, é item: ele já está somado no total.
  return [...mapa]
    .map(([nome, itens]) => ({ nome, itens }))
    .filter((g) => g.itens.length >= 2);
};

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
  /** Grupo de alternativas -> índice da opção que o cliente marcou */
  const [escolhas, setEscolhas] = useState<Record<string, number>>({});
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
        const publica = linha as OSPublica;
        setOs(publica);
        // A sugestão da loja já vem marcada; o cliente troca se quiser.
        const marcadas: Record<string, number> = {};
        for (const g of agrupar(publica.opcoes || [])) {
          const sugerida = g.itens.find((i) => i.escolhida);
          if (sugerida) marcadas[g.nome] = sugerida.indice;
        }
        setEscolhas(marcadas);
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

  const grupos = agrupar(os?.opcoes || []);
  const faltaEscolher = grupos.filter((g) => escolhas[g.nome] === undefined);

  /**
   * Total com o que está marcado agora.
   *
   * O servidor manda o total já com a sugestão da loja somada. Ao trocar de
   * opção é preciso tirar a que estava contada e pôr a nova — sem isso o
   * cliente aprovava vendo um valor e recebia outro.
   */
  const totalEscolhido = (): number => {
    let t = Number(os?.total) || 0;
    for (const g of grupos) {
      const contada = g.itens.find((i) => i.escolhida);
      const marcada = g.itens.find((i) => i.indice === escolhas[g.nome]);
      t -= Number(contada?.valor) || 0;
      t += Number(marcada?.valor) || 0;
    }
    return t;
  };

  /**
   * Índices que vão para o banco.
   *
   * Precisa listar TODAS as alternativas que valem, não só as que o cliente
   * marcou: o servidor regrava a marcação de todas de uma vez, e uma opção
   * de grupo único ficaria desmarcada — sumindo do orçamento no exato
   * momento da aprovação.
   */
  const indicesEscolhidos = (): number[] => {
    const escolhiveis = new Set(grupos.map((g) => g.nome));
    return (os?.opcoes || [])
      .filter((i) =>
        escolhiveis.has(i.grupo) ? escolhas[i.grupo] === i.indice : i.escolhida
      )
      .map((i) => i.indice);
  };

  const decidir = async (aprovar: boolean) => {
    if (!os || enviando || !supabase) return;
    if (aprovar && faltaEscolher.length > 0) {
      aviso.erro(
        `Escolha uma opção em: ${faltaEscolher.map((g) => g.nome).join(", ")}.`
      );
      return;
    }
    const texto = aprovar
      ? `Confirma a APROVAÇÃO do orçamento de ${brl(totalEscolhido())} e a execução do serviço?`
      : "Confirma que NÃO deseja realizar o serviço?";
    if (!confirm(texto)) return;
    setEnviando(true);
    try {
      const { data, error } = await supabase.rpc("responder_orcamento", {
        p_loja: loja,
        p_numero: os.numero,
        p_aprovar: aprovar,
        p_escolhas: indicesEscolhidos(),
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

              {/*
                Escolha das alternativas. Vem ANTES do valor porque é ela que
                define o valor: mostrar o total primeiro e a escolha depois
                fazia o número mudar debaixo do olho do cliente.
              */}
              {grupos.map((g) => (
                <div key={g.nome} className="mb-5 rounded-xl border border-brand-200 bg-brand-50 p-4">
                  <p className="flex items-center gap-1.5 text-sm font-bold text-brand-800">
                    <ListChecks size={16} /> Escolha: {g.nome}
                  </p>
                  <p className="mb-3 mt-0.5 text-xs text-brand-700">
                    As opções abaixo resolvem o mesmo problema.
                  </p>
                  <div className="space-y-2">
                    {g.itens.map((i) => {
                      const marcada = escolhas[g.nome] === i.indice;
                      return (
                        <label
                          key={i.indice}
                          className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 bg-white p-3 ${
                            marcada ? "border-brand-600" : "border-slate-200"
                          }`}
                        >
                          <input
                            type="radio"
                            name={`opcao-${g.nome}`}
                            className="h-4 w-4 shrink-0 accent-brand-600"
                            checked={marcada}
                            onChange={() =>
                              setEscolhas((e) => ({ ...e, [g.nome]: i.indice }))
                            }
                          />
                          <span className="flex-1 text-sm text-slate-700">
                            {i.descricao || "Opção"}
                          </span>
                          <span className="shrink-0 text-sm font-bold text-slate-800">
                            {brl(Number(i.valor) || 0)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}

              {os.total != null && os.total > 0 && (
                <div className="mb-5 rounded-xl bg-emerald-50 p-4 text-center">
                  <p className="text-sm text-emerald-700">
                    {grupos.length > 0 ? "Total com a opção escolhida" : "Valor do serviço"}
                  </p>
                  <p className="text-2xl font-bold text-emerald-700">
                    {brl(totalEscolhido())}
                  </p>
                </div>
              )}

              {os.status === "aguardando_aprovacao" && (
                <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="mb-3 text-center text-sm font-semibold text-amber-800">
                    Podemos executar o serviço?
                  </p>
                  {faltaEscolher.length > 0 && (
                    <p className="mb-3 text-center text-xs text-amber-700">
                      Antes de aprovar, escolha uma opção em{" "}
                      {faltaEscolher.map((g) => g.nome).join(", ")}.
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      className="btn-success flex-1"
                      disabled={enviando || faltaEscolher.length > 0}
                      onClick={() => decidir(true)}
                    >
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
