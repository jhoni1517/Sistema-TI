import React, { useMemo, useState } from "react";
import {
  Plus,
  HandCoins,
  MessageCircle,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { useApp } from "../store/AppStore";
import { Modal, Field, EmptyState, SectionTitle } from "../components/ui";
import { uid, nowISO, brl, formatDate, whatsappLink } from "../lib/format";
import { saldoFiado, pagoFiado } from "../lib/calc";
import type { Fiado, FormaPagamento } from "../lib/types";

export const AReceber: React.FC = () => {
  const {
    fiados,
    clientes,
    config,
    saveFiado,
    removeFiado,
    saveMovimento,
  } = useApp();
  const [novo, setNovo] = useState<Fiado | null>(null);
  const [receber, setReceber] = useState<Fiado | null>(null);
  const [mostrarQuitados, setMostrarQuitados] = useState(false);

  const nomeCliente = (id: string) => clientes.find((c) => c.id === id)?.nome || "—";
  const telCliente = (id: string) => clientes.find((c) => c.id === id)?.telefone || "";

  const lista = useMemo(
    () =>
      [...fiados]
        .filter((f) => (mostrarQuitados ? true : !f.quitado))
        .sort((a, b) => (a.quitado === b.quitado ? b.criadoEm.localeCompare(a.criadoEm) : a.quitado ? 1 : -1)),
    [fiados, mostrarQuitados]
  );

  const totalAberto = useMemo(
    () => fiados.filter((f) => !f.quitado).reduce((s, f) => s + saldoFiado(f), 0),
    [fiados]
  );
  const vencidos = useMemo(
    () =>
      fiados.filter(
        (f) => !f.quitado && f.vencimento && f.vencimento < nowISO().slice(0, 10)
      ).length,
    [fiados]
  );

  const novoVazio = (): Fiado => ({
    id: uid(),
    clienteId: "",
    descricao: "",
    valor: 0,
    pagamentos: [],
    quitado: false,
    vencimento: "",
    criadoEm: nowISO(),
  });

  const salvarNovo = async () => {
    if (!novo) return;
    if (!novo.clienteId) return alert("Selecione o cliente.");
    if (novo.valor <= 0) return alert("Informe o valor.");
    await saveFiado(novo);
    setNovo(null);
  };

  const registrarPagamento = async (f: Fiado, valor: number, forma: FormaPagamento) => {
    const saldo = saldoFiado(f);
    const valorReal = Math.min(valor, saldo);
    const atualizado: Fiado = {
      ...f,
      pagamentos: [...f.pagamentos, { data: nowISO(), valor: valorReal, formaPagamento: forma }],
    };
    atualizado.quitado = saldoFiado(atualizado) <= 0;
    await saveFiado(atualizado);
    // entrada no caixa
    await saveMovimento({
      id: uid(),
      tipo: "entrada",
      categoria: "Fiado",
      descricao: `Recebimento fiado - ${nomeCliente(f.clienteId)}`,
      valor: valorReal,
      formaPagamento: forma,
      data: nowISO(),
    });
    setReceber(null);
  };

  const cobrar = (f: Fiado) => {
    const tel = telCliente(f.clienteId);
    if (!tel) return alert("Cliente sem telefone cadastrado.");
    const msg =
      `*${config.nomeLoja}*\n\n` +
      `Olá ${nomeCliente(f.clienteId)}! Passando para lembrar do seu débito:\n\n` +
      `📋 ${f.descricao}\n` +
      `💰 Saldo devedor: *${brl(saldoFiado(f))}*\n` +
      (f.vencimento ? `📅 Vencimento: ${formatDate(f.vencimento)}\n` : "") +
      `\nQualquer coisa é só chamar. Obrigado!`;
    window.open(whatsappLink(tel, msg), "_blank");
  };

  return (
    <div>
      <SectionTitle
        title="A Receber (Fiado)"
        subtitle="Vendas e serviços a prazo"
        action={
          <button className="btn-primary" onClick={() => setNovo(novoVazio())}>
            <Plus size={18} /> Novo fiado
          </button>
        }
      />

      {/* Resumo */}
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="card bg-gradient-to-br from-amber-500 to-orange-600 text-white ring-orange-500">
          <p className="flex items-center gap-2 text-sm text-amber-100"><HandCoins size={16} /> Total a receber</p>
          <p className="mt-1 text-3xl font-bold">{brl(totalAberto)}</p>
        </div>
        <div className="card">
          <p className="flex items-center gap-2 text-sm text-slate-500"><Clock size={16} /> Fiados em aberto</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{fiados.filter((f) => !f.quitado).length}</p>
        </div>
        <div className="card">
          <p className="flex items-center gap-2 text-sm text-slate-500"><AlertCircle size={16} className={vencidos ? "text-red-500" : ""} /> Vencidos</p>
          <p className={`mt-1 text-2xl font-bold ${vencidos ? "text-red-600" : "text-slate-800"}`}>{vencidos}</p>
        </div>
      </div>

      <label className="mb-4 flex w-fit items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={mostrarQuitados} onChange={(e) => setMostrarQuitados(e.target.checked)} className="h-4 w-4" />
        Mostrar quitados
      </label>

      {lista.length === 0 ? (
        <EmptyState icon={<HandCoins size={48} />} title="Nenhum fiado registrado" hint="Registre vendas ou serviços a prazo aqui." />
      ) : (
        <div className="space-y-3">
          {lista.map((f) => {
            const saldo = saldoFiado(f);
            const vencido = !f.quitado && f.vencimento && f.vencimento < nowISO().slice(0, 10);
            return (
              <div key={f.id} className={`card flex flex-wrap items-center gap-4 ${vencido ? "ring-2 ring-red-200" : ""}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-slate-800">{nomeCliente(f.clienteId)}</p>
                    {f.quitado ? (
                      <span className="badge bg-emerald-100 text-emerald-700"><CheckCircle2 size={12} /> Quitado</span>
                    ) : vencido ? (
                      <span className="badge bg-red-100 text-red-700">Vencido</span>
                    ) : (
                      <span className="badge bg-amber-100 text-amber-700">Em aberto</span>
                    )}
                  </div>
                  <p className="truncate text-sm text-slate-500">{f.descricao}</p>
                  <p className="text-xs text-slate-400">
                    {formatDate(f.criadoEm)}
                    {f.vencimento ? ` · vence ${formatDate(f.vencimento)}` : ""}
                    {pagoFiado(f) > 0 ? ` · pago ${brl(pagoFiado(f))}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400">Saldo devedor</p>
                  <p className={`text-lg font-bold ${f.quitado ? "text-emerald-600" : "text-amber-600"}`}>{brl(saldo)}</p>
                </div>
                <div className="flex gap-1.5">
                  {!f.quitado && (
                    <>
                      <button className="btn-success !py-1.5 text-xs" onClick={() => setReceber(f)}>Receber</button>
                      <button className="btn-ghost !p-2" title="Cobrar no WhatsApp" onClick={() => cobrar(f)}>
                        <MessageCircle size={16} className="text-emerald-600" />
                      </button>
                    </>
                  )}
                  <button className="btn-ghost !p-2 text-red-400" title="Excluir" onClick={() => { if (confirm("Excluir este fiado?")) removeFiado(f.id); }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Novo fiado */}
      <Modal
        open={!!novo}
        onClose={() => setNovo(null)}
        title="Novo fiado"
        maxWidth="max-w-lg"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setNovo(null)}>Cancelar</button>
            <button className="btn-primary" onClick={salvarNovo}>Salvar</button>
          </>
        }
      >
        {novo && (
          <div className="grid gap-4">
            <Field label="Cliente *">
              <select className="input" value={novo.clienteId} onChange={(e) => setNovo({ ...novo, clienteId: e.target.value })}>
                <option value="">Selecione...</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </Field>
            <Field label="Descrição">
              <input className="input" placeholder="Ex: Troca de tela / venda de fone" value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Valor (R$) *">
                <input type="number" className="input" value={novo.valor} onChange={(e) => setNovo({ ...novo, valor: +e.target.value })} />
              </Field>
              <Field label="Vencimento">
                <input type="date" className="input" value={novo.vencimento} onChange={(e) => setNovo({ ...novo, vencimento: e.target.value })} />
              </Field>
            </div>
          </div>
        )}
      </Modal>

      {/* Receber pagamento */}
      {receber && (
        <ReceberModal
          fiado={receber}
          onClose={() => setReceber(null)}
          onConfirm={(v, forma) => registrarPagamento(receber, v, forma)}
        />
      )}
    </div>
  );
};

const ReceberModal: React.FC<{
  fiado: Fiado;
  onClose: () => void;
  onConfirm: (valor: number, forma: FormaPagamento) => void;
}> = ({ fiado, onClose, onConfirm }) => {
  const saldo = saldoFiado(fiado);
  const [valor, setValor] = useState(saldo);
  const [forma, setForma] = useState<FormaPagamento>("dinheiro");
  return (
    <Modal
      open
      onClose={onClose}
      title="Receber pagamento"
      maxWidth="max-w-md"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-success" onClick={() => onConfirm(valor, forma)}>Registrar {brl(Math.min(valor, saldo))}</button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          Saldo devedor: <b className="text-amber-600">{brl(saldo)}</b>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Valor a receber">
            <input type="number" autoFocus className="input" value={valor} onChange={(e) => setValor(+e.target.value)} />
          </Field>
          <Field label="Forma">
            <select className="input" value={forma} onChange={(e) => setForma(e.target.value as FormaPagamento)}>
              <option value="dinheiro">Dinheiro</option>
              <option value="pix">Pix</option>
              <option value="debito">Débito</option>
              <option value="credito">Crédito</option>
              <option value="transferencia">Transferência</option>
            </select>
          </Field>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary !py-1.5 text-xs" onClick={() => setValor(saldo)}>Valor total</button>
          <button className="btn-secondary !py-1.5 text-xs" onClick={() => setValor(saldo / 2)}>Metade</button>
        </div>
      </div>
    </Modal>
  );
};
