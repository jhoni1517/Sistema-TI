import { txt } from "./format";
import type { Config, FormaPagamento, ItemVenda, Produto } from "./types";

/**
 * O que a nota fiscal exige, e o que falta para emitir.
 *
 * O sistema NÃO emite nota: quem emite é um intermediário de API, que carrega
 * o certificado digital da loja, assina o XML, fala com a SEFAZ do estado e
 * cuida da contingência quando ela cai. Isso é decisão de arquitetura e não
 * preguiça — emitir direto significa responsabilidade legal sobre cada
 * documento e um webservice por estado para manter, e quem mantém isto é uma
 * pessoa que também atende no balcão.
 *
 * O que mora aqui é a parte que é NOSSA de verdade: saber, antes de tentar,
 * o que está faltando. Descobrir no balcão que um produto não tem NCM — com
 * o cliente esperando o cupom e a fila andando — é o pior momento possível.
 * Por isso a conferência é uma função pura, com teste, que roda antes.
 *
 * ---------------------------------------------------------------------
 * O SEGREDO NÃO MORA AQUI, E ISSO É DE PROPÓSITO.
 *
 * O CSC da SEFAZ e o token do intermediário são segredos. `configuracoes`
 * sobe para a nuvem, entra no backup e sai no arquivo de exportação — que
 * circula por WhatsApp e e-mail. Um token ali é um token queimado.
 *
 * Por isso nenhuma credencial fiscal aparece neste arquivo nem em `Config`.
 * Ela vive do lado do intermediário e, quando precisar existir aqui, será em
 * tabela própria que o navegador não lê e o backup não leva.
 * ---------------------------------------------------------------------
 */

/**
 * São DOIS documentos diferentes, e não duas versões do mesmo.
 *
 * - **NFC-e** é de MERCADORIA: imposto estadual (ICMS), autorizada pela
 *   SEFAZ do estado. Pizza, refrigerante, uma fonte de computador.
 * - **NFS-e** é de SERVIÇO: imposto municipal (ISS), autorizada pela
 *   prefeitura ou pelo padrão nacional. Mão de obra do conserto,
 *   formatação, instalação.
 *
 * Os campos são incompatíveis: mercadoria leva NCM, CFOP e CSOSN; serviço
 * leva código da lista de serviços e alíquota de ISS. Cobrar NCM de um
 * serviço trava a emissão para sempre, porque esse número não existe — foi
 * exatamente o que a primeira versão desta conferência fazia.
 *
 * Uma ordem de serviço de assistência técnica gera OS DOIS: NFC-e das
 * peças e NFS-e da mão de obra. Por isso a decisão é por ITEM, nunca pela
 * loja inteira.
 */
export type TipoDocumento = "nfce" | "nfse";

export const DOCUMENTO_META: Record<
  TipoDocumento,
  { label: string; curto: string; imposto: string; autoriza: string }
> = {
  nfce: {
    label: "Nota de consumidor (NFC-e)",
    curto: "NFC-e",
    imposto: "ICMS, estadual",
    autoriza: "SEFAZ do estado",
  },
  nfse: {
    label: "Nota de serviço (NFS-e)",
    curto: "NFS-e",
    imposto: "ISS, municipal",
    autoriza: "prefeitura ou padrão nacional",
  },
};

/** Este item vira nota de mercadoria ou de serviço? */
export const documentoDoProduto = (p?: Produto): TipoDocumento =>
  p?.servico ? "nfse" : "nfce";

/**
 * Regime tributário da loja. Decide se o item leva CSOSN ou CST — são
 * campos diferentes, e mandar o errado a SEFAZ rejeita.
 */
export type RegimeTributario = "simples" | "simples_excesso" | "normal";

export const REGIME_META: Record<RegimeTributario, { label: string; descricao: string }> = {
  simples: {
    label: "Simples Nacional",
    descricao: "O item leva CSOSN. É o caso da grande maioria das lojas de bairro.",
  },
  simples_excesso: {
    label: "Simples Nacional, com excesso de sublimite",
    descricao: "Ainda no Simples, mas o item leva CST como no regime normal.",
  },
  normal: {
    label: "Regime normal (lucro presumido ou real)",
    descricao: "O item leva CST e alíquota de ICMS.",
  },
};

/** No Simples o item leva CSOSN; nos outros dois, CST */
export const usaCsosn = (regime: RegimeTributario): boolean => regime === "simples";

