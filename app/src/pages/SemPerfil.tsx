import React, { useEffect, useState } from "react";
import { ShieldAlert, LogOut, Ticket, Store } from "lucide-react";
import { aceitarConvite, CONVITE_PENDENTE } from "../lib/auth";

/**
 * Conta autenticada, porém sem vínculo com nenhuma loja.
 * Aqui a pessoa aplica o código de convite. Nada de instrução interna
 * do banco nesta tela: quem chega aqui pode ser um estranho.
 */
export const SemPerfil: React.FC<{
  email: string;
  onSair: () => void;
  onVinculado: () => void;
}> = ({ email, onSair, onVinculado }) => {
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [nomeLoja, setNomeLoja] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Recupera o convite digitado na criação da conta (o e-mail de confirmação
  // traz a pessoa de volta numa aba nova, então o código fica guardado)
  useEffect(() => {
    const guardado = localStorage.getItem(CONVITE_PENDENTE);
    if (guardado) setCodigo(guardado);
    const nomeGuardado = localStorage.getItem("sistema-ti:nome-convite");
    if (nomeGuardado) setNome(nomeGuardado);
  }, []);

  const aplicar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      await aceitarConvite(codigo, nome, nomeLoja);
      localStorage.removeItem(CONVITE_PENDENTE);
      localStorage.removeItem("sistema-ti:nome-convite");
      onVinculado();
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <ShieldAlert className="mx-auto mb-3 text-amber-500" size={40} />
        <h1 className="text-center text-lg font-bold text-slate-800">
          Falta liberar seu acesso
        </h1>
        <p className="mt-2 text-center text-sm text-slate-600">
          A conta <b>{email}</b> ainda não está vinculada a nenhuma loja.
          Informe o código de convite que você recebeu.
        </p>

        <form onSubmit={aplicar} className="mt-5">
          <label className="label">Código de convite</label>
          <div className="relative mb-4">
            <Ticket size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              required
              className="input pl-10 font-mono uppercase tracking-widest"
              placeholder="XXXXXXXXXX"
              maxLength={10}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            />
          </div>

          <label className="label">Seu nome</label>
          <input
            className="input mb-4"
            placeholder="Como aparece para a equipe"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />

          <label className="label">Nome da loja (só para convite de loja nova)</label>
          <div className="relative mb-4">
            <Store size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-10"
              placeholder="Deixe em branco se você é funcionário"
              value={nomeLoja}
              onChange={(e) => setNomeLoja(e.target.value)}
            />
          </div>

          {erro && (
            <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm font-medium text-red-700">{erro}</p>
          )}

          <button type="submit" className="btn-primary w-full" disabled={enviando}>
            {enviando ? "Validando..." : "Liberar meu acesso"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-500">
          Não tem código? Peça ao responsável pela loja em
          <b> Configurações → Equipe → Convidar</b>.
        </p>

        <div className="mt-4 flex justify-center">
          <button className="btn-ghost" onClick={onSair}>
            <LogOut size={16} /> Sair
          </button>
        </div>
      </div>
    </div>
  );
};
