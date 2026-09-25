import { normalizar, txt } from "./format";
import { numeroDaPlanilha, type Linha } from "./planilha";

/**
 * Tabela de serviços: modelo × serviço (iPhone 13 × Troca de tela = R$ 650).
 *
 * No balcão, o preço morava na cabeça do dono ou num papel colado no
 * monitor. O atendente que não sabia ligava para o dono no meio do
 * atendimento — ou chutava, e o cliente voltava no dia seguinte achando
 * que tinha sido enganado quando o dono cobrou outro valor.
 *
 * Mora na configuração da loja (sobe para a nuvem), porque a página
 * pública de orçamento lê a mesma tabela: dois lugares com preço diferente
 * para o mesmo conserto é a loja parecendo mentirosa.
 *
 * Toda conta é em centavos inteiros. Reajuste de 10% em R$ 649,90 feito em
 * ponto flutuante dá 714,8900000001, e a tela mostra isso.
 */

/** O que o cliente escolhe na página pública de orçamento */
export type Problema = "tela" | "bateria" | "conector" | "nao-liga" | "outro";

export const PROBLEMAS: { id: Problema; nome: string; palavras: string[] }[] = [
  { id: "tela", nome: "Tela", palavras: ["tela", "display", "frontal", "touch", "vidro", "lcd", "oled"] },
  { id: "bateria", nome: "Bateria", palavras: ["bateria", "bat"] },
  { id: "conector", nome: "Conector de carga", palavras: ["conector", "carga", "carregamento", "carregar", "dock"] },
  { id: "nao-liga", nome: "Não liga", palavras: ["nao liga", "placa", "desligado", "morto"] },
  { id: "outro", nome: "Outro", palavras: [] },
];

export interface ServicoTabela {
  id: string;
  nome: string;
  /** Qual problema da página pública este serviço resolve */
  problema?: Problema;
}

export interface ModeloTabela {
  id: string;
  marca: string;
  modelo: string;
  /** id do serviço → preço. Ausente = a loja não faz ou não definiu. */
  precos: Record<string, number>;
  /**
   * id do serviço → produto do estoque que ele usa (a tela do A15). É o que
   * liga a subida de custo da peça à margem do serviço (lib/margem.ts) e
   * põe custo e baixa de estoque na OS sugerida pela tabela.
   */
  pecas?: Record<string, string>;
}

export interface TabelaServicos {
  servicos: ServicoTabela[];
  modelos: ModeloTabela[];
}

export const SERVICOS_PADRAO: ServicoTabela[] = [
  { id: "tela", nome: "Troca de tela", problema: "tela" },
  { id: "bateria", nome: "Troca de bateria", problema: "bateria" },
  { id: "conector", nome: "Conector de carga", problema: "conector" },
  { id: "nao-liga", nome: "Não liga (placa)", problema: "nao-liga" },
];

export const tabelaVazia = (): TabelaServicos => ({ servicos: SERVICOS_PADRAO.map((s) => ({ ...s })), modelos: [] });

/** Tabela que veio da nuvem pode ter sido gravada por uma versão antiga, ou estar quebrada. */
export function tabelaSegura(t: unknown): TabelaServicos {
  const x = (t && typeof t === "object" ? t : {}) as Partial<TabelaServicos>;
  const servicos = Array.isArray(x.servicos)
    ? x.servicos.filter((s) => s && typeof s.id === "string" && typeof s.nome === "string")
    : SERVICOS_PADRAO.map((s) => ({ ...s }));
  const modelos = Array.isArray(x.modelos)
    ? x.modelos
        .filter((m) => m && typeof m.id === "string" && typeof m.modelo === "string")
        .map((m) => ({ ...m, marca: txt(m.marca), precos: m.precos && typeof m.precos === "object" ? m.precos : {} }))
    : [];
  return { servicos, modelos };
}

// ---------- dinheiro ----------

const centavos = (v: number) => Math.round(v * 100);

export type Arredondar = "centavo" | "inteiro" | "final90";

/**
 * Arredonda para CIMA no modo escolhido: reajuste existe para cobrir custo
 * que subiu, e arredondar para baixo devolveria parte dele.
 */
