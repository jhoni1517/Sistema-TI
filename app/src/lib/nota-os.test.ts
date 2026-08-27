import { describe, it, expect } from "vitest";
import {
  separarOS,
  documentoDaPeca,
  ladoTemNota,
  problemaDoLado,
  discriminacaoDoServico,
  pagamentosDaOS,
  ratearPagamento,
  pedidoDoServicoDaOS,
  pedidoDaMercadoriaDaOS,
  DESCRICAO_MAO_DE_OBRA,
} from "./nota-os";
import { totalOS } from "./calc";
import type {
  Config,
  MovimentoCaixa,
  OrdemServico,
  PecaOS,
  Produto,
} from "./types";

/**
 * O prejuízo que estes testes seguram é de imposto recolhido errado, e ele
 * não aparece no balcão: aparece meses depois, no contador, com o valor já
 * pago para o governo que não era.
 */

const os = (x: Partial<OrdemServico> = {}): OrdemServico =>
  ({
    id: "os1",
    numero: 42,
    clienteId: "c1",
    tipoAparelho: "Celular",
    marca: "Samsung",
    modelo: "A20",
    defeitoRelatado: "Tela quebrada",
    checklist: {},
    pecas: [],
    maoDeObra: 0,
    desconto: 0,
    status: "aberta",
    garantiaDias: 90,
    historico: [],
    criadoEm: "2026-01-10T10:00:00.000Z",
    atualizadoEm: "2026-01-10T10:00:00.000Z",
    ...x,
  }) as OrdemServico;

const peca = (x: Partial<PecaOS> = {}): PecaOS => ({
  descricao: "Tela",
  quantidade: 1,
  custoUnit: 300,
  precoUnit: 630,
  ...x,
});

const produto = (x: Partial<Produto> = {}): Produto =>
  ({
    id: "p1",
    nome: "Tela A20",
    preco: 630,
    custo: 300,
    estoque: 2,
    ncm: "85177011",
    cfop: "5102",
    csosn: "102",
    origem: "0",
    ...x,
  }) as Produto;

/** Uma loja com tudo que as duas notas exigem */
const loja = (x: Partial<Config> = {}): Config =>
  ({
    nomeLoja: "Assistência",
    cnpj: "12345678000199",
    inscricaoEstadual: "1234567",
    inscricaoMunicipal: "987654",
    regimeTributario: "simples",
    codigoServicoPadrao: "14.01",
    aliquotaIssPadrao: 3,
    nfLogradouro: "Rua das Flores",
    nfNumero: "123",
    nfBairro: "Centro",
    nfCep: "83000000",
    nfMunicipio: "São José dos Pinhais",
    nfCodigoIbge: "4125506",
    nfUf: "PR",
    ...x,
  }) as Config;

describe("uma OS gera duas notas", () => {
  it("a mão de obra é serviço e a peça é mercadoria", () => {
    const o = os({ maoDeObra: 180, pecas: [peca({ produtoId: "p1" })] });
    const r = separarOS(o, [produto()]);

    expect(r.servico.itens.map((i) => i.descricao)).toEqual([DESCRICAO_MAO_DE_OBRA]);
    expect(r.servico.total).toBe(180);
    expect(r.mercadoria.itens.map((i) => i.descricao)).toEqual(["Tela"]);
    expect(r.mercadoria.total).toBe(630);
  });

  it("produto marcado como serviço entra na nota de serviço", () => {
    // Formatação, instalação, higienização: são serviço, e mandar para a
    // nota de mercadoria faz a loja pagar ICMS sobre mão de obra.
    const o = os({ pecas: [peca({ produtoId: "srv", descricao: "Formatação", precoUnit: 80 })] });
    const r = separarOS(o, [produto({ id: "srv", servico: true, ncm: undefined })]);

    expect(r.servico.itens.map((i) => i.descricao)).toEqual(["Formatação"]);
    expect(r.mercadoria.itens).toEqual([]);
  });

  it("peça digitada à mão, sem cadastro, cai em MERCADORIA", () => {
    /*
     * É quase sempre a peça que a loja comprou avulsa. Mandá-la para a nota
     * de serviço faria a loja pagar ISS sobre mercadoria, e o erro só
     * aparece no contador.
     */
    const o = os({ pecas: [peca({ descricao: "Conector de carga", precoUnit: 40 })] });
    const r = separarOS(o, []);
    expect(r.mercadoria.itens.map((i) => i.descricao)).toEqual(["Conector de carga"]);
    expect(r.servico.itens).toEqual([]);
  });

  it("o atendente pode mover o item de lado, e a escolha manda", () => {
    // O cadastro erra: "instalação de SSD" cadastrada como produto comum.
    const p = peca({ produtoId: "p1", documentoForcado: "nfse" });
    expect(documentoDaPeca(p, [produto()])).toBe("nfse");
    expect(documentoDaPeca({ ...p, documentoForcado: undefined }, [produto()])).toBe("nfce");
  });

  it("só o orçamento escolhido entra na nota", () => {
    /*
     * Duas opções na mesma OS não somam — o cliente escolheu uma. Nota
     * cobrando as duas fontes é o mesmo bug do orçamento, agora com valor
     * fiscal e prazo de cancelamento correndo.
     */
    const o = os({
      opcaoEscolhida: "Opção 2",
      pecas: [
        peca({ descricao: "Fonte 500W", precoUnit: 400, opcao: "Opção 1" }),
        peca({ descricao: "Fonte 200W", precoUnit: 150, opcao: "Opção 2" }),
      ],
    });
    const r = separarOS(o, []);
    expect(r.mercadoria.itens.map((i) => i.descricao)).toEqual(["Fonte 200W"]);
    expect(r.mercadoria.total).toBe(150);
  });
});

