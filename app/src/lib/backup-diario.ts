import { txt } from "./format";
import type { DumpLoja } from "./db";

/**
 * Backup automático diário: o robô (api/backup.js) grava, todo dia, os
 * dados de cada loja num depósito privado, cifrados com a chave da própria
 * loja. Guarda 30 dias. Esta é a metade do app: ler, comparar e restaurar.
 *
 * Por que automático: o botão "Exportar" dependia de alguém lembrar, e o
 * dia em que o computador queima é o dia seguinte ao último backup que
 * ninguém fez.
 *
 * A cifra é a mesma do robô, em api/_backup.js; o teste confere que um
 * abre o que o outro fecha.
 */

export const TABELAS_BACKUP = [
  "clientes",
  "ordens",
  "produtos",
  "movimentos",
  "sessoes",
  "fiados",
  "categorias",
  "fornecedores",
  "cotacoes",
  "precos_fornecedor",
  "contas_pagar",
  "metas",
  "eventos",
  "vendas",
  "tarefas",
  "comandas",
  "notas",
  "rmas",
  "pedidos_site",
] as const;
export type TabelaBackup = (typeof TABELAS_BACKUP)[number];

export const RETENCAO_DIAS = 30;
const PREFIXO = "sbk1.";

export interface Backup {
  formato: "sistema-ti-backup";
  versao: number;
  lojaId: string;
  geradoEm: string;
  config: Record<string, unknown> | null;
  tabelas: Partial<Record<TabelaBackup, Record<string, unknown>[]>>;
}

const b64 = (bytes: ArrayBuffer | Uint8Array): string => {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < arr.length; i += 0x8000) s += String.fromCharCode(...arr.subarray(i, i + 0x8000));
  return btoa(s);
};
const deB64 = (t: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(t);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
};

async function chaveDe(chaveB64: string): Promise<CryptoKey> {
  if (!chaveB64) throw new Error("Loja sem chave de criptografia.");
  return crypto.subtle.importKey("raw", deB64(chaveB64), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export function montarBackup(lojaId: string, geradoEm: string, tabelas: Backup["tabelas"], config: Backup["config"]): Backup {
  return { formato: "sistema-ti-backup", versao: 1, lojaId, geradoEm, config: config || null, tabelas };
}

export async function cifrar(texto: string, chaveB64: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await chaveDe(chaveB64);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, new TextEncoder().encode(texto));
  return `${PREFIXO}${b64(iv)}.${b64(ct)}`;
}

export async function decifrar(pacote: string, chaveB64: string): Promise<string> {
  if (typeof pacote !== "string" || !pacote.startsWith(PREFIXO)) throw new Error("Arquivo não é um backup do sistema.");
  const [iv, ct] = pacote.slice(PREFIXO.length).split(".");
  const k = await chaveDe(chaveB64);
  try {
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(iv) }, k, deB64(ct)));
  } catch {
    throw new Error("Não deu para abrir: o backup é de outra loja ou está corrompido.");
  }
}

export const nomeDoArquivo = (quandoISO: string, manual = false): string =>
  manual ? `${quandoISO.slice(0, 10)}-manual-${quandoISO.slice(11, 13)}${quandoISO.slice(14, 16)}.json.enc` : `${quandoISO.slice(0, 10)}.json.enc`;

export function paraApagar(nomes: string[], hoje: string, dias = RETENCAO_DIAS): string[] {
  const [a, m, d] = hoje.split("-").map(Number);
  const limite = new Date(Date.UTC(a, m - 1, d - dias)).toISOString().slice(0, 10);
  return nomes.filter((n) => /^\d{4}-\d{2}-\d{2}/.test(n) && n.slice(0, 10) < limite);
}

