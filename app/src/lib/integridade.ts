import { txt, codigoOS } from "./format";
import { centavos } from "./pdv";
import { totalOS } from "./calc";
import { saldoFiado } from "./calc";
import type {
  Cliente,
  Fiado,
  MovimentoCaixa,
  OrdemServico,
  Produto,
  SessaoCaixa,
  Venda,
} from "./types";

/**
 * O sistema se conferindo.
 *
 * Todo problema que este arquivo procura já aconteceu de verdade num sistema
 * de balcão: a venda que gravou e o movimento que não, o aparelho entregue
 * sem ninguém receber, o estoque negativo de tanto vender item não
 * cadastrado. Nenhum deles dá erro na hora — todos aparecem no fechamento do
 * mês, quando ninguém lembra mais o que aconteceu.
 *
 * A regra do arquivo: **cada achado diz o que fazer.** Uma lista de problemas
 * sem saída vira uma tela que a pessoa aprende a fechar sem ler.
 */

const n = (v?: number | null): number => Number(v) || 0;

export type Gravidade = "erro" | "alerta" | "info";

export interface Achado {
  gravidade: Gravidade;
  /** Agrupa achados do mesmo tipo na tela */
  tipo: string;
  titulo: string;
  /** O que fazer. Sem isto o achado é só um susto. */
  saida: string;
  /** Quanto dinheiro está em jogo, quando dá para medir */
  valor?: number;
  /** Para a tela conseguir abrir o registro */
  ref?: { tela: string; id: string };
}

export interface Dados {
  ordens: OrdemServico[];
  vendas: Venda[];
  movimentos: MovimentoCaixa[];
  produtos: Produto[];
  fiados: Fiado[];
  clientes: Cliente[];
  sessoes: SessaoCaixa[];
}

/**
 * Venda gravada sem o dinheiro correspondente no caixa.
 *
 * A gravação é em duas etapas — movimento e venda —, e a rede pode cair
 * entre uma e outra. O cupom existe, a mercadoria saiu, e o caixa não sabe.
 */
function vendasSemCaixa(d: Dados): Achado[] {
  const porId = new Set(d.movimentos.map((m) => m.id));

  /*
   * Índice por NÚMERO da venda, montado uma vez.
   *
   * A primeira versão varria a lista de movimentos inteira para cada venda,
   * procurando por prefixo. Com 3.000 vendas e 3.000 movimentos são nove
   * milhões de comparações de texto — meio segundo travando o painel, a cada
   * venda registrada. Numa loja com dois anos de histórico, a tela não abria.
   */
  const numerosComMovimento = new Set<string>();
  for (const m of d.movimentos) {
    const achado = txt(m.descricao).match(/^Venda (\d+) /);
    if (achado) numerosComMovimento.add(achado[1]);
  }

  return d.vendas
    .filter((v) => {
      if (v.movimentoId && porId.has(v.movimentoId)) return false;
      // Vendas antigas não guardavam o vínculo: casa pelo número dentro da
      // descrição, que é como o movimento é escrito ("Venda 12 (3 item(ns))").
      return !numerosComMovimento.has(String(v.numero));
    })
    .map((v) => ({
      gravidade: "erro" as const,
      tipo: "venda-sem-caixa",
      titulo: `Venda ${v.numero} não tem lançamento no caixa`,
      saida:
        "Lance a entrada manualmente em Caixa, com o valor da venda. O cupom " +
        "existe e a mercadoria saiu, mas o dinheiro não está registrado.",
      valor: centavos(
        (v.itens || []).reduce((s, i) => s + n(i.quantidade) * n(i.precoUnit), 0) -
          n(v.desconto)
      ),
      ref: { tela: "/caixa", id: v.id },
    }));
}

/**
 * OS entregue sem dinheiro nem fiado.
 *
 * O aparelho saiu da loja e não existe registro de pagamento em lugar
 * nenhum. É o buraco mais caro e o mais fácil de abrir: basta marcar
 * "entregue" no seletor em vez de usar Receber.
 */
function ordensSemPagamento(d: Dados): Achado[] {
  // Índices montados uma vez, pelo mesmo motivo do de cima: procurar dentro
  // da lista para cada ordem é quadrático e trava o painel.
  const comMovimento = new Set(d.movimentos.map((m) => m.osId).filter(Boolean));
  const comFiado = new Set(d.fiados.map((f) => f.osId).filter(Boolean));

  return d.ordens
    .filter((o) => o.status === "entregue" && totalOS(o) > 0)
    .filter((o) => !comMovimento.has(o.id) && !comFiado.has(o.id))
    .map((o) => ({
      gravidade: "erro" as const,
      tipo: "os-sem-pagamento",
      titulo: `${codigoOS(o.numero)} entregue sem pagamento registrado`,
      saida:
        "Abra a OS e use Receber (dinheiro entra no caixa) ou Fiado. " +
        "Se o cliente já pagou, ainda assim registre — senão o mês fecha errado.",
      valor: totalOS(o),
      ref: { tela: "/ordens", id: o.id },
    }));
}

/**
 * Estoque negativo.
 *
 * Sempre significa que saiu mercadoria que o sistema não sabia que existia:
 * entrada não lançada, venda de item errado ou contagem nunca feita.
 */
