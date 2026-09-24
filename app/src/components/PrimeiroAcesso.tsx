import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, FileSpreadsheet, Package, X } from "lucide-react";
import { useApp } from "../store/AppStore";
import { ImagemUpload } from "./ImagemUpload";
import { InputNumero } from "./ui";
import { aviso } from "./Aviso";
import { obterLoja } from "../lib/db";
import { RAMO_META, temModulo } from "../lib/ramos";
import { uid, nowISO, abrirWhatsapp, codigoOS, soDigitos } from "../lib/format";
import { linkDeRastreio } from "../lib/rastreio";
import { proximoNumero, problemaParaNumerar } from "../lib/numeracao";
import {
  PASSOS,
  progresso,
  proximoPasso,
  passoAnterior,
  indiceDoPasso,
  primeirosPassos,
  mostrarPrimeirosPassos,
  type PassoId,
  type EstadoOnboarding,
} from "../lib/onboarding";
import {
  lerArquivoPlanilha,
  sugerirMapa,
  temCabecalho,
  linhasParaProdutos,
  CAMPOS_PRODUTO,
  type Linha,
  type Mapa,
  type CampoProduto,
} from "../lib/planilha";
import type { OrdemServico, Produto } from "../lib/types";

/**
 * O assistente do primeiro acesso. Quem decide se abre é
 * `deveAbrirAssistente` (lib/onboarding.ts); aqui é só a tela.
 */
export const PrimeiroAcesso: React.FC<{ onFechar: () => void }> = ({ onFechar }) => {
  const app = useApp();
  const { config, saveConfig } = app;
  const navigate = useNavigate();
  const estado: EstadoOnboarding = config.primeirosPassos || {};
  const [passo, setPasso] = useState<PassoId>(estado.passo || "loja");
  const temOS = temModulo(app.ramo, "os");

  // Cada passo fica gravado: fechou a aba no meio, volta no mesmo lugar.
  const guardar = (mudou: Partial<EstadoOnboarding>) =>
    saveConfig({
      ...config,
      primeirosPassos: { inicio: estado.inicio || nowISO().slice(0, 10), ...estado, ...mudou },
    });

  const ir = (p: PassoId) => {
    setPasso(p);
    guardar({ passo: p });
  };

  const encerrar = () => {
    guardar({ visto: true, passo: undefined });
    onFechar();
  };

  const i = indiceDoPasso(passo);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/60 sm:items-center sm:p-4">
      <div className="flex max-h-[100dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-md bg-cartao text-tinta shadow-xl sm:max-h-[92vh] sm:rounded-md">
        <div className="border-b border-linha px-5 pb-4 pt-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-tinta-suave">
              Passo {i + 1} de {PASSOS.length} · {PASSOS[i].titulo}
            </p>
            <button onClick={encerrar} className="text-sm text-tinta-suave hover:text-tinta" aria-label="Pular">
              {passo === "pronto" ? <X size={18} /> : "Pular"}
            </button>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-concreto">
            <div className="h-1.5 rounded-full bg-sinal transition-all" style={{ width: `${Math.max(4, progresso(passo))}%` }} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {passo === "loja" && <PassoLoja />}
          {passo === "ramo" && <PassoRamo />}
          {passo === "produto" && <PassoProduto />}
          {passo === "primeira" && (temOS ? <PassoOS /> : <PassoVenda onIr={() => { encerrar(); navigate("/pdv"); }} />)}
          {passo === "pronto" && <PassoPronto temOS={temOS} onViu={() => guardar({ viuRastreio: true })} />}
        </div>

        <div className="flex items-center gap-3 border-t border-linha px-5 py-4">
          {i > 0 && (
            <button className="btn-secondary" onClick={() => ir(passoAnterior(passo))}>
              Voltar
            </button>
          )}
          <button
            className="btn-primary ml-auto"
            onClick={() => (passo === "pronto" ? encerrar() : ir(proximoPasso(passo)))}
          >
            {passo === "pronto" ? "Começar a usar" : "Continuar"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------- 1. Loja ----------

const PassoLoja: React.FC = () => {
  const { config, saveConfig } = useApp();
  const padrao = config.nomeLoja === "Minha Assistência TI";
  const [nome, setNome] = useState(padrao ? "" : config.nomeLoja);
  const [zap, setZap] = useState(config.telefoneLoja || "");

  // Grava ao sair do campo: o botão "Continuar" é do assistente, e ninguém
  // lembra de um Salvar escondido no meio do caminho.
  const gravar = () => {
    const n = nome.trim();
    if ((n || config.nomeLoja) === config.nomeLoja && zap === config.telefoneLoja) return;
    saveConfig({ ...config, nomeLoja: n || config.nomeLoja, telefoneLoja: zap });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Vamos deixar o sistema com a cara da sua loja</h2>
        <p className="mt-1 text-sm text-tinta-suave">Aparece no recibo e na página que o cliente abre.</p>
      </div>
      <div>
        <label className="label">Nome da loja</label>
        <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} onBlur={gravar} placeholder="Ex.: Silva Cell" />
      </div>
      <div>
        <label className="label">WhatsApp da loja</label>
        <input className="input" inputMode="tel" value={zap} onChange={(e) => setZap(e.target.value)} onBlur={gravar} placeholder="(11) 99999-9999" />
      </div>
      <ImagemUpload
        label="Logo (opcional)"
        url={config.logoUrl}
        onChange={(logoUrl) => saveConfig({ ...config, logoUrl })}
        pasta="logo"
        lado={400}
        formato="faixa"
      />
    </div>
  );
};

// ---------- 2. Ramo ----------

/**
 * O ramo é o que a loja CONTRATOU (lojas.ramo, travado no banco): aqui ele
 * aparece para a pessoa conferir, não para trocar. Escolher e não valer
 * seria pior do que não perguntar.
 */
const PassoRamo: React.FC = () => {
  const { ramoContratado } = useApp();
  const meta = RAMO_META[ramoContratado];
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Seu tipo de loja</h2>
        <p className="mt-1 text-sm text-tinta-suave">As telas do menu já estão ajustadas para ele.</p>
      </div>
      <div className="rounded-md border-2 border-sinal bg-papel p-4">
        <p className="text-lg font-bold">{meta.label}</p>
      </div>
      <p className="text-sm text-tinta-suave">
        Não é esse? Fale com quem te passou o convite que a gente troca. Os seus dados não mudam.
      </p>
    </div>
  );
};

