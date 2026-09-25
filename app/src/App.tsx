import React, { useCallback, useEffect, useState } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { ShieldOff } from "lucide-react";
import { AppProvider } from "./store/AppStore";
import { AvisoProvider } from "./components/Aviso";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { OrdensServico } from "./pages/OrdensServico";
import { Clientes } from "./pages/Clientes";
import { Estoque } from "./pages/Estoque";
import { Caixa } from "./pages/Caixa";
import { AReceber } from "./pages/AReceber";
import { Contas } from "./pages/Contas";
import { Renda } from "./pages/Renda";
import { Agenda } from "./pages/Agenda";
import { Checklist } from "./pages/Checklist";
import { Mesas } from "./pages/Mesas";
import { Cozinha } from "./pages/Cozinha";
import { Delivery } from "./pages/Delivery";
import { PDV } from "./pages/PDV";
import { Relatorios } from "./pages/Relatorios";
import { TabelaServicos } from "./pages/TabelaServicos";
import { PedidosSite } from "./pages/PedidosSite";
import { Auditoria } from "./pages/Auditoria";
import { Trocas } from "./pages/Trocas";
import { OrcarPublico } from "./pages/OrcarPublico";
import { DepoimentosPublico } from "./pages/DepoimentosPublico";
import { Config } from "./pages/Config";
import { Rastreio } from "./pages/Rastreio";
import { PainelBancada } from "./pages/PainelBancada";
import { Catalogo } from "./pages/Catalogo";
import { AreaCliente } from "./pages/AreaCliente";
import { CadastroCliente } from "./pages/CadastroCliente";
import { Indicar } from "./pages/Indicar";
import { SeminovoPublico } from "./pages/SeminovoPublico";
import { SemPerfil } from "./pages/SemPerfil";
import { Lojas } from "./pages/Lojas";
import { Assinatura } from "./pages/Assinatura";
import { carregarSessao, carregarChaveLoja, sair, pode, type Sessao } from "./lib/auth";
import { definirLoja, limparCacheLocal, entrarDemo, sairDemo } from "./lib/db";
import { gerarDemo, LOJA_DEMO, SESSAO_DEMO, MENSAGEM_QUERO_CONTA } from "./lib/demo";
import { abrirWhatsapp } from "./lib/format";
import { aviso } from "./components/Aviso";
import { useApp } from "./store/AppStore";
import { temModulo, type Modulo } from "./lib/ramos";
import { ForaDoPlano } from "./components/ForaDoPlano";
import { supabase, supabaseEnabled } from "./lib/supabase";

const Carregando: React.FC = () => (
  <div className="flex min-h-screen items-center justify-center bg-slate-100">
    <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
  </div>
);

/** Perfil existe, mas o responsável desativou o acesso */
const Suspenso: React.FC<{ onSair: () => void }> = ({ onSair }) => (
  <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
    <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
      <ShieldOff className="mx-auto mb-3 text-amber-500" size={40} />
      <h1 className="text-lg font-bold text-slate-800">Acesso suspenso</h1>
      <p className="mt-2 text-sm text-slate-600">
        O responsável pela loja desativou o seu acesso. Fale com ele para
        reativar em Configurações → Equipe.
      </p>
      <button className="btn-secondary mt-5" onClick={onSair}>
        Sair
      </button>
    </div>
  </div>
);

/** Bloqueia a rota quando o papel do usuário não tem acesso ao recurso */
const Protegida: React.FC<{ recurso: string; papel?: string; children: React.ReactNode }> = ({
  recurso,
  papel,
  children,
}) => {
  if (!pode(papel as never, recurso)) return <Navigate to="/" replace />;
  return <>{children}</>;
};

/**
 * Bloqueia a rota de um módulo que a loja não contratou.
 *
 * Esconder do menu não basta: o endereço continua digitável, e link de
 * WhatsApp circula. A tela explica em vez de redirecionar calado — quem cai
 * aqui é cliente pagante que abriu a porta errada.
 */
const DoPlano: React.FC<{ modulo: Modulo; children: React.ReactNode }> = ({
  modulo,
  children,
}) => {
  const { ramo } = useApp();
  if (!temModulo(ramo, modulo)) return <ForaDoPlano modulo={modulo} />;
  return <>{children}</>;
};

