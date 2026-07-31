import { describe, it, expect } from "vitest";
import {
  totalPago,
  faltaNoPagamento,
  trocoDoPagamento,
  problemaNoPagamento,
  consolidar,
  formaPrincipal,
  descricaoDoPagamento,
  type Parcela,
} from "./pagamento";

const p = (forma: Parcela["forma"], valor: number, recebido?: number): Parcela => ({
  forma,
  valor,
  recebido,
});

describe("venda paga em mais de uma forma", () => {
  it("soma as formas e diz o que falta", () => {
    const parcelas = [p("credito", 50), p("dinheiro", 30)];
    expect(totalPago(parcelas)).toBe(80);
    expect(faltaNoPagamento(100, parcelas)).toBe(20);
  });

  it("pagamento completo não deixa falta", () => {
    expect(faltaNoPagamento(100, [p("pix", 60), p("dinheiro", 40)])).toBe(0);
  });

  it("pagar a mais não vira falta negativa", () => {
    expect(faltaNoPagamento(100, [p("dinheiro", 150)])).toBe(0);
  });

  it("recusa fechar com valor faltando, dizendo quanto", () => {
    // Sem isso o atendente fecha a venda achando que recebeu tudo, e o furo
    // só aparece na conferência da gaveta, sem origem.
    expect(problemaNoPagamento(100, [p("pix", 60)])).toContain("40.00");
  });

  it("recusa fechar sem nenhuma forma", () => {
    expect(problemaNoPagamento(100, [])).toContain("como o cliente vai pagar");
    expect(problemaNoPagamento(100, [p("pix", 0)])).toContain("como o cliente vai pagar");
  });

  it("recusa valor negativo numa forma", () => {
    expect(problemaNoPagamento(100, [p("pix", 150), p("dinheiro", -50)])).toContain(
      "negativo"
    );
  });

  it("pagamento certinho não gera recusa", () => {
    expect(problemaNoPagamento(100, [p("pix", 60), p("dinheiro", 40)])).toBe("");
  });
});

describe("troco só sai de dinheiro", () => {
  it("dinheiro puro devolve o troco de sempre", () => {
    expect(trocoDoPagamento(80, [p("dinheiro", 80, 100)])).toBe(20);
  });

  it("parte no cartão e parte em dinheiro: o troco olha o total", () => {
    // Compra de 100: 60 no cartão e o cliente entrega 50 em espécie.
    expect(trocoDoPagamento(100, [p("credito", 60), p("dinheiro", 40, 50)])).toBe(10);
  });

  it("sem espécie não há troco, mesmo pagando a mais", () => {
    // Passar 100 no cartão numa compra de 80 gera estorno, não troco.
    // Devolver isso da gaveta é prejuízo puro que só aparece na conferência.
    expect(trocoDoPagamento(80, [p("credito", 100)])).toBe(0);
    expect(problemaNoPagamento(80, [p("credito", 100)])).toContain("não há troco");
  });

  it("valor exato não gera troco", () => {
    expect(trocoDoPagamento(100, [p("dinheiro", 100, 100)])).toBe(0);
  });

  it("sem informar o recebido, assume que veio o valor exato", () => {
    expect(trocoDoPagamento(100, [p("dinheiro", 100)])).toBe(0);
  });

  it("recusa recebido menor do que o lançado em dinheiro", () => {
    expect(problemaNoPagamento(100, [p("dinheiro", 100, 80)])).toContain("menor");
  });
});

describe("como a venda aparece depois", () => {
  it("junta parcelas repetidas da mesma forma", () => {
    // Duas linhas de "dinheiro" no fechamento é ruído: quem confere quer
    // saber quanto entrou em cada forma, não em quantas etapas.
    const r = consolidar([p("dinheiro", 30), p("pix", 20), p("dinheiro", 10)]);
    expect(r).toHaveLength(2);
    expect(r.find((x) => x.forma === "dinheiro")?.valor).toBe(40);
  });

  it("descarta forma zerada ao consolidar", () => {
    expect(consolidar([p("pix", 50), p("dinheiro", 0)])).toHaveLength(1);
  });

  it("a forma da venda é a de MAIOR valor", () => {
    // Chamar de "dinheiro" uma venda de 200 com 190 no cartão seria mentir
    // sobre onde o dinheiro está.
    expect(formaPrincipal([p("credito", 190), p("dinheiro", 10)])).toBe("credito");
  });

  it("sem parcela nenhuma, cai em dinheiro", () => {
    expect(formaPrincipal([])).toBe("dinheiro");
  });

  it("descreve o pagamento para o cupom", () => {
    const texto = descricaoDoPagamento(
      [p("credito", 190), p("dinheiro", 10)],
      (f) => f
    );
    expect(texto).toBe("credito 190.00 + dinheiro 10.00");
  });
});

describe("centavos não escapam", () => {
  it("três formas quebradas fecham exatamente", () => {
    const parcelas = [p("pix", 33.33), p("credito", 33.33), p("dinheiro", 33.34)];
    expect(totalPago(parcelas)).toBe(100);
    expect(faltaNoPagamento(100, parcelas)).toBe(0);
    expect(problemaNoPagamento(100, parcelas)).toBe("");
  });

  it("um centavo faltando é recusado, não arredondado", () => {
    const parcelas = [p("pix", 33.33), p("credito", 33.33), p("dinheiro", 33.33)];
    expect(faltaNoPagamento(100, parcelas)).toBe(0.01);
    expect(problemaNoPagamento(100, parcelas)).toContain("0.01");
  });
});