export function arredondarPreco(v: number, modo: Arredondar = "centavo"): number {
  const c = centavos(v);
  if (modo === "inteiro") return Math.ceil(c / 100);
  if (modo === "final90") {
    // 612,30 → 619,90. Já termina em ,90? fica.
    const reais = Math.floor(c / 100);
    const alvo = Math.floor(reais / 10) * 1000 + 990;
    return (alvo >= c ? alvo : alvo + 1000) / 100;
  }
  return c / 100;
}

export const precoDe = (t: TabelaServicos, modeloId: string, servicoId: string): number | undefined => {
  const v = t.modelos.find((m) => m.id === modeloId)?.precos[servicoId];
  return typeof v === "number" && v > 0 ? v : undefined;
};

export function definirPreco(t: TabelaServicos, modeloId: string, servicoId: string, valor: number | undefined): TabelaServicos {
  return {
    ...t,
    modelos: t.modelos.map((m) => {
      if (m.id !== modeloId) return m;
      const precos = { ...m.precos };
      if (valor && valor > 0) precos[servicoId] = centavos(valor) / 100;
      else delete precos[servicoId];
      return { ...m, precos };
    }),
  };
}

// ---------- cadastro ----------

const chaveModelo = (marca: string, modelo: string) => `${normalizar(marca)}|${normalizar(modelo).replace(/\s+/g, " ")}`;

export function acharModelo(t: TabelaServicos, marca: string, modelo: string): ModeloTabela | undefined {
  const k = chaveModelo(marca, modelo);
  return t.modelos.find((m) => chaveModelo(m.marca, m.modelo) === k);
}

/** Recusa modelo repetido: dois "iPhone 13" com preços diferentes é o balcão sem saber qual vale. */
export function acrescentarModelo(t: TabelaServicos, marca: string, modelo: string, id: string): TabelaServicos {
  if (!modelo.trim()) throw new Error("Escreva o modelo.");
  if (acharModelo(t, marca, modelo)) throw new Error(`"${[marca.trim(), modelo.trim()].filter(Boolean).join(" ")}" já está na tabela.`);
  return { ...t, modelos: [...t.modelos, { id, marca: marca.trim(), modelo: modelo.trim(), precos: {} }] };
}

export function acrescentarServico(t: TabelaServicos, nome: string, id: string, problema?: Problema): TabelaServicos {
  if (!nome.trim()) throw new Error("Escreva o nome do serviço.");
  if (t.servicos.some((s) => normalizar(s.nome) === normalizar(nome))) throw new Error(`"${nome.trim()}" já está na tabela.`);
  return { ...t, servicos: [...t.servicos, { id, nome: nome.trim(), problema: problema ?? problemaDoNome(nome) }] };
}

export const tirarModelo = (t: TabelaServicos, id: string): TabelaServicos => ({
  ...t,
  modelos: t.modelos.filter((m) => m.id !== id),
});

export const tirarServico = (t: TabelaServicos, id: string): TabelaServicos => ({
  servicos: t.servicos.filter((s) => s.id !== id),
  modelos: t.modelos.map((m) => {
    const precos = { ...m.precos };
    delete precos[id];
    const pecas = { ...(m.pecas || {}) };
    delete pecas[id];
    return { ...m, precos, pecas };
  }),
});

/** Adivinha o problema pelo nome do serviço ("Troca de display" → tela). */
export function problemaDoNome(nome: string): Problema | undefined {
  const n = ` ${normalizar(nome)} `;
  for (const p of PROBLEMAS) {
    if (p.palavras.some((w) => n.includes(` ${w} `) || n.includes(` ${w}`))) return p.id;
  }
  return undefined;
}

/** Ordem da tela: marca, depois modelo com número em ordem de número (iPhone 8 antes do 11). */
export const modelosOrdenados = (t: TabelaServicos): ModeloTabela[] =>
  [...t.modelos].sort(
    (a, b) =>
      normalizar(a.marca).localeCompare(normalizar(b.marca)) ||
      normalizar(a.modelo).localeCompare(normalizar(b.modelo), "pt-BR", { numeric: true })
  );

// ---------- copiar ----------

