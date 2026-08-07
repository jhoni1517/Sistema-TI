import { txt } from "./format";
import type { Config, ItemVenda, Produto } from "./types";

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
export function pendenciasDaLoja(config: Config): string[] {
  const faltas: string[] = [];
  const cnpj = digitos(config.cnpj);
  if (cnpj.length !== 14) {
    faltas.push("CNPJ da loja (14 dígitos) — nota fiscal não sai no CPF do dono");
  }
  if (!txt(config.inscricaoEstadual).trim()) {
    faltas.push("Inscrição Estadual da loja");
  }
  const regime = regimeDe(config.regimeTributario);
  if (!usaCsosn(regime) && !digitos(config.cstPadrao)) {
    faltas.push("CST padrão — fora do Simples o item leva CST, não CSOSN");
  }
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
  const faltas = pendenciasDaLoja(config);
  const jaVistos = new Set<string>();

  for (const item of itens || []) {
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
