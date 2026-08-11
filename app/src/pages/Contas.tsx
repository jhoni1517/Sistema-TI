import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  Receipt,
  AlertTriangle,
  Repeat,
  Bell,
  BellOff,
  Target,
  TrendingDown,
  CalendarClock,
  Power,
  CreditCard,
  Search,
} from "lucide-react";
import { aviso } from "../components/Aviso";
import { Modal, Field, SectionTitle, EmptyState, InputNumero } from "../components/ui";
import { useApp } from "../store/AppStore";
import { uid, nowISO, brl, formatDate, txt } from "../lib/format";
import { accentHex, isDark } from "../lib/themes";
import {
  situacaoConta,
  SITUACAO_CONTA_META,
  diasAteVencer,
  pagarConta,
  ehReceber,
  contasParaAvisar,
  totalAPagarNoMes,
  totalAtrasado,
  custoFixoMensal,
  gastosPorCategoria,
  progressoMeta,
  hojeISO,
  soData,
  CORES_META,
  filtrarContas,
  ORDEM_CONTAS_META,
  type OrdemContas,
} from "../lib/contas";
import { gastoNoCartao, porCategoria } from "../lib/cartao";
import {
  notificar,
  pedirPermissao,
  permissaoAtual,
  type PermissaoAviso,
} from "../lib/notificacoes";
import {
  CATEGORIAS_CONTA,
  META_META,
  RECORRENCIA_META,
  type ContaPagar,
  type FormaPagamento,
  type Meta,
  type Recorrencia,
  type TipoMeta,
  TIPO_CONTA_META,
  type TipoConta,
} from "../lib/types";

const novaConta = (): ContaPagar => ({
  id: uid(),
  descricao: "",
  categoria: "Outro",
  valor: 0,
  vencimento: hojeISO(),
  recorrencia: "mensal",
  // Explícito, mesmo sendo o padrão: conta nova nascendo sem o campo faria a
  // tela ler "pagar" por omissão, e omissão não é escolha.
  tipo: "pagar",
  lembreteDias: 3,
  ativo: true,
  pagamentos: [],
  criadoEm: nowISO(),
});

const novaMeta = (): Meta => ({
  id: uid(),
  titulo: "",
  tipo: "faturamento",
  alvo: 0,
  periodo: "mensal",
  ativo: true,
  criadoEm: nowISO(),
});