/**
 * Copia os preços de um modelo para outro. Sem `sobrescrever`, só preenche
 * o que o destino ainda não tem: quem copia o 13 para o 13 Pro quer
 * aproveitar a base, não perder o preço de tela que já tinha acertado.
 */
export function copiarPrecos(
  t: TabelaServicos,
  deId: string,
  paraIds: string[],
  sobrescrever = false
): { tabela: TabelaServicos; copiados: number } {
  const origem = t.modelos.find((m) => m.id === deId);
  if (!origem) throw new Error("Modelo de origem não encontrado.");
  let copiados = 0;
  const modelos = t.modelos.map((m) => {
    if (m.id === deId || !paraIds.includes(m.id)) return m;
    const precos = { ...m.precos };
    for (const [s, v] of Object.entries(origem.precos)) {
      if (!(v > 0)) continue;
      if (!sobrescrever && precos[s] > 0) continue;
      if (precos[s] !== v) copiados++;
      precos[s] = v;
    }
    return { ...m, precos };
  });
  return { tabela: { ...t, modelos }, copiados };
}

// ---------- reajuste ----------

export interface Reajuste {
  modo: "%" | "R$";
  /** 10 = +10% ou +R$ 10. Negativo baixa. */
  valor: number;
  /** Vazio = todas */
  marca?: string;
  /** Vazio = todos */
  servicoId?: string;
  arredondar?: Arredondar;
}

export interface MudancaPreco {
  modeloId: string;
  servicoId: string;
  rotulo: string;
  antes: number;
  depois: number;
}

/**
 * A prévia do reajuste. Nada muda até `aplicarMudancas`: reajuste em massa
 * errado ("10" em R$ quando queria %) mexe em cem preços de uma vez, e sem
 * prévia só se descobre quando o cliente reclama.
 */
export function previaReajuste(t: TabelaServicos, r: Reajuste): { mudancas: MudancaPreco[]; avisos: string[] } {
  const avisos: string[] = [];
  if (!Number.isFinite(r.valor) || r.valor === 0) return { mudancas: [], avisos: ["Informe quanto reajustar."] };
  if (r.modo === "%" && r.valor <= -100) return { mudancas: [], avisos: ["Baixar 100% ou mais zera o preço."] };
  const marca = normalizar(r.marca);
  const nomeServico = new Map(t.servicos.map((s) => [s.id, s.nome]));
  const mudancas: MudancaPreco[] = [];
  for (const m of modelosOrdenados(t)) {
    if (marca && normalizar(m.marca) !== marca) continue;
    for (const s of t.servicos) {
      if (r.servicoId && s.id !== r.servicoId) continue;
      const antes = m.precos[s.id];
      if (!(antes > 0)) continue;
      const bruto =
        r.modo === "%" ? (centavos(antes) * (100 + r.valor)) / 100 / 100 : (centavos(antes) + centavos(r.valor)) / 100;
      const depois = arredondarPreco(bruto, r.arredondar);
      const rotulo = `${[m.marca, m.modelo].filter(Boolean).join(" ")} · ${nomeServico.get(s.id)}`;
      if (!(depois > 0)) {
        avisos.push(`${rotulo}: ficaria zerado ou negativo, não mexi.`);
        continue;
      }
      if (depois !== antes) mudancas.push({ modeloId: m.id, servicoId: s.id, rotulo, antes, depois });
    }
  }
  if (!mudancas.length && !avisos.length) avisos.push("Nenhum preço nesse filtro.");
  return { mudancas, avisos };
}

export function aplicarMudancas(t: TabelaServicos, mudancas: MudancaPreco[]): TabelaServicos {
  let n = t;
  for (const m of mudancas) n = definirPreco(n, m.modeloId, m.servicoId, m.depois);
  return n;
}

// ---------- busca de balcão ----------

export interface Achado {
  modelo: ModeloTabela;
  servico: ServicoTabela;
  preco: number;
}

const palavras = (s: string) => normalizar(s).replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);

/** A palavra digitada bate com uma palavra do texto? Número só bate inteiro: "13" não é "A13". */
function bate(token: string, alvo: string[]): boolean {
  if (/^\d+$/.test(token)) return alvo.includes(token);
  return alvo.some((w) => w === token || (token.length >= 2 && w.startsWith(token)));
}

