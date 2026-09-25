import React, { useMemo, useState } from "react";
import { PackageX } from "lucide-react";
import { useApp } from "../store/AppStore";
import { aviso } from "./Aviso";
import { db } from "../lib/db";
import { normalizar, nowISO, uid } from "../lib/format";
import { pecasEfetivas } from "../lib/orcamento";
import { rmaDaPeca, GARANTIA_FORNECEDOR_PADRAO } from "../lib/rma";
import type { OrdemServico } from "../lib/types";

/**
 * Na OS que voltou em garantia: "esta peça veio com defeito" vira uma troca
 * com o fornecedor, já com fornecedor, nota, data e custo da compra.
 *
 * As peças vêm da OS ORIGINAL (a que instalou), quando dá para achar: a
 * OS de retorno muitas vezes nem tem peça lançada.
 */
export const PecaComDefeito: React.FC<{ os: OrdemServico }> = ({ os }) => {
  const { ordens, movimentos, config } = useApp();
  const [feitas, setFeitas] = useState<string[]>([]);
  const [gravando, setGravando] = useState(false);

  const original = useMemo(
    () =>
      ordens
        .filter(
          (o) =>
            o.id !== os.id &&
            o.clienteId === os.clienteId &&
            o.status === "entregue" &&
            o.criadoEm < os.criadoEm &&
            normalizar(`${o.marca} ${o.modelo}`) === normalizar(`${os.marca} ${os.modelo}`)
        )
        .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))[0],
    [ordens, os]
  );
  const pecas = pecasEfetivas(original || os).filter((p) => p.descricao.trim());
  if (!os.retornoGarantia || !pecas.length) return null;

  const gerar = async (i: number) => {
    if (gravando) return;
    setGravando(true);
    try {
      const r = rmaDaPeca(
        os,
        pecas[i],
        movimentos,
        { id: uid(), agora: nowISO() },
        config.garantiaFornecedorDias || GARANTIA_FORNECEDOR_PADRAO,
        original
      );
      const gravado = await db.rmas.save(r);
      setFeitas((f) => [...f, pecas[i].descricao]);
      aviso.sucesso(
        `Troca criada em "Trocas com fornecedor"${gravado.fornecedor ? ` (${gravado.fornecedor})` : ". Preencha o fornecedor lá"}.`
      );
    } catch (e) {
      aviso.erro("Não criou a troca: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setGravando(false);
    }
  };

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm no-print">
      <p className="mb-2 flex items-center gap-2 font-semibold text-amber-900">
        <PackageX size={16} /> Voltou por defeito da peça? Mande de volta para o fornecedor
        {original && <span className="font-normal"> (peças da OS {original.numero})</span>}
      </p>
      <div className="flex flex-wrap gap-2">
        {pecas.map((p, i) => (
          <button
            key={i}
            className="btn-secondary !py-1.5 text-xs"
            disabled={gravando || feitas.includes(p.descricao)}
            onClick={() => gerar(i)}
          >
            {feitas.includes(p.descricao) ? "Troca criada: " : "Peça com defeito: "}
            {p.descricao}
          </button>
        ))}
      </div>
    </div>
  );
};