export const regimeDe = (r?: string | null): RegimeTributario =>
  r === "normal" || r === "simples_excesso" ? r : "simples";

/** Origem da mercadoria (tabela da SEFAZ). 0 cobre quase tudo numa cozinha. */
export const ORIGENS: { k: string; nome: string }[] = [
  { k: "0", nome: "0 - Nacional" },
  { k: "1", nome: "1 - Estrangeira, importação direta" },
  { k: "2", nome: "2 - Estrangeira, comprada no mercado interno" },
  { k: "3", nome: "3 - Nacional, com mais de 40% de conteúdo importado" },
  { k: "4", nome: "4 - Nacional, produção conforme processos básicos" },
  { k: "5", nome: "5 - Nacional, com até 40% de conteúdo importado" },
  { k: "6", nome: "6 - Estrangeira, importação direta, sem similar nacional" },
  { k: "7", nome: "7 - Estrangeira, mercado interno, sem similar nacional" },
  { k: "8", nome: "8 - Nacional, com mais de 70% de conteúdo importado" },
];

const digitos = (v?: string | null): string => txt(v).replace(/\D/g, "");

/**
 * Como cada forma de pagamento se chama na nota.
 *
 * A SEFAZ não aceita a palavra "pix": ela quer o código 17. Sem esta
 * tradução a nota é rejeitada inteira, e o motivo que volta é um número
 * que não diz nada a quem está no balcão.
 *
 * Toda forma nova entra NESTA tabela e em nenhum outro lugar: o `Record`
 * é exaustivo, então esquecer o código de uma forma nova quebra o build em
 * vez de rejeitar uma nota no balcão.
 */
export const CODIGO_PAGAMENTO: Record<FormaPagamento, string> = {
  dinheiro: "01",
  credito: "03",
  debito: "04",
  // 10 é vale ALIMENTAÇÃO e 11 é vale REFEIÇÃO. São códigos diferentes na
  // tabela da SEFAZ, e é por isso que o sistema guarda os dois separados:
  // mandar um pelo outro é erro fiscal numa nota que já saiu.
  vale_alimentacao: "10",
  vale_refeicao: "11",
  transferencia: "16",
  pix: "17",
  outro: "99",
};

/**
 * Em que pé está a nota de uma venda.
 *
 * `pendente` não é erro: é o estado normal enquanto a fila não rodou. A
 * venda NUNCA espera a nota — SEFAZ fora do ar não pode travar o caixa de
 * um restaurante numa sexta cheia.
 */
export type SituacaoNota = "pendente" | "autorizada" | "rejeitada" | "cancelada";

export const SITUACAO_NOTA_META: Record<
  SituacaoNota,
  { label: string; cor: string; explicacao: string }
> = {
  pendente: {
    label: "Aguardando envio",
    cor: "bg-amber-100 text-amber-700",
    explicacao: "A venda está registrada. A nota entra na fila e é enviada sozinha.",
  },
  autorizada: {
    label: "Autorizada",
    cor: "bg-emerald-100 text-emerald-700",
    explicacao: "A SEFAZ aceitou. A nota tem valor fiscal e pode ser impressa.",
  },
  rejeitada: {
    label: "Recusada pela SEFAZ",
    cor: "bg-red-100 text-red-700",
    explicacao: "Algum dado está errado. O motivo aparece na própria venda.",
  },
  cancelada: {
    label: "Cancelada",
    cor: "bg-slate-100 text-slate-600",
    explicacao: "A nota foi cancelada dentro do prazo de 30 minutos.",
  },
};

/**
 * Cancelamento de NFC-e tem relógio: 30 minutos depois da autorização.
 *
 * Passou disso, não é mais cancelamento — é nota de devolução, que é outro
 * documento e quem faz é o contador. A tela precisa mostrar o tempo que
 * resta, senão a pessoa descobre que perdeu o prazo tentando.
 *
 * O prazo é decidido por estado; 30 minutos é o que vale no Paraná.
 */
export const MINUTOS_PARA_CANCELAR = 30;

export function minutosRestantesParaCancelar(
  emitidaEm?: string | null,
  agora = new Date()
): number {
  if (!emitidaEm) return 0;
  const t = new Date(emitidaEm).getTime();
  if (!Number.isFinite(t)) return 0;
  const passados = (agora.getTime() - t) / 60000;
  return Math.max(0, Math.ceil(MINUTOS_PARA_CANCELAR - passados));
}

