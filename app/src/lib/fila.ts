/**
 * Fila de gravação para quando a internet cai.
 *
 * É o pior cenário do balcão: o cliente já levou a mercadoria, o troco já
 * saiu da gaveta, e a venda não gravou porque a operadora oscilou por vinte
 * segundos. O sistema mostrava um erro vermelho e o dinheiro simplesmente
 * não existia — quem estava atendendo tinha que lembrar de refazer tudo
 * depois, e não lembrava.
 *
 * A regra: **falha de REDE entra na fila; recusa do BANCO, não.**
 *
 * Essa distinção é o coração do arquivo. "Sem internet" é temporário e a
 * gravação vai dar certo daqui a pouco. Já "coluna não existe", "assinatura
 * vencida" ou "sem permissão" vão falhar de novo para sempre — enfileirar
 * isso criaria uma fila infinita tentando gravar o impossível, e o operador
 * acharia que salvou.
 *
 * A fila vive no localStorage porque precisa sobreviver ao F5 e ao navegador
 * fechado: a internet costuma voltar depois do expediente.
 */

export const CHAVE_FILA = "sistema-ti:fila-gravacao";
/** Acima disto, alguma coisa está muito errada e insistir só piora */
const MAX_FILA = 300;

export interface Pendente {
  id: string;
  tabela: string;
  /** A linha inteira, como ela iria para o banco */
  linha: Record<string, unknown>;
  /** Quando entrou na fila */
  em: string;
  /** Quantas vezes já tentamos */
  tentativas: number;
  /** O erro da última tentativa, para a tela poder explicar */
  ultimoErro?: string;
}

/**
 * O erro é de rede (vale tentar de novo) ou do banco (não adianta)?
 *
 * O `TypeError: Failed to fetch` do navegador é o caso clássico: ele é o que
 * o `fetch` devolve quando não conseguiu nem sair da máquina.
 */
export function ehFalhaDeRede(erro: unknown): boolean {
  const msg = erro instanceof Error ? erro.message : String(erro ?? "");
  if (!msg) return false;

  // Recusa explícita do banco: nunca vai passar por insistência.
  if (
    /column|does not exist|schema cache|violates|permission|denied|policy|duplicate|invalid|constraint|assinatura|não foi possível gravar|expirou/i.test(
      msg
    )
  ) {
    return false;
  }

  return (
    /failed to fetch|networkerror|network request failed|load failed|timeout|timed out|offline|ERR_INTERNET|ERR_NETWORK|fetch failed/i.test(
      msg
    ) ||
    // Erro sem mensagem útil com o navegador offline é rede até prova em
    // contrário: perder a venda é pior do que uma tentativa extra.
    (typeof navigator !== "undefined" && navigator.onLine === false)
  );
}

const ler = (): Pendente[] => {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE_FILA) || "[]");
    return Array.isArray(bruto) ? (bruto as Pendente[]) : [];
  } catch {
    // Fila ilegível não pode travar o sistema. O prejuízo é perder o que
    // estava lá; insistir num JSON quebrado perderia tudo o mais também.
    return [];
  }
};

const gravar = (itens: Pendente[]): void => {
  try {
    localStorage.setItem(CHAVE_FILA, JSON.stringify(itens.slice(0, MAX_FILA)));
  } catch {
    /* armazenamento cheio: a fila para de crescer, o sistema continua */
  }
};

export const fila = (): Pendente[] => ler();
export const tamanhoDaFila = (): number => ler().length;

/**
 * Põe na fila.
 *
 * Mesma tabela + mesmo id substitui em vez de empilhar: editar o mesmo
 * produto cinco vezes offline tem que gravar UMA vez, com o último valor.
 * Empilhar geraria cinco gravações e um "piscar" de valores antigos na tela
 * de quem estiver com o sistema aberto em outro aparelho.
 */
export function enfileirar(tabela: string, linha: Record<string, unknown>): void {
  const id = String(linha?.id ?? "");
  if (!id) return;
  const atual = ler().filter((p) => !(p.tabela === tabela && String(p.linha?.id) === id));
  atual.push({
    id: `${tabela}:${id}`,
    tabela,
    linha,
    em: new Date().toISOString(),
    tentativas: 0,
  });
  gravar(atual);
}

/** Tira da fila o que gravou */
export function remover(tabela: string, id: string): void {
  gravar(ler().filter((p) => !(p.tabela === tabela && String(p.linha?.id) === id)));
}

/** Registra que a tentativa falhou, sem perder o item */
export function marcarFalha(tabela: string, id: string, erro: string): void {
  gravar(
    ler().map((p) =>
      p.tabela === tabela && String(p.linha?.id) === id
        ? { ...p, tentativas: p.tentativas + 1, ultimoErro: erro }
        : p
    )
  );
}

export const limparFila = (): void => gravar([]);

/**
 * Descarrega a fila.
 *
 * Em ordem de entrada, porque a venda tem que gravar antes do movimento de
 * caixa que aponta para ela. Para no primeiro erro de rede: se a internet
 * ainda não voltou, tentar os outros trinta só gera trinta esperas de
 * tempo-limite e congela a tela.
 *
 * Recusa do banco não para a fila — ela sai de lá e é reportada. Um item
 * impossível não pode segurar os outros para sempre.
 */
export async function descarregar(
  enviar: (tabela: string, linha: Record<string, unknown>) => Promise<void>
): Promise<{ gravados: number; recusados: Pendente[]; restantes: number }> {
  let gravados = 0;
  const recusados: Pendente[] = [];

  for (const p of ler()) {
    try {
      await enviar(p.tabela, p.linha);
      remover(p.tabela, String(p.linha.id));
      gravados++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (ehFalhaDeRede(e)) {
        marcarFalha(p.tabela, String(p.linha.id), msg);
        break;
      }
      // O banco recusou: não vai passar nunca. Sai da fila e vira aviso.
      remover(p.tabela, String(p.linha.id));
      recusados.push({ ...p, ultimoErro: msg });
    }
  }

  return { gravados, recusados, restantes: ler().length };
}
