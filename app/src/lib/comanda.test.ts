import { describe, it, expect } from "vitest";
import {
  totalComanda,
  quantosItens,
  problemaParaFechar,
  cancelarItem,
  comPreparo,
  comandasAbertas,
  comandaDaMesa,
  filaDaCozinha,
  minutosEsperando,
  corDaEspera,
  preparoDe,
} from "./comanda";
import type { Comanda, ItemComanda } from "./types";

const item = (i: Partial<ItemComanda> = {}): ItemComanda =>
  ({
    id: Math.random().toString(36).slice(2),
    descricao: "Pizza Calabresa",
    quantidade: 1,
    precoUnit: 45,
    custoUnit: 15,
    pedidoEm: "2026-08-08T19:00:00.000Z",
    preparo: "pendente",
    ...i,
  }) as ItemComanda;

const comanda = (c: Partial<Comanda> = {}): Comanda =>
  ({
    id: "c1",
    numero: 1,
    mesa: "5",
    itens: [],
    status: "aberta",
    abertaEm: "2026-08-08T19:00:00.000Z",
    ...c,
  }) as Comanda;

describe("quanto a mesa deve", () => {
  it("soma as linhas, cada uma pelo que ela vale", () => {
    const c = comanda({
      itens: [item({ precoUnit: 45 }), item({ precoUnit: 8, quantidade: 3 })],
    });
    expect(totalComanda(c)).toBe(69);
    expect(quantosItens(c)).toBe(2);
  });

  it("item cancelado não entra na conta, mas continua na comanda", () => {
    // Ninguém paga por comida que não saiu. E a linha fica, para a cozinha
    // saber que aquilo chegou a ser pedido e desfeito.
    const cancelado = item({ id: "x", precoUnit: 45 });
    const c = cancelarItem(comanda({ itens: [cancelado, item({ precoUnit: 20 })] }), "x");
    expect(totalComanda(c)).toBe(20);
    expect(quantosItens(c)).toBe(1);
    expect(c.itens).toHaveLength(2);
    expect(c.itens[0].cancelado).toBe(true);
  });

  it("comanda vazia vale zero, não quebra", () => {
    expect(totalComanda(comanda())).toBe(0);
    expect(totalComanda({} as Comanda)).toBe(0);
  });

  it("centavo não vira dízima", () => {
    const c = comanda({ itens: [item({ precoUnit: 0.1 }), item({ precoUnit: 0.2 })] });
    expect(totalComanda(c)).toBe(0.3);
  });
});

describe("fechar a comanda", () => {
  it("comanda com item pode fechar", () => {
    expect(problemaParaFechar(comanda({ itens: [item()] }))).toBe("");
  });

  it("comanda vazia manda cancelar, não fechar", () => {
    // Fechada com zero vira uma venda de R$ 0,00 no caixa, que fica lá
    // para sempre atrapalhando a conferência.
    expect(problemaParaFechar(comanda()).toLowerCase()).toContain("cancele");
  });

  it("comanda já fechada não fecha duas vezes", () => {
    // Fechar de novo geraria uma segunda venda com o mesmo consumo: o
    // caixa do dia contaria a mesa duas vezes.
    const c = comanda({ itens: [item()], status: "fechada" });
    expect(problemaParaFechar(c)).toContain("já foi fechada");
  });

  it("item ainda na cozinha NÃO impede fechar", () => {
    // A pessoa pede a conta e vai embora enquanto a sobremesa sai. Travar
    // o caixa por isso o prenderia numa fila que não é dele.
    const c = comanda({ itens: [item({ preparo: "preparando" })] });
    expect(problemaParaFechar(c)).toBe("");
  });
});

describe("uma mesa, uma comanda", () => {
  const abertas = [
    comanda({ id: "a", mesa: "5", abertaEm: "2026-08-08T19:00:00.000Z" }),
    comanda({ id: "b", mesa: "7", abertaEm: "2026-08-08T18:00:00.000Z" }),
    comanda({ id: "c", mesa: "9", status: "fechada" }),
  ];

  it("acha a comanda aberta da mesa", () => {
    expect(comandaDaMesa(abertas, "5")?.id).toBe("a");
  });

  it("não confunde maiúscula nem espaço sobrando", () => {
    // "Balcão" e "balcão " são a mesma mesa. Duas comandas na mesma mesa é
    // o jeito mais fácil de a conta sair pela metade.
    const b = [comanda({ id: "z", mesa: "Balcão" })];
    expect(comandaDaMesa(b, " balcão ")?.id).toBe("z");
  });

  it("mesa já fechada não conta como ocupada", () => {
    expect(comandaDaMesa(abertas, "9")).toBeUndefined();
  });

  it("as abertas vêm da mais antiga: é a que espera há mais tempo", () => {
    expect(comandasAbertas(abertas).map((c) => c.id)).toEqual(["b", "a"]);
  });
});

