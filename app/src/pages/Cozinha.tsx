import React, { useEffect, useMemo, useState } from "react";
import { aviso } from "../components/Aviso";
import { ChefHat, Flame, Check } from "lucide-react";
import { useApp } from "../store/AppStore";
import { EmptyState, SectionTitle } from "../components/ui";
import { nowISO, txt } from "../lib/format";
import {
  filaDaCozinha,
  corDaEspera,
  comPreparo,
  preparoDe,
  minutosEsperando,
  PREPARO_META,
} from "../lib/comanda";
import type { Comanda, PreparoItem } from "../lib/types";

/**
 * A fila da cozinha.
 *
 * Esta é a única tela do sistema que fica LIGADA o dia inteiro sem ninguém
 * tocar nela: ela mora num tablet velho preso na parede, do lado do forno, e
 * quem olha está com farinha na mão e o barulho da coifa em cima. Isso muda
 * todas as decisões daqui.
 *
 * - **Letra grande e cartão inteiro clicável.** Não existe alvo pequeno numa
 *   tela que se toca com o dorso do dedo.
 * - **Ordem por espera, não por mesa.** Quem pediu primeiro sai primeiro; a
 *   pizza esquecida é a que estraga a noite, e ela é sempre a mais antiga.
 * - **Sozinha atualiza.** Ninguém vai puxar para atualizar com a mão suja.
 *   O relógio corre aqui na tela mesmo quando nada chega do salão, senão os
 *   minutos congelam e a cor mente.
 * - **Não mostra preço nem cliente.** A cozinha não precisa, e o tablet fica
 *   à vista de quem passa.
 *
 * O que ela grava é uma coisa só: em que ponto está cada item. O total, a
 * conta e o caixa continuam sendo assunto da tela de Comandas.
 */

/** De quanto em quanto tempo o relógio da tela anda sozinho */
const SEGUNDOS_PARA_ATUALIZAR = 30;

export const Cozinha: React.FC = () => {
  const { comandas, saveComanda } = useApp();
  const [gravando, setGravando] = useState<string | null>(null);

  /*
   * O relógio anda mesmo sem nada mudar no salão.
   *
   * Os minutos de espera saem de `agora`, e sem este tique a tela ficaria
   * mostrando "12 min" pela noite inteira — e o cartão nunca ficaria
   * vermelho. Uma tela de cozinha que não envelhece é uma tela que mente.
   */
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), SEGUNDOS_PARA_ATUALIZAR * 1000);
    return () => clearInterval(t);
  }, []);

  const fila = useMemo(() => filaDaCozinha(comandas, agora), [comandas, agora]);

  const preparando = fila.filter((f) => preparoDe(f.item.preparo) === "preparando").length;

  const andar = async (comandaId: string, itemId: string, preparo: PreparoItem) => {
    const c = comandas.find((x) => x.id === comandaId);
    if (!c) return;
    if (gravando) return; // dedo de cozinha bate duas vezes no mesmo botão
    setGravando(itemId);
    try {
      const atualizada: Comanda = {
        ...comPreparo(c, itemId, preparo),
        atualizadoEm: nowISO(),
      };
      await saveComanda(atualizada);
    } catch (e) {
      // Sem isto o item some da fila na tela e volta na carga seguinte: a
      // cozinha faz o prato duas vezes.
      aviso.erro(
        "Não foi possível marcar o item:\n\n" + (e instanceof Error ? e.message : String(e))
      );
    } finally {
      setGravando(null);
    }
  };

  return (
    <div>
      <SectionTitle
        title="Cozinha"
        subtitle={
          fila.length === 0
            ? "Nada na fila"
            : `${fila.length} item(ns) na fila${preparando > 0 ? ` · ${preparando} no fogo` : ""}`
        }
      />

      {fila.length === 0 ? (
        <EmptyState
          icon={<ChefHat size={48} />}
          title="Fila vazia"
          hint="Os pedidos lançados nas comandas aparecem aqui sozinhos."
        />
      ) : (
        // Duas colunas no tablet de parede (1024px), três só em tela grande.
        // Em três colunas o nome do prato quebra em três linhas e a leitura
        // de longe — que é como esta tela é lida — se perde.
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {fila.map((f) => {
            const p = preparoDe(f.item.preparo);
            const minutos = minutosEsperando(f.item, agora);
            const ocupado = gravando === f.item.id;
            return (
              <div
                key={f.item.id}
                className={`card ${p === "preparando" ? "ring-2 ring-amber-300" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {/* A mesa em cima e grande: é por ela que o garçom pergunta,
                        e é ela que a cozinha grita de volta. */}
                    <p className="text-sm font-semibold text-slate-500">Mesa {f.mesa}</p>
                    <p className="text-lg font-bold leading-tight text-slate-800">
                      {f.item.quantidade > 1 && `${f.item.quantidade}x `}
                      {txt(f.item.descricao)}
                    </p>
                  </div>
                  {/* Os minutos são o dado mais importante da tela: é por eles
                      que se decide o que entra no forno agora. */}
                  <span
                    className={`shrink-0 rounded-lg px-2.5 py-1 text-base font-bold ${corDaEspera(minutos)}`}
                  >
                    {minutos} min
                  </span>
                </div>

                {/* O recado do cliente é o motivo de a cozinha errar o prato.
                    Fica destacado, não numa linha cinza no meio do resto. */}
                {txt(f.item.observacao).trim() && (
                  <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                    {txt(f.item.observacao)}
                  </p>
                )}

                {/* Sabores da pizza montada: a cozinha monta pela ORDEM em que
                    foram escolhidos, e é ela que diz de que lado cada um vai. */}
                {(f.item.sabores || []).length > 0 && (
                  <p className="mt-2 text-sm text-slate-500">
                    {(f.item.sabores || []).map((s) => s.nome).join(" + ")}
                  </p>
                )}

                <div className="mt-3 flex items-center gap-2">
                  <span className={`badge ${PREPARO_META[p].cor}`}>{PREPARO_META[p].label}</span>
                  <div className="ml-auto flex gap-2">
                    {p === "pendente" && (
                      <button
                        className="btn-primary !px-4"
                        disabled={ocupado}
                        onClick={() => andar(f.comandaId, f.item.id, "preparando")}
                      >
                        <Flame size={16} /> Comecei
                      </button>
                    )}
                    {p === "preparando" && (
                      <button
                        className="btn-success !px-4"
                        disabled={ocupado}
                        onClick={() => andar(f.comandaId, f.item.id, "pronto")}
                      >
                        <Check size={16} /> Pronto
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Item pronto SAI da fila: a cozinha não precisa mais dele, e uma tela
          que só cresce durante a noite deixa de ser lida. Quem entrega é o
          salão, na tela de Comandas. */}
      {fila.length > 0 && (
        <p className="mt-4 text-center text-xs text-slate-400">
          Marcado como pronto, o item sai desta tela. A entrega é marcada no
          salão, em Comandas.
        </p>
      )}
    </div>
  );
};
