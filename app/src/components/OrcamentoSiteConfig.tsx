import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Globe, Copy, ExternalLink, Download } from "lucide-react";
import { Link } from "react-router-dom";
import { aviso } from "./Aviso";
import { obterLoja } from "../lib/db";
import { AGENDA_SITE_PADRAO, agendaSegura, corSegura } from "../lib/orcamento-online";
import type { Config } from "../lib/types";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/**
 * Liga a página pública de orçamento, escolhe cor e horários de avaliação,
 * e entrega o link e o QR para o Instagram e o Google.
 *
 * Nasce desligada: publicar preço é decisão da loja.
 */
export const OrcamentoSiteConfig: React.FC<{
  valor: Config["orcamentoSite"];
  temTabela: boolean;
  onMudar: (v: NonNullable<Config["orcamentoSite"]>) => void;
}> = ({ valor, temTabela, onMudar }) => {
  const v = valor || {};
  const agenda = agendaSegura(v.agenda || AGENDA_SITE_PADRAO);
  const loja = obterLoja();
  const link = loja ? `${window.location.origin}${window.location.pathname}#/orcar/${loja}` : "";
  const [qr, setQr] = useState("");

  useEffect(() => {
    if (!link) return;
    QRCode.toDataURL(link, { margin: 1, width: 480 }).then(setQr).catch(() => setQr(""));
  }, [link]);

  const mudar = (patch: Partial<NonNullable<Config["orcamentoSite"]>>) => onMudar({ ...v, agenda, ...patch });
  const mudarAgenda = (patch: Partial<typeof agenda>) => mudar({ agenda: agendaSegura({ ...agenda, ...patch }) });

  return (
    <div>
      <h3 className="mb-1 flex items-center gap-2 font-bold text-tinta">
        <Globe size={16} /> Orçamento pelo site
      </h3>
      <p className="mb-3 text-sm text-tinta-suave">
        Uma página onde o cliente escolhe o aparelho e o problema e vê "a partir de R$ X" da sua{" "}
        <Link to="/tabela" className="underline">
          Tabela de serviços
        </Link>
        . Ele agenda a avaliação ou chama no WhatsApp, e o pedido cai em{" "}
        <Link to="/orcamentos-site" className="underline">
          Orçamentos do site
        </Link>
        .
      </p>

      <label className="flex items-center gap-2 font-semibold">
        <input type="checkbox" className="h-5 w-5" checked={!!v.ativo} onChange={(e) => mudar({ ativo: e.target.checked })} />
        Página no ar
      </label>
      {v.ativo && !temTabela && (
        <p className="mt-1 text-xs text-amber-700">Sem preços na Tabela de serviços, a página só oferece o WhatsApp e a avaliação.</p>
      )}

      {v.ativo && (
        <div className="mt-3 space-y-3">
          <label className="flex items-center gap-2">
            Cor da página
            <input type="color" className="h-9 w-14 rounded border border-linha" value={corSegura(v.cor)} onChange={(e) => mudar({ cor: e.target.value })} />
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4" checked={!!v.agendar} onChange={(e) => mudar({ agendar: e.target.checked })} />
            Deixar o cliente agendar a avaliação (entra na Agenda)
          </label>

          {v.agendar && (
            <div className="space-y-2 rounded-md border border-linha p-3 text-sm">
              <div className="flex flex-wrap gap-1">
                {DIAS.map((nome, i) => (
                  <button
                    type="button"
                    key={nome}
                    className={`rounded-md border px-2.5 py-1 ${agenda.dias.includes(i) ? "border-sinal bg-sinal/10 font-semibold" : "border-linha"}`}
                    onClick={() =>
                      mudarAgenda({ dias: agenda.dias.includes(i) ? agenda.dias.filter((x) => x !== i) : [...agenda.dias, i].sort() })
                    }
                  >
                    {nome}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <label className="label">
                  Das
                  <input type="time" className="input" value={agenda.inicio} onChange={(e) => mudarAgenda({ inicio: e.target.value })} />
                </label>
                <label className="label">
                  Até
                  <input type="time" className="input" value={agenda.fim} onChange={(e) => mudarAgenda({ fim: e.target.value })} />
                </label>
                <label className="label">
                  A cada
                  <select className="input" value={agenda.intervalo} onChange={(e) => mudarAgenda({ intervalo: Number(e.target.value) })}>
                    {[15, 30, 45, 60, 90, 120].map((m) => (
                      <option key={m} value={m}>
                        {m} min
                      </option>
                    ))}
                  </select>
                </label>
                <label className="label">
                  Por horário
                  <select className="input" value={agenda.porHorario} onChange={(e) => mudarAgenda({ porHorario: Number(e.target.value) })}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="text-xs text-tinta-suave">Compromisso com hora marcado na Agenda ocupa o horário.</p>
            </div>
          )}

          {link && (
            <div className="flex flex-wrap items-center gap-3 rounded-md bg-papel p-3">
              {qr && <img src={qr} alt="QR do orçamento" className="h-28 w-28 rounded border border-linha bg-white" />}
              <div className="min-w-0 flex-1 space-y-2">
                <p className="break-all text-xs text-tinta-suave">{link}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-secondary !py-1.5 text-sm"
                    onClick={() =>
                      navigator.clipboard
                        .writeText(link)
                        .then(() => aviso.sucesso("Link copiado. Cole na bio do Instagram e no Google."))
                        .catch(() => aviso.alerta("Não consegui copiar. Segure o dedo no link e copie."))
                    }
                  >
                    <Copy size={14} /> Copiar link
                  </button>
                  <a className="btn-secondary !py-1.5 text-sm" href={link} target="_blank" rel="noreferrer">
                    <ExternalLink size={14} /> Abrir
                  </a>
                  {qr && (
                    <a className="btn-secondary !py-1.5 text-sm" href={qr} download="qr-orcamento.png">
                      <Download size={14} /> Baixar QR
                    </a>
                  )}
                </div>
                <p className="text-xs text-tinta-suave">Só vale depois de tocar em Salvar lá embaixo.</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
