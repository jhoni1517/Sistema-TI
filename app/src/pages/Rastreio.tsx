import React, { useEffect, useState } from "react";
import { aviso } from "../components/Aviso";
import { useParams } from "react-router-dom";
import {
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
import { tokenDoLink, problemaNoLink } from "../lib/rastreio";

const FLUXO: OSStatus[] = [
  "aberta",
  "em_analise",
  "aguardando_aprovacao",
  "aprovada",
  "em_reparo",
  "pronta",
  "entregue",
];

/** Uma peça dentro de um orçamento */
interface ItemPublico {
  descricao: string;
  quantidade: number;
  valor: number;
}

/**
 * Um orçamento alternativo, como o servidor devolve.
 *
 * O total já é o do SERVIÇO INTEIRO com esta opção — mão de obra e itens
 * comuns incluídos. É sobre este número que o cliente decide, e ele não tem
 * como somar de cabeça o que está espalhado em três lugares.
 */
interface OpcaoPublica {
  nome: string;
  total: number;
  escolhida: boolean;
  itens: ItemPublico[] | null;
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

/** A loja vem do link; sem ela a consulta não retorna nada */
const lojaDoLink = (): string =>
  new URLSearchParams(window.location.hash.split("?")[1] || "").get("loja") || "";

export const Rastreio: React.FC = () => {
  const { codigo } = useParams();
  const [os, setOs] = useState<OSPublica | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  /** Nome do orçamento que o cliente marcou */
  const [escolha, setEscolha] = useState("");
  const loja = lojaDoLink();
  /**
   * Segredo da ordem, que vem no link.
   *
   * O número da OS é sequencial porque precisa ser lido no balcão — ele não
   * serve de senha. Sem este segredo, quem recebia um link trocava o número
   * e lia (ou CANCELAVA) a fila inteira da loja. Ver lib/rastreio.ts.
   */
  const token = tokenDoLink(window.location.hash);

  const numero = codigo ? parseInt(codigo.replace(/\D/g, ""), 10) : 0;

  const consultar = React.useCallback(async () => {
    if (!numero || !supabaseEnabled || !supabase) return;
    const incompleto = problemaNoLink(loja, token);
    if (incompleto) {
      setErro(incompleto);
      return;
    }
    setCarregando(true);
    setErro("");
    try {
      const { data, error } = await supabase.rpc("consultar_os", {
        p_loja: loja,
        p_numero: numero,
        p_token: token,
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
        setEscolha((publica.opcoes || []).find((o) => o.escolhida)?.nome || "");
      }
    } catch {
      setErro("Não foi possível consultar agora. Tente novamente em instantes.");
    } finally {
      setCarregando(false);
    }
  }, [numero, loja, token]);

  useEffect(() => {
    consultar();
  }, [consultar]);

  // Um orçamento só não é escolha: ele já está somado no total.
  const opcoes = (os?.opcoes || []).length >= 2 ? os?.opcoes || [] : [];
  const marcada = opcoes.find((o) => o.nome === escolha);
  const faltaEscolher = opcoes.length > 0 && !marcada;

  /** O total do orçamento marcado; sem opções, o total que o servidor mandou */
  const totalEscolhido = (): number =>
    marcada ? Number(marcada.total) || 0 : Number(os?.total) || 0;

  const decidir = async (aprovar: boolean) => {
    if (!os || enviando || !supabase) return;
    if (aprovar && faltaEscolher) {
      aviso.erro("Escolha uma das opções antes de aprovar.");
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
        p_escolha: marcada?.nome ?? null,
        p_token: token,
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

        {carregando ? (
          <div className="rounded-2xl bg-white p-10 text-center text-slate-400">Consultando...</div>
        ) : !codigo ? (
          <div className="rounded-2xl bg-white/10 p-8 text-center text-slate-300">
            Abra o link que a assistência enviou para acompanhar o seu aparelho.
          </div>
        ) : erro || !os || !meta ? (
          <div className="rounded-2xl bg-white p-8 text-center">
            <p className="font-semibold text-slate-700">
              {erro || "Não encontramos esta ordem de serviço."}
            </p>
            {/* "Confira o código" mandava conferir o que está certo: o código
                o cliente tem. O que falta é o link inteiro, e quem resolve
                isso é a loja. */}
            <p className="mt-1 text-sm text-slate-400">
              Use sempre o link que a assistência enviou. Se ele não abrir, peça um novo.
            </p>
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
                Escolha do orçamento. Vem ANTES do valor porque é ela que
                define o valor: mostrar o total primeiro e a escolha depois
                fazia o número mudar debaixo do olho do cliente.
              */}
              {opcoes.length > 0 && (
                <div className="mb-5">
                  <p className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
                    <ListChecks size={16} /> Escolha uma opção de conserto
                  </p>
                  <p className="mb-3 mt-0.5 text-xs text-slate-500">
                    Cada opção já é o valor do serviço completo.
                  </p>
                  <div className="space-y-2">
                    {opcoes.map((op) => {
                      const ativa = escolha === op.nome;
                      return (
                        <label
                          key={op.nome}
                          className={`flex cursor-pointer gap-3 rounded-xl border-2 p-3 ${
                            ativa ? "border-brand-600 bg-brand-50" : "border-slate-200 bg-white"
                          }`}
                        >
                          <input
                            type="radio"
                            name="opcao-orcamento"
                            className="mt-1 h-4 w-4 shrink-0 accent-brand-600"
                            checked={ativa}
                            onChange={() => setEscolha(op.nome)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <b className="text-sm text-slate-800">{op.nome}</b>
                              <b className="shrink-0 text-base text-slate-800">
                                {brl(Number(op.total) || 0)}
                              </b>
                            </span>
                            {/* Sem os itens o cliente escolhe entre dois preços
                                sem saber o que muda de um para o outro. */}
                            <span className="mt-1 block space-y-0.5 text-xs text-slate-500">
                              {(op.itens || []).map((i, n) => (
                                <span key={n} className="block">
                                  {i.descricao}
                                  {Number(i.quantidade) > 1 ? ` (${i.quantidade}x)` : ""} —{" "}
                                  {brl(Number(i.valor) || 0)}
                                </span>
                              ))}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {os.total != null && os.total > 0 && (
                <div className="mb-5 rounded-xl bg-emerald-50 p-4 text-center">
                  <p className="text-sm text-emerald-700">
                    {opcoes.length > 0 ? "Total com a opção escolhida" : "Valor do serviço"}
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
                  {faltaEscolher && (
                    <p className="mb-3 text-center text-xs text-amber-700">
                      Antes de aprovar, escolha uma das opções acima.
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      className="btn-success flex-1"
                      disabled={enviando || faltaEscolher}
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
