import { describe, it, expect } from "vitest";
import { proximoNumero, problemaParaNumerar } from "./numeracao";

describe("o próximo número", () => {
  it("lista vazia começa em 1", () => {
    expect(proximoNumero([])).toBe(1);
  });

  it("pega o maior, não o último", () => {
    // A lista não vem ordenada, e confiar na ordem é como o número repete.
    expect(proximoNumero([{ numero: 7 }, { numero: 12 }, { numero: 3 }])).toBe(13);
  });

  it("registro sem número não atrapalha", () => {
    expect(proximoNumero([{ numero: 5 }, {}, { numero: undefined }])).toBe(6);
  });

  it("número inválido conta como zero, e não como NaN", () => {
    // NaN em Math.max contamina tudo e o próximo número vira NaN, que grava
    // no banco como nulo e some do histórico.
    expect(proximoNumero([{ numero: NaN }, { numero: 4 }])).toBe(5);
  });
});

describe("numerar em cima de dado que não carregou", () => {
  /**
   * A leitura é tolerante a falha parcial de propósito — uma tabela com
   * problema não pode zerar a tela. Mas com a lista vazia por ERRO, o maior
   * número é zero e o próximo nasce 1, colidindo com o primeiro registro da
   * história da loja.
   *
   * Na OS é pior que bagunça: o rastreio público procura PELO NÚMERO. Duas
   * ordens OS00001 e o cliente abre o link e vê o conserto de outra pessoa,
   * com nome e valor.
   */
  it("com a fonte quebrada, recusa e diz por quê", () => {
    const r = problemaParaNumerar(["vendas"], "vendas", "uma venda");
    expect(r).toContain("não carregou");
    expect(r).toContain("Atualize a página");
    // Precisa dizer que nada foi perdido: senão a pessoa refaz a venda toda
    // achando que sumiu.
    expect(r).toContain("Nada foi perdido");
  });

  it("com a fonte inteira, libera", () => {
    expect(problemaParaNumerar([], "vendas", "uma venda")).toBe("");
  });

  it("falha em OUTRA fonte não trava esta", () => {
    // Agenda com problema não pode impedir a loja de vender.
    expect(problemaParaNumerar(["agenda"], "vendas", "uma venda")).toBe("");
  });

  it("a ordem de serviço tem o mesmo cuidado", () => {
    const r = problemaParaNumerar(["ordens"], "ordens", "uma ordem de serviço");
    expect(r).toContain("não carregou");
  });
});
