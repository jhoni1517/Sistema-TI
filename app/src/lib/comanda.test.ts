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
  taxaDaComanda,
  totalAPagar,
  itensParaVenda,
} from "./comanda";
import { saldosApos } from "./estoque";
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

/**
 * A comanda desemboca no MESMO lugar que a venda do balcão: `saldosApos` e
 * um movimento no caixa. Ela nasceu sem a conferência que o carrinho já
 * tinha, e a quantidade é campo livre na tela do garçom — tem que ser, ele
 * corrige "2 cervejas" para "3" o tempo todo.
 */
describe("a mesa não fecha com linha que não é consumo", () => {
  it("recusa quantidade negativa e diz qual é a saída", () => {
    const c = comanda({
      itens: [item(), item({ descricao: "Refrigerante", quantidade: -2, precoUnit: 8 })],
    });
    const p = problemaParaFechar(c);
    expect(p).toContain("Refrigerante");
    expect(p).toContain("negativa");
    // Quem quer tirar item da conta tem um caminho próprio, que deixa
    // rastro para a cozinha.
    expect(p).toContain("cancelar");
  });

  it("recusa quantidade zero", () => {
    const p = problemaParaFechar(comanda({ itens: [item({ descricao: "Pudim", quantidade: 0 })] }));
    expect(p).toContain("Pudim");
    expect(p).toContain("zero");
  });

  it("recusa item sem preço, dizendo qual", () => {
    const p = problemaParaFechar(
      comanda({ itens: [item(), item({ descricao: "Couvert", precoUnit: 0 })] })
    );
    expect(p).toContain("Couvert");
    expect(p).toContain("preço");
  });

  it("item CANCELADO com quantidade estranha não impede fechar", () => {
    // A linha cancelada fica na comanda de propósito, para a cozinha saber
    // que aquilo foi pedido e desfeito. Ela não pode travar o caixa.
    const c = comanda({
      itens: [item(), item({ quantidade: -3, cancelado: true })],
    });
    expect(problemaParaFechar(c)).toBe("");
  });

  it("desconto que zera a conta manda cancelar em vez de fechar", () => {
    // Fechar por R$ 0,00 vira uma venda de zero no caixa, que ninguém sabe
    // ler no fechamento do dia — o mesmo motivo da comanda vazia.
    const c = comanda({ itens: [item({ precoUnit: 50 })], desconto: 50 });
    expect(problemaParaFechar(c)).toContain("cancele");
  });

  it("mostra o estrago: a linha negativa zerava a mesa e CREDITAVA a geladeira", () => {
    // É este resultado que a recusa impede. Sem ela a mesa fechava por
    // R$ 0,00 e dois refrigerantes entravam no estoque sem nota — e nada
    // sobrava para a conferência achar.
    const c = comanda({
      itens: [
        item({ produtoId: "a", descricao: "Pizza", quantidade: 1, precoUnit: 60 }),
        item({ produtoId: "b", descricao: "Refrigerante", quantidade: -2, precoUnit: 30 }),
      ],
    });
    expect(totalComanda(c)).toBe(0);
    const saldos = saldosApos(itensParaVenda(c), [
      { id: "b", nome: "Refrigerante", quantidade: 10, estoqueMinimo: 1, custo: 5, preco: 30, criadoEm: "" },
    ]);
    expect(saldos.find((s) => s.produto.id === "b")?.quantidade).toBe(12);
  });
});

describe("taxa de serviço e desconto", () => {
  const c = (p: Partial<Comanda> = {}) =>
    comanda({ itens: [item({ precoUnit: 100, quantidade: 1 })], ...p });

  it("os 10% saem do consumo", () => {
    expect(taxaDaComanda(c({ taxaServico: 10 }))).toBe(10);
    expect(totalAPagar(c({ taxaServico: 10 }))).toBe(110);
  });

  it("sem taxa marcada, a conta é o consumo", () => {
    expect(taxaDaComanda(c())).toBe(0);
    expect(totalAPagar(c())).toBe(100);
  });

  it("percentual absurdo é ignorado em vez de multiplicar a conta", () => {
    // Digitar 1000 por engano transformaria uma conta de R$ 100 em R$ 1.100
    // com o cliente na frente.
    expect(taxaDaComanda(c({ taxaServico: 1000 }))).toBe(0);
    expect(taxaDaComanda(c({ taxaServico: -10 }))).toBe(0);
  });

  it("a taxa é sobre o consumo, nunca sobre o consumo já com desconto", () => {
    // Nem o contrário: serviço cobrado em cima do serviço é conta em cima
    // de conta, e é o tipo de coisa que o cliente confere.
    const x = c({ taxaServico: 10, desconto: 20 });
    expect(taxaDaComanda(x)).toBe(10);
    expect(totalAPagar(x)).toBe(90);
  });

  it("desconto maior que a conta não devolve dinheiro da gaveta", () => {
    expect(totalAPagar(c({ desconto: 500 }))).toBe(0);
  });

  it("desconto negativo é ignorado em vez de aumentar a conta", () => {
    expect(totalAPagar(c({ desconto: -50 }))).toBe(100);
  });
});

describe("o que vai para a venda", () => {
  it("a taxa vira LINHA, sem produtoId, para aparecer no cupom e não mexer no estoque", () => {
    const c = comanda({
      taxaServico: 10,
      itens: [item({ produtoId: "p1", precoUnit: 100, quantidade: 1 })],
    });
    const linhas = itensParaVenda(c);
    expect(linhas).toHaveLength(2);
    const taxa = linhas[1];
    expect(taxa.descricao).toContain("Taxa de servico");
    expect(taxa.precoUnit).toBe(10);
    // Sem produtoId a gorjeta não passa pelo estoque nem inventa custo.
    expect(taxa.produtoId).toBeUndefined();
    expect(taxa.custoUnit).toBe(0);
  });

  it("item cancelado não vai para a venda", () => {
    const c = comanda({ itens: [item(), item({ cancelado: true })] });
    expect(itensParaVenda(c)).toHaveLength(1);
  });

  it("os campos que só a cozinha usa não sobem para a venda", () => {
    // `preparo`, `pedidoEm` e o id do item são da comanda. Levá-los junto
    // encheria o jsonb da venda de coisa que ninguém lê ali.
    const linha = itensParaVenda(comanda({ itens: [item()] }))[0] as unknown as Record<string, unknown>;
    for (const campo of ["id", "preparo", "pedidoEm", "prontoEm", "cancelado"]) {
      expect(linha[campo], `${campo} não devia ir para a venda`).toBeUndefined();
    }
  });
});