describe("o desconto não pode sumir nem aparecer duas vezes", () => {
  it("sai do serviço primeiro", () => {
    const o = os({ maoDeObra: 180, desconto: 50, pecas: [peca({ produtoId: "p1" })] });
    const r = separarOS(o, [produto()]);
    expect(r.servico.desconto).toBe(50);
    expect(r.servico.total).toBe(130);
    expect(r.mercadoria.desconto).toBe(0);
    expect(r.mercadoria.total).toBe(630);
  });

  it("o que passa do serviço transborda para a mercadoria", () => {
    const o = os({ maoDeObra: 100, desconto: 250, pecas: [peca({ produtoId: "p1" })] });
    const r = separarOS(o, [produto()]);
    expect(r.servico.desconto).toBe(100);
    expect(r.servico.total).toBe(0);
    expect(r.mercadoria.desconto).toBe(150);
    expect(r.mercadoria.total).toBe(480);
  });

  it("nenhum lado fica negativo, nem com desconto maior que a OS inteira", () => {
    const o = os({ maoDeObra: 100, desconto: 5000, pecas: [peca({ produtoId: "p1" })] });
    const r = separarOS(o, [produto()]);
    expect(r.servico.total).toBe(0);
    expect(r.mercadoria.total).toBe(0);
    // Nota de R$ 0,00 é rejeitada — o lado zerado não vira nota nenhuma.
    expect(ladoTemNota(r.servico)).toBe(false);
    expect(ladoTemNota(r.mercadoria)).toBe(false);
  });

  it("a soma das duas notas é SEMPRE o total da OS", () => {
    /*
     * A trava que importa. Uma nota a mais ou a menos de um centavo é
     * imposto recolhido errado, e ninguém confere OS por OS.
     */
    for (const mao of [0, 33.33, 180, 1000]) {
      for (const desconto of [0, 0.01, 17.77, 180, 500]) {
        const o = os({
          maoDeObra: mao,
          desconto,
          pecas: [peca({ produtoId: "p1", precoUnit: 630.5 }), peca({ descricao: "Cola", precoUnit: 9.9 })],
        });
        const r = separarOS(o, [produto()]);
        const soma = Math.round((r.servico.total + r.mercadoria.total) * 100) / 100;
        const esperado = Math.round(Math.max(0, totalOS(o)) * 100) / 100;
        expect(soma, `mão ${mao} desconto ${desconto}`).toBe(esperado);
      }
    }
  });
});

describe("o que falta é cobrado por LADO, não pela OS inteira", () => {
  const o = os({ maoDeObra: 180, pecas: [peca({ produtoId: "p1" })] });

  it("a mão de obra nunca é cobrada por NCM", () => {
    /*
     * Ela é uma linha sem cadastro, e a regra do item avulso do PDV a
     * apontaria como "cadastre o produto". NCM de mão de obra é um número
     * que não existe, e quem procurar não acha nunca.
     */
    const r = separarOS(o, [produto()]);
    const problema = problemaDoLado(r.servico, [produto()], loja());
    expect(problema).toBe("");
  });

  it("a nota de serviço cobra o código da lista e a alíquota de ISS", () => {
    const r = separarOS(o, [produto()]);
    const sem = problemaDoLado(r.servico, [produto()], loja({ codigoServicoPadrao: "", aliquotaIssPadrao: 0 }));
    expect(sem).toContain("lista de serviços");
    expect(sem).toContain("ISS");
  });

  it("peça sem NCM não impede a nota de SERVIÇO de sair", () => {
    /*
     * A assistência que só quer a nota da mão de obra não pode ser barrada
     * por causa do cadastro de uma peça que ela nem vai declarar hoje.
     */
    const semNcm = [produto({ ncm: "" })];
    const r = separarOS(o, semNcm);
    expect(problemaDoLado(r.servico, semNcm, loja())).toBe("");
    expect(problemaDoLado(r.mercadoria, semNcm, loja())).toContain("NCM");
  });

  it("quem não tem Inscrição Municipal é barrado só na nota de serviço", () => {
    const semMunicipal = loja({ inscricaoMunicipal: "" });
    const r = separarOS(o, [produto()]);
    expect(problemaDoLado(r.servico, [produto()], semMunicipal)).toContain("Inscrição Municipal");
    expect(problemaDoLado(r.mercadoria, [produto()], semMunicipal)).toBe("");
  });
});

