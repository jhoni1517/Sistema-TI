import React, { useMemo, useState } from "react";
import { CalendarRange, MessageCircle, Copy } from "lucide-react";
import { useApp } from "../store/AppStore";
import { Modal } from "./ui";
import { aviso } from "./Aviso";
import { abrirWhatsapp, soDigitos } from "../lib/format";
import { hojeISO } from "../lib/contas";
import { resumoDaSemana } from "../lib/resumo-semanal";

/**
 * "Resumo da semana" no Painel. O mesmo texto que o robô manda no Telegram
 * às segundas; aqui ele vai para o WhatsApp do próprio dono, que é onde ele
 * lê. Nenhuma conta na tela: tudo em lib/resumo-semanal.ts.
 */
export const ResumoSemana: React.FC = () => {
  const { movimentos, ordens, produtos, clientes, config } = useApp();
  const [aberto, setAberto] = useState(false);
  const texto = useMemo(
    () => (aberto ? resumoDaSemana({ movimentos, ordens, produtos, clientes }, hojeISO(), config.nomeLoja) : ""),
    [aberto, movimentos, ordens, produtos, clientes, config.nomeLoja]
  );
  const zap = soDigitos(config.telefoneLoja);

  return (
    <>
      <button className="btn-secondary !py-1.5 text-sm" onClick={() => setAberto(true)}>
        <CalendarRange size={16} /> Resumo da semana
      </button>
      <Modal open={aberto} onClose={() => setAberto(false)} title="Resumo da semana passada" maxWidth="max-w-md">
        <pre className="whitespace-pre-wrap rounded-md bg-papel p-3 font-grotesca text-sm">{texto.replace(/\*/g, "")}</pre>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button
            className="btn-secondary"
            onClick={() =>
              navigator.clipboard
                .writeText(texto)
                .then(() => aviso.sucesso("Resumo copiado."))
                .catch(() => aviso.alerta("Não deu para copiar."))
            }
          >
            <Copy size={16} /> Copiar
          </button>
          <button className="btn-primary" onClick={() => abrirWhatsapp(zap, texto)}>
            <MessageCircle size={16} /> {zap ? "Me mandar no WhatsApp" : "Mandar no WhatsApp"}
          </button>
        </div>
        {!zap && (
          <p className="mt-2 text-xs text-tinta-suave">Cadastre o WhatsApp da loja em Configurações para ele ir direto para você.</p>
        )}
        <p className="mt-2 text-xs text-tinta-suave">
          Com o Telegram da loja configurado, este resumo chega sozinho toda segunda de manhã.
        </p>
      </Modal>
    </>
  );
};
