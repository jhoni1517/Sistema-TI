import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Store,
  CheckCircle2,
  Ban,
  Unlock,
  Save,
  Settings2,
  Search,
  CalendarClock,
  Wallet,
  MessageCircle,
  KeyRound,
  Copy,
  Clock,
  Hourglass,
  Plus,
  Minus,
  XCircle,
  RotateCcw,
  Ticket,
  Package,
} from "lucide-react";
import { aviso } from "../components/Aviso";
import { SectionTitle, Field, Modal, EmptyState, InputNumero } from "../components/ui";
import { brl, formatDate, txt, abrirWhatsapp } from "../lib/format";
import { normalizar } from "../lib/busca";
import { gerarLinkDeSenha } from "../lib/auth";
import { RAMOS, RAMO_META, ramoDe } from "../lib/ramos";
import {
  mensagemCobranca,
  tipoDoAviso,
  AVISO_META,
  mensagemTeste,
  tipoDoTeste,
  TESTE_META,
} from "../lib/cobranca";
import {
  listarLojas,
  carregarSistemaConfig,
  salvarSistemaConfig,
  registrarPagamento,
  definirBloqueio,
  atualizarLoja,
  situacaoDe,
  diasParaVencer,
  semPrazo,
  fimDoTeste,
  liberarTeste,
  ajustarTeste,
  encerrarTeste,
  reabrirTeste,
  anotarMotivoTeste,
  resumoUsoLojas,
  usouDeVerdade,
  emTeste,
  testeAcabou,
  diasDeTeste,
  podeLiberarTeste,
  podeReabrirTeste,
  MOTIVOS_TESTE,
  nomeDoMotivo,
  SITUACAO_META,
  type Loja,
  type SistemaConfig,
  type UsoDaLoja,
} from "../lib/assinatura";
import { criarConvite, linkConvite } from "../lib/auth";

/**
 * Painel do administrador do sistema.
 * É a tela de quem aluga o sistema — não a de quem usa a loja. Só aparece
 * para quem tem super_admin, e as políticas do banco recusam qualquer
 * tentativa vinda de outra conta.
 */
/**
 * Valor da mensalidade, gravado só ao sair do campo.
 *
 * Precisa de estado próprio porque a gravação é por linha da lista: um
 * campo controlado pelo valor da loja reescreveria o texto a cada tecla, e
 * apagar para digitar outro número ficava impossível.
 */
const ValorMensal: React.FC<{ valor: number; onSalvar: (v: number) => void }> = ({
  valor,
  onSalvar,
}) => {
  const [v, setV] = useState<number | undefined>(valor);
  useEffect(() => setV(valor), [valor]);
  return (
    <InputNumero
      className="input !w-24 !py-1.5 text-sm"
      value={v}
      onChange={setV}
      onBlur={() => {
      if (v !== undefined && v !== valor) onSalvar(v);
      if (v === undefined) setV(valor);
      }}
    />
  );
};

