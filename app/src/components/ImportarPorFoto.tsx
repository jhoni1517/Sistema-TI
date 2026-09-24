import React, { useRef, useState } from "react";
import { Camera, AlertTriangle, Check, Trash2 } from "lucide-react";
import { useApp } from "../store/AppStore";
import { useIaLigada } from "./useIaLigada";
import { Modal, InputNumero } from "./ui";
import { aviso } from "./Aviso";
import { emDemo } from "../lib/db";
import { uid, nowISO } from "../lib/format";
import { prepararImagem } from "../lib/imagens";
import { perguntarIA, paraBase64, usoDoMes } from "../lib/ia";
import {
  MAX_FOTOS,
  lerClientesDaIA,
  lerProdutosDaIA,
  clienteDaLinha,
  produtoDaLinha,
  type OQue,
  type LinhaCliente,
  type LinhaProduto,
} from "../lib/importar-foto";

/**
 * "Importar do caderno por foto", em Clientes e em Estoque.
 *
 * Nada grava antes do "Importar": a IA erra com cara de certo, e a tabela
 * existe para a pessoa corrigir. Duplicado vem desmarcado, com o motivo.
 * Sem IA ligada (ou na loja de exemplo) o botão nem aparece.
 */
export const ImportarPorFoto: React.FC<{ oque: OQue }> = ({ oque }) => {
  const ligada = useIaLigada();
  const [aberto, setAberto] = useState(false);
  if (!ligada || emDemo()) return null;
  return (
    <>
      <button className="btn-secondary" onClick={() => setAberto(true)}>
        <Camera size={18} /> Importar do caderno
      </button>
      {aberto && <Janela oque={oque} onFechar={() => setAberto(false)} />}
    </>
  );
};

type Linha = LinhaCliente | LinhaProduto;

