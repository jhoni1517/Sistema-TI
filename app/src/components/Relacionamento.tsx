import React, { useMemo, useState } from "react";
import { Cake, UserX, HandCoins, MessageCircle } from "lucide-react";
import { Modal } from "./ui";
import { useApp } from "../store/AppStore";
import { brl, formatDate, txt, abrirWhatsapp } from "../lib/format";
import {
  aniversariantesDoMes,
  mensagemAniversario,
  clientesSumidos,
  fiadosAtrasados,
  totalAtrasadoEmFiado,
} from "../lib/relacionamento";
import type { Cliente } from "../lib/types";

type Aba = "aniversarios" | "sumidos" | "atrasados";

/**
 * Motivos para falar com o cliente antes de ele sumir.
 *
 * A loja de bairro vive de quem volta, e quem volta some sem avisar. Isto
 * transforma "eu devia ligar pra alguém" numa fila de nomes com o texto
 * pronto.
 *
 * Nada dispara sozinho. A loja escolhe quem, lê o texto e manda — mensagem
 * automática de loja de bairro vira spam na primeira semana, e aí o número
 * entra no bloqueio de todo mundo.
 */
export const Relacionamento: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { clientes, vendas, ordens, fiados, config } = useApp();
  const [aba, setAba] = useState<Aba>("aniversarios");
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const ano = new Date().getFullYear();

  const aniversarios = useMemo(
    () => aniversariantesDoMes(clientes, ano, mes),
    [clientes, ano, mes]
  );
  const sumidos = useMemo(
    () => clientesSumidos(clientes, vendas, ordens),
    [clientes, vendas, ordens]
  );
  const atrasados = useMemo(() => fiadosAtrasados(fiados, clientes), [fiados, clientes]);

  const mandar = (cliente: Cliente | undefined, texto: string) => {
    abrirWhatsapp(txt(cliente?.telefone), texto);
  };

  const ABAS: { k: Aba; nome: string; n: number; icone: React.ReactNode }[] = [
    { k: "aniversarios", nome: "Aniversários", n: aniversarios.length, icone: <Cake size={15} /> },
    { k: "sumidos", nome: "Sumidos", n: sumidos.length, icone: <UserX size={15} /> },
    { k: "atrasados", nome: "Fiado vencido", n: atrasados.length, icone: <HandCoins size={15} /> },
  ];

  return (
    <Modal open onClose={onClose} title="Quem chamar hoje" maxWidth="max-w-2xl">
      <div className="mb-4 flex flex-wrap gap-2">
        {ABAS.map((a) => (
          <button
            key={a.k}
            onClick={() => setAba(a.k)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
              aba === a.k ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"
            }`}
          >
            {a.icone} {a.nome}
            {a.n > 0 && (
              <span
                className={`rounded-full px-1.5 ${
                  aba === a.k ? "bg-white/25" : "bg-slate-100"
                }`}
              >
                {a.n}
              </span>
            )}
          </button>
        ))}
      </div>

      {aba === "aniversarios" && (
        <div>
          <select
            className="input mb-3 !w-auto"
            value={mes}
            onChange={(e) => setMes(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {new Date(ano, m - 1, 1).toLocaleDateString("pt-BR", { month: "long" })}
              </option>
            ))}
          </select>

          {aniversarios.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              Ninguém faz aniversário neste mês. Cadastre a data no cliente para ela
              aparecer aqui e na Agenda.
            </p>
          ) : (
            <div className="space-y-1">
              {aniversarios.map((a) => (
                <div
                  key={a.cliente.id}
                  className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 ${
                    a.hoje ? "border-brand-300 bg-brand-50" : "border-slate-100"
                  } ${a.passou ? "opacity-50" : ""}`}
                >
                  <span className="w-8 text-center text-lg font-bold text-slate-700">
                    {a.dia}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-800">
                      {a.cliente.nome}
                      {a.hoje && (
                        <span className="badge ml-2 bg-brand-100 text-brand-700">hoje</span>
                      )}
                    </span>
                    <span className="block text-xs text-slate-400">
                      {a.cliente.telefone || "sem telefone"}
                    </span>
                  </span>
                  {a.cliente.telefone && (
                    <button
                      className="btn-secondary !py-1.5 text-xs"
                      onClick={() =>
                        mandar(a.cliente, mensagemAniversario(a.cliente, config.nomeLoja))
                      }
                    >
                      <MessageCircle size={14} /> Parabenizar
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {aba === "sumidos" && (
        <div>
          <p className="mb-3 text-xs text-slate-500">
            Quem comprava e parou há mais de 90 dias. Em ordem do que já gastou aqui —
            com uma tarde livre, ligar primeiro para quem mais deixou dinheiro na loja é
            o que muda o mês.
          </p>
          {sumidos.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              Ninguém sumiu. Bom sinal.
            </p>
          ) : (
            <div className="space-y-1">
              {sumidos.slice(0, 30).map((s) => (
                <div
                  key={s.cliente.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-100 px-3 py-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-800">
                      {s.cliente.nome}
                    </span>
                    <span className="block text-xs text-slate-400">
                      última vez {formatDate(s.ultimaVez)} · {s.diasSem} dias
                    </span>
                  </span>
                  <span className="text-sm font-bold text-slate-700">{brl(s.totalGasto)}</span>
                  {s.cliente.telefone && (
                    <button
                      className="btn-secondary !py-1.5 text-xs"
                      onClick={() => mandar(s.cliente, "")}
                    >
                      <MessageCircle size={14} /> Chamar
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {aba === "atrasados" && (
        <div>
          {atrasados.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              Nenhum fiado vencido. Só entra aqui o que tem data de vencimento
              cadastrada.
            </p>
          ) : (
            <>
              <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                <b>{brl(totalAtrasadoEmFiado(atrasados))}</b> vencidos em{" "}
                {atrasados.length} lançamento(s).
              </p>
              <div className="space-y-1">
                {atrasados.map((a) => (
                  <div
                    key={a.fiado.id}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-100 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">
                        {a.cliente?.nome || "cliente removido"}
                      </span>
                      <span className="block truncate text-xs text-slate-400">
                        {a.fiado.descricao || "fiado"} · venceu {formatDate(a.fiado.vencimento)} ·{" "}
                        {a.diasAtraso} dias
                      </span>
                    </span>
                    <span className="text-sm font-bold text-red-600">{brl(a.saldo)}</span>
                    {a.cliente?.telefone && (
                      <button
                        className="btn-secondary !py-1.5 text-xs"
                        onClick={() =>
                          mandar(
                            a.cliente,
                            // Texto seco e sem cobrança agressiva: quase todo
                            // atraso de bairro é esquecimento, e destratar
                            // quem esqueceu custa o cliente inteiro.
                            `Olá! Passando para lembrar do valor de ${brl(a.saldo)} referente a ` +
                              `${a.fiado.descricao || "compra"}, com vencimento em ` +
                              `${formatDate(a.fiado.vencimento)}. Qualquer dúvida, é só chamar.`
                          )
                        }
                      >
                        <MessageCircle size={14} /> Lembrar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
};
