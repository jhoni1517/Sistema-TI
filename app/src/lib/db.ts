import { supabase, supabaseEnabled } from "./supabase";
import { proteger, revelar, estaCifrado } from "./cripto";
import type {
  Cliente,
  OrdemServico,
  Produto,
  MovimentoCaixa,
  SessaoCaixa,
  Fiado,
  Categoria,
  Fornecedor,
  Cotacao,
  PrecoFornecedor,
  ContaPagar,
  Meta,
  Evento,
  Venda,
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
  | "fornecedores"
  | "cotacoes"
  | "precos_fornecedor"
  | "contas_pagar"
  | "metas"
  | "eventos"
  | "vendas";

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
 *
 * A chave "config" NÃO é apagada por inteiro: quando a nuvem foi ligada
 * pela tela de Configurações (e não por variável de ambiente), é ali que
 * moram a URL e a chave do Supabase. Apagar tudo desconectava o aparelho
 * da nuvem ao sair, e o próximo login falhava como se a conta não
 * existisse.
 */
/**
 * Chaves que são do APARELHO, não da loja, e por isso sobrevivem ao logout.
 *
 * "ramo-por-conta" é a memória de qual tipo de loja cada conta usa nesta
 * máquina. Apagar junto fazia a tela de entrada esquecer exatamente no
 * momento em que ela precisa lembrar: no login seguinte.
 */
const CHAVES_DO_APARELHO = [PREFIX + "config", PREFIX + "ramo-por-conta"];

export const limparCacheLocal = () => {
  for (const chave of Object.keys(localStorage)) {
    if (chave.startsWith(PREFIX) && !CHAVES_DO_APARELHO.includes(chave)) {
      localStorage.removeItem(chave);
    }
  }
  // Da configuração, guarda só o que é do APARELHO (conexão e aparência)
  try {
    const raw = localStorage.getItem(PREFIX + "config");
    if (!raw) return;
    const cfg = JSON.parse(raw);
    localStorage.setItem(
      PREFIX + "config",
      JSON.stringify({
        supabaseUrl: cfg.supabaseUrl,
        supabaseKey: cfg.supabaseKey,
        tema: cfg.tema,
        corDestaque: cfg.corDestaque,
      })
    );
  } catch {
    /* configuração ilegível: melhor deixar como está do que perder a conexão */
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

/* ---------- Campos sigilosos ----------
 * A senha e o padrão de desbloqueio do aparelho sobem cifrados e descem
 * decifrados aqui, no único ponto por onde todos os dados passam. Assim
 * nenhuma tela precisa lembrar de proteger nada — e não há como esquecer.
 */
const SIGILOSOS: Partial<Record<TableName, string[]>> = {
  ordens: ["senhaAparelho", "padraoDesbloqueio"],
};

async function cifrarLinha<T>(table: TableName, row: T): Promise<T> {
  const campos = SIGILOSOS[table];
  if (!campos) return row;
  const copia = { ...row } as Record<string, unknown>;
  for (const campo of campos) {
    const v = copia[campo];
    if (typeof v === "string" && v) copia[campo] = await proteger(v);
  }
  return copia as T;
}

async function decifrarLinhas<T>(table: TableName, rows: T[]): Promise<T[]> {
  const campos = SIGILOSOS[table];
  if (!campos) return rows;
  return Promise.all(
    rows.map(async (row) => {
      const copia = { ...row } as Record<string, unknown>;
      for (const campo of campos) {
        const v = copia[campo];
        if (estaCifrado(v as string)) copia[campo] = await revelar(v as string);
      }
      return copia as T;
    })
  );
}

/**
 * O banco recusa a gravação quando a assinatura está vencida — a política
 * de escrita exige loja_pode_gravar(). O erro que volta do PostgREST fala
 * em "row-level security policy", o que não diz nada para quem está no
 * balcão. Aqui ele vira uma frase que a pessoa entende e resolve.
 */
function traduzirErroGravacao(error: { message?: string; code?: string }): Error {
  const msg = error?.message || "";
  if (error?.code === "42501" || /row-level security|violates row-level/i.test(msg)) {
    return new Error(
      "Não foi possível salvar: a assinatura do sistema está vencida. " +
        "Você continua consultando e imprimindo tudo normalmente — " +
        "acerte a mensalidade em Assinatura para voltar a cadastrar."
    );
  }
  return new Error(msg || "Não foi possível salvar.");
}

/**
 * Erro de LEITURA em português, dizendo qual tabela e o que fazer.
 *
 * "relation public.vendas does not exist" não significa nada para quem está
 * no balcão vendo a tela zerada. E tabela que falta é sempre a mesma
 * história: migração nova que ainda não foi rodada.
 */
function traduzirErroLeitura(table: string, error: { message?: string; code?: string }): Error {
  const msg = error?.message || "";
  if (error?.code === "42P01" || /does not exist|not find the table|schema cache/i.test(msg)) {
    return new Error(
      `A tabela "${table}" ainda não existe no banco. Rode a migração que falta ` +
        `(app/CONFIGURACAO.md lista a ordem) — os dados das outras telas estão a salvo.`
    );
  }
  return new Error(`Não foi possível carregar "${table}": ${msg || "erro desconhecido"}`);
}

// ---------- API pública ----------
async function getAll<T extends WithId>(table: TableName): Promise<T[]> {
  if (supabaseEnabled && supabase) {
    const { data, error } = await supabase.from(table).select("*");
    if (error) throw traduzirErroLeitura(table, error);
    return decifrarLinhas(table, (data as T[]) || []);
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
    const payload = await cifrarLinha(table, { ...row, lojaId: lojaAtual });
    const { data, error } = await supabase
      .from(table)
      .upsert(payload)
      .select()
      .single();
    if (error) throw traduzirErroGravacao(error);
    // devolve para a tela já em texto claro, como ela espera
    const [volta] = await decifrarLinhas(table, [data as T]);
    return volta;
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
    if (error) throw traduzirErroGravacao(error);
    return;
  }
  const rows = localBackend.list<WithId>(table);
  localBackend.saveAll(
    table,
    rows.filter((r) => r.id !== id)
  );
}

/** Conjunto completo de dados da loja, usado no backup */
export interface DumpLoja {
  clientes?: Cliente[];
  ordens?: OrdemServico[];
  produtos?: Produto[];
  movimentos?: MovimentoCaixa[];
  sessoes?: SessaoCaixa[];
  fiados?: Fiado[];
  categorias?: Categoria[];
  fornecedores?: Fornecedor[];
  cotacoes?: Cotacao[];
  precos?: PrecoFornecedor[];
  contas?: ContaPagar[];
  metas?: Meta[];
  eventos?: Evento[];
  vendas?: Venda[];
}

const TABELA_DO_CAMPO: Record<keyof DumpLoja, TableName> = {
  clientes: "clientes",
  ordens: "ordens",
  produtos: "produtos",
  movimentos: "movimentos",
  sessoes: "sessoes",
  fiados: "fiados",
  categorias: "categorias",
  fornecedores: "fornecedores",
  cotacoes: "cotacoes",
  precos: "precos_fornecedor",
  contas: "contas_pagar",
  metas: "metas",
  eventos: "eventos",
  vendas: "vendas",
};

/**
 * Restaura um backup.
 *
 * Antes isto só gravava no localStorage e avisava "importado com sucesso".
 * Com a nuvem ligada — que é o caso normal — a tela recarregava do servidor
 * e nada mudava: a pessoa achava que tinha restaurado e não tinha. Numa
 * restauração pós-desastre, essa mentira é o pior defeito possível.
 */
export async function importarTudo(
  dump: DumpLoja
): Promise<{ gravados: number; falhas: number }> {
  let gravados = 0;
  let falhas = 0;

  for (const campo of Object.keys(TABELA_DO_CAMPO) as (keyof DumpLoja)[]) {
    const linhas = dump[campo];
    if (!Array.isArray(linhas) || linhas.length === 0) continue;
    const tabela = TABELA_DO_CAMPO[campo];

    if (supabaseEnabled && supabase) {
      // Uma a uma: um registro problemático não pode derrubar o resto
      for (const linha of linhas) {
        try {
          await upsert(tabela, linha as WithId);
          gravados++;
        } catch {
          falhas++;
        }
      }
    } else {
      // O tipo da união não estreita por campo aqui; o formato é validado
      // na leitura do arquivo, antes de chegar nesta função.
      localBackend.saveAll(tabela, linhas as WithId[]);
      gravados += linhas.length;
    }
  }

  return { gravados, falhas };
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
  cotacoes: {
    all: () => getAll<Cotacao>("cotacoes"),
    save: (c: Cotacao) => upsert("cotacoes", c),
    remove: (id: string) => remove("cotacoes", id),
  },
  precos: {
    all: () => getAll<PrecoFornecedor>("precos_fornecedor"),
    save: (p: PrecoFornecedor) => upsert("precos_fornecedor", p),
    remove: (id: string) => remove("precos_fornecedor", id),
  },
  contas: {
    all: () => getAll<ContaPagar>("contas_pagar"),
    save: (c: ContaPagar) => upsert("contas_pagar", c),
    remove: (id: string) => remove("contas_pagar", id),
  },
  metas: {
    all: () => getAll<Meta>("metas"),
    save: (m: Meta) => upsert("metas", m),
    remove: (id: string) => remove("metas", id),
  },
  eventos: {
    all: () => getAll<Evento>("eventos"),
    save: (e: Evento) => upsert("eventos", e),
    remove: (id: string) => remove("eventos", id),
  },
  vendas: {
    all: () => getAll<Venda>("vendas"),
    save: (v: Venda) => upsert("vendas", v),
    remove: (id: string) => remove("vendas", id),
  },
  // Configurações da loja compartilhadas na nuvem (uma linha por loja)
  /**
   * A loja, do jeito que o sistema precisa dela na tela.
   *
   * O ramo mora aqui, e não na configuração, porque é O QUE FOI VENDIDO:
   * a configuração a própria loja edita, e quem contratou mercearia podia
   * virar pizzaria sozinho. Um gatilho no banco recusa a troca por quem não
   * é o administrador do sistema.
   */
  loja: {
    async ramo(): Promise<string | null> {
      if (!supabaseEnabled || !supabase || !lojaAtual) return null;
      const { data, error } = await supabase
        .from("lojas")
        .select("ramo")
        .eq("id", lojaAtual)
        .maybeSingle();

      if (error) {
        // Coluna ainda não criada não derruba a carga: a loja continua
        // funcionando como assistência até a migração rodar.
        if (/column|does not exist|schema cache|42703|PGRST204/i.test(error.message)) {
          return null;
        }
        // Qualquer outro erro PRECISA aparecer. Engolir aqui rebaixava uma
        // mercearia a assistência em silêncio: o cliente abria o sistema
        // errado e não havia nada na tela dizendo o porquê.
        throw new Error(
          `Não foi possível ler o tipo de loja contratado: ${error.message}`
        );
      }

      // Linha não veio: ou a loja sumiu, ou a política de leitura barrou. Nos
      // dois casos o sistema não sabe o que a loja comprou, e fingir que sabe
      // é como o erro passa despercebido.
      if (!data) {
        throw new Error(
          "A loja deste usuário não foi encontrada. Confira se o perfil aponta " +
            "para uma loja existente (tabela perfis, coluna loja_id)."
        );
      }

      return (data.ramo as string) || null;
    },
  },

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