const Janela: React.FC<{ oque: OQue; onFechar: () => void }> = ({ oque, onFechar }) => {
  const { clientes, produtos, saveCliente, saveProduto } = useApp();
  const entrada = useRef<HTMLInputElement>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [lendo, setLendo] = useState("");
  const [uso, setUso] = useState("");
  const [gravando, setGravando] = useState("");
  const [resultado, setResultado] = useState<{ ok: number; falhas: string[] } | null>(null);
  const eCliente = oque === "clientes";

  const ler = async (lista: FileList | null) => {
    const fotos = Array.from(lista || []).slice(0, MAX_FOTOS);
    if (!fotos.length) return;
    if ((lista?.length || 0) > MAX_FOTOS) aviso.alerta(`Até ${MAX_FOTOS} fotos por vez. Fiquei com as ${MAX_FOTOS} primeiras.`);
    let acumulado = linhas;
    const novosAvisos: string[] = [];
    // Uma por vez: cada foto é uma chamada (e um crédito). Se uma falhar,
    // as outras continuam — perder quatro páginas por causa de uma borrada
    // faria a pessoa pagar de novo pelas quatro.
    for (const [n, f] of fotos.entries()) {
      setLendo(`Lendo foto ${n + 1} de ${fotos.length}...`);
      try {
        const jpeg = await prepararImagem(f, 1600);
        const r = await perguntarIA("importar-foto", { imagem: await paraBase64(jpeg), tipo: "image/jpeg", oque });
        const lido = eCliente
          ? lerClientesDaIA(r.bruto, clientes, acumulado as LinhaCliente[])
          : lerProdutosDaIA(r.bruto, produtos, acumulado as LinhaProduto[]);
        acumulado = [...acumulado, ...lido.linhas];
        novosAvisos.push(...lido.avisos.map((a) => (fotos.length > 1 ? `Foto ${n + 1}: ${a}` : a)));
        setUso(usoDoMes(r.usados, r.limite));
      } catch (e) {
        novosAvisos.push(`Foto ${n + 1}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setLinhas(acumulado);
    setAvisos((v) => [...v, ...novosAvisos]);
    setLendo("");
    if (entrada.current) entrada.current.value = "";
  };

  const mudar = (i: number, patch: Partial<LinhaCliente & LinhaProduto>) =>
    setLinhas((v) => v.map((l, n) => (n === i ? ({ ...l, ...patch } as Linha) : l)));

  const marcadas = linhas.filter((l) => l.importar);

  const importar = async () => {
    const semPreco = !eCliente && (marcadas as LinhaProduto[]).find((l) => !(l.preco > 0));
    if (semPreco) return aviso.alerta(`"${semPreco.nome}" está sem preço de venda. Preencha ou desmarque.`);
    const agora = nowISO();
    let ok = 0;
    const falhas: string[] = [];
    for (const [n, l] of marcadas.entries()) {
      setGravando(`Gravando ${n + 1} de ${marcadas.length}...`);
      try {
        if (eCliente) await saveCliente(clienteDaLinha(l as LinhaCliente, uid(), agora));
        else await saveProduto(produtoDaLinha(l as LinhaProduto, uid(), agora));
        ok++;
      } catch (e) {
        falhas.push(`${l.nome}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setGravando("");
    setResultado({ ok, falhas });
  };

  const titulo = eCliente ? "Importar clientes por foto" : "Importar produtos por foto";

  if (resultado) {
    return (
      <Modal open onClose={onFechar} title={titulo} footer={<button className="btn-primary" onClick={onFechar}>Fechar</button>}>
        <p className="flex items-center gap-2 font-semibold text-status-pronta">
          <Check size={18} /> {resultado.ok} {eCliente ? "cliente(s)" : "produto(s)"} importado(s).
        </p>
        {resultado.falhas.length > 0 && (
          <div className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            <p className="font-semibold">{resultado.falhas.length} não gravaram:</p>
            <ul className="mt-1 list-disc pl-5">{resultado.falhas.slice(0, 15).map((f) => <li key={f}>{f}</li>)}</ul>
          </div>
        )}
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onFechar}
      title={titulo}
      maxWidth="max-w-3xl"
      footer={
        linhas.length > 0 && (
          <div className="flex w-full items-center gap-2">
            <button className="btn-secondary" onClick={() => entrada.current?.click()} disabled={!!lendo || !!gravando}>
              <Camera size={16} /> Mais fotos
            </button>
            <button className="btn-primary ml-auto" onClick={importar} disabled={!marcadas.length || !!gravando || !!lendo}>
              {gravando || `Importar ${marcadas.length}`}
            </button>
          </div>
        )
      }
    >
      <input
        ref={entrada}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => ler(e.target.files)}
      />

      {linhas.length === 0 ? (
        <div className="space-y-3 text-center">
          <p className="text-sm text-tinta-suave">
            Tire foto do caderno, da planilha impressa ou mande um print. Até {MAX_FOTOS} fotos por vez, uma página por
            foto, reta e com luz. {eCliente ? "Nome e telefone." : "Nome, quantidade, custo e preço."}
          </p>
          <button className="btn-primary mx-auto" onClick={() => entrada.current?.click()} disabled={!!lendo}>
            <Camera size={18} /> {lendo || "Escolher fotos"}
          </button>
          {avisos.length > 0 && <Avisos avisos={avisos} />}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold">Confira antes de importar. Nada foi gravado ainda.</p>
            {uso && <span className="text-xs text-tinta-suave">{uso}</span>}
          </div>
          {lendo && <p className="text-sm text-tinta-suave">{lendo}</p>}
          {avisos.length > 0 && <Avisos avisos={avisos} />}

          <div className="divide-y divide-linha rounded-md border border-linha">
            {linhas.map((l, i) => (
              <div key={i} className={`p-2 ${l.importar ? "" : "opacity-60"}`}>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-5 w-5 shrink-0"
                    checked={l.importar}
                    onChange={(e) => mudar(i, { importar: e.target.checked })}
                    aria-label="Importar esta linha"
                  />
                  <input className="input !py-1.5 text-sm" value={l.nome} onChange={(e) => mudar(i, { nome: e.target.value })} />
                  <button
                    className="shrink-0 p-1.5 text-tinta-suave hover:text-red-600"
                    onClick={() => setLinhas((v) => v.filter((_, n) => n !== i))}
                    aria-label="Tirar linha"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-2 pl-7">
                  {eCliente ? (
                    <input
                      className="input col-span-3 !py-1.5 text-sm sm:col-span-2"
                      inputMode="tel"
                      placeholder="Telefone com DDD"
                      value={(l as LinhaCliente).telefone}
                      onChange={(e) => mudar(i, { telefone: e.target.value })}
                    />
                  ) : (
                    <>
                      <Numero rotulo="Qtd" valor={(l as LinhaProduto).quantidade} mudar={(v) => mudar(i, { quantidade: v })} />
                      <Numero rotulo="Custo" valor={(l as LinhaProduto).custo} mudar={(v) => mudar(i, { custo: v })} />
                      <Numero rotulo="Preço" valor={(l as LinhaProduto).preco} mudar={(v) => mudar(i, { preco: v })} />
                    </>
                  )}
                </div>
                {l.duplicado && (
                  <p className="mt-1 pl-7 text-xs font-semibold text-amber-700">{l.duplicado}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
};

const Numero: React.FC<{ rotulo: string; valor: number; mudar: (v: number) => void }> = ({ rotulo, valor, mudar }) => (
  <label className="text-xs text-tinta-suave">
    {rotulo}
    <InputNumero className="input !py-1.5 text-sm" min={0} value={valor} onChange={(v) => mudar(v ?? 0)} />
  </label>
);

const Avisos: React.FC<{ avisos: string[] }> = ({ avisos }) => (
  <div className="rounded-md bg-amber-50 p-2 text-left text-xs text-amber-800">
    <p className="mb-1 flex items-center gap-1 font-bold">
      <AlertTriangle size={13} /> Confira estes pontos
    </p>
    {avisos.map((a, i) => (
      <p key={i}>{a}</p>
    ))}
  </div>
);
