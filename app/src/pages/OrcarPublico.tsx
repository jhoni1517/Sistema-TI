import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ChevronLeft, MessageCircle, CalendarCheck, CheckCircle2, MapPin, Clock } from "lucide-react";
import { supabase, supabaseEnabled } from "../lib/supabase";
import { MarcaDaLoja } from "../components/MarcaDaLoja";
import { brl, whatsappLink } from "../lib/format";
import { PROBLEMAS, tabelaSegura, type Problema, type TabelaServicos } from "../lib/tabela-precos";
import {
  marcasDaTabela,
  modelosDaMarca,
  precoAPartirDe,
  horariosLivres,
  agendaSegura,
  problemaNoPedido,
  mensagemWhatsApp,
  corSegura,
  textoSobre,
  type AgendaSite,
} from "../lib/orcamento-online";

interface DadosLoja {
  loja: string;
  logo: string | null;
  cor: string | null;
  whatsapp: string | null;
  endereco: string | null;
  horario: string | null;
  tabela: TabelaServicos;
  agenda: AgendaSite | null;
  hoje: string;
  agora: string;
  ocupados: { data: string; hora: string }[];
}

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const rotuloDia = (data: string, hoje: string) => {
  const [a, m, d] = data.split("-").map(Number);
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return `${data === hoje ? "hoje" : DIAS[dow]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
};

/**
 * Orçamento pelo site da loja. Aberta sem login: tudo o que chega aqui
 * passou pela função orcamento_publico, e todo pedido volta pela
 * pedir_orcamento, que confere de novo (preço e horário inclusive).
 */
export const OrcarPublico: React.FC = () => {
  const { loja = "" } = useParams();
  const [d, setD] = useState<DadosLoja | null | undefined>(undefined);
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState<{ id: string; marca: string; modelo: string } | null>(null);
  const [livre, setLivre] = useState(false);
  const [problema, setProblema] = useState<Problema | "">("");
  const [detalhe, setDetalhe] = useState("");
  const [agendando, setAgendando] = useState(false);
  const [dia, setDia] = useState("");
  const [hora, setHora] = useState("");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [feito, setFeito] = useState(false);

  useEffect(() => {
    if (!supabaseEnabled || !supabase) return setD(null);
    supabase.rpc("orcamento_publico", { p_loja: loja }).then(({ data, error }) => {
      if (error || !data) return setD(null);
      const x = data as DadosLoja;
      setD({ ...x, tabela: tabelaSegura(x.tabela), agenda: x.agenda ? agendaSegura(x.agenda) : null, ocupados: x.ocupados || [] });
    });
  }, [loja]);

  const cor = corSegura(d?.cor);
  const sobre = textoSobre(cor);
  const marcas = useMemo(() => (d ? marcasDaTabela(d.tabela) : []), [d]);
  const modelos = useMemo(() => (d && marca ? modelosDaMarca(d.tabela, marca) : []), [d, marca]);
  const preco = d && modelo && problema && !livre ? precoAPartirDe(d.tabela, modelo.id, problema) : null;
  const livres = useMemo(() => (d?.agenda ? horariosLivres(d.agenda, d.ocupados, d.hoje, d.agora, 7) : []), [d]);
  const horasDoDia = livres.find((x) => x.data === dia)?.horas || [];

  if (d === undefined) return <Moldura><p className="text-center text-tinta-suave">Abrindo...</p></Moldura>;
  if (d === null)
    return (
      <Moldura>
        <div className="rounded-md border border-linha bg-cartao p-6 text-center">
          <p className="font-semibold">Esta página de orçamento não está disponível.</p>
          <p className="mt-1 text-sm text-tinta-suave">Peça o link de novo para a loja.</p>
        </div>
      </Moldura>
    );

  const pedido = {
    marca: modelo?.marca || marca,
    modelo: modelo?.modelo || "",
    problema: problema || "outro",
    detalhe,
    preco,
    data: agendando ? dia : null,
    hora: agendando ? hora : null,
  };

  const enviar = async (canal: "agenda" | "whatsapp") => {
    const falta = problemaNoPedido({ nome, telefone, modelo: pedido.modelo }, canal);
    if (falta) return setErro(falta);
    if (canal === "agenda" && (!dia || !hora)) return setErro("Escolha o dia e o horário.");
    setErro("");
    const chamada = supabase!.rpc("pedir_orcamento", {
      p_loja: loja,
      p_canal: canal,
      p_nome: nome,
      p_telefone: telefone,
      p_modelo_id: livre ? "" : modelo?.id || "",
      p_marca: pedido.marca,
      p_modelo: pedido.modelo,
      p_problema: pedido.problema,
      p_detalhe: detalhe,
      p_data: canal === "agenda" ? dia : "",
      p_hora: canal === "agenda" ? hora : "",
    });
    // WhatsApp: o link abre na hora (esperar a resposta faz o celular
    // bloquear a janela nova). O pedido vai junto, em segundo plano.
    if (canal === "whatsapp") return void chamada.then(() => undefined);
    setEnviando(true);
    const { error } = await chamada;
    setEnviando(false);
    if (error) {
      setErro(error.message || "Não deu para agendar. Tente de novo ou chame no WhatsApp.");
      // Horário tomado por outro: some da lista.
      if (/ocupado/i.test(error.message)) {
        setD({ ...d, ocupados: [...d.ocupados, { data: dia, hora }] });
        setHora("");
      }
      return;
    }
    setFeito(true);
  };

  const zap = d.whatsapp && d.whatsapp.length >= 10 ? whatsappLink(d.whatsapp, mensagemWhatsApp(pedido)) : "";
  const botao = { backgroundColor: cor, color: sobre };

  const voltar = () => {
    setErro("");
    if (agendando) return setAgendando(false);
    if (problema) return setProblema("");
    if (modelo || livre) {
      setModelo(null);
      setLivre(false);
      return;
    }
    setMarca("");
  };

  return (
    <Moldura cor={cor}>
      <div className="overflow-hidden rounded-md border border-linha bg-cartao">
        <div className="flex items-center gap-3 border-b border-linha p-4">
          <MarcaDaLoja logoUrl={d.logo || undefined} tamanho={44} />
          <div className="min-w-0">
            <p className="font-bold">{d.loja}</p>
            <p className="text-sm text-tinta-suave">Orçamento na hora</p>
          </div>
        </div>

        <div className="p-4">
          {feito ? (
            <div className="py-4 text-center">
              <CheckCircle2 className="mx-auto" size={44} style={{ color: cor }} />
              <p className="mt-2 text-xl font-bold">Avaliação agendada</p>
              <p className="mt-1 text-tinta-suave">
                {rotuloDia(dia, d.hoje)} às {hora}. Traga o aparelho{d.endereco ? ` em ${d.endereco}` : ""}.
              </p>
              {zap && (
                <a className="mt-4 inline-flex items-center gap-2 rounded-md px-4 py-3 font-semibold" style={botao} href={zap} target="_blank" rel="noreferrer">
                  <MessageCircle size={18} /> Avisar a loja no WhatsApp
                </a>
              )}
            </div>
          ) : (
            <>
              {(marca || livre) && (
                <button className="mb-3 inline-flex items-center gap-1 text-sm text-tinta-suave" onClick={voltar}>
                  <ChevronLeft size={16} /> Voltar
                </button>
              )}

              {!marca && !livre ? (
                <Passo titulo="Qual é a marca do aparelho?">
                  <Grade>
                    {marcas.map((m) => (
                      <Opcao key={m} onClick={() => setMarca(m)}>
                        {m}
                      </Opcao>
                    ))}
                  </Grade>
                  <button className="mt-3 text-sm underline" onClick={() => setLivre(true)}>
                    Meu aparelho não está na lista
                  </button>
                </Passo>
              ) : !modelo && !livre ? (
                <Passo titulo={`Qual ${marca}?`}>
                  <Grade>
                    {modelos.map((m) => (
                      <Opcao key={m.id} onClick={() => setModelo(m)}>
                        {m.modelo}
                      </Opcao>
                    ))}
                  </Grade>
                  <button className="mt-3 text-sm underline" onClick={() => setLivre(true)}>
                    Meu modelo não está na lista
                  </button>
                </Passo>
              ) : livre && !modelo ? (
                <Passo titulo="Qual é o aparelho?">
                  <input className="input" value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="Marca (ex.: Xiaomi)" />
                  <input
                    className="input mt-2"
                    placeholder="Modelo (ex.: Redmi Note 13)"
                    onKeyDown={(e) => {
                      const v = (e.target as HTMLInputElement).value.trim();
                      if (e.key === "Enter" && v) setModelo({ id: "", marca, modelo: v });
                    }}
                    onBlur={(e) => e.target.value.trim() && setModelo({ id: "", marca, modelo: e.target.value.trim() })}
                  />
                  <p className="mt-2 text-xs text-tinta-suave">Sem o modelo na lista, o preço sai depois da avaliação.</p>
                </Passo>
              ) : !problema ? (
                <Passo titulo={`O que aconteceu com o ${modelo?.modelo}?`}>
                  <Grade>
                    {PROBLEMAS.map((p) => (
                      <Opcao key={p.id} onClick={() => setProblema(p.id)}>
                        {p.nome}
                      </Opcao>
                    ))}
                  </Grade>
                </Passo>
              ) : (
                <div>
                  <p className="text-sm text-tinta-suave">
                    {[pedido.marca, pedido.modelo].filter(Boolean).join(" ")} ·{" "}
                    {PROBLEMAS.find((p) => p.id === problema)?.nome}
                  </p>
                  {preco ? (
                    <>
                      <p className="mt-1 text-sm">a partir de</p>
                      <p className="valor text-4xl font-bold" style={{ color: cor }}>
                        {brl(preco)}
                      </p>
                      <p className="mt-1 text-xs text-tinta-suave">
                        Valor inicial. O preço final sai na avaliação, com o aparelho na mão.
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-lg font-bold">O preço sai na avaliação, sem compromisso.</p>
                  )}

                  <textarea
                    className="input mt-3"
                    rows={2}
                    placeholder="Quer contar mais? (opcional)"
                    value={detalhe}
                    maxLength={300}
                    onChange={(e) => setDetalhe(e.target.value)}
                  />

                  {agendando ? (
                    <div className="mt-4 space-y-3">
                      <p className="font-semibold">Escolha o dia</p>
                      <div className="flex flex-wrap gap-2">
                        {livres.map((x) => (
                          <Chip key={x.data} ativo={dia === x.data} cor={cor} onClick={() => { setDia(x.data); setHora(""); }}>
                            {rotuloDia(x.data, d.hoje)}
                          </Chip>
                        ))}
                      </div>
                      {dia && (
                        <>
                          <p className="font-semibold">Horário</p>
                          <div className="flex flex-wrap gap-2">
                            {horasDoDia.map((h) => (
                              <Chip key={h} ativo={hora === h} cor={cor} onClick={() => setHora(h)}>
                                {h}
                              </Chip>
                            ))}
                          </div>
                        </>
                      )}
                      <input className="input" placeholder="Seu nome" value={nome} onChange={(e) => setNome(e.target.value)} />
                      <input className="input" inputMode="tel" placeholder="Seu WhatsApp com DDD" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
                      {erro && <p className="text-sm font-semibold text-red-700">{erro}</p>}
                      <button className="w-full rounded-md px-4 py-3 text-lg font-bold disabled:opacity-60" style={botao} disabled={enviando} onClick={() => enviar("agenda")}>
                        {enviando ? "Agendando..." : "Confirmar avaliação"}
                      </button>
                    </div>
                  ) : (
                    <div className="mt-4 space-y-2">
                      {d.agenda && livres.length > 0 && (
                        <button className="flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-lg font-bold" style={botao} onClick={() => setAgendando(true)}>
                          <CalendarCheck size={20} /> Agendar avaliação
                        </button>
                      )}
                      {zap && (
                        <a
                          className="flex w-full items-center justify-center gap-2 rounded-md border-2 px-4 py-3 text-lg font-bold"
                          style={{ borderColor: cor, color: "inherit" }}
                          href={zap}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => enviar("whatsapp")}
                        >
                          <MessageCircle size={20} /> Falar no WhatsApp
                        </a>
                      )}
                      {erro && <p className="text-sm font-semibold text-red-700">{erro}</p>}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {(d.endereco || d.horario) && (
          <div className="space-y-1 border-t border-linha p-4 text-sm text-tinta-suave">
            {d.endereco && (
              <p className="flex items-center gap-2">
                <MapPin size={15} /> {d.endereco}
              </p>
            )}
            {d.horario && (
              <p className="flex items-center gap-2">
                <Clock size={15} /> {d.horario}
              </p>
            )}
          </div>
        )}
      </div>
    </Moldura>
  );
};

const Moldura: React.FC<{ cor?: string; children: React.ReactNode }> = ({ cor, children }) => (
  <div className="min-h-screen bg-papel font-grotesca text-tinta">
    {cor && <div className="h-2" style={{ backgroundColor: cor }} />}
    <div className="mx-auto max-w-lg p-4 py-6">{children}</div>
  </div>
);

const Passo: React.FC<{ titulo: string; children: React.ReactNode }> = ({ titulo, children }) => (
  <div>
    <h1 className="mb-3 text-xl font-bold">{titulo}</h1>
    {children}
  </div>
);

const Grade: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="grid grid-cols-2 gap-2">{children}</div>;

const Opcao: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button className="rounded-md border border-linha bg-papel px-3 py-3 text-left font-semibold hover:border-tinta" onClick={onClick}>
    {children}
  </button>
);

const Chip: React.FC<{ ativo: boolean; cor: string; onClick: () => void; children: React.ReactNode }> = ({ ativo, cor, onClick, children }) => (
  <button
    className="valor rounded-md border px-3 py-2 text-sm font-semibold"
    style={ativo ? { backgroundColor: cor, borderColor: cor, color: textoSobre(cor) } : undefined}
    onClick={onClick}
  >
    {children}
  </button>
);
