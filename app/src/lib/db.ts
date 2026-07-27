import { supabase, supabaseEnabled } from "./supabase";
import type {
  Cliente,
  OrdemServico,
  Produto,
  MovimentoCaixa,
  SessaoCaixa,
  Fiado,
  Categoria,
  Fornecedor,
} from "./types";

/**
 * Repositório de dados com backend duplo:
 *  - Nuvem (Supabase) quando configurado
 *  - Local (localStorage) como fallback offline / demonstração
 *
 * Toda a UI conversa apenas com este módulo, então trocar/ativar a nuvem
 * não exige mudar nenhuma tela.
 */

const PREFIX = "sistema-ti:";

type TableName =
  | "clientes"
  | "ordens"
  | "produtos"
  | "movimentos"
  | "sessoes"
  | "fiados"
  | "categorias"
  | "fornecedores";

interface WithId {
  id: string;
}

/**
 * Loja do usuário logado. Todo registro gravado leva este carimbo, e as
 * políticas do banco (RLS) só permitem ler/gravar linhas da própria loja —
 * mesmo que alguém tente burlar pelo navegador.
 */
let lojaAtual: string | null = null;
export const definirLoja = (id: string | null) => {
  lojaAtual = id;
};
export const obterLoja = (): string | null => lojaAtual;

/**
 * Apaga o rastro da loja anterior neste aparelho.
 * Num computador de balcão compartilhado, sem isto o próximo usuário veria
 * o nome, o endereço e os dados em cache da loja de quem saiu.
 */
export const limparCacheLocal = () => {
  for (const chave of Object.keys(localStorage)) {
    if (chave.startsWith(PREFIX)) localStorage.removeItem(chave);
  }
};

// ---------- Backend local ----------
const localBackend = {
  list<T>(table: TableName): T[] {
    try {
      const raw = localStorage.getItem(PREFIX + table);
      return raw ? (JSON.parse(raw) as T[]) : [];
    } catch {
      return [];
    }
  },
  saveAll<T>(table: TableName, rows: T[]) {
    localStorage.setItem(PREFIX + table, JSON.stringify(rows));
  },
};

// ---------- API pública ----------
async function getAll<T extends WithId>(table: TableName): Promise<T[]> {
  if (supabaseEnabled && supabase) {
    const { data, error } = await supabase.from(table).select("*");
    if (error) throw error;
    return (data as T[]) || [];
  }
  return localBackend.list<T>(table);
}

async function upsert<T extends WithId>(table: TableName, row: T): Promise<T> {
  if (supabaseEnabled && supabase) {
    // Sem loja definida a gravação seria recusada pelo banco com uma mensagem
    // técnica incompreensível. Melhor falhar aqui, dizendo o que fazer.
    if (!lojaAtual) {
      throw new Error(
        "Sua sessão expirou e o registro não foi salvo. Entre novamente e repita a operação."
      );
    }
    // carimba a loja do usuário — sem isso o banco rejeita a gravação
    const payload = { ...row, lojaId: lojaAtual };
    const { data, error } = await supabase
      .from(table)
      .upsert(payload)
      .select()
      .single();
    if (error) throw error;
    return data as T;
  }
  const rows = localBackend.list<T>(table);
  const idx = rows.findIndex((r) => r.id === row.id);
  if (idx >= 0) rows[idx] = row;
  else rows.push(row);
  localBackend.saveAll(table, rows);
  return row;
}

async function remove(table: TableName, id: string): Promise<void> {
  if (supabaseEnabled && supabase) {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) throw error;
    return;
  }
  const rows = localBackend.list<WithId>(table);
  localBackend.saveAll(
    table,
    rows.filter((r) => r.id !== id)
  );
}

export const db = {
  online: supabaseEnabled,

  clientes: {
    all: () => getAll<Cliente>("clientes"),
    save: (c: Cliente) => upsert("clientes", c),
    remove: (id: string) => remove("clientes", id),
  },
  ordens: {
    all: () => getAll<OrdemServico>("ordens"),
    save: (o: OrdemServico) => upsert("ordens", o),
    remove: (id: string) => remove("ordens", id),
  },
  produtos: {
    all: () => getAll<Produto>("produtos"),
    save: (p: Produto) => upsert("produtos", p),
    remove: (id: string) => remove("produtos", id),
  },
  movimentos: {
    all: () => getAll<MovimentoCaixa>("movimentos"),
    save: (m: MovimentoCaixa) => upsert("movimentos", m),
    remove: (id: string) => remove("movimentos", id),
  },
  sessoes: {
    all: () => getAll<SessaoCaixa>("sessoes"),
    save: (s: SessaoCaixa) => upsert("sessoes", s),
    remove: (id: string) => remove("sessoes", id),
  },
  fiados: {
    all: () => getAll<Fiado>("fiados"),
    save: (f: Fiado) => upsert("fiados", f),
    remove: (id: string) => remove("fiados", id),
  },
  categorias: {
    all: () => getAll<Categoria>("categorias"),
    save: (c: Categoria) => upsert("categorias", c),
    remove: (id: string) => remove("categorias", id),
  },
  fornecedores: {
    all: () => getAll<Fornecedor>("fornecedores"),
    save: (f: Fornecedor) => upsert("fornecedores", f),
    remove: (id: string) => remove("fornecedores", id),
  },
  // Configurações da loja compartilhadas na nuvem (uma linha por loja)
  config: {
    async get(): Promise<Record<string, unknown> | null> {
      if (!supabaseEnabled || !supabase || !lojaAtual) return null;
      const { data, error } = await supabase
        .from("configuracoes")
        .select("dados")
        .eq("id", lojaAtual)
        .maybeSingle();
      if (error) return null;
      return (data?.dados as Record<string, unknown>) || null;
    },
    async save(dados: Record<string, unknown>): Promise<void> {
      if (!supabaseEnabled || !supabase || !lojaAtual) return;
      await supabase
        .from("configuracoes")
        .upsert({ id: lojaAtual, lojaId: lojaAtual, dados });
    },
  },
};
