import React, { useEffect, useState } from "react";
import { aviso } from "./Aviso";
import { QrCode, ShieldCheck } from "lucide-react";
import { Field } from "./ui";
import { supabase } from "../lib/supabase";

/**
 * O Access Token do Mercado Pago, para o cliente pagar a OS com Pix pelo link.
 *
 * ---------------------------------------------------------------------
 * ESTA TELA GRAVA E NUNCA LÊ O TOKEN. É O DESENHO.
 *
 * Com o token dá para consultar o extrato da loja e devolver pagamento. Ele
 * vai direto para api/pix.js, que confere no Mercado Pago se é válido,
 * CIFRA e grava numa tabela que o navegador não enxerga nem com o login do
 * dono. De volta, a tela só recebe o nome da conta conectada — que é o que
 * a pessoa precisa para saber se colou o token certo.
 *
 * Não mora em `configuracoes`: aquilo entra no backup e no arquivo de
 * exportação, que circula por WhatsApp. Um token ali é um token queimado.
 * ---------------------------------------------------------------------
 */

async function chamar(metodo: "GET" | "POST", corpo?: unknown) {
  const sessao = (await supabase?.auth.getSession())?.data.session?.access_token;
  if (!sessao) throw new Error("Sua sessão expirou. Entre de novo e repita.");
  const r = await fetch("/api/pix?acao=credencial", {
    method: metodo,
    headers: { Authorization: `Bearer ${sessao}`, "Content-Type": "application/json" },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(dados?.erro || `O servidor respondeu ${r.status}.`);
  return dados;
}

export const CredencialPix: React.FC = () => {
  const [token, setToken] = useState("");
  const [gravando, setGravando] = useState(false);
  const [conta, setConta] = useState<string | null>(null);
  const [erroLeitura, setErroLeitura] = useState("");

  useEffect(() => {
    chamar("GET")
      .then((d) => setConta(d.configurado ? d.conta || "conta conectada" : ""))
      // Falha de leitura aparece: "não configurado" e "não consegui olhar"
      // são coisas diferentes, e só uma delas pede para colar o token.
      .catch((e) => setErroLeitura(e instanceof Error ? e.message : String(e)));
  }, []);

  const salvar = async () => {
    const t = token.trim();
    if (!t) return aviso.alerta("Cole o Access Token do Mercado Pago.");
    setGravando(true);
    try {
      const d = await chamar("POST", { token: t });
      // O campo é limpo na hora: token na tela depois de gravar fica à
      // vista de quem passar pelo balcão.
      setToken("");
      setConta(d.conta || "conta conectada");
      aviso.sucesso(`Pix pelo link ligado. Os pagamentos caem na conta ${d.conta || "conectada"}.`);
    } catch (e) {
      aviso.erro("Não foi possível ligar o Pix pelo link:\n\n" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setGravando(false);
    }
  };

  return (
    <div className="card mb-5">
      <h3 className="mb-1 flex items-center gap-2 font-bold text-slate-700">
        <QrCode size={18} /> Pix pelo link (Mercado Pago)
      </h3>
      <p className="mb-3 text-sm text-slate-500">
        O cliente paga a OS com Pix direto no link de acompanhamento, depois de aprovar o
        orçamento. O pagamento cai na conta da loja no Mercado Pago e entra sozinho no caixa
        como Pix.
      </p>

      {erroLeitura ? (
        <p className="mb-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">
          Não consegui conferir se o Pix está ligado: {erroLeitura}
        </p>
      ) : conta ? (
        <p className="mb-3 rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">
          Ligado. Recebendo na conta <b>{conta}</b>. Para trocar, cole outro token por cima.
        </p>
      ) : conta === "" ? (
        <p className="mb-3 rounded-lg bg-slate-50 p-2 text-sm text-slate-600">
          Desligado. O link do cliente não mostra o botão de Pix.
        </p>
      ) : null}

      <Field label="Access Token de produção">
        <input
          className="input"
          type="password"
          autoComplete="off"
          placeholder="APP_USR-..."
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
      </Field>
      <p className="mt-1 text-xs text-slate-400">
        No Mercado Pago: Seu negócio, Configurações, Credenciais de produção (ou em
        mercadopago.com.br/developers/panel/app). Copie o Access Token, não a Public Key.
      </p>

      <button className="btn-primary mt-3" disabled={gravando} onClick={salvar}>
        <ShieldCheck size={16} /> {gravando ? "Conferindo..." : "Ligar Pix pelo link"}
      </button>

      <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-400">
        <ShieldCheck size={13} className="mt-0.5 shrink-0" />
        O token é conferido no Mercado Pago, guardado cifrado e nunca volta para esta tela. Não
        entra no backup nem no arquivo de exportação.
      </p>
    </div>
  );
};
