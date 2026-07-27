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
import { Relatorios } from "./pages/Relatorios";
import { Config } from "./pages/Config";
import { Rastreio } from "./pages/Rastreio";
import { SemPerfil } from "./pages/SemPerfil";
import { Lojas } from "./pages/Lojas";
import { Assinatura } from "./pages/Assinatura";
import { carregarSessao, carregarChaveLoja, sair, pode, type Sessao } from "./lib/auth";
import { definirLoja, limparCacheLocal } from "./lib/db";
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

  const logout = async () => {
    await sair();
    definirLoja(null);
    // Não deixa dados da loja anterior no aparelho (balcão compartilhado)
    limparCacheLocal();
    setSessao(null);
  };

  if (verificando) return <Carregando />;
  if (!sessao) return <Login onEntrou={revalidar} />;
  // Conta criada, mas ainda sem vínculo com uma loja
  if (!sessao.perfil) {
    return <SemPerfil email={sessao.email} onSair={logout} onVinculado={revalidar} />;
  }
  // Acesso suspenso pelo responsável: antes a pessoa entrava e via tudo
  // vazio, sem entender o motivo. Agora o sistema fala com clareza.
  if (!sessao.perfil.ativo) return <Suspenso onSair={logout} />;

  const papel = sessao.perfil.papel;

  return (
    <AppProvider>
      <Routes>
        <Route element={<Layout onLogout={logout} sessao={sessao} />}>
          <Route index element={<Dashboard />} />
          <Route path="ordens" element={<Protegida recurso="os" papel={papel}><OrdensServico /></Protegida>} />
          <Route path="clientes" element={<Protegida recurso="clientes" papel={papel}><Clientes /></Protegida>} />
          <Route path="estoque" element={<Protegida recurso="estoque" papel={papel}><Estoque /></Protegida>} />
          <Route path="caixa" element={<Protegida recurso="caixa" papel={papel}><Caixa /></Protegida>} />
          <Route path="a-receber" element={<Protegida recurso="fiado" papel={papel}><AReceber /></Protegida>} />
          <Route path="contas" element={<Protegida recurso="caixa" papel={papel}><Contas /></Protegida>} />
          <Route path="relatorios" element={<Protegida recurso="relatorios" papel={papel}><Relatorios /></Protegida>} />
          <Route path="config" element={<Protegida recurso="config" papel={papel}><Config /></Protegida>} />
          <Route path="assinatura" element={<Protegida recurso="config" papel={papel}><Assinatura /></Protegida>} />
          {/* Painel de quem administra o sistema inteiro */}
          {sessao.perfil.super_admin && <Route path="lojas" element={<Lojas />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AppProvider>
  );
};

const App: React.FC = () => (
  <AvisoProvider>
  <HashRouter>
    <Routes>
      {/* Acompanhamento público — não exige login e não expõe dados sensíveis */}
      <Route path="/rastreio" element={<Rastreio />} />
      <Route path="/rastreio/:codigo" element={<Rastreio />} />
      <Route path="/*" element={<AreaProtegida />} />
    </Routes>
  </HashRouter>
  </AvisoProvider>
);

export default App;
