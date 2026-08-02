import { describe, it, expect } from "vitest";
import {
  calcularDevolucao,
  problemaNaDevolucao,
  disponivelParaDevolver,
  jaDevolvido,
  podeDevolver,
  descricaoDaDevolucao,
  formasDaDevolucao,
} from "./devolucao";
import type { Venda, ItemVenda } from "./types";

const item = (i: Partial<ItemVenda>): ItemVenda => ({
  descricao: "Item",
  quantidade: 1,
  precoUnit: 10,
  custoUnit: 6,
  ...i,
});

const venda = (v: Partial<Venda> = {}): Venda =>
  ({
    id: "v1",
    numero: 42,
    itens: [
      item({ produtoId: "a", descricao: "Arroz", quantidade: 2, precoUnit: 30, custoUnit: 20 }),
      item({ produtoId: "b", descricao: "Feijão", quantidade: 1, precoUnit: 40, custoUnit: 25 }),
    ],
    desconto: 0,
    formaPagamento: "dinheiro",
    criadoEm: "2026-07-01T10:00:00.000Z",
    ...v,
  }) as Venda;

describe("devolução de mercadoria", () => {
  it("devolve o valor da parte devolvida, não da venda inteira", () => {
    const r = calcularDevolucao(venda(), { 1: 1 });
    expect(r.valor).toBe(40);
    expect(r.total).toBe(false);
  });

  it("o custo volta junto, senão o CMV conta uma venda desfeita", () => {
    const r = calcularDevolucao(venda(), { 0: 2 });
    expect(r.valor).toBe(60);
    expect(r.custo).toBe(40);
  });

  it("devolução de parte de um item devolve só aquela parte", () => {
    const r = calcularDevolucao(venda(), { 0: 1 });
    expect(r.valor).toBe(30);
    expect(r.custo).toBe(20);
  });

  it("o desconto volta na proporção, nunca por inteiro", () => {
    // Venda de 100 com 10 de desconto: quem devolve os 60 do arroz recebe
    // 54, não 60. Devolver item por item devolveria mais do que entrou.
    const v = venda({ desconto: 10 });
    const r = calcularDevolucao(v, { 0: 2 });
    expect(r.valor).toBe(54);
  });

  it("devolver tudo devolve exatamente o que o cliente pagou", () => {
    const v = venda({ desconto: 10 });
    const r = calcularDevolucao(v, { 0: 2, 1: 1 });
    expect(r.valor).toBe(90);
    expect(r.total).toBe(true);
  });

  it("desconto maior que a parte devolvida não faz o cliente pagar para devolver", () => {
    const v = venda({ desconto: 100 });
    expect(calcularDevolucao(v, { 0: 2 }).valor).toBe(0);
  });

  it("produto por peso devolve a fração certa", () => {
    const v = venda({
      itens: [item({ descricao: "Queijo", quantidade: 0.5, precoUnit: 60, custoUnit: 40, porPeso: true })],
    });
    const r = calcularDevolucao(v, { 0: 0.25 });
    expect(r.valor).toBe(15);
    expect(r.custo).toBe(10);
  });

  it("devolve os itens para repor o estoque, com a quantidade devolvida", () => {
    const r = calcularDevolucao(venda(), { 0: 1 });
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0].produtoId).toBe("a");
    expect(r.itens[0].quantidade).toBe(1);
  });
});

describe("o que já voltou não volta de novo", () => {
  const comDevolucao = () =>
    venda({
      devolucoes: [
        { id: "d1", data: "2026-07-02T10:00:00.000Z", itens: { 0: 1 }, valor: 30 },
      ],
    });

  it("soma o que já foi devolvido", () => {
    expect(jaDevolvido(comDevolucao())).toEqual({ 0: 1 });
  });

  it("o disponível desconta as devoluções anteriores", () => {
    expect(disponivelParaDevolver(comDevolucao())).toEqual([1, 1]);
  });

  it("recusa devolver mais do que restou", () => {
    // Sem isto sai dinheiro do caixa por um item que nunca saiu da loja, e o
    // furo só aparece na conferência da gaveta.
    expect(problemaNaDevolucao(comDevolucao(), { 0: 2 })).toContain("só restam 1");
  });

  it("recusa devolver item que já voltou por inteiro", () => {
    const v = venda({
      devolucoes: [{ id: "d1", data: "x", itens: { 1: 1 }, valor: 40 }],
    });
    expect(problemaNaDevolucao(v, { 1: 1 })).toContain("já foi devolvido por inteiro");
  });

  it("a segunda devolução parcial fecha a venda", () => {
    const r = calcularDevolucao(comDevolucao(), { 0: 1, 1: 1 });
    expect(r.total).toBe(true);
  });

  it("venda toda devolvida não aparece mais para devolver", () => {
    const v = venda({
      devolucoes: [{ id: "d1", data: "x", itens: { 0: 2, 1: 1 }, valor: 100 }],
    });
    expect(podeDevolver(v)).toBe(false);
    expect(podeDevolver(venda())).toBe(true);
  });

  it("recusa devolução vazia em vez de lançar zero no caixa", () => {
    expect(problemaNaDevolucao(venda(), {})).toContain("Escolha");
    expect(problemaNaDevolucao(venda(), { 0: 0 })).toContain("Escolha");
  });

  it("recusa índice que não existe na venda", () => {
    expect(problemaNaDevolucao(venda(), { 9: 1 })).toContain("não existe");
  });

  it("devolução válida não gera recusa", () => {
    expect(problemaNaDevolucao(venda(), { 0: 1 })).toBe("");
  });
});

