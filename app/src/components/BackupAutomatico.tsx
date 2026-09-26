import React, { useCallback, useEffect, useRef, useState } from "react";
import { CloudDownload, RotateCcw, Save, Upload } from "lucide-react";
import { useApp } from "../store/AppStore";
import { Modal } from "./ui";
import { aviso } from "./Aviso";
import { supabase, supabaseEnabled } from "../lib/supabase";
import { emDemo, importarTudo, obterLoja } from "../lib/db";
import { nowISO } from "../lib/format";
import {
  TABELAS_BACKUP,
  NOME_TABELA,
  montarBackup,
  cifrar,
  decifrar,
  lerBackup,
  dumpDoBackup,
  previaRestauracao,
  nomeDoArquivo,
  rotuloDoArquivo,
  type Backup,
  type PreviaTabela,
  type TabelaBackup,
} from "../lib/backup-diario";
import type { Config } from "../lib/types";

/** Linhas cruas da tabela (senha de aparelho continua cifrada), de mil em mil. */
async function linhasCruas(tabela: TabelaBackup): Promise<Record<string, unknown>[] | null> {
  const todas: Record<string, unknown>[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase!.from(tabela).select("*").range(de, de + 999);
    if (error) return null; // migração não rodada: a tabela fica de fora
    todas.push(...(data || []));
    if (!data || data.length < 1000) return todas;
  }
}

async function tudoDaLoja(): Promise<Backup["tabelas"]> {
  const t: Backup["tabelas"] = {};
  for (const nome of TABELAS_BACKUP) {
    const v = await linhasCruas(nome);
    if (v) t[nome] = v;
  }
  return t;
}

async function chaveDaLoja(loja: string): Promise<string> {
  const { data } = await supabase!.from("lojas").select("chave_cripto").eq("id", loja).maybeSingle();
  const k = (data as { chave_cripto?: string } | null)?.chave_cripto;
  if (!k) throw new Error("Sem a chave de criptografia da loja. Rode o supabase-migracao-cripto.sql.");
  return k;
}

/**
 * Backup automático: o robô guarda um por dia, 30 dias. Aqui: ver, fazer
 * agora, baixar e restaurar — com prévia e dupla confirmação. Conta em
 * lib/backup-diario.ts.
 */