const AreaProtegida: React.FC = () => {
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [verificando, setVerificando] = useState(true);

  const revalidar = useCallback(async () => {
    const s = await carregarSessao();
    definirLoja(s?.perfil?.loja_id ?? null);
    // A chave precisa estar pronta ANTES das telas pedirem dados, senão a
    // primeira leitura das OS viria com a senha ilegível.
    await carregarChaveLoja(s?.perfil?.loja_id ?? null);
    setSessao(s);
    setVerificando(false);
  }, []);

  useEffect(() => {
    revalidar();
    if (!supabaseEnabled || !supabase) return;
    // Reage a login/logout/expiração do token em qualquer aba
    const { data } = supabase.auth.onAuthStateChange(() => revalidar());
    return () => data.subscription.unsubscribe();
  }, [revalidar]);

  /*
   * Loja de exemplo: o sistema inteiro, sem login, em cima de dados que
   * moram só na memória. Ver lib/demo.ts e `entrarDemo` em lib/db.ts.
   */
  const [demo, setDemo] = useState(false);
  const [contato, setContato] = useState("");

  const entrarNaDemo = () => {
    const d = gerarDemo();
    entrarDemo(
      {
        clientes: d.clientes,
        ordens: d.ordens,
        produtos: d.produtos,
        movimentos: d.movimentos,
        sessoes: d.sessoes,
        vendas: d.vendas,
      },
      d.config
    );
    definirLoja(LOJA_DEMO);
    setDemo(true);
    // O número de vendas vem antes do clique: abrir o WhatsApp depois de
    // esperar a rede faz o navegador do celular bloquear a janela.
    supabase
      ?.rpc("contato_do_sistema")
      .then(({ data }) => setContato(typeof data === "string" ? data : ""));
  };

  const sairDaDemo = () => {
    sairDemo();
    definirLoja(null);
    setDemo(false);
  };

  const criarConta = () => {
    sairDaDemo();
    if (contato) return abrirWhatsapp(contato, MENSAGEM_QUERO_CONTA);
    aviso.alerta("Para criar sua conta, peça o código de convite a quem te mostrou o sistema.");
  };

  const logout = async () => {
    await sair();
    definirLoja(null);
    // Não deixa dados da loja anterior no aparelho (balcão compartilhado)
    limparCacheLocal();
    setSessao(null);
  };

  if (demo) {
    return (
      <AppProvider>
        <Rotas sessao={SESSAO_DEMO} onLogout={sairDaDemo} onCriarConta={criarConta} />
      </AppProvider>
    );
  }
  if (verificando) return <Carregando />;
  if (!sessao) return <Login onEntrou={revalidar} onDemo={entrarNaDemo} />;
  // Conta criada, mas ainda sem vínculo com uma loja
  if (!sessao.perfil) {
    return <SemPerfil email={sessao.email} onSair={logout} onVinculado={revalidar} />;
  }
  // Acesso suspenso pelo responsável: antes a pessoa entrava e via tudo
  // vazio, sem entender o motivo. Agora o sistema fala com clareza.
  if (!sessao.perfil.ativo) return <Suspenso onSair={logout} />;

  return (
    <AppProvider souSuperAdmin={sessao.perfil.super_admin === true} email={sessao.email}>
      <Rotas sessao={sessao} onLogout={logout} />
    </AppProvider>
  );
};

