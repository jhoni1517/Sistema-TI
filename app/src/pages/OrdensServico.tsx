import React, { useEffect, useMemo, useState } from "react";
import { aviso } from "../components/Aviso";
import QRCode from "qrcode";
import {
  Plus,
  Search,
  Wrench,
  Eye,
  Pencil,
  Trash2,
  MessageCircle,
  Printer,
  Smartphone,
  KeyRound,
  Trash,
  DollarSign,
  HandCoins,
  Link as LinkIcon,
  AlertTriangle,
  Clock,
  History,
  EyeOff,
  ShieldAlert,
  ShieldCheck,
  Camera,
  Video,
  Play,
  FileText,
} from "lucide-react";
import { useApp } from "../store/AppStore";
import { Modal, Field, EmptyState, SectionTitle, InputNumero } from "../components/ui";
import { PatternLock } from "../components/PatternLock";
import { FotosAparelho } from "../components/FotosAparelho";
import { printHTML } from "../lib/print";
import { obterLoja } from "../lib/db";
import { linkDeRastreio } from "../lib/rastreio";
import { registrarAcessoSigilo } from "../lib/auth";
import { estadoDoSigilo, recadoDoSigilo, podeEditarSigilo } from "../lib/sigilo";
import {
  temRecurso,
  vocabulario,
  aparelhosDoRamo,
  checklistDoRamo,
} from "../lib/ramos";
import { fotosParaOCliente, videosParaOCliente } from "../lib/fotos-laudo";
import { VideosAparelho } from "../components/VideosAparelho";
import { duracaoEscrita } from "../lib/video";
import { reciboOS } from "../lib/recibo";
import { mensagemCliente } from "../lib/mensagens";
import { uid, nowISO, brl, abrirWhatsapp, formatDateTime, codigoOS, txt } from "../lib/format";
import {
  totalOS,
  totalPecas,
  custoPecas,
  lucroOS,
  diasEmPosse,
  taxaArmazenamento,
  totalDaEntrega,
  faixaOS,
  totalComOpcao,
  custoComOpcao,
} from "../lib/calc";
import {
  opcaoDaPeca,
  nomesDasOpcoes,
  opcaoAtual,
  escolhaConfirmada,
  comOpcao,
  proximoNomeDeOpcao,
  renomearOpcao,
  removerOpcao,
  juntarEmUmOrcamento,
  pecasEfetivas,
  paraDuasOpcoes,
  itensRepetidos,
} from "../lib/orcamento";
import {
  OS_STATUS_META,
  CLASSIFICACAO_META,
  BACKUP_META,
  type BackupOS,
  type Cliente,
  type OrdemServico,
  type OSStatus,
  type PecaOS,
  type FormaPagamento,
  type Config,
  type Produto,
} from "../lib/types";
import {
  separarOS,
  documentoDaPeca,
  ladoTemNota,
  problemaDoLado,
  pagamentosDaOS,
  pedidoDoServicoDaOS,
  pedidoDaMercadoriaDaOS,
  type LadoDaNota,
} from "../lib/nota-os";
import {
  notaDaOS,
  notaPendenteDaOS,
  empurrarFilaDeNotas,
  precisaDeAtencao,
} from "../lib/nota";
import { DOCUMENTO_META, SITUACAO_NOTA_META } from "../lib/fiscal";
import { supabase } from "../lib/supabase";
import { produtosParaOS, normalizar } from "../lib/busca";
import {
  consolidar,
  faltaNoPagamento,
  trocoDoPagamento,
  FORMAS_DE_COMPRA,
  type Parcela,
} from "../lib/pagamento";
import { travaAtendimento, classificacaoDe, travaFiado } from "../lib/clientes";
import {
  contaDaOS,
  problemaNaEntradaDaOS,
  recebidoDaOS,
  faltaNaOS,
  entregaOAparelho,
  DESTINO_META,
  type DestinoDoResto,
} from "../lib/os-pagamento";
import { backupDe, avisoDeBackup, perguntaAntesDeConcluir } from "../lib/backup";
import { saldosApos } from "../lib/estoque";
import { proximoNumero as proximoNum, problemaParaNumerar } from "../lib/numeracao";
import { aoApagarOrdem, textoDaConfirmacao } from "../lib/exclusao";
import {
  garantiaDaOS,
  GARANTIA_META,
  textoDaGarantia,
  garantiasVencendo,
} from "../lib/garantia";


const STATUS_LIST = Object.keys(OS_STATUS_META) as OSStatus[];

/**
 * O seletor de forma de pagamento da OS.
 *
 * Aparece em três lugares desta tela — receber, registrar a entrega que
 * ficou sem lançamento, e cada linha da divisão. A lista vinha escrita à mão
 * nos dois primeiros; agora é a mesma de lib/pagamento.ts, que o PDV, a
 * comanda e as telas de compra também usam.
 */
const SeletorDeForma: React.FC<{
  forma: FormaPagamento;
  onForma: (f: FormaPagamento) => void;
}> = ({ forma, onForma }) => (
  <select
    className="input !w-auto !py-1.5 text-sm"
    value={forma}
    onChange={(e) => onForma(e.target.value as FormaPagamento)}
  >
    {FORMAS_DE_COMPRA.map((f) => (
      <option key={f.k} value={f.k}>
        {f.nome}
      </option>
    ))}
  </select>
);

const novaOS = (numero: number): OrdemServico => ({
  id: uid(),
  numero,
  clienteId: "",
  tipoAparelho: "Celular",
  marca: "",
  modelo: "",
  cor: "",
  imeiSerial: "",
  senhaAparelho: "",
  padraoDesbloqueio: "",
  contaVinculada: "",
  acessorios: "",
  defeitoRelatado: "",
  defeitoConstatado: "",
  checklist: {},
  pecas: [],
  maoDeObra: 0,
  desconto: 0,
  status: "aberta",
  tecnico: "",
  garantiaDias: 90,
  historico: [{ data: nowISO(), status: "aberta" }],
  observacoes: "",
  criadoEm: nowISO(),
  atualizadoEm: nowISO(),
});

