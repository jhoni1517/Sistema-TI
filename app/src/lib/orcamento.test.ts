import { describe, it, expect } from "vitest";
import {
  opcaoDaPeca,
  nomesDasOpcoes,
  temOpcoes,
  opcaoAtual,
  escolhaConfirmada,
  itensInclusos,
  pecasDaOpcao,
  pecasEfetivas,
  comOpcao,
  proximoNomeDeOpcao,
  renomearOpcao,
  removerOpcao,
  juntarEmUmOrcamento,
} from "./orcamento";
import {
  totalPecas,
  custoPecas,
  totalOS,
  totalComOpcao,
  custoComOpcao,
  faixaOS,
} from "./calc";
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

/**
 * O caso real: dois caminhos para o mesmo PC, e o caro leva DUAS peças.
 * Era isto que não cabia no modelo antigo de "escolher entre duas peças".
 */
const doisCaminhos = () =>
  os([
    peca({ descricao: "Pasta térmica", precoUnit: 30, custoUnit: 10 }),
    peca({ descricao: "Fonte 500W", precoUnit: 399, custoUnit: 250, opcao: "Opção 1" }),
    peca({ descricao: "SSD 1TB", precoUnit: 500, custoUnit: 350, opcao: "Opção 1" }),
    peca({ descricao: "Fonte 200W", precoUnit: 149.9, custoUnit: 90, opcao: "Opção 2" }),
  ]);

describe("mais de um orçamento na mesma OS", () => {
  it("uma opção pode ter várias peças, e as outras não somam junto", () => {
    const o = doisCaminhos();
    // Opção 1: pasta 30 + fonte 399 + SSD 500 + mão de obra 50
    expect(totalComOpcao(o, "Opção 1")).toBe(979);
    // Opção 2: pasta 30 + fonte 149,90 + mão de obra 50
    expect(totalComOpcao(o, "Opção 2")).toBe(229.9);
    // O número que nunca pode existir é a soma de tudo: 1128,90
    expect(totalComOpcao(o, "Opção 1")).not.toBe(1128.9);
    expect(totalComOpcao(o, "Opção 2")).not.toBe(1128.9);
  });

  it("sem decisão do cliente vale a primeira opção, que é a sugestão da loja", () => {
    const o = doisCaminhos();
    expect(opcaoAtual(o)).toBe("Opção 1");
    expect(totalOS(o)).toBe(979);
    expect(escolhaConfirmada(o)).toBe(false);
  });

  it("a escolha do cliente manda no total, no custo e no estoque", () => {
    const o = comOpcao(doisCaminhos(), "Opção 2");
    expect(totalOS(o)).toBe(229.9);
    expect(custoPecas(o)).toBe(100); // pasta 10 + fonte 90
    expect(pecasEfetivas(o).map((p) => p.descricao)).toEqual([
      "Pasta térmica",
      "Fonte 200W",
    ]);
    expect(escolhaConfirmada(o)).toBe(true);
  });

  it("item comum entra em qualquer cenário", () => {
    const o = doisCaminhos();
    expect(itensInclusos(o).map((p) => p.descricao)).toEqual(["Pasta térmica"]);
    for (const nome of nomesDasOpcoes(o)) {
      expect(pecasEfetivas(comOpcao(o, nome)).map((p) => p.descricao)).toContain(
        "Pasta térmica"
      );
    }
  });

  it("custo por opção acompanha a escolha, senão o lucro mente", () => {
    const o = doisCaminhos();
    expect(custoComOpcao(o, "Opção 1")).toBe(610); // 10 + 250 + 350
    expect(custoComOpcao(o, "Opção 2")).toBe(100); // 10 + 90
  });

  it("escolha que não existe na OS não sequestra o total", () => {
    // Nome errado (opção renomeada em outro aparelho, digitação torta) cai na
    // sugestão da loja em vez de zerar as peças e mostrar um valor irreal.
    const o = comOpcao(doisCaminhos(), "Opção 9");
    expect(opcaoAtual(o)).toBe("Opção 1");
    expect(totalOS(o)).toBe(979);
    expect(escolhaConfirmada(o)).toBe(false);
  });

  it("OS sem opção nenhuma continua contando como sempre contou", () => {
    const o = os([peca({ descricao: "Tela", precoUnit: 300, quantidade: 2, custoUnit: 200 })]);
    expect(temOpcoes(o)).toBe(false);
    expect(totalPecas(o)).toBe(600);
    expect(custoPecas(o)).toBe(400);
    expect(escolhaConfirmada(o)).toBe(true);
    expect(faixaOS(o).definido).toBe(true);
  });

  it("uma opção só não é escolha: ela conta sozinha", () => {
    const o = os([peca({ descricao: "Fonte 500W", precoUnit: 399, opcao: "Opção 1" })]);
    expect(temOpcoes(o)).toBe(false);
    expect(totalPecas(o)).toBe(399);
    expect(escolhaConfirmada(o)).toBe(true);
  });

  it("espaço em branco não cria opção separada", () => {
    const o = os([
      peca({ descricao: "A", precoUnit: 10, opcao: " Opção 1 " }),
      peca({ descricao: "B", precoUnit: 20, opcao: "Opção 1" }),
    ]);
    expect(nomesDasOpcoes(o)).toEqual(["Opção 1"]);
    expect(opcaoDaPeca(o.pecas[0])).toBe("Opção 1");
    expect(totalPecas(o)).toBe(30);
  });

  it("opção em branco é peça comum, não opção sem nome", () => {
    const o = os([peca({ descricao: "Cabo", precoUnit: 25, opcao: "   " })]);
    expect(nomesDasOpcoes(o)).toEqual([]);
    expect(totalPecas(o)).toBe(25);
  });
});

