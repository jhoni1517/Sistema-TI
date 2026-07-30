import { describe, it, expect } from "vitest";
import {
  grupoDaPeca,
  gruposDeOpcao,
  pecasEfetivas,
  escolhasDoCliente,
  itensInclusos,
  opcoesPendentes,
  temEscolhaPendente,
  escolherOpcao,
  indicesEscolhidos,
} from "./orcamento";
import { totalPecas, custoPecas, totalOS, totalComOpcao, faixaOS } from "./calc";
import type { OrdemServico, PecaOS } from "./types";

const peca = (p: Partial<PecaOS>): PecaOS => ({
  descricao: "Peça",
  quantidade: 1,
  custoUnit: 0,
  precoUnit: 0,
  ...p,
});

const os = (pecas: PecaOS[], extra: Partial<OrdemServico> = {}): OrdemServico =>
  ({
    id: "1",
    numero: 5,
    clienteId: "c1",
    tipoAparelho: "PC",
    marca: "",
    modelo: "",
    defeitoRelatado: "Não liga",
    checklist: {},
    pecas,
    maoDeObra: 50,
    desconto: 0,
    status: "aguardando_aprovacao",
    garantiaDias: 90,
    historico: [],
    criadoEm: "2026-01-01T00:00:00.000Z",
    atualizadoEm: "2026-01-01T00:00:00.000Z",
    ...extra,
  }) as OrdemServico;

/** O caso que originou tudo isto: duas fontes para o mesmo PC */
const fontes = () =>
  os([
    peca({ descricao: "Fonte 500W", precoUnit: 399, custoUnit: 250, opcao: "Fonte" }),
    peca({ descricao: "Fonte 200W", precoUnit: 149.9, custoUnit: 90, opcao: "Fonte" }),
  ]);

describe("alternativas no orçamento", () => {
  it("duas alternativas nunca somam: era isso que cobrava as duas fontes", () => {
    const o = fontes();
    // Sem escolha, nenhuma das duas entra — não existe conta certa aqui.
    expect(totalPecas(o)).toBe(0);

    const escolhida = escolherOpcao(o, 0);
    expect(totalPecas(escolhida)).toBe(399);
    expect(totalOS(escolhida)).toBe(449);

    const barata = escolherOpcao(o, 1);
    expect(totalPecas(barata)).toBe(149.9);
    // O ponto: 399 + 149,90 = 548,90 é justamente o número que nunca pode
    // aparecer, porque o cliente leva UMA fonte.
    expect(totalPecas(barata)).not.toBe(548.9);
  });

  it("peça sem opção entra sempre, escolha o cliente o que escolher", () => {
    const o = os([
      peca({ descricao: "Pasta térmica", precoUnit: 30 }),
      peca({ descricao: "Fonte 500W", precoUnit: 399, opcao: "Fonte" }),
      peca({ descricao: "Fonte 200W", precoUnit: 149.9, opcao: "Fonte" }),
    ]);
    expect(totalPecas(escolherOpcao(o, 1))).toBe(429);
    expect(totalPecas(escolherOpcao(o, 2))).toBe(179.9);
  });

  it("o custo acompanha a escolha, senão o lucro mente", () => {
    expect(custoPecas(escolherOpcao(fontes(), 0))).toBe(250);
    expect(custoPecas(escolherOpcao(fontes(), 1))).toBe(90);
  });

  it("escolher uma desmarca a concorrente do mesmo grupo", () => {
    const o = escolherOpcao(escolherOpcao(fontes(), 0), 1);
    expect(o.pecas[0].escolhida).toBe(false);
    expect(o.pecas[1].escolhida).toBe(true);
    expect(indicesEscolhidos(o)).toEqual([1]);
  });

  it("grupos diferentes são escolhas independentes", () => {
    const o = os([
      peca({ descricao: "Fonte 500W", precoUnit: 400, opcao: "Fonte" }),
      peca({ descricao: "Fonte 200W", precoUnit: 150, opcao: "Fonte" }),
      peca({ descricao: "SSD 1TB", precoUnit: 500, opcao: "Disco" }),
      peca({ descricao: "SSD 240GB", precoUnit: 200, opcao: "Disco" }),
    ]);
    const escolhido = escolherOpcao(escolherOpcao(o, 1), 2);
    expect(totalPecas(escolhido)).toBe(650);
    expect(indicesEscolhidos(escolhido)).toEqual([1, 2]);
    expect(escolhasDoCliente(escolhido)).toHaveLength(2);
  });

  it("dado estragado com duas marcadas vale a primeira, nunca a soma", () => {
    // Dois aparelhos editando a mesma OS conseguem gravar isto. Somar as
    // duas seria repetir exatamente o bug que este arquivo resolve.
    const o = os([
      peca({ descricao: "Fonte 500W", precoUnit: 399, opcao: "Fonte", escolhida: true }),
      peca({ descricao: "Fonte 200W", precoUnit: 149.9, opcao: "Fonte", escolhida: true }),
    ]);
    expect(totalPecas(o)).toBe(399);
    expect(pecasEfetivas(o)).toHaveLength(1);
  });

  it("espaço em branco no nome do grupo não cria grupo separado", () => {
    const o = os([
      peca({ descricao: "A", precoUnit: 10, opcao: " Fonte " }),
      peca({ descricao: "B", precoUnit: 20, opcao: "Fonte" }),
    ]);
    expect(gruposDeOpcao(o)).toHaveLength(1);
    expect(grupoDaPeca(o.pecas[0])).toBe("Fonte");
  });

  it("opção vazia é peça normal, não grupo sem nome", () => {
    const o = os([peca({ descricao: "Cabo", precoUnit: 25, opcao: "   " })]);
    expect(gruposDeOpcao(o)).toHaveLength(0);
    expect(totalPecas(o)).toBe(25);
  });

  it("OS sem alternativa nenhuma continua contando como sempre contou", () => {
    const o = os([
      peca({ descricao: "Tela", precoUnit: 300, quantidade: 2, custoUnit: 200 }),
    ]);
    expect(totalPecas(o)).toBe(600);
    expect(custoPecas(o)).toBe(400);
    expect(temEscolhaPendente(o)).toBe(false);
    expect(faixaOS(o).definido).toBe(true);
  });

  it("grupo de um item só não é escolha do cliente, é item", () => {
    // Pedir para escolher entre uma coisa e nada não ajuda ninguém a decidir.
    const o = os([peca({ descricao: "Fonte 500W", precoUnit: 399, opcao: "Fonte", escolhida: true })]);
    expect(escolhasDoCliente(o)).toHaveLength(0);
    expect(itensInclusos(o)).toHaveLength(1);
    expect(totalPecas(o)).toBe(399);
  });
});

