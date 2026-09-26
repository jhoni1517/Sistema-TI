import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Play, Pause, PackageSearch, CheckCircle2, Moon, Sun, ArrowLeft } from "lucide-react";
import { useApp } from "../store/AppStore";
import { aviso } from "../components/Aviso";
import { carregarSessao } from "../lib/auth";
import { nowISO, normalizar } from "../lib/format";
import { perguntaAntesDeConcluir } from "../lib/backup";
import { OS_STATUS_META, type OrdemServico, type OSStatus } from "../lib/types";
import { minhasOS, tecnicosDasOS, iniciar, pausar, pausarCom, rodando, tempoDeBancada, relogio, formatarTempo, doTecnico } from "../lib/bancada";

const CHAVE_TECNICO = "sistema-ti:bancada-tecnico";
const CHAVE_ESCURO = "sistema-ti:bancada-escuro";
const ler = (k: string) => {
  try {
    return localStorage.getItem(k) || "";
  } catch {
    return "";
  }
};
const gravar = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    // Navegador sem armazenamento: vale só nesta visita.
  }
};

/**
 * Modo bancada: o celular apoiado na bancada, só as OS do técnico, botões
 * enormes e o cronômetro. Fora do Layout: menu lateral aqui é espaço
 * roubado dos botões. Regras em lib/bancada.ts.
 */
