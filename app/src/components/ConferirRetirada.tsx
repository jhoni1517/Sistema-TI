import React, { useRef, useState } from "react";
import { KeyRound, Camera, Check } from "lucide-react";
import { Modal } from "./ui";
import { aviso } from "./Aviso";
import { obterLoja, emDemo } from "../lib/db";
import { enviarDocumento } from "../lib/imagens";
import { nowISO } from "../lib/format";
import { pinConfere, problemaSemPin } from "../lib/retirada";
import type { OrdemServico } from "../lib/types";

export type Retirada = NonNullable<OrdemServico["retirada"]>;

/**
 * Na entrega: digitar o código que o cliente recebeu. Sem código, só com
 * motivo e foto do documento de quem está levando (vai para a auditoria).
 * Nada de dinheiro acontece antes daqui: desistir não deixa lançamento solto.
 */
export const ConferirRetirada: React.FC<{
  os: OrdemServico;
  onFechar: (r: Retirada | null) => void;
}> = ({ os, onFechar }) => {
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState("");
  const [tentativas, setTentativas] = useState(0);
  const [semPin, setSemPin] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [documento, setDocumento] = useState("");
  const [enviando, setEnviando] = useState(false);
  const camera = useRef<HTMLInputElement>(null);

  const conferir = () => {
    if (pinConfere(pin, os.pinRetirada)) return onFechar({ comPin: true, em: nowISO() });
    setTentativas((t) => t + 1);
    setErro("Código não confere. Peça para o cliente conferir no link ou na mensagem de pronto.");
    setPin("");
  };

  const foto = async (f?: File) => {
    if (!f) return;
    setEnviando(true);
    try {
      // Na loja de exemplo não há depósito: fica só a marca de que houve foto.
      setDocumento(emDemo() ? "exemplo/documento.jpg" : await enviarDocumento(f, obterLoja() || ""));
    } catch (e) {
      aviso.erro(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
      if (camera.current) camera.current.value = "";
    }
  };

  const entregarSemPin = () => {
    const p = problemaSemPin(motivo, documento);
    if (p) return aviso.alerta(p);
    onFechar({ comPin: false, motivo: motivo.trim(), documento, em: nowISO() });
  };

  return (
    <Modal
      open
      onClose={() => onFechar(null)}
      title="Código de retirada"
      footer={
        semPin ? (
          <button className="btn-danger" disabled={enviando} onClick={entregarSemPin}>
            Entregar sem código
          </button>
        ) : (
          <button className="btn-primary" onClick={conferir} disabled={pin.replace(/\D/g, "").length !== 4}>
            <Check size={16} /> Conferir
          </button>
        )
      }
    >
      {!semPin ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm">
            <KeyRound size={18} /> Peça o código de 4 números que o cliente recebeu quando o aparelho ficou pronto.
          </p>
          <input
            className="input valor text-center text-3xl tracking-[0.5em]"
            inputMode="numeric"
            autoFocus
            maxLength={4}
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, ""));
              setErro("");
            }}
            onKeyDown={(e) => e.key === "Enter" && pin.length === 4 && conferir()}
          />
          {erro && <p className="text-sm font-semibold text-red-700">{erro}</p>}
          <button className="text-sm underline" onClick={() => setSemPin(true)}>
            O cliente está sem o código{tentativas >= 2 ? " (errou mais de uma vez)" : ""}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm">
            Entregar sem código fica registrado na auditoria, com a foto do documento de quem está levando.
          </p>
          <label className="label">
            Por que sem código? *
            <input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: filha do cliente, ele autorizou por telefone" />
          </label>
          <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => foto(e.target.files?.[0])} />
          <button className="btn-secondary w-full" disabled={enviando} onClick={() => camera.current?.click()}>
            <Camera size={16} /> {enviando ? "Enviando..." : documento ? "Foto do documento tirada (trocar)" : "Foto do documento *"}
          </button>
          <button className="text-sm underline" onClick={() => setSemPin(false)}>
            Voltar e digitar o código
          </button>
        </div>
      )}
    </Modal>
  );
};
