import React, { useEffect, useRef, useState } from "react";
import { ScanLine } from "lucide-react";
import { Modal } from "./ui";
import { FORMATOS, leituraDeImei, leituraDeProduto, mesmaLeitura } from "../lib/leitor";

type Modo = "produto" | "imei";

/** Bipe curto: o ouvido confirma antes de o olho achar a tela */
function bipe() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    osc.frequency.value = 1320;
    vol.gain.value = 0.15;
    osc.connect(vol).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
    osc.onended = () => ctx.close();
  } catch {
    /* sem som, a leitura vale do mesmo jeito */
  }
  try {
    navigator.vibrate?.(60);
  } catch {
    /* idem */
  }
}

interface Detector {
  detect(fonte: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

/**
 * O botão de câmera ao lado de um campo. Lê, bipa, preenche e fecha.
 *
 * Leitor nativo do navegador (BarcodeDetector) quando existe — Chrome do
 * Android. Sem ele (iPhone), a biblioteca zxing é baixada SÓ quando a
 * câmera abre: ela pesa, e quem nunca usa não paga.
 */
export const BotaoCamera: React.FC<{ onLer: (codigo: string) => void; modo?: Modo; className?: string }> = ({
  onLer,
  modo = "produto",
  className = "",
}) => {
  const [aberto, setAberto] = useState(false);
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className={`btn-ghost !p-2 ${className}`}
        title={modo === "imei" ? "Ler o IMEI pela câmera" : "Ler o código pela câmera"}
        aria-label="Ler pela câmera"
      >
        <ScanLine size={20} />
      </button>
      {aberto && (
        <LeitorCamera
          modo={modo}
          onFechar={() => setAberto(false)}
          onLer={(c) => {
            setAberto(false);
            onLer(c);
          }}
        />
      )}
    </>
  );
};

const LeitorCamera: React.FC<{ modo: Modo; onLer: (c: string) => void; onFechar: () => void }> = ({ modo, onLer, onFechar }) => {
  const video = useRef<HTMLVideoElement>(null);
  const [erro, setErro] = useState("");
  const [dica, setDica] = useState("");
  // Por referência: a tela de trás (PDV) redesenha o tempo todo, e cada
  // redesenho com uma função nova religaria a câmera do zero.
  const lerRef = useRef(onLer);
  lerRef.current = onLer;

  useEffect(() => {
    let vivo = true;
    let stream: MediaStream | null = null;
    let parar: (() => void) | null = null;
    let ultima: { codigo: string; em: number } | null = null;

    const recebeu = (bruto: string) => {
      if (!vivo) return false;
      const codigo = modo === "imei" ? leituraDeImei(bruto) : leituraDeProduto(bruto);
      if (!codigo) {
        setDica("Esse não é o IMEI. Aponte para o código com IMEI na caixa ou na tela do *#06#.");
        return false;
      }
      if (mesmaLeitura(ultima, codigo, Date.now())) return false;
      ultima = { codigo, em: Date.now() };
      bipe();
      vivo = false;
      lerRef.current(codigo);
      return true;
    };

    (async () => {
      try {
        const Nativo = (window as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
        if (Nativo) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
          if (!vivo || !video.current) return;
          video.current.srcObject = stream;
          await video.current.play();
          const suportados = (await Nativo.getSupportedFormats?.()) || FORMATOS;
          const detector = new Nativo({ formats: FORMATOS.filter((f) => suportados.includes(f)) });
          const laco = async () => {
            if (!vivo || !video.current) return;
            try {
              const achados = await detector.detect(video.current);
              for (const a of achados) if (recebeu(a.rawValue)) return;
            } catch {
              /* quadro ruim: tenta o próximo */
            }
            setTimeout(laco, 120);
          };
          laco();
        } else {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          if (!vivo || !video.current) return;
          const leitor = new BrowserMultiFormatReader();
          const controle = await leitor.decodeFromVideoDevice(undefined, video.current, (r) => {
            if (r) recebeu(r.getText());
          });
          parar = () => controle.stop();
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setErro(
          /denied|permission|NotAllowed/i.test(msg)
            ? "O navegador não deixou usar a câmera. Libere a câmera para este site nas configurações e tente de novo."
            : /NotFound|device/i.test(msg)
              ? "Não achei câmera neste aparelho."
              : "Não deu para abrir a câmera: " + msg
        );
      }
    })();

    return () => {
      vivo = false;
      parar?.();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [modo]);

  return (
    <Modal open onClose={onFechar} title={modo === "imei" ? "Ler IMEI" : "Ler código de barras"} maxWidth="max-w-md">
      {erro ? (
        <p className="text-sm text-red-700">{erro}</p>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-md bg-black">
            <video ref={video} className="aspect-[4/3] w-full object-cover" muted playsInline />
            <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-sinal/80" />
          </div>
          <p className="mt-2 text-center text-sm text-tinta-suave">
            {dica || "Aponte para o código, a uns 15 cm, com luz."}
          </p>
        </>
      )}
    </Modal>
  );
};