export const ModoBancada: React.FC = () => {
  const { ordens, clientes, saveOrdem } = useApp();
  const tecnicos = useMemo(() => tecnicosDasOS(ordens), [ordens]);
  const [tecnico, setTecnico] = useState(() => ler(CHAVE_TECNICO));
  const [escuro, setEscuro] = useState(() => ler(CHAVE_ESCURO) !== "nao");
  const [agora, setAgora] = useState(() => nowISO());
  const [gravando, setGravando] = useState("");

  // Sem escolha guardada, tenta o nome de quem entrou.
  useEffect(() => {
    if (tecnico) return;
    carregarSessao()
      .then((s) => {
        const nome = s?.perfil?.nome || "";
        const achado = tecnicos.find((t) => normalizar(t) === normalizar(nome));
        if (achado) setTecnico(achado);
      })
      .catch(() => undefined);
  }, [tecnico, tecnicos]);

  const lista = useMemo(() => minhasOS(ordens, tecnico), [ordens, tecnico]);
  const algumRodando = lista.some(rodando);

  // O relógio só anda quando tem cronômetro ligado: sem ele, nada a atualizar.
  useEffect(() => {
    if (!algumRodando) return;
    const t = setInterval(() => setAgora(nowISO()), 1000);
    return () => clearInterval(t);
  }, [algumRodando]);

  const agir = async (o: OrdemServico, acao: "iniciar" | "pausar" | OSStatus) => {
    if (gravando) return;
    if (acao === "pronta") {
      const pergunta = perguntaAntesDeConcluir(o);
      if (pergunta && !confirm(pergunta)) return;
    }
    setGravando(o.id);
    const t = nowISO();
    try {
      if (acao === "iniciar") {
        // Um cronômetro por técnico: a que estava rodando pausa antes.
        for (const outra of ordens.filter((x) => x.id !== o.id && rodando(x) && doTecnico(x, tecnico))) {
          await saveOrdem({ ...pausar(outra, t), atualizadoEm: t });
        }
        await saveOrdem(iniciar(o, t));
      } else if (acao === "pausar") {
        await saveOrdem({ ...pausar(o, t), atualizadoEm: t });
      } else {
        await saveOrdem(pausarCom(o, acao, t));
        if (acao === "pronta") aviso.sucesso(`OS ${o.numero} pronta. ${formatarTempo(tempoDeBancada(o, t))} de bancada.`);
      }
      setAgora(t);
    } catch (e) {
      aviso.erro("Não salvou: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setGravando("");
    }
  };

  const fundo = escuro ? "bg-stone-950 text-white" : "bg-papel text-tinta";
  const cartao = escuro ? "border-stone-700 bg-stone-900" : "border-linha bg-cartao";
  const suave = escuro ? "text-stone-400" : "text-tinta-suave";

  return (
    <div className={`min-h-screen ${fundo} p-3 font-grotesca sm:p-5`}>
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center gap-2">
          <Link to="/" className={`rounded-md border p-3 ${cartao}`} aria-label="Voltar ao sistema">
            <ArrowLeft size={22} />
          </Link>
          <select
            className={`min-w-0 flex-1 rounded-md border p-3 text-lg font-bold ${cartao}`}
            value={tecnico}
            onChange={(e) => {
              setTecnico(e.target.value);
              gravar(CHAVE_TECNICO, e.target.value);
            }}
            aria-label="Técnico"
          >
            <option value="">Quem está na bancada?</option>
            {tecnicos.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            className={`rounded-md border p-3 ${cartao}`}
            aria-label={escuro ? "Tema claro" : "Tema escuro"}
            onClick={() => {
              setEscuro(!escuro);
              gravar(CHAVE_ESCURO, escuro ? "nao" : "sim");
            }}
          >
            {escuro ? <Sun size={22} /> : <Moon size={22} />}
          </button>
        </div>

        {!tecnico ? (
          <p className={`py-16 text-center text-xl ${suave}`}>Escolha o técnico acima. Só aparecem as OS dele.</p>
        ) : lista.length === 0 ? (
          <p className={`py-16 text-center text-xl ${suave}`}>Nenhuma OS aberta para {tecnico}.</p>
        ) : (
          <div className="space-y-4">
            {lista.map((o) => {
              const cli = clientes.find((c) => c.id === o.clienteId);
              const liga = rodando(o);
              const seg = tempoDeBancada(o, agora);
              const ocupado = gravando === o.id;
              return (
                <div key={o.id} className={`rounded-xl border-2 p-4 ${liga ? "border-sinal" : cartao}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="valor text-2xl font-bold">OS {o.numero}</p>
                      <p className="text-xl font-semibold">{[o.marca, o.modelo].filter(Boolean).join(" ") || o.tipoAparelho}</p>
                      <p className={`text-base ${suave}`}>
                        {cli?.nome || "Cliente"} · {OS_STATUS_META[o.status].label}
                      </p>
                      {o.defeitoRelatado && <p className="mt-1 text-lg">{o.defeitoRelatado}</p>}
                    </div>
                    <p className={`valor shrink-0 text-3xl font-bold tabular-nums ${liga ? "text-sinal" : suave}`}>{relogio(seg)}</p>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    {liga ? (
                      <Botao cor="bg-amber-500 text-stone-950" disabled={ocupado} onClick={() => agir(o, "pausar")}>
                        <Pause size={28} /> Pausar
                      </Botao>
                    ) : (
                      <Botao cor="bg-sinal text-white" disabled={ocupado} onClick={() => agir(o, "iniciar")}>
                        <Play size={28} /> Iniciar
                      </Botao>
                    )}
                    <Botao cor="bg-status-pronta text-white" disabled={ocupado} onClick={() => agir(o, "pronta")}>
                      <CheckCircle2 size={28} /> Pronto
                    </Botao>
                    <Botao
                      cor={escuro ? "bg-stone-700 text-white" : "bg-stone-200 text-stone-900"}
                      disabled={ocupado || o.status === "aguardando_peca"}
                      onClick={() => agir(o, "aguardando_peca")}
                      largo
                    >
                      <PackageSearch size={26} /> {o.status === "aguardando_peca" ? "Aguardando peça" : "Falta peça"}
                    </Botao>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const Botao: React.FC<{ cor: string; onClick: () => void; disabled?: boolean; largo?: boolean; children: React.ReactNode }> = ({
  cor,
  onClick,
  disabled,
  largo,
  children,
}) => (
  <button
    className={`flex min-h-[4.5rem] items-center justify-center gap-2 rounded-xl text-xl font-bold active:scale-[0.98] disabled:opacity-50 ${cor} ${largo ? "col-span-2" : ""}`}
    disabled={disabled}
    onClick={onClick}
  >
    {children}
  </button>
);
