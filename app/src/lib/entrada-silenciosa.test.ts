import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { avisoDeEstoqueQueSubiu } from "./estoque";
import { carimboDoLancamento, problemaNaDataDoLancamento } from "./caixa";
import type { Produto } from "./types";

/**
 * O relato: "comprei uma fonte no dia 04, entrou no estoque, mas não deu
 * baixa no dinheiro do caixa."
 *
 * Duas coisas separadas causaram isso, e as duas viraram teste.
 */

const p = (q: number, extra: Partial<Produto> = {}): Produto =>
  ({ id: "f1", nome: "Fonte 500W", quantidade: q, custo: 120, preco: 200, ...extra }) as Produto;

describe("estoque que sobe no cadastro tem que dizer o que vai acontecer", () => {
  /*
   * O recado já foi um `confirm()` bloqueante na hora de salvar, e virou
   * texto ao lado do campo de quantidade. O que ele PRECISA dizer não mudou;
   * mudou o tamanho e a ordem, porque ao lado do campo o nome do produto é
   * redundante (a pessoa está olhando para ele) e o que importa é a
   * consequência de salvar assim.
   */
  it("subiu: diz o que acontece salvando assim, e onde a compra deve ir", () => {
    const a = avisoDeEstoqueQueSubiu(p(2), p(3));
    expect(a).toContain("Sobe 1");
    // A consequência vem PRIMEIRO: é a frase que decide para quem só lê uma.
    expect(a).toContain("nada sai do caixa");
    expect(a).toContain("Entrada de nota");
    expect(a).toContain("custo médio");
  });

  it("produto novo com estoque também avisa — mercadoria não nasce do nada", () => {
    expect(avisoDeEstoqueQueSubiu(undefined, p(1))).toContain("Nasce com 1");
  });

  it("cabe em uma linha: recado ao lado do campo não é roteiro de diálogo", () => {
    /*
     * O texto antigo tinha três parágrafos porque precisava explicar dois
     * botões. Sem os botões, texto longo ao lado do campo vira parede que
     * ninguém lê — e o recado deixa de proteger do mesmo jeito que a
     * pergunta automática deixava.
     */
    const a = avisoDeEstoqueQueSubiu(p(2), p(3));
    expect(a.length, `recado com ${a.length} caracteres`).toBeLessThan(220);
    expect(a).not.toContain("\n");
  });

  /**
   * Diminuir não pergunta nada: quebra e perda não tiram dinheiro do caixa,
   * então não há decisão de dinheiro a tomar. Perguntar aqui seria alarme
   * sem motivo, e alarme sem motivo é alarme que a pessoa aprende a ignorar.
   */
  it("baixou: não pergunta", () => {
    expect(avisoDeEstoqueQueSubiu(p(5), p(2))).toBe("");
  });

  it("não mexeu na quantidade: não pergunta", () => {
    expect(avisoDeEstoqueQueSubiu(p(5), p(5, { preco: 999 }))).toBe("");
  });

  it("serviço não tem estoque, então nunca pergunta", () => {
    expect(avisoDeEstoqueQueSubiu(p(0, { servico: true }), p(50, { servico: true }))).toBe("");
  });

  it("mostra o que a compra teria custado, quando há custo", () => {
    expect(avisoDeEstoqueQueSubiu(p(0), p(2))).toContain("2 x 120.00");
  });
});

describe("a data do lançamento manual", () => {
  const agora = new Date("2026-08-10T21:30:00.000Z");

  it("hoje guarda a HORA — é ela que ordena os movimentos do dia", () => {
    expect(carimboDoLancamento("2026-08-10", agora)).toBe(agora.toISOString());
  });

  /**
   * Meio-dia UTC, e não meia-noite: `soData` corta os dez primeiros
   * caracteres, e madrugada com fuso negativo escorrega o lançamento para o
   * dia anterior. É o mesmo erro de data que já custou uma tarde nesta base.
   */
  it("dia passado fica no meio-dia, longe da virada", () => {
    expect(carimboDoLancamento("2026-08-04", agora)).toBe("2026-08-04T12:00:00.000Z");
  });

  it("o dia gravado é exatamente o escolhido", () => {
    for (const d of ["2026-08-04", "2026-01-01", "2025-12-31", "2024-02-29"]) {
      expect(carimboDoLancamento(d, agora).slice(0, 10)).toBe(d);
    }
  });

  it("data estragada não inventa dia: cai em agora", () => {
    /* "2026-13-01" e "2026-02-30" passam por qualquer regex de AAAA-MM-DD
       e não existem. A primeira versão desta função devolveu
       "2026-13-01T12:00:00.000Z" — este teste é que pegou. */
    for (const ruim of ["", "abacaxi", "04/08/2026", "2026-13-01", "2026-02-30", "0000-00-00"]) {
      expect(carimboDoLancamento(ruim, agora)).toBe(agora.toISOString());
    }
  });

  it("futuro é recusado, com o motivo", () => {
    expect(problemaNaDataDoLancamento("2026-08-11", agora)).toContain("futuro");
    expect(problemaNaDataDoLancamento("2026-08-10", agora)).toBe("");
    expect(problemaNaDataDoLancamento("2026-08-04", agora)).toBe("");
  });

  it("data inválida é recusada", () => {
    expect(problemaNaDataDoLancamento("", agora)).toContain("válida");
  });
});

describe("o recado de estoque não volta a ser diálogo do navegador", () => {
  const tela = readFileSync(
    join(__dirname, "..", "pages", "Estoque.tsx"),
    "utf8"
  );

  it("salvar produto não abre `confirm()` por causa da quantidade", () => {
    /*
     * Relatado do balcão: "tá muito chata, tudo que vou cadastrar aparece
     * isso, e não consigo usar mais nada no navegador por causa dela".
     *
     * As duas queixas são a mesma causa. `confirm()` é diálogo NATIVO: ele
     * congela a aba inteira, não só o sistema — qualquer outra coisa aberta
     * na mesma janela fica presa até alguém responder. E ele disparava em
     * trabalho ROTINEIRO, não em ação destrutiva.
     *
     * Os outros `confirm()` da tela continuam de pé de propósito: apagar
     * produto e apagar categoria são destrutivos, acontecem raramente e a
     * pergunta ali é esperada. O que não pode voltar é ele no caminho de
     * gravar um cadastro.
     */
    const salvar = tela.slice(tela.indexOf("const salvar"), tela.indexOf("return ("));
    expect(salvar).not.toMatch(/confirm\([^)]*aviEstoque/);
    // A CHAMADA, e não a menção: o comentário que explica a mudança cita o
    // nome da função de propósito, e não pode reprovar o próprio conserto.
    expect(salvar).not.toContain("avisoDeEstoqueQueSubiu(");
  });

  it("o recado continua aparecendo, ao lado do campo de quantidade", () => {
    // Tirar o diálogo não podia virar tirar a proteção: o texto tem que
    // continuar na tela, só que sem interromper ninguém.
    expect(tela).toContain("avisoDeEstoqueQueSubiu");
    expect(tela).toContain("Abrir Entrada de nota");
  });
});
