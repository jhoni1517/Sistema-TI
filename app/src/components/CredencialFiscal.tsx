import React, { useState } from "react";
import { aviso } from "./Aviso";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Field } from "./ui";
import { supabase } from "../lib/supabase";
import { obterLoja } from "../lib/db";
import { nowISO } from "../lib/format";

/**
 * O token do emissor de nota.
 *
 * ---------------------------------------------------------------------
 * ESTA TELA GRAVA E NUNCA LÊ. NÃO É LIMITAÇÃO — É O DESENHO.
 *
 * `fiscal_credencial` não tem policy de select: o navegador não lê aquela
 * tabela nem com o login do dono da loja. Quem lê é a função da Vercel, com
 * a chave de serviço, e ela é o único lugar do sistema que enxerga o token.
 *
 * Por que tanto cuidado com este campo em particular: com o token do emissor
 * qualquer um emite nota fiscal em nome da loja. Não é senha de sistema, é
 * assinatura de documento com valor legal.
 *
 * E é por isso que ele NÃO mora em `configuracoes` como todo o resto: aquela
 * tabela sobe para a nuvem, entra no backup e sai no arquivo de exportação —
 * que circula por WhatsApp e e-mail. Um token ali é um token queimado.
 *
 * O efeito prático para quem usa: para trocar o token, cola o novo por cima.
 * Não dá para conferir qual está gravado, e isso é de propósito.
 * ---------------------------------------------------------------------
 */
export const CredencialFiscal: React.FC = () => {
  const [token, setToken] = useState("");
  const [ambiente, setAmbiente] = useState<"homologacao" | "producao">("homologacao");
  const [gravando, setGravando] = useState(false);

  const salvar = async () => {
    const t = token.trim();
    if (!t) return aviso.alerta("Cole o token do emissor.");
    /*
     * Produção pede confirmação. Homologação não.
     *
     * Virar a chave para produção faz a próxima nota ser DE VERDADE: número
     * consumido, documento fiscal emitido e o relógio de 30 minutos para
     * cancelar começando a correr. Não é um passo para se dar sem querer.
     */
    if (
      ambiente === "producao" &&
      !confirm(
        "Ligar em PRODUÇÃO?\n\n" +
          "A partir daqui as notas são de verdade: número consumido, " +
          "documento fiscal válido e 30 minutos para cancelar.\n\n" +
          "Só ligue depois de emitir e CANCELAR uma nota em homologação."
      )
    ) {
      return;
    }

    if (!supabase) {
      return aviso.erro("Sem conexão com a nuvem. O token só pode ser gravado online.");
    }
    setGravando(true);
    try {
      const lojaId = obterLoja();
      if (!lojaId) throw new Error("Sua sessão expirou. Entre de novo e repita.");
      const { error } = await supabase
        .from("fiscal_credencial")
        .upsert({ lojaId, emissor: "focusnfe", token: t, ambiente, atualizadoEm: nowISO() });
      if (error) throw new Error(error.message);
      // O campo é limpo na hora: deixar o token na tela depois de gravar o
      // expõe a quem passar pelo balcão e olhar o computador.
      setToken("");
      aviso.sucesso(
        ambiente === "producao"
          ? "Token gravado. O sistema está emitindo notas de VERDADE."
          : "Token gravado em homologação. As notas são de teste."
      );
    } catch (e) {
      aviso.erro(
        "Não foi possível gravar o token:\n\n" +
          (e instanceof Error ? e.message : String(e)) +
          "\n\nSe você usa a nuvem, confira se rodou o supabase-migracao-notas.sql."
      );
    } finally {
      setGravando(false);
    }
  };

  return (
    <div className="card mb-5">
      <h3 className="mb-1 flex items-center gap-2 font-bold text-slate-700">
        <KeyRound size={18} /> Emissor de nota fiscal
      </h3>
      <p className="mb-4 text-sm text-slate-500">
        O token da conta da loja no emissor. Ele fica guardado num lugar que
        nem esta tela consegue ler de volta — para trocar, cole o novo por
        cima.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Token do emissor" className="sm:col-span-2">
          <input
            className="input"
            type="password"
            autoComplete="off"
            placeholder="Cole aqui e salve"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </Field>

        <Field label="Ambiente" className="sm:col-span-2">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["homologacao", "Teste (homologação)"],
                ["producao", "Valendo (produção)"],
              ] as const
            ).map(([k, nome]) => (
              <button
                key={k}
                type="button"
                onClick={() => setAmbiente(k)}
                className={`chip text-sm ${
                  ambiente === k
                    ? "bg-brand-600 text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200"
                }`}
              >
                {nome}
              </button>
            ))}
          </div>
          {/* A loja nasce em teste de propósito: a primeira nota de uma loja
              nova tem que ser de mentira. */}
          <p className="mt-1 text-xs text-slate-400">
            Comece em teste. Emita uma nota E CANCELE dentro dos 30 minutos
            antes de virar para valendo — o cancelamento é o passo que ninguém
            testa e o que dá problema com o cliente na frente.
          </p>
        </Field>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button className="btn-primary" disabled={gravando} onClick={salvar}>
          <ShieldCheck size={16} /> {gravando ? "Gravando..." : "Gravar token"}
        </button>
      </div>

      <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-400">
        <ShieldCheck size={13} className="mt-0.5 shrink-0" />
        O token não entra no backup nem no arquivo de exportação, e não sai
        nesta tela depois de gravado. Com ele, qualquer um emitiria nota em
        nome da loja.
      </p>
    </div>
  );
};
