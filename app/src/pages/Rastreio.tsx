import React, { useEffect, useState } from "react";
import { aviso } from "../components/Aviso";
import { useParams } from "react-router-dom";
import {
  CheckCircle2,
  Circle,
  Smartphone,
  ThumbsUp,
  ThumbsDown,
  ShieldCheck,
  ListChecks,
  Camera,
  CalendarClock,
  PackageSearch,
  MessageCircle,
} from "lucide-react";
import { supabase, supabaseEnabled } from "../lib/supabase";
import { brl, formatDateTime, codigoOS } from "../lib/format";
import { OS_STATUS_META, type OSStatus } from "../lib/types";
import {
  tokenDoLink,
  problemaNoLink,
  linhaDoTempo,
  proximasEtapas,
  dataDaFoto,
  previsaoDeEntrega,
  linkFalarComLoja,
  corDaLoja,
  type PassoPublico,
} from "../lib/rastreio";
import { duracaoEscrita } from "../lib/video";
import { MarcaDaLoja } from "../components/MarcaDaLoja";

/** O site do sistema, no rodapé discreto */
const SITE_BALCAO = "https://sistema-ti-caixa.vercel.app/";

/** Uma peça dentro de um orçamento */
interface ItemPublico {
  descricao: string;
  quantidade: number;
  valor: number;
}

/**
 * Um orçamento alternativo, como o servidor devolve.
 *
 * O total já é o do SERVIÇO INTEIRO com esta opção — mão de obra e itens
 * comuns incluídos. É sobre este número que o cliente decide, e ele não tem
 * como somar de cabeça o que está espalhado em três lugares.
 */
interface OpcaoPublica {
  nome: string;
  total: number;
  escolhida: boolean;
  itens: ItemPublico[] | null;
}

/** Dados mínimos que o cliente pode ver — nada além disso sai do servidor */
interface OSPublica {
  numero: number;
  status: OSStatus;
  marca: string | null;
  modelo: string | null;
  primeiroNome: string | null;
  total: number | null;
  opcoes: OpcaoPublica[] | null;
  /**
   * Fotos do problema, escolhidas pela loja.
   *
   * Só as do laudo, nunca as da entrada: aquelas são a prova da loja sobre o
   * estado do aparelho e pegam a tela ligada, a tela de bloqueio, o papel de
   * parede. Quem faz esse corte é a função `consultar_os` — a lista já chega
   * aqui limpa. Ver supabase-migracao-fotos-laudo.sql.
   */
  fotos: string[] | null;
  /** Vídeos do laudo, com a capa de cada um. Mesmo corte das fotos. */
  videos: { url: string; capa?: string; duracao?: number }[] | null;
  atualizadoEm: string | null;
  /** Só status e data de cada passo. A nota interna é cortada no banco. */
  historico: PassoPublico[] | null;
  /** AAAA-MM-DD */
  previsao: string | null;
  /** Nome, logo, chave da cor e telefone do BALCÃO — o que sai na OS impressa */
  loja: string | null;
  logo: string | null;
  cor: string | null;
  whatsapp: string | null;
}

/** A loja vem do link; sem ela a consulta não retorna nada */
const lojaDoLink = (): string =>
  new URLSearchParams(window.location.hash.split("?")[1] || "").get("loja") || "";