describe("o pagamento das duas notas fecha com o que entrou no caixa", () => {
  const mov = (x: Partial<MovimentoCaixa>): MovimentoCaixa =>
    ({
      id: "m",
      tipo: "entrada",
      valor: 100,
      formaPagamento: "dinheiro",
      data: "2026-01-10T10:00:00.000Z",
      ...x,
    }) as MovimentoCaixa;

  it("só entrada, só desta OS, e a mesma forma soma uma vez só", () => {
    const movimentos = [
      mov({ id: "a", osId: "os1", valor: 300, formaPagamento: "pix" }),
      mov({ id: "b", osId: "os1", valor: 200, formaPagamento: "pix" }),
      mov({ id: "c", osId: "os1", valor: 310, formaPagamento: "credito" }),
      mov({ id: "d", osId: "outra", valor: 999, formaPagamento: "dinheiro" }),
      mov({ id: "e", osId: "os1", valor: 50, formaPagamento: "dinheiro", tipo: "saida" }),
    ];
    expect(pagamentosDaOS(movimentos, "os1")).toEqual([
      { forma: "pix", valor: 500 },
      { forma: "credito", valor: 310 },
    ]);
  });

  it("o rateio preenche na ordem e a soma bate EXATO com a nota", () => {
    const parcelas = [
      { forma: "pix" as const, valor: 500 },
      { forma: "credito" as const, valor: 310 },
    ];
    const servico = ratearPagamento(parcelas, 180);
    expect(servico).toEqual([{ forma: "pix", valor: 180 }]);

    const mercadoria = ratearPagamento(parcelas, 630);
    expect(mercadoria.reduce((s, p) => s + p.valor, 0)).toBe(630);
  });

  it("o que o caixa não cobre vira uma linha, e nunca falta", () => {
    /*
     * Nota com pagamento menor que o total é rejeitada. A OS pode estar
     * sendo emitida antes de o cliente pagar, ou paga só em parte — e a
     * nota tem que fechar assim mesmo.
     */
    const r = ratearPagamento([{ forma: "pix", valor: 50 }], 200, "dinheiro");
    expect(r.reduce((s, p) => s + p.valor, 0)).toBe(200);
    expect(r[r.length - 1]).toEqual({ forma: "dinheiro", valor: 150 });
  });

  it("sem nada no caixa, a nota sai com a forma escolhida na tela", () => {
    expect(ratearPagamento([], 180, "credito")).toEqual([{ forma: "credito", valor: 180 }]);
  });
});

describe("os dois pedidos saem prontos para a fila", () => {
  const o = os({ maoDeObra: 180, desconto: 30, pecas: [peca({ produtoId: "p1" })] });
  const produtos = [produto()];
  const parcelas = [{ forma: "pix" as const, valor: 780 }];

  it("a nota de serviço leva a discriminação com o número da OS", () => {
    const r = separarOS(o, produtos);
    const pedido = pedidoDoServicoDaOS(o, r.servico, produtos, loja(), parcelas);
    expect(pedido.discriminacao).toContain("OS 42");
    expect(pedido.discriminacao).toContain(DESCRICAO_MAO_DE_OBRA);
    expect(pedido.codigoMunicipio).toBe("4125506");
    expect(pedido.valorTotal).toBe(150);
    expect(pedido.pagamentos.reduce((s, p) => s + p.valor, 0)).toBe(150);
    // 17 é o código do Pix na tabela da SEFAZ. A palavra "pix" é rejeitada.
    expect(pedido.pagamentos[0].formaPagamento).toBe("17");
  });

  it("a mão de obra leva o código da lista e a alíquota da loja", () => {
    // Ela é uma linha sem cadastro: se o padrão da loja não valesse para
    // ela, a NFS-e da assistência nunca sairia.
    const r = separarOS(o, produtos);
    const pedido = pedidoDoServicoDaOS(o, r.servico, produtos, loja(), []);
    expect(pedido.itens[0].codigoServico).toBe("14.01");
    expect(pedido.itens[0].aliquotaIss).toBe(3);
  });

  it("a nota de mercadoria fecha com o total e o desconto do lado dela", () => {
    const o2 = os({ maoDeObra: 100, desconto: 250, pecas: [peca({ produtoId: "p1" })] });
    const r = separarOS(o2, produtos);
    const pedido = pedidoDaMercadoriaDaOS(o2, r.mercadoria, produtos, loja(), [
      { forma: "dinheiro", valor: 480 },
    ]);
    expect(pedido.valorTotal).toBe(480);
    expect(pedido.valorDesconto).toBe(150);
    expect(pedido.pagamentos.reduce((s, p) => s + p.valor, 0)).toBe(480);
    expect(pedido.itens[0].ncm).toBe("85177011");
  });

  it("a discriminação diz o desconto que foi dado naquele lado", () => {
    const r = separarOS(o, produtos);
    expect(discriminacaoDoServico(o, r.servico)).toContain("30.00");
  });
});