export const Contas: React.FC = () => {
  const {
    contas,
    metas,
    movimentos,
    ordens,
    fornecedores,
    sessoes,
    config,
    saveConta,
    removeConta,
    saveMeta,
    removeMeta,
    saveMovimento,
  } = useApp();

  const [editando, setEditando] = useState<ContaPagar | null>(null);
  const [pagando, setPagando] = useState<ContaPagar | null>(null);
  /** Gravação em andamento: o segundo clique pagaria a conta duas vezes */
  const [pagandoAgora, setPagandoAgora] = useState(false);
  const [formaPg, setFormaPg] = useState<FormaPagamento>("pix");
  const [valorPg, setValorPg] = useState(0);
  const [editMeta, setEditMeta] = useState<Meta | null>(null);
  const [permissao, setPermissao] = useState<PermissaoAviso>("pendente");
  const [mesGasto, setMesGasto] = useState(soData(hojeISO()).slice(0, 7));

  const acc = accentHex(config.corDestaque);
  const dark = isDark(config.tema || "claro");
  const gridColor = dark ? "#26314a" : "#e2e8f0";
  const tickColor = dark ? "#94a3b8" : "#475569";
  const CORES = [acc, "#ef4444", "#f59e0b", "#8b5cf6", "#10b981", "#06b6d4", "#ec4899", "#64748b"];

  useEffect(() => setPermissao(permissaoAtual()), []);

  const avisar = useMemo(() => contasParaAvisar(contas), [contas]);

  /**
   * Dispara a notificação do navegador uma vez por dia, por conta.
   * Sem a trava de "já avisado hoje", trocar de tela repetiria o aviso e a
   * pessoa desligaria a permissão no segundo dia.
   */
  useEffect(() => {
    if (permissao !== "concedida" || avisar.length === 0) return;
    const atrasadas = avisar.filter((c) => diasAteVencer(c.vencimento) < 0);
    if (atrasadas.length > 0) {
      notificar(
        `${atrasadas.length} conta(s) em atraso`,
        atrasadas.map((c) => `${c.descricao} — ${brl(c.valor)}`).join("\n"),
        { chave: "contas-atrasadas", url: "/contas" }
      );
      return;
    }
    const hoje = avisar.filter((c) => diasAteVencer(c.vencimento) === 0);
    if (hoje.length > 0) {
      notificar(
        `${hoje.length} conta(s) vencem hoje`,
        hoje.map((c) => `${c.descricao} — ${brl(c.valor)}`).join("\n"),
        { chave: "contas-hoje", url: "/contas" }
      );
      return;
    }
    notificar(
      "Contas chegando",
      avisar
        .slice(0, 4)
        .map((c) => `${c.descricao} em ${diasAteVencer(c.vencimento)}d — ${brl(c.valor)}`)
        .join("\n"),
      { chave: "contas-proximas", url: "/contas" }
    );
  }, [avisar, permissao]);

  const resumo = useMemo(
    () => ({
      mes: totalAPagarNoMes(contas),
      atrasado: totalAtrasado(contas),
      fixo: custoFixoMensal(contas),
      ativas: contas.filter((c) => c.ativo).length,
    }),
    [contas]
  );

  /**
   * Procurar e ordenar.
   *
   * A lista vinha numa ordem só, que serve para o dia a dia e não serve
   * para as duas perguntas de quando o mês aperta: "o que está atrasado há
   * mais tempo?" e "qual é a maior conta?". Com trinta contas cadastradas,
   * responder isso era rolar a tela comparando de cabeça. A regra mora em
   * lib/contas.ts, com teste.
   */
  const [buscaConta, setBuscaConta] = useState("");
  const [ordem, setOrdem] = useState<OrdemContas>("vencimento");

  const lista = useMemo(
    () => filtrarContas(contas, { termo: buscaConta, ordem }),
    [contas, buscaConta, ordem]
  );

  const gastos = useMemo(() => gastosPorCategoria(movimentos, mesGasto), [movimentos, mesGasto]);

  /**
   * O que vai vir na fatura do cartão neste mês.
   *
   * A pergunta que decide o mês é "quanto vem no cartão?", e sem juntar
   * isso em algum lugar ela só é respondida quando a fatura chega. Ver
   * lib/cartao.ts, inclusive para a armadilha da contagem dupla.
   */
  const cartao = useMemo(
    () => gastoNoCartao(movimentos, { de: `${mesGasto}-01`, ate: `${mesGasto}-31` }),
    [movimentos, mesGasto]
  );
  const cartaoPorCategoria = useMemo(() => porCategoria(cartao), [cartao]);

  const mesesDisponiveis = useMemo(() => {
    const set = new Set<string>();
    for (const m of movimentos) if (m.tipo === "saida") set.add(soData(m.data).slice(0, 7));
    set.add(soData(hojeISO()).slice(0, 7));
    return [...set].sort().reverse().slice(0, 12);
  }, [movimentos]);

  const evolucao = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const m of movimentos) {
      if (m.tipo !== "saida") continue;
      const k = soData(m.data).slice(0, 7);
      mapa.set(k, (mapa.get(k) || 0) + (Number(m.valor) || 0));
    }
    return [...mapa.entries()]
      .sort()
      .slice(-6)
      .map(([k, v]) => {
        const [ano, mes] = k.split("-");
        return { mes: `${mes}/${ano.slice(2)}`, gasto: v };
      });
  }, [movimentos]);

  const ligarAvisos = async () => {
    const p = await pedirPermissao();
    setPermissao(p);
    if (p === "concedida") {
      aviso.sucesso("Avisos ligados neste aparelho.");
    } else if (p === "negada") {
      aviso.alerta(
        "O navegador bloqueou os avisos. Libere nas permissões do site para receber lembretes."
      );
    } else {
      aviso.info("Este navegador não permite avisos. O lembrete continua aparecendo na tela.");
    }
  };

  const salvar = async () => {
    if (!editando) return;
    if (!editando.descricao.trim()) return aviso.alerta("Dê um nome para a conta.");
    if (!(Number(editando.valor) > 0)) return aviso.alerta("Informe o valor da conta.");
    try {
      await saveConta({ ...editando, vencimento: soData(editando.vencimento) });
      setEditando(null);
      aviso.sucesso("Conta salva.");
    } catch (e) {
      aviso.erro(
        (e instanceof Error ? e.message : String(e)) +
          "\n\nSe usa a nuvem, confira se rodou o supabase-migracao-contas.sql."
      );
    }
  };

  const abrirPagamento = (c: ContaPagar) => {
    setValorPg(Number(c.valor) || 0);
    setFormaPg("pix");
    setPagando(c);
  };

  /** Baixa a conta E lança a saída no caixa: são a mesma operação na vida real */
  const confirmarPagamento = async () => {
    if (!pagando) return;
    if (!(valorPg > 0)) return aviso.alerta("Informe o valor pago.");
    // Dois cliques = a mesma conta paga duas vezes: o dinheiro sai do caixa
    // em dobro e a recorrente pula dois meses de uma vez.
    if (pagandoAgora) return;
    setPagandoAgora(true);
    try {
      const atualizada = pagarConta(pagando, { valor: valorPg, formaPagamento: formaPg });

      /*
       * Dinheiro primeiro, sempre. Estava ao contrário: dava a conta como
       * paga e só então lançava a saída. Falhando no meio, a conta some da
       * lista — recorrente ainda pula para o mês seguinte — e a despesa
       * nunca entra. O mês fecha com lucro maior do que foi, e ninguém
       * procura por lucro inflado.
       */
      const sessaoAberta = sessoes.find((s) => !s.fechadoEm);
      /*
       * O LADO DO LANÇAMENTO VEM DO TIPO DA CONTA.
       *
       * Salário recebido lançado como saída tiraria do caixa o dinheiro que
       * acabou de entrar — e o erro dobra de tamanho, porque o valor some do
       * que entrou E aparece no que saiu. O mês fecharia com o dobro do
       * salário de prejuízo.
       *
       * Receita fixa nunca é compra de estoque nem fatura de cartão: as duas
       * marcas existem para tirar uma SAÍDA do resultado, e não há o que
       * tirar de uma entrada.
       */
      const recebendo = ehReceber(pagando);
      await saveMovimento({
        id: uid(),
        tipo: recebendo ? "entrada" : "saida",
        categoria: pagando.categoria || (recebendo ? "Receita fixa" : "Despesa"),
        descricao: `${pagando.descricao} (venc. ${formatDate(pagando.vencimento)})`,
        valor: valorPg,
        formaPagamento: formaPg,
        sessaoId: sessaoAberta?.id,
        compraEstoque: !recebendo && pagando.compraEstoque === true,
        // Sem levar a marca junto, o lançamento no caixa vira despesa nova
        // e o mês conta o cartão duas vezes.
        faturaCartao: !recebendo && pagando.faturaCartao === true,
        data: nowISO(),
      });

      await saveConta(atualizada);

      setPagando(null);
      aviso.sucesso(
        pagando.recorrencia === "unica"
          ? `${recebendo ? "Recebimento" : "Conta"} quitado e lançado no caixa.`
          : `${recebendo ? "Recebido" : "Pago"} e lançado no caixa. Próximo: ${formatDate(atualizada.vencimento)}.`
      );
    } catch (e) {
      aviso.erro(e instanceof Error ? e.message : String(e));
    } finally {
      setPagandoAgora(false);
    }
  };

  const alternarAtivo = async (c: ContaPagar) => {
    try {
      await saveConta({ ...c, ativo: !c.ativo });
    } catch (e) {
      // Conta que continua ativa na calada segue cobrando alerta todo dia.
      aviso.erro(
        "Não foi possível mudar a conta:\n\n" + (e instanceof Error ? e.message : String(e))
      );
    }
  };

  const apagar = async (c: ContaPagar) => {
    if (!confirm(`Excluir a conta "${c.descricao}"? O histórico de pagamentos vai junto.`)) return;
    try {
      await removeConta(c.id);
    } catch (e) {
      aviso.erro(
        "Não foi possível excluir a conta:\n\n" + (e instanceof Error ? e.message : String(e))
      );
    }
  };

  const salvarMeta = async () => {
    if (!editMeta) return;
    if (!editMeta.titulo.trim()) return aviso.alerta("Dê um nome ao objetivo.");
    if (!(Number(editMeta.alvo) > 0)) return aviso.alerta("Informe o valor do objetivo.");
    try {
      await saveMeta(editMeta);
      setEditMeta(null);
      aviso.sucesso("Objetivo salvo.");
    } catch (e) {
      aviso.erro(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div>
      <SectionTitle
        title="Contas a Pagar"
        subtitle="Contas fixas, lembretes, gastos e objetivos"
        action={
          <div className="flex flex-wrap gap-2">
            {permissao !== "concedida" && (
              <button className="btn-secondary" onClick={ligarAvisos}>
                <Bell size={18} /> Ligar avisos
              </button>
            )}
            {permissao === "concedida" && (
              <span className="badge bg-emerald-100 text-emerald-700">
                <Bell size={12} /> Avisos ligados
              </span>
            )}
            <button className="btn-primary" onClick={() => setEditando(novaConta())}>
              <Plus size={18} /> Nova conta
            </button>
          </div>
        }
      />

      {/* Lembretes do dia */}
      {avisar.length > 0 && (
        <div className="animar-entrada mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="mb-2 flex items-center gap-2 font-bold text-amber-800">
            <AlertTriangle size={18} /> Precisa de atenção
          </p>
          <div className="space-y-1.5">
            {avisar.map((c) => {
              const d = diasAteVencer(c.vencimento);
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold text-amber-900">{txt(c.descricao)}</span>
                  <span className="text-amber-700">
                    {d < 0
                      ? `${Math.abs(d)} dia${Math.abs(d) === 1 ? "" : "s"} em atraso`
                      : d === 0
                        ? "vence hoje"
                        : `vence em ${d} dia${d === 1 ? "" : "s"}`}
                  </span>
                  <span className="font-bold text-amber-900">{brl(c.valor)}</span>
                  <button
                    className="btn-success !py-1 !px-2.5 text-xs"
                    onClick={() => abrirPagamento(c)}
                  >
                    <CheckCircle2 size={13} /> Pagar
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Resumo */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao
          label="A pagar este mês"
          valor={brl(resumo.mes)}
          icone={<CalendarClock size={18} />}
        />
        <Cartao
          label="Em atraso"
          valor={brl(resumo.atrasado)}
          icone={<AlertTriangle size={18} />}
          cor={resumo.atrasado > 0 ? "text-red-600" : "text-slate-800"}
        />
        <Cartao
          label="Custo fixo mensal"
          valor={brl(resumo.fixo)}
          icone={<Repeat size={18} />}
          dica="Soma das contas recorrentes, ajustada para o mês"
        />
        <Cartao label="Contas ativas" valor={String(resumo.ativas)} icone={<Receipt size={18} />} />
      </div>

      {/* Procurar e ordenar */}
      {contas.length > 0 && (
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input w-full !pl-9"
              placeholder="Procurar por nome, categoria ou observação..."
              value={buscaConta}
              onChange={(e) => setBuscaConta(e.target.value)}
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto">
            {(Object.keys(ORDEM_CONTAS_META) as OrdemContas[]).map((o) => (
              <button
                key={o}
                onClick={() => setOrdem(o)}
                className={`chip text-sm ${
                  ordem === o
                    ? "bg-slate-800 text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                {ORDEM_CONTAS_META[o]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Lista de contas */}
      {lista.length === 0 ? (
        <EmptyState
          icon={<Receipt size={48} />}
          title={
            contas.length === 0 ? "Nenhuma conta cadastrada" : "Nada encontrado"
          }
          hint={
            contas.length === 0
              ? "Cadastre aluguel, energia, internet e o que mais sai todo mês."
              : "Tente outra palavra, ou limpe a busca para ver a lista inteira."
          }
        />
      ) : (
        <div className="mb-6 space-y-2">
          {lista.map((c) => {
            const sit = situacaoConta(c);
            const meta = SITUACAO_CONTA_META[sit];
            const d = diasAteVencer(c.vencimento);
            const fornecedor = fornecedores.find((f) => f.id === c.fornecedorId);
            return (
              <div
                key={c.id}
                className={`card flex flex-wrap items-center gap-3 ${c.ativo ? "" : "opacity-60"}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-800">{txt(c.descricao)}</span>
                    <span className={`badge ${meta.cor}`}>{meta.label}</span>
                    {c.recorrencia !== "unica" && (
                      <span className="badge bg-slate-100 text-slate-600">
                        <Repeat size={11} /> {RECORRENCIA_META[c.recorrencia].label}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {txt(c.categoria)}
                    {fornecedor ? ` · ${fornecedor.nome}` : ""} · vence{" "}
                    {formatDate(c.vencimento)}
                    {c.ativo && sit !== "paga" && (
                      <>
                        {" · "}
                        {d < 0 ? `${Math.abs(d)}d em atraso` : d === 0 ? "hoje" : `em ${d}d`}
                      </>
                    )}
                    {(c.pagamentos || []).length > 0 &&
                      ` · ${c.pagamentos.length} pagamento(s)`}
                  </p>
                </div>

                <span className="text-lg font-bold text-slate-800">{brl(c.valor)}</span>

                <div className="flex gap-1.5">
                  {c.ativo && sit !== "paga" && (
                    <button
                      className="btn-success !py-1.5 text-xs"
                      onClick={() => abrirPagamento(c)}
                    >
                      <CheckCircle2 size={14} /> Pagar
                    </button>
                  )}
                  <button
                    className="btn-ghost !p-2"
                    title={c.ativo ? "Desligar cobrança" : "Reativar"}
                    onClick={() => alternarAtivo(c)}
                  >
                    {c.ativo ? <BellOff size={15} /> : <Power size={15} />}
                  </button>
                  <button className="btn-ghost !p-2" onClick={() => setEditando(c)}>
                    <Pencil size={15} />
                  </button>
                  <button className="btn-ghost !p-2 text-red-500" onClick={() => apagar(c)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ---------- Objetivos ---------- */}
      <div className="card mb-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 font-bold text-slate-700">
            <Target size={18} /> Objetivos
          </h3>
          <button className="btn-secondary !py-1.5 text-xs" onClick={() => setEditMeta(novaMeta())}>
            <Plus size={14} /> Novo objetivo
          </button>
        </div>

        {metas.filter((m) => m.ativo).length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">
            Defina uma meta de faturamento, de lucro ou um teto de gastos para
            acompanhar o mês.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {metas
              .filter((m) => m.ativo)
              .map((m) => {
                const p = progressoMeta(m, movimentos, ordens);
                const info = META_META[m.tipo];
                const largura = Math.min(100, p.percentual);
                const cor = p.estourou
                  ? "bg-red-500"
                  : p.atingida
                    ? "bg-emerald-500"
                    : "bg-brand-500";
                return (
                  <div key={m.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-800">{txt(m.titulo)}</p>
                        <p className="text-xs text-slate-500">
                          {info.label} · {m.periodo === "mensal" ? "este mês" : "este ano"}
                        </p>
                      </div>
                      <button
                        className="btn-ghost !p-1.5 text-slate-400"
                        onClick={() => setEditMeta(m)}
                      >
                        <Pencil size={13} />
                      </button>
                    </div>

                    <div className="mb-1.5 flex items-baseline justify-between gap-2">
                      <span className="text-lg font-bold text-slate-800">
                        {info.dinheiro ? brl(p.atual) : p.atual}
                      </span>
                      <span className="text-xs text-slate-500">
                        de {info.dinheiro ? brl(p.alvo) : p.alvo}
                      </span>
                    </div>

                    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={`h-full transition-all duration-500 ${cor}`}
                        style={{ width: `${largura}%` }}
                      />
                    </div>

                    <p
                      className={`mt-1.5 text-xs font-semibold ${
                        p.estourou
                          ? "text-red-600"
                          : p.atingida
                            ? "text-emerald-600"
                            : "text-slate-500"
                      }`}
                    >
                      {p.estourou
                        ? `Estourou o teto em ${brl(p.atual - p.alvo)}`
                        : p.atingida
                          ? "Objetivo alcançado"
                          : `${p.percentual.toFixed(0)}% do caminho`}
                    </p>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* ---------- Cartão de crédito ---------- */}
      {(cartao.total > 0 || cartao.pago > 0) && (
        <div className="card mb-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="flex items-center gap-2 font-bold text-slate-700">
              <CreditCard size={18} /> Cartão de crédito
            </h3>
            <span className="text-xs text-slate-400">
              {mesGasto.split("-").reverse().join("/")}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 p-4 text-white">
              <p className="text-xs text-slate-300">Comprado no crédito neste mês</p>
              <p className="mt-1 text-3xl font-bold">{brl(cartao.total)}</p>
              <p className="mt-1 text-xs text-slate-400">
                {cartao.itens.length} lançamento(s) — é o que vem na fatura
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Fatura já paga neste mês</p>
              <p className="mt-1 text-2xl font-bold text-slate-700">{brl(cartao.pago)}</p>
              {/* A regra que evita o mês fechar com prejuízo inventado. */}
              <p className="mt-1 text-xs text-slate-500">
                Pagar a fatura não conta como despesa nova: cada compra no crédito
                já entrou no resultado no dia em que aconteceu.
              </p>
            </div>
          </div>

          {cartaoPorCategoria.length > 0 && (
            <div className="mt-3 space-y-1">
              {cartaoPorCategoria.slice(0, 6).map((c) => (
                <div key={c.categoria} className="flex items-center justify-between text-sm">
                  <span className="min-w-0 flex-1 truncate text-slate-600">{c.categoria}</span>
                  <span className="font-semibold text-slate-700">{brl(c.valor)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------- Relatório de gastos ---------- */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-bold text-slate-700">
              <TrendingDown size={18} /> Onde o dinheiro foi
            </h3>
            <select
              className="input !w-auto !py-1.5 sm:text-sm"
              value={mesGasto}
              onChange={(e) => setMesGasto(e.target.value)}
            >
              {mesesDisponiveis.map((m) => {
                const [a, mm] = m.split("-");
                return (
                  <option key={m} value={m}>
                    {mm}/{a}
                  </option>
                );
              })}
            </select>
          </div>

          {gastos.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">
              Nenhuma saída registrada neste mês.
            </p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={gastos}
                    dataKey="valor"
                    nameKey="categoria"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {gastos.map((_, i) => (
                      <Cell key={i} fill={CORES[i % CORES.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => brl(Number(v))} />
                </PieChart>
              </ResponsiveContainer>

              <div className="mt-3 space-y-1.5">
                {gastos.slice(0, 6).map((g, i) => (
                  <div key={g.categoria} className="flex items-center gap-2 text-sm">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: CORES[i % CORES.length] }}
                    />
                    <span className="min-w-0 flex-1 truncate text-slate-600">{g.categoria}</span>
                    <span className="text-xs text-slate-400">{g.fatia.toFixed(0)}%</span>
                    <span className="font-semibold text-slate-800">{brl(g.valor)}</span>
                  </div>
                ))}
              </div>

              <p className="mt-3 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600">
                Maior gasto do mês: <b>{gastos[0].categoria}</b>, com{" "}
                <b>{brl(gastos[0].valor)}</b> — {gastos[0].fatia.toFixed(0)}% de tudo
                que saiu.
              </p>
            </>
          )}
        </div>

        <div className="card">
          <h3 className="mb-4 flex items-center gap-2 font-bold text-slate-700">
            <TrendingDown size={18} /> Gastos mês a mês
          </h3>
          {evolucao.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">
              Ainda não há histórico de saídas.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={evolucao}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="mes" tick={{ fontSize: 12, fill: tickColor }} />
                <YAxis tick={{ fontSize: 12, fill: tickColor }} width={60} />
                <Tooltip formatter={(v) => brl(Number(v))} />
                <Bar dataKey="gasto" name="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ---------- Modal: nova/editar conta ---------- */}
      <Modal
        open={!!editando}
        onClose={() => setEditando(null)}
        title={editando && contas.find((c) => c.id === editando.id) ? "Editar conta" : "Nova conta"}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setEditando(null)}>
              Cancelar
            </button>
            <button className="btn-primary" onClick={salvar}>
              Salvar
            </button>
          </>
        }
      >
        {editando && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Descrição *" className="sm:col-span-2">
              <input
                className="input"
                placeholder="Ex: Aluguel da loja"
                value={editando.descricao}
                onChange={(e) => setEditando({ ...editando, descricao: e.target.value })}
              />
            </Field>

            <Field label="Categoria">
              <select
                className="input"
                value={editando.categoria}
                onChange={(e) => setEditando({ ...editando, categoria: e.target.value })}
              >
                {CATEGORIAS_CONTA.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>

            {/*
              PRIMEIRO CAMPO DE PROPÓSITO: ele muda o significado de todos os
              outros. "Valor" de uma conta a pagar é quanto sai; de uma
              receita fixa é quanto entra. Descobrir isso no fim do
              formulário faria a pessoa reler tudo.
            */}
            <Field label="Isto é dinheiro que..." className="sm:col-span-2">
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(TIPO_CONTA_META) as TipoConta[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setEditando({ ...editando, tipo: t })}
                    className={`rounded-lg border-2 px-3 py-2.5 text-sm font-semibold transition-colors ${
                      (editando.tipo || "pagar") === t
                        ? t === "receber"
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                          : "border-red-400 bg-red-50 text-red-700"
                        : "border-slate-200 text-slate-500"
                    }`}
                  >
                    {t === "receber" ? "Entra (recebo)" : "Sai (pago)"}
                  </button>
                ))}
              </div>
              {(editando.tipo || "pagar") === "receber" && (
                <p className="mt-1.5 text-xs text-slate-500">
                  Salário, aposentadoria, aluguel que você recebe, mensalidade
                  de cliente fixo. Ao marcar como recebido, entra no caixa.
                </p>
              )}
            </Field>

            <Field label={(editando.tipo || "pagar") === "receber" ? "Valor que entra (R$) *" : "Valor (R$) *"}>
              <InputNumero
                className="input"
                value={editando.valor}
                onChange={(v) => setEditando({ ...editando, valor: (v ?? 0) })}
              />
            </Field>

            <Field label={(editando.tipo || "pagar") === "receber" ? "Cai no dia" : "Vencimento"}>
              <input
                type="date"
                className="input"
                value={soData(editando.vencimento)}
                onChange={(e) => setEditando({ ...editando, vencimento: e.target.value })}
              />
            </Field>

            <Field label="Repetição">
              <select
                className="input"
                value={editando.recorrencia}
                onChange={(e) =>
                  setEditando({ ...editando, recorrencia: e.target.value as Recorrencia })
                }
              >
                {(Object.keys(RECORRENCIA_META) as Recorrencia[]).map((r) => (
                  <option key={r} value={r}>
                    {RECORRENCIA_META[r].label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Avisar quantos dias antes">
              <InputNumero
                min={0}
                max={30}
                className="input"
                value={editando.lembreteDias}
                onChange={(v) => setEditando({ ...editando, lembreteDias: (v ?? 0) })}
              />
            </Field>

            <Field label="Fornecedor (opcional)">
              <select
                className="input"
                value={editando.fornecedorId || ""}
                onChange={(e) => setEditando({ ...editando, fornecedorId: e.target.value })}
              >
                <option value="">Nenhum</option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </Field>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-slate-50 p-3 sm:col-span-2">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={editando.faturaCartao === true}
                onChange={(e) => setEditando({ ...editando, faturaCartao: e.target.checked })}
              />
              <span className="text-sm">
                <b className="text-slate-700">É o pagamento da fatura do cartão</b>
                <span className="mt-0.5 block text-xs text-slate-500">
                  Marque só na conta da fatura. Cada compra no crédito já virou
                  despesa no dia em que aconteceu — sem esta marca o mês conta
                  tudo duas vezes e fecha com um prejuízo que não existiu.
                </span>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-slate-50 p-3 sm:col-span-2">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={editando.compraEstoque === true}
                onChange={(e) => setEditando({ ...editando, compraEstoque: e.target.checked })}
              />
              <span className="text-sm">
                <b className="text-slate-700">É compra de mercadoria para revenda</b>
                <span className="mt-0.5 block text-xs text-slate-500">
                  Marque só se esta conta é reposição de estoque. Nesse caso o
                  valor sai do caixa, mas não conta como despesa do mês — o
                  custo entra no resultado quando a peça for vendida.
                </span>
              </span>
            </label>

            <Field label="Observações" className="sm:col-span-2">
              <textarea
                className="input"
                rows={2}
                value={editando.observacoes || ""}
                onChange={(e) => setEditando({ ...editando, observacoes: e.target.value })}
              />
            </Field>
          </div>
        )}
      </Modal>

      {/* ---------- Modal: pagar ---------- */}
      <Modal
        open={!!pagando}
        onClose={() => setPagando(null)}
        title="Registrar pagamento"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setPagando(null)}>
              Cancelar
            </button>
            <button className="btn-success" disabled={pagandoAgora} onClick={confirmarPagamento}>
              <CheckCircle2 size={16} /> Confirmar
            </button>
          </>
        }
      >
        {pagando && (
          <div>
            <div className="mb-4 rounded-xl bg-slate-50 p-3">
              <p className="font-semibold text-slate-800">{txt(pagando.descricao)}</p>
              <p className="text-sm text-slate-500">
                Vencimento {formatDate(pagando.vencimento)} · {txt(pagando.categoria)}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Valor pago (R$)">
                <InputNumero
                  className="input"
                  value={valorPg}
                  onChange={(v) => setValorPg((v ?? 0))}
                />
              </Field>
              <Field label="Forma de pagamento">
                <select
                  className="input"
                  value={formaPg}
                  onChange={(e) => setFormaPg(e.target.value as FormaPagamento)}
                >
                  {["dinheiro", "pix", "debito", "credito", "transferencia", "outro"].map((f) => (
                    <option key={f} value={f} className="capitalize">
                      {f}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <p className="mt-3 text-xs text-slate-500">
              O valor será lançado como saída no caixa.
              {pagando.recorrencia !== "unica" &&
                " Como esta conta se repete, ela reaparece no próximo vencimento."}
            </p>
          </div>
        )}
      </Modal>

      {/* ---------- Modal: objetivo ---------- */}
      <Modal
        open={!!editMeta}
        onClose={() => setEditMeta(null)}
        title="Objetivo"
        footer={
          <>
            {editMeta && metas.find((m) => m.id === editMeta.id) && (
              <button
                className="btn-ghost mr-auto text-red-500"
                onClick={async () => {
                  if (!confirm("Excluir este objetivo?")) return;
                  await removeMeta(editMeta.id);
                  setEditMeta(null);
                }}
              >
                <Trash2 size={16} /> Excluir
              </button>
            )}
            <button className="btn-secondary" onClick={() => setEditMeta(null)}>
              Cancelar
            </button>
            <button className="btn-primary" onClick={salvarMeta}>
              Salvar
            </button>
          </>
        }
      >
        {editMeta && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome do objetivo *" className="sm:col-span-2">
              <input
                className="input"
                placeholder="Ex: Faturar 20 mil no mês"
                value={editMeta.titulo}
                onChange={(e) => setEditMeta({ ...editMeta, titulo: e.target.value })}
              />
            </Field>

            <Field label="Tipo" className="sm:col-span-2">
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(META_META) as TipoMeta[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setEditMeta({ ...editMeta, tipo: t })}
                    className={`rounded-lg border p-2.5 text-left transition ${
                      editMeta.tipo === t
                        ? "border-brand-500 bg-brand-50"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className="mb-0.5 block text-sm font-semibold"
                      style={{ color: CORES_META[t] }}
                    >
                      {META_META[t].label}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {META_META[t].descricao}
                    </span>
                  </button>
                ))}
              </div>
            </Field>

            <Field label={META_META[editMeta.tipo].dinheiro ? "Valor alvo (R$) *" : "Quantidade *"}>
              <InputNumero
                className="input"
                value={editMeta.alvo}
                onChange={(v) => setEditMeta({ ...editMeta, alvo: (v ?? 0) })}
              />
            </Field>

            <Field label="Período">
              <select
                className="input"
                value={editMeta.periodo}
                onChange={(e) =>
                  setEditMeta({ ...editMeta, periodo: e.target.value as "mensal" | "anual" })
                }
              >
                <option value="mensal">Por mês</option>
                <option value="anual">Por ano</option>
              </select>
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
};

const Cartao: React.FC<{
  label: string;
  valor: string;
  icone: React.ReactNode;
  cor?: string;
  dica?: string;
}> = ({ label, valor, icone, cor = "text-slate-800", dica }) => (
  <div className="card" title={dica}>
    <p className="flex items-center gap-2 text-xs text-slate-500">
      {icone} {label}
    </p>
    <p className={`mt-1 text-2xl font-bold ${cor}`}>{valor}</p>
  </div>
);