/** "2026-09-26-manual-1432.json.enc" → "26/09/2026 14:32 (manual)" */
export function rotuloDoArquivo(nome: string): string {
  const m = nome.match(/^(\d{4})-(\d{2})-(\d{2})(?:-manual-(\d{2})(\d{2}))?/);
  if (!m) return nome;
  return `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}:${m[5]} (manual)` : " (automático)"}`;
}

/** Confere que o JSON é mesmo um backup desta loja. */
export function lerBackup(texto: string, lojaId: string): Backup {
  let b: Backup;
  try {
    b = JSON.parse(texto);
  } catch {
    throw new Error("O backup está corrompido.");
  }
  if (!b || b.formato !== "sistema-ti-backup" || typeof b.tabelas !== "object") throw new Error("Arquivo não é um backup do sistema.");
  if (lojaId && b.lojaId !== lojaId) throw new Error("Este backup é de outra loja.");
  return b;
}

const CAMPO: Partial<Record<TabelaBackup, keyof DumpLoja>> = {
  precos_fornecedor: "precos",
  contas_pagar: "contas",
};

/** Backup → o formato que importarTudo grava. */
export function dumpDoBackup(b: Backup): DumpLoja {
  const d: Record<string, unknown[]> = {};
  for (const t of TABELAS_BACKUP) {
    const linhas = b.tabelas[t];
    if (Array.isArray(linhas) && linhas.length) d[CAMPO[t] || t] = linhas;
  }
  return d as DumpLoja;
}

export interface PreviaTabela {
  tabela: TabelaBackup;
  noBackup: number;
  iguais: number;
  /** Existem nos dois, com diferença: voltam a ser como no backup */
  voltam: number;
  /** Só no backup: foram apagados depois, e voltam */
  reaparecem: number;
  /** Só no sistema hoje: criados depois do backup, FICAM como estão */
  ficam: number;
}

/** Compara sem ligar para a ordem das chaves nem para lojaId. */
const igual = (a: Record<string, unknown>, b: Record<string, unknown>): boolean => {
  const norm = (o: Record<string, unknown>) =>
    JSON.stringify(
      Object.keys(o)
        .filter((k) => k !== "lojaId" && o[k] !== null && o[k] !== undefined)
        .sort()
        .map((k) => [k, o[k]])
    );
  return norm(a) === norm(b);
};

/**
 * O que a restauração muda, tabela por tabela, ANTES de mudar. Restaurar
 * grava por cima (upsert): o que foi criado depois do backup fica. Apagar
 * dado sem a pessoa ver é a única coisa que uma restauração não pode fazer.
 */
export function previaRestauracao(b: Backup, atual: Partial<Record<TabelaBackup, { id: string }[]>>): PreviaTabela[] {
  const saida: PreviaTabela[] = [];
  for (const t of TABELAS_BACKUP) {
    const doBackup = (b.tabelas[t] || []) as Record<string, unknown>[];
    const hoje = (atual[t] || []) as unknown as Record<string, unknown>[];
    if (!doBackup.length && !hoje.length) continue;
    const porId = new Map(hoje.map((r) => [txt(r.id as string), r]));
    let iguais = 0;
    let voltam = 0;
    let reaparecem = 0;
    for (const r of doBackup) {
      const h = porId.get(txt(r.id as string));
      if (!h) reaparecem++;
      else if (igual(r, h)) iguais++;
      else voltam++;
    }
    const ids = new Set(doBackup.map((r) => txt(r.id as string)));
    const ficam = hoje.filter((r) => !ids.has(txt(r.id as string))).length;
    saida.push({ tabela: t, noBackup: doBackup.length, iguais, voltam, reaparecem, ficam });
  }
  return saida;
}

export const NOME_TABELA: Record<TabelaBackup, string> = {
  clientes: "Clientes",
  ordens: "Ordens de serviço",
  produtos: "Produtos",
  movimentos: "Lançamentos do caixa",
  sessoes: "Aberturas de caixa",
  fiados: "Fiado",
  categorias: "Categorias",
  fornecedores: "Fornecedores",
  cotacoes: "Cotações",
  precos_fornecedor: "Preços de fornecedor",
  contas_pagar: "Contas",
  metas: "Metas",
  eventos: "Agenda",
  vendas: "Vendas",
  tarefas: "Checklist",
  comandas: "Comandas",
  notas: "Notas fiscais",
  rmas: "Trocas com fornecedor",
  pedidos_site: "Orçamentos do site",
};
