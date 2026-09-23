import React, { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../store/AppStore";
import { MarcaDaLoja } from "../components/MarcaDaLoja";
import {
  colunasDoPainel,
  novasProntas,
  retratoDosStatus,
  type ColunaPainel,
} from "../lib/painel";
import type { OSStatus } from "../lib/types";

/**
 * A fila da bancada na TV da loja: tela cheia, sem menu, lida a 3 metros.
 *
 * As regras (o que vai no cartão, a ordem, o corte, quem ganha carimbo)
 * moram em lib/painel.ts. Aqui só se desenha e se atualiza.
 */

/** A cada quanto tempo busca de novo. O projeto não usa realtime. */
const SEGUNDOS_PARA_ATUALIZAR = 30;

/** Quanto tempo o carimbo fica em cima do cartão */
const SEGUNDOS_DE_CARIMBO = 6;

/** O cabeçalho de cada coluna é o carimbo do status (docs/DESIGN.md) */
const COR_DA_COLUNA: Record<ColunaPainel, string> = {
  fila: "bg-status-aberta",
  reparo: "bg-status-reparo",
  peca: "bg-status-peca",
  pronto: "bg-status-pronta",
};

export const PainelBancada: React.FC = () => {
  const { ordens, clientes, config, reload } = useApp();
  const [agora, setAgora] = useState(() => new Date());
  const [carimbadas, setCarimbadas] = useState<string[]>([]);
  const retrato = useRef<Record<string, OSStatus> | null>(null);

  /*
   * Atualiza sozinho. Falha de rede não pode derrubar a TV nem pintar erro
   * na parede da loja: a próxima volta tenta de novo, e o relógio no topo
   * mostra a hora da última leitura para quem quiser conferir.
   */
  useEffect(() => {
    const t = setInterval(() => {
      reload()
        .then(() => setAgora(new Date()))
        .catch((e) => console.error("Painel: falha ao atualizar", e));
    }, SEGUNDOS_PARA_ATUALIZAR * 1000);
    return () => clearInterval(t);
  }, [reload]);

  // Compara com a última olhada para saber quem acabou de ficar pronto.
  useEffect(() => {
    const novas = novasProntas(retrato.current, ordens);
    retrato.current = retratoDosStatus(ordens);
    if (novas.length === 0) return;
    setCarimbadas((c) => [...c, ...novas]);
    const t = setTimeout(
      () => setCarimbadas((c) => c.filter((id) => !novas.includes(id))),
      SEGUNDOS_DE_CARIMBO * 1000
    );
    return () => clearTimeout(t);
  }, [ordens]);

  const colunas = useMemo(() => colunasDoPainel(ordens, clientes), [ordens, clientes]);
  const hora = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-papel p-6 font-grotesca text-tinta">
      <header className="mb-5 flex items-center gap-4">
        <MarcaDaLoja logoUrl={config.logoUrl} tamanho={64} />
        <h1 className="min-w-0 flex-1 truncate text-4xl font-extrabold">
          {config.nomeLoja || "Bancada"}
        </h1>
        <div className="text-right">
          <p className="valor text-4xl font-semibold">{hora}</p>
          <p className="text-sm text-tinta-suave">atualiza sozinho a cada {SEGUNDOS_PARA_ATUALIZAR}s</p>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-4 gap-4">
        {colunas.map((col) => (
          <section key={col.chave} className="flex min-h-0 flex-col rounded-md border-2 border-linha bg-cartao">
            <h2
              className={`flex items-center justify-between rounded-t px-4 py-3 text-2xl font-extrabold uppercase tracking-wide text-white ${COR_DA_COLUNA[col.chave]}`}
            >
              <span>{col.titulo}</span>
              <span className="valor">{col.total}</span>
            </h2>
            <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3">
              {col.cartoes.map((c) => (
                <li
                  key={c.id}
                  className="relative rounded-md border-2 border-linha bg-papel px-4 py-3"
                >
                  <p className="valor text-2xl font-semibold text-tinta-suave">{c.codigo}</p>
                  <p className="truncate text-4xl font-extrabold leading-tight">
                    {c.primeiroNome || "—"}
                  </p>
                  <p className="truncate text-2xl text-tinta-suave">{c.aparelho}</p>
                  {carimbadas.includes(c.id) && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <span className="carimbo carimbar bg-status-pronta text-5xl outline-status-pronta">
                        Pronto
                      </span>
                    </div>
                  )}
                </li>
              ))}
              {col.total === 0 && (
                <li className="py-6 text-center text-2xl text-tinta-suave">Nada aqui</li>
              )}
            </ul>
            {col.mais > 0 && (
              <p className="border-t-2 border-dashed border-linha py-2 text-center text-2xl font-bold">
                + {col.mais}
              </p>
            )}
          </section>
        ))}
      </main>
    </div>
  );
};