export const BackupAutomatico: React.FC = () => {
  const { config, saveConfig, reload } = useApp();
  const loja = obterLoja() || "";
  const [lista, setLista] = useState<string[] | null>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState("");
  const [restaurar, setRestaurar] = useState<{ backup: Backup; previa: PreviaTabela[]; nome: string } | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    if (!supabase || !loja) return;
    const { data, error } = await supabase.storage.from("backups").list(loja, { limit: 100, sortBy: { column: "name", order: "desc" } });
    if (error) {
      setErro(/not.*found|bucket/i.test(error.message) ? "O depósito de backups não existe. Rode o supabase-migracao-backup.sql." : error.message);
      setLista([]);
      return;
    }
    setErro("");
    setLista((data || []).map((o) => o.name).filter((n) => n.endsWith(".json.enc")));
  }, [loja]);
  useEffect(() => {
    carregar();
  }, [carregar]);

  if (emDemo() || !supabaseEnabled) {
    return <p className="text-sm text-tinta-suave">O backup automático funciona na loja real, com a nuvem ligada.</p>;
  }

  const fazerAgora = async () => {
    if (ocupado) return;
    setOcupado("agora");
    try {
      const agora = nowISO();
      const pacote = await cifrar(JSON.stringify(montarBackup(loja, agora, await tudoDaLoja(), config as unknown as Record<string, unknown>)), await chaveDaLoja(loja));
      const { error } = await supabase!.storage.from("backups").upload(`${loja}/${nomeDoArquivo(agora, true)}`, new Blob([pacote], { type: "text/plain" }));
      if (error) throw new Error(error.message);
      aviso.sucesso("Backup feito agora.");
      carregar();
    } catch (e) {
      aviso.erro("Não fez o backup: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setOcupado("");
    }
  };

  const baixarPacote = async (nome: string): Promise<string> => {
    const { data, error } = await supabase!.storage.from("backups").download(`${loja}/${nome}`);
    if (error || !data) throw new Error(error?.message || "Não baixou.");
    return data.text();
  };

  /** Baixa o arquivo CIFRADO: pode ficar no computador ou num pendrive sem expor cliente. */
  const baixar = async (nome: string) => {
    try {
      const texto = await baixarPacote(nome);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([texto], { type: "application/octet-stream" }));
      a.download = `backup-${nome}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      aviso.erro("Não baixou: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const prepararRestauracao = async (pacote: string, nome: string) => {
    if (ocupado) return;
    setOcupado("previa");
    try {
      const b = lerBackup(await decifrar(pacote.trim(), await chaveDaLoja(loja)), loja);
      const atual = (await tudoDaLoja()) as Partial<Record<TabelaBackup, { id: string }[]>>;
      setRestaurar({ backup: b, previa: previaRestauracao(b, atual), nome });
    } catch (e) {
      aviso.erro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado("");
    }
  };

  return (
    <div>
      <p className="mb-3 text-sm text-tinta-suave">
        Todo dia de madrugada o sistema guarda uma cópia dos dados da loja, criptografada, e mantém os últimos 30 dias. Uma vez por mês, baixe uma cópia
        para o computador.
      </p>
      {erro && <p className="mb-2 rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p>}
      <div className="mb-3 flex flex-wrap gap-2">
        <button className="btn-secondary" disabled={!!ocupado} onClick={fazerAgora}>
          <Save size={16} /> {ocupado === "agora" ? "Fazendo..." : "Fazer backup agora"}
        </button>
        <button className="btn-secondary" disabled={!!ocupado} onClick={() => arquivo.current?.click()}>
          <Upload size={16} /> Restaurar de um arquivo
        </button>
        <input
          ref={arquivo}
          type="file"
          accept=".enc,.txt"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) await prepararRestauracao(await f.text(), f.name);
            if (arquivo.current) arquivo.current.value = "";
          }}
        />
      </div>
      {lista === null ? (
        <p className="text-sm text-tinta-suave">Carregando...</p>
      ) : lista.length === 0 ? (
        <p className="text-sm text-tinta-suave">Nenhum backup ainda. O primeiro sai na próxima madrugada, ou toque em "Fazer backup agora".</p>
      ) : (
        <div className="max-h-72 divide-y divide-linha overflow-y-auto rounded-md border border-linha">
          {lista.map((n) => (
            <div key={n} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <span className="valor min-w-0 flex-1">{rotuloDoArquivo(n)}</span>
              <button className="btn-secondary !py-1 text-xs" onClick={() => baixar(n)}>
                <CloudDownload size={14} /> Baixar
              </button>
              <button className="btn-secondary !py-1 text-xs" disabled={!!ocupado} onClick={async () => prepararRestauracao(await baixarPacote(n), n)}>
                <RotateCcw size={14} /> Restaurar
              </button>
            </div>
          ))}
        </div>
      )}
      {restaurar && (
        <Restaurar
          {...restaurar}
          onFechar={() => setRestaurar(null)}
          onFeito={async () => {
            setRestaurar(null);
            await reload();
          }}
          saveConfig={saveConfig}
          configAtual={config}
        />
      )}
    </div>
  );
};

const Restaurar: React.FC<{
  backup: Backup;
  previa: PreviaTabela[];
  nome: string;
  onFechar: () => void;
  onFeito: () => void;
  saveConfig: (c: Config) => Promise<boolean>;
  configAtual: Config;
}> = ({ backup, previa, nome, onFechar, onFeito, saveConfig, configAtual }) => {
  const [comConfig, setComConfig] = useState(false);
  const [digitado, setDigitado] = useState("");
  const [gravando, setGravando] = useState(false);
  const muda = previa.reduce((s, p) => s + p.voltam + p.reaparecem, 0);

  const confirmar = async () => {
    if (gravando || digitado.trim().toUpperCase() !== "RESTAURAR") return;
    if (!confirm(`Última confirmação: ${muda} registro(s) voltam a ser como em ${rotuloDoArquivo(nome)}. Continuar?`)) return;
    setGravando(true);
    try {
      const r = await importarTudo(dumpDoBackup(backup));
      if (comConfig && backup.config) await saveConfig({ ...configAtual, ...(backup.config as unknown as Config) });
      aviso[r.falhas ? "alerta" : "sucesso"](`Restaurado: ${r.gravados} registro(s).${r.falhas ? ` ${r.falhas} não gravaram.` : ""}`);
      onFeito();
    } catch (e) {
      aviso.erro("Não restaurou: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setGravando(false);
    }
  };

  return (
    <Modal
      open
      onClose={onFechar}
      title={`Restaurar ${rotuloDoArquivo(nome)}`}
      maxWidth="max-w-2xl"
      footer={
        <button className="btn-danger" disabled={gravando || digitado.trim().toUpperCase() !== "RESTAURAR"} onClick={confirmar}>
          {gravando ? "Restaurando..." : "Restaurar"}
        </button>
      }
    >
      <p className="mb-2 text-sm">
        O que muda. Nada é apagado: o que foi criado depois deste backup <b>fica</b> como está.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-linha text-left text-xs uppercase text-tinta-suave">
            <tr>
              <th className="py-1.5 pr-2">Dados</th>
              <th className="px-1 py-1.5 text-right">Iguais</th>
              <th className="px-1 py-1.5 text-right">Voltam como eram</th>
              <th className="px-1 py-1.5 text-right">Reaparecem</th>
              <th className="px-1 py-1.5 text-right">Ficam</th>
            </tr>
          </thead>
          <tbody className="valor divide-y divide-linha">
            {previa.map((p) => (
              <tr key={p.tabela}>
                <td className="py-1.5 pr-2 font-grotesca font-semibold">{NOME_TABELA[p.tabela]}</td>
                <td className="px-1 py-1.5 text-right">{p.iguais}</td>
                <td className={`px-1 py-1.5 text-right ${p.voltam ? "font-bold text-amber-700" : ""}`}>{p.voltam}</td>
                <td className={`px-1 py-1.5 text-right ${p.reaparecem ? "font-bold" : ""}`}>{p.reaparecem}</td>
                <td className="px-1 py-1.5 text-right">{p.ficam}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {backup.config && (
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={comConfig} onChange={(e) => setComConfig(e.target.checked)} />
          Restaurar também as configurações da loja (nome, taxas, tabela de serviços...)
        </label>
      )}
      <label className="label mt-3 block">
        Para confirmar, digite RESTAURAR
        <input className="input" value={digitado} onChange={(e) => setDigitado(e.target.value)} autoComplete="off" />
      </label>
    </Modal>
  );
};
