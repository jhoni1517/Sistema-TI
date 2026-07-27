import React, { useState } from "react";
import { KeyRound, LogOut, ShieldCheck, Save } from "lucide-react";
import { aviso } from "./Aviso";
import { Field } from "./ui";
import {
  trocarSenha,
  sairDeTodosOsAparelhos,
  forcaSenha,
  type Sessao,
} from "../lib/auth";

/**
 * Conta do próprio usuário: trocar senha e encerrar sessões.
 *
 * Até aqui a única forma de trocar a senha era o link por e-mail — que
 * depende do envio do Supabase e simplesmente não chega. Sem esta tela, um
 * funcionário demitido continuava com a senha dele para sempre.
 */
export const MinhaConta: React.FC<{ sessao: Sessao }> = ({ sessao }) => {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [repete, setRepete] = useState("");
  const [salvando, setSalvando] = useState(false);

  const forca = forcaSenha(nova);

  const trocar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (forca.nivel === 0) return aviso.alerta("A nova senha precisa ter pelo menos 6 caracteres.");
    if (nova !== repete) return aviso.alerta("A confirmação não confere com a nova senha.");
    if (nova === atual) return aviso.alerta("A nova senha precisa ser diferente da atual.");

    setSalvando(true);
    try {
      await trocarSenha(atual, nova);
      setAtual("");
      setNova("");
      setRepete("");
      aviso.sucesso(
        "Senha alterada. Os outros aparelhos foram desconectados e precisarão entrar de novo."
      );
    } catch (err) {
      aviso.erro(err instanceof Error ? err.message : String(err));
    } finally {
      setSalvando(false);
    }
  };

  const sairDeTudo = async () => {
    if (
      !confirm(
        "Encerrar a sessão em TODOS os aparelhos, inclusive neste? Você precisará entrar de novo."
      )
    ) {
      return;
    }
    try {
      await sairDeTodosOsAparelhos();
      window.location.reload();
    } catch (err) {
      aviso.erro(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="card mb-5">
      <h3 className="mb-1 flex items-center gap-2 font-bold text-slate-700">
        <KeyRound size={18} /> Minha conta
      </h3>
      <p className="mb-4 text-sm text-slate-500">
        Entrando como <b>{sessao.email}</b>
      </p>

      <form onSubmit={trocar} className="max-w-md">
        <Field label="Senha atual">
          <input
            type="password"
            autoComplete="current-password"
            className="input"
            value={atual}
            onChange={(e) => setAtual(e.target.value)}
            required
          />
        </Field>

        <div className="mt-4">
          <Field label="Nova senha">
            <input
              type="password"
              autoComplete="new-password"
              className="input"
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              required
              minLength={6}
            />
          </Field>
          {nova.length > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full transition-all ${
                    forca.nivel === 0
                      ? "w-1/12 bg-red-500"
                      : forca.nivel === 1
                        ? "w-1/3 bg-red-500"
                        : forca.nivel === 2
                          ? "w-2/3 bg-amber-500"
                          : "w-full bg-emerald-500"
                  }`}
                />
              </div>
              <span className="text-xs text-slate-500">{forca.texto}</span>
            </div>
          )}
        </div>

        <div className="mt-4">
          <Field label="Repita a nova senha">
            <input
              type="password"
              autoComplete="new-password"
              className="input"
              value={repete}
              onChange={(e) => setRepete(e.target.value)}
              required
            />
          </Field>
          {repete.length > 0 && nova !== repete && (
            <p className="mt-1 text-xs font-medium text-red-600">As senhas não conferem</p>
          )}
        </div>

        <button type="submit" className="btn-primary mt-4" disabled={salvando}>
          <Save size={16} /> {salvando ? "Alterando..." : "Alterar senha"}
        </button>
      </form>

      <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-400">
        <ShieldCheck size={13} className="mt-0.5 shrink-0" />
        Ao trocar a senha, todos os outros aparelhos são desconectados
        automaticamente. Só este continua logado.
      </p>

      <div className="mt-5 border-t border-slate-200 pt-4">
        <p className="mb-2 text-sm text-slate-600">
          Perdeu um celular ou esqueceu de sair em outro computador?
        </p>
        <button className="btn-secondary text-red-600" onClick={sairDeTudo}>
          <LogOut size={16} /> Sair de todos os aparelhos
        </button>
      </div>
    </div>
  );
};