/**
 * O dinheiro volta por onde entrou.
 *
 * A venda dividida já grava um lançamento POR FORMA — é o que faz o
 * fechamento separar a gaveta da maquininha. A devolução não: ela devolvia
 * tudo pela forma PRINCIPAL da venda.
 *
 * Numa venda de R$ 200 com R$ 190 no crédito e R$ 10 em espécie, devolver
 * tudo lançava R$ 200 de saída no crédito. O caixa passa a dizer que a
 * maquininha estornou R$ 200 quando estornou R$ 190, e os R$ 10 que saíram
 * da gaveta de verdade não saem de lugar nenhum — falta de R$ 10 no papel,
 * todo dia em que alguém devolve uma compra dividida.
 */
describe("a devolução volta pelas formas em que a venda foi paga", () => {
  const dividida = (v: Partial<Venda> = {}) =>
    venda({
      formaPagamento: "credito",
      pagamentos: [
        { forma: "credito", valor: 90 },
        { forma: "dinheiro", valor: 10 },
      ],
      ...v,
    });

  it("venda de uma forma só continua com um lançamento", () => {
    expect(formasDaDevolucao(venda(), 40)).toEqual([{ forma: "dinheiro", valor: 40 }]);
  });

  it("devolução total desfaz cada forma pelo que ela pagou", () => {
    expect(formasDaDevolucao(dividida(), 100)).toEqual([
      { forma: "credito", valor: 90 },
      { forma: "dinheiro", valor: 10 },
    ]);
  });

  it("devolução parcial reparte na proporção do que cada forma pagou", () => {
    expect(formasDaDevolucao(dividida(), 50)).toEqual([
      { forma: "credito", valor: 45 },
      { forma: "dinheiro", valor: 5 },
    ]);
  });

  it("a soma das formas fecha EXATO com o valor devolvido", () => {
    // Três terços de dez reais dão 3,33 cada e sobra um centavo. Sem sobrar
    // para alguém, a devolução lança R$ 9,99 por uma nota de R$ 10.
    const v = venda({
      formaPagamento: "credito",
      pagamentos: [
        { forma: "dinheiro", valor: 33.33 },
        { forma: "pix", valor: 33.33 },
        { forma: "credito", valor: 33.34 },
      ],
    });
    const formas = formasDaDevolucao(v, 10);
    expect(formas.reduce((s, f) => s + f.valor, 0)).toBe(10);
    // O centavo que sobra vai para a forma que mais pagou, igual ao que a
    // venda faz para escolher a forma principal.
    expect(formas.find((f) => f.forma === "credito")?.valor).toBe(3.34);
  });

  it("pagamento com uma linha só não vira lista de um item errado", () => {
    const v = venda({ formaPagamento: "pix", pagamentos: [{ forma: "pix", valor: 100 }] });
    expect(formasDaDevolucao(v, 30)).toEqual([{ forma: "pix", valor: 30 }]);
  });

  it("devolução de zero ainda registra a saída, para a venda não sumir do caixa", () => {
    // Venda inteira coberta por desconto: o valor é zero e o lançamento
    // continua sendo o rastro de que a mercadoria voltou.
    expect(formasDaDevolucao(dividida(), 0)).toEqual([{ forma: "credito", valor: 0 }]);
  });
});

describe("o que o dono lê no fechamento", () => {
  it("diz o número da venda e se foi total ou parcial", () => {
    const v = venda();
    expect(descricaoDaDevolucao(v, calcularDevolucao(v, { 0: 1 }))).toBe(
      "Devolução parcial da venda 42"
    );
    expect(descricaoDaDevolucao(v, calcularDevolucao(v, { 0: 2, 1: 1 }))).toBe(
      "Devolução total da venda 42"
    );
  });
});