export const Rastreio: React.FC = () => {
  const { codigo } = useParams();
  const [os, setOs] = useState<OSPublica | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  /** Nome do orçamento que o cliente marcou */
  const [escolha, setEscolha] = useState("");
  const loja = lojaDoLink();
  /**
   * Segredo da ordem, que vem no link.
   *
   * O número da OS é sequencial porque precisa ser lido no balcão — ele não
   * serve de senha. Sem este segredo, quem recebia um link trocava o número
   * e lia (ou CANCELAVA) a fila inteira da loja. Ver lib/rastreio.ts.
   */
  const token = tokenDoLink(window.location.hash);

  const numero = codigo ? parseInt(codigo.replace(/\D/g, ""), 10) : 0;

  const consultar = React.useCallback(async () => {
    if (!numero || !supabaseEnabled || !supabase) return;
    const incompleto = problemaNoLink(loja, token);
    if (incompleto) {
      setErro(incompleto);
      return;
    }
    setCarregando(true);
    setErro("");
    try {
      const { data, error } = await supabase.rpc("consultar_os", {
        p_loja: loja,
        p_numero: numero,
        p_token: token,
      });
      if (error) throw error;
      const linha = Array.isArray(data) ? data[0] : data;
      if (!linha) {
        setOs(null);
        setErro("Não achamos essa OS.");
      } else {
        const publica = linha as OSPublica;
        setOs(publica);
        // A sugestão da loja já vem marcada; o cliente troca se quiser.
        setEscolha((publica.opcoes || []).find((o) => o.escolhida)?.nome || "");
      }
    } catch {
      setErro("Não deu para abrir agora. Tenta de novo daqui a pouco.");
    } finally {
      setCarregando(false);
    }
  }, [numero, loja, token]);

  useEffect(() => {
    consultar();
  }, [consultar]);

  // Um orçamento só não é escolha: ele já está somado no total.
  const opcoes = (os?.opcoes || []).length >= 2 ? os?.opcoes || [] : [];
  const marcada = opcoes.find((o) => o.nome === escolha);
  const faltaEscolher = opcoes.length > 0 && !marcada;

  /** O total do orçamento marcado; sem opções, o total que o servidor mandou */
  const totalEscolhido = (): number =>
    marcada ? Number(marcada.total) || 0 : Number(os?.total) || 0;

  const decidir = async (aprovar: boolean) => {
    if (!os || enviando || !supabase) return;
    if (aprovar && faltaEscolher) {
      aviso.erro("Escolhe uma das opções antes.");
      return;
    }
    const texto = aprovar
      ? `Pode fazer o conserto por ${brl(totalEscolhido())}? A gente começa assim que você confirmar.`
      : "Certeza que não quer o conserto? O aparelho fica esperando você buscar.";
    if (!confirm(texto)) return;
    setEnviando(true);
    try {
      const { data, error } = await supabase.rpc("responder_orcamento", {
        p_loja: loja,
        p_numero: os.numero,
        p_aprovar: aprovar,
        p_escolha: marcada?.nome ?? null,
        p_token: token,
      });
      if (error || data === false) throw new Error();
      await consultar();
    } catch {
      aviso.erro("Sua resposta não chegou na loja. Tenta de novo.");
    } finally {
      setEnviando(false);
    }
  };

  const meta = os ? OS_STATUS_META[os.status] : null;
  /** Estado final: vira carimbo, e não faixa. Ver docs/DESIGN.md. */
  const final = os ? ["pronta", "entregue", "cancelada"].includes(os.status) : false;
  const passos = os ? linhaDoTempo(os.historico, os.status) : [];
  const futuro = os ? proximasEtapas(os.status) : [];
  const previsao = os ? previsaoDeEntrega(os.previsao, os.status) : null;
  const falar = os ? linkFalarComLoja(os.whatsapp, os.numero) : "";
  const cor = corDaLoja(os?.cor);

  return (
    <div className="min-h-screen bg-papel p-4 font-grotesca text-tinta">
      <div className="mx-auto max-w-lg py-8">
        {/*
          A loja no topo, e não o sistema: o cliente deixou o aparelho na
          "Silva Cell", não num software. Página com a marca de outra empresa
          parece golpe — e link de WhatsApp que parece golpe não é aberto.
          A cor dela vem só como faixa: o resto da página segue o papel.
        */}
        <header className="mb-5 overflow-hidden rounded-md border border-linha bg-cartao">
          {cor && <div className="h-1.5" style={{ backgroundColor: cor }} />}
          <div className="flex items-center gap-3 p-4">
            <MarcaDaLoja logoUrl={os?.logo || undefined} tamanho={44} />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold leading-tight">
                {os?.loja || "Seu aparelho na bancada"}
              </h1>
              <p className="text-sm text-tinta-suave">Tudo o que rolou com seu aparelho, sem precisar ligar</p>
            </div>
          </div>
        </header>

        {carregando ? (
          <div className="rounded-md border border-linha bg-cartao p-10 text-center text-tinta-suave">
            Procurando seu aparelho...
          </div>
        ) : !codigo ? (
          <div className="rounded-md border border-linha bg-cartao p-8 text-center text-tinta-suave">
            Abre o link que a loja te mandou no WhatsApp.
          </div>
        ) : erro || !os || !meta ? (
          <div className="rounded-md border border-linha bg-cartao p-8 text-center">
            <p className="font-semibold">{erro || "Não achamos essa OS."}</p>
            {/* "Confira o código" mandava conferir o que está certo: o código
                o cliente tem. O que falta é o link inteiro, e quem resolve
                isso é a loja. */}
            <p className="mt-1 text-sm text-tinta-suave">
              Usa sempre o link que a loja mandou. Não abriu? Pede um novo pra loja.
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-linha bg-cartao">
            {/* Cabeçalho da via: número no canto, como no papel da OS */}
            <div className="flex items-start justify-between gap-3 border-b border-dashed border-linha p-5">
              <div className="min-w-0">
                <p className="text-lg font-bold">
                  Oi{os.primeiroNome ? `, ${os.primeiroNome}` : ""}!
                </p>
                <p className="mt-1 flex items-center gap-2 text-tinta-suave">
                  <Smartphone size={16} className="shrink-0" />
                  <span className="truncate">
                    {[os.marca, os.modelo].filter(Boolean).join(" ") || "Seu aparelho"}
                  </span>
                </p>
              </div>
              <p className="valor shrink-0 rounded bg-concreto px-2 py-1 text-sm font-semibold">
                {codigoOS(os.numero)}
              </p>
            </div>

            <div className="p-5">
              {/*
                A situação é o que a pessoa abriu esta página para ver, e ela
                abre no celular, muitas vezes na rua. Cor cheia e letra grande:
                o crachá pálido das listas some no meio do resto da tela.

                Estado final vira carimbo — é o "PRONTO" batido no papel, a
                única coisa da página que grita.
              */}
              {final ? (
                <div className="mb-6 py-3 text-center">
                  <p className={`carimbo text-2xl ${meta.carimbo}`}>
                    {meta.destaque}
                  </p>
                  <p className="mt-4 text-sm text-tinta-suave">{meta.cliente}</p>
                </div>
              ) : (
                <div className={`mb-6 rounded-md p-5 text-center ${meta.carimbo}`}>
                  <p className="text-2xl font-extrabold uppercase leading-tight tracking-wide">
                    {meta.destaque}
                  </p>
                  <p className="mt-2 text-sm font-medium opacity-95">{meta.cliente}</p>
                </div>
              )}

              {/*
                Aguardando peça é o status que mais gera ligação: o aparelho
                "sumiu" da bancada. Dizer que depende de fora, e para quando
                está previsto, responde antes da pergunta.
              */}
              {os.status === "aguardando_peca" && (
                <div className="-mt-3 mb-6 flex gap-3 rounded-md border-2 border-status-peca p-4">
                  <PackageSearch size={22} className="mt-0.5 shrink-0" />
                  <p className="text-sm">
                    <b>Isso não depende da bancada.</b> Chegou a peça, seu aparelho volta direto
                    pro conserto.
                  </p>
                </div>
              )}

              {previsao && (
                <p
                  className={`-mt-3 mb-6 flex items-center justify-center gap-2 rounded-md p-3 text-center text-sm font-semibold ${
                    previsao.atrasada ? "border-2 border-sinal" : "bg-concreto"
                  }`}
                >
                  <CalendarClock size={16} className="shrink-0" /> {previsao.texto}
                </p>
              )}

              {/*
                A foto do problema, antes de qualquer preço.

                "A placa está queimada, R$ 480" é uma frase que o cliente tem
                que acreditar: ele não abriu o aparelho, não viu nada, e quem
                está falando é quem ganha com o conserto. A foto de perto da
                trilha queimada é a mesma frase sem precisar de fé — e por isso
                vem ANTES do valor, não depois. Depois do número ela vira
                justificativa; antes, ela é o motivo.

                O corte de quais fotos saem é feito no banco, em
                `consultar_os`. Aqui só se desenha o que chegou.
              */}
              {((os.fotos || []).length > 0 || (os.videos || []).length > 0) && (
                <section className="mb-6">
                  <h2 className="rotulo flex items-center gap-1.5">
                    <Camera size={14} /> O que a gente achou
                  </h2>
                  <p className="mb-3 mt-0.5 text-xs text-tinta-suave">
                    {(os.videos || []).length > 0
                      ? "Toca na foto pra ver de perto, ou no vídeo pra assistir."
                      : "Toca na foto pra ver de perto."}
                  </p>

                  {/*
                    O VÍDEO NÃO BAIXA ATÉ A PESSOA TOCAR NELE.

                    É isto que faz a página abrir rápido, e não o arquivo ser
                    pequeno.

                    `preload="none"` COM CAPA, e não "metadata". Medido no
                    Chrome: com "metadata" o navegador pede o arquivo assim que
                    a página abre, e um MP4 de celular guarda o índice no FIM —
                    então, dependendo de como o servidor responde, esse pedido
                    arrasta o arquivo inteiro. São dezenas de MB no 4G de quem
                    só queria ver se o conserto ficou pronto. Com "none" o
                    navegador não faz pedido nenhum: zero byte até o play.

                    A capa é o que torna isso possível. Ela é um quadro do
                    próprio vídeo em JPEG de poucos KB, e é o que o navegador
                    desenha. SEM capa não dá para usar "none" — sobraria um
                    retângulo preto, que numa página de assistência parece
                    defeito do sistema. Por isso a escolha depende dela.

                    `playsInline` é obrigatório: sem ele o iPhone sequestra a
                    tela toda no play, e a pessoa perde de vista o orçamento
                    que estava lendo.
                  */}
                  {(os.videos || []).map((v) => (
                    <div key={v.url} className="relative mb-2">
                      <video
                        src={v.url}
                        poster={v.capa || undefined}
                        controls
                        playsInline
                        preload={v.capa ? "none" : "metadata"}
                        className="w-full rounded-md border border-linha bg-tinta"
                      />
                      {/* A duração vem do nosso cadastro: com preload="none" o
                          player só a descobriria depois do play, e um vídeo sem
                          tempo à vista é um vídeo que a pessoa não sabe se vale
                          o dado móvel dela. */}
                      {duracaoEscrita(v.duracao) && (
                        <span className="valor pointer-events-none absolute right-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                          {duracaoEscrita(v.duracao)}
                        </span>
                      )}
                    </div>
                  ))}

                  {(os.fotos || []).length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {(os.fotos || []).map((url) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="block overflow-hidden rounded border border-linha"
                        >
                          <img
                            src={url}
                            alt="Foto do aparelho tirada pela loja"
                            loading="lazy"
                            className="aspect-square w-full object-cover"
                          />
                          {/* A hora da foto é o que a torna prova: "tirada
                              na bancada, dia 21 às 14:30". Sem hora legível
                              no nome do arquivo, não aparece nada. */}
                          {dataDaFoto(url) && (
                            <span className="valor block bg-concreto px-1 py-0.5 text-center text-[10px] text-tinta-suave">
                              {formatDateTime(dataDaFoto(url))}
                            </span>
                          )}
                        </a>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/*
                Escolha do orçamento. Vem ANTES do valor porque é ela que
                define o valor: mostrar o total primeiro e a escolha depois
                fazia o número mudar debaixo do olho do cliente.
              */}
              {opcoes.length > 0 && (
                <section className="mb-6">
                  <h2 className="rotulo flex items-center gap-1.5">
                    <ListChecks size={14} /> Escolhe como quer o conserto
                  </h2>
                  <p className="mb-3 mt-0.5 text-xs text-tinta-suave">
                    Cada preço já é o serviço inteiro, sem surpresa.
                  </p>
                  <div className="space-y-2">
                    {opcoes.map((op) => {
                      const ativa = escolha === op.nome;
                      return (
                        <label
                          key={op.nome}
                          className={`flex cursor-pointer gap-3 rounded-md border-2 p-3 ${
                            ativa ? "border-sinal bg-sinal/5" : "border-linha bg-cartao"
                          }`}
                        >
                          <input
                            type="radio"
                            name="opcao-orcamento"
                            className="mt-1 h-4 w-4 shrink-0 accent-[rgb(var(--sinal))]"
                            checked={ativa}
                            onChange={() => setEscolha(op.nome)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <b className="text-sm">{op.nome}</b>
                              <b className="valor shrink-0 text-base">
                                {brl(Number(op.total) || 0)}
                              </b>
                            </span>
                            {/* Sem os itens o cliente escolhe entre dois preços
                                sem saber o que muda de um para o outro. */}
                            <span className="mt-1 block space-y-0.5 text-xs text-tinta-suave">
                              {(op.itens || []).map((i, n) => (
                                <span key={n} className="flex justify-between gap-2">
                                  <span>
                                    {i.descricao}
                                    {Number(i.quantidade) > 1 ? ` (${i.quantidade}x)` : ""}
                                  </span>
                                  <span className="valor shrink-0">{brl(Number(i.valor) || 0)}</span>
                                </span>
                              ))}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* O total fecha a conta como no papel: depois do picote. */}
              {os.total != null && os.total > 0 && (
                <div className="mb-6 flex items-baseline justify-between gap-3 border-t border-dashed border-linha pt-4">
                  <p className="rotulo">
                    {opcoes.length > 0 ? "Fica em" : "Valor do conserto"}
                  </p>
                  <p className="valor text-3xl font-semibold text-sinal">
                    {brl(totalEscolhido())}
                  </p>
                </div>
              )}

              {os.status === "aguardando_aprovacao" && (
                <div className="mb-6 rounded-md border-2 border-status-aprovacao p-4">
                  <p className="mb-3 text-center text-base font-bold">Pode fazer o conserto?</p>
                  {faltaEscolher && (
                    <p className="mb-3 text-center text-xs text-tinta-suave">
                      Escolhe uma das opções aí em cima antes.
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      className="btn flex-1 rounded-md bg-sinal text-sinal-tinta hover:bg-sinal/90 focus-visible:ring-sinal"
                      disabled={enviando || faltaEscolher}
                      onClick={() => decidir(true)}
                    >
                      <ThumbsUp size={16} /> Pode fazer
                    </button>
                    <button
                      className="btn flex-1 rounded-md border border-linha bg-cartao text-tinta hover:bg-concreto focus-visible:ring-sinal"
                      disabled={enviando}
                      onClick={() => decidir(false)}
                    >
                      <ThumbsDown size={16} /> Não, obrigado
                    </button>
                  </div>
                </div>
              )}

              {/*
                A linha do tempo de verdade, com data e hora de cada passo —
                e não um fluxo fixo desenhado. Ida e volta aparece
                ("em reparo → aguardando peça → em reparo"): é ela que explica
                o atraso sem ninguém precisar ligar. O que ainda vem fica em
                cinza, sem hora.
              */}
              <section>
                <h2 className="rotulo mb-3">O caminho do seu aparelho</h2>
                <ol>
                  {passos.map((p, i) => {
                    const atual = i === passos.length - 1;
                    const ultimoDaLista = atual && futuro.length === 0;
                    return (
                      <li key={`${p.status}-${i}`} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${OS_STATUS_META[p.status].carimbo}`}
                          >
                            <CheckCircle2 size={16} />
                          </div>
                          {!ultimoDaLista && <div className="w-0.5 flex-1 bg-tinta/30" />}
                        </div>
                        <div className="min-w-0 pb-4">
                          <p className={atual ? "font-bold" : ""}>{OS_STATUS_META[p.status].label}</p>
                          {p.data && (
                            <p className="valor text-xs text-tinta-suave">{formatDateTime(p.data)}</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                  {futuro.map((s, i) => (
                    <li key={s} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-linha bg-concreto text-tinta-suave">
                          <Circle size={10} />
                        </div>
                        {i < futuro.length - 1 && <div className="w-0.5 flex-1 bg-linha" />}
                      </div>
                      <p className="pb-4 text-tinta-suave">{OS_STATUS_META[s].label}</p>
                    </li>
                  ))}
                </ol>
              </section>

              {/* O número da OS já vai na mensagem: sem ele, a primeira
                  resposta da loja é sempre "qual o número?". */}
              {falar && (
                <a
                  href={falar}
                  target="_blank"
                  rel="noreferrer"
                  className="btn mt-2 w-full rounded-md border border-linha bg-cartao text-tinta hover:bg-concreto focus-visible:ring-sinal"
                >
                  <MessageCircle size={16} /> Falar com a loja
                </a>
              )}

              <p className="mt-5 text-center text-xs text-tinta-suave">
                Atualizado em <span className="valor">{formatDateTime(os.atualizadoEm || undefined)}</span>
              </p>
            </div>
          </div>
        )}

        <p className="mt-6 flex items-center justify-center gap-1 text-center text-xs text-tinta-suave">
          <ShieldCheck size={12} /> Este link é só seu. A página não mostra senha nem dado pessoal.
        </p>
        <p className="mt-2 text-center text-[11px] text-tinta-suave">
          feito com{" "}
          <a href={SITE_BALCAO} target="_blank" rel="noreferrer" className="font-semibold underline">
            Balcão
          </a>
        </p>
      </div>
    </div>
  );
};

