import { describe, it, expect } from "vitest";
import {
  ehEntrega,
  soMesas,
  soEntregas,
  situacaoEntrega,
  minutosNaRua,
  taxaDaEntrega,
  trocoDaEntrega,
  problemaParaSair,
  totalDaEntrega,
  entregasAbertas,
} from "./entrega";
import type { Comanda, ItemComanda } from "./types";

const item = (i: Partial<ItemComanda> = {}): ItemComanda =>
  ({
    id: Math.random().toString(36).slice(2),
    descricao: "Pizza Calabresa",
    quantidade: 1,
    precoUnit: 60,
    custoUnit: 15,
    pedidoEm: "2026-08-08T19:00:00.000Z",
    preparo: "pronto",
    ...i,
  }) as ItemComanda;

const pedido = (c: Partial<Comanda> = {}): Comanda =>
  ({
    id: "e1",
    numero: 1,
    mesa: "",
    tipo: "entrega",
    endereco: "Rua das Flores, 123 - Centro",
    telefone: "41999999999",
    itens: [item()],
    status: "aberta",
    abertaEm: "2026-08-08T19:00:00.000Z",
    ...c,
  }) as Comanda;

describe("mesa e entrega moram juntas mas não se misturam", () => {
  it("vazio é mesa: é assim que voltam as comandas antigas", () => {
    expect(ehEntrega({ mesa: "5" } as Comanda)).toBe(false);
    expect(ehEntrega({ tipo: "mesa" } as Comanda)).toBe(false);
    expect(ehEntrega(pedido())).toBe(true);
  });

  it("cada tela vê só o que é dela", () => {
    const lista = [pedido({ id: "a" }), { id: "b", mesa: "5" } as Comanda];
    expect(soEntregas(lista).map((c) => c.id)).toEqual(["a"]);
    expect(soMesas(lista).map((c) => c.id)).toEqual(["b"]);
  });
});

/**
 * A situação sai dos ITENS e da hora da saída, nunca de um campo que alguém
 * precisa lembrar de mexer. Status digitado à mão fica desatualizado — e um
 * pedido "na cozinha" que já está na rua faz a casa ligar para o entregador
 * perguntando o que ele já respondeu.
 */
describe("em que pé está o pedido", () => {
  it("item ainda no fogo é 'na cozinha'", () => {
    expect(situacaoEntrega(pedido({ itens: [item({ preparo: "preparando" })] }))).toBe(
      "montando"
    );
    expect(situacaoEntrega(pedido({ itens: [item({ preparo: "pendente" })] }))).toBe("montando");
  });

  it("tudo pronto e a moto não saiu é 'pronto para sair'", () => {
    expect(situacaoEntrega(pedido())).toBe("pronto");
  });

  it("item cancelado não segura o pedido", () => {
    const c = pedido({ itens: [item(), item({ preparo: "pendente", cancelado: true })] });
    expect(situacaoEntrega(c)).toBe("pronto");
  });

  it("pedido vazio não é 'pronto': ninguém despacha bolsa vazia", () => {
    expect(situacaoEntrega(pedido({ itens: [] }))).toBe("montando");
  });

  it("com hora de saída, está na rua — mesmo com item pendente", () => {
    // Se já saiu, saiu. A verdade é a moto, não a cozinha.
    const c = pedido({ saiuEm: "2026-08-08T20:00:00.000Z", itens: [item({ preparo: "pendente" })] });
    expect(situacaoEntrega(c)).toBe("na_rua");
  });

  it("fechada é entregue", () => {
    expect(situacaoEntrega(pedido({ status: "fechada" }))).toBe("entregue");
  });
});

