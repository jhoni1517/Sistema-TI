import React, { useEffect, useState } from "react";
import { Lock, Wrench, Mail, AlertTriangle, ShieldCheck, Ticket, User } from "lucide-react";
import {
  entrar,
  criarConta,
  recuperarSenha,
  forcaSenha,
  conferirConvite,
  reenviarConfirmacao,
  diagnosticar,
  CONVITE_PENDENTE,
} from "../lib/auth";
import { supabaseEnabled } from "../lib/supabase";
import { marcaDoAparelho } from "../lib/db";
import {
  RAMOS,
  RAMO_META,
  lerRamoAparelho,
  definirRamoAparelho,
  ramoLembrado,
  ramoDoEmail,
  type Ramo,
} from "../lib/ramos";

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
  const [precisaConfirmar, setPrecisaConfirmar] = useState(false);
  const [diag, setDiag] = useState("");
  /**
   * Tipo de loja escolhido aqui na porta.
   *
   * Vale só neste aparelho e não grava nada: serve para demonstrar o sistema
   * a um cliente novo e para experimentar sem medo. Trocar o ramo dentro de
   * Configurações mexe na loja de verdade — foi assim que as ordens de
   * serviço sumiram da tela do dono numa tentativa de só dar uma olhada.
   */
  const [ramo, setRamo] = useState<Ramo | null>(() => lerRamoAparelho());
  /**
   * Nome e logo que este aparelho já tem guardados.
   *
   * Lido uma vez: é o mesmo dado que a abertura em index.html mostra, e ele
   * não muda enquanto ninguém entrou. Some no logout junto com o resto do
   * cache — num balcão compartilhado, a loja anterior não fica na porta.
   */
  const [marca] = useState(marcaDoAparelho);

  const escolherRamo = (r: Ramo) => {
    const novo = ramo === r ? null : r;
    setRamo(novo);
    definirRamoAparelho(novo);
  };

  /**
   * O aparelho já conhece esta conta?
   *
   * Quem já entrou aqui não precisa dizer de novo que tem uma mercearia — e,
   * pior, os botões de tipo de loja nem valiam para ele: só o administrador
   * demonstrando o sistema muda de ramo. Clicar e nada acontecer parecia
   * defeito. Esta é a resposta instantânea, vinda do login anterior neste
   * aparelho — sem rede e sem espera. Quando ela não sabe, a consulta ao
   * servidor logo abaixo assume.
   */
  const lembrado = modo === "entrar" ? ramoLembrado(email) : null;

  /**
   * Ramo que o servidor conhece para este e-mail.
   *
   * A memória do aparelho só resolve onde a conta já entrou uma vez — e o
   * aparelho novo é justamente onde a pessoa mais precisa de ajuda. A
   * consulta acontece com atraso, depois que a pessoa para de digitar:
   * disparar a cada tecla transformaria a tela de entrada num gerador de
   * tráfego, e ainda piscaria o nome do ramo enquanto o e-mail é escrito.
   */
  const [ramoDaConta, setRamoDaConta] = useState<Ramo | null>(null);

  useEffect(() => {
    if (modo !== "entrar" || lembrado) return setRamoDaConta(null);
    let vivo = true;
    const t = setTimeout(async () => {
      const r = await ramoDoEmail(email);
      // Só aplica se o campo ainda for o mesmo: quem digita rápido dispara
      // duas consultas, e a lenta chegando por último mostraria o ramo de um
      // e-mail que já não está mais na tela.
      if (vivo) setRamoDaConta(r);
    }, 600);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [email, modo, lembrado]);

  const conhecida = lembrado ?? ramoDaConta;
  const ramoNaTela = conhecida ?? ramo;
  /*
   * O SELETOR DE TIPO DE LOJA SÓ APARECE NO CADASTRO.
   *
   * Quem entra já tem loja: a escolha nunca valeu para ele — só o
   * administrador demonstrando o sistema muda de ramo, e clicar sem nada
   * acontecer parecia defeito. Com a lista crescendo (são cinco tipos e vêm
   * mais), a primeira tela do sistema virava uma parede de botões antes do
   * campo de e-mail.
   *
   * No cadastro é o contrário: ali a escolha é o dado mais importante da
   * conta, porque decide quais telas a loja vai ter.
   */
  const mostraEscolha = modo === "criar";

  const forca = forcaSenha(senha);

  // Limpa mensagens ao trocar de modo, para não confundir quem está lendo
  useEffect(() => {
    setErro("");
    setPrecisaConfirmar(false);
  }, [modo]);

  const verDiagnostico = async () => {
    setDiag("Verificando...");
    const r = await diagnosticar();
    setDiag(r.detalhe);
  };

  const reenviar = async () => {
    try {
      await reenviarConfirmacao(email);
      setErro("");
      setAviso("Reenviamos o e-mail de confirmação. Verifique também o lixo eletrônico.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

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

        // O convite vai junto: o e-mail de confirmação costuma abrir noutro
        // navegador, e lá o localStorage está vazio.
        const { precisaConfirmar } = await criarConta(email, senha, convite);
        if (precisaConfirmar) {
          setAviso(
            "Conta criada! Confirme o e-mail que enviamos e depois faça login — " +
              "seu acesso já estará liberado. Abra o link no mesmo aparelho, e se " +
              "o e-mail não chegar em alguns minutos confira a caixa de spam."
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
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "CONFIRMAR_EMAIL") {
        setPrecisaConfirmar(true);
        setErro(
          "Este e-mail ainda não foi confirmado. Abra o link que enviamos para " +
            email.trim() + " e depois entre."
        );
      } else {
        setErro(msg);
        // Senha errada é o caso comum, mas não o único: se a conta é nova,
        // o Supabase também recusa quem não confirmou o e-mail.
        setPrecisaConfirmar(modo === "entrar" && /incorretos/.test(msg));
      }
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
    <div className="fundo-entrada flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          {/*
           * A porta é da LOJA, não do sistema.
           *
           * Com a logo guardada neste aparelho, é ela que aparece — quem abre
           * às sete da manhã é o dono, e ver a marca dele antes de digitar a
           * senha é a diferença entre um app que é da loja e um app genérico
           * que a loja usa. Sem logo, fica a marca do sistema, que é a mesma
           * do ícone da tela inicial: quem toca no âmbar precisa cair numa
           * tela que confirma que abriu o app certo.
           */}
          <div
            className={`marca-viva relative mx-auto mb-4 flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-[20px] shadow-lg shadow-orange-900/40 ${
              marca.logoUrl
                ? "bg-white"
                : "bg-gradient-to-br from-amber-300 via-amber-500 to-orange-600"
            }`}
          >
            {marca.logoUrl ? (
              <img
                src={marca.logoUrl}
                alt=""
                className="h-full w-full object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <Wrench className="text-stone-900" size={32} strokeWidth={2.6} />
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {marca.nomeLoja || "Sistema TI"}
          </h1>
          <p className="mt-1.5 text-[13px] leading-snug text-slate-400">
            Abre, vende, conserta e fecha o dia certo.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {ramoNaTela ? RAMO_META[ramoNaTela].descricao : "Caixa, estoque e atendimento"}
          </p>
        </div>

        {/* Conta que já entrou aqui: a tela se apresenta sozinha */}
        {conhecida && (
          <div className="mb-4 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-center">
            <p className="text-sm font-semibold text-amber-200">
              {RAMO_META[conhecida].label}
            </p>
            <p className="mt-0.5 text-xs text-amber-100/70">
              Reconhecemos esta conta.
            </p>

          </div>
        )}

        {/* Tipo de loja, antes de entrar. Não grava nada e vale só aqui. */}
        {mostraEscolha && (
          <div className="mb-4">
            <p className="mb-2 text-center text-xs uppercase tracking-wide text-slate-500">
              Tipo de loja
            </p>
            <div className="grid grid-cols-2 gap-2">
              {RAMOS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => escolherRamo(r)}
                  className={`rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition ${
                    ramo === r
                      ? "border-amber-400 bg-amber-400/15 text-amber-200"
                      : "border-slate-700 text-slate-300 hover:border-slate-500 hover:bg-white/5"
                  }`}
                >
                  {RAMO_META[r].label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-center text-xs text-slate-500">
              {/* Deixa explícito que isto é vitrine, não plano: só o
                  administrador vê outro ramo depois de entrar. Antes o botão
                  dava a impressão de liberar o que a loja não comprou. */}
              Só muda a aparência desta tela. O que a sua loja usa é o que foi
              contratado.
            </p>
          </div>
        )}

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
            <div className="mt-3 rounded-lg bg-red-50 p-2 text-sm font-medium text-red-700">
              <p>{erro}</p>
              {precisaConfirmar && email.trim() && (
                <button
                  type="button"
                  className="mt-1.5 underline"
                  onClick={reenviar}
                >
                  Reenviar e-mail de confirmação
                </button>
              )}
            </div>
          )}
          {aviso && (
            <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-sm font-medium text-emerald-700">
              {aviso}
            </p>
          )}

          {/*
           * Âmbar fixo, e não a cor de destaque da loja.
           *
           * `btn-primary` segue `corDestaque`, que nasce AZUL. Antes de
           * entrar não existe loja para ter cor: a tela mostrava um botão
           * azul embaixo de uma marca âmbar, com a barra do navegador
           * laranja em volta. Três cores brigando na primeira tela é o que
           * faz um sistema parecer montado às pressas. Aqui quem manda é a
           * marca do sistema; lá dentro, a cor que a loja escolheu.
           */}
          <button
            type="submit"
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-600/25 transition-all duration-150 hover:from-amber-500 hover:to-orange-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={carregando}
          >
            {carregando ? "Aguarde..." : titulo}
          </button>

          <div className="mt-4 space-y-1 text-center text-xs">
            {modo === "entrar" && (
              <>
                <button
                  type="button"
                  className="font-semibold text-orange-600 hover:underline"
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
                className="font-semibold text-orange-600 hover:underline"
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

        {/* Diagnóstico: dá o motivo real quando o login falha em outro aparelho */}
        <div className="mt-2 text-center">
          <button
            type="button"
            onClick={verDiagnostico}
            className="text-xs text-slate-500 underline hover:text-slate-300"
          >
            Problemas para entrar? Testar conexão
          </button>
          {diag && (
            <p className="mx-auto mt-2 max-w-sm rounded-lg bg-slate-800/70 p-2 text-xs text-slate-300">
              {diag}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
