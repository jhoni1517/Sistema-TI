import React, { useEffect, useMemo, useState } from "react";
import { HeartPulse, MessageCircle, ChevronDown, ChevronUp } from "lucide-react";
import { saudeDasLojas, type Loja } from "../lib/assinatura";
import { avaliarLojas, linkSaude, NOMES_FUNCOES, type Grupo, type SaudeLoja, type UsoRecente } from "../lib/saude";

const GRUPOS: { grupo: Grupo; titulo: string; dica: string; cor: string }[] = [
  { grupo: "risco", titulo: "Em risco", dica: "O uso caiu mais da metade nas últimas 4 semanas.", cor: "text-status-cancelada" },
  { grupo: "teste_acabando", titulo: "Teste acabando sem uso", dica: "Faltam 3 dias ou menos e a loja quase não mexeu.", cor: "text-status-peca" },
  { grupo: "feliz", titulo: "Ativas e felizes", dica: "Pagando e usando bem: hora de pedir indicação ou depoimento.", cor: "text-status-pronta" },
];

/**
 * Painel "Saúde das lojas" (admin). Contagem em `saude_das_lojas()`, regras
 * em lib/saude.ts. Falha de carga aparece aqui e não derruba a lista de
 * lojas logo abaixo.
 */
export const SaudeLojas: React.FC<{ lojas: Loja[] }> = ({ lojas }) => {
  const [uso, setUso] = useState<Record<string, UsoRecente> | null | undefined>(undefined);
  const [todas, setTodas] = useState(false);

  useEffect(() => {
    saudeDasLojas()
      .then(setUso)
      .catch(() => setUso(null));
  }, []);

  const hoje = new Date().toISOString().slice(0, 10);
  const saude = useMemo(() => (uso ? avaliarLojas(lojas, uso, hoje) : []), [lojas, uso, hoje]);

  if (uso === undefined) return <div className="esqueleto mb-5 h-24 w-full" />;
  if (uso === null)
    return (
      <p className="card mb-5 text-sm text-tinta-suave">
        <b className="text-tinta">Saúde das lojas:</b> não carregou. Se ainda não rodou o supabase-migracao-saude.sql, é isso.
      </p>
    );

  return (
    <div className="card mb-5">
      <p className="mb-3 flex items-center gap-2 font-bold">
        <HeartPulse size={18} className="text-sinal" /> Saúde das lojas
      </p>
      <div className="grid gap-4 lg:grid-cols-3">
        {GRUPOS.map((g) => {
          const lista = saude.filter((s) => s.grupo === g.grupo);
          return (
            <div key={g.grupo} className="min-w-0">
              <p className={`text-sm font-bold ${g.cor}`}>
                {g.titulo} · <span className="valor">{lista.length}</span>
              </p>
              <p className="mb-2 text-xs text-tinta-suave">{g.dica}</p>
              {lista.length === 0 ? (
                <p className="text-sm text-tinta-suave">Ninguém agora.</p>
              ) : (
                <div className="space-y-2">
                  {lista.map((s) => (
                    <Linha key={s.loja.id} s={s} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button className="mt-4 flex items-center gap-1 text-sm underline" onClick={() => setTodas(!todas)}>
        {todas ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        {todas ? "Esconder a lista completa" : `Todas as ${saude.length} lojas por risco de cancelar`}
      </button>
      {todas && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-tinta-suave">
              <tr>
                <th className="py-1 pr-2">Loja</th>
                <th className="py-1 pr-2">Risco</th>
                <th className="py-1 pr-2">Sem uso</th>
                <th className="py-1 pr-2">OS+vendas/sem.</th>
                <th className="py-1 pr-2">Funções</th>
                <th className="py-1">Assinatura</th>
              </tr>
            </thead>
            <tbody>
              {saude.map((s) => (
                <tr key={s.loja.id} className="border-t border-linha align-top">
                  <td className="py-1.5 pr-2 font-semibold">{s.loja.nome}</td>
                  <td className="valor py-1.5 pr-2">{s.risco}</td>
                  <td className="valor py-1.5 pr-2">{s.diasSemUso === null ? "nunca" : `${s.diasSemUso} d`}</td>
                  <td className="valor py-1.5 pr-2">
                    {fmt(s.porSemana)} <span className="text-tinta-suave">(antes {fmt(s.porSemanaAntes)})</span>
                  </td>
                  <td className="py-1.5 pr-2">{s.funcoes.map((f) => NOMES_FUNCOES[f] || f).join(", ") || "—"}</td>
                  <td className="py-1.5">{assinatura(s)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const fmt = (n: number) => String(n).replace(".", ","); // texto-cru-proposital: formata número, não compara

function assinatura(s: SaudeLoja): string {
  if (s.loja.isento) return "isenta";
  if (s.teste !== null) return (s.loja.venceEm || "").slice(0, 10) < new Date().toISOString().slice(0, 10) ? "teste acabou" : `teste, faltam ${s.teste} d`;
  return { ativa: "em dia", tolerancia: "atrasada", leitura: "só leitura", bloqueada: "bloqueada" }[s.situacao];
}

const Linha: React.FC<{ s: SaudeLoja }> = ({ s }) => (
  <div className="flex items-start justify-between gap-2 rounded-md border border-linha p-2">
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold">{s.loja.nome}</p>
      <p className="text-xs text-tinta-suave">
        {s.diasSemUso === null ? "nunca usou" : s.diasSemUso === 0 ? "usou hoje" : `${s.diasSemUso} d sem uso`} ·{" "}
        <span className="valor">{fmt(s.porSemana)}</span>/sem. (antes <span className="valor">{fmt(s.porSemanaAntes)}</span>) · risco{" "}
        <span className="valor">{s.risco}</span>
      </p>
    </div>
    <a
      className="btn-secondary shrink-0 !px-2 !py-1 text-xs"
      href={linkSaude(s)}
      target="_blank"
      rel="noreferrer"
      title={s.loja.whatsapp ? "Abrir conversa com a mensagem pronta" : "Loja sem WhatsApp: escolha o contato"}
    >
      <MessageCircle size={14} /> WhatsApp
    </a>
  </div>
);
