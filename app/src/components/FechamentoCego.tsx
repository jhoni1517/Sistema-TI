import React, { useState } from "react";
import { Lock, EyeOff } from "lucide-react";
import { Modal, InputNumero } from "./ui";
import { brl } from "../lib/format";
import { nomeDaForma } from "../lib/pagamento";
import { diferencasPorForma, diferencaTotal } from "../lib/caixa";

/**
 * Fechamento cego: o operador digita o que contou em cada forma SEM ver o
 * esperado. Só depois de confirmar o sistema mostra sobra e falta — e aí
 * já está gravado, com o nome de quem fechou. Conta em lib/caixa.ts.
 */
export const FechamentoCego: React.FC<{
  esperado: Record<string, number>;
  mesasAbertas: number;
  onClose: () => void;
  /** Grava. Devolve false se não gravou (o erro já foi mostrado). */
  onConfirm: (contado: Record<string, number>) => Promise<boolean>;
}> = ({ esperado, mesasAbertas, onClose, onConfirm }) => {
  // Só os NOMES das formas que tiveram movimento: o valor não aparece.
  const formas = Object.keys(esperado).filter((f) => f === "dinheiro" || esperado[f] !== 0);
  const [contado, setContado] = useState<Record<string, number | undefined>>({});
  const [gravando, setGravando] = useState(false);
  const [feito, setFeito] = useState(false);

  const faltando = formas.filter((f) => typeof contado[f] !== "number");

  const confirmar = async () => {
    if (gravando) return;
    if (faltando.length && !confirm(`Não contou: ${faltando.map(nomeDaForma).join(", ")}.\n\nFechar assim mesmo? O que não foi contado fica sem conferência.`)) return;
    setGravando(true);
    const limpo: Record<string, number> = {};
    for (const f of formas) if (typeof contado[f] === "number") limpo[f] = contado[f] as number;
    const ok = await onConfirm(limpo);
    setGravando(false);
    if (ok) setFeito(true);
  };

  if (feito) {
    const linhas = diferencasPorForma(esperado, contado);
    const total = diferencaTotal(linhas);
    return (
      <Modal open onClose={onClose} title="Caixa fechado" maxWidth="max-w-lg" footer={<button className="btn-primary" onClick={onClose}>Fechar</button>}>
        <div className="space-y-2">
          {linhas.map((l) => (
            <div key={l.forma} className="flex items-baseline justify-between gap-2 border-b border-linha py-1.5 text-sm">
              <span className="font-semibold">{nomeDaForma(l.forma)}</span>
              <span className="valor text-right">
                <span className="text-tinta-suave">
                  esperado {brl(l.esperado)} · contado {l.contado === undefined ? "—" : brl(l.contado)}
                </span>
                <br />
                <Diferenca v={l.diferenca} />
              </span>
            </div>
          ))}
          {total !== undefined && (
            <p className="pt-2 text-lg font-bold">
              Resultado: <Diferenca v={total} />
            </p>
          )}
          <p className="text-xs text-tinta-suave">Fica registrado no histórico de fechamentos com o seu nome.</p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Fechamento de caixa"
      maxWidth="max-w-lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-danger" disabled={gravando} onClick={confirmar}>
            <Lock size={16} /> {gravando ? "Fechando..." : "Confirmar contagem"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="flex items-start gap-2 rounded-md bg-papel p-3 text-sm">
          <EyeOff size={18} className="mt-0.5 shrink-0" />
          Conte e digite o que tem em cada forma. O sistema só mostra se sobrou ou faltou depois que você confirmar.
        </p>
        {mesasAbertas > 0 && (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {mesasAbertas} mesa(s) ainda aberta(s): o que pagarem não entra neste fechamento.
          </p>
        )}
        {formas.map((f) => (
          <label key={f} className="label block">
            {f === "dinheiro" ? "Dinheiro em papel na gaveta (com o troco)" : `${nomeDaForma(f)} (total da maquininha ou do extrato)`}
            <InputNumero
              className="input valor text-lg"
              min={0}
              placeholder="0,00"
              value={contado[f] ?? null}
              onChange={(v) => setContado((c) => ({ ...c, [f]: v }))}
            />
          </label>
        ))}
      </div>
    </Modal>
  );
};

const Diferenca: React.FC<{ v?: number }> = ({ v }) =>
  v === undefined ? (
    <span className="text-tinta-suave">não contado</span>
  ) : Math.abs(v) <= 0.5 ? (
    <b className="text-status-pronta">bateu</b>
  ) : v > 0 ? (
    <b className="text-amber-700">sobrou {brl(v)}</b>
  ) : (
    <b className="text-red-700">faltou {brl(-v)}</b>
  );
