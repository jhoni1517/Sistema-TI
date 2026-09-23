import React, { useCallback, useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { LogOut, MessageCircle, ShieldCheck, ChevronRight, Wrench } from "lucide-react";
import { supabase, supabaseEnabled } from "../lib/supabase";
import { MarcaDaLoja } from "../components/MarcaDaLoja";
import { corDaLoja, linkDeRastreio } from "../lib/rastreio";
import { OS_STATUS_META } from "../lib/types";
import { brl, formatDate, soDigitos, codigoOS, whatsappLink } from "../lib/format";
import { hojeISO } from "../lib/contas";
import {
  acessoDoLink,
  aparelhoDaOS,
  erroDaSenha,
  erroDoCadastro,
  garantiaDaArea,
  garantiasAtivas,
  separarOrdens,
  tempoDeCasa,
  type AreaDoCliente,
  type LojaDaArea,
  type OSDoCliente,
} from "../lib/area-cliente";

type Modo = "entrar" | "cadastro" | "senha";

/*
 * A sessão fica no aparelho do cliente, por loja. localStorage pode falhar
 * (aba anônima, armazenamento bloqueado): aí a pessoa só digita a senha de
 * novo, nada quebra.
 */
const chave = (loja: string) => `area-cliente:${loja}`;
const lerSessao = (loja: string): string => {
  try {
    return localStorage.getItem(chave(loja)) || "";
  } catch {
    return "";
  }
};
const gravarSessao = (loja: string, token: string) => {
  try {
    if (token) localStorage.setItem(chave(loja), token);
    else localStorage.removeItem(chave(loja));
  } catch {
    /* sem armazenamento: entra de novo na próxima visita */
  }
};

const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** A área do cliente: cadastro pelo link, entrada com CPF e senha, e as OS */
export const AreaCliente: React.FC = () => {
  const { loja = "" } = useParams();
  const local = useLocation();
  const acesso = acessoDoLink(local.search);

  const [dadosLoja, setDadosLoja] = useState<LojaDaArea | null | undefined>(undefined);
  const [token, setToken] = useState(() => lerSessao(loja));
  const [area, setArea] = useState<AreaDoCliente | null>(null);
  const [modo, setModo] = useState<Modo>(acesso ? "senha" : "entrar");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  const [cpf, setCpf] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [nascimento, setNascimento] = useState("");

  useEffect(() => {
    if (!supabaseEnabled || !supabase || !loja) {
      setDadosLoja(null);
      return;
    }
    supabase
      .rpc("area_cliente_loja", { p_loja: loja })
      .then(({ data, error }) => setDadosLoja(error ? null : ((data as LojaDaArea) ?? null)));
  }, [loja]);

  const carregarArea = useCallback(
    async (t: string) => {
      if (!supabase || !t) return;
      const { data, error } = await supabase.rpc("area_do_cliente", { p_token: t });
      if (error) {
        setErro("Não deu para abrir seus consertos agora. Tenta de novo daqui a pouco.");
        return;
      }
      const r = data as AreaDoCliente & { erro?: string };
      if (r?.erro) {
        // Sessão vencida ou senha trocada em outro aparelho: volta para a
        // entrada sem assustar ninguém.
        gravarSessao(loja, "");
        setToken("");
        setArea(null);
        return;
      }
      setArea(r);
    },
    [loja]
  );

  useEffect(() => {
    if (token && !acesso) carregarArea(token);
  }, [token, acesso, carregarArea]);

  /** As três portas devolvem { token } ou { erro } */
  const entrarCom = async (rpc: string, args: Record<string, unknown>) => {
    if (!supabase) return;
    setErro("");
    setEnviando(true);
    try {
      const { data, error } = await supabase.rpc(rpc, args);
      if (error) throw new Error(error.message);
      const r = data as { token?: string; erro?: string };
      if (r?.erro || !r?.token) {
        setErro(r?.erro || "Não deu certo. Tenta de novo.");
        return;
      }
      gravarSessao(loja, r.token);
      setToken(r.token);
      setSenha("");
      setConfirmacao("");
      // Tira o ?acesso= do endereço: o link vale uma vez, e recarregar a
      // página com ele mostraria "link vencido" para quem acabou de entrar.
      if (acesso) window.location.hash = `#/cliente/${loja}`;
      await carregarArea(r.token);
    } catch (e) {
      setErro("Não deu para falar com a loja agora: " + mensagem(e));
    } finally {
      setEnviando(false);
    }
  };

  const entrar = (e: React.FormEvent) => {
    e.preventDefault();
    if (soDigitos(cpf).length !== 11) return setErro("Confira o CPF: são 11 números.");
    entrarCom("entrar_cliente", { p_loja: loja, p_cpf: soDigitos(cpf), p_senha: senha });
  };

  const cadastrar = (e: React.FormEvent) => {
    e.preventDefault();
    const problema = erroDoCadastro({ nome, cpf, telefone, nascimento, senha, confirmacao }, hojeISO());
    if (problema) return setErro(problema);
    entrarCom("cadastrar_cliente_publico", {
      p_loja: loja,
      p_nome: nome.trim(),
      p_cpf: soDigitos(cpf),
      p_telefone: soDigitos(telefone),
      p_nascimento: nascimento,
      p_senha: senha,
    });
  };

  const criarSenha = (e: React.FormEvent) => {
    e.preventDefault();
    const problema = erroDaSenha(senha, confirmacao);
    if (problema) return setErro(problema);
    entrarCom("definir_senha_cliente", { p_loja: loja, p_link: acesso, p_senha: senha });
  };

  const sair = async () => {
    const t = token;
    gravarSessao(loja, "");
    setToken("");
    setArea(null);
    setModo("entrar");
    try {
      await supabase?.rpc("sair_cliente", { p_token: t });
    } catch {
      /* a sessão vence sozinha em 30 dias; o aparelho já esqueceu */
    }
  };

  const cor = corDaLoja(dadosLoja?.cor);
  const whats = soDigitos(dadosLoja?.whatsapp);
  const pedirLink = whats.length >= 10
    ? whatsappLink(whats, "Oi! Queria o link para criar minha senha da área do cliente.")
    : "";

  return (
    <div className="min-h-screen bg-papel p-4 font-grotesca text-tinta">
      <div className="mx-auto max-w-lg py-6">
        <header className="mb-5 overflow-hidden rounded-md border border-linha bg-cartao">
          {cor && <div className="h-1.5" style={{ backgroundColor: cor }} />}
          <div className="flex items-center gap-3 p-4">
            <MarcaDaLoja logoUrl={dadosLoja?.logo || undefined} tamanho={44} />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-bold leading-tight">{dadosLoja?.nome || "Área do cliente"}</h1>
              <p className="text-sm text-tinta-suave">Seus consertos, todos num lugar só</p>
            </div>
            {area && (
              <button onClick={sair} className="rounded-md p-2 text-tinta-suave hover:bg-concreto" title="Sair">
                <LogOut size={18} />
              </button>
            )}
          </div>
        </header>

        {dadosLoja === undefined || (token && !area && !erro && !acesso) ? (
          <Caixa>
            <p className="text-center text-tinta-suave">Abrindo...</p>
          </Caixa>
        ) : dadosLoja === null ? (
          <Caixa>
            <p className="text-center font-semibold">Este link não está funcionando.</p>
            <p className="mt-1 text-center text-sm text-tinta-suave">Pede o link de novo pra loja.</p>
          </Caixa>
        ) : area ? (
          <Painel area={area} loja={loja} />
        ) : (
          <Caixa>
            {modo !== "senha" && (
              <div className="mb-5 grid grid-cols-2 gap-1 rounded-md bg-concreto p-1">
                {(["entrar", "cadastro"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      setModo(m);
                      setErro("");
                    }}
                    className={`rounded px-3 py-2 text-sm font-semibold ${
                      modo === m ? "bg-cartao text-tinta shadow-sm" : "text-tinta-suave"
                    }`}
                  >
                    {m === "entrar" ? "Já tenho cadastro" : "Criar cadastro"}
                  </button>
                ))}
              </div>
            )}

            {modo === "entrar" && (
              <form onSubmit={entrar} className="space-y-3">
                <Campo rotulo="CPF" valor={cpf} mudar={setCpf} modo="numeric" auto="username" />
                <Campo rotulo="Senha" valor={senha} mudar={setSenha} tipo="password" auto="current-password" />
                <Erro texto={erro} />
                <Botao enviando={enviando}>Entrar</Botao>
                {pedirLink ? (
                  <a href={pedirLink} target="_blank" rel="noreferrer" className="block text-center text-sm font-semibold text-sinal">
                    Esqueci a senha ou nunca criei uma
                  </a>
                ) : (
                  <p className="text-center text-xs text-tinta-suave">
                    Esqueceu a senha? Pede pra loja o link para criar outra.
                  </p>
                )}
              </form>
            )}

            {modo === "cadastro" && (
              <form onSubmit={cadastrar} className="space-y-3">
                <Campo rotulo="Nome completo" valor={nome} mudar={setNome} auto="name" />
                <Campo rotulo="CPF" valor={cpf} mudar={setCpf} modo="numeric" />
                <Campo rotulo="WhatsApp com DDD" valor={telefone} mudar={setTelefone} modo="tel" auto="tel" />
                <Campo rotulo="Data de nascimento" valor={nascimento} mudar={setNascimento} tipo="date" />
                <Campo rotulo="Crie uma senha (6 ou mais)" valor={senha} mudar={setSenha} tipo="password" auto="new-password" />
                <Campo rotulo="Repita a senha" valor={confirmacao} mudar={setConfirmacao} tipo="password" auto="new-password" />
                <Erro texto={erro} />
                <Botao enviando={enviando}>Criar cadastro</Botao>
                <p className="text-center text-xs text-tinta-suave">
                  Seus dados ficam só com a loja. Para entrar depois: CPF e a senha que você criou.
                </p>
              </form>
            )}

            {modo === "senha" && (
              <form onSubmit={criarSenha} className="space-y-3">
                <p className="font-semibold">Crie sua senha</p>
                <p className="text-sm text-tinta-suave">
                  Depois é só entrar com seu CPF e esta senha.
                </p>
                <Campo rotulo="Nova senha (6 ou mais)" valor={senha} mudar={setSenha} tipo="password" auto="new-password" />
                <Campo rotulo="Repita a senha" valor={confirmacao} mudar={setConfirmacao} tipo="password" auto="new-password" />
                <Erro texto={erro} />
                <Botao enviando={enviando}>Salvar senha e entrar</Botao>
              </form>
            )}
          </Caixa>
        )}

        <p className="mt-6 text-center text-xs text-tinta-suave">
          Esta página não mostra senha do aparelho nem dado de outra pessoa.
        </p>
      </div>
    </div>
  );
};