function servicoBate(token: string, s: ServicoTabela): boolean {
  if (bate(token, palavras(s.nome))) return true;
  const p = PROBLEMAS.find((x) => x.id === s.problema);
  return !!p && p.palavras.some((w) => !w.includes(" ") && (w === token || (token.length >= 3 && w.startsWith(token))));
}

/**
 * "13 tela" → iPhone 13 · Troca de tela · R$ 650.
 *
 * Cada palavra digitada tem que bater com o modelo, a marca ou o serviço.
 * O modelo mais curto vem primeiro: quem digita "13" quer o 13, não o
 * 13 Pro Max.
 */
export function buscarNaTabela(t: TabelaServicos, texto: string, limite = 12): Achado[] {
  const tokens = palavras(texto);
  if (!tokens.length) return [];
  const achados: (Achado & { extra: number })[] = [];
  for (const m of t.modelos) {
    const doModelo = palavras(`${m.marca} ${m.modelo}`);
    for (const s of t.servicos) {
      const preco = m.precos[s.id];
      if (!(preco > 0)) continue;
      let modeloBateu = false;
      const ok = tokens.every((tk) => {
        if (bate(tk, doModelo)) return (modeloBateu = true);
        return servicoBate(tk, s);
      });
      if (!ok) continue;
      // Só serviço ("tela") sem modelo lista tudo; com modelo, o modelo manda.
      achados.push({ modelo: m, servico: s, preco, extra: modeloBateu ? palavras(m.modelo).length : 99 });
    }
  }
  return achados
    .sort(
      (a, b) =>
        a.extra - b.extra ||
        normalizar(a.modelo.modelo).localeCompare(normalizar(b.modelo.modelo), "pt-BR", { numeric: true }) ||
        t.servicos.indexOf(a.servico) - t.servicos.indexOf(b.servico)
    )
    .slice(0, limite)
    .map(({ extra: _e, ...a }) => a);
}

// ---------- sugestão na OS ----------

/**
 * Qual linha da tabela é o aparelho da OS?
 *
 * Todas as palavras do modelo da tabela têm que estar no que o atendente
 * digitou. Das que servem, a mais comprida: "iPhone 13 Pro" digitado casa
 * com "iPhone 13" e com "iPhone 13 Pro", e a certa é a segunda.
 */
export function modeloDaOS(t: TabelaServicos, marca: string, modelo: string): ModeloTabela | undefined {
  const digitado = palavras(`${marca} ${modelo}`);
  if (!palavras(modelo).length) return undefined;
  let melhor: ModeloTabela | undefined;
  let tamanho = 0;
  for (const m of t.modelos) {
    const w = palavras(m.modelo);
    if (!w.length || !w.every((x) => digitado.includes(x))) continue;
    // Samsung A15 não é Motorola A15: com as duas marcas preenchidas, têm que bater.
    if (palavras(m.marca).length && palavras(marca).length && !palavras(m.marca).every((x) => digitado.includes(x))) continue;
    if (w.length > tamanho) {
      melhor = m;
      tamanho = w.length;
    }
  }
  return melhor;
}

/**
 * O que a tabela sugere para a OS. Se o defeito digitado fala de um
 * serviço ("tela quebrada"), ele vem primeiro; os outros preços do modelo
 * vêm depois, para o atendente escolher sem abrir outra tela.
 */
export function sugestaoParaOS(
  t: TabelaServicos,
  os: { marca: string; modelo: string; defeitoRelatado?: string }
): { modelo: ModeloTabela; itens: { servico: ServicoTabela; preco: number; combina: boolean }[] } | null {
  const m = modeloDaOS(t, os.marca, os.modelo);
  if (!m) return null;
  const defeito = ` ${palavras(txt(os.defeitoRelatado)).join(" ")} `;
  const itens = t.servicos
    .filter((s) => m.precos[s.id] > 0)
    .map((s) => {
      const p = PROBLEMAS.find((x) => x.id === s.problema);
      const chaves = [...palavras(s.nome).filter((w) => w.length >= 4 && w !== "troca"), ...(p?.palavras || [])];
      return { servico: s, preco: m.precos[s.id], combina: chaves.some((w) => defeito.includes(` ${w}`)) };
    })
    .sort((a, b) => Number(b.combina) - Number(a.combina));
  return itens.length ? { modelo: m, itens } : null;
}

