import { describe, it, expect } from "vitest";
import {
  ehGastoNoCartao,
  ehPagamentoDeFatura,
  gastoNoCartao,
  porCategoria,
} from "./cartao";
import { despesasOperacionais, lucroLiquido, receitaBruta } from "./calc";
import type { MovimentoCaixa } from "./types";

const mov = (m: Partial<MovimentoCaixa> = {}): MovimentoCaixa =>
  ({
    id: Math.random().toString(36).slice(2),
    tipo: "saida",
    categoria: "Despesa",
    descricao: "",
    valor: 100,
    formaPagamento: "credito",
    data: "2026-08-10T10:00:00.000Z",
    ...m,
  }) as MovimentoCaixa;

describe("o que entra na fatura", () => {
  it("compra no crédito é gasto no cartão", () => {
    expect(ehGastoNoCartao(mov())).toBe(true);
  });

  it("compra em dinheiro, pix ou débito não é", () => {
    for (const f of ["dinheiro", "pix", "debito"] as const) {
      expect(ehGastoNoCartao(mov({ formaPagamento: f }))).toBe(false);
    }
  });

  it("entrada no crédito é venda, não gasto", () => {
    expect(ehGastoNoCartao(mov({ tipo: "entrada" }))).toBe(false);
  });

  it("soma o período e ordena do mais recente para o mais antigo", () => {
    const g = gastoNoCartao([
      mov({ id: "a", valor: 100, data: "2026-08-01T10:00:00.000Z" }),
      mov({ id: "b", valor: 250, data: "2026-08-20T10:00:00.000Z" }),
      mov({ id: "fora", valor: 999, data: "2026-07-15T10:00:00.000Z" }),
    ], { de: "2026-08-01", ate: "2026-08-31" });
    expect(g.total).toBe(350);
    expect(g.itens.map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("sem período, conta tudo", () => {
    expect(gastoNoCartao([mov({ valor: 40 }), mov({ valor: 60 })]).total).toBe(100);
  });
});

/**
 * A armadilha, e é a mesma da compra de estoque.
 *
 * Se cada compra no crédito é despesa E o pagamento da fatura também for, o
 * mês conta tudo DUAS VEZES: R$ 2.000 no cartão fecha mostrando R$ 4.000 de
 * despesa e um prejuízo que não existiu.
 */
describe("pagar a fatura não é despesa nova", () => {
  const compras = [
    mov({ id: "c1", valor: 1200, categoria: "Material", data: "2026-08-05T10:00:00.000Z" }),
    mov({ id: "c2", valor: 800, categoria: "Combustível", data: "2026-08-12T10:00:00.000Z" }),
  ];
  const fatura = mov({
    id: "f",
    valor: 2000,
    categoria: "Fatura do cartão",
    formaPagamento: "dinheiro",
    faturaCartao: true,
    data: "2026-08-25T10:00:00.000Z",
  });

  it("reconhece o pagamento da fatura pela marca", () => {
    expect(ehPagamentoDeFatura(fatura)).toBe(true);
  });

  it("reconhece pela categoria os lançamentos antigos, sem a marca", () => {
    // Feitos antes de o campo existir. Mesma escolha de ehCompraEstoque:
    // assim o histórico também passa a ser calculado direito.
    const antigo = mov({ categoria: "Fatura do cartão", formaPagamento: "dinheiro" });
    delete (antigo as unknown as Record<string, unknown>).faturaCartao;
    expect(ehPagamentoDeFatura(antigo)).toBe(true);
  });

  it("a marca explícita em FALSO vence a categoria", () => {
    const m = mov({ categoria: "Fatura do cartão", faturaCartao: false });
    expect(ehPagamentoDeFatura(m)).toBe(false);
  });

  it("a despesa do mês conta a compra, e não a fatura", () => {
    // R$ 2.000 comprados e R$ 2.000 pagos: a despesa do mês é 2.000, não
    // 4.000. É a conta que decide se o mês fechou no azul.
    const movs = [...compras, fatura];
    expect(despesasOperacionais(movs)).toBe(2000);
  });

  it("sem a regra, o lucro do mês some", () => {
    const movs = [
      mov({ tipo: "entrada", valor: 5000, formaPagamento: "dinheiro" }),
      ...compras,
      fatura,
    ];
    // 5.000 de receita menos 2.000 de despesa = 3.000. Contando a fatura
    // junto daria 1.000, e a loja acharia que trabalhou de graça.
    expect(receitaBruta(movs)).toBe(5000);
    expect(lucroLiquido(movs)).toBe(3000);
  });

  it("a fatura não entra no próprio gasto do cartão", () => {
    // Ela ficaria de fora por ser em dinheiro; a guarda existe para o caso
    // de alguém pagar a fatura de um cartão com outro.
    const noCredito = { ...fatura, formaPagamento: "credito" } as MovimentoCaixa;
    expect(ehGastoNoCartao(noCredito)).toBe(false);
    expect(gastoNoCartao([...compras, noCredito]).total).toBe(2000);
  });

  it("mostra quanto já foi pago de fatura no período", () => {
    const g = gastoNoCartao([...compras, fatura], { de: "2026-08-01", ate: "2026-08-31" });
    expect(g.total).toBe(2000);
    expect(g.pago).toBe(2000);
  });
});

describe("onde o dinheiro do cartão foi parar", () => {
  it("agrupa por categoria, do maior para o menor", () => {
    const g = gastoNoCartao([
      mov({ valor: 300, categoria: "Material" }),
      mov({ valor: 100, categoria: "Combustível" }),
      mov({ valor: 200, categoria: "Material" }),
    ]);
    expect(porCategoria(g)).toEqual([
      { categoria: "Material", valor: 500 },
      { categoria: "Combustível", valor: 100 },
    ]);
  });

  it("lançamento sem categoria não some da conta", () => {
    const g = gastoNoCartao([mov({ valor: 50, categoria: "" })]);
    expect(porCategoria(g)).toEqual([{ categoria: "Sem categoria", valor: 50 }]);
  });
});
