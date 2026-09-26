import React, { useEffect, useRef, useState } from "react";
import { PenLine, Printer, ShieldCheck, ShieldAlert, Eraser } from "lucide-react";
import { useApp } from "../store/AppStore";
import { Modal } from "./ui";
import { aviso } from "./Aviso";
import { obterLoja, emDemo } from "../lib/db";
import { enviarImagem } from "../lib/imagens";
import { printHTML } from "../lib/print";
import { formatDateTime, nowISO, codigoOS } from "../lib/format";
import {
  TITULO_TERMO,
  textoDoTermo,
  lacrar,
  termoIntacto,
  termoDoTipo,
  podeTermoRetirada,
  htmlDoTermo,
} from "../lib/termo";
import type { Config, OrdemServico, TermoAssinado, TipoTermo } from "../lib/types";

type Cliente = { nome?: string; telefone?: string; cpf?: string };

/** O quadro "Termos assinados" no detalhe da OS */
export const QuadroTermos: React.FC<{ os: OrdemServico; cliente?: Cliente; config: Config }> = ({ os, cliente, config }) => {
  const [assinando, setAssinando] = useState<TipoTermo | null>(null);
  const tipos: TipoTermo[] = [
    "entrada",
    ...(podeTermoRetirada(os) ? (["retirada"] as TipoTermo[]) : []),
    ...(os.emprestimo ? (["emprestimo"] as TipoTermo[]) : []),
  ];

  return (
    <div className="rounded-md border border-linha p-3 no-print">
      <p className="rotulo mb-2">Termos assinados na tela</p>
      <div className="space-y-2">
        {tipos.map((tipo) => (
          <LinhaTermo key={tipo} tipo={tipo} termo={termoDoTipo(os, tipo)} fotos={os.fotos || []} onAssinar={() => setAssinando(tipo)} />
        ))}
      </div>
      {assinando && (
        <ColherAssinatura tipo={assinando} os={os} cliente={cliente} config={config} onFechar={() => setAssinando(null)} />
      )}
    </div>
  );
};

const LinhaTermo: React.FC<{ tipo: TipoTermo; termo?: TermoAssinado; fotos: string[]; onAssinar: () => void }> = ({
  tipo,
  termo,
  fotos,
  onAssinar,
}) => {
  const [intacto, setIntacto] = useState<boolean | null>(null);
  useEffect(() => {
    if (!termo) return;
    termoIntacto(termo).then(setIntacto).catch(() => setIntacto(false));
  }, [termo]);

  if (!termo) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm">{TITULO_TERMO[tipo]}</span>
        <button className="btn-secondary !py-1.5 text-sm" onClick={onAssinar}>
          <PenLine size={15} /> Colher assinatura
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm">
        {TITULO_TERMO[tipo]}
        <span className="block text-xs text-tinta-suave">
          Assinado em <span className="valor">{formatDateTime(termo.assinadoEm)}</span>
          {intacto === true && (
            <span className="ml-1 inline-flex items-center gap-0.5 text-status-pronta">
              <ShieldCheck size={12} /> lacre conferido
            </span>
          )}
          {intacto === false && (
            <span className="ml-1 inline-flex items-center gap-0.5 font-bold text-red-700">
              <ShieldAlert size={12} /> alterado depois da assinatura
            </span>
          )}
        </span>
      </span>
      <button
        className="btn-secondary !py-1.5 text-sm"
        onClick={() => printHTML(htmlDoTermo(termo, fotos), TITULO_TERMO[tipo], "a4")}
      >
        <Printer size={15} /> Imprimir / PDF
      </button>
    </div>
  );
};

/**
 * A janela de assinar. O texto é montado UMA vez, ao abrir, e é esse que
 * vai para o lacre: se a OS mudar enquanto o cliente lê, ele assina o que
 * leu.
 */
