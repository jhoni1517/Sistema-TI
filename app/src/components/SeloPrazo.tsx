import React from "react";
import { Scale, PackageOpen } from "lucide-react";
import {
  prazoDoConserto,
  alertaDeAbandono,
  PRAZO_META,
  ABANDONO_META,
} from "../lib/prazos";
import type { OrdemServico } from "../lib/types";

/**
 * Os selos de prazo de uma OS: retorno em garantia (CDC) e aparelho parado.
 *
 * Componente porque aparece na lista, no detalhe e no painel, e três
 * cópias divergem no dia em que alguém mexe numa só. A conta mora em
 * lib/prazos.ts; aqui só se desenha.
 *
 * Retorno folgado não ganha selo na LISTA (`soRisco`): vinte selos
 * cinzentos de "no prazo" viram papel de parede, e o vermelho do que
 * vence amanhã some no meio deles. No detalhe ele aparece, porque lá a OS
 * está sozinha e a pergunta é justamente "quanto falta?".
 */
export const SeloPrazo: React.FC<{ os: OrdemServico; soRisco?: boolean }> = ({ os, soRisco }) => {
  const prazo = prazoDoConserto(os);
  const alerta = alertaDeAbandono(os);
  const mostrarPrazo = prazo && !(soRisco && prazo.situacao === "no_prazo");
  if (!mostrarPrazo && !alerta) return null;

  return (
    <>
      {mostrarPrazo && prazo && (
        <span
          className={`badge rounded ${PRAZO_META[prazo.situacao].cor}`}
          title={`Retorno em garantia: prazo de 30 dias do CDC até ${prazo.limite.split("-").reverse().join("/")}`}
        >
          <Scale size={11} /> {prazo.texto}
        </span>
      )}
      {alerta && (
        <span
          className={`badge rounded ${ABANDONO_META[alerta.marco].cor}`}
          title="Pronto e não retirado"
        >
          <PackageOpen size={11} /> {alerta.texto}
        </span>
      )}
    </>
  );
};
