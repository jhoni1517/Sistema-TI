import React, { useCallback, useEffect, useMemo, useState } from "react";
import { PackageX, Plus, AlertTriangle, RefreshCw } from "lucide-react";
import { useApp } from "../store/AppStore";
import { Modal, InputNumero } from "../components/ui";
import { aviso } from "../components/Aviso";
import { FotosAparelho } from "../components/FotosAparelho";
import { db } from "../lib/db";
import { brl, formatDate, nowISO, uid } from "../lib/format";
import { hojeISO } from "../lib/contas";
import {
  STATUS_RMA,
  GARANTIA_FORNECEDOR_PADRAO,
  alertasDeGarantia,
  dinheiroParado,
  mudarStatusRMA,
  problemaNoRMA,
  resultadoRMA,
  venceEm,
} from "../lib/rma";
import type { RMA, StatusRMA } from "../lib/types";

/** Lista de RMAs, lida pela tela (não entra na carga geral). */
export function useRmas() {
  const [lista, setLista] = useState<RMA[] | null>(null);
  const [erro, setErro] = useState("");
  const carregar = useCallback(() => {
    setErro("");
    db.rmas
      .all()
      .then(setLista)
      .catch((e) => {
        setErro(e instanceof Error ? e.message : String(e));
        setLista([]);
      });
  }, []);
  useEffect(carregar, [carregar]);
  const salvar = async (r: RMA) => {
    const gravado = await db.rmas.save(r);
    setLista((v) => {
      const l = v || [];
      return l.some((x) => x.id === gravado.id) ? l.map((x) => (x.id === gravado.id ? gravado : x)) : [...l, gravado];
    });
    return gravado;
  };
  return { lista, erro, carregar, salvar };
}

/**
 * Trocas com fornecedor (RMA): peça com defeito que tem que voltar para
 * quem vendeu. O número grande é o dinheiro parado. Conta em lib/rma.ts.
 */
