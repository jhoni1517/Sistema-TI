import React, { useEffect, useState } from "react";
import { Copy, Check, MessageCircle, ShieldCheck, CalendarClock, Lock } from "lucide-react";
import { aviso } from "../components/Aviso";
import { SectionTitle } from "../components/ui";
import { brl, formatDate, txt, abrirWhatsapp } from "../lib/format";
import { obterLoja } from "../lib/db";
import {
  carregarSistemaConfig,
  minhaLoja,
  diasParaVencer,
  situacaoDe,
  SITUACAO_META,
  mensagemComprovante,
  type Loja,
  type SistemaConfig,
} from "../lib/assinatura";

/**
 * Tela de assinatura do lojista.
 * Precisa responder três coisas sem rolagem: até quando está pago, quanto
 * custa e para onde mandar o Pix. Qualquer coisa além disso atrapalha.
 */
export const Assinatura: React.FC = () => {
  const [loja, setLoja] = useState<Loja | null>(null);
  const [cfg, setCfg] = useState<SistemaConfig | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const id = obterLoja();
    Promise.all([id ? minhaLoja(id) : null, carregarSistemaConfig()])
      .then(([l, c]) => {
        setLoja(l);
        setCfg(c);
      })
      .finally(() => setCarregando(false));
  }, []);

  const copiarPix = async () => {
    const chave = txt(cfg?.chave_pix);
    if (!chave) return;
    try {
      await navigator.clipboard.writeText(chave);
    } catch {
      prompt("Copie a chave Pix:", chave);
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  const situacao = loja ? situacaoDe(loja, cfg?.dias_tolerancia ?? 5) : "ativa";
  const dias = diasParaVencer(loja?.venceEm);
  const valor = Number(loja?.valor_mensal) || Number(cfg?.valor_padrao) || 0;
  const emDia = situacao === "ativa";

  const enviarComprovante = () => {
    const zap = txt(cfg?.whatsapp_suporte);
    if (!zap) return aviso.alerta("O suporte ainda não cadastrou um WhatsApp.");
    abrirWhatsapp(zap, mensagemComprovante(txt(loja?.nome), valor));
  };

  if (carregando) {
    return (
      <div className="max-w-2xl space-y-3">
        <div className="esqueleto h-8 w-56" />
        <div className="esqueleto h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <SectionTitle title="Assinatura" subtitle="Situação do seu plano e pagamento" />

      {/* Situação */}
      <div
        className={`card mb-5 ${
          emDia
            ? "border-l-4 border-l-emerald-500"
            : situacao === "tolerancia"
              ? "border-l-4 border-l-amber-500"
              : "border-l-4 border-l-red-500"
        }`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className={`badge ${SITUACAO_META[situacao].color}`}>
            {SITUACAO_META[situacao].label}
          </span>
          {loja?.venceEm && (
            <span className="flex items-center gap-1.5 text-sm text-slate-600">
              <CalendarClock size={15} />
              {dias !== null && dias >= 0
                ? `Pago até ${formatDate(loja.venceEm)} · faltam ${dias} dia${dias === 1 ? "" : "s"}`
                : `Venceu em ${formatDate(loja.venceEm)}`}
            </span>
          )}
        </div>

        {situacao === "tolerancia" && (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            Sua mensalidade venceu. O sistema segue funcionando normalmente por
            mais alguns dias — depois disso você continua <b>consultando e
            imprimindo</b> tudo, mas não consegue cadastrar nada novo até acertar.
          </p>
        )}

        {situacao === "leitura" && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
            <Lock size={16} className="mt-0.5 shrink-0" />
            <span>
              O cadastro de novas OS, vendas e clientes está pausado. Seus dados
              estão todos aqui e podem ser consultados e impressos à vontade —
              nada foi apagado. Assim que o pagamento for confirmado, tudo volta
              na hora.
            </span>
          </p>
        )}

        {situacao === "bloqueada" && (
          <p className="mt-3 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
            O acesso desta loja foi suspenso. Fale com o suporte para regularizar.
          </p>
        )}
      </div>

      {/* Pagamento */}
      <div className="card mb-5">
        <h3 className="mb-1 font-bold text-slate-700">Pagar mensalidade</h3>
        <p className="mb-4 text-sm text-slate-500">
          Faça o Pix e mande o comprovante — a liberação costuma sair no mesmo dia.
        </p>

        <div className="mb-4 rounded-xl bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Valor mensal</p>
          <p className="text-3xl font-bold text-slate-800">{brl(valor)}</p>
        </div>

        {txt(cfg?.chave_pix) ? (
          <>
            <label className="label">Chave Pix</label>
            <div className="flex gap-2">
              <input readOnly className="input font-mono" value={txt(cfg?.chave_pix)} />
              <button className="btn-secondary shrink-0" onClick={copiarPix}>
                {copiado ? <Check size={16} /> : <Copy size={16} />}
                {copiado ? "Copiado" : "Copiar"}
              </button>
            </div>
            {txt(cfg?.titular_pix) && (
              <p className="mt-2 text-xs text-slate-500">
                Titular: <b>{txt(cfg?.titular_pix)}</b>
              </p>
            )}

            <button className="btn-primary mt-4 w-full sm:w-auto" onClick={enviarComprovante}>
              <MessageCircle size={16} /> Já paguei — enviar comprovante
            </button>
          </>
        ) : (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            O suporte ainda não cadastrou a chave Pix. Entre em contato para
            combinar o pagamento.
          </p>
        )}
      </div>

      <p className="flex items-start gap-1.5 text-xs text-slate-400">
        <ShieldCheck size={13} className="mt-0.5 shrink-0" />
        Seus dados nunca são apagados por falta de pagamento. Mesmo com a
        assinatura vencida você continua consultando, imprimindo e exportando
        tudo que já cadastrou.
      </p>
    </div>
  );
};
