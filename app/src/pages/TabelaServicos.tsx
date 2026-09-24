import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, Plus, Upload, Download, Copy, Percent, Trash2, Save } from "lucide-react";
import { useApp } from "../store/AppStore";
import { Modal, InputNumero } from "../components/ui";
import { aviso } from "../components/Aviso";
import { brl, uid } from "../lib/format";
import { lerArquivoPlanilha } from "../lib/planilha";
import { pode, type Papel } from "../lib/auth";
import {
  tabelaSegura,
  tabelaVazia,
  modelosOrdenados,
  definirPreco,
  acrescentarModelo,
  acrescentarServico,
  tirarModelo,
  tirarServico,
  copiarPrecos,
  previaReajuste,
  aplicarMudancas,
  buscarNaTabela,
  importarCSV,
  exportarCSV,
  PROBLEMAS,
  type TabelaServicos as Tabela,
  type Reajuste,
  type Problema,
} from "../lib/tabela-precos";

/**
 * Tabela de serviços: o preço de cada conserto por modelo, e a busca do
 * balcão ("13 tela" → R$ 650). Toda conta em lib/tabela-precos.ts.
 *
 * Quem vê: todo mundo que abre OS (o atendente precisa do preço). Quem
 * muda: quem mexe nas configurações da loja.
 */
