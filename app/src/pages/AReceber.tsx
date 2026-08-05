import React, { useMemo, useState } from "react";
import { aviso } from "../components/Aviso";
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
import { Modal, Field, EmptyState, SectionTitle, InputNumero } from "../components/ui";
import { uid, nowISO, brl, formatDate, abrirWhatsapp, negrito, txt } from "../lib/format";
import { saldoFiado, pagoFiado } from "../lib/calc";
import { travaAtendimento, travaFiado } from "../lib/clientes";
import { hojeISO } from "../lib/contas";
import { aoApagarFiado, textoDaConfirmacao } from "../lib/exclusao";
import { sessaoAberta as achaSessaoAberta } from "../lib/caixa";
import type { Fiado, FormaPagamento } from "../lib/types";

export const AReceber: React.FC = () => {
  const {
    fiados,
    clientes,
    config,
    sessoes,
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
        .sort((a, b) => (a.quitado === b.quitado ? txt(b.criadoEm).localeCompare(txt(a.criadoEm)) : a.quitado ? 1 : -1)),
    [fiados, mostrarQuitados]
  );

  const totalAberto = useMemo(
    () => fiados.filter((f) => !f.quitado).reduce((s, f) => s + saldoFiado(f), 0),
    [fiados]
  );
  const vencidos = useMemo(
    () =>
      fiados.filter(
        (f) => !f.quitado && f.vencimento && f.vencimento < hojeISO()
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

  const [lancando, setLancando] = useState(false);

  const salvarNovo = async () => {
    if (!novo) return;
    if (!novo.clienteId) return aviso.alerta("Selecione o cliente.");
    if (novo.valor <= 0) return aviso.alerta("Informe o valor.");

    /*
     * O teto de fiado e a classificação valiam SÓ pelo caminho da ordem de
     * serviço. Este aqui — "Novo fiado", digitado no balcão — é o caminho
     * mais curto e mais usado para fiar alguém, e passava direto.
     *
     * O teto existe justamente para isso: é decisão do dono, tomada uma vez
     * com a cabeça fria, em vez de decisão do atendente com fila esperando.
     * Deixar o atalho aberto é o mesmo que não ter teto.
     *
     * Nenhum dos dois bloqueia: a tela pergunta e o dono autoriza. Sistema
     * que não deixa fazer nada é contornado por fora, e aí o fiado volta a
     * não existir no sistema.
     */
    const c = clientes.find((x) => x.id === novo.clienteId);
    const trava = travaAtendimento(c);
    if (
      trava.bloqueia &&
      !confirm(`${trava.titulo}\n\nMotivo: ${trava.motivo}\n\nFiar mesmo assim?`)
    ) {
      return;
    }
    const teto = travaFiado(c, fiados, novo.valor);
    if (teto.estoura && !confirm(`${teto.motivo}\n\nLançar mesmo assim?`)) return;
    // Dois cliques = a mesma dívida lançada duas vezes, e o cliente cobrado
    // pelo dobro do que deve.
    if (lancando) return;
    setLancando(true);
    try {
      await saveFiado(novo);
    } catch (e) {
      return aviso.erro(
        "Não foi possível lançar a dívida:\n\n" + (e instanceof Error ? e.message : String(e))
      );
    } finally {
      setLancando(false);
    }
    setNovo(null);
  };

  const [recebendo, setRecebendo] = useState(false);

  const registrarPagamento = async (f: Fiado, valor: number, forma: FormaPagamento) => {
    const saldo = saldoFiado(f);
    const valorReal = Math.min(valor, saldo);
    if (valorReal <= 0) return aviso.alerta("Informe o valor recebido.");
    if (recebendo) return; // clique duplo no balcão acontece o tempo todo
    setRecebendo(true);

    try {
      /*
       * Dinheiro primeiro, sempre.
       *
       * Estava ao contrário: dava baixa na dívida e SÓ ENTÃO lançava o
       * caixa. Falhando no meio, a dívida sumia e o dinheiro nunca entrava
       * — a loja perdia o registro do valor e o direito de cobrar de uma
       * vez. Na ordem certa sobra uma entrada sem baixa, que aparece na
       * conferência e se conserta olhando o A Receber.
       */
      await saveMovimento({
        id: uid(),
        tipo: "entrada",
        categoria: "Fiado",
        descricao: `Recebimento fiado - ${nomeCliente(f.clienteId)}`,
        valor: valorReal,
        formaPagamento: forma,
        data: nowISO(),
        // Sem a sessão, dinheiro de fiado recebido no balcão não entrava no
        // fechamento: a gaveta acusava sobra todo dia, sem origem.
        sessaoId: achaSessaoAberta(sessoes)?.id,
      });

      const atualizado: Fiado = {
        ...f,
        pagamentos: [...f.pagamentos, { data: nowISO(), valor: valorReal, formaPagamento: forma }],
      };
      atualizado.quitado = saldoFiado(atualizado) <= 0;
      await saveFiado(atualizado);

      setReceber(null);
      aviso.sucesso(
        atualizado.quitado
          ? `${brl(valorReal)} recebidos. Dívida quitada.`
          : `${brl(valorReal)} recebidos. Restam ${brl(saldoFiado(atualizado))}.`
      );
    } catch (e) {
      // Erro engolido aqui é dívida que some sem dinheiro entrar.
      aviso.erro(
        "Não foi possível registrar o recebimento:\n\n" +
          (e instanceof Error ? e.message : String(e))
      );
    } finally {
      setRecebendo(false);
    }
  };

  /**
   * "Excluir este fiado?" não é pergunta, é armadilha — a mesma do cliente,
   * com dinheiro dentro. Fiado com pagamento recebido tem lançamento de
   * entrada no caixa apontando para ele: some a dívida, ficam as entradas.
   */
  const apagar = async (f: Fiado) => {
    const r = aoApagarFiado(f, nomeCliente(f.clienteId));
    if (!r.pode) {
      return aviso.alerta(
        `${r.titulo}\n\n${r.perdas.map((p) => `- ${p}`).join("\n")}\n\n${r.saida}`
      );
    }
    if (!confirm(textoDaConfirmacao(r))) return;
    try {
      await removeFiado(f.id);
    } catch (e) {
      // Antes nem await tinha: a exclusão falhava calada e o fiado voltava
      // na carga seguinte, como se o sistema o tivesse ressuscitado.
      aviso.erro(
        "Não foi possível excluir o fiado:\n\n" +
          (e instanceof Error ? e.message : String(e))
      );
    }
  };

  const cobrar = (f: Fiado) => {
    const tel = telCliente(f.clienteId);
    if (!tel) return aviso.alerta("Cliente sem telefone cadastrado.");
    const msg =
      `${negrito(config.nomeLoja)}\n\n` +
      `Olá ${nomeCliente(f.clienteId)}! Passando para lembrar do seu débito:\n\n` +
      // Sem emoji: em alguns aparelhos chega como "?" e suja o recado.
      `${f.descricao}\n` +
      `Saldo devedor: *${brl(saldoFiado(f))}*\n` +
      (f.vencimento ? `Vencimento: ${formatDate(f.vencimento)}\n` : "") +
      `\nQualquer coisa é só chamar. Obrigado!`;
    abrirWhatsapp(tel, msg);
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
            const vencido = !f.quitado && f.vencimento && f.vencimento < hojeISO();
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
                  <button
                    className="btn-ghost !p-2 text-red-400"
                    title="Excluir"
                    onClick={() => apagar(f)}
                  >
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
            <button className="btn-primary" disabled={lancando} onClick={salvarNovo}>{lancando ? "Salvando..." : "Salvar"}</button>
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
                <InputNumero value={novo.valor} onChange={(v) => setNovo({ ...novo, valor: v ?? 0 })} />
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
            <InputNumero autoFocus value={valor} onChange={(v) => setValor(v ?? 0)} />
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