/** As telas de dentro. As mesmas para a loja real e para a de exemplo. */
const Rotas: React.FC<{ sessao: Sessao; onLogout: () => void; onCriarConta?: () => void }> = ({
  sessao,
  onLogout,
  onCriarConta,
}) => {
  const papel = sessao.perfil?.papel;
  return (
      <Routes>
        {/* A TV da bancada: tela cheia, sem menu. Fora do Layout de
            propósito — menu lateral na parede da loja é espaço roubado da
            fila, e um clique errado de quem passa abre o caixa. */}
        <Route path="painel" element={<Protegida recurso="os" papel={papel}><DoPlano modulo="os"><PainelBancada /></DoPlano></Protegida>} />
        <Route element={<Layout onLogout={onLogout} sessao={sessao} onCriarConta={onCriarConta} />}>
          <Route index element={<Dashboard />} />
          <Route path="ordens" element={<Protegida recurso="os" papel={papel}><DoPlano modulo="os"><OrdensServico /></DoPlano></Protegida>} />
          <Route path="tabela" element={<Protegida recurso="os" papel={papel}><DoPlano modulo="os"><TabelaServicos papel={papel} /></DoPlano></Protegida>} />
          <Route path="orcamentos-site" element={<Protegida recurso="os" papel={papel}><DoPlano modulo="os"><PedidosSite /></DoPlano></Protegida>} />
          <Route path="trocas" element={<Protegida recurso="estoque" papel={papel}><DoPlano modulo="os"><Trocas /></DoPlano></Protegida>} />
          <Route path="auditoria" element={<Protegida recurso="auditoria" papel={papel}><Auditoria /></Protegida>} />
          <Route path="clientes" element={<Protegida recurso="clientes" papel={papel}><Clientes /></Protegida>} />
          <Route path="estoque" element={<Protegida recurso="estoque" papel={papel}><Estoque /></Protegida>} />
          <Route path="caixa" element={<Protegida recurso="caixa" papel={papel}><Caixa /></Protegida>} />
          <Route path="a-receber" element={<Protegida recurso="fiado" papel={papel}><AReceber /></Protegida>} />
          <Route path="contas" element={<Protegida recurso="caixa" papel={papel}><Contas /></Protegida>} />
          <Route path="renda" element={<Protegida recurso="caixa" papel={papel}><Renda /></Protegida>} />
          <Route path="agenda" element={<Agenda />} />
          <Route path="checklist" element={<Checklist />} />
          <Route path="mesas" element={<Protegida recurso="caixa" papel={papel}><DoPlano modulo="mesas"><Mesas /></DoPlano></Protegida>} />
          <Route path="cozinha" element={<Protegida recurso="caixa" papel={papel}><DoPlano modulo="producao"><Cozinha /></DoPlano></Protegida>} />
          <Route path="entrega" element={<Protegida recurso="caixa" papel={papel}><DoPlano modulo="delivery"><Delivery /></DoPlano></Protegida>} />
          <Route path="pdv" element={<Protegida recurso="caixa" papel={papel}><DoPlano modulo="pdv"><PDV /></DoPlano></Protegida>} />
          <Route path="relatorios" element={<Protegida recurso="relatorios" papel={papel}><Relatorios /></Protegida>} />
          <Route path="config" element={<Protegida recurso="config" papel={papel}><Config /></Protegida>} />
          <Route path="assinatura" element={<Protegida recurso="config" papel={papel}><Assinatura /></Protegida>} />
          {/* Painel de quem administra o sistema inteiro */}
          {sessao.perfil?.super_admin && <Route path="lojas" element={<Lojas />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
  );
};


const App: React.FC = () => (
  <AvisoProvider>
  <HashRouter>
    <Routes>
      {/* Acompanhamento público — não exige login e não expõe dados sensíveis */}
      <Route path="/rastreio" element={<Rastreio />} />
      <Route path="/rastreio/:codigo" element={<Rastreio />} />
      {/* Vitrine pública: sem login, e o que ela mostra é decidido no banco.
          Filtrar só na tela não esconde nada de quem abre o painel do
          navegador. */}
      <Route path="/catalogo/:loja" element={<Catalogo />} />
      {/* Área do cliente: CPF e senha que o cliente cria. Não é usuário do
          sistema; quem confere tudo são as funções do banco. */}
      <Route path="/cliente/:loja" element={<AreaCliente />} />
      {/* Só o formulário: o cadastro cai na lista da loja, sem senha */}
      <Route path="/cadastro/:loja" element={<CadastroCliente />} />
      {/* Lojista indica lojista: sem login, o bônus é dado pelo banco */}
      <Route path="/indicar/:codigo" element={<Indicar />} />
      {/* Ficha do aparelho usado: o corte do que sai é da função do banco */}
      <Route path="/seminovo/:loja/:token" element={<SeminovoPublico />} />
      {/* Orçamento pelo site: link no Instagram e no Google da loja. */}
      <Route path="/orcar/:loja" element={<OrcarPublico />} />
      <Route path="/depoimentos/:loja" element={<DepoimentosPublico />} />
      <Route path="/*" element={<AreaProtegida />} />
    </Routes>
  </HashRouter>
  </AvisoProvider>
);

export default App;
