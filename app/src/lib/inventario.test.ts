import { describe, it, expect } from "vitest";
import { conferirInventario, ajustesDoInventario, descricaoDoAjuste } from "./inventario";
import type { Produto } from "./types";

const prod = (p: Partial<Produto>): Produto =>
  ({
    id: "p1",
    nome: "Produto",
    quantidade: 10,
    estoqueMinimo: 1,
    custo: 20,
    preco: 40,
    criadoEm: "2026-01-01",
    ...p,
  }) as Produto;

const produtos = [
  prod({ id: "a", nome: "Arroz", quantidade: 10, custo: 20 }),
  prod({ id: "b", nome: "Feijão", quantidade: 5, custo: 8 }),
  prod({ id: "s", nome: "Formatação", servico: true, quantidade: 0 }),
];

describe("contagem de estoque", () => {
  it("aponta o que não bateu, com a diferença em dinheiro", () => {
    // "Faltam 3 unidades" não move ninguém. "Faltam R$ 60" move.
    const r = conferirInventario(produtos, { a: 7, b: 5 });
    expect(r.divergentes).toHaveLength(1);
    expect(r.divergentes[0].diferenca).toBe(-3);
    expect(r.divergentes[0].valor).toBe(-60);
    expect(r.faltando).toBe(60);
  });

  it("sobra também aparece: pode ser venda lançada errada", () => {
    const r = conferirInventario(produtos, { a: 12 });
    expect(r.sobrando).toBe(40);
    expect(r.saldo).toBe(40);
  });

  it("falta e sobra no mesmo dia não se anulam na tela", () => {
    const r = conferirInventario(produtos, { a: 8, b: 8 });
    expect(r.faltando).toBe(40); // 2 arroz a 20
    expect(r.sobrando).toBe(24); // 3 feijão a 8
    expect(r.saldo).toBe(-16);
  });

  it("CONTADO ZERO é diferente de NÃO CONTADO", () => {
    // Sem essa distinção, abrir a contagem e salvar zeraria o estoque de
    // tudo que não foi conferido naquele dia. Não tem desfazer.
    const contadoZero = conferirInventario(produtos, { a: 0 });
    expect(contadoZero.divergentes).toHaveLength(1);
    expect(contadoZero.divergentes[0].diferenca).toBe(-10);

    const naoContado = conferirInventario(produtos, {});
    expect(naoContado.divergentes).toEqual([]);
    expect(naoContado.conferidos).toBe(0);
  });

  it("conta quantos foram conferidos e quantos faltam", () => {
    const r = conferirInventario(produtos, { a: 10 });
    expect(r.conferidos).toBe(1);
    expect(r.pendentes).toBe(1); // só o feijão; serviço não conta
  });

  it("serviço não entra na contagem: não tem prateleira", () => {
    const r = conferirInventario(produtos, { s: 99 });
    expect(r.linhas).toEqual([]);
  });

  it("tudo batendo não gera divergência", () => {
    const r = conferirInventario(produtos, { a: 10, b: 5 });
    expect(r.divergentes).toEqual([]);
    expect(r.saldo).toBe(0);
    expect(r.conferidos).toBe(2);
  });

  it("a maior perda aparece primeiro", () => {
    const r = conferirInventario(produtos, { a: 9, b: 0 });
    expect(r.divergentes[0].produtoId).toBe("b"); // -40
    expect(r.divergentes[1].produtoId).toBe("a"); // -20
  });

  it("produto por peso aceita contagem fracionada", () => {
    const kg = [prod({ id: "k", quantidade: 3.5, custo: 10, porPeso: true })];
    const r = conferirInventario(kg, { k: 3.2 });
    expect(r.divergentes[0].diferenca).toBe(-0.3);
    expect(r.divergentes[0].valor).toBe(-3);
  });
});

describe("gravar o ajuste", () => {
  it("devolve só o que precisa mudar", () => {
    // Regravar o que já estava certo é escrita à toa no banco — e, com
    // assinatura vencida, um monte de erro de gravação por nada.
    const ajustes = ajustesDoInventario(produtos, { a: 7, b: 5 });
    expect(ajustes).toHaveLength(1);
    expect(ajustes[0].id).toBe("a");
    expect(ajustes[0].quantidade).toBe(7);
  });

  it("preserva o resto do produto", () => {
    const [p] = ajustesDoInventario(produtos, { a: 7 });
    expect(p.nome).toBe("Arroz");
    expect(p.custo).toBe(20);
    expect(p.preco).toBe(40);
  });

  it("nada divergente, nada para gravar", () => {
    expect(ajustesDoInventario(produtos, { a: 10, b: 5 })).toEqual([]);
  });

  it("a descrição do lançamento diz o tamanho do buraco", () => {
    const r = conferirInventario(produtos, { a: 7, b: 8 });
    const texto = descricaoDoAjuste(r);
    expect(texto).toContain("2 item");
    expect(texto).toContain("falta 60.00");
    expect(texto).toContain("sobra 24.00");
  });
});
