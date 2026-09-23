import { describe, it, expect } from "vitest";
import {
  numeroBR,
  dataDaNota,
  lerRespostaDaIA,
  parecenca,
  casarItens,
  MAX_ITENS_LIDOS,
} from "./leitura-nota";
import type { Produto } from "./types";

/**
 * Respostas da IA de mentira — as boas e, principalmente, as quebradas.
 * A IA erra com cara de certo; cada caso aqui é um jeito que ela erra.
 */

describe("número como vem na nota", () => {
  it("formatos brasileiros e americanos", () => {
    expect(numeroBR(12)).toBe(12);
    expect(numeroBR("12,50")).toBe(12.5);
    expect(numeroBR("1.234,56")).toBe(1234.56);
    expect(numeroBR("R$ 1.234,56")).toBe(1234.56);
    expect(numeroBR("1,234.56")).toBe(1234.56);
    expect(numeroBR("2 un")).toBe(2);
    expect(numeroBR("1.234")).toBe(1234);
    expect(numeroBR("3.5")).toBe(3.5);
  });

  it("o que não é número vira NaN, e não zero calado", () => {
    expect(numeroBR("")).toBeNaN();
    expect(numeroBR("abc")).toBeNaN();
    expect(numeroBR(null)).toBeNaN();
    expect(numeroBR(Infinity)).toBeNaN();
  });
});

describe("data da nota", () => {
  it("aceita ISO e dd/mm/aaaa", () => {
    expect(dataDaNota("2026-09-23")).toBe("2026-09-23");
    expect(dataDaNota("23/09/2026")).toBe("2026-09-23");
    expect(dataDaNota("3/9/26")).toBe("2026-09-03");
  });
  it("data impossível vira vazio", () => {
    expect(dataDaNota("31/02/2026")).toBe("");
    expect(dataDaNota("ontem")).toBe("");
    expect(dataDaNota(undefined)).toBe("");
  });
});

describe("resposta da IA", () => {
  it("resposta boa", () => {
    const n = lerRespostaDaIA(
      JSON.stringify({
        fornecedor: "Distribuidora X",
        data: "23/09/2026",
        itens: [{ descricao: "Tela A54", codigo: "789123", quantidade: 2, custoUnitario: 180.5 }],
      })
    );
    expect(n.fornecedor).toBe("Distribuidora X");
    expect(n.data).toBe("2026-09-23");
    expect(n.itens).toEqual([{ descricao: "Tela A54", codigo: "789123", quantidade: 2, custoUnitario: 180.5 }]);
    expect(n.avisos).toEqual([]);
  });

  it("JSON dentro de ```json ... ``` e com texto em volta", () => {
    const n = lerRespostaDaIA('Aqui está:\n```json\n{"itens":[{"descricao":"Cabo","quantidade":"1","custoUnitario":"9,90"}]}\n```');
    expect(n.itens[0]).toMatchObject({ descricao: "Cabo", quantidade: 1, custoUnitario: 9.9 });
  });

  it("número em texto brasileiro vira número", () => {
    const n = lerRespostaDaIA({ itens: [{ descricao: "Bateria", quantidade: "3 un", custoUnitario: "R$ 1.050,00" }] });
    expect(n.itens[0]).toMatchObject({ quantidade: 3, custoUnitario: 1050 });
  });

  it("item sem descrição sai, e a tela é avisada", () => {
    const n = lerRespostaDaIA({ itens: [{ descricao: "", quantidade: 1, custoUnitario: 5 }, { descricao: "Película", quantidade: 1, custoUnitario: 5 }] });
    expect(n.itens).toHaveLength(1);
    expect(n.avisos[0]).toContain("linha 1");
  });

  it("quantidade e custo ilegíveis viram 1 e 0 com aviso, nunca somem calados", () => {
    const n = lerRespostaDaIA({ itens: [{ descricao: "Fonte", quantidade: "?", custoUnitario: -3 }] });
    expect(n.itens[0]).toMatchObject({ quantidade: 1, custoUnitario: 0 });
    expect(n.avisos).toHaveLength(2);
  });

  it("marcação e controle no texto são limpos", () => {
    const n = lerRespostaDaIA({ fornecedor: "<script>x</script>", itens: [{ descricao: "Tela\n\tA54", quantidade: 1, custoUnitario: 1 }] });
    expect(n.fornecedor).not.toContain("<");
    expect(n.itens[0].descricao).toBe("Tela A54");
  });

  it("resposta enorme é cortada, com aviso", () => {
    const itens = Array.from({ length: MAX_ITENS_LIDOS + 10 }, (_, i) => ({ descricao: `item ${i}`, quantidade: 1, custoUnitario: 1 }));
    const n = lerRespostaDaIA({ itens });
    expect(n.itens).toHaveLength(MAX_ITENS_LIDOS);
    expect(n.avisos[0]).toContain(String(MAX_ITENS_LIDOS));
  });

  it("respostas quebradas dizem o que fazer", () => {
    expect(() => lerRespostaDaIA("não consegui ler a imagem")).toThrow(/outra foto/);
    expect(() => lerRespostaDaIA('{"itens": [{"descricao": "Tela"')).toThrow(/outra foto|metade/);
    expect(() => lerRespostaDaIA('{"itens": []}')).toThrow(/nenhum item/);
    expect(() => lerRespostaDaIA('{"itens": "Tela A54"}')).toThrow(/nenhum item/);
    expect(() => lerRespostaDaIA("")).toThrow();
  });
});

