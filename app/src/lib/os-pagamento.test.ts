import { describe, it, expect } from "vitest";
import {
  contaDaOS,
  problemaNaEntradaDaOS,
  recebidoDaOS,
  faltaNaOS,
  perguntaDoResto,
  entregaOAparelho,
  DESTINO_META,
} from "./os-pagamento";
import type { MovimentoCaixa } from "./types";

const mov = (x: Partial<MovimentoCaixa>): MovimentoCaixa =>
  ({
    id: "m",
    tipo: "entrada",
    valor: 100,
    formaPagamento: "dinheiro",
    descricao: "x",
    data: "2026-08-27T12:00:00.000Z",
    ...x,
  }) as MovimentoCaixa;

describe("o cliente pagou uma parte", () => {
  it("300 de 800 é PARCIAL, e sobram 500", () => {
    const c = contaDaOS(800, [{ forma: "dinheiro", valor: 300 }]);
    expect(c.situacao).toBe("parcial");
    expect(c.falta).toBe(500);
    expect(c.agora).toBe(300);
    expect(perguntaDoResto(c)).toContain("500.00");
  });

  it("o valor exato continua sendo o caminho normal", () => {
    const c = contaDaOS(800, [{ forma: "pix", valor: 800 }]);
    expect(c.situacao).toBe("exato");
    expect(c.falta).toBe(0);
  });

  it("dividido entre formas, o que vale é a SOMA", () => {
    const c = contaDaOS(800, [
      { forma: "credito", valor: 200 },
      { forma: "dinheiro", valor: 150 },
    ]);
    expect(c.agora).toBe(350);
    expect(c.falta).toBe(450);
    expect(c.situacao).toBe("parcial");
  });

  it("nada informado não é pagamento parcial de zero", () => {
    // "sem_valor" e "parcial" são coisas diferentes: uma é o atendente que
    // ainda não digitou, a outra é uma decisão do cliente.
    expect(contaDaOS(800, []).situacao).toBe("sem_valor");
    expect(contaDaOS(800, [{ forma: "pix", valor: 0 }]).situacao).toBe("sem_valor");
  });
});

describe("o sinal de ontem abate o pagamento de hoje", () => {
  it("pagou 300 antes, hoje fecha com 500", () => {
    /*
     * Sem isto a segunda parcela cobraria o total de novo, e o caixa
     * receberia R$ 1.100 por um serviço de R$ 800 — a sobra apareceria na
     * conferência da gaveta dias depois, sem origem.
     */
    const c = contaDaOS(800, [{ forma: "dinheiro", valor: 500 }], 300);
    expect(c.situacao).toBe("exato");
    expect(c.falta).toBe(0);
  });

  it("pagou 300 antes e 200 agora: ainda faltam 300", () => {
    const c = contaDaOS(800, [{ forma: "pix", valor: 200 }], 300);
    expect(c.situacao).toBe("parcial");
    expect(c.falta).toBe(300);
  });

  it("pagar mais do que falta continua sendo recusado", () => {
    // Dinheiro a mais na gaveta aparece dias depois sem origem.
    const problema = problemaNaEntradaDaOS(800, [{ forma: "dinheiro", valor: 600 }], 300);
    expect(problema).toContain("500.00");
    expect(problema).toContain("Tire");
  });
});

