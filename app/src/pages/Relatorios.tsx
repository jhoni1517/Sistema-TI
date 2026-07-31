import React, { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { TrendingUp, DollarSign, Percent, Wrench, Users, Package } from "lucide-react";
import { useApp } from "../store/AppStore";
import { SectionTitle } from "../components/ui";
import {
  giroDosProdutos,
  curvaABC,
  produtosParados,
  capitalParado,
} from "../lib/giro";
import { brl, monthKey } from "../lib/format";
import { receitaBruta, despesasOperacionais, comprasEstoque, custoProdutos, lucroLiquido, totalOS } from "../lib/calc";
import { accentHex, isDark } from "../lib/themes";
import { OS_STATUS_META, type OSStatus } from "../lib/types";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export const Relatorios: React.FC = () => {
  const { movimentos, ordens, produtos, vendas, config } = useApp();
  const [meses, setMeses] = useState(6);

  const acc = accentHex(config.corDestaque);
  const dark = isDark(config.tema || "claro");
  const gridColor = dark ? "#26314a" : "#e2e8f0";
  const tickColor = dark ? "#94a3b8" : "#475569";
  const CORES = [acc, "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899", "#64748b"];

  // Comissão por técnico (baseada nas OS entregues)
  const porTecnico = useMemo(() => {
    const pct = (config.comissaoPadrao || 0) / 100;
    const map: Record<string, { qtd: number; total: number }> = {};
    ordens
      .filter((o) => o.status === "entregue")
      .forEach((o) => {
        const nome = (o.tecnico || "").trim() || "Sem técnico";
        if (!map[nome]) map[nome] = { qtd: 0, total: 0 };
        map[nome].qtd += 1;
        map[nome].total += totalOS(o);
      });
    return Object.entries(map)
      .map(([nome, v]) => ({ nome, qtd: v.qtd, total: v.total, comissao: v.total * pct }))
      .sort((a, b) => b.total - a.total);
  }, [ordens, config.comissaoPadrao]);

  // Série mensal
  const serie = useMemo(() => {
    const chaves: string[] = [];
    const hoje = new Date();
    for (let i = meses - 1; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      chaves.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return chaves.map((chave) => {
      const movs = movimentos.filter((m) => monthKey(m.data) === chave);
      const receita = receitaBruta(movs);
      const custo = custoProdutos(movs);
      // Só despesas do mês: reposição de estoque entra no resultado quando
      // a peça é vendida, não quando é comprada.
      const despesa = despesasOperacionais(movs);
      const [ano, mes] = chave.split("-");
      return {
        mes: `${MESES[+mes - 1]}/${ano.slice(2)}`,
        receita,
        lucroBruto: receita - custo,
        lucroLiquido: receita - custo - despesa,
        despesa,
      };
    });
  }, [movimentos, meses]);

  const totais = useMemo(() => {
    const receita = receitaBruta(movimentos);
    const custo = custoProdutos(movimentos);
    const despesa = despesasOperacionais(movimentos);
    const estoque = comprasEstoque(movimentos);
    const bruto = receita - custo;
    const liquido = lucroLiquido(movimentos);
    const margem = receita > 0 ? (liquido / receita) * 100 : 0;
    return { receita, custo, despesa, estoque, bruto, liquido, margem };
  }, [movimentos]);

  const porStatus = useMemo(() => {
    const map: Record<string, number> = {};
    ordens.forEach((o) => {
      const label = OS_STATUS_META[o.status as OSStatus].label;
      map[label] = (map[label] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [ordens]);

  const porForma = useMemo(() => {
    const map: Record<string, number> = {};
    movimentos.filter((m) => m.tipo === "entrada").forEach((m) => {
      map[m.formaPagamento] = (map[m.formaPagamento] || 0) + m.valor;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [movimentos]);

  const giro = useMemo(() => giroDosProdutos(produtos, vendas), [produtos, vendas]);
  const abc = useMemo(() => curvaABC(giro), [giro]);
  const parados = useMemo(() => produtosParados(giro, produtos), [giro, produtos]);

  return (
    <div>
      <SectionTitle
        title="Relatórios"
        subtitle="Evolução financeira e desempenho"
        action={
          <select className="input !w-auto" value={meses} onChange={(e) => setMeses(+e.target.value)}>
            <option value={3}>Últimos 3 meses</option>
            <option value={6}>Últimos 6 meses</option>
            <option value={12}>Últimos 12 meses</option>
          </select>
        }
      />

      {/* Curva ABC e o que está parado.
          A tela respondia "quanto entrou". Não respondia a pergunta que
          decide o dinheiro do mês: o que eu paro de comprar? */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h3 className="mb-1 flex items-center gap-2 font-bold text-slate-700">
            <TrendingUp size={17} /> O que carrega o faturamento
          </h3>
          <p className="mb-3 text-xs text-slate-500">
            Classe A são os itens que somam 80% do que a loja vende. Faltar um deles é
            perder venda; faltar um C não muda o mês.
          </p>
          {abc.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">
              Sem vendas registradas ainda.
            </p>
          ) : (
            <div className="space-y-1">
              {abc.slice(0, 10).map((i) => (
                <div key={i.produtoId} className="flex items-center gap-2 text-sm">
                  <span
                    className={`badge shrink-0 ${
                      i.classe === "A"
                        ? "bg-emerald-100 text-emerald-700"
                        : i.classe === "B"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {i.classe}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-slate-700">{i.nome}</span>
                  <span className="shrink-0 text-xs text-slate-400">
                    {(i.fatia * 100).toFixed(0)}%
                  </span>
                  <span className="w-20 shrink-0 text-right font-semibold text-slate-800">
                    {brl(i.receita)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="mb-1 flex items-center gap-2 font-bold text-slate-700">
            <Package size={17} /> Dinheiro parado na prateleira
          </h3>
          <p className="mb-3 text-xs text-slate-500">
            Com estoque e sem sair há mais de 60 dias, a custo. É onde a promoção com
            prazo entra antes de o produto vencer ou virar prejuízo puro.
          </p>
          {parados.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">
              Nada parado há mais de 60 dias.
            </p>
          ) : (
            <>
              <p className="mb-2 text-sm">
                <b className="text-lg text-red-600">{brl(capitalParado(parados))}</b>{" "}
                <span className="text-slate-500">em {parados.length} item(ns)</span>
              </p>
              <div className="space-y-1">
                {parados.slice(0, 10).map((g) => (
                  <div key={g.produtoId} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-slate-700">{g.nome}</span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {g.ultimaVenda ? `${g.diasParado} dias` : "nunca vendeu"}
                    </span>
                    <span className="w-20 shrink-0 text-right font-semibold text-slate-800">
                      {brl(g.valorEmEstoque)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KPI label="Receita bruta" value={brl(totais.receita)} icon={<DollarSign size={18} />} accent="text-slate-800" />
        <KPI label="Lucro bruto" value={brl(totais.bruto)} icon={<TrendingUp size={18} />} accent="text-blue-600" sub={`Custo peças: ${brl(totais.custo)}`} />
        <KPI label="Lucro líquido" value={brl(totais.liquido)} icon={<TrendingUp size={18} />} accent="text-emerald-600" sub={`Despesas do mês: ${brl(totais.despesa)}`} />
        <KPI label="Margem líquida" value={`${totais.margem.toFixed(1)}%`} icon={<Percent size={18} />} accent="text-purple-600" />
      </div>

      {/* Compra de estoque fica separada do resultado, e isso precisa estar
          explícito — senão o dono acha que sumiu dinheiro do relatório. */}
      {totais.estoque > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
          <Package size={16} className="shrink-0 text-slate-400" />
          <span>
            <b>{brl(totais.estoque)}</b> foram investidos em reposição de estoque
            no período. Esse valor saiu do caixa, mas não conta como despesa
            aqui: o custo da peça entra no resultado quando ela é vendida.
          </span>
        </div>
      )}

      {/* Evolução de faturamento */}
      <div className="card mb-5">
        <h3 className="mb-4 font-bold text-slate-700">Evolução do faturamento e lucro</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={serie}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis dataKey="mes" tick={{ fontSize: 12, fill: tickColor }} />
            <YAxis tick={{ fontSize: 12, fill: tickColor }} tickFormatter={(v) => `R$${v}`} width={70} />
            <Tooltip formatter={(v) => brl(Number(v))} />
            <Legend />
            <Line type="monotone" dataKey="receita" name="Receita" stroke={acc} strokeWidth={2.5} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="lucroBruto" name="Lucro bruto" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="lucroLiquido" name="Lucro líquido" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Barras receita x despesa */}
        <div className="card">
          <h3 className="mb-4 font-bold text-slate-700">Receita x Despesas por mês</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={serie}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey="mes" tick={{ fontSize: 12, fill: tickColor }} />
              <YAxis tick={{ fontSize: 12, fill: tickColor }} width={60} />
              <Tooltip formatter={(v) => brl(Number(v))} />
              <Legend />
              <Bar dataKey="receita" name="Receita" fill={acc} radius={[4, 4, 0, 0]} />
              <Bar dataKey="despesa" name="Despesas" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* OS por status */}
        <div className="card">
          <h3 className="mb-4 flex items-center gap-2 font-bold text-slate-700"><Wrench size={16} /> Ordens por status</h3>
          {porStatus.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400">Sem ordens de serviço ainda.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={porStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                  {porStatus.map((_, i) => (
                    <Cell key={i} fill={CORES[i % CORES.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Formas de pagamento */}
        <div className="card lg:col-span-2">
          <h3 className="mb-4 font-bold text-slate-700">Recebimentos por forma de pagamento</h3>
          {porForma.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">Sem recebimentos registrados.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={porForma} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis type="number" tick={{ fontSize: 12, fill: tickColor }} tickFormatter={(v) => `R$${v}`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: tickColor }} width={90} className="capitalize" />
                <Tooltip formatter={(v) => brl(Number(v))} />
                <Bar dataKey="value" name="Total" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Comissão por técnico */}
        <div className="card lg:col-span-2">
          <h3 className="mb-1 flex items-center gap-2 font-bold text-slate-700"><Users size={16} /> Comissão por técnico</h3>
          <p className="mb-4 text-xs text-slate-400">Baseado nas OS entregues · comissão de {config.comissaoPadrao || 0}% (ajuste em Configurações)</p>
          {porTecnico.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Nenhuma OS entregue ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Técnico</th>
                    <th className="px-3 py-2 text-center">OS entregues</th>
                    <th className="px-3 py-2 text-right">Total produzido</th>
                    <th className="px-3 py-2 text-right">Comissão</th>
                  </tr>
                </thead>
                <tbody>
                  {porTecnico.map((t) => (
                    <tr key={t.nome} className="border-b border-slate-100">
                      <td className="px-3 py-2 font-semibold text-slate-800">{t.nome}</td>
                      <td className="px-3 py-2 text-center text-slate-600">{t.qtd}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{brl(t.total)}</td>
                      <td className="px-3 py-2 text-right font-bold text-emerald-600">{brl(t.comissao)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const KPI: React.FC<{ label: string; value: string; icon: React.ReactNode; accent: string; sub?: string }> = ({ label, value, icon, accent, sub }) => (
  <div className="card">
    <div className="flex items-center justify-between">
      <p className="text-sm text-slate-500">{label}</p>
      <span className="text-slate-300">{icon}</span>
    </div>
    <p className={`mt-1 text-2xl font-bold ${accent}`}>{value}</p>
    {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
  </div>
);