const ColherAssinatura: React.FC<{
  tipo: TipoTermo;
  os: OrdemServico;
  cliente?: Cliente;
  config: Config;
  onFechar: () => void;
}> = ({ tipo, os, cliente, config, onFechar }) => {
  const { saveOrdem } = useApp();
  const [quando] = useState(() => nowISO());
  const [texto] = useState(() => textoDoTermo(tipo, os, cliente, config.nomeLoja, quando, config.diasAbandono || 90));
  const tela = useRef<HTMLCanvasElement>(null);
  const [rabiscou, setRabiscou] = useState(false);
  const [gravando, setGravando] = useState(false);

  // Canvas no tamanho real da tela (e da densidade do celular): desenhado
  // em 300px e esticado, o traço sai serrilhado e a assinatura parece falsa.
  useEffect(() => {
    const c = tela.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const d = window.devicePixelRatio || 1;
    c.width = Math.round(r.width * d);
    c.height = Math.round(r.height * d);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(d, d);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, r.width, r.height);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";
  }, []);

  const ponto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const desenhando = useRef(false);
  const inicio = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    desenhando.current = true;
    const ctx = e.currentTarget.getContext("2d");
    const p = ponto(e);
    ctx?.beginPath();
    ctx?.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!desenhando.current) return;
    const ctx = e.currentTarget.getContext("2d");
    const p = ponto(e);
    ctx?.lineTo(p.x, p.y);
    ctx?.stroke();
    setRabiscou(true);
  };
  const fim = () => {
    desenhando.current = false;
  };
  const limpar = () => {
    const c = tela.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const r = c.getBoundingClientRect();
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, r.width, r.height);
    setRabiscou(false);
  };

  const assinar = async () => {
    if (!rabiscou || !tela.current) return aviso.alerta("Falta a assinatura do cliente.");
    if (emDemo()) return aviso.alerta("Na loja de exemplo a assinatura não é guardada. Crie sua conta para usar.");
    setGravando(true);
    try {
      const blob = await new Promise<Blob>((ok, falha) =>
        tela.current!.toBlob((b) => (b ? ok(b) : falha(new Error("Não deu para ler a assinatura."))), "image/png")
      );
      const arquivo = new File([blob], `assinatura-${tipo}-${codigoOS(os.numero)}.png`, { type: "image/png" });
      const url = await enviarImagem(arquivo, obterLoja() || "", "assinaturas", 900);
      const termo = await lacrar({ tipo, texto, assinatura: url, assinadoEm: quando });
      await saveOrdem({ ...os, termos: [...(os.termos || []), termo], atualizadoEm: nowISO() });
      aviso.sucesso("Termo assinado e guardado na OS.");
      onFechar();
    } catch (e) {
      aviso.erro("O termo NÃO foi guardado: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setGravando(false);
    }
  };

  return (
    <Modal
      open
      onClose={onFechar}
      title={TITULO_TERMO[tipo]}
      maxWidth="max-w-xl"
      footer={
        <div className="flex w-full gap-2">
          <button className="btn-secondary" onClick={limpar} disabled={gravando}>
            <Eraser size={16} /> Limpar
          </button>
          <button className="btn-primary ml-auto" onClick={assinar} disabled={gravando || !rabiscou}>
            {gravando ? "Guardando..." : "Assinar"}
          </button>
        </div>
      }
    >
      <div className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-md bg-papel p-3 text-sm">{texto}</div>
      <p className="mt-3 text-sm font-semibold">Assinatura do cliente, com o dedo:</p>
      {/* touch-none: sem isto, arrastar o dedo rola a página em vez de desenhar */}
      <canvas
        ref={tela}
        className="mt-1 h-40 w-full touch-none rounded-md border-2 border-dashed border-linha bg-white"
        onPointerDown={inicio}
        onPointerMove={move}
        onPointerUp={fim}
        onPointerLeave={fim}
        onPointerCancel={fim}
      />
    </Modal>
  );
};