describe("mexer nas opções", () => {
  it("renomear leva as peças e a escolha junto", () => {
    // Sem levar a escolha, renomear fazia a OS cair na primeira opção: o
    // cliente aprovava uma coisa e a loja montava outra.
    const o = renomearOpcao(comOpcao(doisCaminhos(), "Opção 2"), "Opção 2", "Essencial");
    expect(nomesDasOpcoes(o)).toEqual(["Opção 1", "Essencial"]);
    expect(opcaoAtual(o)).toBe("Essencial");
    expect(totalOS(o)).toBe(229.9);
    expect(pecasDaOpcao(o, "Essencial")).toHaveLength(1);
  });

  it("apagar uma opção leva as peças dela e solta a escolha", () => {
    const o = removerOpcao(comOpcao(doisCaminhos(), "Opção 2"), "Opção 2");
    expect(nomesDasOpcoes(o)).toEqual(["Opção 1"]);
    expect(o.opcaoEscolhida).toBeUndefined();
    expect(totalOS(o)).toBe(979);
  });

  it("voltar para orçamento único soma tudo, sem apagar peça digitada", () => {
    const o = juntarEmUmOrcamento(doisCaminhos());
    expect(nomesDasOpcoes(o)).toEqual([]);
    expect(o.pecas).toHaveLength(4);
    expect(totalPecas(o)).toBe(1078.9);
  });

  it("o nome sugerido nunca repete um que já existe", () => {
    expect(proximoNomeDeOpcao(os([]))).toBe("Opção 1");
    expect(proximoNomeDeOpcao(doisCaminhos())).toBe("Opção 3");
    const comNomeLivre = os([peca({ descricao: "x", opcao: "Completo" })]);
    expect(proximoNomeDeOpcao(comNomeLivre)).toBe("Opção 1");
  });
});

describe("faixa de preço", () => {
  it("vai do orçamento mais barato ao mais caro", () => {
    const f = faixaOS(doisCaminhos());
    expect(f.minimo).toBe(229.9);
    expect(f.maximo).toBe(979);
    expect(f.definido).toBe(false);
  });

  it("depois da resposta do cliente a faixa está definida", () => {
    expect(faixaOS(comOpcao(doisCaminhos(), "Opção 2")).definido).toBe(true);
  });

  it("desconto entra na faixa igual entra no total", () => {
    const f = faixaOS(os(doisCaminhos().pecas, { desconto: 100 }));
    expect(f.minimo).toBe(129.9);
    expect(f.maximo).toBe(879);
  });

  it("simular uma opção não altera a OS que está na tela", () => {
    const o = doisCaminhos();
    totalComOpcao(o, "Opção 2");
    expect(o.opcaoEscolhida).toBeUndefined();
    expect(totalOS(o)).toBe(979);
  });
});
