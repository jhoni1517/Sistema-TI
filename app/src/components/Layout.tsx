import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { BuscaGlobal } from "./BuscaGlobal";
import { AvisoAssinatura } from "./AvisoAssinatura";
import {
  LayoutDashboard,
  Wrench,
  Users,
  Package,
  Wallet,
  HandCoins,
  BarChart3,
  Settings,
  Menu,
  LogOut,
  Cloud,
  HardDrive,
  Search,
  CreditCard,
  Building2,
  Receipt,
} from "lucide-react";
import { useApp } from "../store/AppStore";
import { pode, NOME_PAPEL, type Sessao } from "../lib/auth";

const nav = [
  { to: "/", label: "Painel", icon: LayoutDashboard, end: true, recurso: "*" },
  { to: "/ordens", label: "Ordens de Serviço", icon: Wrench, recurso: "os" },
  { to: "/clientes", label: "Clientes", icon: Users, recurso: "clientes" },
  { to: "/estoque", label: "Estoque", icon: Package, recurso: "estoque" },
  { to: "/caixa", label: "Caixa", icon: Wallet, recurso: "caixa" },
  { to: "/a-receber", label: "A Receber (Fiado)", icon: HandCoins, recurso: "fiado" },
  { to: "/contas", label: "Contas a Pagar", icon: Receipt, recurso: "caixa" },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3, recurso: "relatorios" },
  { to: "/assinatura", label: "Assinatura", icon: CreditCard, recurso: "config" },
  { to: "/config", label: "Configurações", icon: Settings, recurso: "config" },
];

export const Layout: React.FC<{ onLogout: () => void; sessao?: Sessao }> = ({
  onLogout,
  sessao,
}) => {
  const { config, online } = useApp();
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState(false);
  const navigate = useNavigate();

  // Atalho Ctrl+K / Cmd+K abre a busca global
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setBusca(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* Overlay mobile */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform bg-slate-900 text-slate-300 transition-transform lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center gap-2 border-b border-slate-800 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 font-bold text-white">
            TI
          </div>
          <div className="truncate">
            <p className="truncate text-sm font-bold text-white">
              {config.nomeLoja}
            </p>
            <p className="flex items-center gap-1 text-[11px] text-slate-400">
              {online ? (
                <>
                  <Cloud size={11} /> Nuvem
                </>
              ) : (
                <>
                  <HardDrive size={11} /> Local
                </>
              )}
            </p>
          </div>
        </div>

        <div className="px-3 pt-3">
          <button
            onClick={() => setBusca(true)}
            className="flex w-full items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-400 hover:bg-slate-700 hover:text-slate-200"
          >
            <Search size={16} />
            <span className="flex-1 text-left">Buscar...</span>
            <span className="hidden rounded border border-slate-600 px-1.5 py-0.5 text-[10px] lg:inline">
              Ctrl K
            </span>
          </button>
        </div>

        <nav className="space-y-1 p-3">
          {nav
            .filter((item) => item.recurso === "*" || pode(sessao?.perfil?.papel, item.recurso))
            .concat(
              // Só quem administra o sistema enxerga o painel de lojas
              sessao?.perfil?.super_admin
                ? [{ to: "/lojas", label: "Lojas assinantes", icon: Building2, recurso: "*" }]
                : []
            )
            .map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-600 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="absolute bottom-0 w-full border-t border-slate-800 p-3">
          {sessao && (
            <div className="mb-2 px-3">
              <p className="truncate text-xs font-semibold text-slate-300">
                {sessao.perfil?.nome || sessao.email}
              </p>
              <p className="text-[11px] text-slate-500">
                {sessao.perfil ? NOME_PAPEL[sessao.perfil.papel] : "sem perfil"}
              </p>
            </div>
          )}
          <button
            onClick={() => {
              onLogout();
              navigate("/");
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <LogOut size={18} />
            Sair
          </button>
        </div>
      </aside>

      {/* Conteúdo */}
      <div className="flex min-w-0 flex-1 flex-col">
        <AvisoAssinatura />
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur lg:hidden no-print">
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          >
            <Menu size={22} />
          </button>
          <span className="flex-1 truncate font-bold text-slate-800">{config.nomeLoja}</span>
          <button
            onClick={() => setBusca(true)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
            title="Buscar"
          >
            <Search size={20} />
          </button>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>

      <BuscaGlobal aberto={busca} onClose={() => setBusca(false)} />
    </div>
  );
};
