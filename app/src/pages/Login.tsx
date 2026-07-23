import React, { useState } from "react";
import { Lock, Wrench } from "lucide-react";
import { useApp } from "../store/AppStore";

export const Login: React.FC<{ onLogin: () => void }> = ({ onLogin }) => {
  const { config } = useApp();
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(false);

  const entrar = (e: React.FormEvent) => {
    e.preventDefault();
    if (senha === config.senhaAcesso) {
      onLogin();
    } else {
      setErro(true);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-brand-900 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600 shadow-lg">
            <Wrench className="text-white" size={30} />
          </div>
          <h1 className="text-2xl font-bold text-white">{config.nomeLoja}</h1>
          <p className="text-sm text-slate-400">Sistema de Caixa & Ordens de Serviço</p>
        </div>

        <form
          onSubmit={entrar}
          className="rounded-2xl bg-white p-6 shadow-2xl"
        >
          <label className="label">Senha de acesso</label>
          <div className="relative">
            <Lock
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="password"
              autoFocus
              value={senha}
              onChange={(e) => {
                setSenha(e.target.value);
                setErro(false);
              }}
              placeholder="Digite sua senha"
              className="input pl-10"
            />
          </div>
          {erro && (
            <p className="mt-2 text-sm font-medium text-red-600">
              Senha incorreta. Tente novamente.
            </p>
          )}
          <button type="submit" className="btn-primary mt-4 w-full">
            Entrar
          </button>
          <p className="mt-4 text-center text-xs text-slate-400">
            Senha padrão inicial: <b>1234</b> (altere em Configurações)
          </p>
        </form>
      </div>
    </div>
  );
};
