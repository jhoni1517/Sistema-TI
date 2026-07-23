import React, { useState } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import { AppProvider, useApp } from "./store/AppStore";
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

const AreaProtegida: React.FC = () => {
  const { loading } = useApp();
  const [logado, setLogado] = useState(
    () => sessionStorage.getItem("sistema-ti:auth") === "1"
  );

  const login = () => {
    sessionStorage.setItem("sistema-ti:auth", "1");
    setLogado(true);
  };
  const logout = () => {
    sessionStorage.removeItem("sistema-ti:auth");
    setLogado(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
      </div>
    );
  }

  if (!logado) return <Login onLogin={login} />;

  return (
    <Routes>
      <Route element={<Layout onLogout={logout} />}>
        <Route index element={<Dashboard />} />
        <Route path="ordens" element={<OrdensServico />} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="estoque" element={<Estoque />} />
        <Route path="caixa" element={<Caixa />} />
        <Route path="a-receber" element={<AReceber />} />
        <Route path="relatorios" element={<Relatorios />} />
        <Route path="config" element={<Config />} />
      </Route>
    </Routes>
  );
};

const App: React.FC = () => (
  <AppProvider>
    <HashRouter>
      <Routes>
        {/* Página pública de acompanhamento (sem login) */}
        <Route path="/rastreio" element={<Rastreio />} />
        <Route path="/rastreio/:codigo" element={<Rastreio />} />
        {/* Todo o restante é área protegida */}
        <Route path="/*" element={<AreaProtegida />} />
      </Routes>
    </HashRouter>
  </AppProvider>
);

export default App;