describe("o relógio da rua", () => {
  it("conta a partir da saída", () => {
    const c = pedido({ saiuEm: "2026-08-08T20:00:00.000Z" });
    expect(minutosNaRua(c, new Date("2026-08-08T20:37:00.000Z"))).toBe(37);
  });

  it("sem saída não tem relógio", () => {
    expect(minutosNaRua(pedido())).toBe(0);
    expect(minutosNaRua(pedido({ saiuEm: "sei lá" }))).toBe(0);
  });
});

describe("a conta da entrega", () => {
  it("soma a taxa ao consumo", () => {
    expect(totalDaEntrega(pedido({ taxaEntrega: 8 }))).toBe(68);
  });

  it("taxa negativa é ignorada em vez de virar desconto disfarçado", () => {
    expect(taxaDaEntrega(pedido({ taxaEntrega: -10 }))).toBe(0);
    expect(totalDaEntrega(pedido({ taxaEntrega: -10 }))).toBe(60);
  });

  it("desconto abate, e nunca deixa a conta negativa", () => {
    expect(totalDaEntrega(pedido({ taxaEntrega: 8, desconto: 20 }))).toBe(48);
    expect(totalDaEntrega(pedido({ desconto: 500 }))).toBe(0);
  });

  it("a taxa de SERVIÇO não entra: gorjeta de garçom é do salão", () => {
    // Cobrar os 10% de quem pediu por telefone aparece na reclamação, não
    // no fechamento.
    expect(totalDaEntrega(pedido({ taxaServico: 10 }))).toBe(60);
  });
});

/**
 * "Tem troco para 50?" é a pergunta que decide se o pedido dá certo. Sem
 * ela o entregador sai com a bolsa cheia e sem trocado, e volta com o
 * pedido ou com a conta errada.
 */
describe("o troco que a moto tem que levar", () => {
  it("é a diferença entre a nota e a conta", () => {
    expect(trocoDaEntrega(68, 100)).toBe(32);
  });

  it("sem informar, não tem troco a levar", () => {
    expect(trocoDaEntrega(68)).toBe(0);
    expect(trocoDaEntrega(68, 0)).toBe(0);
  });

  it("nota menor que a conta não vira troco negativo", () => {
    // "Tenho R$ 20" numa conta de R$ 60 não é troco, é falta — e essa
    // conversa acontece antes de a moto sair.
    expect(trocoDaEntrega(60, 20)).toBe(0);
  });
});

describe("o que impede a moto de sair", () => {
  it("sem endereço não sai", () => {
    expect(problemaParaSair(pedido({ endereco: "" }))).toContain("endereço");
  });

  it("sem telefone não sai, e o texto diz por quê", () => {
    // É para ele que o entregador liga quando não acha o portão.
    const p = problemaParaSair(pedido({ telefone: "  " }));
    expect(p).toContain("telefone");
    expect(p).toContain("portão");
  });

  it("bolsa vazia não sai", () => {
    expect(problemaParaSair(pedido({ itens: [] }))).toContain("sem itens");
  });

  it("item ainda na cozinha segura a moto", () => {
    const p = problemaParaSair(pedido({ itens: [item({ preparo: "preparando" })] }));
    expect(p).toContain("cozinha");
  });

  it("com tudo em ordem, pode ir", () => {
    expect(problemaParaSair(pedido())).toBe("");
  });
});

describe("a fila da moto", () => {
  it("quem está na rua vem primeiro, e a mesa não entra", () => {
    // Na rua tem cliente esperando na porta e prazo correndo; o que a
    // cozinha ainda monta pode esperar na tela.
    const lista = [
      pedido({ id: "montando", itens: [item({ preparo: "pendente" })] }),
      pedido({ id: "pronto" }),
      pedido({ id: "narua", saiuEm: "2026-08-08T20:00:00.000Z" }),
      pedido({ id: "fechado", status: "fechada" }),
      { id: "mesa", mesa: "5", status: "aberta", itens: [] } as unknown as Comanda,
    ];
    expect(entregasAbertas(lista).map((c) => c.id)).toEqual(["narua", "pronto", "montando"]);
  });
});
