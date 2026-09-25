import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Frown, MessageCircle, Check, Star, Copy, ExternalLink, EyeOff, Eye } from "lucide-react";
import { useApp } from "../store/AppStore";
import { aviso } from "./Aviso";
import { Estrelas } from "./AvaliarAtendimento";
import { db, obterLoja } from "../lib/db";
import { hojeISO } from "../lib/contas";
import { formatDate, whatsappLink } from "../lib/format";
import { insatisfeitosPendentes, mensagemInsatisfeito, npsPorMes, nps, codigoWidget } from "../lib/depoimentos";
import type { Avaliacao } from "../lib/types";

/** Avaliações da loja. Não entram na carga geral: migração não rodada não pode sujar o resto. */
function useAvaliacoes() {
  const [lista, setLista] = useState<Avaliacao[] | null>(null);
  const carregar = useCallback(() => {
    db.avaliacoes
      .all()
      .then(setLista)
      .catch(() => setLista(null));
  }, []);
  useEffect(carregar, [carregar]);
  const resolver = async (id: string, patch: { resolvido?: boolean; resolucao?: string; oculto?: boolean }) => {
    try {
      await db.avaliacoes.resolver(id, patch);
      setLista((v) => (v || []).map((a) => (a.id === id ? { ...a, ...patch } : a)));
    } catch (e) {
      aviso.erro("Não salvou: " + (e instanceof Error ? e.message : String(e)));
    }
  };
  return { lista, resolver };
}

/**
 * No Painel: quem deu nota 1 a 3 e ainda não foi procurado. Aviso privado —
 * é a chance de resolver antes de virar reclamação pública.
 */
export const AlertaInsatisfeitos: React.FC = () => {
  const { lista, resolver } = useAvaliacoes();
  const { ordens, clientes, config } = useApp();
  const pendentes = useMemo(() => insatisfeitosPendentes(lista || [], hojeISO()), [lista]);
  const [gravando, setGravando] = useState("");
  if (!pendentes.length) return null;

  const resolvido = async (a: Avaliacao) => {
    if (gravando) return;
    const como = prompt("O que foi feito para resolver? (fica anotado)");
    if (como === null) return;
    setGravando(a.id);
    await resolver(a.id, { resolvido: true, resolucao: como });
    setGravando("");
  };

  return (
    <div className="card mb-6 border-red-300">
      <h3 className="mb-2 flex items-center gap-2 font-bold text-red-800">
        <Frown size={18} /> {pendentes.length} cliente(s) insatisfeito(s) esperando você
      </h3>
      <div className="divide-y divide-linha">
        {pendentes.map((a) => {
          const os = ordens.find((o) => o.id === a.osId);
          const cli = clientes.find((c) => c.id === os?.clienteId);
          const zap = cli?.telefone ? whatsappLink(cli.telefone, mensagemInsatisfeito(cli.nome, config.nomeLoja, a.aparelho)) : "";
          return (
            <div key={a.id} className="flex flex-wrap items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm">
                  <Estrelas nota={a.nota} tamanho={14} />
                  <b>{cli?.nome || a.nome || "Cliente"}</b>
                  <span className="text-tinta-suave">
                    · OS {a.numero} · {a.aparelho} · {formatDate(a.criadoEm)}
                  </span>
                </p>
                {a.comentario && <p className="text-sm">"{a.comentario}"</p>}
              </div>
              {zap && (
                <a className="btn-secondary !py-1.5 text-sm" href={zap} target="_blank" rel="noreferrer">
                  <MessageCircle size={14} /> Chamar
                </a>
              )}
              <button className="btn-secondary !py-1.5 text-sm" disabled={!!gravando} onClick={() => resolvido(a)}>
                <Check size={14} /> Resolvido
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** Em Relatórios: NPS por mês, o link dos depoimentos e o que foi publicado. */
export const PainelSatisfacao: React.FC = () => {
  const { lista, resolver } = useAvaliacoes();
  const hoje = hojeISO();
  const meses = useMemo(() => npsPorMes(lista || [], hoje, 6), [lista, hoje]);
  const geral = useMemo(() => nps((lista || []).map((a) => a.nota)), [lista]);
  const loja = obterLoja();
  const link = loja ? `${window.location.origin}${window.location.pathname}#/depoimentos/${loja}` : "";
  const publicados = (lista || []).filter((a) => a.publicar && a.comentario).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));

  if (lista === null) return null;

  const copiar = (texto: string, ok: string) =>
    navigator.clipboard
      .writeText(texto)
      .then(() => aviso.sucesso(ok))
      .catch(() => aviso.alerta("Não consegui copiar."));

  return (
    <div className="card lg:col-span-2">
      <h3 className="mb-1 flex items-center gap-2 font-bold text-tinta">
        <Star size={16} /> Satisfação dos clientes
      </h3>
      <p className="mb-3 text-xs text-tinta-suave">
        Nota dada no link de acompanhamento depois da entrega. NPS: % de notas 5 menos % de notas 1 a 3.
      </p>
      {geral.total === 0 ? (
        <p className="py-4 text-center text-sm text-tinta-suave">Nenhuma avaliação ainda. Elas chegam depois das entregas.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {meses.map((m) => (
              <div key={m.mes} className="rounded-md border border-linha p-2 text-center">
                <p className="text-xs text-tinta-suave">{m.mes.split("-").reverse().join("/")}</p>
                <p className={`valor text-xl font-bold ${m.nps === null ? "text-tinta-suave" : m.nps >= 50 ? "text-status-pronta" : m.nps < 0 ? "text-red-700" : "text-tinta"}`}>
                  {m.nps === null ? "—" : m.nps}
                </p>
                <p className="text-xs text-tinta-suave">{m.total ? `${m.total} nota(s) · ${String(m.media).replace(".", ",")}` : "sem nota"}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-sm text-tinta-suave">
            Total: {geral.total} · {geral.promotores} nota 5 · {geral.neutros} nota 4 · {geral.detratores} de 1 a 3
          </p>
        </>
      )}

      {link && (
        <div className="mt-4 flex flex-wrap gap-2">
          <a className="btn-secondary !py-1.5 text-sm" href={link} target="_blank" rel="noreferrer">
            <ExternalLink size={14} /> Página de depoimentos
          </a>
          <button className="btn-secondary !py-1.5 text-sm" onClick={() => copiar(link, "Link copiado.")}>
            <Copy size={14} /> Copiar link
          </button>
          <button className="btn-secondary !py-1.5 text-sm" onClick={() => copiar(codigoWidget(link), "Código copiado. Cole no site da loja.")}>
            <Copy size={14} /> Copiar código para o site
          </button>
        </div>
      )}

      {publicados.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 text-sm font-semibold">Comentários autorizados pelo cliente</p>
          <div className="max-h-72 divide-y divide-linha overflow-y-auto">
            {publicados.map((a) => (
              <div key={a.id} className={`flex items-start gap-2 py-2 text-sm ${a.oculto ? "opacity-50" : ""}`}>
                <div className="min-w-0 flex-1">
                  <Estrelas nota={a.nota} tamanho={12} /> <b>{a.nome}</b> · {a.aparelho}
                  <p>"{a.comentario}"</p>
                </div>
                <button
                  className="shrink-0 p-1 text-tinta-suave"
                  aria-label={a.oculto ? "Mostrar no site" : "Esconder do site"}
                  title={a.oculto ? "Mostrar no site" : "Esconder do site"}
                  onClick={() => resolver(a.id, { oculto: !a.oculto })}
                >
                  {a.oculto ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
