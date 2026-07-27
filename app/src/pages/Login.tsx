import React, { useEffect, useState } from "react";
import { Lock, Wrench, Mail, AlertTriangle, ShieldCheck, Ticket, User } from "lucide-react";
import {
  entrar,
  criarConta,
  recuperarSenha,
  forcaSenha,
  conferirConvite,
  CONVITE_PENDENTE,
} from "../lib/auth";
import { supabaseEnabled } from "../lib/supabase";

type Modo = "entrar" | "criar" | "recuperar";

/** Código de convite que pode vir no link: #/entrar?convite=ABC123 */
const conviteDoLink = (): string =>
  new URLSearchParams(window.location.hash.split("?")[1] || "")
    .get("convite")
    ?.toUpperCase() || "";

export const Login: React.FC<{ onEntrou: () => void }> = ({ onEntrou }) => {
  const convidado = conviteDoLink();
  const [modo, setModo] = useState<Modo>(convidado ? "criar" : "entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [convite, setConvite] = useState(convidado);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [carregando, setCarregando] = useState(false);

  const forca = forcaSenha(senha);

  // Limpa mensagens ao trocar de modo, para não confundir quem está lendo
  useEffect(() => {
    setErro("");
  }, [modo]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    setAviso("");
    setCarregando(true);
    try {
      if (modo === "entrar") {
        await entrar(email, senha);
        onEntrou();
      } else if (modo === "criar") {
        if (forca.nivel === 0) {
          throw new Error("A senha precisa ter pelo menos 6 caracteres.");
        }
        // Confere o convite ANTES de criar a conta: sem isso o sistema
        // acumularia contas soltas que nunca vão acessar nada.
        const ok = await conferirConvite(convite);
        if (!ok) {
          throw new Error(
            "Código de convite inválido, já usado ou vencido. Peça um novo para o responsável pela loja."
          );
        }
        // Guardado para ser aplicado assim que a conta entrar de fato
        localStorage.setItem(CONVITE_PENDENTE, convite.trim().toUpperCase());
        if (nome.trim()) localStorage.setItem("sistema-ti:nome-convite", nome.trim());

        const { precisaConfirmar } = await criarConta(email, senha);
        if (precisaConfirmar) {
          setAviso(
            "Conta criada! Confirme o e-mail que enviamos e depois faça login — seu acesso já estará liberado."
          );
          setModo("entrar");
        } else {
          onEntrou();
        }
      } else {
        await recuperarSenha(email);
        setAviso("Enviamos um link de redefinição para o seu e-mail.");
        setModo("entrar");
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  };

  if (!supabaseEnabled) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
        <div className="max-w-md rounded-2xl bg-white p-6 text-center">
          <AlertTriangle className="mx-auto mb-3 text-amber-500" size={36} />
          <h1 className="mb-2 text-lg font-bold text-slate-800">Nuvem não configurada</h1>
          <p className="text-sm text-slate-600">
            Para entrar com segurança, o sistema precisa estar conectado ao banco na nuvem.
            Configure as variáveis <b>VITE_SUPABASE_URL</b> e <b>VITE_SUPABASE_ANON_KEY</b>.
          </p>
        </div>
      </div>
    );
  }

  const titulo =
    modo === "entrar" ? "Entrar" : modo === "criar" ? "Criar conta" : "Recuperar senha";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-brand-900 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600 shadow-lg">
            <Wrench className="text-white" size={30} />
          </div>
          <h1 className="text-2xl font-bold text-white">Sistema TI</h1>
          <p className="text-sm text-slate-400">Caixa &amp; Ordens de Serviço</p>
        </div>

        <form onSubmit={enviar} className="rounded-2xl bg-white p-6 shadow-2xl">
          <h2 className="mb-4 text-lg font-bold text-slate-800">{titulo}</h2>

          {modo === "criar" && (
            <>
              <label className="label">Código de convite</label>
              <div className="relative mb-1">
                <Ticket size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  required
                  className="input pl-10 font-mono uppercase tracking-widest"
                  placeholder="XXXXXXXXXX"
                  maxLength={10}
                  value={convite}
                  onChange={(e) => setConvite(e.target.value.toUpperCase())}
                />
              </div>
              <p className="mb-4 text-xs text-slate-400">
                Peça ao responsável pela loja. Sem convite não é possível criar conta.
              </p>

              <label className="label">Seu nome</label>
              <div className="relative mb-4">
                <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  className="input pl-10"
                  placeholder="Como aparece para a equipe"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                />
              </div>
            </>
          )}

          <label className="label">E-mail</label>
          <div className="relative mb-4">
            <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="email"
              required
              autoComplete="email"
              className="input pl-10"
              placeholder="voce@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {modo !== "recuperar" && (
            <>
              <label className="label">Senha</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete={modo === "criar" ? "new-password" : "current-password"}
                  className="input pl-10"
                  placeholder="Sua senha"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                />
              </div>
              {modo === "criar" && senha.length > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full transition-all ${
                        forca.nivel === 0 ? "w-1/12 bg-red-500"
                          : forca.nivel === 1 ? "w-1/3 bg-red-500"
                          : forca.nivel === 2 ? "w-2/3 bg-amber-500"
                          : "w-full bg-emerald-500"
                      }`}
                    />
                  </div>
                  <span className="text-xs text-slate-500">{forca.texto}</span>
                </div>
              )}
            </>
          )}

          {erro && (
            <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm font-medium text-red-700">{erro}</p>
          )}
          {aviso && (
            <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-sm font-medium text-emerald-700">
              {aviso}
            </p>
          )}

          <button type="submit" className="btn-primary mt-4 w-full" disabled={carregando}>
            {carregando ? "Aguarde..." : titulo}
          </button>

          <div className="mt-4 space-y-1 text-center text-xs">
            {modo === "entrar" && (
              <>
                <button
                  type="button"
                  className="text-brand-600 hover:underline"
                  onClick={() => setModo("criar")}
                >
                  Tenho um convite — criar conta
                </button>
                <br />
                <button
                  type="button"
                  className="text-slate-400 hover:underline"
                  onClick={() => setModo("recuperar")}
                >
                  Esqueci minha senha
                </button>
              </>
            )}
            {modo !== "entrar" && (
              <button
                type="button"
                className="text-brand-600 hover:underline"
                onClick={() => setModo("entrar")}
              >
                Voltar para o login
              </button>
            )}
          </div>
        </form>

        <p className="mt-4 flex items-center justify-center gap-1 text-center text-xs text-slate-400">
          <ShieldCheck size={13} /> Conexão criptografada · dados isolados por loja
        </p>
      </div>
    </div>
  );
};
