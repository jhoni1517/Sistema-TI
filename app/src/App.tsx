import React, { useCallback, useEffect, useState } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider } from "./store/AppStore";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { OrdensServico } from "./pages/OrdensServico";
import { Clientes } from "./pages/Clientes";
import { Estoque } from "./pages/Estoque";
import { Caixa } from "./pages/Caixa";
import { AReceber } from "./pages/AReceber";
import { Relatorios } from "./pages/Relatorios";
import { Config } from "./pages/Config";
import { Rastreio } from "./pages/Rastreio";
import { SemPerfil } from "./pages/SemPerfil";
import { carregarSessao, sair, pode, type Sessao } from "./lib/auth";
import { definirLoja } from "./lib/db";
import { supabase, supabaseEnabled } from "./lib/supabase";

const Carregando: React.FC = () => (
  <div className="flex min-h-screen items-center justify-center bg-slate-100">
    <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
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
    setSessao(s);
    definirLoja(s?.perfil?.loja_id ?? null);
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
    setSessao(null);
  };

  if (verificando) return <Carregando />;
  if (!sessao) return <Login onEntrou={revalidar} />;
  // Conta criada, mas ainda sem vínculo com uma loja
  if (!sessao.perfil) return <SemPerfil email={sessao.email} onSair={logout} />;

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
          <Route path="relatorios" element={<Protegida recurso="relatorios" papel={papel}><Relatorios /></Protegida>} />
          <Route path="config" element={<Protegida recurso="config" papel={papel}><Config /></Protegida>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AppProvider>
  );
};

const App: React.FC = () => (
  <HashRouter>
    <Routes>
      {/* Acompanhamento público — não exige login e não expõe dados sensíveis */}
      <Route path="/rastreio" element={<Rastreio />} />
      <Route path="/rastreio/:codigo" element={<Rastreio />} />
      <Route path="/*" element={<AreaProtegida />} />
    </Routes>
  </HashRouter>
);

export default App;