describe("faltar dinheiro virou pergunta; o resto continua sendo erro", () => {
  it("faltar NÃO é mais recusa", () => {
    expect(problemaNaEntradaDaOS(800, [{ forma: "dinheiro", valor: 300 }])).toBe("");
  });

  it("sem informar forma nenhuma, continua recusando", () => {
    expect(problemaNaEntradaDaOS(800, [])).toContain("Informe como o cliente vai pagar");
  });

  it("valor negativo continua recusado", () => {
    expect(
      problemaNaEntradaDaOS(800, [
        { forma: "dinheiro", valor: 300 },
        { forma: "pix", valor: -50 },
      ])
    ).toContain("negativo");
  });

  it("recebido menor que o lançado continua recusado", () => {
    /*
     * Esta regra vem de `problemaNoPagamento`, e é reaproveitada de
     * propósito: o furo é o mesmo aqui e no PDV, e uma cópia envelheceria
     * sozinha.
     */
    expect(
      problemaNaEntradaDaOS(800, [{ forma: "dinheiro", valor: 300, recebido: 100 }])
    ).toContain("recebido em dinheiro é menor");
  });

  it("troco em espécie no pagamento parcial continua passando", () => {
    // Cliente paga 300 de 800 e entrega uma nota de 500: o troco é 200, e
    // isso não tem nada a ver com o que ainda falta da OS.
    expect(
      problemaNaEntradaDaOS(800, [{ forma: "dinheiro", valor: 300, recebido: 500 }])
    ).toBe("");
  });
});

describe("as duas saídas do resto significam coisas diferentes", () => {
  it("fiado entrega o aparelho; sinal não", () => {
    /*
     * É a única diferença que importa, e é ela que justifica existirem
     * duas opções. Iguais, seriam a mesma coisa com dois nomes.
     */
    expect(entregaOAparelho("fiado")).toBe(true);
    expect(entregaOAparelho("sinal")).toBe(false);
  });

  it("o texto de cada uma diz o que acontece com o aparelho", () => {
    // Quem escolhe está no balcão com o cliente na frente: o rótulo tem que
    // responder "ele leva ou não leva?" sem precisar abrir manual.
    expect(DESTINO_META.fiado.label.toLowerCase()).toContain("levar");
    expect(DESTINO_META.sinal.label.toLowerCase()).toContain("fica");
    expect(DESTINO_META.fiado.explicacao).toContain("A Receber");
    expect(DESTINO_META.sinal.explicacao).toContain("continua aberta");
  });
});

describe("o que já entrou por esta OS", () => {
  const movimentos = [
    mov({ id: "a", osId: "os1", valor: 300 }),
    mov({ id: "b", osId: "os1", valor: 200, formaPagamento: "pix" }),
    mov({ id: "c", osId: "os1", valor: 50, tipo: "saida" }),
    mov({ id: "d", osId: "outra", valor: 999 }),
    mov({ id: "e", valor: 777 }),
  ];

  it("soma só as entradas desta OS", () => {
    // Devolução e sangria lançadas na mesma OS não são pagamento dela.
    expect(recebidoDaOS(movimentos, "os1")).toBe(500);
    expect(recebidoDaOS(movimentos, "outra")).toBe(999);
    expect(recebidoDaOS(movimentos, "nao-existe")).toBe(0);
  });

  it("o que falta na OS é o total menos o que entrou", () => {
    /*
     * É o número que a lista e o detalhe mostram depois do sinal. Sem ele o
     * sinal seria invisível: a OS ficaria com cara de paga e ninguém
     * cobraria o resto — que é o erro que o caderno do balcão comete.
     */
    expect(faltaNaOS(800, movimentos, "os1")).toBe(300);
    expect(faltaNaOS(500, movimentos, "os1")).toBe(0);
    // Recebeu mais do que devia (guarda que baixou depois): falta zero, e
    // nunca negativo — negativo ali viraria "a loja deve ao cliente".
    expect(faltaNaOS(400, movimentos, "os1")).toBe(0);
  });
});

describe("centavo não some no meio do caminho", () => {
  it("três parcelas quebradas fecham exato", () => {
    const c = contaDaOS(100, [
      { forma: "dinheiro", valor: 33.33 },
      { forma: "pix", valor: 33.33 },
      { forma: "credito", valor: 33.34 },
    ]);
    expect(c.agora).toBe(100);
    expect(c.falta).toBe(0);
    expect(c.situacao).toBe("exato");
  });

  it("um centavo faltando ainda é parcial, e não 'exato por arredondamento'", () => {
    const c = contaDaOS(100, [{ forma: "pix", valor: 99.99 }]);
    expect(c.situacao).toBe("parcial");
    expect(c.falta).toBe(0.01);
  });
});
