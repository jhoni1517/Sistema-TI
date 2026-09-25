import React, { useEffect, useMemo, useState } from "react";
import { ShieldAlert, RefreshCw } from "lucide-react";
import { db } from "../lib/db";
import { brl, formatDateTime } from "../lib/format";
import { hojeISO } from "../lib/contas";
import { somarDiasISO } from "../lib/orcamento-online";
import {
  ACOES,
  alertasDoDia,
  filtrarAuditoria,
  usuariosDaAuditoria,
  valorLegivel,
  type AcaoAuditoria,
  type FiltroAuditoria,
  type RegistroAuditoria,
} from "../lib/auditoria";

/** A lista, lida uma vez por tela. Só o dono consegue: o banco não devolve para os outros. */
export function useAuditoria(dias = 180) {
  const [lista, setLista] = useState<RegistroAuditoria[] | null>(null);
  const [erro, setErro] = useState("");
  const carregar = () => {
    setErro("");
    db.auditoria
      .all(somarDiasISO(hojeISO(), -dias))
      .then(setLista)
      .catch((e) => {
        setErro(e instanceof Error ? e.message : String(e));
        setLista([]);
      });
  };
  useEffect(carregar, []);
  return { lista, erro, carregar };
}

/**
 * Auditoria: quem fez o quê. Só o dono entra (o menu e o banco cuidam
 * disso). Nada aqui se apaga — nem pelo dono.
 */
export const Auditoria: React.FC = () => {
  const { lista, erro, carregar } = useAuditoria();
  const [f, setF] = useState<FiltroAuditoria>({ acao: "", usuario: "", de: "", ate: "", busca: "" });
  const visiveis = useMemo(() => filtrarAuditoria(lista || [], f), [lista, f]);
  const alertas = useMemo(() => alertasDoDia(lista || [], hojeISO()), [lista]);
  const usuarios = useMemo(() => usuariosDaAuditoria(lista || []), [lista]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-tinta">Auditoria</h1>
          <p className="text-sm text-tinta-suave">Quem fez o quê nos últimos 6 meses. Só você vê, e nada aqui se apaga.</p>
        </div>
        <button className="btn-secondary" onClick={carregar}>
          <RefreshCw size={16} /> Atualizar
        </button>
      </div>

      {erro && <div className="card border-red-300 bg-red-50 text-sm text-red-800">{erro}</div>}

      {alertas.length > 0 && (
        <div className="card border-red-300">
          <p className="mb-1 flex items-center gap-2 font-bold text-red-800">
            <ShieldAlert size={18} /> Fora do padrão hoje
          </p>
          {alertas.map((a) => (
            <p key={a.acao + a.usuario} className="text-sm">
              {a.texto}
            </p>
          ))}
        </div>
      )}

      <div className="card grid grid-cols-2 gap-2 sm:grid-cols-5">
        <select className="input" value={f.acao} onChange={(e) => setF({ ...f, acao: e.target.value as AcaoAuditoria | "" })}>
          <option value="">Todas as ações</option>
          {(Object.keys(ACOES) as AcaoAuditoria[]).map((k) => (
            <option key={k} value={k}>
              {ACOES[k].nome}
            </option>
          ))}
        </select>
        <select className="input" value={f.usuario} onChange={(e) => setF({ ...f, usuario: e.target.value })}>
          <option value="">Todas as pessoas</option>
          {usuarios.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
        <input type="date" className="input" value={f.de} onChange={(e) => setF({ ...f, de: e.target.value })} aria-label="De" />
        <input type="date" className="input" value={f.ate} onChange={(e) => setF({ ...f, ate: e.target.value })} aria-label="Até" />
        <input className="input col-span-2 sm:col-span-1" placeholder="Buscar" value={f.busca} onChange={(e) => setF({ ...f, busca: e.target.value })} />
      </div>

      {lista === null ? (
        <p className="text-sm text-tinta-suave">Carregando...</p>
      ) : visiveis.length === 0 ? (
        <div className="card py-10 text-center text-sm text-tinta-suave">Nada registrado{lista.length ? " nesse filtro" : " ainda"}.</div>
      ) : (
        <div className="card divide-y divide-linha !p-0">
          {visiveis.slice(0, 500).map((r) => (
            <div key={r.id} className="p-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p>
                  <b>{ACOES[r.acao as AcaoAuditoria]?.nome || r.acao}</b> · {r.alvo}
                </p>
                <p className="text-xs text-tinta-suave">
                  {r.usuario || "?"} · {formatDateTime(r.criadoEm)}
                </p>
              </div>
              {(r.antes || r.depois) && (
                <p className="valor text-xs text-tinta-suave">
                  {valorLegivel(r.antes)} → {valorLegivel(r.depois)}
                </p>
              )}
              {typeof r.valor === "number" && <p className="valor text-xs">{brl(Number(r.valor))}</p>}
              {r.motivo && <p className="mt-0.5">Motivo: {r.motivo}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * No Painel, para o dono: o que fugiu do padrão hoje. Para os outros papéis
 * o banco devolve lista vazia, e o quadro nem aparece.
 */
export const AlertaAuditoria: React.FC = () => {
  const { lista } = useAuditoria(31);
  const alertas = useMemo(() => alertasDoDia(lista || [], hojeISO()), [lista]);
  if (!alertas.length) return null;
  return (
    <a href="#/auditoria" className="card mb-6 block border-red-300 hover:ring-sinal">
      <p className="mb-1 flex items-center gap-2 font-bold text-red-800">
        <ShieldAlert size={18} /> Auditoria: algo fora do padrão hoje
      </p>
      {alertas.slice(0, 3).map((a) => (
        <p key={a.acao + a.usuario} className="text-sm">
          {a.texto}
        </p>
      ))}
    </a>
  );
};
