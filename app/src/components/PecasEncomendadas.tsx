import React, { useMemo, useState } from "react";
import { Truck, Plus, Check, X } from "lucide-react";
import { useApp } from "../store/AppStore";
import { Modal, InputNumero } from "./ui";
import { aviso } from "./Aviso";
import { brl, formatDate, nowISO, uid, whatsappLink } from "../lib/format";
import { hojeISO } from "../lib/contas";
import { pecasACaminho, problemaNoPedido, mensagemPecaChegou } from "../lib/pedido-peca";
import type { OrdemServico, PedidoPeca } from "../lib/types";

/**
 * Na OS: a peça encomendada, de quem, por quanto e para quando. Quando a
 * nota de entrada da peça é lançada, ela chega sozinha; o "Chegou" aqui é
 * para quando a peça vem sem nota.
 */
export const PecasEncomendadas: React.FC<{ os: OrdemServico }> = ({ os }) => {
  const { saveOrdem, clientes, config } = useApp();
  const [novo, setNovo] = useState(false);
  const [gravando, setGravando] = useState(false);
  const lista = os.pedidosPeca || [];
  if (os.status === "entregue" || os.status === "cancelada") return null;
  if (os.status !== "aguardando_peca" && lista.length === 0) return null;

  const gravar = async (pedidosPeca: PedidoPeca[], extra: Partial<OrdemServico> = {}) => {
    if (gravando) return false;
    setGravando(true);
    try {
      await saveOrdem({ ...os, ...extra, pedidosPeca, atualizadoEm: nowISO() });
      return true;
    } catch (e) {
      aviso.erro("Não salvou: " + (e instanceof Error ? e.message : String(e)));
      return false;
    } finally {
      setGravando(false);
    }
  };

  const chegou = async (p: PedidoPeca) => {
    const agora = nowISO();
    const nova = lista.map((x) => (x.id === p.id ? { ...x, status: "chegou" as const, chegouEm: agora } : x));
    const volta = os.status === "aguardando_peca" && !nova.some((x) => x.status === "pedido");
    const ok = await gravar(
      nova,
      volta ? { status: "em_reparo", historico: [...os.historico, { data: agora, status: "em_reparo", nota: `Peça chegou: ${p.descricao}` }] } : {}
    );
    const cli = clientes.find((c) => c.id === os.clienteId);
    if (ok && cli?.telefone) window.open(whatsappLink(cli.telefone, mensagemPecaChegou(cli.nome, config.nomeLoja, os)), "_blank");
  };

  return (
    <div className="rounded-lg border border-linha p-3 text-sm no-print">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold">
          <Truck size={16} /> Peça encomendada
        </p>
        <button className="btn-secondary !py-1 text-xs" onClick={() => setNovo(true)}>
          <Plus size={14} /> Pedir peça
        </button>
      </div>
      {lista.length === 0 ? (
        <p className="text-tinta-suave">Anote de quem pediu, o valor e a previsão. A nota de entrada reserva a peça para esta OS.</p>
      ) : (
        <div className="divide-y divide-linha">
          {lista.map((p) => (
            <div key={p.id} className={`flex flex-wrap items-center gap-2 py-1.5 ${p.status === "cancelado" ? "opacity-50 line-through" : ""}`}>
              <span className="min-w-0 flex-1">
                <b>{p.descricao}</b>
                {p.quantidade > 1 && ` × ${p.quantidade}`}
                <span className="text-tinta-suave">
                  {p.fornecedor && ` · ${p.fornecedor}`}
                  {p.valor ? ` · ${brl(p.valor)}` : ""}
                  {p.status === "pedido" && p.previsao && ` · previsão ${formatDate(p.previsao)}`}
                  {p.status === "chegou" && p.chegouEm && ` · chegou ${formatDate(p.chegouEm)} (reservada)`}
                </span>
              </span>
              {p.status === "pedido" && (
                <>
                  <button className="btn-secondary !py-1 text-xs" disabled={gravando} onClick={() => chegou(p)}>
                    <Check size={14} /> Chegou
                  </button>
                  <button
                    className="p-1 text-tinta-suave hover:text-red-600"
                    aria-label="Cancelar pedido"
                    disabled={gravando}
                    onClick={() => confirm(`Cancelar o pedido de ${p.descricao}?`) && gravar(lista.map((x) => (x.id === p.id ? { ...x, status: "cancelado" as const } : x)))}
                  >
                    <X size={14} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {novo && (
        <NovoPedido
          onFechar={() => setNovo(false)}
          onPronto={async (p) => {
            const extra: Partial<OrdemServico> =
              os.status !== "aguardando_peca"
                ? { status: "aguardando_peca", historico: [...os.historico, { data: nowISO(), status: "aguardando_peca", nota: `Peça pedida: ${p.descricao}` }] }
                : {};
            if (await gravar([...lista, p], extra)) setNovo(false);
          }}
        />
      )}
    </div>
  );
};

const NovoPedido: React.FC<{ onFechar: () => void; onPronto: (p: PedidoPeca) => void }> = ({ onFechar, onPronto }) => {
  const { produtos, fornecedores } = useApp();
  const pecas = useMemo(() => produtos.filter((p) => !p.servico), [produtos]);
  const [p, setP] = useState<PedidoPeca>({ id: uid(), descricao: "", quantidade: 1, status: "pedido", pedidoEm: nowISO() });
  const [texto, setTexto] = useState("");
  const ok = () => {
    const problema = problemaNoPedido(p);
    if (problema) return aviso.alerta(problema);
    onPronto(p);
  };
  return (
    <Modal open onClose={onFechar} title="Pedir peça" footer={<button className="btn-primary" onClick={ok}>Anotar pedido</button>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="label sm:col-span-2">
          Peça *
          <input
            className="input"
            list="pecas-pedido"
            autoFocus
            value={texto}
            placeholder="Busque no estoque ou escreva"
            onChange={(e) => {
              const v = e.target.value;
              setTexto(v);
              const achado = pecas.find((x) => x.nome === v);
              setP({ ...p, descricao: v, produtoId: achado?.id, valor: p.valor || (achado ? Number(achado.custo) || undefined : undefined) });
            }}
          />
          <datalist id="pecas-pedido">
            {pecas.map((x) => (
              <option key={x.id} value={x.nome} />
            ))}
          </datalist>
          <span className="text-xs font-normal text-tinta-suave">
            {p.produtoId ? "Do estoque: a nota de entrada reconhece e reserva para esta OS." : "Fora do estoque: marque \"Chegou\" à mão."}
          </span>
        </label>
        <label className="label">
          Fornecedor
          <input className="input" list="forn-pedido" value={p.fornecedor || ""} onChange={(e) => setP({ ...p, fornecedor: e.target.value })} />
          <datalist id="forn-pedido">
            {fornecedores.map((f) => (
              <option key={f.id} value={f.nome} />
            ))}
          </datalist>
        </label>
        <label className="label">
          Previsão de chegada
          <input type="date" className="input" min={hojeISO()} value={p.previsao || ""} onChange={(e) => setP({ ...p, previsao: e.target.value || undefined })} />
        </label>
        <label className="label">
          Quantidade
          <InputNumero className="input" min={1} value={p.quantidade} onChange={(v) => setP({ ...p, quantidade: v ?? 1 })} />
        </label>
        <label className="label">
          Valor (R$)
          <InputNumero className="input valor" min={0} value={p.valor ?? null} onChange={(v) => setP({ ...p, valor: v })} />
        </label>
      </div>
    </Modal>
  );
};

/** Painel: tudo que foi pedido e não chegou, com o atrasado em destaque. */
export const PecasACaminho: React.FC = () => {
  const { ordens, clientes } = useApp();
  const lista = useMemo(() => pecasACaminho(ordens, hojeISO()), [ordens]);
  if (!lista.length) return null;
  const atrasadas = lista.filter((x) => x.atraso > 0).length;
  return (
    <div className={`card mb-6 ${atrasadas ? "border-red-300" : ""}`}>
      <p className="mb-2 flex items-center gap-2 font-bold text-tinta">
        <Truck size={18} /> Peças a caminho: {lista.length}
        {atrasadas > 0 && <span className="text-red-700">({atrasadas} atrasada{atrasadas > 1 ? "s" : ""})</span>}
      </p>
      <div className="divide-y divide-linha text-sm">
        {lista.slice(0, 8).map(({ os, pedido, atraso }) => (
          <a key={pedido.id} href="#/ordens" className={`flex flex-wrap gap-x-2 py-1.5 ${atraso ? "font-semibold text-red-700" : ""}`}>
            <span className="valor">OS {os.numero}</span>
            <span className="min-w-0 flex-1">
              {pedido.descricao} · {clientes.find((c) => c.id === os.clienteId)?.nome || ""}
            </span>
            <span className="text-xs">
              {atraso ? `${atraso} dia(s) de atraso` : pedido.previsao ? `previsão ${formatDate(pedido.previsao)}` : "sem previsão"}
              {pedido.fornecedor ? ` · ${pedido.fornecedor}` : ""}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
};
