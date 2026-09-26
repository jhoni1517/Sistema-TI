import React, { useMemo, useState } from "react";
import { Smartphone, Undo2 } from "lucide-react";
import { useApp } from "../store/AppStore";
import { Modal, InputNumero } from "./ui";
import { aviso } from "./Aviso";
import { FotosAparelho } from "./FotosAparelho";
import { brl, formatDate, nowISO } from "../lib/format";
import { hojeISO } from "../lib/contas";
import { disponiveis, emprestado, problemaNoEmprestimo, reservasFora, LIMITE_DIAS_FORA } from "../lib/reserva";
import type { Emprestimo, OrdemServico } from "../lib/types";

/**
 * Na OS: emprestar um aparelho reserva e registrar a devolução. O termo
 * de empréstimo aparece em "Termos assinados" assim que há empréstimo.
 */
export const EmprestimoReserva: React.FC<{ os: OrdemServico }> = ({ os }) => {
  const { config, saveOrdem } = useApp();
  const [abrir, setAbrir] = useState(false);
  const [gravando, setGravando] = useState(false);
  const aparelhos = config.aparelhosReserva || [];
  const e = os.emprestimo;
  const fechada = os.status === "entregue" || os.status === "cancelada";

  if (!aparelhos.length && !e) return null;
  if (fechada && !emprestado(os)) return null;

  const devolver = async () => {
    if (gravando || !e) return;
    const estado = prompt(`Como o ${e.nome} voltou? (riscos, bateria, acessórios)`, "Mesmo estado da saída");
    if (estado === null) return;
    setGravando(true);
    try {
      await saveOrdem({ ...os, emprestimo: { ...e, devolvidoEm: nowISO(), estadoDevolucao: estado.trim() }, atualizadoEm: nowISO() });
      aviso.sucesso(e.caucao ? `Reserva devolvido. Devolva a caução de ${brl(e.caucao)}.` : "Reserva devolvido.");
    } catch (err) {
      aviso.erro("Não salvou: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setGravando(false);
    }
  };

  return (
    <div className={`rounded-lg border p-3 text-sm no-print ${emprestado(os) && fechada ? "border-red-300 bg-red-50" : "border-linha"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold">
          <Smartphone size={16} /> Aparelho reserva
        </p>
        {!e && !fechada && (
          <button className="btn-secondary !py-1 text-xs" onClick={() => setAbrir(true)}>
            Emprestar reserva
          </button>
        )}
        {e && !e.devolvidoEm && (
          <button className="btn-secondary !py-1 text-xs" disabled={gravando} onClick={devolver}>
            <Undo2 size={14} /> Registrar devolução
          </button>
        )}
      </div>
      {e ? (
        <p className="mt-1 text-tinta-suave">
          <b className="text-tinta">{e.nome}</b> · saiu {formatDate(e.emprestadoEm)} · {e.estado}
          {e.caucao ? ` · caução ${brl(e.caucao)}` : ""}
          {e.devolvidoEm ? ` · devolvido ${formatDate(e.devolvidoEm)}${e.estadoDevolucao ? ` (${e.estadoDevolucao})` : ""}` : ""}
          {!e.devolvidoEm && fechada && <b className="block text-red-700">A OS já saiu e o reserva não voltou.</b>}
        </p>
      ) : (
        <p className="mt-1 text-tinta-suave">Cliente sem celular durante o conserto? Empreste um reserva com termo assinado.</p>
      )}
      {abrir && <Emprestar os={os} onFechar={() => setAbrir(false)} />}
    </div>
  );
};

const Emprestar: React.FC<{ os: OrdemServico; onFechar: () => void }> = ({ os, onFechar }) => {
  const { config, ordens, saveOrdem } = useApp();
  const aparelhos = config.aparelhosReserva || [];
  const livres = useMemo(() => disponiveis(aparelhos, ordens), [aparelhos, ordens]);
  const [e, setE] = useState<Emprestimo>({ aparelhoId: livres[0]?.id || "", nome: livres[0]?.nome || "", imei: livres[0]?.imei, estado: "", fotos: [], emprestadoEm: nowISO() });
  const [gravando, setGravando] = useState(false);

  const ok = async () => {
    if (gravando) return;
    const problema = problemaNoEmprestimo(e, aparelhos, ordens, os.id);
    if (problema) return aviso.alerta(problema);
    setGravando(true);
    try {
      await saveOrdem({ ...os, emprestimo: { ...e, emprestadoEm: nowISO() }, atualizadoEm: nowISO() });
      aviso.sucesso("Reserva emprestado. Colha a assinatura do termo em \"Termos assinados na tela\".");
      onFechar();
    } catch (err) {
      aviso.erro("Não salvou: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setGravando(false);
    }
  };

  return (
    <Modal open onClose={onFechar} title="Emprestar aparelho reserva" footer={<button className="btn-primary" disabled={gravando} onClick={ok}>Emprestar</button>}>
      {livres.length === 0 ? (
        <p className="text-sm">Todos os reservas estão emprestados. Cadastre mais em Configurações.</p>
      ) : (
        <div className="space-y-3">
          <label className="label block">
            Aparelho
            <select
              className="input"
              value={e.aparelhoId}
              onChange={(ev) => {
                const a = livres.find((x) => x.id === ev.target.value);
                setE({ ...e, aparelhoId: ev.target.value, nome: a?.nome || "", imei: a?.imei });
              }}
            >
              {livres.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="label block">
            Estado na saída *
            <input className="input" value={e.estado} onChange={(ev) => setE({ ...e, estado: ev.target.value })} placeholder="Ex.: sem riscos, bateria 85%, com carregador" />
          </label>
          <div>
            <p className="label">Fotos do reserva</p>
            <FotosAparelho fotos={e.fotos || []} onChange={(fotos) => setE({ ...e, fotos })} pasta="reserva" max={4} />
          </div>
          <label className="label block">
            Caução (R$, opcional)
            <InputNumero className="input valor" min={0} value={e.caucao ?? null} onChange={(v) => setE({ ...e, caucao: v || undefined })} />
            <span className="text-xs font-normal text-tinta-suave">Guarde a caução fora da gaveta: ela volta para o cliente e não é venda.</span>
          </label>
        </div>
      )}
    </Modal>
  );
};

/** Painel: reserva esquecido (OS já entregue) ou fora há tempo demais. */
export const AlertaReservas: React.FC = () => {
  const { ordens, clientes } = useApp();
  const lista = useMemo(() => reservasFora(ordens, hojeISO()).filter((r) => r.esquecido || r.demorado), [ordens]);
  if (!lista.length) return null;
  return (
    <div className="card mb-6 border-red-300">
      <p className="mb-2 flex items-center gap-2 font-bold text-red-800">
        <Smartphone size={18} /> Aparelho reserva fora
      </p>
      {lista.map((r) => (
        <p key={r.os.id} className="text-sm">
          <b>{r.emprestimo.nome}</b> com {clientes.find((c) => c.id === r.os.clienteId)?.nome || "cliente"} (OS {r.os.numero}) há {r.dias} dia(s)
          {r.esquecido ? <b className="text-red-700"> · a OS já foi entregue</b> : ` · mais de ${LIMITE_DIAS_FORA} dias`}
        </p>
      ))}
    </div>
  );
};
