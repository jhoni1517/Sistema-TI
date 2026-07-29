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
  CalendarDays,
  ShoppingCart,
} from "lucide-react";
import { useApp } from "../store/AppStore";
import { pode, NOME_PAPEL, type Sessao } from "../lib/auth";
import { temModulo, vocabulario, type Modulo } from "../lib/ramos";

/**
 * Menu. "modulo" liga o item ao ramo da loja: item sem modulo aparece para
 * todo mundo. É aqui que uma pizzaria deixa de ver "Ordens de Serviço".
 */
const nav: Array<{
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  recurso: string;
  modulo?: Modulo;
}> = [
  { to: "/", label: "Painel", icon: LayoutDashboard, end: true, recurso: "*" },
  { to: "/ordens", label: "Ordens de Serviço", icon: Wrench, recurso: "os", modulo: "os" },
  { to: "/pdv", label: "Frente de caixa", icon: ShoppingCart, recurso: "caixa", modulo: "pdv" },
  { to: "/agenda", label: "Agenda", icon: CalendarDays, recurso: "*" },
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

  /**
   * Com o menu aberto no celular, a página de trás não pode rolar.
   *
   * Sem isto acontece a "rolagem em cadeia": o dedo rola a lista da esquerda,
   * ela acaba, e o navegador continua rolando o conteúdo de trás. Você fecha
   * o menu e a tela está em outro lugar, sem ter pedido nada.
   *
   * Trava por posição fixa em vez de overflow:hidden porque o Safari do
   * iPhone ignora o segundo. Guardar e devolver o scrollY evita o pulo para
   * o topo ao fechar.
   */
  useEffect(() => {
    if (!open) return;
    const y = window.scrollY;
    const corpo = document.body.style;
    const anterior = { position: corpo.position, top: corpo.top, width: corpo.width };
    corpo.position = "fixed";
    corpo.top = `-${y}px`;
    corpo.width = "100%";
    return () => {
      corpo.position = anterior.position;
      corpo.top = anterior.top;
      corpo.width = anterior.width;
      window.scrollTo(0, y);
    };
  }, [open]);

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
        // overscroll-contain corta a rolagem em cadeia: chegando ao fim da
        // lista, o gesto morre aqui em vez de arrastar a página de trás.
        className={`fixed inset-y-0 left-0 z-40 flex w-64 transform flex-col overflow-y-auto overscroll-contain bg-slate-900 text-slate-300 transition-transform lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 shrink-0 items-center gap-2 border-b border-slate-800 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-600">
            <Wrench size={18} className="text-stone-900" strokeWidth={2.5} />
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

        <div className="shrink-0 px-3 pt-3">
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

        <nav className="flex-1 space-y-1 p-3">
          {nav
            .filter((item) => item.recurso === "*" || pode(sessao?.perfil?.papel, item.recurso))
            // Módulo que não é do ramo desta loja nem aparece no menu
            .filter((item) => !item.modulo || temModulo(config.ramo, item.modulo))
            .map((item) =>
              // "Ordens de Serviço" numa pizzaria seria ridículo; o nome do
              // documento central vem do ramo.
              item.modulo === "os"
                ? { ...item, label: vocabulario(config.ramo).ordemPlural }
                : item
            )
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

        {/* mt-auto em vez de absolute bottom-0: numa tela baixa o bloco
            absoluto cobria os últimos itens do menu, e eles ficavam
            inalcançáveis porque a lista também não rolava. */}
        <div className="mt-auto shrink-0 border-t border-slate-800 p-3">
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