export function TabelaServicos({ papel }: { papel?: Papel }) {
  const { config, configCarregada, saveConfig } = useApp();
  const podeEditar = pode(papel, "config");
  const [tab, setTab] = useState<Tabela>(() => (config.tabelaServicos ? tabelaSegura(config.tabelaServicos) : tabelaVazia()));
  const [mexeu, setMexeu] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [busca, setBusca] = useState("");
  const [janela, setJanela] = useState<"" | "modelo" | "servico" | "copiar" | "reajuste">("");
  const arquivo = useRef<HTMLInputElement>(null);

  // A tabela chega da nuvem depois da tela abrir. Acompanha enquanto
  // ninguém mexeu — depois, recarregar por cima apagaria o que foi digitado.
  useEffect(() => {
    if (!mexeu) setTab(config.tabelaServicos ? tabelaSegura(config.tabelaServicos) : tabelaVazia());
  }, [config.tabelaServicos, configCarregada, mexeu]);

  const mudar = (t: Tabela) => {
    setTab(t);
    setMexeu(true);
  };

  const salvar = async () => {
    if (gravando) return;
    setGravando(true);
    try {
      const ok = await saveConfig({ ...config, tabelaServicos: tab });
      if (ok) {
        setMexeu(false);
        aviso.sucesso("Tabela salva.");
      }
    } catch (e) {
      aviso.erro("Não salvou: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setGravando(false);
    }
  };

  const importar = async (f?: File) => {
    if (!f) return;
    try {
      const r = importarCSV(tab, await lerArquivoPlanilha(f), uid);
      mudar(r.tabela);
      const resumo = `${r.precos} preço(s) lido(s), ${r.modelosNovos} modelo(s) novo(s). Confira e toque em Salvar.`;
      if (r.problemas.length) aviso.alerta(resumo + "\n\nFicou de fora:\n" + r.problemas.slice(0, 15).join("\n"));
      else aviso.sucesso(resumo);
    } catch (e) {
      aviso.erro("Não deu para ler a planilha: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      if (arquivo.current) arquivo.current.value = "";
    }
  };

  const exportar = () => {
    const blob = new Blob(["﻿" + exportarCSV(tab)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "tabela-de-servicos.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const achados = useMemo(() => buscarNaTabela(tab, busca), [tab, busca]);
  const modelos = useMemo(() => modelosOrdenados(tab), [tab]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-tinta">Tabela de serviços</h1>
          <p className="text-sm text-tinta-suave">O preço de cada conserto por modelo. A OS sugere daqui.</p>
        </div>
        {podeEditar && mexeu && (
          <button className="btn-primary" onClick={salvar} disabled={gravando}>
            <Save size={18} /> {gravando ? "Salvando..." : "Salvar tabela"}
          </button>
        )}
      </div>

      {/* Busca do balcão: o atendente digita e fala o preço sem ligar para o dono. */}
      <div className="card">
        <label className="relative block">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-tinta-suave" />
          <input
            className="input !pl-10 text-lg"
            placeholder='Ex.: "13 tela", "a15 bateria"'
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </label>
        {busca.trim() && (
          <div className="mt-3 divide-y divide-linha">
            {achados.length === 0 ? (
              <p className="py-3 text-sm text-tinta-suave">Nada na tabela para "{busca}".</p>
            ) : (
              achados.map((a) => (
                <div key={a.modelo.id + a.servico.id} className="flex items-baseline justify-between gap-3 py-2">
                  <span>
                    <b>{[a.modelo.marca, a.modelo.modelo].filter(Boolean).join(" ")}</b>
                    <span className="text-tinta-suave"> · {a.servico.nome}</span>
                  </span>
                  <span className="valor text-lg font-bold text-tinta">{brl(a.preco)}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {podeEditar && (
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => setJanela("modelo")}>
            <Plus size={16} /> Modelo
          </button>
          <button className="btn-secondary" onClick={() => setJanela("servico")}>
            <Plus size={16} /> Serviço
          </button>
          <button className="btn-secondary" onClick={() => setJanela("copiar")} disabled={tab.modelos.length < 2}>
            <Copy size={16} /> Copiar preços
          </button>
          <button className="btn-secondary" onClick={() => setJanela("reajuste")} disabled={!tab.modelos.length}>
            <Percent size={16} /> Reajustar
          </button>
          <button className="btn-secondary" onClick={() => arquivo.current?.click()}>
            <Upload size={16} /> Importar planilha
          </button>
          <button className="btn-secondary" onClick={exportar} disabled={!tab.modelos.length}>
            <Download size={16} /> Baixar planilha
          </button>
          <input ref={arquivo} type="file" accept=".xlsx,.csv,.txt" className="hidden" onChange={(e) => importar(e.target.files?.[0])} />
        </div>
      )}

      {modelos.length === 0 ? (
        <div className="card py-10 text-center text-sm text-tinta-suave">
          <p className="font-semibold text-tinta">Nenhum modelo na tabela ainda.</p>
          <p className="mt-1">
            {podeEditar
              ? 'Toque em "+ Modelo" ou importe uma planilha com as colunas Marca, Modelo e uma coluna por serviço.'
              : "Peça para o dono da loja preencher os preços."}
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto !p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-linha text-left text-xs uppercase text-tinta-suave">
              <tr>
                <th className="sticky left-0 bg-cartao px-3 py-2">Modelo</th>
                {tab.servicos.map((s) => (
                  <th key={s.id} className="min-w-[110px] px-2 py-2 text-right">
                    <span className="inline-flex items-center gap-1">
                      {s.nome}
                      {podeEditar && (
                        <button
                          className="p-0.5 text-tinta-suave hover:text-red-600"
                          aria-label={`Tirar ${s.nome}`}
                          onClick={() => {
                            if (confirm(`Tirar "${s.nome}" e o preço dele de todos os modelos?`)) mudar(tirarServico(tab, s.id));
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </span>
                  </th>
                ))}
                {podeEditar && <th className="w-8" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-linha">
              {modelos.map((m) => (
                <tr key={m.id}>
                  <td className="sticky left-0 bg-cartao px-3 py-1.5">
                    <span className="text-xs text-tinta-suave">{m.marca}</span>
                    <span className="block font-semibold text-tinta">{m.modelo}</span>
                  </td>
                  {tab.servicos.map((s) => (
                    <td key={s.id} className="px-2 py-1.5 text-right">
                      {podeEditar ? (
                        <InputNumero
                          className="input valor !py-1 text-right text-sm"
                          min={0}
                          placeholder="—"
                          value={m.precos[s.id] ?? null}
                          onChange={(v) => mudar(definirPreco(tab, m.id, s.id, v))}
                        />
                      ) : (
                        <span className="valor">{m.precos[s.id] > 0 ? brl(m.precos[s.id]) : "—"}</span>
                      )}
                    </td>
                  ))}
                  {podeEditar && (
                    <td className="pr-2">
                      <button
                        className="p-1 text-tinta-suave hover:text-red-600"
                        aria-label={`Tirar ${m.modelo}`}
                        onClick={() => {
                          if (confirm(`Tirar "${m.modelo}" da tabela?`)) mudar(tirarModelo(tab, m.id));
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {janela === "modelo" && <NovoModelo tab={tab} onFechar={() => setJanela("")} onPronto={mudar} />}
      {janela === "servico" && <NovoServico tab={tab} onFechar={() => setJanela("")} onPronto={mudar} />}
      {janela === "copiar" && <CopiarPrecos tab={tab} onFechar={() => setJanela("")} onPronto={mudar} />}
      {janela === "reajuste" && <Reajustar tab={tab} onFechar={() => setJanela("")} onPronto={mudar} />}
    </div>
  );
}

type Janela = { tab: Tabela; onFechar: () => void; onPronto: (t: Tabela) => void };

const NovoModelo: React.FC<Janela> = ({ tab, onFechar, onPronto }) => {
  const marcas = useMemo(() => [...new Set(tab.modelos.map((m) => m.marca).filter(Boolean))].sort(), [tab]);
  const [marca, setMarca] = useState(marcas[0] || "");
  const [modelo, setModelo] = useState("");
  const ok = () => {
    try {
      onPronto(acrescentarModelo(tab, marca, modelo, uid()));
      setModelo("");
      aviso.sucesso("Modelo incluído. Pode incluir outro.");
    } catch (e) {
      aviso.alerta(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <Modal
      open
      onClose={onFechar}
      title="Novo modelo"
      footer={
        <button className="btn-primary" onClick={ok}>
          Incluir
        </button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="label">
          Marca
          <input className="input" list="marcas-tabela" value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="Apple" />
          <datalist id="marcas-tabela">
            {marcas.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
        <label className="label">
          Modelo
          <input className="input" autoFocus value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="iPhone 13" onKeyDown={(e) => e.key === "Enter" && ok()} />
        </label>
      </div>
    </Modal>
  );
};

const NovoServico: React.FC<Janela> = ({ tab, onFechar, onPronto }) => {
  const [nome, setNome] = useState("");
  const [problema, setProblema] = useState<Problema | "">("");
  const ok = () => {
    try {
      onPronto(acrescentarServico(tab, nome, uid(), problema || undefined));
      onFechar();
    } catch (e) {
      aviso.alerta(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <Modal open onClose={onFechar} title="Novo serviço" footer={<button className="btn-primary" onClick={ok}>Incluir</button>}>
      <div className="space-y-3">
        <label className="label">
          Nome
          <input className="input" autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Troca de câmera traseira" />
        </label>
        <label className="label">
          Aparece no orçamento do site como
          <select className="input" value={problema} onChange={(e) => setProblema(e.target.value as Problema | "")}>
            <option value="">Adivinhar pelo nome</option>
            {PROBLEMAS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
      </div>
    </Modal>
  );
};

const nomeModelo = (t: Tabela, id: string) => {
  const m = t.modelos.find((x) => x.id === id);
  return m ? [m.marca, m.modelo].filter(Boolean).join(" ") : "";
};

const CopiarPrecos: React.FC<Janela> = ({ tab, onFechar, onPronto }) => {
  const modelos = modelosOrdenados(tab);
  const [de, setDe] = useState(modelos[0]?.id || "");
  const [para, setPara] = useState<string[]>([]);
  const [sobrescrever, setSobrescrever] = useState(false);
  const ok = () => {
    if (!para.length) return aviso.alerta("Marque para quais modelos copiar.");
    try {
      const r = copiarPrecos(tab, de, para, sobrescrever);
      onPronto(r.tabela);
      aviso.sucesso(`${r.copiados} preço(s) copiado(s). Confira e toque em Salvar.`);
      onFechar();
    } catch (e) {
      aviso.alerta(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <Modal open onClose={onFechar} title="Copiar preços" footer={<button className="btn-primary" onClick={ok}>Copiar</button>}>
      <div className="space-y-3">
        <label className="label">
          Copiar de
          <select className="input" value={de} onChange={(e) => setDe(e.target.value)}>
            {modelos.map((m) => (
              <option key={m.id} value={m.id}>
                {nomeModelo(tab, m.id)}
              </option>
            ))}
          </select>
        </label>
        <p className="label">Para</p>
        <div className="max-h-60 space-y-1 overflow-y-auto rounded-md border border-linha p-2">
          {modelos
            .filter((m) => m.id !== de)
            .map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={para.includes(m.id)}
                  onChange={(e) => setPara((v) => (e.target.checked ? [...v, m.id] : v.filter((x) => x !== m.id)))}
                />
                {nomeModelo(tab, m.id)}
              </label>
            ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={sobrescrever} onChange={(e) => setSobrescrever(e.target.checked)} />
          Trocar também os preços que já estão preenchidos
        </label>
      </div>
    </Modal>
  );
};

const Reajustar: React.FC<Janela> = ({ tab, onFechar, onPronto }) => {
  const marcas = useMemo(() => [...new Set(tab.modelos.map((m) => m.marca).filter(Boolean))].sort(), [tab]);
  const [r, setR] = useState<Reajuste>({ modo: "%", valor: 0, marca: "", servicoId: "", arredondar: "centavo" });
  const previa = useMemo(() => previaReajuste(tab, r), [tab, r]);
  const aplicar = () => {
    if (!previa.mudancas.length) return;
    onPronto(aplicarMudancas(tab, previa.mudancas));
    aviso.sucesso(`${previa.mudancas.length} preço(s) reajustado(s). Confira e toque em Salvar.`);
    onFechar();
  };
  return (
    <Modal
      open
      onClose={onFechar}
      title="Reajustar preços"
      maxWidth="max-w-2xl"
      footer={
        <button className="btn-primary" onClick={aplicar} disabled={!previa.mudancas.length}>
          Aplicar em {previa.mudancas.length} preço(s)
        </button>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="label">
            Quanto
            <InputNumero className="input valor" value={r.valor || null} onChange={(v) => setR({ ...r, valor: v ?? 0 })} placeholder="10 ou -5" />
          </label>
          <label className="label">
            Em
            <select className="input" value={r.modo} onChange={(e) => setR({ ...r, modo: e.target.value as Reajuste["modo"] })}>
              <option value="%">%</option>
              <option value="R$">R$</option>
            </select>
          </label>
          <label className="label">
            Marca
            <select className="input" value={r.marca} onChange={(e) => setR({ ...r, marca: e.target.value })}>
              <option value="">Todas</option>
              {marcas.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="label">
            Serviço
            <select className="input" value={r.servicoId} onChange={(e) => setR({ ...r, servicoId: e.target.value })}>
              <option value="">Todos</option>
              {tab.servicos.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="label">
          Arredondar para cima
          <select className="input" value={r.arredondar} onChange={(e) => setR({ ...r, arredondar: e.target.value as Reajuste["arredondar"] })}>
            <option value="centavo">Não arredondar</option>
            <option value="inteiro">Real inteiro (612,30 → 613,00)</option>
            <option value="final90">Final ,90 (612,30 → 619,90)</option>
          </select>
        </label>
        <p className="text-xs text-tinta-suave">Para baixar, use número negativo. Nada muda até tocar em Aplicar.</p>
        {previa.avisos.length > 0 && (
          <div className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">
            {previa.avisos.map((a) => (
              <p key={a}>{a}</p>
            ))}
          </div>
        )}
        {previa.mudancas.length > 0 && (
          <div className="max-h-72 divide-y divide-linha overflow-y-auto rounded-md border border-linha text-sm">
            {previa.mudancas.map((m) => (
              <div key={m.modeloId + m.servicoId} className="flex flex-wrap items-baseline justify-between gap-x-2 px-2 py-1.5">
                <span className="min-w-0">{m.rotulo}</span>
                <span className="valor ml-auto shrink-0">
                  <span className="text-tinta-suave line-through">{brl(m.antes)}</span> <b>{brl(m.depois)}</b>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};
