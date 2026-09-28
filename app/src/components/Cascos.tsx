import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Undo2 } from "lucide-react";
import { db } from "../lib/db";
import { uid, nowISO, formatDate } from "../lib/format";
import { aviso } from "./Aviso";
import { Modal, Field } from "./ui";
import { saldoDoCliente, problemaNaDevolucao } from "../lib/casco";
import type { Cliente, LancamentoCasco } from "../lib/types";

/** Lançamentos de casco, lidos pela tela (não entram na carga geral). */
export function useCascos(ligado: boolean) {
  const [lista, setLista] = useState<LancamentoCasco[] | null>(null);
  const [erro, setErro] = useState("");
  const carregar = useCallback(() => {
    if (!ligado) return;
    setErro("");
    db.cascos
      .all()
      .then(setLista)
      .catch((e) => {
        setErro(e instanceof Error ? e.message : String(e));
        setLista([]);
      });
  }, [ligado]);
  useEffect(carregar, [carregar]);
  const salvar = async (novos: LancamentoCasco[]) => {
    const gravados: LancamentoCasco[] = [];
    for (const l of novos) {
      const gravado = await db.cascos.save(l);
      gravados.push(gravado);
    }
    setLista((v) => [...(v || []), ...gravados]);
  };
  return { lista, erro, carregar, salvar };
}

/**
 * No carrinho do PDV: quantos cascos saem e quantos o cliente trouxe.
 * Nasce com "trouxe tudo", que é a troca de todo dia no balcão — só mexe
 * quem vai deixar casco com o cliente.
 */
export const CascosNaVenda: React.FC<{
  levou: Record<string, number>;
  trouxe: Record<string, number>;
  onTrouxe: (t: Record<string, number>) => void;
  saldo: Record<string, number>;
  erroCarga: string;
}> = ({ levou, trouxe, onTrouxe, saldo, erroCarga }) => {
  const tipos = Object.keys(levou);
  if (tipos.length === 0) return null;
  return (
    <div className="rounded-md border border-linha bg-cartao p-2 text-sm">
      <p className="mb-1 font-semibold">Cascos</p>
      {tipos.map((t) => {
        const deve = saldo[t] || 0;
        return (
          <div key={t} className="flex items-center justify-between gap-2 py-0.5">
            <span className="min-w-0 truncate">
              {t}: leva <b className="valor">{levou[t]}</b>
              {deve > 0 && <span className="text-tinta-suave"> · já devia {deve}</span>}
            </span>
            <label className="flex shrink-0 items-center gap-1">
              trouxe
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                className="input valor !w-16 !py-1 text-right"
                value={trouxe[t] ?? levou[t]}
                onChange={(e) => onTrouxe({ ...trouxe, [t]: e.target.value === "" ? 0 : Number(e.target.value) })}
              />
            </label>
          </div>
        );
      })}
      {erroCarga && <p className="mt-1 text-xs text-status-cancelada">Saldo de cascos não carregou: {erroCarga}</p>}
    </div>
  );
};

/** Saldo, histórico e devolução no balcão, de um cliente. */
export const CascosDoCliente: React.FC<{
  cliente: Cliente | null;
  lista: LancamentoCasco[];
  tipos: string[];
  salvar: (l: LancamentoCasco[]) => Promise<void>;
  onClose: () => void;
}> = ({ cliente, lista, tipos, salvar, onClose }) => {
  const [tipo, setTipo] = useState("");
  const [qtd, setQtd] = useState(1);
  const [gravando, setGravando] = useState(false);
  const saldo = useMemo(() => (cliente ? saldoDoCliente(lista, cliente.id) : {}), [lista, cliente]);
  const historico = useMemo(
    () => (cliente ? lista.filter((l) => l.clienteId === cliente.id).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)) : []),
    [lista, cliente]
  );
  const devendo = Object.keys(saldo).filter((t) => saldo[t] > 0);
  const tipoAtual = tipo || devendo[0] || tipos[0] || "";

  const devolver = async () => {
    if (!cliente || gravando) return;
    const problema = problemaNaDevolucao(saldo, tipoAtual, qtd);
    if (problema) return aviso.alerta(problema);
    setGravando(true);
    try {
      await salvar([{ id: uid(), clienteId: cliente.id, tipo: tipoAtual, quantidade: -qtd, obs: "Devolução no balcão", criadoEm: nowISO() }]);
      aviso.sucesso(`${qtd} casco${qtd === 1 ? "" : "s"} de ${tipoAtual} devolvido${qtd === 1 ? "" : "s"}.`);
      setQtd(1);
    } catch (e) {
      aviso.erro("Não salvou: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setGravando(false);
    }
  };

  return (
    <Modal open={!!cliente} onClose={onClose} title={`Cascos · ${cliente?.nome || ""}`}>
      {Object.keys(saldo).length === 0 ? (
        <p className="text-sm text-tinta-suave">Não deve nenhum casco.</p>
      ) : (
        <ul className="mb-3 space-y-1">
          {Object.entries(saldo).map(([t, n]) => (
            <li key={t} className="flex justify-between text-sm">
              <span>{t}</span>
              <b className="valor">{n > 0 ? `deve ${n}` : `loja deve ${-n}`}</b>
            </li>
          ))}
        </ul>
      )}

      {devendo.length > 0 && (
        <div className="mb-4 grid grid-cols-[minmax(0,1fr)_5rem_auto] items-end gap-2">
          <Field label="Devolveu">
            <select className="input" value={tipoAtual} onChange={(e) => setTipo(e.target.value)}>
              {devendo.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Quantos">
            <input type="number" min={1} step={1} className="input valor" value={qtd} onChange={(e) => setQtd(Number(e.target.value))} />
          </Field>
          <button className="btn-primary" disabled={gravando} onClick={devolver}>
            <Undo2 size={16} /> Receber
          </button>
        </div>
      )}

      <p className="mb-1 text-xs font-semibold uppercase text-tinta-suave">Histórico</p>
      {historico.length === 0 ? (
        <p className="text-sm text-tinta-suave">Nada ainda.</p>
      ) : (
        <ul className="max-h-64 divide-y divide-linha overflow-y-auto text-sm">
          {historico.map((l) => (
            <li key={l.id} className="flex justify-between gap-2 py-1.5">
              <span className="min-w-0">
                {formatDate(l.criadoEm)} · {l.quantidade > 0 ? "levou" : "devolveu"} {l.tipo}
                {l.vendaNumero ? <span className="text-tinta-suave"> · venda {l.vendaNumero}</span> : null}
              </span>
              <b className="valor shrink-0">{l.quantidade > 0 ? `+${l.quantidade}` : l.quantidade}</b>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};