describe("faixa de preço enquanto ninguém escolheu", () => {
  it("mostra o piso e o teto reais, não um total menor que os dois", () => {
    const f = faixaOS(fontes());
    expect(f.definido).toBe(false);
    expect(f.minimo).toBe(199.9); // 149,90 + 50 de mão de obra
    expect(f.maximo).toBe(449); // 399 + 50
  });

  it("com a escolha feita, piso e teto viram o total", () => {
    const f = faixaOS(escolherOpcao(fontes(), 0));
    expect(f.definido).toBe(true);
    expect(f.minimo).toBe(449);
    expect(f.maximo).toBe(449);
  });

  it("soma o piso e o teto de cada grupo pendente", () => {
    const o = os([
      peca({ descricao: "Fonte 500W", precoUnit: 400, opcao: "Fonte" }),
      peca({ descricao: "Fonte 200W", precoUnit: 150, opcao: "Fonte" }),
      peca({ descricao: "SSD 1TB", precoUnit: 500, opcao: "Disco" }),
      peca({ descricao: "SSD 240GB", precoUnit: 200, opcao: "Disco" }),
    ]);
    const f = faixaOS(o);
    expect(f.minimo).toBe(400); // 150 + 200 + 50
    expect(f.maximo).toBe(950); // 400 + 500 + 50
  });

  it("desconto entra na faixa igual entra no total", () => {
    const f = faixaOS(os(fontes().pecas, { desconto: 100 }));
    expect(f.minimo).toBe(99.9);
    expect(f.maximo).toBe(349);
  });
});

describe("total por opção", () => {
  it("cada alternativa mostra quanto sai o serviço inteiro", () => {
    // É este o número em cima do qual o cliente decide — não o preço da peça
    // solta, que ele não tem como somar de cabeça com a mão de obra.
    const o = fontes();
    expect(totalComOpcao(o, o.pecas[0])).toBe(449);
    expect(totalComOpcao(o, o.pecas[1])).toBe(199.9);
  });

  it("simular uma opção não altera a OS que está na tela", () => {
    const o = fontes();
    totalComOpcao(o, o.pecas[0]);
    expect(o.pecas[0].escolhida).toBeUndefined();
    expect(totalPecas(o)).toBe(0);
  });
});

describe("trava antes de cobrar", () => {
  it("aponta o grupo que falta escolher", () => {
    const o = os([
      peca({ descricao: "Fonte 500W", precoUnit: 400, opcao: "Fonte" }),
      peca({ descricao: "Fonte 200W", precoUnit: 150, opcao: "Fonte" }),
      peca({ descricao: "SSD 1TB", precoUnit: 500, opcao: "Disco", escolhida: true }),
      peca({ descricao: "SSD 240GB", precoUnit: 200, opcao: "Disco" }),
    ]);
    expect(opcoesPendentes(o).map((g) => g.nome)).toEqual(["Fonte"]);
    expect(temEscolhaPendente(o)).toBe(true);
    expect(temEscolhaPendente(escolherOpcao(o, 0))).toBe(false);
  });

  it("só a escolhida baixa do estoque", () => {
    const efetivas = pecasEfetivas(escolherOpcao(fontes(), 1));
    expect(efetivas.map((p) => p.descricao)).toEqual(["Fonte 200W"]);
  });
});