describe("a fila da cozinha", () => {
  const agora = new Date("2026-08-08T19:30:00.000Z");

  it("junta as mesas e põe quem espera há mais tempo em cima", () => {
    // A cozinha não trabalha por mesa, trabalha por ordem de chegada.
    const comandas = [
      comanda({
        id: "a",
        numero: 1,
        mesa: "5",
        itens: [item({ id: "i1", pedidoEm: "2026-08-08T19:25:00.000Z" })],
      }),
      comanda({
        id: "b",
        numero: 2,
        mesa: "7",
        abertaEm: "2026-08-08T19:05:00.000Z",
        itens: [item({ id: "i2", pedidoEm: "2026-08-08T19:05:00.000Z" })],
      }),
    ];
    const fila = filaDaCozinha(comandas, agora);
    expect(fila.map((f) => f.item.id)).toEqual(["i2", "i1"]);
    expect(fila[0].minutos).toBe(25);
    expect(fila[0].mesa).toBe("7");
  });

  it("pronto e entregue saem da fila", () => {
    const c = comanda({
      itens: [
        item({ id: "a", preparo: "pendente" }),
        item({ id: "b", preparo: "pronto" }),
        item({ id: "c", preparo: "entregue" }),
      ],
    });
    expect(filaDaCozinha([c], agora).map((f) => f.item.id)).toEqual(["a"]);
  });

  it("cancelado sai da fila", () => {
    const c = cancelarItem(comanda({ itens: [item({ id: "x" })] }), "x");
    expect(filaDaCozinha([c], agora)).toEqual([]);
  });

  it("comanda fechada não manda nada para a cozinha", () => {
    const c = comanda({ status: "fechada", itens: [item()] });
    expect(filaDaCozinha([c], agora)).toEqual([]);
  });
});

describe("o relógio do atraso", () => {
  const agora = new Date("2026-08-08T19:30:00.000Z");

  it("conta desde o pedido enquanto não fica pronto", () => {
    expect(minutosEsperando(item({ pedidoEm: "2026-08-08T19:05:00.000Z" }), agora)).toBe(25);
  });

  it("para de contar quando fica pronto: depois disso a demora é do salão", () => {
    const pronto = item({
      pedidoEm: "2026-08-08T19:00:00.000Z",
      prontoEm: "2026-08-08T19:12:00.000Z",
      preparo: "pronto",
    });
    expect(minutosEsperando(pronto, agora)).toBe(12);
  });

  it("data podre não vira número negativo nem NaN na tela", () => {
    expect(minutosEsperando(item({ pedidoEm: "" }), agora)).toBe(0);
    expect(minutosEsperando(item({ pedidoEm: "amanhã" }), agora)).toBe(0);
  });

  it("a cor só grita quando é atraso de verdade", () => {
    // Pizza leva 20 minutos no forno. Tela que fica vermelha aos 10 vira
    // tela toda vermelha, que não diz mais nada.
    expect(corDaEspera(5)).toContain("slate");
    expect(corDaEspera(22)).toContain("amber");
    expect(corDaEspera(35)).toContain("red");
  });
});

describe("etapas do preparo", () => {
  it("marcar pronto grava a hora; as outras etapas não", () => {
    const c = comanda({ itens: [item({ id: "x" })] });
    const emPreparo = comPreparo(c, "x", "preparando", new Date("2026-08-08T19:10:00.000Z"));
    expect(emPreparo.itens[0].prontoEm).toBeUndefined();

    const pronto = comPreparo(emPreparo, "x", "pronto", new Date("2026-08-08T19:20:00.000Z"));
    expect(pronto.itens[0].prontoEm).toBe("2026-08-08T19:20:00.000Z");
  });

  it("etapa desconhecida vira pendente em vez de quebrar a tela", () => {
    expect(preparoDe(undefined)).toBe("pendente");
    expect(preparoDe("qualquer coisa")).toBe("pendente");
    expect(preparoDe("pronto")).toBe("pronto");
  });
});