export const OrdensServico: React.FC = () => {
  const { ordens, clientes, produtos, sessoes, movimentos, fiados, config, fontesComFalha, saveOrdem, removeOrdem, saveMovimento, saveProduto, saveFiado } = useApp();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<OSStatus | "todas" | "abertas">("abertas");
  const [editando, setEditando] = useState<OrdemServico | null>(null);
  const [detalhe, setDetalhe] = useState<OrdemServico | null>(null);
  /**
   * Clique duplo no balcão acontece o tempo todo.
   *
   * Receber duas vezes lançava a receita duas vezes E baixava as peças duas
   * vezes; fiado duas vezes fazia o cliente dever o dobro, com o robô de
   * cobrança indo atrás do valor errado. A conferência não pega nenhum dos
   * dois: ela procura OS entregue SEM lançamento, não com dois.
   */
  const [registrando, setRegistrando] = useState(false);

  const nomeCliente = (id: string) => clientes.find((c) => c.id === id)?.nome || "—";
  const cliente = (id: string) => clientes.find((c) => c.id === id);

  const proximoNumero = useMemo(() => proximoNum(ordens), [ordens]);

  /**
   * Mesmo aparelho? Serve para mostrar o historico de consertos daquele IMEI.
   * IMEI vazio nunca casa com nada: senao TODA OS sem IMEI viraria historico
   * de todas as outras.
   */
  const mesmoImei = (a?: string, b?: string): boolean =>
    // texto-cru-proposital: IMEI e numero e letra, nao tem acento
    !!a?.trim() && a.trim().toLowerCase() === (b || "").trim().toLowerCase();

  const lista = useMemo(() => {
    const b = normalizar(busca);
    return [...ordens]
      .filter((o) => {
        if (filtro === "abertas") return !["entregue", "cancelada"].includes(o.status);
        if (filtro !== "todas") return o.status === filtro;
        return true;
      })
      .filter((o) => {
        // busca em cliente, código, aparelho e IMEI (tolerante a campos vazios)
        const alvo = normalizar(
          [nomeCliente(o.clienteId), codigoOS(o.numero), o.marca, o.modelo, o.imeiSerial]
            .map(txt)
            .join(" ")
        );
        return alvo.includes(b);
      })
      .sort((a, b) => (b.numero || 0) - (a.numero || 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordens, busca, filtro, clientes]);

  const salvar = async () => {
    if (!editando) return;
    if (!editando.clienteId) return aviso.alerta("Selecione o cliente.");
    if (!editando.defeitoRelatado.trim()) return aviso.alerta("Descreva o defeito relatado.");

    // Cliente bloqueado só passa com autorização explícita, e só na abertura:
    // OS que já está na bancada precisa continuar editável, senão o aparelho
    // do cara fica preso num sistema que não deixa mexer.
    const nova = !ordens.some((o) => o.id === editando.id);
    const trava = travaAtendimento(cliente(editando.clienteId));
    if (nova && trava.bloqueia) {
      const ok = confirm(
        `${trava.titulo}\n\nMotivo: ${trava.motivo}\n\nAbrir a OS mesmo assim?`
      );
      if (!ok) return;
    }

    try {
      await saveOrdem({ ...editando, atualizadoEm: nowISO() });
    } catch (e) {
      // Sem isto a janela fechava como se tivesse gravado. Coluna faltando
      // ou assinatura vencida derrubam a gravação em silêncio, e a OS que o
      // cliente acabou de abrir simplesmente não existe.
      return aviso.erro(
        "Não foi possível salvar a OS:\n\n" + (e instanceof Error ? e.message : String(e))
      );
    }
    if (nova && trava.avisa) {
      aviso.alerta(`${trava.titulo}. Motivo: ${trava.motivo}`);
    }
    setEditando(null);
  };

  /**
   * Depois que o aparelho sai da loja, guardar a senha dele só gera risco.
   * O melhor dado é o que não existe mais.
   */
  const semSigilo = (): Partial<OrdemServico> =>
    config.limparSenhaNaEntrega === false
      ? {}
      : { senhaAparelho: "", padraoDesbloqueio: "", contaVinculada: "" };

  const mudarStatus = async (o: OrdemServico, status: OSStatus) => {
    // Marcar "Entregue" no seletor pulava o caixa E o estoque: o aparelho
    // saía da loja e nada era registrado. A entrega tem que passar por
    // Receber ou Fiado, que é onde o dinheiro e a baixa acontecem.
    if (status === "entregue" && o.status !== "entregue") {
      return aviso.alerta(
        "Para entregar, use o botão Receber (dinheiro entra no caixa) ou Fiado " +
          "(fica em A Receber). Assim o estoque baixa e o valor é registrado."
      );
    }
    /*
     * A cobrança do backup vem AQUI, e não na entrega.
     *
     * Perguntar sobre backup com o aparelho já formatado não serve para
     * nada. "Pronta" é o último momento em que ainda dá para voltar.
     */
    if (status === "pronta") {
      const pergunta = perguntaAntesDeConcluir(o);
      if (pergunta && !confirm(pergunta)) return;
    }
    const atualizado: OrdemServico = {
      ...o,
      ...(status === "entregue" ? semSigilo() : {}),
      status,
      // marca quando ficou pronta — base para a taxa de armazenamento
      prontaEm: status === "pronta" ? o.prontaEm || nowISO() : o.prontaEm,
      atualizadoEm: nowISO(),
      historico: [...o.historico, { data: nowISO(), status }],
    };
    try {
      await saveOrdem(atualizado);
    } catch (e) {
      return aviso.erro(
        "Não foi possível mudar o status:\n\n" + (e instanceof Error ? e.message : String(e))
      );
    }
    setDetalhe(atualizado);
  };

  /**
   * Baixa o estoque das peças da OS e marca como entregue.
   *
   * A peça só baixava quando tinha sido escolhida na lista de produtos. Quem
   * digitava o nome à mão via a OS fechar com o estoque intacto, sem aviso
   * nenhum. Agora casamos também pelo nome, e o que não der para casar é
   * informado em vez de sumir em silêncio.
   */
  const baixarEstoqueEEntregar = async (o: OrdemServico) => {
    // erro-tratado-por-quem-chama: só roda dentro do try de onReceber e de
    // onFiado, que são quem sabe se o dinheiro já entrou e o que dizer.
    const semVinculo: string[] = [];

    // Só a alternativa escolhida sai da prateleira. Baixar as duas fontes
    // deixaria uma delas sumida do estoque sem nunca ter sido vendida.
    // Primeiro resolve cada peça no estoque, depois grava. Descontar dentro
    // do laço lia sempre o saldo velho da tela: a mesma peça em duas linhas
    // (uma digitada, outra escolhida da lista) descia uma vez só.
    const aBaixar: { produtoId: string; quantidade: number }[] = [];
    for (const p of pecasEfetivas(o)) {
      // Sem acento dos dois lados: a peça digitada como "fonte 500w acucar"
      // não pode deixar de casar com o cadastro só pela cedilha. Sem casar,
      // ela cai em semVinculo e o estoque nunca desce.
      const nome = normalizar(p.descricao);
      const prod =
        (p.produtoId && produtos.find((x) => x.id === p.produtoId)) ||
        (nome ? produtos.find((x) => normalizar(x.nome) === nome) : undefined);

      if (!prod) {
        if (nome) semVinculo.push(txt(p.descricao));
        continue;
      }
      aBaixar.push({ produtoId: prod.id, quantidade: Number(p.quantidade) || 0 });
    }
    for (const { produto, quantidade } of saldosApos(aBaixar, produtos)) {
      await saveProduto({ ...produto, quantidade });
    }

    if (semVinculo.length > 0) {
      aviso.alerta(
        `Estas peças não existem no estoque e não foram baixadas: ${semVinculo.join(", ")}. ` +
          "Cadastre-as no estoque para o controle ficar certo."
      );
    }
    await saveOrdem({
      ...o,
      ...semSigilo(),
      status: "entregue",
      entregueEm: nowISO(),
      atualizadoEm: nowISO(),
      historico: [...o.historico, { data: nowISO(), status: "entregue" }],
    });
  };

  /**
   * OS entregue sem nenhum lançamento de dinheiro.
   *
   * Fica visível já na lista porque o caminho errado (salvar a OS achando
   * que isso conclui a venda) é fácil demais de tomar — e o prejuízo só
   * aparece no fechamento do mês, quando ninguém lembra mais.
   */
  const semPagamento = (o: OrdemServico): boolean =>
    o.status === "entregue" &&
    !movimentos.some((m) => m.osId === o.id) &&
    !fiados.some((f) => f.osId === o.id);

  /**
   * Cobrar sem saber qual orçamento o cliente aceitou é cobrar pela sugestão
   * da loja. Pergunta em vez de assumir: quem está no balcão sabe a resposta,
   * e o erro só apareceria no fechamento do mês.
   */
  const escolhaPendente = (o: OrdemServico): boolean => {
    if (escolhaConfirmada(o)) return false;
    return !confirm(
      `O cliente não registrou qual opção quer.\n\n` +
        `Cobrar pela opção "${opcaoAtual(o)}" (${brl(totalOS(o))})?\n\n` +
        "Cancelar para editar a OS e marcar a opção certa."
    );
  };

  /**
   * Quanto cobrar nesta entrega, e a decisão sobre a taxa de guarda.
   *
   * A taxa aparecia em vermelho na lista e no detalhe, e o recibo assinado
   * prometia que ela seria cobrada — mas a cobrança usava só `totalOS`. O
   * aparelho abandonado por seis meses saía de graça com o aviso vermelho na
   * tela do dono.
   *
   * Pergunta em vez de somar sozinho: perdoar a guarda para não perder o
   * cliente é comum, e o cliente está na frente. Devolve `null` quando a
   * pessoa fechou a pergunta para pensar.
   */
  const guardaDaEntrega = (o: OrdemServico): number => {
    const t = taxaArmazenamento(o, config.taxaArmazenamentoDia || 0, config.diasAbandono || 90);
    if (!(t.valor > 0)) return 0;
    return confirm(
      `Cobrar a taxa de guarda de ${brl(t.valor)}?\n\n` +
        `${t.diasExcedidos} dia(s) além do prazo de ${config.diasAbandono || 90} dias, ` +
        `a ${brl(config.taxaArmazenamentoDia || 0)} por dia.\n\n` +
        `OK = cobra ${brl(totalOS(o) + t.valor)} no total.\n` +
        `Cancelar = cobra só o serviço, ${brl(totalOS(o))}.`
    )
      ? t.valor
      : 0;
  };

  const avisarCliente = (o: OrdemServico) => {
    const c = cliente(o.clienteId);
    if (!txt(c?.telefone)) return aviso.alerta("Cliente sem telefone cadastrado.");
    // O link leva o segredo da ordem. Sem ele, quem recebe troca o número e
    // lê a fila inteira da loja. Ver lib/rastreio.ts.
    const link = linkDeRastreio(
      `${window.location.origin}${window.location.pathname}`,
      obterLoja(),
      o
    ) || undefined;
    abrirWhatsapp(txt(c?.telefone), mensagemCliente(o, c, config, link));
  };

  return (
    <div>
      <SectionTitle
        title="Ordens de Serviço"
        subtitle={`${ordens.length} no total`}
        action={
          <button
            className="btn-primary"
            onClick={() => {
              /*
               * Com a lista de ordens quebrada, a próxima nasce OS00001 e
               * colide com a primeira da loja. E o rastreio público procura
               * PELO NÚMERO: o cliente abriria o link e veria o conserto de
               * outra pessoa, com nome e valor.
               */
              const semNumero = problemaParaNumerar(fontesComFalha, "ordens", "uma ordem de serviço");
              if (semNumero) return aviso.erro(semNumero);
              setEditando(novaOS(proximoNumero));
            }}
          >
            <Plus size={18} /> Nova OS
          </button>
        }
      />

      {/* Garantia vencendo: "sua garantia vence semana que vem, quer que a
          gente dê uma olhada?" custa uma mensagem e evita o retorno bravo no
          dia 91. A função existia e não estava em tela nenhuma. */}
      {(() => {
        const vencendo = garantiasVencendo(ordens, 7);
        if (vencendo.length === 0) return null;
        return (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="flex items-center gap-2 text-sm font-bold text-emerald-800">
              <ShieldCheck size={16} /> {vencendo.length} garantia(s) vencendo nesta semana
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {vencendo.slice(0, 8).map(({ os: o, garantia }) => (
                <button
                  key={o.id}
                  onClick={() => setDetalhe(o)}
                  className="badge bg-emerald-100 text-emerald-800 hover:opacity-80"
                >
                  {codigoOS(o.numero)} · {nomeCliente(o.clienteId)} · {garantia.diasRestantes}d
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-emerald-700">
              Chamar antes custa uma mensagem e evita o retorno bravo no dia 91.
            </p>
          </div>
        );
      })()}

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(["abertas", "todas", ...STATUS_LIST] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`chip text-xs capitalize ${
              filtro === f
                ? "bg-brand-600 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {f === "abertas" ? "Em aberto" : f === "todas" ? "Todas" : OS_STATUS_META[f as OSStatus].label}
          </button>
        ))}
      </div>

      <div className="relative mb-4 max-w-md">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className="input pl-10"
          placeholder="Buscar por cliente, código ou aparelho..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {lista.length === 0 ? (
        <EmptyState icon={<Wrench size={48} />} title="Nenhuma ordem de serviço" hint="Clique em 'Nova OS' para começar." />
      ) : (
        <div className="space-y-3">
          {lista.map((o) => (
            <div key={o.id} className="card linha-card">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Smartphone size={22} />
              </div>
              <div className="linha-card-info">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold text-slate-400">{codigoOS(o.numero)}</span>
                  <span className={`badge ${OS_STATUS_META[o.status].color}`}>{OS_STATUS_META[o.status].label}</span>
                  {(() => {
                    // "Esse conserto ainda está na garantia?" chega toda
                    // semana. A resposta estava em duas telas mais uma conta
                    // de cabeça — e errar custa dos dois lados.
                    const g = garantiaDaOS(o);
                    if (g.situacao !== "valida") return null;
                    return (
                      <span
                        className={`badge ${GARANTIA_META.valida.cor}`}
                        title={`Garantia até ${g.ate.split("-").reverse().join("/")}`}
                      >
                        <ShieldCheck size={11} /> Garantia {g.diasRestantes}d
                      </span>
                    );
                  })()}
                  {semPagamento(o) && (
                    <button
                      className="badge bg-amber-100 text-amber-800 hover:bg-amber-200"
                      onClick={() => setDetalhe(o)}
                      title="Nada foi lançado no caixa para esta OS"
                    >
                      <AlertTriangle size={12} /> Sem pagamento — receber
                    </button>
                  )}
                  {(() => {
                    const dias = diasEmPosse(o);
                    const t = taxaArmazenamento(o, config.taxaArmazenamentoDia || 0, config.diasAbandono || 90);
                    if (t.valor > 0)
                      return (
                        <span className="badge bg-red-100 text-red-700" title={`${t.diasExcedidos} dia(s) além do prazo`}>
                          <AlertTriangle size={11} /> Guarda {brl(t.valor)}
                        </span>
                      );
                    if (dias >= 15)
                      return (
                        <span className="badge bg-amber-100 text-amber-700" title="Aparelho parado há muito tempo">
                          <Clock size={11} /> {dias} dias
                        </span>
                      );
                    return null;
                  })()}
                </div>
                {/* O `truncate` tem que ficar no TEXTO, não no `p`: num
                    contêiner flex ele não corta nada, e o nome comprido
                    quebrava em pedaços de duas letras por linha. */}
                <p className="flex items-center gap-1.5 font-bold text-slate-800">
                  <span className="truncate">{nomeCliente(o.clienteId)}</span>
                  {classificacaoDe(cliente(o.clienteId)) !== "normal" && (
                    <span
                      className={`badge shrink-0 ${
                        CLASSIFICACAO_META[classificacaoDe(cliente(o.clienteId))].cor
                      }`}
                      title={txt(cliente(o.clienteId)?.motivoClassificacao)}
                    >
                      <ShieldAlert size={11} />
                      {CLASSIFICACAO_META[classificacaoDe(cliente(o.clienteId))].label}
                    </span>
                  )}
                </p>
                <p className="truncate text-sm text-slate-500">
                  {o.marca} {o.modelo} · {o.defeitoRelatado}
                </p>
              </div>
              <div className="linha-card-fim text-right">
                <p className="font-bold text-slate-800">{brl(totalOS(o))}</p>
                {/*
                  O SINAL PRECISA APARECER AQUI.

                  Sem esta linha o sinal seria invisível: a OS ficaria com
                  cara de intocada, ninguém cobraria o resto, e o dinheiro
                  que já entrou não bateria com nada. É o mesmo erro que o
                  caderno do balcão comete.

                  Só aparece quando há sinal E ainda falta — OS paga por
                  inteiro e OS sem nenhum pagamento não têm o que dizer aqui.
                */}
                {(() => {
                  const recebido = recebidoDaOS(movimentos, o.id);
                  const resta = faltaNaOS(totalOS(o), movimentos, o.id);
                  if (recebido <= 0 || resta <= 0) return null;
                  return (
                    <p className="text-xs font-semibold text-amber-700">
                      Sinal de {brl(recebido)} · faltam {brl(resta)}
                    </p>
                  );
                })()}
                <p className="text-xs text-slate-400">{formatDateTime(o.atualizadoEm)}</p>
              </div>
              <div className="linha-card-fim ml-auto flex gap-1.5">
                <button className="btn-ghost !p-2" title="Detalhes" onClick={() => setDetalhe(o)}>
                  <Eye size={16} />
                </button>
                <button className="btn-ghost !p-2" title="Avisar cliente" onClick={() => avisarCliente(o)}>
                  <MessageCircle size={16} className="text-emerald-600" />
                </button>
                <button className="btn-ghost !p-2" title="Editar" onClick={() => setEditando(o)}>
                  <Pencil size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL FORM */}
      {editando && (
        <OSForm
          os={editando}
          setOs={setEditando}
          clientes={clientes}
          produtos={produtos}
          onSave={salvar}
          onClose={() => setEditando(null)}
        />
      )}

      {/* MODAL DETALHE */}
      {detalhe && (
        <OSDetalhe
          os={detalhe}
          clienteNome={nomeCliente(detalhe.clienteId)}
          cliente={cliente(detalhe.clienteId)}
          config={config}
          pagamentoRegistrado={
            movimentos.some((m) => m.osId === detalhe.id) ||
            fiados.some((f) => f.osId === detalhe.id)
          }
          historicoAparelho={
            detalhe.imeiSerial?.trim()
              ? ordens.filter(
                  (x) => x.id !== detalhe.id && mesmoImei(x.imeiSerial, detalhe.imeiSerial)
                )
              : []
          }
          onClose={() => setDetalhe(null)}
          onStatus={(s) => mudarStatus(detalhe, s)}
          onAvisar={() => avisarCliente(detalhe)}
          onEditar={() => {
            setEditando(detalhe);
            setDetalhe(null);
          }}
          onExcluir={async () => {
            // Com dinheiro lançado, apagar deixa a entrada do caixa apontando
            // para uma OS que não existe — e o mês fecha com receita sem
            // origem, que ninguém consegue explicar depois.
            const r = aoApagarOrdem(detalhe, { movimentos, fiados });
            if (!r.pode) {
              return aviso.alerta(
                `${r.titulo}\n\n${r.perdas.map((p) => `- ${p}`).join("\n")}\n\n${r.saida}`
              );
            }
            if (!confirm(textoDaConfirmacao(r))) return;
            try {
              await removeOrdem(detalhe.id);
            } catch (e) {
              // A janela fechava como se tivesse apagado. Assinatura vencida
              // ou permissão derrubam a exclusão em silêncio, e a OS volta
              // na próxima carga.
              return aviso.erro(
                "Não foi possível excluir a OS:\n\n" +
                  (e instanceof Error ? e.message : String(e))
              );
            }
            setDetalhe(null);
          }}
          onReceber={async (parcelas, destino) => {
            if (escolhaPendente(detalhe)) return;
            const guarda = guardaDaEntrega(detalhe);
            const valor = totalDaEntrega(detalhe, guarda);
            if (!(valor > 0)) {
              return aviso.alerta(
                "Esta OS está com valor zero. Informe a mão de obra ou as peças antes de receber."
              );
            }
            /*
             * O que já entrou por esta OS abate o de hoje.
             *
             * Sem isso, a segunda parcela de um sinal cobraria o total de
             * novo: R$ 1.100 no caixa por um serviço de R$ 800, e a sobra
             * aparecendo na conferência da gaveta dias depois, sem origem.
             */
            const jaRecebido = recebidoDaOS(movimentos, detalhe.id);
            /*
             * Já existe dinheiro lançado para esta OS?
             *
             * "Entregue" não pode ser marcado no seletor, mas SAIR dele pode
             * — e precisa poder: aparelho volta com defeito e a OS reabre.
             * Só que aí o bloco de "Receber e entregar" aparece de novo,
             * limpo, sem lembrar que a receita já entrou. Um clique lança o
             * valor cheio outra vez e desconta as mesmas peças de novo.
             *
             * Não bloqueia: cobrar de novo por um segundo serviço é
             * legítimo. Só não deixa acontecer sem ninguém decidir.
             */
            /*
             * Depois de o dinheiro entrar, "nada foi alterado" é mentira.
             *
             * A mensagem de erro dizia sempre "Nada foi alterado. Tente de
             * novo." Só que a ordem é dinheiro primeiro: quando a falha
             * acontece na baixa do estoque, o lançamento no caixa JÁ entrou.
             * Quem lê "tente de novo" tenta — e lança a receita duas vezes.
             */
            /*
             * A soma das formas tem que fechar EXATO com a entrega.
             *
             * Sem esta conferência, "R$ 300 no cartão" numa OS de R$ 250
             * lançaria R$ 300 no caixa por um serviço de R$ 250, e a sobra
             * apareceria na gaveta dias depois sem origem.
             */
            const formas = consolidar(parcelas);
            const problemaPag = problemaNaEntradaDaOS(valor, formas, jaRecebido);
            if (problemaPag) return aviso.alerta(problemaPag);

            /*
             * Faltar dinheiro virou PERGUNTA, e não mais recusa.
             *
             * Antes o sistema respondia "Faltam R$ 500 para fechar a venda"
             * e acabava ali. No balcão isso acontece o tempo todo, e o
             * atendente resolvia por fora, no caderno — que é onde o valor
             * some.
             *
             * As duas saídas não são a mesma coisa, e a diferença é o
             * APARELHO: no fiado ele sai hoje e vira dívida em A Receber; no
             * sinal ele fica na loja e a OS continua aberta. Ver
             * lib/os-pagamento.ts.
             */
            const conta = contaDaOS(valor, formas, jaRecebido);
            if (conta.situacao === "parcial" && !destino) {
              // A tela esconde o botão simples quando falta dinheiro, então
              // isto não acontece pela interface. Mas voltar em silêncio é a
              // pior resposta possível: quem clicou fica olhando uma janela
              // que não fez nada e clica de novo.
              return aviso.alerta(
                `Faltam ${brl(conta.falta)} para fechar. Escolha o que fazer com o resto: ` +
                  "levar e ficar devendo, ou deixar como sinal."
              );
            }
            const entrega = conta.situacao !== "parcial" || entregaOAparelho(destino!);

            /*
             * Fechar um SINAL não é receber duas vezes.
             *
             * O aviso abaixo existe para a OS que reabriu e voltou a mostrar
             * o botão de receber limpo. Mas depois do sinal a OS TEM
             * pagamento e ainda falta dinheiro — disparar aqui faria a
             * segunda parcela perguntar "é um serviço novo?" toda vez, e
             * pergunta que aparece sempre é pergunta que a pessoa aprende a
             * responder no automático.
             */
            const fechandoSinal = jaRecebido > 0 && jaRecebido < valor;
            if (!fechandoSinal && !semPagamento({ ...detalhe, status: "entregue" })) {
              const ok = confirm(
                `A ${codigoOS(detalhe.numero)} já tem pagamento registrado.\n\n` +
                  `Receber de novo lança mais ${brl(conta.agora)} no caixa e desconta as ` +
                  `peças do estoque outra vez.\n\nÉ um serviço novo?`
              );
              if (!ok) return;
            }

            if (registrando) return; // clique duplo no balcão acontece o tempo todo
            setRegistrando(true);
            let dinheiroEntrou = false;
            try {
              // O dinheiro ENTRA primeiro. Se a gravação falhar, o estoque não
              // é baixado — antes o erro sumia e sobrava aparelho entregue sem
              // lançamento nenhum no caixa.
              const sessaoAberta = sessoes.find((s) => !s.fechadoEm);
              /*
               * Um lançamento POR FORMA, igual ao PDV e à comanda.
               *
               * A OS era o último lugar do sistema que jogava tudo numa forma
               * só. Um conserto de R$ 800 pago metade no cartão e metade em
               * espécie virava R$ 800 no cartão: a gaveta acusava falta de
               * R$ 400 e a maquininha, sobra de R$ 400 — todo dia que
               * acontecesse, e sem origem rastreável.
               */
              const custo = custoPecas(detalhe);
              for (const [i, f] of formas.entries()) {
                await saveMovimento({
                  id: uid(),
                  tipo: "entrada" as const,
                  categoria: "OS",
                  descricao:
                    `${codigoOS(detalhe.numero)} - ${nomeCliente(detalhe.clienteId)}` +
                    // Sinal vai escrito no lançamento: no fechamento do mês
                    // uma OS de R$ 800 que entrou R$ 300 parece erro, e quem
                    // for conferir precisa ver o motivo na própria linha.
                    (!entrega ? " (sinal)" : "") +
                    // A guarda vai NOMEADA no lançamento: no fechamento do mês
                    // ninguém lembra por que aquela OS entrou mais cara.
                    (guarda > 0 ? ` (inclui guarda ${brl(guarda)})` : "") +
                    (formas.length > 1 ? ` - ${f.forma}` : ""),
                  valor: f.valor,
                  formaPagamento: f.forma,
                  osId: detalhe.id,
                  /*
                   * O custo vai INTEIRO no primeiro: dividir o CMV entre as
                   * formas de pagamento não significa nada.
                   *
                   * E só quando o aparelho SAI. O custo é da mercadoria que
                   * deixou a prateleira, e no sinal ela não deixou — lançar
                   * ali jogaria o custo inteiro contra um pedaço da receita
                   * e o mês fecharia com prejuízo num serviço lucrativo. É a
                   * mesma regra do "compra de estoque não é despesa".
                   */
                  custoRelacionado: entrega && i === 0 ? custo : 0,
                  // Sem isto, uma OS paga com o caixa aberto não entrava no
                  // fechamento daquela sessão e a conta do dia não batia.
                  sessaoId: sessaoAberta?.id,
                  data: nowISO(),
                });
              }
              dinheiroEntrou = true;

              /*
               * O resto vira dívida ANTES da baixa do estoque, pela mesma
               * razão de o dinheiro vir antes: falhando no meio, sobra uma
               * dívida sem baixa — que salta aos olhos na conferência. Ao
               * contrário, o aparelho sai e a dívida some, e dívida que some
               * ninguém procura.
               */
              if (conta.situacao === "parcial" && destino === "fiado") {
                await saveFiado({
                  id: uid(),
                  clienteId: detalhe.clienteId,
                  descricao:
                    `${codigoOS(detalhe.numero)} · ${detalhe.marca} ${detalhe.modelo}` +
                    ` (pagou ${brl(conta.agora)} de ${brl(valor)})`,
                  osId: detalhe.id,
                  valor: conta.falta,
                  pagamentos: [],
                  quitado: false,
                  criadoEm: nowISO(),
                });
              }

              if (entrega) {
                if (detalhe.status === "entregue") {
                  // OS já entregue: não dá para saber se a baixa foi feita, e
                  // descontar duas vezes estraga o estoque. Quem estava no
                  // balcão sabe a resposta — então perguntamos.
                  const baixar = confirm(
                    "Descontar as peças do estoque agora?\n\n" +
                      "OK = as peças ainda NÃO foram descontadas.\n" +
                      "Cancelar = o estoque já está certo."
                  );
                  if (baixar) await baixarEstoqueEEntregar(detalhe);
                } else {
                  await baixarEstoqueEEntregar(detalhe);
                }
              }

              setDetalhe(null);
              const troco = trocoDoPagamento(valor, formas);
              const recado = !entrega
                ? `${brl(conta.agora)} de sinal no caixa. Faltam ${brl(conta.falta)} — ` +
                  "o aparelho fica na loja até o cliente fechar."
                : conta.situacao === "parcial"
                  ? `${brl(conta.agora)} no caixa e ${brl(conta.falta)} lançados em ` +
                    "'A Receber'. O aparelho foi entregue."
                  : `${brl(conta.agora)} lançado no caixa.`;
              aviso.sucesso(recado + (troco > 0 ? ` Troco: ${brl(troco)}.` : ""));
            } catch (e) {
              aviso.erro(
                "Não foi possível concluir a entrega:\n\n" +
                  (e instanceof Error ? e.message : String(e)) +
                  "\n\n" +
                  (dinheiroEntrou
                    ? `ATENÇÃO: os ${brl(conta.agora)} JÁ entraram no caixa. NÃO receba de novo. ` +
                      "O que faltou foi a baixa das peças e a entrega — acerte em Estoque " +
                      "e mude o status da OS na mão."
                    : "Nada foi alterado. Tente de novo.")
              );
            } finally {
              setRegistrando(false);
            }
          }}
          onFiado={async () => {
            if (escolhaPendente(detalhe)) return;
            const guarda = guardaDaEntrega(detalhe);
            const aDever = totalDaEntrega(detalhe, guarda);
            // O teto do fiado é decisão do dono, tomada uma vez. Aqui ela só
            // é lembrada — quem está no balcão ainda pode autorizar, porque
            // sistema que não deixa fazer nada é contornado por fora.
            const teto = travaFiado(cliente(detalhe.clienteId), fiados, aDever);
            if (
              teto.estoura &&
              !confirm(`${teto.motivo}\n\nLançar em A Receber mesmo assim?`)
            ) {
              return;
            }
            if (!semPagamento({ ...detalhe, status: "entregue" })) {
              const ok = confirm(
                `A ${codigoOS(detalhe.numero)} já tem pagamento registrado.\n\n` +
                  "Lançar fiado agora cria uma segunda dívida para o cliente.\n\n" +
                  "É um serviço novo?"
              );
              if (!ok) return;
            }
            if (registrando) return; // dois cliques = o cliente devendo o dobro
            setRegistrando(true);
            let fiadoEntrou = false;
            try {
              await saveFiado({
                id: uid(),
                clienteId: detalhe.clienteId,
                descricao:
                  `${codigoOS(detalhe.numero)} · ${detalhe.marca} ${detalhe.modelo}` +
                  (guarda > 0 ? ` (inclui guarda ${brl(guarda)})` : ""),
                osId: detalhe.id,
                valor: aDever,
                pagamentos: [],
                quitado: false,
                criadoEm: nowISO(),
              });
              fiadoEntrou = true;
              await baixarEstoqueEEntregar(detalhe);
              setDetalhe(null);
              // Deixa explícito que NÃO entrou dinheiro: quem clica em fiado
              // sem querer estranha o caixa parado e acha que é defeito.
              aviso.sucesso(
                "OS entregue e lançada em 'A Receber'. O caixa NÃO foi movimentado — " +
                  "o valor entra quando o cliente pagar."
              );
            } catch (e) {
              aviso.erro(
                "Não foi possível concluir a entrega no fiado:\n\n" +
                  (e instanceof Error ? e.message : String(e)) +
                  "\n\n" +
                  (fiadoEntrou
                    ? "ATENÇÃO: a dívida JÁ foi lançada em A Receber. NÃO lance de novo. " +
                      "O que faltou foi a baixa das peças e a entrega."
                    : "Nada foi alterado. Tente de novo.")
              );
            } finally {
              setRegistrando(false);
            }
          }}
          registrando={registrando}
        />
      )}
    </div>
  );
};

// ============ FORMULÁRIO ============
const OSForm: React.FC<{
  os: OrdemServico;
  setOs: (o: OrdemServico) => void;
  clientes: Cliente[];
  /**
   * O produto inteiro, não só os quatro campos que a linha da peça copia.
   * A busca precisa do SKU e do código de barras, e a lista suspensa mostra
   * saldo e "serviço" — quem escolhe entre dois nomes parecidos decide por
   * esses dois dados.
   */
  produtos: Produto[];
  onSave: () => void;
  onClose: () => void;
}> = ({ os, setOs, clientes, produtos, onSave, onClose }) => {
  // O ramo vem do store, e não por prop: passar por parâmetro obrigaria a
  // mexer em toda chamada, e o que muda aqui é só qual campo aparece.
  const { ramo } = useApp();
  const voc = vocabulario(ramo);
  const trava = travaAtendimento(clientes.find((c) => c.id === os.clienteId));

  const addPeca = (opcao?: string) =>
    setOs({
      ...os,
      pecas: [
        ...os.pecas,
        { descricao: "", quantidade: 1, custoUnit: 0, precoUnit: 0, opcao },
      ],
    });
  const setPeca = (i: number, p: PecaOS) => {
    const n = [...os.pecas];
    n[i] = p;
    setOs({ ...os, pecas: n });
  };
  /**
   * Apaga a linha da peça — mas não deixa a OPÇÃO sumir junto.
   *
   * A opção só existe enquanto tem peça. Apagando a última, ela desaparecia
   * da tela sem ninguém pedir, e o próximo "adicionar" a trazia de volta com
   * outro número, embaralhando a lista. Relatado assim: "a 1 meio que sumiu e
   * virou 1 de novo a 2".
   *
   * Apagar a opção inteira tem botão próprio, com confirmação. O que a
   * lixeira da linha faz é apagar a linha: sobrando nenhuma, fica uma em
   * branco para digitar a próxima.
   */
  const delPeca = (i: number) => {
    const alvo = opcaoDaPeca(os.pecas[i]);
    const restam = os.pecas.filter((p, x) => x !== i && opcaoDaPeca(p) === alvo);
    const semEla = os.pecas.filter((_, x) => x !== i);
    setOs({
      ...os,
      pecas:
        alvo && restam.length === 0
          ? [...semEla, { descricao: "", quantidade: 1, custoUnit: 0, precoUnit: 0, opcao: alvo }]
          : semEla,
    });
  };

  const nomes = nomesDasOpcoes(os);
  /**
   * Um orçamento ou vários — a decisão que o atendente toma ANTES de digitar.
   *
   * Ela não é um campo gravado: é o próprio conteúdo da OS. Guardar um "modo"
   * separado das peças criaria a chance de os dois discordarem, e aí não dá
   * para saber qual dos dois está certo.
   */
  const varios = nomes.length > 0;
  const escolhida = opcaoAtual(os);
  const faixa = faixaOS(os);

  /** Começa a oferecer opções: duas, que é o mínimo para haver escolha */
  /*
   * O que já estava digitado vira a OPÇÃO 1, e não item comum.
   *
   * Antes ficava no balde comum, com a justificativa de poupar digitação. Na
   * OS00033 isso cobrou duas baterias e duas carcaças do cliente: a pessoa
   * montou a Opção 1 inteira, como qualquer um monta, e o comum entrou por
   * cima. Ver `paraDuasOpcoes` em lib/orcamento.ts.
   */
  const usarVariosOrcamentos = () => setOs(paraDuasOpcoes(os));

  const usarOrcamentoUnico = () => {
    if (
      varios &&
      !confirm(
        "Voltar para um orçamento só?\n\nAs peças das opções passam a somar todas juntas. Nenhuma peça é apagada."
      )
    )
      return;
    setOs(juntarEmUmOrcamento(os));
  };

  const addOpcao = () => addPeca(proximoNomeDeOpcao(os));

  const renomear = (nome: string) => {
    const novo = prompt("Nome desta opção (aparece para o cliente):", nome);
    if (novo === null) return;
    if (!novo.trim()) return aviso.alerta("A opção precisa de um nome.");
    if (novo.trim() !== nome && nomes.includes(novo.trim()))
      return aviso.alerta("Já existe uma opção com esse nome.");
    setOs(renomearOpcao(os, nome, novo));
  };

  const remover = (nome: string) => {
    if (!confirm(`Apagar a "${nome}" e as peças dela?`)) return;
    setOs(removerOpcao(os, nome));
  };

  const vincularProduto = (i: number, produtoId: string) => {
    const prod = produtos.find((p) => p.id === produtoId);
    if (!prod) return setPeca(i, { ...os.pecas[i], produtoId: undefined });
    setPeca(i, {
      ...os.pecas[i],
      produtoId: prod.id,
      descricao: prod.nome,
      precoUnit: prod.preco,
      custoUnit: prod.custo,
    });
  };

  /**
   * Uma linha de peça. Vira função porque a mesma linha aparece na lista
   * única e dentro de cada opção — duas cópias divergiriam na primeira
   * mudança de campo.
   */
  const linhaPeca = (p: PecaOS, i: number) => (
    <div key={i} className="grid grid-cols-12 items-end gap-2">
      <div className="col-span-12 sm:col-span-4">
        <label className="label">Descrição</label>
        <input
          className="input"
          value={p.descricao}
          onChange={(e) => setPeca(i, { ...p, descricao: e.target.value })}
        />
      </div>
      <div className="col-span-6 sm:col-span-3">
        <label className="label">Do estoque</label>
        <ProdutoSelect
          produtos={produtos}
          value={p.produtoId}
          onChange={(id) => vincularProduto(i, id)}
        />
      </div>
      <div className="col-span-3 sm:col-span-1">
        <label className="label">Qtd</label>
        <InputNumero
          min={1}
          className="input"
          value={p.quantidade}
          onChange={(v) => setPeca(i, { ...p, quantidade: v ?? 0 })}
        />
      </div>
      <div className="col-span-4 sm:col-span-1">
        <label className="label">Custo</label>
        <InputNumero
          className="input"
          value={p.custoUnit}
          onChange={(v) => setPeca(i, { ...p, custoUnit: v ?? 0 })}
        />
      </div>
      <div className="col-span-4 sm:col-span-2">
        <label className="label">Preço</label>
        <InputNumero
          className="input"
          value={p.precoUnit}
          onChange={(v) => setPeca(i, { ...p, precoUnit: v ?? 0 })}
        />
      </div>
      <div className="col-span-1">
        <button className="btn-ghost !p-2 text-red-500" onClick={() => delPeca(i)}>
          <Trash size={16} />
        </button>
      </div>
    </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={`Ordem de Serviço ${codigoOS(os.numero)}`}
      maxWidth="max-w-4xl"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={onSave}>Salvar OS</button>
        </>
      }
    >
      <div className="space-y-6">
        {/* Cliente & Status */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cliente *">
            <ClienteSelect clientes={clientes} value={os.clienteId} onChange={(id) => setOs({ ...os, clienteId: id })} />
            {/* Avisa na hora de escolher, não depois de digitar a OS inteira */}
            {trava.avisa && (
              <div
                className={`mt-2 rounded-lg border p-2.5 text-sm ${
                  trava.bloqueia
                    ? "border-red-200 bg-red-50 text-red-800"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                }`}
              >
                <p className="flex items-center gap-1.5 font-semibold">
                  <ShieldAlert size={15} /> {trava.titulo}
                </p>
                <p className="mt-0.5">{trava.motivo}</p>
                {trava.bloqueia && (
                  <p className="mt-1 text-xs opacity-80">
                    Dá para abrir mesmo assim, mas o sistema vai pedir confirmação ao salvar.
                  </p>
                )}
              </div>
            )}
          </Field>
          <Field label="Status">
            <select
              className="input"
              value={os.status}
              onChange={(e) => setOs({ ...os, status: e.target.value as OSStatus })}
            >
              {STATUS_LIST.map((s) => (
                <option key={s} value={s}>{OS_STATUS_META[s].label}</option>
              ))}
            </select>
          </Field>
        </div>

        {/* Aparelho */}
        <fieldset className="rounded-xl border border-slate-200 p-4">
          <legend className="flex items-center gap-1 px-2 text-sm font-bold text-slate-600">
            <Smartphone size={15} /> Dados do {voc.aparelho.toLowerCase() /* texto-cru-proposital */}
          </legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Tipo">
              <select
                className="input"
                value={os.tipoAparelho}
                onChange={(e) => setOs({ ...os, tipoAparelho: e.target.value })}
              >
                {aparelhosDoRamo(ramo).map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Marca">
              <input className="input" value={os.marca} onChange={(e) => setOs({ ...os, marca: e.target.value })} />
            </Field>
            <Field label="Modelo">
              <input className="input" value={os.modelo} onChange={(e) => setOs({ ...os, modelo: e.target.value })} />
            </Field>
            <Field label="Cor">
              <input className="input" value={os.cor} onChange={(e) => setOs({ ...os, cor: e.target.value })} />
            </Field>
            {/*
              IMEI só onde existe IMEI. Motor e bomba não têm — e um campo
              pedindo IMEI numa oficina de rebobinamento é o tipo de coisa
              que faz o sistema parecer emprestado de outro ramo.
            */}
            {temRecurso(ramo, "imei") && (
              <Field label="IMEI / Nº de série">
                <input className="input" value={os.imeiSerial} onChange={(e) => setOs({ ...os, imeiSerial: e.target.value })} />
              </Field>
            )}
            <Field label="Acessórios entregues">
              <input className="input" placeholder={temRecurso(ramo, "imei") ? "chip, cartão, capa..." : "cabo, chave, suporte..."} value={os.acessorios} onChange={(e) => setOs({ ...os, acessorios: e.target.value })} />
            </Field>
          </div>

          {/*
            A PLACA DO MOTOR.

            São os quatro números que o rebobinador anota antes de abrir. Sem
            eles não dá para calcular a bitola do fio nem conferir, na volta,
            se o motor saiu igual ao que entrou — e é essa conferência que o
            cliente cobra quando o motor esquenta depois do conserto.

            Texto e não número: "3/4 cv" e "220/380V" é como está escrito na
            plaqueta, e obrigar a converter faria o atendente arredondar de
            cabeça na frente do cliente.
          */}
          {temRecurso(ramo, "dadosMotor") && (
            <div className="mt-4">
              <label className="label">Placa do equipamento</label>
              <div className="grid gap-4 sm:grid-cols-4">
                <Field label="Potência">
                  <input className="input" placeholder="1,5 CV" value={os.potencia || ""} onChange={(e) => setOs({ ...os, potencia: e.target.value })} />
                </Field>
                <Field label="Tensão">
                  <input className="input" placeholder="220/380V" value={os.tensao || ""} onChange={(e) => setOs({ ...os, tensao: e.target.value })} />
                </Field>
                <Field label="Rotação">
                  <input className="input" placeholder="1750 rpm" value={os.rotacao || ""} onChange={(e) => setOs({ ...os, rotacao: e.target.value })} />
                </Field>
                <Field label="Fases">
                  <select className="input" value={os.fases || ""} onChange={(e) => setOs({ ...os, fases: e.target.value })}>
                    <option value="">—</option>
                    <option>Monofásico</option>
                    <option>Bifásico</option>
                    <option>Trifásico</option>
                  </select>
                </Field>
              </div>
            </div>
          )}
        </fieldset>

        {/* Senhas: só no ramo que guarda senha de aparelho. Ver ramos.ts. */}
        {temRecurso(ramo, "senhaAparelho") && (
        <fieldset className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
          <legend className="flex items-center gap-1 px-2 text-sm font-bold text-amber-700">
            <KeyRound size={15} /> Acesso / Senhas (confidencial)
          </legend>
          {/*
            Bloco cifrado que não abriu não pode virar campo editável.
            O técnico abriria a OS para corrigir o modelo do aparelho, salvaria,
            e levaria junto o campo de senha que a tela mostrou vazio — apagando
            do banco a senha do cliente sem ninguém ter tocado nela.
          */}
          {!podeEditarSigilo(os) ? (
            <p className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              {recadoDoSigilo("ilegivel")} Enquanto isso, estes campos ficam
              bloqueados: o que está gravado vai continuar lá quando você salvar.
            </p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Senha / PIN">
                  <input className="input" value={os.senhaAparelho} onChange={(e) => setOs({ ...os, senhaAparelho: e.target.value })} />
                </Field>
                <Field label="Conta vinculada (Google/Apple)">
                  <input className="input" value={os.contaVinculada} onChange={(e) => setOs({ ...os, contaVinculada: e.target.value })} />
                </Field>
              </div>
              <div className="mt-4">
                <label className="label">Padrão de desbloqueio (desenhe tocando nos pontos)</label>
                <PatternLock value={os.padraoDesbloqueio} onChange={(v) => setOs({ ...os, padraoDesbloqueio: v })} />
              </div>
            </>
          )}
        </fieldset>
        )}

        {/* Defeito e checklist */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Defeito relatado pelo cliente *">
            <textarea className="input" rows={3} value={os.defeitoRelatado} onChange={(e) => setOs({ ...os, defeitoRelatado: e.target.value })} />
          </Field>
          <Field label="Defeito constatado / laudo técnico">
            <textarea className="input" rows={3} value={os.defeitoConstatado} onChange={(e) => setOs({ ...os, defeitoConstatado: e.target.value })} />
          </Field>
        </div>

        {/*
          Backup: o único erro desta loja que nenhum conserto posterior
          resolve. Peça errada se troca, valor errado se acerta, foto de
          casamento apagada acabou. Antes isto vivia solto no meio do texto
          do defeito, onde some na linha seguinte e onde ninguém procura na
          hora de formatar.
        */}
        <div>
          <label className="label">Backup dos dados do cliente</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(BACKUP_META) as BackupOS[]).map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setOs({ ...os, backup: b })}
                className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold transition ${
                  backupDe(os) === b
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                {BACKUP_META[b].label}
              </button>
            ))}
          </div>
          {avisoDeBackup(os) && (
            <p className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              {avisoDeBackup(os)}
            </p>
          )}
        </div>

        <div>
          <label className="label">Checklist de entrada</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {checklistDoRamo(ramo).map((item) => (
              <label key={item} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded"
                  checked={!!os.checklist[item]}
                  onChange={(e) => setOs({ ...os, checklist: { ...os.checklist, [item]: e.target.checked } })}
                />
                {item}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Fotos do aparelho na entrada</label>
          <p className="mb-2 text-xs text-slate-500">
            Só para a loja. Servem de prova do estado do aparelho na retirada e
            o cliente não vê nenhuma delas.
          </p>
          <FotosAparelho
            fotos={os.fotos || []}
            onChange={(fotos) => setOs({ ...os, fotos })}
          />
        </div>

        {/*
          As fotos do laudo são as ÚNICAS que saem para o cliente, e por isso
          moram numa lista própria. "A placa está queimada, R$ 480" é uma frase
          que ele tem que acreditar; a foto de perto da trilha queimada é a
          mesma frase sem precisar de fé.

          Separadas das de entrada de propósito: aquelas pegam a tela ligada e
          a tela de bloqueio, e publicá-las seria pôr o celular do cliente numa
          página aberta. Ver lib/fotos-laudo.ts.
        */}
        <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-4">
          <label className="label flex items-center gap-1.5 !text-brand-800">
            <Camera size={15} /> Fotos do problema — estas o cliente vê
          </label>
          <p className="mb-2 text-xs text-brand-700/80">
            Foto de perto da peça queimada, do conector partido, do que explica o
            orçamento. Aparecem no link de acompanhamento junto com o valor.
          </p>
          <FotosAparelho
            fotos={os.fotosLaudo || []}
            onChange={(fotosLaudo) => setOs({ ...os, fotosLaudo })}
            pasta="laudos"
          />

          {/*
            Vídeo resolve o que a foto não resolve: o barulho do cooler, a tela
            que pisca, o curto que só aparece quando liga. É metade do que
            chega no balcão e a parte mais difícil de pôr por escrito.
          */}
          <label className="label mt-4 flex items-center gap-1.5 !text-brand-800">
            <Video size={15} /> Vídeos do problema
          </label>
          <VideosAparelho
            videos={os.videosLaudo || []}
            onChange={(videosLaudo) => setOs({ ...os, videosLaudo })}
          />
        </div>

        {/* Peças */}
        <fieldset className="rounded-xl border border-slate-200 p-4">
          <legend className="px-2 text-sm font-bold text-slate-600">Peças e produtos</legend>

          {/*
            A escolha vem antes de digitar: um orçamento ou vários. Decidir
            depois obriga a remexer peça por peça, e cada opção pode ter mais
            de uma peça (fonte E SSD), não só uma alternativa isolada.
          */}
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              onClick={usarOrcamentoUnico}
              className={`chip ${
                varios ? "bg-white text-slate-600 ring-1 ring-slate-200" : "bg-brand-600 text-white"
              }`}
            >
              Orçamento único
            </button>
            <button
              type="button"
              onClick={varios ? undefined : usarVariosOrcamentos}
              className={`chip ${
                varios ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"
              }`}
            >
              Mais de uma opção para o cliente
            </button>
          </div>

          {varios ? (
            <div className="space-y-4">
              <div>
                <p className="label">Entra em qualquer opção</p>
                <div className="space-y-2">
                  {os.pecas.map((p, i) =>
                    opcaoDaPeca(p) ? null : linhaPeca(p, i)
                  )}
                </div>
                <button
                  className="btn-secondary mt-2 !py-1.5 text-xs"
                  onClick={() => addPeca(undefined)}
                >
                  <Plus size={14} /> Item comum
                </button>
              </div>

              {nomes.map((nome) => (
                <div
                  key={nome}
                  className={`rounded-xl border-2 p-3 ${
                    nome === escolhida ? "border-brand-400 bg-brand-50/40" : "border-slate-200"
                  }`}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <label className="flex cursor-pointer items-center gap-1.5 text-sm font-bold text-slate-700">
                      <input
                        type="radio"
                        className="accent-brand-600"
                        name="opcao-escolhida-os"
                        checked={nome === escolhida}
                        onChange={() => setOs(comOpcao(os, nome))}
                      />
                      {nome}
                    </label>
                    <button className="btn-ghost !p-1 text-xs" onClick={() => renomear(nome)}>
                      <Pencil size={13} /> Renomear
                    </button>
                    <button className="btn-ghost !p-1 text-xs text-red-500" onClick={() => remover(nome)}>
                      <Trash size={13} /> Apagar opção
                    </button>
                    <span className="ml-auto text-sm">
                      Serviço com esta opção:{" "}
                      <b className="text-slate-800">{brl(totalComOpcao(os, nome))}</b>
                      <span className="ml-2 text-xs text-slate-500">
                        lucro {brl(totalComOpcao(os, nome) - custoComOpcao(os, nome))}
                      </span>
                    </span>
                  </div>
                  {/*
                    A MESMA PEÇA NO COMUM E AQUI DENTRO É COBRANÇA DUPLA.

                    Aconteceu na OS00033: bateria e carcaça nos dois lugares,
                    e a opção somou R$ 1.360 em vez de R$ 730 — um orçamento
                    cobrando duas baterias, para o cliente ler.

                    Avisa e não bloqueia: cobrar duas unidades é legítimo, só
                    que aí a quantidade é 2 numa linha só. Duas linhas iguais
                    em lugares diferentes é quase sempre engano.
                  */}
                  {(() => {
                    const repetidas = itensRepetidos(os, nome);
                    if (repetidas.length === 0) return null;
                    return (
                      <p className="mb-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
                        <b>{repetidas.join(", ")}</b>{" "}
                        {repetidas.length === 1 ? "está" : "estão"} em "Entra em qualquer
                        opção" e também aqui — o cliente é cobrado duas vezes. Apague de um
                        dos dois lados.
                      </p>
                    );
                  })()}
                  <div className="space-y-2">
                    {os.pecas.map((p, i) => (opcaoDaPeca(p) === nome ? linhaPeca(p, i) : null))}
                  </div>
                  <button
                    className="btn-secondary mt-2 !py-1.5 text-xs"
                    onClick={() => addPeca(nome)}
                  >
                    <Plus size={14} /> Peça nesta opção
                  </button>
                </div>
              ))}

              <button className="btn-secondary !py-1.5 text-xs" onClick={addOpcao}>
                <Plus size={14} /> Adicionar outra opção
              </button>

              <p className="text-xs text-slate-500">
                O marcado é o que a loja sugere. O cliente troca pelo link de
                acompanhamento, e só a opção escolhida entra no total e baixa
                do estoque.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">{os.pecas.map(linhaPeca)}</div>
              <button className="btn-secondary mt-3 !py-1.5 text-xs" onClick={() => addPeca()}>
                <Plus size={14} /> Adicionar peça
              </button>
            </>
          )}
        </fieldset>

        {/* Financeiro */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Mão de obra (R$)">
            <InputNumero
              className="input"
              value={os.maoDeObra}
              onChange={(v) => setOs({ ...os, maoDeObra: (v ?? 0) })}
            />
          </Field>
          <Field label="Desconto (R$)">
            <InputNumero
              className="input"
              value={os.desconto}
              onChange={(v) => setOs({ ...os, desconto: (v ?? 0) })}
            />
          </Field>
          <Field label="Técnico responsável">
            <input className="input" value={os.tecnico} onChange={(e) => setOs({ ...os, tecnico: e.target.value })} />
          </Field>
        </div>

        <div className="rounded-xl bg-slate-50 p-4 text-sm">
          <div className="flex flex-wrap justify-end gap-6">
            <span>Peças: <b>{brl(totalPecas(os))}</b></span>
            <span>Custo: <b className="text-red-600">{brl(custoPecas(os))}</b></span>
            <span>Total: <b className="text-lg text-slate-800">{brl(totalOS(os))}</b></span>
            <span>Lucro: <b className="text-emerald-600">{brl(lucroOS(os))}</b></span>
          </div>
          {/* O total mostra a opção sugerida. Sem este aviso a loja cobrava
              pela sugestão achando que era decisão do cliente. */}
          {!faixa.definido && (
            <p className="mt-2 text-right text-xs text-amber-700">
              O cliente ainda não escolheu. O serviço vai sair de{" "}
              <b>{brl(faixa.minimo)}</b> a <b>{brl(faixa.maximo)}</b> — o total
              acima é o da opção sugerida (<b>{escolhida}</b>).
            </p>
          )}
        </div>

        <Field label="Observações internas">
          <textarea className="input" rows={2} value={os.observacoes} onChange={(e) => setOs({ ...os, observacoes: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
};

/**
 * ============ A NOTA FISCAL DA OS ============
 *
 * Uma ordem de serviço gera DUAS notas, e essa é a única razão desta tela
 * existir separada do botão de nota do PDV:
 *
 *   mão de obra .... NFS-e ... ISS ..... prefeitura
 *   peça ........... NFC-e ... ICMS .... SEFAZ do estado
 *
 * Emitir tudo como mercadoria paga ICMS sobre serviço; emitir tudo como
 * serviço paga ISS sobre peça. Os dois erros só aparecem meses depois, no
 * contador, com o valor já recolhido errado.
 *
 * A conta de qual item cai de que lado é `lib/nota-os.ts`, com teste. Aqui
 * só mora a tela.
 */
// Exportado só para o teste desenhar a tela sem navegador. Ver
// nota-os.tela.test.tsx: era o único pedaço da nota da OS sem cobertura.
export const NotaFiscalDaOS: React.FC<{ os: OrdemServico; config: Config }> = ({
  os: osDoModal,
  config,
}) => {
  const { ordens, produtos, clientes, movimentos, notas, saveNota, saveOrdem } = useApp();
  const [pedindo, setPedindo] = useState("");

  /*
   * A OS VIVA da loja, e não a cópia que o modal abriu com.
   *
   * O detalhe guarda um retrato da OS no momento em que a janela abriu.
   * Mover um item de lado grava certo no banco e a tela não mexia um fio —
   * a pessoa clica de novo, e de novo, achando que o botão não funciona.
   */
  const os = ordens.find((o) => o.id === osDoModal.id) || osDoModal;

  const lados = useMemo(() => separarOS(os, produtos), [os, produtos]);
  const pecas = useMemo(() => pecasEfetivas(os), [os]);
  const parcelas = useMemo(() => pagamentosDaOS(movimentos, os.id), [movimentos, os.id]);
  const cliente = clientes.find((c) => c.id === os.clienteId);

  /**
   * Move a peça para o outro lado da nota.
   *
   * Grava na OS porque a escolha vale para a nota de amanhã também — se
   * ficasse só no estado da tela, reabrir a OS mandaria a peça de volta
   * para o lado errado e a segunda emissão sairia diferente da primeira.
   *
   * Coincidindo com o que o cadastro já diz, o campo é APAGADO em vez de
   * gravado igual: peça marcada à toa vira mentira depois que alguém
   * corrige o cadastro do produto.
   */
  const mover = async (p: PecaOS, destino: "nfce" | "nfse") => {
    const i = os.pecas.indexOf(p);
    if (i < 0) return;
    const natural = documentoDaPeca({ ...p, documentoForcado: undefined }, produtos);
    const pecasNovas = os.pecas.map((x, k) =>
      k === i ? { ...x, documentoForcado: destino === natural ? undefined : destino } : x
    );
    try {
      await saveOrdem({ ...os, pecas: pecasNovas, atualizadoEm: nowISO() });
    } catch (e) {
      aviso.erro(
        "Não foi possível mover o item:\n\n" + (e instanceof Error ? e.message : String(e))
      );
    }
  };

  /**
   * Põe UM dos lados na fila e manda emitir na hora.
   *
   * Um lado de cada vez, e não os dois num clique: são documentos de
   * governos diferentes, e um pode passar enquanto o outro é recusado. Um
   * botão só faria a tela dizer "deu certo" quando metade deu.
   */
  const pedir = async (lado: LadoDaNota) => {
    const problema = problemaDoLado(lado, produtos, config);
    if (problema) return aviso.alerta(problema);
    if (pedindo) return;
    setPedindo(lado.documento);
    try {
      const pedido =
        lado.documento === "nfse"
          ? pedidoDoServicoDaOS(os, lado, produtos, config, parcelas, cliente)
          : pedidoDaMercadoriaDaOS(os, lado, produtos, config, parcelas, cliente);
      await saveNota({
        ...notaPendenteDaOS(uid(), os.id, lado.documento),
        pedido,
      } as never);

      const { data } = (await supabase?.auth.getSession()) || { data: undefined };
      const empurrao = await empurrarFilaDeNotas(data?.session?.access_token);
      const nome = DOCUMENTO_META[lado.documento].curto;
      aviso.sucesso(
        empurrao.ok
          ? `${nome} pedida e enviada. O resultado aparece aqui em segundos.`
          : `${nome} pedida e na fila. O envio imediato não respondeu (${empurrao.motivo}), ` +
              "mas ela sai sozinha. Não peça de novo."
      );
    } catch (e) {
      aviso.erro(
        "Não foi possível pedir a nota:\n\n" + (e instanceof Error ? e.message : String(e))
      );
    } finally {
      setPedindo("");
    }
  };

  const bloco = (lado: LadoDaNota) => {
    const meta = DOCUMENTO_META[lado.documento];
    const nota = notaDaOS(notas, os.id, lado.documento);
    return (
      <div key={lado.documento} className="rounded-lg border border-slate-200 p-2.5">
        <div className="linha-card">
          <div className="linha-card-info">
            <p className="text-sm font-semibold text-slate-700">{meta.label}</p>
            <p className="text-xs text-slate-500">
              {meta.imposto} · {brl(lado.total)}
              {lado.desconto > 0 && ` (desconto de ${brl(lado.desconto)})`}
            </p>
          </div>
          {!ladoTemNota(lado) ? (
            <span className="text-xs text-slate-400">Nada deste lado</span>
          ) : nota ? (
            <span
              className={`badge ${precisaDeAtencao(nota) ? "bg-red-100 text-red-700" : SITUACAO_NOTA_META[nota.situacao].cor}`}
              title={nota.erro || SITUACAO_NOTA_META[nota.situacao].explicacao}
            >
              {SITUACAO_NOTA_META[nota.situacao].label}
            </span>
          ) : (
            <button
              className="btn-secondary !py-1.5 text-sm"
              disabled={!!pedindo}
              onClick={() => pedir(lado)}
            >
              <FileText size={15} /> {pedindo === lado.documento ? "Pedindo..." : "Emitir"}
            </button>
          )}
        </div>
        {nota?.erro && <p className="mt-1 text-xs text-red-600">{nota.erro}</p>}
      </div>
    );
  };

  if (!ladoTemNota(lados.servico) && !ladoTemNota(lados.mercadoria)) return null;

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 p-3 no-print">
      <p className="label flex items-center gap-1.5">
        <FileText size={14} /> Nota fiscal
      </p>
      <p className="text-xs text-slate-500">
        São dois documentos: a mão de obra é nota de serviço (ISS, prefeitura) e a
        peça é nota de consumidor (ICMS, SEFAZ). Cada um sai por conta própria.
      </p>

      {bloco(lados.servico)}
      {bloco(lados.mercadoria)}

      {/*
        Mover item de lado. Existe porque o cadastro erra — "instalação de
        SSD" cadastrada como produto comum, "cabo HDMI" cadastrado como
        serviço. Travar a emissão até alguém corrigir o cadastro é parar a
        loja por causa de um campo.
      */}
      {pecas.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-slate-500">
            Algum item está no documento errado?
          </summary>
          <div className="mt-2 space-y-1.5">
            {pecas.map((p, i) => {
              const atual = documentoDaPeca(p, produtos);
              const outro = atual === "nfse" ? "nfce" : "nfse";
              return (
                <div key={i} className="linha-card">
                  <span className="linha-card-info truncate text-slate-600">{p.descricao}</span>
                  <div className="flex items-center gap-2">
                    <span className="badge bg-slate-100 text-slate-600">
                      {DOCUMENTO_META[atual].curto}
                    </span>
                    <button className="btn-ghost !py-1 text-xs" onClick={() => mover(p, outro)}>
                      Mover para {DOCUMENTO_META[outro].curto}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
};

// ============ DETALHE / IMPRESSÃO ============
// Exportado só para o teste desenhar o painel de recebimento sem navegador.
// Ver os-parcial.tela.test.tsx.
export const OSDetalhe: React.FC<{
  os: OrdemServico;
  clienteNome: string;
  cliente?: { nome: string; telefone: string; cpf?: string };
  config: Config;
  onClose: () => void;
  onStatus: (s: OSStatus) => void;
  onAvisar: () => void;
  onEditar: () => void;
  onExcluir: () => void;
  onReceber: (parcelas: Parcela[], destino?: DestinoDoResto) => void;
  onFiado: () => void;
  /** Já existe lançamento no caixa ou fiado para esta OS? */
  pagamentoRegistrado: boolean;
  historicoAparelho: OrdemServico[];
  /** Gravação em andamento: o botão não pode aceitar o segundo clique */
  registrando: boolean;
}> = ({ os, clienteNome, cliente, config, onClose, onStatus, onAvisar, onEditar, onExcluir, onReceber, onFiado, pagamentoRegistrado, historicoAparelho, registrando }) => {
  // `movimentos` vem do store porque é lá que o dinheiro da OS mora: um
  // campo separado começaria a divergir do caixa no primeiro estorno.
  const { ramo, movimentos } = useApp();
  const voc = vocabulario(ramo);
  const [forma, setForma] = useState<FormaPagamento>("dinheiro");
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [dividido, setDividido] = useState(false);
  /*
   * A guarda acumulada, no mesmo lugar em que o alerta vermelho a calcula.
   *
   * Os botões diziam `Receber ${totalOS}` enquanto o alerta logo acima
   * mostrava a guarda em vermelho — dois números para a mesma entrega, e o
   * cobrado era o menor. Tela que diz um valor e caixa que cobra outro é
   * exatamente o que a regra do preço único proíbe.
   */
  const guarda = taxaArmazenamento(
    os,
    config.taxaArmazenamentoDia || 0,
    config.diasAbandono || 90
  ).valor;
  const aCobrar = totalDaEntrega(os, guarda);

  /*
   * O que JÁ entrou por esta OS, e o que ainda falta cobrar hoje.
   *
   * Depois de um sinal, o botão não pode continuar dizendo o total: quem
   * pagou R$ 300 de R$ 800 na semana passada vê "Receber R$ 800" e cobra o
   * valor cheio de novo. Ver lib/os-pagamento.ts.
   */
  const jaRecebido = recebidoDaOS(movimentos, os.id);
  const restaCobrar = Math.max(0, Math.round((aCobrar - jaRecebido) * 100) / 100);

  /*
   * "Recebeu só uma parte?" fica escondido atrás de um toque de propósito.
   *
   * O caminho comum é o cliente pagar tudo, e ele tem que continuar sendo um
   * clique só — campo de valor sempre visível é mais uma coisa para conferir
   * com a fila andando.
   */
  const [parcial, setParcial] = useState(false);
  const [valorParcial, setValorParcial] = useState<number | undefined>(undefined);

  const falta = faltaNoPagamento(restaCobrar, parcelas);
  // Sem divisão, a "lista de formas" é uma só, com o total inteiro. Assim o
  // caminho de gravação é UM, e o comum não vira caso especial.
  const parcelasFinais: Parcela[] = dividido
    ? parcelas
    : [{ forma, valor: parcial ? (valorParcial ?? 0) : restaCobrar }];
  const conta = contaDaOS(aCobrar, consolidar(parcelasFinais), jaRecebido);
  const [incluirCliente, setIncluirCliente] = useState(true);

  // o link leva a loja: a consulta pública só devolve dados desta loja
  const trackingUrl = linkDeRastreio(
    `${window.location.origin}${window.location.pathname}`,
    obterLoja(),
    os
  );
  const imprimir = () => {
    printHTML(
      reciboOS(os, cliente, config, { incluirCliente }),
      codigoOS(os.numero),
      config.papelImpressao || "a4"
    );
  };
  const linkRastreio = () => {
    const url = trackingUrl;
    if (cliente?.telefone) {
      const msg = `Acompanhe o status do seu aparelho na ${config.nomeLoja}:\n${url}`;
      abrirWhatsapp(txt(cliente.telefone), msg);
    } else {
      navigator.clipboard?.writeText(url);
      aviso.sucesso("Link de acompanhamento copiado.");
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Detalhes · ${codigoOS(os.numero)}`}
      maxWidth="max-w-3xl"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2 no-print">
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-secondary text-red-600" onClick={onExcluir}><Trash2 size={16} /></button>
            <button className="btn-secondary" onClick={imprimir}><Printer size={16} /> Imprimir</button>
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" className="h-4 w-4" checked={incluirCliente} onChange={(e) => setIncluirCliente(e.target.checked)} />
              Incluir cliente no recibo
            </label>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={linkRastreio}><LinkIcon size={16} /> Link p/ cliente</button>
            <button className="btn-success" onClick={onAvisar}><MessageCircle size={16} /> Avisar</button>
            <button className="btn-primary" onClick={onEditar}><Pencil size={16} /> Editar</button>
          </div>
        </div>
      }
    >
      <div className="space-y-5" id="os-print">
        {/* Cabeçalho impressão */}
        <div className="hidden border-b pb-3 print:block">
          <h2 className="text-xl font-bold">{config.nomeLoja}</h2>
          <p className="text-sm text-slate-500">{config.enderecoLoja} · {config.telefoneLoja}</p>
        </div>

        <div className="flex items-center justify-between">
          {/*
            Aqui a OS está sozinha na tela, então a situação vai em cor cheia
            — o crachá pálido serve para a lista, onde dez cores fortes viram
            um borrão. No papel volta a fundo branco: cor cheia sai como uma
            tarja cinza com letra branca por cima, ilegível.
          */}
          <span
            className={`badge text-sm print:border print:border-slate-300 print:bg-white print:text-black ${OS_STATUS_META[os.status].forte}`}
          >
            {OS_STATUS_META[os.status].label}
          </span>
          <span className="text-sm text-slate-400">Aberta em {formatDateTime(os.criadoEm)}</span>
        </div>

        {/* Etiqueta com QR Code de acompanhamento */}
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
          <div className="shrink-0 rounded bg-white p-1.5 ring-1 ring-slate-200">
            <QRCodeImg text={trackingUrl} size={84} />
          </div>
          <div className="text-xs text-slate-500">
            <p className="text-sm font-bold text-slate-700">Etiqueta de acompanhamento</p>
            <p>Cole no aparelho — o cliente escaneia e vê o status da OS.</p>
            <p className="mt-1 font-mono font-bold text-slate-600">{codigoOS(os.numero)}</p>
          </div>
        </div>

        {/* Alterar status */}
        <div className="no-print">
          <label className="label">Alterar estado do equipamento</label>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_LIST.map((s) => (
              <button
                key={s}
                onClick={() => onStatus(s)}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                  os.status === s ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {OS_STATUS_META[s].label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Info label="Cliente" value={clienteNome} />
          <Info label="Telefone" value={cliente?.telefone || "—"} />
          <Info label={voc.aparelho} value={`${os.tipoAparelho} ${os.marca} ${os.modelo}`} />
          <Info label="Cor / IMEI" value={`${os.cor || "—"} · ${os.imeiSerial || "—"}`} />
          <Info label="Acessórios" value={os.acessorios || "—"} />
          <Info label="Técnico" value={os.tecnico || "—"} />
        </div>

        {temRecurso(ramo, "senhaAparelho") && <BlocoSigilo os={os} />}

        {/* A placa, no detalhe e na impressão: é o que o cliente confere
            quando vem buscar, e o que prova que voltou o mesmo motor. */}
        {temRecurso(ramo, "dadosMotor") &&
          [os.potencia, os.tensao, os.rotacao, os.fases].some((v) => txt(v).trim()) && (
            <div className="grid gap-2 sm:grid-cols-4">
              <Info label="Potência" value={txt(os.potencia) || "—"} />
              <Info label="Tensão" value={txt(os.tensao) || "—"} />
              <Info label="Rotação" value={txt(os.rotacao) || "—"} />
              <Info label="Fases" value={txt(os.fases) || "—"} />
            </div>
          )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Info label="Defeito relatado" value={os.defeitoRelatado} />
          <Info label="Laudo técnico" value={os.defeitoConstatado || "—"} />
          <Info label="Backup dos dados" value={BACKUP_META[backupDe(os)].label} />
        </div>

        {/* Alerta de permanência / taxa de guarda */}
        {(() => {
          const t = taxaArmazenamento(os, config.taxaArmazenamentoDia || 0, config.diasAbandono || 90);
          const dias = diasEmPosse(os);
          if (t.valor > 0)
            return (
              <div className="rounded-xl bg-red-50 p-3 text-sm no-print">
                <p className="flex items-center gap-1 font-bold text-red-700">
                  <AlertTriangle size={14} /> Taxa de guarda acumulada: {brl(t.valor)}
                </p>
                <p className="text-xs text-red-600">
                  Pronta há {t.diasParado} dias · {t.diasExcedidos} dia(s) além do prazo de {config.diasAbandono || 90} dias
                </p>
              </div>
            );
          if (dias >= 15)
            return (
              <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-700 no-print">
                <p className="flex items-center gap-1 font-semibold">
                  <Clock size={14} /> Aparelho na loja há {dias} dias
                </p>
              </div>
            );
          return null;
        })()}

        {/* Histórico deste aparelho (mesmo IMEI/série) */}
        {historicoAparelho.length > 0 && (
          <div className="rounded-xl bg-slate-50 p-3 no-print">
            <p className="mb-2 flex items-center gap-1 text-xs font-bold text-slate-600">
              <History size={13} /> Este aparelho já passou aqui {historicoAparelho.length}x
            </p>
            <div className="space-y-1">
              {historicoAparelho.slice(0, 5).map((h) => (
                <div key={h.id} className="flex items-center justify-between text-xs text-slate-600">
                  <span className="truncate">
                    <b className="font-mono">{codigoOS(h.numero)}</b> · {h.defeitoRelatado || "—"}
                  </span>
                  <span className="ml-2 shrink-0 text-slate-400">{formatDateTime(h.criadoEm).slice(0, 10)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Garantia: resposta pronta, com botão para colar no WhatsApp.
            Negar garantia válida perde o cliente; honrar garantia vencida
            paga peça que já foi paga uma vez. */}
        {(() => {
          const g = garantiaDaOS(os);
          if (g.situacao === "sem_garantia") return null;
          return (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3 no-print">
              <span className={`badge ${GARANTIA_META[g.situacao].cor}`}>
                <ShieldCheck size={12} /> {GARANTIA_META[g.situacao].label}
              </span>
              <span className="min-w-0 flex-1 text-sm text-slate-600">
                {textoDaGarantia(os)}
              </span>
              {cliente?.telefone && (
                <button
                  className="btn-secondary !py-1.5 text-xs"
                  onClick={() => abrirWhatsapp(txt(cliente.telefone), textoDaGarantia(os))}
                >
                  <MessageCircle size={14} /> Responder
                </button>
              )}
            </div>
          );
        })()}

        {/* Fotos da entrada: saem na impressão junto com o termo de guarda,
            que é onde elas valem como prova do estado do aparelho. */}
        {(os.fotos || []).length > 0 && (
          <div>
            <p className="label">Estado na entrada</p>
            <div className="flex flex-wrap gap-2">
              {(os.fotos || []).map((url) => (
                <img
                  key={url}
                  src={url}
                  alt=""
                  className="h-24 w-24 rounded-lg border border-slate-200 object-cover"
                />
              ))}
            </div>
          </div>
        )}

        {/* As fotos que o cliente vê. Marcadas como tal na tela da loja: sem
            isso não há como conferir, antes de mandar o link, o que foi
            publicado. Saem na impressão junto do laudo, que é o que elas
            comprovam. */}
        {(fotosParaOCliente(os).length > 0 || videosParaOCliente(os).length > 0) && (
          <div>
            <p className="label flex items-center gap-1.5">
              <Camera size={14} /> Problema registrado — o cliente vê isto
            </p>
            <div className="flex flex-wrap gap-2">
              {fotosParaOCliente(os).map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer">
                  <img
                    src={url}
                    alt=""
                    className="h-24 w-24 rounded-lg border-2 border-brand-300 object-cover"
                  />
                </a>
              ))}
              {videosParaOCliente(os).map((v) => (
                <a
                  key={v.url}
                  href={v.url}
                  target="_blank"
                  rel="noreferrer"
                  className="relative block h-24 w-32 overflow-hidden rounded-lg border-2 border-brand-300 bg-slate-900"
                >
                  {v.capa ? (
                    <img src={v.capa} alt="" className="h-full w-full object-cover opacity-80" />
                  ) : null}
                  <span className="absolute inset-0 flex items-center justify-center text-white">
                    <Play size={24} fill="currentColor" />
                  </span>
                  {duracaoEscrita(v.duracao) && (
                    <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[10px] font-semibold text-white">
                      {duracaoEscrita(v.duracao)}
                    </span>
                  )}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Peças */}
        {os.pecas.length > 0 && (
          <div>
            <p className="label">Peças / serviços</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-slate-400">
                  <th className="py-1">Item</th>
                  <th className="py-1 text-center">Qtd</th>
                  <th className="py-1 text-right">Preço</th>
                  <th className="py-1 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {os.pecas.map((p, i) => {
                  // Opção recusada continua à vista, mas apagada: some do
                  // total sem sumir do histórico do orçamento.
                  const nome = opcaoDaPeca(p);
                  const recusada = !!nome && nome !== opcaoAtual(os);
                  return (
                    <tr
                      key={i}
                      className={`border-b border-slate-100 ${recusada ? "text-slate-400 line-through" : ""}`}
                    >
                      <td className="py-1.5">
                        {p.descricao}
                        {nome && <span className="ml-1.5 text-xs no-underline">({nome})</span>}
                      </td>
                      <td className="py-1.5 text-center">{p.quantidade}</td>
                      <td className="py-1.5 text-right">{brl(p.precoUnit)}</td>
                      <td className="py-1.5 text-right">{brl(p.precoUnit * p.quantidade)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Totais */}
        <div className="ml-auto max-w-xs space-y-1 text-sm">
          <Linha label="Peças" value={brl(totalPecas(os))} />
          <Linha label="Mão de obra" value={brl(os.maoDeObra)} />
          {os.desconto > 0 && <Linha label="Desconto" value={`- ${brl(os.desconto)}`} />}
          {guarda > 0 && <Linha label="Taxa de guarda" value={brl(guarda)} />}
          <div className="flex justify-between border-t pt-1 text-base font-bold">
            <span>Total</span>
            <span>{brl(aCobrar)}</span>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400">{config.nomeLoja}</p>

        <NotaFiscalDaOS os={os} config={config} />

        {/* Entregue mas sem nenhum pagamento registrado: precisa de saída */}
        {os.status === "entregue" && !pagamentoRegistrado && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 no-print">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-800">
              <AlertTriangle size={16} /> Esta OS foi entregue sem registro de pagamento
            </p>
            <p className="mb-3 text-xs text-amber-700">
              Nada entrou no caixa e o estoque pode não ter sido baixado. Registre
              agora para a conta ficar certa.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <SeletorDeForma forma={forma} onForma={setForma} />
              <button className="btn-success !py-1.5 text-sm" disabled={registrando} onClick={() => onReceber(parcelasFinais)}>
                {registrando ? "Registrando..." : `Registrar ${brl(restaCobrar)} no caixa`}
              </button>
              <button className="btn-secondary !py-1.5 text-sm" disabled={registrando} onClick={onFiado}>
                <HandCoins size={15} /> Lançar como fiado
              </button>
            </div>
          </div>
        )}

        {/* Receber pagamento */}
        {os.status !== "entregue" && os.status !== "cancelada" && (
          <div className="rounded-xl bg-emerald-50 p-3 no-print">
            <div className="flex flex-wrap items-center gap-2">
              <DollarSign size={18} className="text-emerald-600" />
              <span className="text-sm font-semibold text-emerald-800">Receber e entregar:</span>
              {!dividido && <SeletorDeForma forma={forma} onForma={setForma} />}
              {!dividido && parcial && (
                <InputNumero
                  className="input !w-28 !py-1.5 text-sm"
                  min={0}
                  value={valorParcial}
                  onChange={setValorParcial}
                />
              )}
              {conta.situacao !== "parcial" && (
                <button
                  className="btn-success !py-1.5 text-sm"
                  disabled={registrando}
                  onClick={() => onReceber(parcelasFinais)}
                >
                  {registrando ? "Registrando..." : `Receber ${brl(conta.agora || restaCobrar)}`}
                </button>
              )}
              <button className="btn-secondary !py-1.5 text-sm" disabled={registrando} onClick={onFiado} title="Entregar e deixar para pagar depois">
                <HandCoins size={15} /> Fiado
              </button>
            </div>

            {/* Já entrou dinheiro antes: o botão acima cobra só o que falta. */}
            {jaRecebido > 0 && (
              <p className="mt-2 text-xs text-emerald-800">
                Já recebido nesta OS: <b>{brl(jaRecebido)}</b> de {brl(aCobrar)}.
              </p>
            )}

            {/*
              O CLIENTE PAGOU MENOS DO QUE A CONTA.

              Antes o sistema respondia "Faltam R$ 500 para fechar a venda" e
              acabava ali — e o atendente resolvia por fora, no caderno, que é
              onde o valor some.

              As duas saídas não são a mesma coisa, e a diferença é o
              APARELHO: no fiado ele sai hoje e vira dívida em A Receber; no
              sinal ele fica na loja. Por isso são dois botões e não um
              seletor: cada um diz o que acontece com o aparelho.
            */}
            {conta.situacao === "parcial" && (
              <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5">
                <p className="text-sm font-semibold text-amber-900">
                  Faltam {brl(conta.falta)}. O que fazer com o resto?
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {(Object.keys(DESTINO_META) as DestinoDoResto[]).map((k) => (
                    <button
                      key={k}
                      className="rounded-lg border border-amber-300 bg-white p-2 text-left transition hover:bg-amber-100 disabled:opacity-60"
                      disabled={registrando}
                      onClick={() => onReceber(parcelasFinais, k)}
                    >
                      <span className="block text-sm font-semibold text-slate-800">
                        {DESTINO_META[k].label}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {DESTINO_META[k].explicacao}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/*
              Conserto de R$ 800 pago metade no cartão e metade em espécie é
              comum na bancada. Numa forma só, a gaveta acusava falta de
              R$ 400 e a maquininha, sobra de R$ 400 — todo dia, sem origem.
            */}
            {!dividido ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  className="btn-ghost !py-1 text-xs"
                  onClick={() => {
                    setDividido(true);
                    setParcelas([{ forma, valor: restaCobrar }]);
                  }}
                >
                  <Plus size={13} /> Dividir entre formas de pagamento
                </button>
                <button
                  className="btn-ghost !py-1 text-xs"
                  onClick={() => {
                    const ligando = !parcial;
                    setParcial(ligando);
                    // Nasce no valor cheio: quem abriu vai BAIXAR o número, e
                    // começar em branco faria o botão sumir até digitar algo.
                    setValorParcial(ligando ? restaCobrar : undefined);
                  }}
                >
                  <HandCoins size={13} /> {parcial ? "Pagou tudo" : "Recebeu só uma parte?"}
                </button>
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                {parcelas.map((pc, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <SeletorDeForma
                      forma={pc.forma}
                      onForma={(f) =>
                        setParcelas((v) => v.map((x, n) => (n === i ? { ...x, forma: f } : x)))
                      }
                    />
                    <InputNumero
                      className="input !w-28 !py-1.5 text-sm"
                      min={0}
                      value={pc.valor}
                      onChange={(v) =>
                        setParcelas((x) => x.map((y, n) => (n === i ? { ...y, valor: v ?? 0 } : y)))
                      }
                    />
                    <button
                      className="btn-ghost !p-2 text-red-500"
                      onClick={() => setParcelas((v) => v.filter((_, n) => n !== i))}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className={falta > 0 ? "font-bold text-amber-700" : "text-slate-500"}>
                    {falta > 0 ? `Faltam ${brl(falta)}` : "Fechou certo"}
                  </span>
                  <div className="flex gap-2">
                    <button
                      className="btn-ghost !py-1 text-xs"
                      onClick={() =>
                        setParcelas((v) => [
                          ...v,
                          {
                            // A linha nova nasce numa forma que ainda não está
                            // na lista: nascendo sempre em dinheiro, o toque
                            // não servia para nada e `consolidar` juntava as
                            // duas de volta num lançamento só.
                            forma:
                              FORMAS_DE_COMPRA.find((x) => !v.some((y) => y.forma === x.k))?.k ||
                              "dinheiro",
                            valor: falta,
                          },
                        ])
                      }
                    >
                      <Plus size={13} /> Forma
                    </button>
                    <button
                      className="btn-ghost !py-1 text-xs"
                      onClick={() => {
                        setDividido(false);
                        setParcelas([]);
                      }}
                    >
                      Uma forma só
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

/**
 * Dados de acesso do aparelho.
 * Ficam escondidos por padrão: a tela da OS é aberta na frente do cliente,
 * na frente do próximo da fila e em cima do balcão. Revelar é um ato
 * deliberado, e fica registrado quem revelou.
 */
const BlocoSigilo: React.FC<{ os: OrdemServico }> = ({ os }) => {
  const [aberto, setAberto] = useState(false);
  const estado = estadoDoSigilo(os);
  const temAlgo = estado === "tem";

  const revelarDados = () => {
    setAberto(true);
    const loja = obterLoja();
    // Registro discreto: não trava a tela se falhar
    if (loja) registrarAcessoSigilo(loja, os.numero).catch(() => {});
  };

  return (
    <div
      className={`rounded-xl p-3 print:hidden ${
        estado === "ilegivel" ? "bg-red-50" : "bg-amber-50"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p
          className={`flex items-center gap-1 text-xs font-bold ${
            estado === "ilegivel" ? "text-red-700" : "text-amber-700"
          }`}
        >
          <KeyRound size={13} /> Acesso (confidencial)
        </p>
        {temAlgo && (
          <button
            className="btn-ghost !px-2 !py-1 text-xs text-amber-700"
            onClick={() => (aberto ? setAberto(false) : revelarDados())}
          >
            {aberto ? <EyeOff size={13} /> : <Eye size={13} />}
            {aberto ? "Ocultar" : "Revelar"}
          </button>
        )}
      </div>

      {/*
        "Nada registrado" e "não consegui abrir" são opostos, e por um bom
        tempo a tela disse a mesma frase para os dois. Quem lia mandava o
        cliente repetir uma senha que o sistema tinha guardada.
      */}
      {estado !== "tem" ? (
        <p
          className={`mt-1 text-sm ${
            estado === "ilegivel" ? "text-red-700" : "text-amber-700/70"
          }`}
        >
          {recadoDoSigilo(estado)}
        </p>
      ) : !aberto ? (
        <p className="mt-1 text-sm text-amber-700/70">{recadoDoSigilo(estado)}</p>
      ) : (
        <>
          <div className="mt-1 grid gap-1 text-sm sm:grid-cols-3">
            <span>Senha: <b>{os.senhaAparelho || "—"}</b></span>
            <span>Padrão: <b>{os.padraoDesbloqueio || "—"}</b></span>
            <span>Conta: <b>{os.contaVinculada || "—"}</b></span>
          </div>
          {os.padraoDesbloqueio && os.padraoDesbloqueio.includes("-") && (
            <div className="mt-3">
              <PatternLock value={os.padraoDesbloqueio} readOnly size={120} />
            </div>
          )}
        </>
      )}
    </div>
  );
};

// Seletor de cliente com busca
const ClienteSelect: React.FC<{
  clientes: { id: string; nome: string; telefone?: string; documento?: string }[];
  value?: string;
  onChange: (id: string) => void;
}> = ({ clientes, value, onChange }) => {
  const sel = clientes.find((c) => c.id === value);
  const [q, setQ] = useState(sel?.nome || "");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setQ(clientes.find((c) => c.id === value)?.nome || "");
  }, [value, clientes]);
  const filtro = clientes
    .filter((c) => {
      const alvo = normalizar(q);
      // Só compara número quando o usuário digitou número — senão o
      // "contém string vazia" daria positivo para a lista inteira.
      const digitos = q.replace(/\D/g, "");
      return (
        // Sem acento: "jose" tem que achar "José".
        normalizar(c.nome).includes(alvo) ||
        (digitos.length > 0 &&
          (txt(c.telefone).replace(/\D/g, "").includes(digitos) ||
            txt(c.documento).replace(/\D/g, "").includes(digitos)))
      );
    })
    .slice(0, 8);
  return (
    <div className="relative">
      <input
        className="input"
        placeholder="Digite o nome do cliente..."
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          if (!e.target.value) onChange("");
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && filtro.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg bg-white shadow-lg ring-1 ring-slate-200">
          {filtro.map((c) => (
            <button
              key={c.id}
              type="button"
              className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              onMouseDown={() => {
                onChange(c.id);
                setQ(c.nome);
                setOpen(false);
              }}
            >
              <span className="block truncate font-medium">{txt(c.nome) || "(sem nome)"}</span>
              {txt(c.telefone) && (
                <span className="block text-xs text-slate-400">{txt(c.telefone)}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Seletor de produto com busca, no lugar do `<select>` que listava o estoque
 * inteiro na ordem em que o banco devolveu.
 *
 * Achar "Fonte 500W" no meio de trezentos itens virava rolar a roda do
 * celular até dar sorte — e o atendente desistia e digitava a peça na mão. A
 * OS perdia o vínculo com o estoque e a baixa nunca acontecia, que é o
 * estrago de verdade: o item saiu da prateleira e o sistema não soube.
 *
 * Preço e saldo aparecem na linha porque é com eles que se escolhe entre dois
 * produtos de nome parecido. Serviço não mostra saldo: serviço não tem
 * estoque.
 */
const ProdutoSelect: React.FC<{
  produtos: Produto[];
  value?: string;
  onChange: (id: string) => void;
}> = ({ produtos, value, onChange }) => {
  const escolhido = produtos.find((p) => p.id === value);
  const [q, setQ] = useState(escolhido?.nome || "");
  const [aberto, setAberto] = useState(false);

  // Acompanha a escolha vinda de fora: o vínculo também muda quando a linha
  // é preenchida por outro caminho, e o campo não pode ficar mostrando o
  // produto anterior.
  useEffect(() => {
    setQ(produtos.find((p) => p.id === value)?.nome || "");
  }, [value, produtos]);

  const lista = produtosParaOS(produtos, aberto ? q : "");

  return (
    <div className="relative">
      <input
        className="input"
        placeholder="Manual - ou busque no estoque"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setAberto(true);
          // Apagar o campo desfaz o vínculo e a peça volta a ser manual.
          if (!e.target.value) onChange("");
        }}
        onFocus={() => {
          setQ("");
          setAberto(true);
        }}
        onBlur={() => {
          setAberto(false);
          // Sem escolher nada, o campo volta a mostrar o que estava vinculado
          // em vez de ficar com meia palavra digitada.
          setQ(produtos.find((p) => p.id === value)?.nome || "");
        }}
      />
      {aberto && lista.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg bg-white shadow-lg ring-1 ring-slate-200">
          {lista.map((pr) => (
            <button
              key={pr.id}
              type="button"
              className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              onMouseDown={() => {
                onChange(pr.id);
                setQ(pr.nome);
                setAberto(false);
              }}
            >
              <span className="block truncate font-medium">{txt(pr.nome)}</span>
              <span className="block text-xs text-slate-400">
                {brl(pr.preco)}
                {pr.servico ? " · serviço" : ` · ${pr.quantidade} em estoque`}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const QRCodeImg: React.FC<{ text: string; size?: number }> = ({ text, size = 84 }) => {
  const [src, setSrc] = useState("");
  useEffect(() => {
    QRCode.toDataURL(text, { width: size, margin: 1 }).then(setSrc).catch(() => setSrc(""));
  }, [text, size]);
  return src ? <img src={src} width={size} height={size} alt="QR de acompanhamento" className="rounded" /> : null;
};

const Info: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <p className="text-xs font-semibold uppercase text-slate-400">{label}</p>
    <p className="text-sm text-slate-800">{value}</p>
  </div>
);
const Linha: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex justify-between text-slate-600">
    <span>{label}</span>
    <span>{value}</span>
  </div>
);
