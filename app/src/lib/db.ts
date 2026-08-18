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
  Comanda,
  TarefaDiaria,
} from "./types";
import type { Nota } from "./nota";

/**
 * Repositório de dados com backend duplo:
 *  - Nuvem (Supabase) quando configurado
 *  - Local (localStorage) como fallback offline / demonstração
 *
 * Toda a UI conversa apenas com este módulo, então trocar/ativar a nuvem
 * não exige mudar nenhuma tela.
 */

import { enfileirar, ehFalhaDeRede, descarregar } from "./fila";

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
  | "vendas"
  | "tarefas"
  | "comandas"
  | "notas";

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

/**
 * O que este aparelho já sabe da loja, sem esperar a nuvem.
 *
 * Serve para a tela de entrada se apresentar como a LOJA e não como o
 * sistema: quem abre isso às sete da manhã é o dono, e ver o nome e a logo
 * dele antes de digitar a senha é a diferença entre um app que é da loja e
 * um app genérico que a loja usa.
 *
 * Sai do mesmo lugar que a abertura em index.html lê, e some no logout
 * junto com o resto do cache — num balcão compartilhado, a loja anterior
 * não pode ficar estampada na porta.
 */
export const marcaDoAparelho = (): { nomeLoja?: string; logoUrl?: string } => {
  try {
    const c = JSON.parse(localStorage.getItem(PREFIX + "config") || "{}");
    return { nomeLoja: c.nomeLoja || undefined, logoUrl: c.logoUrl || undefined };
  } catch {
    // Configuração ilegível é enfeite a menos, não tela de erro.
    return {};
  }
};

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

/* ---------- Marca de escrita ----------
 *
 * UMA LEITURA QUE COMEÇOU ANTES DE UMA GRAVAÇÃO NÃO PODE APAGÁ-LA DA TELA.
 *
 * O bug que originou: a venda lançada no Caixa aparecia e sumia, e só voltava
 * com F5. A tela recarrega tudo ao voltar o foco da janela — e recarregar são
 * dezessete consultas que no 4G do balcão levam segundos. Quando o operador
 * registrava a venda no meio dessa janela, a resposta da leitura (tirada do
 * banco ANTES do insert) chegava depois e substituía a lista inteira,
 * levando embora o lançamento que já estava na tela.
 *
 * O dinheiro estava gravado o tempo todo. Mas quem lança uma venda e não a vê
 * lança de novo — e aí o furo deixa de ser de tela e passa a ser de caixa.
 *
 * O contador mora AQUI porque `upsert` e `remove` são o único ponto por onde
 * toda gravação passa. Deixá-lo em cada ação da loja seria vinte lugares para
 * esquecer um.
 */
let escritas = 0;

/** Quantas gravações já aconteceram. Só serve para comparar com ela mesma. */
export const marcaDeEscrita = (): number => escritas;

/**
 * Uma leitura que sabe se foi ultrapassada.
 *
 * Quem vai recarregar chama isto ANTES; quando os dados chegarem, `atual()`
 * responde se alguma gravação aconteceu no meio. Se aconteceu, o que está na
 * tela é mais novo que o que voltou do banco, e a leitura se descarta.
 *
 * Descartar é seguro: o estado da tela já tem o registro novo, e a próxima
 * volta para o app recarrega de novo. O que se perde é a alteração de outro
 * aparelho por alguns segundos; o que se ganha é a venda não sumir.
 */
