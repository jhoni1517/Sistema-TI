import React, { useEffect, useState } from "react";
import { MessageCircle, ShieldCheck } from "lucide-react";
import { aviso } from "./Aviso";
import { Field } from "./ui";
import { supabase } from "../lib/supabase";

/**
 * O número da loja na API oficial do WhatsApp (Meta), para avisar o cliente
 * sozinho a cada status da OS. Só no plano Completo — cada conversa é
 * cobrada pela Meta.
 *
 * GRAVA E NUNCA LÊ O TOKEN, igual ao do Pix e ao do emissor de nota: ele
 * vai para api/whatsapp-os.js, que confere na Meta, cifra e guarda numa
 * tabela que o navegador não enxerga. De volta só vem o número conectado.
 */
async function chamar(metodo: "GET" | "POST", corpo?: unknown) {
  const sessao = (await supabase?.auth.getSession())?.data.session?.access_token;
  if (!sessao) throw new Error("Sua sessão expirou. Entre de novo e repita.");
  const r = await fetch("/api/whatsapp-os?acao=credencial", {
    method: metodo,
    headers: { Authorization: `Bearer ${sessao}`, "Content-Type": "application/json" },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.erro || `O servidor respondeu ${r.status}.`);
  return d;
}

export const CredencialWhatsapp: React.FC = () => {
  const [phoneId, setPhoneId] = useState("");
  const [token, setToken] = useState("");
  const [gravando, setGravando] = useState(false);
  const [estado, setEstado] = useState<{ configurado: boolean; conta: string; plano: string } | null>(null);
  const [erroLeitura, setErroLeitura] = useState("");

  useEffect(() => {
    chamar("GET")
      .then(setEstado)
      .catch((e) => setErroLeitura(e instanceof Error ? e.message : String(e)));
  }, []);

  const salvar = async () => {
    if (!phoneId.trim() || !token.trim()) return aviso.alerta("Preencha o Phone number ID e o token.");
    setGravando(true);
    try {
      const d = await chamar("POST", { phoneId: phoneId.trim(), token: token.trim() });
      setToken("");
      setEstado((e) => ({ configurado: true, conta: d.conta, plano: e?.plano || "completo" }));
      aviso.sucesso(`WhatsApp automático ligado no número ${d.conta}.`);
    } catch (e) {
      aviso.erro("Não foi possível ligar o WhatsApp automático:\n\n" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setGravando(false);
    }
  };

  const completo = estado?.plano === "completo";

  return (
    <div className="card mb-5">
      <h3 className="mb-1 flex items-center gap-2 font-bold text-slate-700">
        <MessageCircle size={18} /> WhatsApp automático (plano Completo)
      </h3>
      <p className="mb-3 text-sm text-slate-500">
        Avisa o cliente sozinho quando a OS é aberta, o orçamento fica pronto, espera peça, fica
        pronta e é entregue — uma vez por status. Sem isto, o botão do WhatsApp da OS continua
        funcionando como sempre.
      </p>

      {erroLeitura ? (
        <p className="mb-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">Não consegui conferir: {erroLeitura}</p>
      ) : estado && !completo ? (
        <p className="rounded-lg bg-slate-50 p-2 text-sm text-slate-600">
          Disponível no plano Completo. Fale com o suporte para mudar de plano.
        </p>
      ) : (
        <>
          {estado?.configurado && (
            <p className="mb-3 rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">
              Ligado no número <b>{estado.conta}</b>. Para trocar, preencha de novo.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phone number ID">
              <input className="input" inputMode="numeric" value={phoneId} onChange={(e) => setPhoneId(e.target.value)} />
            </Field>
            <Field label="Token de acesso permanente">
              <input
                className="input"
                type="password"
                autoComplete="off"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </Field>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Os dois ficam em developers.facebook.com, no app da loja, em WhatsApp → Configuração da API.
            Os modelos de mensagem precisam estar aprovados antes.
          </p>
          <button className="btn-primary mt-3" disabled={gravando || !completo} onClick={salvar}>
            <ShieldCheck size={16} /> {gravando ? "Conferindo na Meta..." : "Ligar WhatsApp automático"}
          </button>
        </>
      )}
    </div>
  );
};
