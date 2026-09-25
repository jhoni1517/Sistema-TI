import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Wrench,
  CheckCircle2,
  Wallet,
  AlertTriangle,
  Clock,
  TrendingUp,
  Users,
  ArrowRight,
  ShieldAlert,
  ShoppingCart,
  HandCoins,
  CalendarClock,
} from "lucide-react";
import { useApp } from "../store/AppStore";
import { brl, isToday, codigoOS, formatDate, txt } from "../lib/format";
import { receitaBruta, totalOS, lucroLiquido } from "../lib/calc";
import { OS_STATUS_META, type OSStatus } from "../lib/types";
import { conferirTudo, dinheiroEmRisco } from "../lib/integridade";
import { Conferencia } from "../components/Conferencia";
import { temModulo, vocabulario } from "../lib/ramos";
import { projetarCaixa, resumoDaProjecao } from "../lib/projecao";
import { saldoFiado } from "../lib/calc";
import { prazosEmRisco } from "../lib/prazos";
import { SeloPrazo } from "../components/SeloPrazo";
import { ListaPrimeirosPassos } from "../components/PrimeiroAcesso";
import { QuantoSobrou } from "../components/QuantoSobrou";
import { ResumoSemana } from "../components/ResumoSemana";
import { AlertaInsatisfeitos } from "../components/Satisfacao";
import { AlertaAuditoria } from "./Auditoria";
import { lembretesDoDia, REGRAS_PADRAO } from "../lib/lembretes";