export function leituraAtual(): () => boolean {
  const inicio = escritas;
  return () => escritas === inicio;
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

/**
 * Desce decifrando — e, quando NÃO consegue, deixa o bloco cifrado como está.
 *
 * A versão anterior trocava o bloco ilegível por texto vazio. Isso fazia a
 * tela anunciar "Nenhum dado de acesso registrado" numa OS que tinha a senha
 * gravada, e a gravação seguinte daquela OS (trocar status, receber, incluir
 * peça) subia o vazio por cima do bloco: a senha do cliente sumia de vez, sem
 * ninguém ter tocado no campo.
 *
 * Mantendo o bloco cifrado, as duas coisas se resolvem sozinhas:
 *
 * - `proteger` reconhece o que já está cifrado e devolve igual, então a
 *   gravação seguinte regrava o MESMO bloco. Nada se perde.
 * - `estaCifrado` continua verdadeiro na tela, que por isso consegue dizer
 *   "não foi possível abrir" em vez de "não tem nada".
 */
async function decifrarLinhas<T>(table: TableName, rows: T[]): Promise<T[]> {
  const campos = SIGILOSOS[table];
  if (!campos) return rows;
  return Promise.all(
    rows.map(async (row) => {
      const copia = { ...row } as Record<string, unknown>;
      for (const campo of campos) {
        const v = copia[campo];
        if (!estaCifrado(v as string)) continue;
        const claro = await revelar(v as string);
        if (claro !== null) copia[campo] = claro;
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
  // Sobe ANTES de tentar, e não depois de dar certo. Uma leitura em voo que
  // termine no meio da gravação não pode ser aplicada: ela foi tirada do
  // banco antes, e aplicá-la devolveria a tela ao estado anterior.
  escritas++;
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
    try {
      const { data, error } = await supabase
        .from(table)
        .upsert(payload)
        .select()
        .single();
      if (error) throw traduzirErroGravacao(error);
      // devolve para a tela já em texto claro, como ela espera
      const [volta] = await decifrarLinhas(table, [data as T]);
      return volta;
    } catch (e) {
      // Internet caiu no meio da venda: o cliente já levou a mercadoria e o
      // troco já saiu da gaveta. Guardar para gravar quando voltar é a
      // diferença entre um susto e um furo de caixa que ninguém rastreia.
      //
      // Só falha de REDE entra na fila. Recusa do banco (coluna que falta,
      // assinatura vencida, sem permissão) vai falhar de novo para sempre —
      // enfileirar criaria fila infinita e o operador acharia que salvou.
      if (ehFalhaDeRede(e)) {
        enfileirar(table, payload as unknown as Record<string, unknown>);
        return row;
      }
      throw e;
    }
  }
  const rows = localBackend.list<T>(table);
  const idx = rows.findIndex((r) => r.id === row.id);
  if (idx >= 0) rows[idx] = row;
  else rows.push(row);
  localBackend.saveAll(table, rows);
  return row;
}

async function remove(table: TableName, id: string): Promise<void> {
  // Mesma razão do upsert: apagar também é gravar. Sem isto, a leitura em voo
  // ressuscitaria na tela o lançamento que o operador acabou de excluir.
  escritas++;
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
  tarefas?: TarefaDiaria[];
  comandas?: Comanda[];
  notas?: Nota[];
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
  tarefas: "tarefas",
  comandas: "comandas",
  notas: "notas",
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
  comandas: {
    all: () => getAll<Comanda>("comandas"),
    save: (c: Comanda) => upsert("comandas", c),
    remove: (id: string) => remove("comandas", id),
  },
  notas: {
    all: () => getAll<Nota>("notas"),
    save: (x: Nota) => upsert("notas", x),
    remove: (id: string) => remove("notas", id),
  },

  tarefas: {
    all: () => getAll<TarefaDiaria>("tarefas"),
    save: (t: TarefaDiaria) => upsert("tarefas", t),
    remove: (id: string) => remove("tarefas", id),
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

    /**
     * O catálogo público está ligado nesta loja?
     *
     * Nasce desligado: ninguém publica preço sem escolher publicar. Coluna
     * ainda não criada devolve `false` — a loja continua funcionando, só sem
     * a vitrine, que é o lado seguro de errar.
     */
    async catalogoAtivo(): Promise<boolean> {
      if (!supabaseEnabled || !supabase || !lojaAtual) return false;
      const { data, error } = await supabase
        .from("lojas")
        .select("catalogo_ativo")
        .eq("id", lojaAtual)
        .maybeSingle();
      if (error) {
        if (/column|does not exist|schema cache|42703|PGRST204/i.test(error.message)) {
          return false;
        }
        throw new Error(`Não foi possível ler o catálogo da loja: ${error.message}`);
      }
      return data?.catalogo_ativo === true;
    },

    /**
     * Liga ou desliga a vitrine pública.
     *
     * Quem decide é o dono da loja, não o operador do sistema. Antes só dava
     * para ligar rodando SQL no painel do banco — o que na prática deixava a
     * decisão com quem NÃO é dono do preço, e transformava um interruptor em
     * chamado de suporte.
     *
     * A política do banco continua mandando: só o dono da própria loja passa.
     */
    async definirCatalogo(ativo: boolean): Promise<void> {
      if (!supabaseEnabled || !supabase || !lojaAtual) {
        throw new Error("Sem conexão com a nuvem.");
      }
      const { data, error } = await supabase
        .from("lojas")
        .update({ catalogo_ativo: ativo })
        .eq("id", lojaAtual)
        .select("id");
      if (error) throw traduzirErroGravacao(error);
      /*
       * Zero linhas alteradas NÃO é erro para o Postgres: a política de
       * escrita simplesmente não encontra a linha e a chamada volta bem
       * sucedida com nada dentro. Sem esta checagem, um funcionário clicava
       * no interruptor, via "catálogo no ar" e nada tinha mudado — a pior
       * classe de falha, porque a loja acha que publicou.
       */
      if (!data || data.length === 0) {
        throw new Error(
          "O banco não deixou mudar o catálogo desta loja. Só o dono da loja " +
            "pode ligar ou desligar a vitrine — entre com a conta dele."
        );
      }
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


/**
 * Tenta gravar o que ficou preso na fila enquanto a internet estava fora.
 *
 * Devolve o que aconteceu para a tela poder avisar — descarregar em silêncio
 * seria repetir o erro que a fila veio consertar.
 */
export async function sincronizarPendentes() {
  return descarregar(async (tabela, linha) => {
    if (!supabaseEnabled || !supabase) throw new Error("Nuvem desligada");
    const { error } = await supabase.from(tabela).upsert(linha);
    if (error) throw traduzirErroGravacao(error);
  });
}
