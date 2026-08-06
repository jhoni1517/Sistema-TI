import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
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
  RefreshCw,
  CloudOff,
  AlertTriangle,
  ListChecks,
} from "lucide-react";
import { useApp } from "../store/AppStore";
import { MarcaDaLoja } from "./MarcaDaLoja";
import { pode, NOME_PAPEL, type Sessao } from "../lib/auth";
import { temModulo, vocabulario, RAMO_META, type Modulo } from "../lib/ramos";

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
  // Sem `modulo`: rotina do dia serve a qualquer loja, e o próprio
  // ramos.ts diz que módulo que todo mundo usa não precisa de interruptor.
  { to: "/checklist", label: "Checklist diário", icon: ListChecks, recurso: "*" },
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
  const { config, online, erroCarga, loading, reload, pendentes, sincronizar, ramo, ramoAparelho, trocarRamoAparelho } = useApp();
  const local = useLocation();
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
          <MarcaDaLoja logoUrl={config.logoUrl} tamanho={36} />
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
            .filter((item) => !item.modulo || temModulo(ramo, item.modulo))
            .map((item) =>
              // "Ordens de Serviço" numa pizzaria seria ridículo; o nome do
              // documento central vem do ramo.
              item.modulo === "os"
                ? { ...item, label: vocabulario(ramo).ordemPlural }
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
          {/* Buscar dado novo sem recarregar a página. Antes só acontecia ao
              trocar de aba, e quem fica com a tela aberta no balcão não via
              o que outro aparelho lançou. */}
          <button
            onClick={() => reload()}
            disabled={loading}
            className="mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-40"
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
            {loading ? "Atualizando..." : "Atualizar dados"}
          </button>
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
            aria-label="Abrir menu"
            className="alvo-toque -ml-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
          >
            <Menu size={22} />
          </button>
          {/* A loja no topo do celular também: é a tela que fica aberta o
              dia inteiro no balcão. */}
          <MarcaDaLoja logoUrl={config.logoUrl} tamanho={30} />
          <span className="flex-1 truncate font-bold text-slate-800">{config.nomeLoja}</span>
          <button
            onClick={() => reload()}
            className="alvo-toque rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-40"
            title="Atualizar dados"
            aria-label="Atualizar dados"
            disabled={loading}
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => setBusca(true)}
            className="alvo-toque -mr-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
            title="Buscar"
            aria-label="Buscar"
          >
            <Search size={20} />
          </button>
        </header>

        {/* Visão local ligada: precisa ficar evidente, senão a pessoa acha
            que o sistema mudou sozinho e vai procurar o que não existe. */}
        {ramoAparelho && (
          <div className="mx-4 mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 sm:mx-6 lg:mx-8 no-print">
            <span className="flex-1 text-sm text-blue-800">
              Você está vendo o sistema como <b>{RAMO_META[ramoAparelho].label}</b>.
              É só neste aparelho — a configuração da sua loja não mudou.
            </span>
            <button
              className="btn-secondary !py-1.5 text-xs"
              onClick={() => trocarRamoAparelho(null)}
            >
              Voltar ao normal
            </button>
          </div>
        )}

        {/* Carga incompleta precisa aparecer, e ficar aparecendo. Tela zerada
            sem aviso é indistinguível de sistema que apagou os dados — e o
            susto é o mesmo. */}
        {erroCarga && (
          <div className="mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 p-3 sm:mx-6 lg:mx-8 no-print">
            <p className="flex items-center gap-2 text-sm font-bold text-red-800">
              <AlertTriangle size={16} /> Parte dos dados não carregou
            </p>
            <p className="mt-1 whitespace-pre-line text-sm text-red-700">{erroCarga}</p>
            <p className="mt-1 text-xs text-red-600">
              O que está no banco continua lá. A tela é que está incompleta.
            </p>
            <button className="btn-secondary mt-2 !py-1.5 text-xs" onClick={() => reload()}>
              <RefreshCw size={14} /> Tentar de novo
            </button>
          </div>
        )}

        {/* Venda que não gravou por falta de internet PRECISA estar à vista.
            O cliente já levou a mercadoria e o troco já saiu da gaveta: o
            operador tem que saber que aquilo ainda não existe no banco. */}
        {pendentes > 0 && (
          <div className="mx-4 mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 sm:mx-6 lg:mx-8 no-print">
            <p className="flex items-center gap-2 text-sm font-bold text-amber-800">
              <CloudOff size={16} /> {pendentes} registro(s) esperando internet
            </p>
            <p className="mt-1 text-sm text-amber-700">
              Foram salvos neste aparelho e vão para a nuvem sozinhos quando a conexão
              voltar. Não feche o navegador nem limpe os dados do site até o aviso sumir.
            </p>
            <button className="btn-secondary mt-2 !py-1.5 text-xs" onClick={() => sincronizar()}>
              <RefreshCw size={14} /> Tentar enviar agora
            </button>
          </div>
        )}

        {/* A chave é a rota: sem ela o React reaproveita o nó e a animação
            não roda de novo, então só a primeira troca de tela teria
            transição. */}
        <main
          key={local.pathname}
          /* A folga de baixo respeita a barra do sistema: sem ela, o último
             botão da lista fica embaixo da barrinha do iPhone. */
          className="entra-pagina flex-1 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>

      <BuscaGlobal aberto={busca} onClose={() => setBusca(false)} />
    </div>
  );
};
