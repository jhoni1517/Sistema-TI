import React, { useMemo, useState } from "react";
import { MessageCircle, Check, Settings2, Plus, Trash2 } from "lucide-react";
import { useApp } from "../store/AppStore";
import { aviso } from "./Aviso";
import { InputNumero } from "./ui";
import { abrirWhatsapp, codigoOS, formatDate, txt, uid } from "../lib/format";
import {
  lembretesDoDia,
  mensagemDoLembrete,
  marcarChamado,
  regrasValidas,
  REGRAS_PADRAO,
  type Lembrete,
  type RegraLembrete,
} from "../lib/lembretes";

/** A aba "Revisões" de "Quem chamar hoje": serviço que pede volta */
export const Revisoes: React.FC = () => {
  const { ordens, clientes, config, saveOrdem, saveConfig } = useApp();
  const regras = config.lembretesServico?.length ? config.lembretesServico : REGRAS_PADRAO;
  const lista = useMemo(() => lembretesDoDia(ordens, clientes, regras), [ordens, clientes, regras]);
  const [editando, setEditando] = useState(false);
  const [marcando, setMarcando] = useState("");

  /*
   * Abre o WhatsApp ANTES de gravar: janela aberta depois de um await é
   * bloqueada no iPhone. Se a marca falhar, a tela diz — senão o mesmo
   * cliente recebe o recado de novo amanhã.
   */
  const chamar = async (l: Lembrete) => {
    abrirWhatsapp(txt(l.cliente.telefone), mensagemDoLembrete(l, config.nomeLoja));
    await marcar(l);
  };

  const marcar = async (l: Lembrete) => {
    if (marcando) return;
    setMarcando(l.chave);
    try {
      await saveOrdem(marcarChamado(l.os, l.regra.id));
    } catch (e) {
      aviso.erro("Não ficou marcado como chamado:\n\n" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setMarcando("");
    }
  };

  if (editando) return <EditarRegras regras={regras} onPronto={(r) => { if (r) saveConfig({ ...config, lembretesServico: r }); setEditando(false); }} />;

  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="text-xs text-tinta-suave">
          Serviço que pede volta: {regras.map((r) => `${r.palavra} em ${r.meses} meses`).join(", ")}.
        </p>
        <button className="btn-ghost shrink-0 !py-1 text-xs" onClick={() => setEditando(true)}>
          <Settings2 size={14} /> Ajustar
        </button>
      </div>
      {lista.length === 0 ? (
        <p className="py-8 text-center text-sm text-tinta-suave">Ninguém para chamar hoje. Volte amanhã.</p>
      ) : (
        <div className="space-y-1">
          {lista.map((l) => (
            <div key={l.chave} className="flex flex-wrap items-center gap-3 rounded-lg border border-linha px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{l.cliente.nome}</span>
                <span className="block text-xs text-tinta-suave">
                  {l.regra.palavra} · <span className="valor">{codigoOS(l.os.numero)}</span> · desde{" "}
                  <span className="valor">{formatDate(l.quando)}</span>
                </span>
              </span>
              <button className="btn-ghost !py-1.5 text-xs" disabled={!!marcando} onClick={() => marcar(l)} title="Já falei com ele">
                <Check size={14} />
              </button>
              <button className="btn-secondary !py-1.5 text-xs" disabled={!!marcando} onClick={() => chamar(l)}>
                <MessageCircle size={14} /> Chamar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const EditarRegras: React.FC<{ regras: RegraLembrete[]; onPronto: (r: RegraLembrete[] | null) => void }> = ({ regras, onPronto }) => {
  const [lista, setLista] = useState<RegraLembrete[]>(regras);
  const mudar = (i: number, patch: Partial<RegraLembrete>) => setLista((v) => v.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2">
      <p className="text-xs text-tinta-suave">
        Quando a palavra aparece na peça ou no defeito de uma OS entregue, o cliente entra na lista depois de tantos meses.
      </p>
      {lista.map((r, i) => (
        <div key={r.id} className="grid grid-cols-12 items-center gap-2">
          <input className="input col-span-4 !py-1.5 text-sm" placeholder="palavra" value={r.palavra} onChange={(e) => mudar(i, { palavra: e.target.value })} />
          <div className="col-span-2">
            <InputNumero className="input !py-1.5 text-sm" value={r.meses} onChange={(v) => mudar(i, { meses: v ?? 0 })} />
          </div>
          <input className="input col-span-5 !py-1.5 text-sm" placeholder="o que oferecer" value={r.oferta} onChange={(e) => mudar(i, { oferta: e.target.value })} />
          <button className="col-span-1 text-tinta-suave hover:text-red-600" onClick={() => setLista((v) => v.filter((_, n) => n !== i))} aria-label="Tirar regra">
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <button className="btn-secondary !py-1.5 text-xs" onClick={() => setLista((v) => [...v, { id: uid(), palavra: "", meses: 6, oferta: "" }])}>
          <Plus size={14} /> Regra
        </button>
        <button className="btn-secondary ml-auto !py-1.5 text-xs" onClick={() => onPronto(null)}>
          Cancelar
        </button>
        <button className="btn-primary !py-1.5 text-xs" onClick={() => onPronto(regrasValidas(lista))}>
          Salvar
        </button>
      </div>
    </div>
  );
};