/**
 * O que vale para o item: o que está no produto, ou o padrão da loja.
 *
 * NCM é o único que não tem padrão: ele muda de produto para produto e
 * inventar um seria declarar mercadoria errada à Receita. Os outros três
 * são quase sempre iguais na loja inteira, e obrigar a digitar CFOP em
 * duzentos produtos é o caminho para ninguém preencher nenhum.
 */
export function fiscalDoProduto(
  p: Produto | undefined,
  config: Config
): { ncm: string; cfop: string; codigoTributacao: string; origem: string; unidade: string } {
  const regime = regimeDe(config.regimeTributario);
  return {
    ncm: digitos(p?.ncm),
    cfop: digitos(p?.cfop) || digitos(config.cfopPadrao) || "5102",
    codigoTributacao: usaCsosn(regime)
      ? digitos(p?.csosn) || digitos(config.csosnPadrao) || "102"
      : digitos(p?.cst) || digitos(config.cstPadrao),
    origem: digitos(p?.origem) || digitos(config.origemPadrao) || "0",
    unidade: (txt(p?.unidadeTributavel).trim() || (p?.porPeso ? "KG" : "UN")).toUpperCase(),
  };
}

/**
 * O que falta na LOJA para emitir qualquer nota.
 *
 * Estes três não têm padrão nem palpite possível: ou a loja informou, ou
 * nenhuma nota sai. Vale a pena conferir antes de o balcão tentar.
 */
export function pendenciasDaLoja(
  config: Config,
  tipos: TipoDocumento[] = ["nfce"]
): string[] {
  const faltas: string[] = [];
  const cnpj = digitos(config.cnpj);
  if (cnpj.length !== 14) {
    faltas.push("CNPJ da loja (14 dígitos) — nota fiscal não sai no CPF do dono");
  }

  /*
   * Cada documento cobra um registro diferente, e cobrar os dois de quem só
   * precisa de um é mandar a pessoa atrás de papel que ela não vai usar.
   *
   * - Inscrição ESTADUAL é para mercadoria (ICMS)
   * - Inscrição MUNICIPAL é para serviço (ISS)
   *
   * Uma assistência técnica precisa das duas, porque vende peça e cobra mão
   * de obra. Uma pizzaria só da estadual. Um lava-rápido só da municipal.
   */
  if (tipos.includes("nfce") && !txt(config.inscricaoEstadual).trim()) {
    faltas.push("Inscrição Estadual da loja — é ela que vale para nota de mercadoria");
  }
  if (tipos.includes("nfse") && !txt(config.inscricaoMunicipal).trim()) {
    faltas.push("Inscrição Municipal da loja — é ela que vale para nota de serviço");
  }

  const regime = regimeDe(config.regimeTributario);
  if (tipos.includes("nfce") && !usaCsosn(regime) && !digitos(config.cstPadrao)) {
    faltas.push("CST padrão — fora do Simples o item leva CST, não CSOSN");
  }
  /*
   * O endereço da nota é PARTIDO em campos, e não é frescura.
   *
   * `enderecoLoja` é uma linha só ("Rua das Flores, 123 - Centro"), boa para
   * o recibo e inútil para a nota: a SEFAZ quer rua, número, bairro, CEP e
   * o código IBGE do município em campos separados. Ninguém consegue partir
   * essa linha com segurança depois — "Rua 15 de Novembro, 1500" tem número
   * no nome da rua.
   */
  if (!txt(config.nfLogradouro).trim()) faltas.push("Endereço da nota: rua");
  if (!txt(config.nfNumero).trim()) faltas.push("Endereço da nota: número");
  if (!txt(config.nfBairro).trim()) faltas.push("Endereço da nota: bairro");
  if (digitos(config.nfCep).length !== 8) faltas.push("Endereço da nota: CEP (8 dígitos)");
  if (!txt(config.nfMunicipio).trim()) faltas.push("Endereço da nota: cidade");
  if (digitos(config.nfCodigoIbge).length !== 7) {
    faltas.push("Endereço da nota: código IBGE da cidade (7 dígitos)");
  }
  if (txt(config.nfUf).trim().length !== 2) faltas.push("Endereço da nota: estado (UF)");
  return faltas;
}

/**
 * O que falta num PRODUTO para ele entrar numa nota.
 *
 * O nome do produto vem junto na mensagem de propósito: "falta o NCM" não
 * diz em qual dos duzentos, e quem está no balcão não vai adivinhar.
 */