export const Lojas: React.FC = () => {
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [cfg, setCfg] = useState<SistemaConfig>({});
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [ajustes, setAjustes] = useState(false);
  const [erro, setErro] = useState("");
  const [senha, setSenha] = useState<{ email: string; link: string; gerando: boolean } | null>(
    null
  );
  /** Contagem do que cada loja construiu, por id. Vazio = migração nova não rodou. */
  const [uso, setUso] = useState<Record<string, UsoDaLoja>>({});
  /** A loja cujo motivo estamos anotando, e se isso encerra o teste junto */
  const [motivo, setMotivo] = useState<{ loja: Loja; encerrando: boolean } | null>(null);
  const [convite, setConvite] = useState<{ nome: string; link: string; gerando: boolean } | null>(
    null
  );

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const [l, c] = await Promise.all([listarLojas(), carregarSistemaConfig()]);
      setLojas(l);
      if (c) setCfg(c);
      /*
       * O uso vem DEPOIS e por fora do try da lista.
       *
       * Ele depende de uma migração mais nova, e uma tabela com problema não
       * pode zerar a tela: sem isto, quem não rodou o SQL novo abriria a tela
       * de Lojas vazia e idêntica à de um sistema que perdeu os dados.
       */
      resumoUsoLojas().then(setUso).catch(() => setUso({}));
    } catch (e) {
      setErro(
        (e instanceof Error ? e.message : String(e)) +
          " — se for a primeira vez, confira se você rodou o supabase-migracao-assinatura.sql."
      );
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const tolerancia = cfg.dias_tolerancia ?? 5;

  const lista = useMemo(() => {
    const b = normalizar(busca);
    return lojas
      .filter((l) => normalizar(l.nome).includes(b))
      .sort((a, b2) => (diasParaVencer(a.venceEm) ?? 0) - (diasParaVencer(b2.venceEm) ?? 0));
  }, [lojas, busca]);

  const resumo = useMemo(() => {
    let ativas = 0;
    let problema = 0;
    let receita = 0;
    let testando = 0;
    let potencial = 0;
    for (const l of lojas) {
      if (l.isento) continue; // a sua própria loja não é receita
      /*
       * Loja em teste NÃO entra na receita.
       *
       * Ela tem valor_mensal preenchido (o padrão) e vencimento no futuro, e
       * por isso somava como "ativa" — a Receita mensal contava dinheiro que
       * ninguém pagou. Sete lojas em teste inflavam o número em quase R$ 600
       * e o painel dizia que o mês estava melhor do que estava.
       *
       * Aqui ela vira o próprio número, que é outra coisa: não é receita, é
       * o quanto ainda dá para fechar se você ligar.
       */
      if (emTeste(l)) {
        testando++;
        if (!testeAcabou(l)) potencial += Number(l.valor_mensal) || 0;
        continue;
      }
      const s = situacaoDe(l, tolerancia);
      if (s === "ativa" || s === "tolerancia") {
        ativas++;
        receita += Number(l.valor_mensal) || 0;
      } else {
        problema++;
      }
    }
    const deGraca = lojas.filter(semPrazo).length;

    /*
     * Por que os testes não fecharam, contado.
     *
     * É a única saída deste sistema que responde "o que eu conserto primeiro".
     * Cinco lojas em "Faltou algo no sistema" é uma tela para escrever; cinco
     * em "Achou caro" é preço. Sem somar, cada motivo fica sendo uma lembrança
     * solta do telefonema daquele dia.
     */
    const motivos = new Map<string, number>();
    for (const l of lojas) {
      const m = txt(l.motivoTeste);
      if (!m) continue;
      motivos.set(m, (motivos.get(m) || 0) + 1);
    }
    const porMotivo = [...motivos.entries()].sort((a, b) => b[1] - a[1]);

    return { ativas, problema, receita, deGraca, testando, potencial, porMotivo };
  }, [lojas, tolerancia]);

  /**
   * Abre o WhatsApp com a cobrança pronta, no tom certo para a situação:
   * lembrete antes de vencer, aviso no dia, e depois do travamento o texto
   * que deixa claro que nenhum dado foi apagado.
   */
  const cobrar = (l: Loja) => {
    const dias = diasParaVencer(l.venceEm);
    /*
     * Loja em teste recebe outro texto, e essa diferença é o ponto.
     *
     * Ela caía na mesma régua e levava "sua mensalidade venceu há 2 dias" —
     * de uma mensalidade que nunca contratou. O recado que era para fechar a
     * venda chegava como cobrança de caloteiro.
     */
    const teste = emTeste(l);
    const dados = {
      nomeLoja: txt(l.nome),
      valor: l.valor_mensal,
      dias,
      chavePix: cfg.chave_pix,
      titularPix: cfg.titular_pix,
    };
    const texto = teste
      ? (() => {
          const t = tipoDoTeste(dias);
          return t ? mensagemTeste(t, dados) : "";
        })()
      : (() => {
          const t = tipoDoAviso(dias, tolerancia);
          return t ? mensagemCobranca(t, dados) : "";
        })();

    if (!texto) {
      return aviso.info(
        teste
          ? "O teste desta loja ainda tem folga — apressar quem está gostando estraga a venda."
          : "Esta loja está em dia — nada a cobrar."
      );
    }

    const tel = txt(l.whatsapp).replace(/\D/g, "");
    if (tel.length < 10) {
      return aviso.alerta("Preencha o WhatsApp desta loja para falar com um clique.");
    }
    abrirWhatsapp(tel, texto);
  };

  const pagar = async (l: Loja, meses: number) => {
    if (!confirm(`Confirmar ${meses} mês(es) de pagamento para "${l.nome}"?`)) return;
    try {
      const novo = await registrarPagamento(l.id, meses);
      aviso.sucesso(`Renovado até ${formatDate(novo)}.`);
      carregar();
    } catch (e) {
      aviso.erro(e instanceof Error ? e.message : String(e));
    }
  };

  /**
   * Põe prazo numa loja que hoje usa o sistema para sempre.
   *
   * Quem decide é quem administra — por isso é botão e não automático para
   * as lojas que já existem. Pôr prazo em quem já paga e só não tem a data
   * preenchida cortaria o acesso de cliente pagante, que é o erro mais caro
   * que este sistema pode cometer.
   */
  const darTeste = async (l: Loja) => {
    const dias = cfg.dias_teste ?? 7;
    if (
      !confirm(
        `Liberar ${dias} dias de teste para "${l.nome}"?\n\n` +
          (semPrazo(l)
            ? "Hoje esta loja usa o sistema DE GRAÇA e sem data para acabar. "
            : "Ela passa a contar como teste, e não como assinatura — o recado " +
              "que sai para ela vira conversa de venda, não cobrança. ") +
          `O prazo passa a acabar em ${formatDate(fimDoTeste(dias).toISOString())}, ` +
          "e depois disso dá para esticar ou encurtar pelos botões da linha."
      )
    ) {
      return;
    }
    try {
      const novo = await liberarTeste(l.id);
      aviso.sucesso(`Teste liberado. Vence em ${formatDate(novo)}.`);
      carregar();
    } catch (e) {
      aviso.erro(e instanceof Error ? e.message : String(e));
    }
  };

  /**
   * Estica ou encurta o teste que já está correndo.
   *
   * A primeira versão disto só sabia LIGAR o teste. Depois de ligado não
   * havia mais botão: a loja que pediu três dias a mais para testar com o
   * movimento do fim de semana só podia ser atendida no SQL, e quem entrou
   * por engano ficava sete dias ocupando a lista. Cortesia que não dá para
   * ajustar vira ou favor no banco de dados ou "não dá".
   */
  const mexerNoTeste = async (l: Loja, dias: number) => {
    try {
      const novo = await ajustarTeste(l.id, dias);
      aviso.sucesso(
        (dias > 0 ? `Mais ${dias} dia(s) de teste. ` : `Teste encurtado em ${-dias} dia(s). `) +
          `Agora acaba em ${formatDate(novo)}.`
      );
      carregar();
    } catch (e) {
      aviso.erro(e instanceof Error ? e.message : String(e));
    }
  };

  /*
   * Encerrar abre o modal do motivo em vez de um confirm seco.
   *
   * O motivo é a única coisa que sobra depois: sem ele, "testou e não
   * converteu" é um número sem história, e três meses disso não dizem se o
   * que falta é preço ou é uma tela. Perguntar no momento em que a decisão
   * acontece é a única hora em que a resposta existe.
   */
  const acabarTeste = (l: Loja) => setMotivo({ loja: l, encerrando: true });

  /** Grava o motivo escolhido — encerrando o teste junto, ou não */
  const gravarMotivo = async (chave: string) => {
    if (!motivo) return;
    const { loja: l, encerrando } = motivo;
    try {
      if (encerrando) {
        await encerrarTeste(l.id, chave);
        aviso.sucesso("Teste encerrado. A loja continua com tudo o que cadastrou.");
      } else {
        await anotarMotivoTeste(l.id, chave);
        aviso.sucesso("Anotado.");
      }
      setMotivo(null);
      carregar();
    } catch (e) {
      aviso.erro(e instanceof Error ? e.message : String(e));
    }
  };

  /**
   * Reabre o teste de quem já testou, com o prazo menor.
   *
   * Botão separado do "+7" de propósito: esticar é para o teste que corre,
   * reabrir é para quem sumiu e voltou. O mesmo botão para os dois esconderia
   * quantas vezes aquela loja já usou de graça.
   */
  const reabrir = async (l: Loja) => {
    const dias = cfg.dias_reteste ?? 3;
    const jaDeu = Number(l.testesDados) || 1;
    if (
      !confirm(
        `Reabrir o teste de "${l.nome}" por ${dias} dias?\n\n` +
          `Esta loja já testou ${jaDeu}x. Prazo menor de propósito: quem volta ` +
          "já conhece o sistema.\n\n" +
          "Muda em Ajustes do sistema."
      )
    ) {
      return;
    }
    try {
      const novo = await reabrirTeste(l.id);
      aviso.sucesso(`Teste reaberto até ${formatDate(novo)}.`);
      carregar();
    } catch (e) {
      aviso.erro(e instanceof Error ? e.message : String(e));
    }
  };

  /**
   * Convite de loja nova, com o teste já correndo.
   *
   * Existe aqui, e não só em Configurações -> Equipe, porque é aqui que se
   * pensa em cliente novo. E o link é o que permite vender enquanto você
   * atende o balcão: a pessoa abre, cria a senha, e os dias já estão rodando.
   */
  const gerarConvite = async () => {
    if (!convite) return;
    setConvite({ ...convite, gerando: true, link: "" });
    try {
      const codigo = await criarConvite("dono", convite.nome || undefined, true);
      setConvite({ nome: convite.nome, link: linkConvite(codigo), gerando: false });
    } catch (e) {
      setConvite({ ...convite, gerando: false });
      aviso.erro(e instanceof Error ? e.message : String(e));
    }
  };

  const alternarBloqueio = async (l: Loja) => {
    const bloquear = !l.bloqueada;
    if (
      bloquear &&
      !confirm(
        `Bloquear "${l.nome}"? A loja perde o acesso por completo, inclusive a consulta. Use só em último caso.`
      )
    ) {
      return;
    }
    try {
      await definirBloqueio(l.id, bloquear);
      carregar();
    } catch (e) {
      aviso.erro(e instanceof Error ? e.message : String(e));
    }
  };

  const mudarWhatsapp = async (l: Loja, whatsapp: string) => {
    try {
      await atualizarLoja(l.id, { whatsapp });
      setLojas((prev) => prev.map((x) => (x.id === l.id ? { ...x, whatsapp } : x)));
    } catch (e) {
      aviso.erro(e instanceof Error ? e.message : String(e));
    }
  };

  const mudarRamo = async (l: Loja, ramo: string) => {
    if (ramoDe(l.ramo) === ramo) return;
    if (
      !confirm(
        `Mudar "${l.nome}" para ${RAMO_META[ramoDe(ramo)].label}?\n\n` +
          "As telas que não pertencem ao novo plano deixam de aparecer para ela. " +
          "Nenhum dado é apagado: o que sai do menu continua guardado."
      )
    ) {
      return;
    }
    try {
      await atualizarLoja(l.id, { ramo });
      setLojas((prev) => prev.map((x) => (x.id === l.id ? { ...x, ramo } : x)));
      aviso.sucesso(`${l.nome} agora usa ${RAMO_META[ramoDe(ramo)].label}.`);
    } catch (e) {
      aviso.erro(e instanceof Error ? e.message : String(e));
    }
  };

  const mudarValor = async (l: Loja, valor: number) => {
    try {
      await atualizarLoja(l.id, { valor_mensal: valor });
      setLojas((prev) => prev.map((x) => (x.id === l.id ? { ...x, valor_mensal: valor } : x)));
    } catch (e) {
      aviso.erro(e instanceof Error ? e.message : String(e));
    }
  };

  /**
   * Gera o link de troca de senha e deixa pronto para copiar.
   * É a saída para quando o e-mail não chega — o que hoje é o normal,
   * porque o SMTP próprio ainda não está configurado.
   */
  const gerarSenha = async () => {
    if (!senha) return;
    setSenha({ ...senha, gerando: true, link: "" });
    try {
      const link = await gerarLinkDeSenha(senha.email);
      setSenha({ email: senha.email, link, gerando: false });
    } catch (e) {
      setSenha({ ...senha, gerando: false });
      aviso.erro(e instanceof Error ? e.message : String(e));
    }
  };

  const salvarAjustes = async () => {
    try {
      await salvarSistemaConfig(cfg);
      setAjustes(false);
      aviso.sucesso("Ajustes salvos.");
    } catch (e) {
      aviso.erro(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div>
      <SectionTitle
        title="Lojas assinantes"
        subtitle="Quem usa o sistema, quem está em dia e quem atrasou"
        action={
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-primary"
              onClick={() => setConvite({ nome: "", link: "", gerando: false })}
            >
              <Ticket size={18} /> Convidar loja nova
            </button>
            <button
              className="btn-secondary"
              onClick={() => setSenha({ email: "", link: "", gerando: false })}
            >
              <KeyRound size={18} /> Liberar senha
            </button>
            <button className="btn-secondary" onClick={() => setAjustes(true)}>
              <Settings2 size={18} /> Ajustes do sistema
            </button>
          </div>
        }
      />

      {erro && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{erro}</p>}

      {/*
        Este aviso vem ANTES dos números, e é o único da tela que interrompe.
        Loja sem prazo aparecia como "Em dia" na lista: verdade e engano ao
        mesmo tempo. Enquanto ninguém olhar, ela usa o sistema de graça e
        para sempre — e ninguém procura por dinheiro que nunca chegou.
      */}
      {resumo.deGraca > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-orange-50 p-3 text-sm text-orange-800">
          <Clock size={16} className="mt-0.5 shrink-0" />
          <span>
            <b>
              {resumo.deGraca} loja{resumo.deGraca === 1 ? "" : "s"} sem prazo de
              vencimento
            </b>{" "}
            — usando o sistema de graça, sem data para acabar. Libere o teste no
            botão de cada uma.
          </span>
        </p>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card">
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <CheckCircle2 size={14} /> Lojas pagantes
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{resumo.ativas}</p>
        </div>
        <div className="card">
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <CalendarClock size={14} /> Em atraso
          </p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{resumo.problema}</p>
        </div>
        {/*
          Em teste é um número separado, e não parte da receita.
          Loja em teste tem valor mensal preenchido e vencimento no futuro:
          somava como ativa, e a Receita mensal contava dinheiro que ninguém
          pagou. O que está aqui não é receita — é o que ainda dá para fechar.
        */}
        <div className="card">
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <Hourglass size={14} /> Em teste
          </p>
          <p className="mt-1 text-2xl font-bold text-violet-600">{resumo.testando}</p>
          {resumo.potencial > 0 && (
            <p className="mt-0.5 text-xs text-slate-400">
              {brl(resumo.potencial)}/mês a fechar
            </p>
          )}
        </div>
        <div className="card bg-gradient-to-br from-brand-600 to-brand-800 text-white ring-brand-700">
          <p className="flex items-center gap-2 text-xs text-brand-100">
            <Wallet size={14} /> Receita mensal
          </p>
          <p className="mt-1 text-2xl font-bold">{brl(resumo.receita)}</p>
          <p className="mt-0.5 text-xs text-brand-100">só quem paga</p>
        </div>
      </div>

      {/*
        Por que os testes não fecharam, somado. É a única saída desta tela que
        responde "o que eu conserto primeiro" — e ela só existe porque o motivo
        vem de uma lista fechada. Texto livre não soma.
      */}
      {resumo.porMotivo.length > 0 && (
        <div className="card mb-5">
          <p className="mb-2 flex items-center gap-2 text-xs text-slate-500">
            <XCircle size={14} /> Por que os testes não fecharam
          </p>
          <div className="flex flex-wrap gap-2">
            {resumo.porMotivo.map(([m, n]) => (
              <span
                key={m}
                className="badge bg-slate-100 text-slate-600"
                title={`${n} loja(s)`}
              >
                {nomeDoMotivo(m)} · <b className="ml-1">{n}</b>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="relative mb-4 max-w-md">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className="input pl-10"
          placeholder="Buscar loja..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {carregando ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="esqueleto h-20 w-full" />
          ))}
        </div>
      ) : lista.length === 0 ? (
        <EmptyState
          icon={<Store size={48} />}
          title="Nenhuma loja ainda"
          hint="Use 'Liberar nova loja' em Configurações → Equipe para convidar a primeira."
        />
      ) : (
        <div className="space-y-3">
          {lista.map((l) => {
            const s = situacaoDe(l, tolerancia);
            const dias = diasParaVencer(l.venceEm);
            const noTeste = emTeste(l);
            const acabou = testeAcabou(l);
            const diasTeste = diasDeTeste(l);
            const u = uso[l.id];
            const vezes = Number(l.testesDados) || 0;
            return (
              <div key={l.id} className="card flex flex-wrap items-center gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Store size={20} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-800">{txt(l.nome)}</span>
                    {/*
                      Em teste, o crachá da assinatura SOME em vez de ficar do
                      lado. Os dois juntos se contradiziam na mesma linha:
                      "Vencida (tolerância)" ao lado de "Testou e não assinou",
                      "Em dia" ao lado de "Em teste, último dia". Quem lê no
                      celular decide pelo primeiro crachá, e o primeiro estava
                      falando de uma mensalidade que a loja nunca contratou.
                    */}
                    {!noTeste && (
                      <span className={`badge ${SITUACAO_META[s].color}`}>
                        {SITUACAO_META[s].label}
                      </span>
                    )}
                    {/*
                      Sem prazo é o estado mais perigoso da lista e o que
                      menos parecia: o crachá dizia "Em dia" para uma loja
                      que nunca vai vencer. Agora ele diz o que é.
                    */}
                    {semPrazo(l) && (
                      <span className="badge bg-orange-100 text-orange-700">
                        Sem prazo · nunca vence
                      </span>
                    )}
                    {/*
                      O crachá do teste vem antes de qualquer aviso de
                      mensalidade: a loja em teste aparecia como "Vencida" —
                      de uma mensalidade que ela nunca contratou.
                    */}
                    {noTeste && (
                      <span
                        className={`badge ${
                          acabou
                            ? TESTE_META.teste_acabou.cor
                            : "bg-violet-100 text-violet-700"
                        }`}
                      >
                        {acabou
                          ? `Testou e não assinou · ${Math.abs(diasTeste ?? 0)}d` +
                            // A loja que já passou da tolerância parou de
                            // cadastrar. Sem dizer isso aqui, o crachá some com
                            // a única informação que muda o telefonema.
                            (s === "leitura" ? " · travada" : "")
                          : `Em teste · ${diasTeste === 0 ? "último dia" : `faltam ${diasTeste}d`}`}
                      </span>
                    )}
                    {/* 2o, 3o teste: a primeira cortesia é venda, a terceira
                        é outra conversa — e sem contar ninguém percebe. */}
                    {noTeste && vezes > 1 && (
                      <span className="badge bg-orange-100 text-orange-700">{vezes}o teste</span>
                    )}
                    {txt(l.motivoTeste) && (
                      <span className="badge bg-slate-100 text-slate-600">
                        {nomeDoMotivo(l.motivoTeste)}
                      </span>
                    )}
                    {l.isento ? (
                      <span className="badge bg-brand-100 text-brand-700">Sua loja · isenta</span>
                    ) : (
                      !noTeste &&
                      (() => {
                        const t = tipoDoAviso(dias, tolerancia);
                        return t && s === "ativa" ? (
                          <span className={`badge ${AVISO_META[t].cor}`}>{AVISO_META[t].label}</span>
                        ) : null;
                      })()
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {l.isento ? (
                      "Sem cobrança"
                    ) : noTeste ? (
                      <>
                        Teste {acabou ? "acabou" : "acaba"} {formatDate(txt(l.venceEm))}
                        {" · nunca pagou"}
                      </>
                    ) : l.venceEm ? (
                      <>
                        Vence {formatDate(l.venceEm)}
                        {dias !== null && (
                          <>
                            {" · "}
                            {dias >= 0
                              ? `faltam ${dias} dia${dias === 1 ? "" : "s"}`
                              : `${Math.abs(dias)} dia${Math.abs(dias) === 1 ? "" : "s"} em atraso`}
                          </>
                        )}
                      </>
                    ) : (
                      "usando de graça, sem data para acabar"
                    )}
                    {l.ultimoPagamento && ` · último pagamento ${formatDate(l.ultimoPagamento)}`}
                  </p>
                  {/*
                    O que a loja construiu lá dentro, só contagem.
                    Quem cadastrou 200 produtos e sumiu esbarrou em alguma
                    coisa concreta; quem cadastrou 3 nunca começou. São dois
                    telefonemas diferentes, e antes disto os dois eram o mesmo.
                  */}
                  {u && !l.isento && (
                    <p
                      className={`mt-1 flex flex-wrap items-center gap-x-2 text-xs ${
                        noTeste && !usouDeVerdade(u) ? "text-slate-400" : "text-slate-500"
                      }`}
                    >
                      <Package size={12} className="shrink-0" />
                      {u.produtos} produto{u.produtos === 1 ? "" : "s"} · {u.clientes} cliente
                      {u.clientes === 1 ? "" : "s"} · {u.vendas} venda
                      {u.vendas === 1 ? "" : "s"} · {u.ordens} OS
                      {noTeste && !usouDeVerdade(u) && (
                        <b className="text-slate-400">· mal começou</b>
                      )}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <input
                    className="input !w-36 !py-1.5 text-sm"
                    placeholder="WhatsApp"
                    defaultValue={txt(l.whatsapp)}
                    onBlur={(e) => {
                      if (e.target.value !== txt(l.whatsapp)) mudarWhatsapp(l, e.target.value);
                    }}
                  />
                  {/* O plano é o que foi vendido. Muda só aqui, e o banco
                      recusa a troca vinda da própria loja. */}
                  <select
                    className="input !w-40 !py-1.5 text-sm"
                    value={ramoDe(l.ramo)}
                    onChange={(e) => mudarRamo(l, e.target.value)}
                  >
                    {RAMOS.map((r) => (
                      <option key={r} value={r}>
                        {RAMO_META[r].label}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-slate-400">R$</span>
                  <ValorMensal
                    valor={Number(l.valor_mensal) || 0}
                    onSalvar={(v) => mudarValor(l, v)}
                  />
                </div>

                <div className={`flex flex-wrap gap-2 ${l.isento ? "hidden" : ""}`}>
                  {podeLiberarTeste(l) && (
                    <button
                      className="btn-primary !py-1.5 text-xs"
                      onClick={() => darTeste(l)}
                    >
                      <Clock size={14} /> Liberar {cfg.dias_teste ?? 7} dias de teste
                    </button>
                  )}
                  {/*
                    Esticar e encurtar aparecem DURANTE o teste.
                    Sem eles, ligar o teste era uma porta de mão única: quem
                    pediu mais três dias para experimentar no fim de semana só
                    podia ser atendido no SQL, e quem entrou por engano ficava
                    a semana toda ocupando a lista.
                  */}
                  {noTeste && (
                    <span className="flex items-center gap-1 rounded-lg bg-violet-50 px-1.5 py-1 ring-1 ring-violet-100">
                      <span className="pl-1 text-[11px] font-semibold text-violet-700">
                        Teste
                      </span>
                      {[3, 7, 15].map((d) => (
                        <button
                          key={d}
                          className="btn-ghost !px-1.5 !py-1 text-xs text-violet-700"
                          title={`Mais ${d} dias de teste`}
                          onClick={() => mexerNoTeste(l, d)}
                        >
                          <Plus size={12} />
                          {d}
                        </button>
                      ))}
                      <button
                        className="btn-ghost !px-1.5 !py-1 text-xs text-slate-500"
                        title="Tirar 3 dias do teste"
                        onClick={() => mexerNoTeste(l, -3)}
                      >
                        <Minus size={12} />3
                      </button>
                      {/* Reabrir é outro botão, e não um "+3" a mais: esticar
                          é para o teste que corre; reabrir é para quem sumiu e
                          voltou, e conta como cortesia nova. */}
                      {podeReabrirTeste(l) && (
                        <button
                          className="btn-ghost !px-1.5 !py-1 text-xs text-violet-700"
                          title={`Reabrir por ${cfg.dias_reteste ?? 3} dias`}
                          onClick={() => reabrir(l)}
                        >
                          <RotateCcw size={12} />
                          {cfg.dias_reteste ?? 3}
                        </button>
                      )}
                      <button
                        className="btn-ghost !px-1.5 !py-1 text-xs text-slate-500"
                        title="Anotar por que não fechou"
                        onClick={() => setMotivo({ loja: l, encerrando: false })}
                      >
                        <MessageCircle size={12} />
                      </button>
                      <button
                        className="btn-ghost !px-1.5 !py-1 text-xs text-red-500"
                        title="Encerrar o teste hoje"
                        onClick={() => acabarTeste(l)}
                      >
                        <XCircle size={12} />
                      </button>
                    </span>
                  )}
                  {!l.isento &&
                    (noTeste ? tipoDoTeste(dias) : tipoDoAviso(dias, tolerancia)) && (
                      <button className="btn-secondary !py-1.5 text-xs" onClick={() => cobrar(l)}>
                        <MessageCircle size={14} />{" "}
                        {noTeste ? "Falar do teste" : "Cobrar"}
                      </button>
                    )}
                  <button className="btn-success !py-1.5 text-xs" onClick={() => pagar(l, 1)}>
                    <CheckCircle2 size={14} /> Pagou 1 mês
                  </button>
                  <button className="btn-secondary !py-1.5 text-xs" onClick={() => pagar(l, 12)}>
                    12 meses
                  </button>
                  <button
                    className={`!py-1.5 text-xs ${l.bloqueada ? "btn-secondary" : "btn-ghost text-red-500"}`}
                    onClick={() => alternarBloqueio(l)}
                  >
                    {l.bloqueada ? (
                      <>
                        <Unlock size={14} /> Desbloquear
                      </>
                    ) : (
                      <>
                        <Ban size={14} /> Bloquear
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ---------- Por que o teste não fechou ---------- */}
      <Modal
        open={!!motivo}
        onClose={() => setMotivo(null)}
        title={motivo?.encerrando ? "Encerrar o teste hoje" : "Por que não fechou?"}
        footer={
          <button className="btn-secondary" onClick={() => setMotivo(null)}>
            Cancelar
          </button>
        }
      >
        <p className="mb-4 text-sm text-slate-500">
          {motivo?.encerrando ? (
            <>
              <b>{txt(motivo?.loja.nome)}</b> para de cadastrar coisa nova.
              Continua consultando, imprimindo e exportando tudo — nenhum dado é
              apagado, e dá para voltar atrás com o +7.
              <br />
              <br />
              Marque o motivo. É ele que, somado com os outros, diz se o que
              falta é preço ou é uma tela.
            </>
          ) : (
            <>
              O motivo quase nunca aparece na hora em que o teste acaba: aparece
              no telefonema, três dias depois. Anote aqui quando souber.
            </>
          )}
        </p>
        <div className="grid gap-2">
          {MOTIVOS_TESTE.map((m) => (
            <button
              key={m.k}
              className="btn-secondary justify-start !py-2.5 text-sm"
              onClick={() => gravarMotivo(m.k)}
            >
              {m.nome}
            </button>
          ))}
        </div>
        {motivo?.encerrando && (
          <button
            className="btn-ghost mt-3 w-full text-xs text-slate-400"
            onClick={() => gravarMotivo("")}
          >
            Encerrar sem dizer o motivo
          </button>
        )}
      </Modal>

      {/* ---------- Convidar uma loja nova ---------- */}
      <Modal
        open={!!convite}
        onClose={() => setConvite(null)}
        title="Convidar loja nova"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setConvite(null)}>
              Fechar
            </button>
            <button className="btn-primary" onClick={gerarConvite} disabled={convite?.gerando}>
              <Ticket size={16} /> {convite?.gerando ? "Gerando..." : "Gerar link"}
            </button>
          </>
        }
      >
        <p className="mb-4 text-sm text-slate-500">
          A pessoa abre o link, cria a senha dela e já entra com{" "}
          <b>{cfg.dias_teste ?? 7} dias de teste</b> correndo. É o que permite
          vender enquanto você atende o balcão.
        </p>
        <Field label="Nome da loja (opcional)">
          <input
            className="input"
            autoFocus
            placeholder="Mercearia da Ana"
            value={convite?.nome || ""}
            onChange={(e) => convite && setConvite({ ...convite, nome: e.target.value, link: "" })}
            onKeyDown={(e) => e.key === "Enter" && gerarConvite()}
          />
        </Field>

        {convite?.link && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-sm font-semibold text-emerald-800">Link pronto</p>
            <p className="mt-1 break-all rounded bg-white p-2 text-xs text-slate-600">
              {convite.link}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                className="btn-secondary !py-1.5 text-xs"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(convite.link);
                    aviso.sucesso("Link copiado.");
                  } catch {
                    aviso.alerta("Não consegui copiar. Selecione o texto e copie na mão.");
                  }
                }}
              >
                <Copy size={14} /> Copiar
              </button>
              <button
                className="btn-success !py-1.5 text-xs"
                onClick={() =>
                  abrirWhatsapp(
                    "",
                    // Sem emoji: em alguns aparelhos chegam como "?" e sujam o recado.
                    `Oi! Segue o acesso ao sistema${convite.nome ? ` da ${convite.nome}` : ""}:\n\n` +
                      `${convite.link}\n\n` +
                      `Voce abre, cria a sua senha e ja entra com ${cfg.dias_teste ?? 7} ` +
                      "dias para testar, sem pagar nada e sem cadastrar cartao.\n\n" +
                      "Qualquer duvida e so me chamar."
                  )
                }
              >
                <MessageCircle size={14} /> Enviar no WhatsApp
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ---------- Liberar senha de uma loja ---------- */}
      <Modal
        open={!!senha}
        onClose={() => setSenha(null)}
        title="Liberar troca de senha"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setSenha(null)}>
              Fechar
            </button>
            <button className="btn-primary" onClick={gerarSenha} disabled={senha?.gerando}>
              <KeyRound size={16} /> {senha?.gerando ? "Gerando..." : "Gerar link"}
            </button>
          </>
        }
      >
        <p className="mb-4 text-sm text-slate-500">
          Para quando a loja perdeu a senha e o e-mail de recuperação não chega.
          O link é do próprio Supabase, vale uma vez só e expira em 1 hora.
          Mande pelo WhatsApp e confirme com quem pediu antes — quem tem o link
          entra na conta.
        </p>
        <Field label="E-mail da conta">
          <input
            className="input"
            type="email"
            autoFocus
            placeholder="loja@exemplo.com"
            value={senha?.email || ""}
            onChange={(e) => senha && setSenha({ ...senha, email: e.target.value, link: "" })}
            onKeyDown={(e) => e.key === "Enter" && gerarSenha()}
          />
        </Field>

        {senha?.link && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-sm font-semibold text-emerald-800">Link pronto</p>
            <p className="mt-1 break-all rounded bg-white p-2 text-xs text-slate-600">
              {senha.link}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                className="btn-secondary !py-1.5 text-xs"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(senha.link);
                    aviso.sucesso("Link copiado.");
                  } catch {
                    aviso.alerta("Não consegui copiar. Selecione o texto e copie na mão.");
                  }
                }}
              >
                <Copy size={14} /> Copiar
              </button>
              <button
                className="btn-success !py-1.5 text-xs"
                onClick={() =>
                  abrirWhatsapp(
                    "",
                    `Link para você criar uma senha nova no Sistema TI:\n\n${senha.link}\n\n` +
                      "Vale uma vez só e expira em 1 hora. Não repasse para ninguém."
                  )
                }
              >
                <MessageCircle size={14} /> Enviar no WhatsApp
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ---------- Ajustes do sistema ---------- */}
      <Modal
        open={ajustes}
        onClose={() => setAjustes(false)}
        title="Ajustes do sistema"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setAjustes(false)}>
              Cancelar
            </button>
            <button className="btn-primary" onClick={salvarAjustes}>
              <Save size={16} /> Salvar
            </button>
          </>
        }
      >
        <p className="mb-4 text-sm text-slate-500">
          É isto que as lojas veem na tela de assinatura quando precisam pagar.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Chave Pix" className="sm:col-span-2">
            <input
              className="input"
              placeholder="CPF, CNPJ, telefone, e-mail ou aleatória"
              value={cfg.chave_pix || ""}
              onChange={(e) => setCfg({ ...cfg, chave_pix: e.target.value })}
            />
          </Field>
          <Field label="Titular da chave">
            <input
              className="input"
              value={cfg.titular_pix || ""}
              onChange={(e) => setCfg({ ...cfg, titular_pix: e.target.value })}
            />
          </Field>
          <Field label="WhatsApp para comprovante">
            <input
              className="input"
              placeholder="(11) 99999-9999"
              value={cfg.whatsapp_suporte || ""}
              onChange={(e) => setCfg({ ...cfg, whatsapp_suporte: e.target.value })}
            />
          </Field>
          <Field label="Valor mensal padrão (R$)">
            <InputNumero
              className="input"
              value={cfg.valor_padrao ?? 79}
              onChange={(v) => setCfg({ ...cfg, valor_padrao: (v ?? 0) })}
            />
          </Field>
          <Field label="Dias de teste grátis">
            <InputNumero
              className="input"
              value={cfg.dias_teste ?? 7}
              onChange={(v) => setCfg({ ...cfg, dias_teste: (v ?? 0) })}
            />
          </Field>
          <Field label="Dias ao reabrir um teste">
            <InputNumero
              className="input"
              value={cfg.dias_reteste ?? 3}
              onChange={(v) => setCfg({ ...cfg, dias_reteste: (v ?? 0) })}
            />
            <p className="mt-1 text-xs text-slate-400">
              Para quem já testou e volta pedindo de novo. Menor de propósito:
              quem volta já conhece o sistema.
            </p>
          </Field>
          <Field label="Dias de tolerância após vencer" className="sm:col-span-2">
            <InputNumero
              className="input"
              value={cfg.dias_tolerancia ?? 5}
              onChange={(v) => setCfg({ ...cfg, dias_tolerancia: (v ?? 0) })}
            />
            <p className="mt-1 text-xs text-slate-400">
              Passado este prazo, a loja continua consultando e imprimindo, mas
              não cadastra nada novo até acertar.
            </p>
          </Field>
          {/*
            A tolerância existe para o cliente de dois anos que esqueceu o Pix.
            Quem está em teste não tem essa história: 7 dias combinados mais 5
            de tolerância viram 12 sem ninguém ter decidido isso.
          */}
          <Field label="A tolerância vale durante o teste?" className="sm:col-span-2">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  [false, `Não — o teste acaba no dia (${cfg.dias_teste ?? 7} dias)`],
                  [
                    true,
                    `Sim — teste ganha os ${cfg.dias_tolerancia ?? 5} dias a mais`,
                  ],
                ] as const
              ).map(([v, nome]) => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => setCfg({ ...cfg, tolerancia_no_teste: v })}
                  className={`chip text-sm ${
                    !!cfg.tolerancia_no_teste === v
                      ? "bg-brand-600 text-white"
                      : "bg-white text-slate-600 ring-1 ring-slate-200"
                  }`}
                >
                  {nome}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              A trava vale no banco, não só aqui. Em qualquer um dos dois a
              loja continua consultando, imprimindo e exportando tudo.
            </p>
          </Field>
        </div>
      </Modal>
    </div>
  );
};