// ---------- 3. Produto ----------

const PassoProduto: React.FC = () => {
  const [modo, setModo] = useState<"um" | "planilha">("um");
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Seus produtos</h2>
        <p className="mt-1 text-sm text-tinta-suave">Cadastre um agora ou traga a planilha que você já tem.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {([
          ["um", "Cadastrar um", Package],
          ["planilha", "Importar planilha", FileSpreadsheet],
        ] as const).map(([k, rotulo, Icone]) => (
          <button
            key={k}
            onClick={() => setModo(k)}
            className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-semibold ${
              modo === k ? "border-sinal bg-papel text-tinta" : "border-linha text-tinta-suave"
            }`}
          >
            <Icone size={16} /> {rotulo}
          </button>
        ))}
      </div>
      {modo === "um" ? <UmProduto /> : <ImportarPlanilha />}
    </div>
  );
};

const UmProduto: React.FC = () => {
  const { saveProduto } = useApp();
  const [nome, setNome] = useState("");
  const [preco, setPreco] = useState<number | undefined>();
  const [custo, setCusto] = useState<number | undefined>();
  const [qtd, setQtd] = useState<number | undefined>();
  const [salvo, setSalvo] = useState("");
  const [gravando, setGravando] = useState(false);

  const salvar = async () => {
    if (!nome.trim()) return aviso.alerta("Escreva o nome do produto.");
    if (preco === undefined) return aviso.alerta("Coloque o preço de venda.");
    setGravando(true);
    try {
      await saveProduto({
        id: uid(),
        nome: nome.trim(),
        preco,
        custo: custo ?? 0,
        quantidade: qtd ?? 0,
        estoqueMinimo: 0,
        criadoEm: nowISO(),
      });
      setSalvo(nome.trim());
      setNome("");
      setPreco(undefined);
      setCusto(undefined);
      setQtd(undefined);
    } catch (e) {
      aviso.erro("Não gravou o produto: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setGravando(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="label">Nome</label>
        <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Película de vidro" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="label">Preço</label>
          <InputNumero className="input" value={preco} onChange={setPreco} />
        </div>
        <div>
          <label className="label">Custo</label>
          <InputNumero className="input" value={custo} onChange={setCusto} />
        </div>
        <div>
          <label className="label">Quantidade</label>
          <InputNumero className="input" value={qtd} onChange={setQtd} />
        </div>
      </div>
      <button className="btn-secondary w-full" onClick={salvar} disabled={gravando}>
        {gravando ? "Gravando..." : "Gravar produto"}
      </button>
      {salvo && (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-status-pronta">
          <Check size={16} /> {salvo} gravado. Pode cadastrar outro ou continuar.
        </p>
      )}
    </div>
  );
};

const ImportarPlanilha: React.FC = () => {
  const { produtos, saveProduto } = useApp();
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [cabecalho, setCabecalho] = useState(true);
  const [mapa, setMapa] = useState<Mapa | null>(null);
  const [lendo, setLendo] = useState(false);
  const [feito, setFeito] = useState<{ gravados: number; falhas: string[] } | null>(null);
  const [andamento, setAndamento] = useState("");

  const abrir = async (arquivo?: File) => {
    if (!arquivo) return;
    setLendo(true);
    setFeito(null);
    try {
      const lidas = await lerArquivoPlanilha(arquivo);
      const cab = temCabecalho(lidas[0]);
      setCabecalho(cab);
      setMapa(cab ? sugerirMapa(lidas[0]) : { nome: 0, preco: 1, custo: -1, quantidade: -1, codigoBarras: -1, categoria: -1 });
      setLinhas(lidas);
    } catch (e) {
      aviso.erro("Não deu para ler a planilha: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLendo(false);
    }
  };

  const colunas = cabecalho ? linhas[0] || [] : (linhas[0] || []).map((_, i) => `Coluna ${i + 1}`);
  const dados = cabecalho ? linhas.slice(1) : linhas;
  const previa = useMemo(
    () =>
      mapa
        ? linhasParaProdutos(dados, mapa, nowISO(), uid, cabecalho ? 2 : 1, produtos.map((p) => p.nome))
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [linhas, mapa, cabecalho, produtos]
  );

  const importar = async () => {
    if (!previa || previa.produtos.length === 0) return;
    const falhas: string[] = [];
    let gravados = 0;
    for (const [n, p] of previa.produtos.entries()) {
      setAndamento(`Gravando ${n + 1} de ${previa.produtos.length}...`);
      try {
        await saveProduto(p as Produto);
        gravados++;
      } catch (e) {
        falhas.push(`${p.nome}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setAndamento("");
    setFeito({ gravados, falhas });
    setLinhas([]);
    setMapa(null);
  };

  if (feito) {
    return (
      <div className="space-y-2">
        <p className="flex items-center gap-1.5 font-semibold text-status-pronta">
          <Check size={18} /> {feito.gravados} produto(s) importados.
        </p>
        {feito.falhas.length > 0 && (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            <p className="font-semibold">{feito.falhas.length} não gravaram:</p>
            <ul className="mt-1 list-disc pl-5">{feito.falhas.slice(0, 10).map((f) => <li key={f}>{f}</li>)}</ul>
          </div>
        )}
      </div>
    );
  }

  if (!mapa) {
    return (
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed border-linha p-6 text-center hover:border-sinal">
        <FileSpreadsheet size={28} className="text-tinta-suave" />
        <span className="font-semibold">{lendo ? "Lendo..." : "Escolher planilha (.xlsx ou .csv)"}</span>
        <span className="text-xs text-tinta-suave">Precisa ter pelo menos o nome e o preço de venda.</span>
        <input type="file" accept=".xlsx,.csv,.txt" className="hidden" onChange={(e) => abrir(e.target.files?.[0])} />
      </label>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-tinta-suave">Confira qual coluna é o quê:</p>
      <div className="grid grid-cols-2 gap-2">
        {CAMPOS_PRODUTO.map(({ campo, rotulo, obrigatorio }) => (
          <div key={campo}>
            <label className="label">
              {rotulo}
              {obrigatorio ? " *" : ""}
            </label>
            <select
              className="input"
              value={mapa[campo]}
              onChange={(e) => setMapa({ ...mapa, [campo as CampoProduto]: Number(e.target.value) })}
            >
              <option value={-1}>(não tem)</option>
              {colunas.map((c, i) => (
                <option key={i} value={i}>
                  {c || `Coluna ${i + 1}`}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={cabecalho} onChange={(e) => setCabecalho(e.target.checked)} />
        A primeira linha é o título das colunas
      </label>
      {previa && (
        <div className="rounded-md bg-papel p-3 text-sm">
          <p className="font-semibold">{previa.produtos.length} produto(s) prontos para entrar.</p>
          {previa.produtos.slice(0, 3).map((p) => (
            <p key={p.id} className="truncate text-tinta-suave">
              {p.nome} · <span className="valor">R$ {p.preco.toFixed(2).replace(".", ",")}</span>
            </p>
          ))}
          {previa.problemas.length > 0 && (
            <details className="mt-2 text-red-700">
              <summary className="cursor-pointer">{previa.problemas.length} linha(s) ficam de fora</summary>
              <ul className="mt-1 list-disc pl-5">{previa.problemas.slice(0, 20).map((p) => <li key={p}>{p}</li>)}</ul>
            </details>
          )}
        </div>
      )}
      <div className="flex gap-2">
        <button className="btn-secondary" onClick={() => { setMapa(null); setLinhas([]); }}>
          Outra planilha
        </button>
        <button className="btn-primary flex-1" onClick={importar} disabled={!!andamento || !previa?.produtos.length}>
          {andamento || `Importar ${previa?.produtos.length || 0}`}
        </button>
      </div>
    </div>
  );
};

// ---------- 4. Primeira OS ----------

const PassoOS: React.FC = () => {
  const { config, ordens, fontesComFalha, saveCliente, saveOrdem } = useApp();
  const minha = ordens.find((o) => o.observacoes === MARCA_TESTE);
  const [gravando, setGravando] = useState(false);

  const abrirTeste = async () => {
    const problema = problemaParaNumerar(fontesComFalha, "ordens", "a OS de teste");
    if (problema) return aviso.erro(problema);
    setGravando(true);
    try {
      const agora = nowISO();
      const clienteId = uid();
      await saveCliente({
        id: clienteId,
        nome: "Você (teste)",
        telefone: soDigitos(config.telefoneLoja),
        observacoes: "Cliente criado no primeiro acesso para ver o link de acompanhamento.",
        criadoEm: agora,
      });
      const os: OrdemServico = {
        id: uid(),
        numero: proximoNumero(ordens),
        clienteId,
        tipoAparelho: "Celular",
        marca: "Teste",
        modelo: "Meu celular",
        defeitoRelatado: "OS de teste do primeiro acesso",
        checklist: {},
        pecas: [],
        maoDeObra: 0,
        desconto: 0,
        status: "aberta",
        garantiaDias: 90,
        historico: [{ data: agora, status: "aberta" }],
        observacoes: MARCA_TESTE,
        criadoEm: agora,
        atualizadoEm: agora,
      };
      await saveOrdem(os);
    } catch (e) {
      aviso.erro("Não abriu a OS de teste: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setGravando(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Sua primeira ordem de serviço</h2>
        <p className="mt-1 text-sm text-tinta-suave">
          Uma OS de teste, com você como cliente. Depois é só cancelar ou apagar.
        </p>
      </div>
      {minha ? (
        <p className="flex items-center gap-1.5 font-semibold text-status-pronta">
          <Check size={18} /> <span className="valor">{codigoOS(minha.numero)}</span> aberta. Pode continuar.
        </p>
      ) : (
        <button className="btn-primary w-full" onClick={abrirTeste} disabled={gravando}>
          {gravando ? "Abrindo..." : "Abrir OS de teste"}
        </button>
      )}
    </div>
  );
};

const MARCA_TESTE = "OS de teste do primeiro acesso.";

const PassoVenda: React.FC<{ onIr: () => void }> = ({ onIr }) => (
  <div className="space-y-4">
    <div>
      <h2 className="text-xl font-bold">Sua primeira venda</h2>
      <p className="mt-1 text-sm text-tinta-suave">
        Faça uma venda de teste no caixa rápido para ver o cupom e o caixa do dia. Depois dá para estornar.
      </p>
    </div>
    <button className="btn-primary w-full" onClick={onIr}>
      Abrir o caixa rápido
    </button>
  </div>
);

// ---------- 5. Pronto ----------

const PassoPronto: React.FC<{ temOS: boolean; onViu: () => void }> = ({ temOS, onViu }) => {
  const { config, ordens } = useApp();
  const minha = ordens.find((o) => o.observacoes === MARCA_TESTE);
  const link = minha ? linkDeRastreio(window.location.origin + window.location.pathname, obterLoja(), minha) : "";
  const zap = soDigitos(config.telefoneLoja);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Pronto.</h2>
      {temOS && link ? (
        <>
          <p className="text-tinta-suave">Mande este link de rastreio para você mesmo e veja o que o seu cliente vai ver.</p>
          <p className="break-all rounded-md bg-papel p-3 font-mono text-xs">{link}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {zap && (
              <button
                className="btn-primary"
                onClick={() => {
                  onViu();
                  abrirWhatsapp(zap, `Veja como o cliente acompanha o conserto:\n${link}`);
                }}
              >
                Mandar no meu WhatsApp
              </button>
            )}
            <a className="btn-secondary text-center" href={link} target="_blank" rel="noreferrer" onClick={onViu}>
              Abrir o link aqui
            </a>
          </div>
        </>
      ) : (
        <p className="text-tinta-suave">
          O sistema está no ar. A lista de primeiros passos fica no Painel até você terminar.
        </p>
      )}
    </div>
  );
};

/**
 * "Primeiros passos" no Painel, até completar. Some sozinha: cada item é
 * conferido nos dados (ver `primeirosPassos`).
 */
export const ListaPrimeirosPassos: React.FC = () => {
  const { config, produtos, ordens, vendas, ramo, saveConfig } = useApp();
  const navigate = useNavigate();
  /*
   * "Ver o link" não tem tela para onde ir: o passo é abrir o link. Mandar
   * para a lista de OS deixava o item pendurado para sempre, porque nada lá
   * marca que a pessoa viu.
   */
  const abrir = (id: string, rota: string) => {
    if (id !== "rastreio") return navigate(rota);
    const os = ordens.find((o) => o.observacoes === MARCA_TESTE) || ordens[0];
    const link = os ? linkDeRastreio(window.location.origin + window.location.pathname, obterLoja(), os) : "";
    if (!link) return navigate(rota);
    window.open(link, "_blank", "noopener");
    saveConfig({ ...config, primeirosPassos: { ...config.primeirosPassos, viuRastreio: true } });
  };
  const itens = primeirosPassos(
    config,
    { produtos: produtos.length, ordens: ordens.length, vendas: vendas.length },
    temModulo(ramo, "os")
  );
  if (!mostrarPrimeirosPassos(config.primeirosPassos, itens)) return null;
  const feitos = itens.filter((i) => i.feito).length;
  return (
    <div className="card mb-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-bold">Primeiros passos</h2>
        <span className="valor text-sm text-tinta-suave">
          {feitos}/{itens.length}
        </span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-concreto">
        <div className="h-1.5 rounded-full bg-sinal" style={{ width: `${(feitos / itens.length) * 100}%` }} />
      </div>
      <ul className="mt-3 divide-y divide-linha">
        {itens.map((i) => (
          <li key={i.id}>
            <button
              onClick={() => abrir(i.id, i.rota)}
              disabled={i.feito}
              className="flex w-full items-center gap-3 py-2.5 text-left text-sm disabled:cursor-default"
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                  i.feito ? "border-status-pronta bg-status-pronta text-white" : "border-linha"
                }`}
              >
                {i.feito && <Check size={13} />}
              </span>
              <span className={i.feito ? "text-tinta-suave line-through" : "font-semibold"}>{i.texto}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
