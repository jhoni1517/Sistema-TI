import React, { useMemo } from "react";
import { History, ShieldCheck, AlertTriangle } from "lucide-react";
import { codigoOS, formatDate } from "../lib/format";
import { fichaDoAparelho, imeiValido, pareceImei } from "../lib/imei";
import { OS_STATUS_META, type OrdemServico } from "../lib/types";

/**
 * Embaixo do campo IMEI da OS: o dígito conferido e tudo que a loja já fez
 * neste aparelho. A garantia vem em destaque porque é o que muda o preço:
 * cobrar de novo um conserto na garantia perde o cliente.
 */
export const FichaAparelho: React.FC<{ imei?: string; ordens: OrdemServico[]; osAtual?: string }> = ({
  imei,
  ordens,
  osAtual,
}) => {
  const ficha = useMemo(() => fichaDoAparelho(imei, ordens, osAtual), [imei, ordens, osAtual]);
  const digitoErrado = pareceImei(imei) && !imeiValido(imei);

  if (!digitoErrado && ficha.ordens.length === 0) return null;

  return (
    <div className="mt-2 space-y-2">
      {digitoErrado && (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-red-700">
          <AlertTriangle size={13} /> O último dígito não confere. Confira o IMEI na caixa ou em *#06#.
        </p>
      )}
      {ficha.garantia && (
        <div className="flex items-start gap-2 rounded-md border-2 border-status-pronta bg-cartao p-3 text-sm">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-status-pronta" />
          <p>
            <b>Este aparelho tem garantia</b> da <span className="valor">{codigoOS(ficha.garantia.os.numero)}</span> até{" "}
            <span className="valor font-bold">{formatDate(ficha.garantia.ate)}</span>. Confira antes de cobrar.
          </p>
        </div>
      )}
      {ficha.ordens.length > 0 && (
        <div className="rounded-md bg-papel p-3 text-xs">
          <p className="mb-1.5 flex items-center gap-1 font-bold">
            <History size={13} /> Já passou aqui {ficha.ordens.length}x
          </p>
          <ul className="space-y-1">
            {ficha.ordens.slice(0, 6).map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">
                  <b className="valor">{codigoOS(o.numero)}</b> · {o.defeitoRelatado || "-"}
                </span>
                <span className="shrink-0 text-tinta-suave">
                  {OS_STATUS_META[o.status]?.label} · <span className="valor">{formatDate(o.criadoEm?.slice(0, 10))}</span>
                </span>
              </li>
            ))}
          </ul>
          {ficha.pecas.length > 0 && (
            <p className="mt-2 text-tinta-suave">
              <b className="text-tinta">Peças já trocadas:</b>{" "}
              {ficha.pecas
                .slice(0, 8)
                .map((p) => `${p.descricao} (${codigoOS(p.os)})`)
                .join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
