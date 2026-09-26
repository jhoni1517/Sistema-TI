import React, { useMemo, useState } from "react";
import { Calculator, Copy, MessageCircle, Image as Imagem } from "lucide-react";
import { useApp } from "../store/AppStore";
import { Modal } from "./ui";
import { aviso } from "./Aviso";
import { brl } from "../lib/format";
import { simular, avisoDeTaxas, textoDaSimulacao, type LinhaSimulacao } from "../lib/parcelamento";

/** O botão "Simular parcelas" e a janela. Conta em lib/parcelamento.ts. */
export const BotaoSimularParcelas: React.FC<{ valor: number; descricao?: string; className?: string }> = ({ valor, descricao, className }) => {
  const [aberto, setAberto] = useState(false);
  if (!(valor > 0)) return null;
  return (
    <>
      <button type="button" className={className || "btn-secondary !py-1.5 text-sm"} onClick={() => setAberto(true)}>
        <Calculator size={15} /> Simular parcelas
      </button>
      {aberto && <SimuladorParcelas valor={valor} descricao={descricao} onFechar={() => setAberto(false)} />}
    </>
  );
};

const SimuladorParcelas: React.FC<{ valor: number; descricao?: string; onFechar: () => void }> = ({ valor, descricao, onFechar }) => {
  const { config } = useApp();
  const taxas = config.taxasCartao || {};
  const parcelas = config.taxasParcelas || {};
  const linhas = useMemo(() => simular(valor, taxas, parcelas), [valor, taxas, parcelas]);
  const alerta = avisoDeTaxas(taxas, parcelas);
  const [repassar, setRepassar] = useState(false);
  const texto = textoDaSimulacao(valor, linhas, config.nomeLoja, repassar, descricao);

  const copiar = () =>
    navigator.clipboard
      .writeText(texto)
      .then(() => aviso.sucesso("Copiado. Cole no WhatsApp do cliente."))
      .catch(() => aviso.alerta("Não consegui copiar."));

  const imagem = async () => {
    try {
      const blob = await desenhar(config.nomeLoja, valor, descricao, linhas, repassar);
      const arquivo = new File([blob], "parcelas.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [arquivo] })) {
        await navigator.share({ files: [arquivo], title: "Parcelas" });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "parcelas.png";
        a.click();
        URL.revokeObjectURL(a.href);
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      aviso.erro("Não gerou a imagem: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  return (
    <Modal
      open
      onClose={onFechar}
      title={`Parcelas de ${brl(valor)}`}
      maxWidth="max-w-2xl"
      footer={
        <div className="flex w-full flex-wrap gap-2">
          <button className="btn-secondary" onClick={copiar}>
            <Copy size={15} /> Copiar texto
          </button>
          <a className="btn-secondary" href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer">
            <MessageCircle size={15} /> WhatsApp
          </a>
          <button className="btn-secondary" onClick={imagem}>
            <Imagem size={15} /> Imagem
          </button>
        </div>
      }
    >
      {alerta && <p className="mb-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">{alerta}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-linha text-left text-xs uppercase text-tinta-suave">
            <tr>
              <th className="py-1.5 pr-1">Forma</th>
              <th className="px-2 py-1.5 text-right">Sem juros</th>
              <th className="px-2 py-1.5 text-right">Repassando</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-linha">
            {linhas.map((l) => (
              <tr key={l.rotulo}>
                <td className="py-1.5 pr-1 font-semibold">
                  {l.rotulo}
                  <span className="valor block text-xs font-normal text-tinta-suave">taxa {String(l.taxa).replace(".", ",")}%</span>
                </td>
                <td className="valor px-1 py-1.5 text-right">
                  <span className="whitespace-nowrap">{l.parcelas > 1 ? `${l.parcelas}× ${brl(l.semJuros.parcela)}` : brl(l.semJuros.total)}</span>
                  <span className="block text-xs text-tinta-suave">você recebe {brl(l.semJuros.recebe)}</span>
                </td>
                <td className="valor px-1 py-1.5 text-right">
                  <span className="whitespace-nowrap">{l.parcelas > 1 ? `${l.parcelas}× ${brl(l.repassando.parcela)}` : brl(l.repassando.total)}</span>
                  <span className="block text-xs text-tinta-suave">cliente paga {brl(l.repassando.total)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4" checked={repassar} onChange={(e) => setRepassar(e.target.checked)} />
        O texto e a imagem mostram os valores repassando a taxa
      </label>
    </Modal>
  );
};

/** Imagem simples para o WhatsApp: nome da loja, valor e as parcelas. */
function desenhar(loja: string, valor: number, descricao: string | undefined, linhas: LinhaSimulacao[], repassar: boolean): Promise<Blob> {
  const d = 2;
  const larg = 540;
  const alt = 150 + linhas.length * 34 + 40;
  const cv = document.createElement("canvas");
  cv.width = larg * d;
  cv.height = alt * d;
  const g = cv.getContext("2d");
  if (!g) return Promise.reject(new Error("Sem canvas neste navegador."));
  g.scale(d, d);
  g.fillStyle = "#faf6ee";
  g.fillRect(0, 0, larg, alt);
  g.fillStyle = "#bf3f0b";
  g.fillRect(0, 0, larg, 8);
  g.fillStyle = "#1c1917";
  g.font = "bold 24px sans-serif";
  g.fillText(loja || "Orçamento", 28, 50);
  g.font = "18px sans-serif";
  g.fillText(`${descricao ? descricao + ": " : ""}${brl(valor)}`, 28, 82);
  g.font = "14px sans-serif";
  g.fillStyle = "#57534e";
  g.fillText(repassar ? "Parcelas no cartão" : "Parcelas sem juros no cartão", 28, 110);
  let y = 150;
  for (const l of linhas) {
    const x = repassar ? l.repassando : l.semJuros;
    g.fillStyle = "#1c1917";
    g.font = "bold 17px sans-serif";
    g.fillText(l.rotulo, 28, y);
    g.font = "17px monospace";
    const v = l.parcelas === 1 ? brl(x.total) : `${l.parcelas}x ${brl(x.parcela)}${repassar ? ` = ${brl(x.total)}` : ""}`;
    g.textAlign = "right";
    g.fillText(v, larg - 28, y);
    g.textAlign = "left";
    g.strokeStyle = "#e7e0d2";
    g.beginPath();
    g.moveTo(28, y + 12);
    g.lineTo(larg - 28, y + 12);
    g.stroke();
    y += 34;
  }
  return new Promise((ok, falha) => cv.toBlob((b) => (b ? ok(b) : falha(new Error("Falhou ao gerar a imagem."))), "image/png"));
}