function estoqueNegativo(d: Dados): Achado[] {
  return d.produtos
    .filter((p) => !p.servico && n(p.quantidade) < 0)
    .map((p) => ({
      gravidade: "alerta" as const,
      tipo: "estoque-negativo",
      titulo: `${txt(p.nome)} está com ${p.quantidade} em estoque`,
      saida:
        "Use Estoque > Contagem para acertar. Negativo quer dizer que saiu " +
        "mercadoria que o sistema não sabia que tinha — falta lançar uma entrada.",
      ref: { tela: "/estoque", id: p.id },
    }));
}

/** Fiado apontando para um cliente que não existe mais */
function fiadosOrfaos(d: Dados): Achado[] {
  const ids = new Set(d.clientes.map((c) => c.id));
  return d.fiados
    .filter((f) => !f.quitado && saldoFiado(f) > 0 && !ids.has(f.clienteId))
    .map((f) => ({
      gravidade: "alerta" as const,
      tipo: "fiado-orfao",
      titulo: `Fiado de ${saldoFiado(f).toFixed(2)} sem cliente cadastrado`,
      saida:
        "O cliente foi apagado com dívida em aberto. Cadastre-o de novo e " +
        "refaça o lançamento, ou quite o valor se ele já pagou.",
      valor: saldoFiado(f),
      ref: { tela: "/a-receber", id: f.id },
    }));
}

/**
 * Caixa aberto há muito tempo.
 *
 * Sessão que atravessa dias faz o fechamento perder o sentido: ele deixa de
 * ser "o dia" e vira "desde sabe-se lá quando", e a conferência da gaveta
 * não fecha nunca mais.
 */
function caixaEsquecido(d: Dados, hoje = new Date()): Achado[] {
  const aberta = d.sessoes.find((s) => !s.fechadoEm);
  if (!aberta) return [];
  const dias = Math.floor(
    (hoje.getTime() - Date.parse(aberta.abertoEm)) / 86400000
  );
  if (!Number.isFinite(dias) || dias < 2) return [];
  return [
    {
      gravidade: "alerta",
      tipo: "caixa-esquecido",
      titulo: `O caixa está aberto há ${dias} dias`,
      saida:
        "Feche o caixa em Caixa > Fechar. Sessão que atravessa dias faz o " +
        "fechamento deixar de ser 'o dia' e a conferência da gaveta nunca fechar.",
      ref: { tela: "/caixa", id: aberta.id },
    },
  ];
}

/**
 * Produto vendido com preço zero.
 *
 * Item avulso lançado às pressas e nunca corrigido. Ele aparece no cupom, sai
 * da loja e não entra em lugar nenhum.
 */
function vendasComItemZerado(d: Dados): Achado[] {
  return d.vendas
    .filter((v) => (v.itens || []).some((i) => n(i.precoUnit) <= 0))
    .map((v) => ({
      gravidade: "info" as const,
      tipo: "item-zerado",
      titulo: `Venda ${v.numero} tem item com preço zero`,
      saida:
        "Confira se foi brinde ou se o preço ficou em branco. Item a zero " +
        "some do faturamento sem sumir do estoque.",
      ref: { tela: "/caixa", id: v.id },
    }));
}

/** OS parada há muito tempo sem sair do lugar */
function ordensParadas(d: Dados, diasLimite = 30, hoje = new Date()): Achado[] {
  return d.ordens
    .filter((o) => !["entregue", "cancelada"].includes(o.status))
    .map((o) => ({
      o,
      dias: Math.floor((hoje.getTime() - Date.parse(o.atualizadoEm || o.criadoEm)) / 86400000),
    }))
    .filter((x) => Number.isFinite(x.dias) && x.dias >= diasLimite)
    .map(({ o, dias }) => ({
      gravidade: "info" as const,
      tipo: "os-parada",
      titulo: `${codigoOS(o.numero)} sem movimento há ${dias} dias`,
      saida:
        "Fale com o cliente ou cancele. Aparelho parado ocupa bancada, e " +
        "depois do prazo legal vira problema jurídico, não de estoque.",
      ref: { tela: "/ordens", id: o.id },
    }));
}

/**
 * Roda tudo, do mais grave para o menos.
 *
 * Erro primeiro, e dentro de cada nível o de maior valor: com vinte achados
 * na tela, o que decide é qual custa mais dinheiro.
 */
export function conferirTudo(d: Dados, hoje = new Date()): Achado[] {
  const peso: Record<Gravidade, number> = { erro: 0, alerta: 1, info: 2 };
  return [
    ...vendasSemCaixa(d),
    ...ordensSemPagamento(d),
    ...estoqueNegativo(d),
    ...fiadosOrfaos(d),
    ...caixaEsquecido(d, hoje),
    ...vendasComItemZerado(d),
    ...ordensParadas(d, 30, hoje),
  ].sort(
    (a, b) => peso[a.gravidade] - peso[b.gravidade] || n(b.valor) - n(a.valor)
  );
}

/** Quanto dinheiro está em jogo nos achados graves */
export const dinheiroEmRisco = (achados: Achado[]): number =>
  centavos(
    achados.filter((a) => a.gravidade === "erro").reduce((s, a) => s + n(a.valor), 0)
  );

export const contarPorGravidade = (achados: Achado[]): Record<Gravidade, number> => ({
  erro: achados.filter((a) => a.gravidade === "erro").length,
  alerta: achados.filter((a) => a.gravidade === "alerta").length,
  info: achados.filter((a) => a.gravidade === "info").length,
});
