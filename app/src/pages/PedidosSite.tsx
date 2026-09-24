import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Globe, MessageCircle, Wrench, CalendarClock, X, RefreshCw } from "lucide-react";
import { useApp } from "../store/AppStore";
import { Modal } from "../components/ui";
import { aviso } from "../components/Aviso";
import { db } from "../lib/db";
import { brl, formatDate, nowISO, uid, whatsappLink } from "../lib/format";
import { proximoNumero, problemaParaNumerar } from "../lib/numeracao";
import { clienteDoPedido, nomeDoProblema, ordenarPedidos, osDoPedido, mensagemWhatsApp } from "../lib/orcamento-online";
import type { PedidoSite } from "../lib/types";
import { novaOS } from "./OrdensServico";

const telefoneOk = (t: string) => {
  const n = t.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  return n.length >= 10 && n.length <= 11;
};

/**
 * "Orçamentos do site": quem pediu preço ou agendou pela página pública.
 *
 * Pedido que ninguém responde é cliente que foi para o concorrente, então
 * os novos vêm primeiro, com o agendado mais cedo na frente. "Virar OS"
 * cria o cliente (se ainda não existe) e a OS já com aparelho, defeito e o
 * preço que o site mostrou.
 */
export const PedidosSite: React.FC = () => {
  const { ordens, clientes, fontesComFalha, saveCliente, saveOrdem, config } = useApp();
  const navigate = useNavigate();
  const [lista, setLista] = useState<PedidoSite[] | null>(null);
  const [erro, setErro] = useState("");
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const [ocupado, setOcupado] = useState("");
  const [completar, setCompletar] = useState<PedidoSite | null>(null);

  const carregar = useCallback(async () => {
    setErro("");
    try {
      setLista(ordenarPedidos(await db.pedidosSite.all()));
    } catch (e) {
      // Sem a migração a tabela não existe: dizer isso, e não "nenhum pedido".
      setErro(e instanceof Error ? e.message : String(e));
      setLista([]);
    }
  }, []);
  useEffect(() => {
    carregar();
  }, [carregar]);

  const mudar = async (p: PedidoSite, patch: Partial<PedidoSite>) => {
    const salvo = await db.pedidosSite.save({ ...p, ...patch });
    setLista((v) => ordenarPedidos((v || []).map((x) => (x.id === p.id ? salvo : x))));
  };

  const virarOS = async (p: PedidoSite) => {
    if (ocupado) return;
    if (!p.nome.trim() || !telefoneOk(p.telefone)) return setCompletar(p);
    const semNumero = problemaParaNumerar(fontesComFalha, "ordens", "uma ordem de serviço");
    if (semNumero) return aviso.erro(semNumero);
    setOcupado(p.id);
    try {
      let cli = clienteDoPedido(p, clientes);
      if (!cli) {
        cli = { id: uid(), nome: p.nome.trim(), telefone: p.telefone.replace(/\D/g, ""), criadoEm: nowISO() };
        await saveCliente(cli);
      }
      const os = { ...novaOS(proximoNumero(ordens)), clienteId: cli.id, ...osDoPedido(p) };
      await saveOrdem(os);
      await mudar(p, { status: "convertido", osId: os.id });
      navigate("/ordens", { state: { abrirOS: os.id } });
    } catch (e) {
      aviso.erro("Não virou OS: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setOcupado("");
    }
  };

  const descartar = async (p: PedidoSite) => {
    if (ocupado) return;
    setOcupado(p.id);
    try {
      await mudar(p, { status: p.status === "descartado" ? "novo" : "descartado" });
    } catch (e) {
      aviso.erro("Não salvou: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setOcupado("");
    }
  };

  const visiveis = useMemo(() => (lista || []).filter((p) => mostrarTodos || p.status === "novo"), [lista, mostrarTodos]);
  const novos = (lista || []).filter((p) => p.status === "novo").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-tinta">Orçamentos do site</h1>
          <p className="text-sm text-tinta-suave">Quem pediu preço ou agendou pela sua página de orçamento.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={carregar}>
            <RefreshCw size={16} /> Atualizar
          </button>
        </div>
      </div>

      {!config.orcamentoSite?.ativo && (
        <div className="card border-amber-300 bg-amber-50 text-sm text-amber-900">
          A página de orçamento está desligada. Ligue em{" "}
          <Link to="/config" className="font-semibold underline">
            Configurações
          </Link>{" "}
          e ponha o link no Instagram e no Google.
        </div>
      )}

      {erro && <div className="card border-red-300 bg-red-50 text-sm text-red-800">{erro}</div>}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4" checked={mostrarTodos} onChange={(e) => setMostrarTodos(e.target.checked)} />
        Mostrar também os que já viraram OS ou foram descartados
      </label>

      {lista === null ? (
        <p className="text-sm text-tinta-suave">Carregando...</p>
      ) : visiveis.length === 0 ? (
        <div className="card py-10 text-center text-sm text-tinta-suave">
          <Globe className="mx-auto mb-2" size={28} />
          {novos === 0 && !erro ? "Nenhum pedido novo." : "Nada para mostrar."}
        </div>
      ) : (
        <div className="space-y-3">
          {visiveis.map((p) => {
            const aparelho = [p.marca, p.modelo].filter(Boolean).join(" ");
            const zap = p.telefone ? whatsappLink(p.telefone, `Oi, ${p.nome.split(" ")[0] || "tudo bem"}! Aqui é da ${config.nomeLoja}. Recebemos seu pedido de orçamento do ${aparelho}.`) : "";
            return (
              <div key={p.id} className={`card ${p.status !== "novo" ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-tinta">
                      {aparelho} · {nomeDoProblema(p.problema)}
                    </p>
                    <p className="text-sm text-tinta-suave">
                      {p.nome || "Sem nome"} {p.telefone && `· ${p.telefone}`} · {p.canal === "agenda" ? "agendou pelo site" : "chamou no WhatsApp"} ·{" "}
                      {formatDate(p.criadoEm)}
                    </p>
                    {p.detalhe && <p className="mt-1 text-sm">"{p.detalhe}"</p>}
                  </div>
                  <div className="text-right">
                    {p.preco ? (
                      <p className="valor font-bold text-tinta">a partir de {brl(Number(p.preco))}</p>
                    ) : (
                      <p className="text-sm text-tinta-suave">sem preço na tabela</p>
                    )}
                    {p.data && p.hora && (
                      <p className="mt-1 inline-flex items-center gap-1 rounded bg-sinal/10 px-2 py-0.5 text-sm font-semibold text-sinal">
                        <CalendarClock size={14} /> {p.data.split("-").reverse().join("/")} às {p.hora}
                      </p>
                    )}
                    {p.status === "convertido" && <p className="text-sm font-semibold text-status-pronta">Virou OS</p>}
                    {p.status === "descartado" && <p className="text-sm text-tinta-suave">Descartado</p>}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {p.status === "novo" && (
                    <button className="btn-primary" disabled={!!ocupado} onClick={() => virarOS(p)}>
                      <Wrench size={16} /> {ocupado === p.id ? "Criando..." : "Virar OS"}
                    </button>
                  )}
                  {zap && (
                    <a className="btn-secondary" href={zap} target="_blank" rel="noreferrer">
                      <MessageCircle size={16} /> WhatsApp
                    </a>
                  )}
                  {p.status !== "convertido" && (
                    <button className="btn-secondary" disabled={!!ocupado} onClick={() => descartar(p)}>
                      <X size={16} /> {p.status === "descartado" ? "Voltar para novos" : "Descartar"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {completar && (
        <Completar
          pedido={completar}
          onFechar={() => setCompletar(null)}
          onPronto={(nome, telefone) => {
            const p = { ...completar, nome, telefone };
            setCompletar(null);
            virarOS(p);
          }}
        />
      )}
    </div>
  );
};

/** Pedido que veio pelo WhatsApp não tem nome nem telefone: a OS precisa dos dois. */
const Completar: React.FC<{ pedido: PedidoSite; onFechar: () => void; onPronto: (nome: string, telefone: string) => void }> = ({
  pedido,
  onFechar,
  onPronto,
}) => {
  const [nome, setNome] = useState(pedido.nome);
  const [telefone, setTelefone] = useState(pedido.telefone);
  const ok = () => {
    if (nome.trim().length < 2) return aviso.alerta("Escreva o nome do cliente.");
    if (!telefoneOk(telefone)) return aviso.alerta("Escreva o WhatsApp com DDD.");
    onPronto(nome.trim(), telefone);
  };
  return (
    <Modal open onClose={onFechar} title="Quem é o cliente?" footer={<button className="btn-primary" onClick={ok}>Virar OS</button>}>
      <p className="mb-3 text-sm text-tinta-suave">
        Este pedido veio pelo WhatsApp, sem nome e telefone. Copie da conversa: "{mensagemWhatsApp(pedido).split("\n")[0]}"
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="label">
          Nome
          <input className="input" autoFocus value={nome} onChange={(e) => setNome(e.target.value)} />
        </label>
        <label className="label">
          WhatsApp
          <input className="input" inputMode="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(11) 98888-7777" />
        </label>
      </div>
    </Modal>
  );
};