export const Trocas: React.FC = () => {
  const { config } = useApp();
  const { lista, erro, carregar, salvar } = useRmas();
  const [editando, setEditando] = useState<RMA | null>(null);
  const [verFechados, setVerFechados] = useState(false);
  const hoje = hojeISO();
  const alertas = useMemo(() => alertasDeGarantia(lista || [], hoje), [lista, hoje]);
  const res = useMemo(() => resultadoRMA(lista || []), [lista]);
  const visiveis = useMemo(
    () =>
      (lista || [])
        .filter((r) => verFechados || STATUS_RMA[r.status]?.aberto)
        .sort((a, b) => Number(STATUS_RMA[b.status]?.aberto) - Number(STATUS_RMA[a.status]?.aberto) || b.criadoEm.localeCompare(a.criadoEm)),
    [lista, verFechados]
  );

  const novo = (): RMA => {
    const agora = nowISO();
    return {
      id: uid(),
      descricao: "",
      quantidade: 1,
      valor: 0,
      fornecedor: "",
      garantiaFornecedorDias: config.garantiaFornecedorDias || GARANTIA_FORNECEDOR_PADRAO,
      status: "enviar",
      historico: [{ data: agora, status: "enviar" }],
      fotos: [],
      criadoEm: agora,
      atualizadoEm: agora,
    };
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-tinta">Trocas com fornecedor</h1>
          <p className="text-sm text-tinta-suave">Peça com defeito que tem que voltar para quem vendeu.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={carregar}>
            <RefreshCw size={16} />
          </button>
          <button className="btn-primary" onClick={() => setEditando(novo())}>
            <Plus size={16} /> Nova troca
          </button>
        </div>
      </div>

      {erro && <div className="card border-red-300 bg-red-50 text-sm text-red-800">{erro}</div>}

      <div className="grid grid-cols-3 gap-2">
        <div className="card !p-3">
          <p className="text-xs text-tinta-suave">Dinheiro parado</p>
          <p className="valor text-base font-bold text-red-700 sm:text-xl">{brl(res.parado)}</p>
        </div>
        <div className="card !p-3">
          <p className="text-xs text-tinta-suave">Recuperado</p>
          <p className="valor text-base font-bold text-status-pronta sm:text-xl">{brl(res.recuperado)}</p>
        </div>
        <div className="card !p-3">
          <p className="text-xs text-tinta-suave">Negado (perda)</p>
          <p className="valor text-base font-bold sm:text-xl">{brl(res.perdido)}</p>
        </div>
      </div>

      {alertas.length > 0 && (
        <div className="card border-amber-300 bg-amber-50 text-sm text-amber-900">
          <p className="mb-1 flex items-center gap-2 font-bold">
            <AlertTriangle size={16} /> Mande antes que a garantia do fornecedor acabe
          </p>
          {alertas.map((a) => (
            <p key={a.rma.id}>{a.texto}</p>
          ))}
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4" checked={verFechados} onChange={(e) => setVerFechados(e.target.checked)} />
        Mostrar também os resolvidos
      </label>

      {lista === null ? (
        <p className="text-sm text-tinta-suave">Carregando...</p>
      ) : visiveis.length === 0 ? (
        <div className="card py-10 text-center text-sm text-tinta-suave">
          <PackageX className="mx-auto mb-2" size={28} />
          Nenhuma troca em aberto. Na OS de retorno em garantia, use "Peça com defeito".
        </div>
      ) : (
        <div className="space-y-2">
          {visiveis.map((r) => {
            const v = venceEm(r);
            return (
              <button key={r.id} className="card flex w-full flex-wrap items-center gap-3 text-left hover:ring-sinal" onClick={() => setEditando(r)}>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-tinta">
                    {r.descricao} {r.quantidade > 1 && `× ${r.quantidade}`}
                  </p>
                  <p className="text-sm text-tinta-suave">
                    {r.fornecedor || "Fornecedor não informado"}
                    {r.numeroNota && ` · nota ${r.numeroNota}`}
                    {r.osNumero && ` · OS ${r.osNumero}`}
                    {v && r.status === "enviar" && ` · garantia até ${formatDate(v)}`}
                  </p>
                </div>
                <span className="valor font-semibold">{brl(r.valor * r.quantidade)}</span>
                <span className="rounded bg-papel px-2 py-0.5 text-xs font-semibold">{STATUS_RMA[r.status]?.nome}</span>
              </button>
            );
          })}
        </div>
      )}

      {editando && (
        <EditarRMA
          rma={editando}
          onFechar={() => setEditando(null)}
          onSalvar={async (r) => {
            await salvar(r);
            setEditando(null);
          }}
        />
      )}
    </div>
  );
};

const EditarRMA: React.FC<{ rma: RMA; onFechar: () => void; onSalvar: (r: RMA) => Promise<void> }> = ({ rma, onFechar, onSalvar }) => {
  const { fornecedores } = useApp();
  const [r, setR] = useState<RMA>(rma);
  const [status, setStatus] = useState<StatusRMA>(rma.status);
  const [obs, setObs] = useState("");
  const [credito, setCredito] = useState<number | undefined>(rma.valorRecuperado);
  const [gravando, setGravando] = useState(false);

  const salvar = async () => {
    if (gravando) return;
    const problema = problemaNoRMA(r);
    if (problema) return aviso.alerta(problema);
    setGravando(true);
    try {
      const final = status !== r.status || obs.trim() ? mudarStatusRMA(r, status, nowISO(), obs, credito) : { ...r, atualizadoEm: nowISO() };
      await onSalvar(final);
      aviso.sucesso("Troca salva.");
    } catch (e) {
      aviso.erro("Não salvou: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setGravando(false);
    }
  };

  return (
    <Modal
      open
      onClose={onFechar}
      title={rma.osNumero ? `Troca da peça · OS ${rma.osNumero}` : "Troca com fornecedor"}
      maxWidth="max-w-2xl"
      footer={
        <button className="btn-primary" disabled={gravando} onClick={salvar}>
          {gravando ? "Salvando..." : "Salvar"}
        </button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="label sm:col-span-2">
          Peça *
          <input className="input" value={r.descricao} onChange={(e) => setR({ ...r, descricao: e.target.value })} />
        </label>
        <label className="label">
          Fornecedor *
          <input className="input" list="fornecedores-rma" value={r.fornecedor} onChange={(e) => setR({ ...r, fornecedor: e.target.value })} />
          <datalist id="fornecedores-rma">
            {fornecedores.map((f) => (
              <option key={f.id} value={f.nome} />
            ))}
          </datalist>
        </label>
        <label className="label">
          Nota de entrada
          <input className="input" value={r.numeroNota || ""} onChange={(e) => setR({ ...r, numeroNota: e.target.value })} />
        </label>
        <label className="label">
          Data da compra
          <input type="date" className="input" value={r.dataCompra || ""} onChange={(e) => setR({ ...r, dataCompra: e.target.value || undefined })} />
        </label>
        <label className="label">
          Garantia do fornecedor (dias)
          <InputNumero className="input" min={0} value={r.garantiaFornecedorDias} onChange={(v) => setR({ ...r, garantiaFornecedorDias: v ?? 0 })} />
        </label>
        <label className="label">
          Quantidade
          <InputNumero className="input" min={1} value={r.quantidade} onChange={(v) => setR({ ...r, quantidade: v ?? 1 })} />
        </label>
        <label className="label">
          Custo unitário (R$)
          <InputNumero className="input valor" min={0} value={r.valor} onChange={(v) => setR({ ...r, valor: v ?? 0 })} />
        </label>
        <label className="label sm:col-span-2">
          Defeito
          <input className="input" value={r.defeito || ""} onChange={(e) => setR({ ...r, defeito: e.target.value })} />
        </label>
        <div className="sm:col-span-2">
          <p className="label">Fotos da peça</p>
          <FotosAparelho fotos={r.fotos || []} onChange={(fotos) => setR({ ...r, fotos })} pasta="rma" max={4} />
        </div>

        <div className="rounded-md border border-linha p-3 sm:col-span-2">
          <p className="label">Situação</p>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(STATUS_RMA) as StatusRMA[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`rounded-md border px-2.5 py-1 text-sm ${status === s ? "border-sinal bg-sinal/10 font-semibold" : "border-linha"}`}
              >
                {STATUS_RMA[s].nome}
              </button>
            ))}
          </div>
          {status === "credito" && (
            <label className="label mt-2 block">
              Valor do crédito (R$) *
              <InputNumero className="input valor" min={0} value={credito ?? null} onChange={setCredito} />
            </label>
          )}
          <input className="input mt-2" placeholder="Anotação (código de rastreio, protocolo...)" value={obs} onChange={(e) => setObs(e.target.value)} />
          {(r.historico || []).length > 0 && (
            <div className="mt-2 text-xs text-tinta-suave">
              {r.historico.map((h, i) => (
                <p key={i}>
                  {formatDate(h.data)} · {STATUS_RMA[h.status]?.nome}
                  {h.obs ? ` · ${h.obs}` : ""}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

/** No Painel: dinheiro parado em troca e garantia do fornecedor vencendo. */
export const AlertaTrocas: React.FC = () => {
  const { lista } = useRmas();
  const hoje = hojeISO();
  const alertas = useMemo(() => alertasDeGarantia(lista || [], hoje), [lista, hoje]);
  const parado = useMemo(() => dinheiroParado(lista || []), [lista]);
  if (!alertas.length) return null;
  return (
    <a href="#/trocas" className="card mb-6 block border-amber-300 hover:ring-sinal">
      <p className="flex items-center gap-2 font-bold text-amber-900">
        <PackageX size={18} /> {alertas.length} peça(s) para mandar ao fornecedor antes da garantia acabar
      </p>
      <p className="text-sm">
        {alertas[0].texto}
        {alertas.length > 1 ? ` e mais ${alertas.length - 1}` : ""}. <span className="valor">{brl(parado)}</span> parados em troca.
      </p>
    </a>
  );
};
