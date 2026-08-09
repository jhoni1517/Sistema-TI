import { describe, it, expect } from "vitest";
import {
  nomeDaForma,
  FORMAS_META,
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
    expect(problemaNoPagamento(80, [p("credito", 100)])).toContain("Tire 20.00");
  });

  it("BUG DA REVISÃO: as formas não podem somar mais que a venda", () => {
    // Venda de 100 com 60 no cartão: o atendente digitava 50 em dinheiro e o
    // sistema aceitava, lançando 110 no caixa. A sobra aparecia na
    // conferência da gaveta dias depois, sem origem.
    const parcelas = [p("credito", 60), p("dinheiro", 50)];
    expect(totalPago(parcelas)).toBe(110);
    expect(problemaNoPagamento(100, parcelas)).toContain("Tire 10.00");
    expect(problemaNoPagamento(100, parcelas)).toContain("Recebido");
  });

  it("o jeito certo de receber a mais em espécie é pelo Recebido", () => {
    // 60 no cartão, 40 em dinheiro, cliente entrega 50: troco de 10, e o
    // caixa recebe exatamente 100.
    const parcelas = [p("credito", 60), p("dinheiro", 40, 50)];
    expect(problemaNoPagamento(100, parcelas)).toBe("");
    expect(totalPago(parcelas)).toBe(100);
    expect(trocoDoPagamento(100, parcelas)).toBe(10);
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

  /**
   * `recebido` é POR PARCELA: quanto o cliente entregou naquela linha. Quem
   * não informou entregou exatamente o que foi lançado.
   *
   * Ao juntar duas linhas de dinheiro, a soma do entregue usava o valor JÁ
   * juntado no lugar do valor da própria linha — o dobro. E daí sai troco:
   * é `entregue - lançado` que a gaveta paga.
   */
  it("juntar linhas de dinheiro não infla o que o cliente entregou", () => {
    // 30 lançados sem informar (entregou 30) + 20 lançados com 30 na mão.
    // Entregue 60, lançado 50, troco 10.
    const r = consolidar([p("dinheiro", 30), p("dinheiro", 20, 30)]);
    expect(r).toHaveLength(1);
    expect(r[0].valor).toBe(50);
    expect(r[0].recebido).toBe(60);
    expect(trocoDoPagamento(50, r)).toBe(10);
  });

  it("a linha que não informou o entregue entra pelo próprio valor", () => {
    const r = consolidar([p("dinheiro", 30, 50), p("dinheiro", 20)]);
    expect(r[0].valor).toBe(50);
    expect(r[0].recebido).toBe(70);
  });

  it("sem ninguém informar entregue, a forma juntada também não informa", () => {
    // Guardar um "recebido" igual ao valor não é errado na conta, mas
    // inventa no cupom um "Recebido" que ninguém digitou.
    const r = consolidar([p("dinheiro", 30), p("dinheiro", 20)]);
    expect(r[0].valor).toBe(50);
    expect(r[0].recebido).toBeUndefined();
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

/**
 * A tela imprimia a chave crua com `capitalize` do CSS, e funcionava por
 * sorte: toda forma era uma palavra só. No dia em que nasceu o vale, o
 * caixa, o recibo e o fechamento passaram a mostrar "Vale_refeicao".
 */
describe("o nome da forma para mostrar", () => {
  it("traduz a chave gravada", () => {
    expect(nomeDaForma("vale_refeicao")).toBe("Vale-refeição");
    expect(nomeDaForma("vale_alimentacao")).toBe("Vale-alimentação");
    expect(nomeDaForma("debito")).toBe("Débito");
    expect(nomeDaForma("transferencia")).toBe("Transferência / boleto");
  });

  it("vazio é dinheiro, igual ao resto do sistema", () => {
    // É assim que volta da nuvem o lançamento gravado antes de a coluna
    // existir. Ver `ehEspecie` em lib/caixa.ts.
    expect(nomeDaForma("")).toBe("Dinheiro");
    expect(nomeDaForma(undefined)).toBe("Dinheiro");
  });

  it("chave desconhecida vira texto legível em vez de sumir", () => {
    // Lançamento importado de outro sistema: o valor está lá, e quem
    // confere precisa saber de onde ele veio.
    expect(nomeDaForma("cartao_loja")).toBe("Cartao loja");
  });

  it("toda forma da lista de venda tem nome, e nenhum é a chave crua", () => {
    for (const f of FORMAS_META) {
      expect(nomeDaForma(f.k), f.k).toBe(f.nome);
      expect(f.nome, f.k).not.toContain("_");
    }
  });
});