// ---------- CSV ----------

/**
 * Planilha → tabela. A primeira linha é o cabeçalho: "Marca", "Modelo" e
 * uma coluna por serviço. Sem coluna de marca, vale só o modelo.
 *
 * Mescla com o que já existe: modelo e serviço que já estão na tabela
 * recebem o preço novo; os que não estão entram. Célula vazia não apaga
 * preço — planilha com uma coluna a menos não pode zerar a tabela.
 */
export function importarCSV(
  atual: TabelaServicos,
  linhas: Linha[],
  novoId: () => string
): { tabela: TabelaServicos; problemas: string[]; precos: number; modelosNovos: number } {
  const problemas: string[] = [];
  const cab = (linhas[0] || []).map((c) => normalizar(c));
  const iMarca = cab.findIndex((c) => c === "marca" || c === "fabricante");
  const iModelo = cab.findIndex((c) => c === "modelo" || c === "aparelho");
  if (iModelo < 0) return { tabela: atual, problemas: ['Falta a coluna "Modelo" na primeira linha.'], precos: 0, modelosNovos: 0 };
  let t: TabelaServicos = { servicos: [...atual.servicos], modelos: [...atual.modelos] };
  const colunas: { i: number; id: string }[] = [];
  (linhas[0] || []).forEach((nome, i) => {
    if (i === iMarca || i === iModelo || !txt(nome).trim()) return;
    const existente = t.servicos.find((s) => normalizar(s.nome) === normalizar(nome));
    if (existente) colunas.push({ i, id: existente.id });
    else {
      const id = novoId();
      t = acrescentarServico(t, nome, id);
      colunas.push({ i, id });
    }
  });
  if (!colunas.length) problemas.push("Nenhuma coluna de serviço depois de Marca e Modelo.");
  let precos = 0;
  let modelosNovos = 0;
  linhas.slice(1).forEach((l, n) => {
    const modelo = txt(l[iModelo]).trim();
    const marca = iMarca >= 0 ? txt(l[iMarca]).trim() : "";
    if (!modelo) {
      if (l.some((c) => txt(c).trim())) problemas.push(`Linha ${n + 2}: sem modelo.`);
      return;
    }
    let m = acharModelo(t, marca, modelo);
    if (!m) {
      t = acrescentarModelo(t, marca, modelo, novoId());
      m = t.modelos[t.modelos.length - 1];
      modelosNovos++;
    }
    for (const c of colunas) {
      const bruto = txt(l[c.i]).trim();
      if (!bruto) continue;
      const v = numeroDaPlanilha(bruto);
      if (v === undefined || v <= 0) {
        problemas.push(`Linha ${n + 2} (${modelo}): "${bruto}" não é um preço.`);
        continue;
      }
      t = definirPreco(t, m.id, c.id, v);
      precos++;
    }
  });
  return { tabela: t, problemas, precos, modelosNovos };
}

/** Tabela → CSV do Excel brasileiro (ponto e vírgula, vírgula decimal). */
export function exportarCSV(t: TabelaServicos): string {
  const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const cab = ["Marca", "Modelo", ...t.servicos.map((s) => s.nome)].map(esc).join(";");
  const corpo = modelosOrdenados(t).map((m) =>
    [
      esc(m.marca),
      esc(m.modelo),
      ...t.servicos.map((s) => (m.precos[s.id] > 0 ? m.precos[s.id].toFixed(2).replace(".", ",") : "")),
    ].join(";")
  );
  return [cab, ...corpo].join("\r\n");
}

/** Liga (ou desliga, com produtoId vazio) a peça do estoque que o serviço usa neste modelo. */
export function definirPeca(t: TabelaServicos, modeloId: string, servicoId: string, produtoId: string | undefined): TabelaServicos {
  return {
    ...t,
    modelos: t.modelos.map((m) => {
      if (m.id !== modeloId) return m;
      const pecas = { ...(m.pecas || {}) };
      if (produtoId) pecas[servicoId] = produtoId;
      else delete pecas[servicoId];
      return { ...m, pecas };
    }),
  };
}