export function pendenciasDoProduto(p: Produto, config: Config): string[] {
  const faltas: string[] = [];
  const nome = txt(p.nome).trim() || "produto sem nome";

  /*
   * Serviço tem outra régua, e cobrar a régua errada trava para sempre.
   *
   * A primeira versão desta função exigia NCM de TODO produto, inclusive
   * dos marcados como serviço. NCM é código de mercadoria: mão de obra de
   * conserto não tem, nunca vai ter, e a pessoa ficaria procurando um
   * número que não existe. O que serviço leva é o código da lista de
   * serviços (LC 116) e a alíquota de ISS.
   */
  if (documentoDoProduto(p) === "nfse") {
    if (!txt(p.codigoServico).trim()) {
      faltas.push(`${nome}: código do serviço (o contador informa)`);
    }
    return faltas;
  }

  const f = fiscalDoProduto(p, config);

  if (f.ncm.length !== 8) {
    faltas.push(`${nome}: NCM com 8 dígitos`);
  }
  if (f.cfop.length !== 4 || !f.cfop.startsWith("5")) {
    // NFC-e é sempre venda a consumidor final dentro do estado: CFOP 5xxx.
    // Um 6102 aqui é venda para fora do estado e a SEFAZ rejeita a nota.
    faltas.push(`${nome}: CFOP de 4 dígitos começando em 5`);
  }
  const regime = regimeDe(config.regimeTributario);
  if (usaCsosn(regime)) {
    if (f.codigoTributacao.length !== 3) faltas.push(`${nome}: CSOSN com 3 dígitos`);
  } else if (f.codigoTributacao.length !== 2) {
    faltas.push(`${nome}: CST com 2 dígitos`);
  }
  if (!/^[0-8]$/.test(f.origem)) {
    faltas.push(`${nome}: origem da mercadoria (0 a 8)`);
  }
  if (!f.unidade) {
    faltas.push(`${nome}: unidade (UN, KG...)`);
  }
  return faltas;
}

/**
 * Tudo que impede esta venda de virar nota.
 *
 * Devolve a lista inteira de uma vez, e não o primeiro problema: quem vai
 * preencher prefere ver os cinco produtos que faltam do que descobrir um a
 * cada tentativa.
 *
 * Item avulso — digitado na hora, sem produto no cadastro — não tem como
 * ter NCM. Ele é apontado pelo que é, porque a saída ali é cadastrar o
 * produto, não preencher um campo que não existe.
 */
export function pendenciasParaEmitir(
  itens: ItemVenda[],
  produtos: Produto[],
  config: Config
): string[] {
  /*
   * Quais documentos esta venda vai gerar.
   *
   * Uma OS com peça e mão de obra gera OS DOIS: NFC-e da peça e NFS-e do
   * serviço. Por isso a lista sai dos ITENS, e não de um ajuste da loja —
   * a mesma loja emite um, outro, ou os dois, dependendo do que vendeu.
   */
  const tipos = new Set<TipoDocumento>();
  for (const item of itens || []) {
    if (!item.produtoId) continue;
    tipos.add(documentoDoProduto(produtos.find((x) => x.id === item.produtoId)));
  }

  const faltas = pendenciasDaLoja(config, [...tipos]);
  const jaVistos = new Set<string>();

  for (const item of itens || []) {
    /*
     * A taxa de serviço da mesa não é mercadoria.
     *
     * Ela é uma linha sem produtoId, e a regra do item avulso a apontava
     * como "cadastre o produto" — conselho errado: gorjeta não tem NCM e
     * nunca vai ter. Quem sabe declarar taxa de serviço é o emissor, e ele
     * a trata como despesa acessória, não como item do estoque.
     */
    if (item.taxaServico) continue;
    if (!item.produtoId) {
      const nome = txt(item.descricao).trim() || "item sem descrição";
      faltas.push(`${nome}: item avulso não tem cadastro, e nota exige NCM`);
      continue;
    }
    if (jaVistos.has(item.produtoId)) continue;
    jaVistos.add(item.produtoId);

    const p = produtos.find((x) => x.id === item.produtoId);
    if (!p) {
      faltas.push(`${txt(item.descricao).trim()}: produto não está mais no cadastro`);
      continue;
    }
    faltas.push(...pendenciasDoProduto(p, config));
  }

  return faltas;
}

/** Quantos produtos do cadastro ainda não estão prontos para a nota */
export const produtosSemFiscal = (produtos: Produto[], config: Config): Produto[] =>
  (produtos || []).filter((p) => pendenciasDoProduto(p, config).length > 0);
