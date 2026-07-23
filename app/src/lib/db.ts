import { supabase, supabaseEnabled } from "./supabase";
import type {
  Cliente,
  OrdemServico,
  Produto,
  MovimentoCaixa,
  SessaoCaixa,
  Fiado,
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
  | "fiados";

interface WithId {
  id: string;
}

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
    const { data, error } = await supabase
      .from(table)
      .upsert(row)
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
};