/** O que o cliente vê depois de entrar */
const Painel: React.FC<{ area: AreaDoCliente; loja: string }> = ({ area, loja }) => {
  const hoje = hojeISO();
  const { agora, historico } = separarOrdens(area.ordens || []);
  const garantias = garantiasAtivas(area.ordens || [], hoje);
  const casa = tempoDeCasa(area.desde, hoje);
  const feitos = historico.filter((o) => o.status === "entregue").length;
  const primeiro = area.nome.trim().split(/\s+/)[0];
  const whats = soDigitos(area.loja?.whatsapp);
  const falar = whats.length >= 10 ? whatsappLink(whats, "Oi! Sou cliente e queria falar com a loja.") : "";

  return (
    <div className="space-y-5">
      <Caixa>
        <p className="text-lg font-bold">Oi, {primeiro}!</p>
        {casa && <p className="text-sm text-tinta-suave">Cliente há {casa}</p>}
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Numero valor={agora.length} rotulo="na bancada" />
          <Numero valor={feitos} rotulo={feitos === 1 ? "conserto feito" : "consertos feitos"} />
          <Numero valor={garantias.length} rotulo={garantias.length === 1 ? "na garantia" : "na garantia"} />
        </div>
      </Caixa>

      {garantias.length > 0 && (
        <section>
          <p className="rotulo mb-2">Garantia valendo</p>
          <div className="space-y-2">
            {garantias.map(({ os, garantia }) => (
              <div key={os.numero} className="flex items-center gap-3 rounded-md border border-linha bg-cartao p-3">
                <ShieldCheck size={18} className="shrink-0 text-tinta-suave" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{aparelhoDaOS(os)}</p>
                  <p className="text-xs text-tinta-suave">
                    Até <span className="valor">{formatDate(garantia.ate)}</span> · faltam{" "}
                    <span className="valor">{garantia.diasRestantes}</span> dias
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-tinta-suave">Deu problema no que foi consertado? Chama a loja antes de vencer.</p>
        </section>
      )}

      <section>
        <p className="rotulo mb-2">Na bancada agora</p>
        {agora.length === 0 ? (
          <div className="rounded-md border-2 border-dashed border-linha p-6 text-center text-sm text-tinta-suave">
            <Wrench size={28} className="mx-auto mb-2 text-linha" />
            Nenhum aparelho seu na loja agora.
          </div>
        ) : (
          <div className="space-y-2">
            {agora.map((o) => (
              <LinhaOS key={o.numero} os={o} loja={loja} />
            ))}
          </div>
        )}
      </section>

      {historico.length > 0 && (
        <section>
          <p className="rotulo mb-2">Já feitos</p>
          <div className="space-y-2">
            {historico.map((o) => (
              <LinhaOS key={o.numero} os={o} loja={loja} hoje={hoje} />
            ))}
          </div>
        </section>
      )}

      {falar && (
        <a
          href={falar}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 rounded-md bg-sinal px-4 py-3 font-semibold text-sinal-tinta"
        >
          <MessageCircle size={18} /> Falar com a loja
        </a>
      )}
    </div>
  );
};

const LinhaOS: React.FC<{ os: OSDoCliente; loja: string; hoje?: string }> = ({ os, loja, hoje }) => {
  const meta = OS_STATUS_META[os.status] || OS_STATUS_META.aberta;
  const link = linkDeRastreio(`${window.location.origin}${window.location.pathname}`, loja, {
    numero: os.numero,
    rastreio: os.rastreio ?? undefined,
  });
  const g = hoje ? garantiaDaArea(os, hoje) : null;
  const conteudo = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="valor text-xs font-semibold text-tinta-suave">{codigoOS(os.numero)}</span>
          <span className={`rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${meta.carimbo}`}>
            {meta.label}
          </span>
        </div>
        <p className="mt-1 truncate font-semibold">{aparelhoDaOS(os)}</p>
        {os.defeito && <p className="truncate text-sm text-tinta-suave">{os.defeito}</p>}
        <p className="mt-0.5 text-xs text-tinta-suave">
          {os.entregueEm ? (
            <>
              Entregue em <span className="valor">{formatDate(os.entregueEm)}</span>
            </>
          ) : (
            <>
              Deixado em <span className="valor">{formatDate(os.criadoEm || "")}</span>
              {os.previsao && (
                <>
                  {" "}
                  · previsão <span className="valor">{formatDate(os.previsao)}</span>
                </>
              )}
            </>
          )}
          {g?.situacao === "vencida" && " · garantia vencida"}
        </p>
      </div>
      <div className="shrink-0 text-right">
        {typeof os.total === "number" && <p className="valor font-semibold">{brl(os.total)}</p>}
        {link && <ChevronRight size={18} className="ml-auto text-tinta-suave" />}
      </div>
    </>
  );
  const classe = "flex items-center gap-3 rounded-md border border-linha bg-cartao p-3";
  // O detalhe (fotos, linha do tempo, aprovar orçamento, Pix) já existe na
  // página de rastreio: a área só leva até lá, sem uma segunda cópia.
  return link ? (
    <a href={link} className={`${classe} hover:border-tinta-suave`}>
      {conteudo}
    </a>
  ) : (
    <div className={classe}>{conteudo}</div>
  );
};

export const Caixa: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="rounded-md border border-linha bg-cartao p-5">{children}</div>
);

const Numero: React.FC<{ valor: number; rotulo: string }> = ({ valor, rotulo }) => (
  <div className="rounded-md bg-concreto px-2 py-3">
    <p className="valor text-2xl font-semibold">{valor}</p>
    <p className="text-xs text-tinta-suave">{rotulo}</p>
  </div>
);

export const Campo: React.FC<{
  rotulo: string;
  valor: string;
  mudar: (v: string) => void;
  tipo?: string;
  modo?: "numeric" | "tel";
  auto?: string;
}> = ({ rotulo, valor, mudar, tipo = "text", modo, auto }) => (
  <label className="block">
    <span className="rotulo mb-1 block">{rotulo}</span>
    <input
      type={tipo}
      inputMode={modo}
      autoComplete={auto}
      value={valor}
      onChange={(e) => mudar(e.target.value)}
      className="w-full rounded-md border border-linha bg-papel px-3 py-2.5 text-base text-tinta focus:border-sinal focus:outline-none focus:ring-2 focus:ring-sinal/30"
    />
  </label>
);

export const Erro: React.FC<{ texto: string }> = ({ texto }) =>
  texto ? <p className="rounded-md border border-status-cancelada/40 bg-status-cancelada/10 p-2 text-sm">{texto}</p> : null;

export const Botao: React.FC<{ enviando: boolean; children: React.ReactNode }> = ({ enviando, children }) => (
  <button
    type="submit"
    disabled={enviando}
    className="w-full rounded-md bg-sinal px-4 py-3 font-semibold text-sinal-tinta disabled:opacity-60"
  >
    {enviando ? "Um instante..." : children}
  </button>
);