describe("casar com o estoque", () => {
  const p = (x: Partial<Produto>): Produto =>
    ({ id: "p", nome: "", quantidade: 0, estoqueMinimo: 0, custo: 0, preco: 0, criadoEm: "", ...x }) as Produto;
  const estoque = [
    p({ id: "tela", nome: "Tela Samsung A54 original" }),
    p({ id: "cabo", nome: "Cabo USB C 1m", codigoBarras: "7891234567890" }),
    p({ id: "f500", nome: "Fonte ATX 500W" }),
    p({ id: "serv", nome: "Formatação", servico: true }),
  ];
  const lido = (descricao: string, codigo = "") => ({ descricao, codigo, quantidade: 1, custoUnitario: 1 });

  it("código de barras igual casa com certeza", () => {
    expect(casarItens([lido("CABO QUALQUER", "7891234567890")], estoque)[0]).toMatchObject({ produtoId: "cabo", motivo: "codigo" });
  });

  it("nome parecido casa, com acento e caixa diferentes", () => {
    expect(casarItens([lido("TELA SAMSUNG A54 ORIGINAL")], estoque)[0]).toMatchObject({ produtoId: "tela", motivo: "nome" });
  });

  it("fonte de 200W NÃO vira a de 500W", () => {
    expect(parecenca("Fonte ATX 200W", "Fonte ATX 500W")).toBeLessThan(0.7);
    expect(casarItens([lido("Fonte 200W")], estoque)[0].motivo).toBe("novo");
  });

  it("sem par vira produto novo; serviço nunca casa", () => {
    expect(casarItens([lido("Película 3D iPhone")], estoque)[0]).toMatchObject({ produtoId: "", motivo: "novo" });
    expect(casarItens([lido("Formatação")], estoque)[0].produtoId).not.toBe("serv");
  });

  it("o mesmo produto não casa com duas linhas", () => {
    const r = casarItens([lido("Tela Samsung A54 original"), lido("Tela Samsung A54 original")], estoque);
    expect(r[0].produtoId).toBe("tela");
    expect(r[1].motivo).toBe("novo");
  });
});

describe("revisão confirmada vira entrada", () => {
  const p = (x: Partial<Produto>): Produto =>
    ({ id: "p", nome: "", quantidade: 5, estoqueMinimo: 0, custo: 0, preco: 50, criadoEm: "", ...x }) as Produto;
  let n = 0;
  const id = () => `novo-${++n}`;

  it("item casado usa o produto do estoque; o novo nasce sem preço e com o código de barras", async () => {
    const { paraEntrada } = await import("./leitura-nota");
    const r = paraEntrada(
      [
        { descricao: "TELA A54", codigo: "", quantidade: 2, custoUnitario: 180, produtoId: "tela", motivo: "nome" },
        { descricao: "Película 3D", codigo: "7891234567890", quantidade: 10, custoUnitario: 3.5, produtoId: "", motivo: "novo" },
        { descricao: "Zerado", codigo: "", quantidade: 0, custoUnitario: 1, produtoId: "", motivo: "novo" },
      ],
      [p({ id: "tela", nome: "Tela Samsung A54" })],
      id,
      "2026-09-23T15:00:00Z"
    );
    expect(r.itens).toEqual([
      { produtoId: "tela", descricao: "Tela Samsung A54", quantidade: 2, custoUnit: 180 },
      { produtoId: "novo-1", descricao: "Película 3D", quantidade: 10, custoUnit: 3.5 },
    ]);
    expect(r.novos).toHaveLength(1);
    expect(r.novos[0]).toMatchObject({ nome: "Película 3D", quantidade: 0, preco: 0, custo: 3.5, codigoBarras: "7891234567890" });
  });

  it("código que não é EAN não vira código de barras", async () => {
    const { paraEntrada } = await import("./leitura-nota");
    const r = paraEntrada(
      [{ descricao: "Cabo", codigo: "ABC-12", quantidade: 1, custoUnitario: 1, produtoId: "", motivo: "novo" }],
      [],
      id,
      ""
    );
    expect(r.novos[0].codigoBarras).toBeUndefined();
  });
});