export const Dashboard: React.FC = () => {
  const { ordens, clientes, produtos, movimentos, vendas, fiados, sessoes, comandas, contas, config, ramo } = useApp();
  const navigate = useNavigate();
  const paraChamar = useMemo(
    () =>
      temModulo(ramo, "os")
        ? lembretesDoDia(ordens, clientes, config.lembretesServico?.length ? config.lembretesServico : REGRAS_PADRAO).length
        : 0,
    [ramo, ordens, clientes, config.lembretesServico]
  );
  const [conferindo, setConferindo] = useState(false);

  const achados = useMemo(
    () => conferirTudo({ ordens, vendas, movimentos, produtos, fiados, clientes, sessoes, comandas }),
    [ordens, vendas, movimentos, produtos, fiados, clientes, sessoes]
  );
  const emRisco = dinheiroEmRisco(achados);

  const stats = useMemo(() => {
    const abertas = ordens.filter((o) => !["entregue", "cancelada"].includes(o.status));
    const prontas = ordens.filter((o) => o.status === "pronta");
    const movHoje = movimentos.filter((m) => isToday(m.data));
    const caixaHoje = receitaBruta(movHoje);
    const aReceber = abertas
      .filter((o) => ["pronta", "aprovada", "em_reparo", "aguardando_peca"].includes(o.status))
      .reduce((s, o) => s + totalOS(o), 0);
    // Serviço não tem estoque: contá-lo aqui acendia o alerta com formatação
    // e diagnóstico "acabando", e o número deixava de bater com o Estoque.
    const estoqueBaixo = produtos.filter((p) => !p.servico && p.quantidade <= p.estoqueMinimo);
    const doMes = movimentos.filter(
      (m) => txt(m.data).slice(0, 7) === new Date().toISOString().slice(0, 7)
    );
    const lucroMes = lucroLiquido(doMes);
    // Para a loja sem OS, o que responde "como foi hoje" é a venda.
    const vendasHoje = vendas.filter((v) => isToday(v.criadoEm)).length;
    const fiadoAberto = fiados.reduce((s, f) => s + saldoFiado(f), 0);
    return {
      abertas, prontas, caixaHoje, aReceber, estoqueBaixo, lucroMes, movHoje,
      vendasHoje, fiadoAberto, doMes,
    };
  }, [ordens, produtos, movimentos, vendas, fiados]);

  const recentes = useMemo(
    () => [...ordens].sort((a, b) => b.numero - a.numero).slice(0, 6),
    [ordens]
  );

  const nomeCliente = (id: string) => clientes.find((c) => c.id === id)?.nome || "—";

  /*
   * A PERGUNTA QUE NENHUMA TELA RESPONDIA: "até o dia 20 o dinheiro dá?".
   *
   * Todo o resto do Painel olha para trás. Este bloco olha para frente, a
   * partir do que já está combinado — conta cadastrada e renda cadastrada.
   * Venda futura não entra: seria palpite, e palpite otimista dá permissão
   * para gastar dinheiro que não vai chegar.
   */
  const projecao = useMemo(() => projetarCaixa(contas, undefined, 60), [contas]);

  /* O ramo manda no Painel igual manda no menu. */
  const temOS = temModulo(ramo, "os");
  /*
   * Prazo legal vencendo e aparelho esquecido na prateleira: os dois
   * estouram em silêncio, e o primeiro aviso é do Procon ou do cliente
   * bravo. Aqui eles aparecem antes. Ver lib/prazos.ts.
   */
  const riscos = useMemo(() => (temOS ? prazosEmRisco(ordens) : []), [ordens, temOS]);
  const palavras = vocabulario(ramo);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-tinta">Olá!</h1>
          <p className="text-sm text-slate-500">Resumo de hoje · {config.nomeLoja}</p>
        </div>
        <ResumoSemana />
      </div>

      <ListaPrimeirosPassos />

      <QuantoSobrou />

      <AlertaAuditoria />

      {temOS && <AlertaInsatisfeitos />}

      {/* Serviço que pede volta: bateria, película, limpeza. Ver lib/lembretes.ts */}
      {paraChamar > 0 && (
        <button
          onClick={() => navigate("/clientes?chamar=1")}
          className="card mb-6 flex w-full items-center gap-3 text-left hover:ring-sinal"
        >
          <span className="valor flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sinal text-lg font-bold text-white">
            {paraChamar}
          </span>
          <span className="flex-1">
            <b className="block">Cliente{paraChamar > 1 ? "s" : ""} para chamar hoje</b>
            <span className="text-sm text-tinta-suave">Revisão de bateria, película nova, limpeza: o recado já está pronto.</span>
          </span>
        </button>
      )}

      {/* Cards principais */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/*
          MERCEARIA NÃO TEM ORDEM DE SERVIÇO.
          
          O menu já respeitava o ramo; o Painel não — e o Painel é a PRIMEIRA
          tela. Quem contratou mercearia abria o sistema e via "OS em aberto:
          0" e "Nenhuma ordem de serviço ainda. Crie a primeira em Ordens de
          Serviço", apontando para um item de menu que não existe para ela.
          Parece sistema quebrado, e o cliente pagante conclui que comprou a
          coisa errada.
        */}
        {temOS ? (
          <>
            <Card onClick={() => navigate("/ordens")} icon={<Wrench />} label={`${palavras.ordemCurta} em aberto`} value={String(stats.abertas.length)} />
            <Card onClick={() => navigate("/ordens")} icon={<CheckCircle2 />} label="Pronto, esperando o dono" value={String(stats.prontas.length)} />
          </>
        ) : (
          <>
            <Card onClick={() => navigate("/pdv")} icon={<ShoppingCart />} label="Vendas hoje" value={String(stats.vendasHoje)} />
            <Card onClick={() => navigate("/a-receber")} icon={<HandCoins />} label="Fiado em aberto" value={brl(stats.fiadoAberto)} />
          </>
        )}
        <Card onClick={() => navigate("/caixa")} icon={<Wallet />} label="Recebido hoje" value={brl(stats.caixaHoje)} />
        <Card onClick={() => navigate("/relatorios")} icon={<TrendingUp />} label="Lucro líquido (mês)" value={brl(stats.lucroMes)} />
      </div>

      {temOS && (riscos.length > 0 && (
        <section className="mb-6 rounded-md border border-linha bg-cartao p-4 font-grotesca text-tinta">
          <h2 className="rotulo mb-3 flex items-center justify-between">
            <span>Prazos em risco</span>
            <span className="valor">{riscos.length}</span>
          </h2>
          <ul className="divide-y divide-linha">
            {riscos.slice(0, 6).map((r) => (
              <li key={`${r.tipo}-${r.os.id}`}>
                <button
                  className="flex w-full flex-wrap items-center gap-2 py-2 text-left hover:bg-concreto/60"
                  onClick={() => navigate("/ordens")}
                >
                  <span className="valor text-sm font-semibold">{codigoOS(r.os.numero)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {nomeCliente(r.os.clienteId)} · {[r.os.marca, r.os.modelo].filter(Boolean).join(" ")}
                  </span>
                  <SeloPrazo os={r.os} />
                </button>
              </li>
            ))}
          </ul>
          {riscos.length > 6 && (
            <p className="mt-2 text-xs text-tinta-suave">E mais {riscos.length - 6} na lista de OS.</p>
          )}
        </section>
      ))}

      {/* Alertas + a receber */}
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        {/* "Em serviço" é aparelho no balcão esperando conserto: sem OS,
            esse dinheiro não existe. A loja sem OS vê o que ela tem. */}
        <div className="card">
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Clock size={16} /> {temOS ? "A receber (em serviço)" : "Recebido no mês"}
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-800">
            {brl(temOS ? stats.aReceber : receitaBruta(stats.doMes))}
          </p>
        </div>
        <div className="card">
          <p className="flex items-center gap-2 text-sm text-slate-500"><Users size={16} /> Clientes cadastrados</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{clientes.length}</p>
        </div>
        <button
          onClick={() => navigate("/estoque")}
          className={`card text-left ${stats.estoqueBaixo.length > 0 ? "ring-2 ring-amber-300" : ""}`}
        >
          <p className="flex items-center gap-2 text-sm text-slate-500"><AlertTriangle size={16} className={stats.estoqueBaixo.length ? "text-amber-500" : ""} /> Estoque baixo</p>
          <p className={`mt-1 text-2xl font-bold ${stats.estoqueBaixo.length ? "text-amber-600" : "text-slate-800"}`}>
            {stats.estoqueBaixo.length} {stats.estoqueBaixo.length === 1 ? "item" : "itens"}
          </p>
        </button>
      </div>

      {/* Conferência: o sistema apontando o próprio buraco.
          Nada disso dá erro na hora — tudo aparece no fechamento do mês,
          quando ninguém lembra mais o que aconteceu. */}
      {achados.length > 0 && (
        <button
          onClick={() => setConferindo(true)}
          className={`card mb-6 flex w-full flex-wrap items-center gap-3 text-left ${
            emRisco > 0 ? "ring-2 ring-red-300" : "ring-1 ring-amber-200"
          }`}
        >
          <ShieldAlert
            size={22}
            className={emRisco > 0 ? "text-red-500" : "text-amber-500"}
          />
          <span className="min-w-0 flex-1">
            <span className="block font-bold text-slate-800">
              {achados.length} ponto(s) para conferir no sistema
            </span>
            <span className="block text-sm text-slate-500">
              {emRisco > 0
                ? `${brl(emRisco)} entraram ou saíram sem registro certo.`
                : "Estoque, dívidas e caixa com algo fora do lugar."}
            </span>
          </span>
          <ArrowRight size={16} className="text-slate-400" />
        </button>
      )}

      {conferindo && <Conferencia onClose={() => setConferindo(false)} />}

      {/* Previsão dos próximos 60 dias. Só aparece com algo cadastrado —
          um card dizendo "R$ 0,00" não ensina nada a quem ainda não usou. */}
      {projecao.dias.length > 0 && (
        <button
          onClick={() => navigate("/contas")}
          className={`card mb-6 flex w-full flex-wrap items-center gap-3 text-left ${
            projecao.aperto ? "ring-2 ring-red-300" : ""
          }`}
        >
          <CalendarClock
            size={22}
            className={projecao.aperto ? "text-red-500" : "text-slate-400"}
          />
          <span className="min-w-0 flex-1">
            <span className="block font-bold text-slate-800">
              {projecao.aperto ? "O mês não fecha" : "Os próximos 60 dias"}
            </span>
            <span className="block text-sm text-slate-500">
              {resumoDaProjecao(projecao, 60)}
            </span>
          </span>
          <ArrowRight size={16} className="text-slate-400" />
        </button>
      )}

      {/*
        A lista de ordens recentes sai inteira na loja sem OS. Não basta
        trocar o texto: a linha mostra marca e modelo do APARELHO, que numa
        mercearia não existe, e o vazio mandava criar a primeira "em Ordens
        de Serviço" — um menu que ela não tem.
      */}
      {temOS && (
      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold text-slate-700">{palavras.ordemPlural} recentes</h2>
          <button className="flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline" onClick={() => navigate("/ordens")}>
            Ver todas <ArrowRight size={14} />
          </button>
        </div>
        {recentes.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">Nenhuma ordem de serviço ainda. Crie a primeira em "Ordens de Serviço".</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentes.map((o) => (
              <div key={o.id} className="flex items-center gap-3 py-3">
                <span className="font-mono text-xs font-bold text-slate-400">{codigoOS(o.numero)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{nomeCliente(o.clienteId)}</p>
                  <p className="truncate text-xs text-slate-400">{o.marca} {o.modelo}</p>
                </div>
                <span className={`rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${OS_STATUS_META[o.status as OSStatus].carimbo}`}>{OS_STATUS_META[o.status as OSStatus].label}</span>
                <span className="hidden text-xs text-slate-400 sm:block">{formatDate(o.criadoEm)}</span>
                <span className="w-20 text-right text-sm font-bold text-slate-700">{brl(totalOS(o))}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      )}
    </div>
  );
};

/*
 * Número do dia. Era um degradê colorido por cartão (azul, verde, roxo,
 * laranja): quatro cores gritando ao mesmo tempo e nenhuma dizendo nada.
 * Agora é papel com o número em letra de etiqueta, como o resto do balcão.
 */
const Card: React.FC<{ icon: React.ReactNode; label: string; value: string; onClick: () => void }> = ({ icon, label, value, onClick }) => (
  <button
    onClick={onClick}
    className="rounded-md border border-linha bg-cartao p-5 text-left text-tinta transition hover:border-tinta-suave"
  >
    <div className="mb-2 text-tinta-suave">{icon}</div>
    <p className="valor text-2xl font-semibold">{value}</p>
    <p className="text-sm text-tinta-suave">{label}</p>
  </button>
);
