import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deltasApos, saldosApos, grama } from "./estoque";
import type { Produto } from "./types";

/**
 * DOIS APARELHOS VENDENDO AO MESMO TEMPO.
 *
 * O CLAUDE.md listava isto como pendente com todas as letras. A baixa era
 * ler-modificar-gravar no navegador: a tela lê 5, subtrai 1, grava 4. Com
 * dois caixas na mesma peça, os dois leem 5, os dois gravam 4, e uma das
 * baixas some.
 *
 * O estrago é invisível: o estoque fica MAIOR que a prateleira, e ninguém
 * procura por mercadoria a mais. Só aparece na contagem, meses depois.
 *
 * Mandando o DELTA, quem soma é o banco, num UPDATE que trava a linha.
 */

const p = (id: string, q: number, extra: Partial<Produto> = {}): Produto =>
  ({ id, nome: id, quantidade: q, custo: 10, preco: 20, ...extra }) as Produto;

describe("deltas em vez de saldos", () => {
  const produtos = [p("a", 5), p("b", 10)];

  it("baixa vem negativa; retorno vem positivo", () => {
    const itens = [{ produtoId: "a", quantidade: 2 }];
    expect(deltasApos(itens, produtos, "baixa")).toEqual([{ produto: produtos[0], delta: -2 }]);
    expect(deltasApos(itens, produtos, "retorno")).toEqual([{ produto: produtos[0], delta: 2 }]);
  });

  /**
   * O mesmo produto em duas linhas desce as DUAS.
   *
   * É o bug que `saldosApos` já resolvia e que o delta não pode reintroduzir:
   * vender duas fontes e descer uma, com o carrinho mostrando as duas linhas
   * certas.
   */
  it("junta as linhas do mesmo produto numa só", () => {
    const d = deltasApos(
      [{ produtoId: "a", quantidade: 2 }, { produtoId: "a", quantidade: 3 }],
      produtos
    );
    expect(d).toHaveLength(1);
    expect(d[0].delta).toBe(-5);
  });

  it("serviço fica de fora: não tem estoque", () => {
    const servicos = [p("s", 0, { servico: true })];
    expect(deltasApos([{ produtoId: "s", quantidade: 3 }], servicos)).toEqual([]);
  });

  it("produto fora do cadastro não vira gravação fantasma", () => {
    expect(deltasApos([{ produtoId: "fantasma", quantidade: 1 }], produtos)).toEqual([]);
  });

  /** O banco recusa quantidade zero de propósito: não é movimento. */
  it("delta zero não é enviado", () => {
    expect(deltasApos([{ produtoId: "a", quantidade: 0 }], produtos)).toEqual([]);
  });

  it("peso fracionário sobrevive, arredondado em grama", () => {
    const d = deltasApos([{ produtoId: "a", quantidade: 0.352 }], produtos);
    expect(d[0].delta).toBe(-0.352);
  });

  /**
   * DELTA E SALDO TÊM QUE CONCORDAR.
   *
   * Se divergissem, a mesma venda daria um resultado no caminho novo e outro
   * no antigo (o de reserva, para quem ainda não rodou a migração) — e a
   * diferença só apareceria na contagem.
   */
  it("aplicar o delta dá o mesmo que o saldo calculado", () => {
    const itens = [
      { produtoId: "a", quantidade: 2 },
      { produtoId: "b", quantidade: 1.5 },
      { produtoId: "a", quantidade: 1 },
    ];
    const saldos = saldosApos(itens, produtos, "baixa");
    const deltas = deltasApos(itens, produtos, "baixa");
    for (const s of saldos) {
      const d = deltas.find((x) => x.produto.id === s.produto.id)!;
      expect(grama(Number(s.produto.quantidade) + d.delta)).toBe(s.quantidade);
    }
  });

  /**
   * NEGATIVO É INFORMAÇÃO, NÃO ERRO.
   *
   * O delta não trava quando falta: o cliente ESTÁ com a peça na mão, e
   * bloquear só faz o atendente registrar por fora.
   */
  it("vender mais do que tem gera delta que leva a negativo", () => {
    const d = deltasApos([{ produtoId: "a", quantidade: 9 }], produtos);
    expect(d[0].delta).toBe(-9);
    expect(grama(5 + d[0].delta)).toBe(-4);
  });
});

/**
 * A função do banco é o ponto inteiro. Lê o SQL do disco em vez de recopiar:
 * cópia dentro de teste envelhece igual e as duas passam a mentir juntas.
 */
describe("a função do banco", () => {
  const bruto = readFileSync(
    resolve(__dirname, "..", "..", "supabase-migracao-estoque-atomico.sql"),
    "utf8"
  );
  /*
   * Sem os comentários.
   *
   * A primeira versão varria o arquivo inteiro e reprovou por causa do
   * próprio comentário que explica por que NÃO bloquear o negativo — a
   * frase "a versão óbvia teria `and quantidade >= p_qtd`" casava com a
   * busca. Comentário não é código, e o teste tem que olhar só o que roda.
   */
  const sql = bruto.replace(/--[^\n]*/g, "");

  it("soma no próprio UPDATE, sem ler antes", () => {
    expect(sql).toMatch(/set quantidade = round\(coalesce\(quantidade, 0\) \+ p_qtd/);
  });

  /**
   * NÃO pode ter `and quantidade >= p_qtd`. A versão óbvia bloquearia o
   * negativo, e esta base já pagou por isso em quatro telas.
   */
  it("NÃO bloqueia estoque negativo", () => {
    expect(sql).not.toMatch(/and\s+quantidade\s*>=/i);
  });

  /** DEFINER aqui abriria o buraco que as políticas de loja fecham. */
  it("não é security definer", () => {
    expect(sql).not.toMatch(/security\s+definer/i);
  });

  it("serviço não muda de saldo", () => {
    expect(sql).toMatch(/if v_servico then/);
  });

  it("é repetível", () => {
    expect(sql).toMatch(/create or replace function mover_estoque/);
  });
});

/**
 * A tela usa o delta, e o store tem a reserva para quem não rodou a
 * migração — sem ela, quem não rodou não fecharia mais nenhuma venda, e
 * loja parada é pior que uma baixa perdida de vez em quando.
 */
describe("o caminho da venda", () => {
  const pdv = readFileSync(resolve(__dirname, "..", "pages", "PDV.tsx"), "utf8");
  const store = readFileSync(resolve(__dirname, "..", "store", "AppStore.tsx"), "utf8");

  it("o PDV manda delta, não saldo", () => {
    expect(pdv).toContain("deltasApos(itens, produtos)");
    expect(pdv).toContain("moverEstoque(produto, delta)");
  });

  it("o store chama a função do banco", () => {
    expect(store).toMatch(/rpc\("mover_estoque"/);
  });

  it("e tem caminho de reserva se a função não existir", () => {
    expect(store).toMatch(/semFuncao/);
    expect(store).toMatch(/db\.produtos\.save/);
  });

  /** Dinheiro primeiro: o estoque desce depois do movimento e da venda. */
  it("o estoque desce depois do dinheiro", () => {
    expect(pdv.indexOf("saveMovimento(")).toBeLessThan(pdv.indexOf("moverEstoque(produto, delta)"));
  });
});
