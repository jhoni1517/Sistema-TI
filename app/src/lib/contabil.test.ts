import { describe, it, expect } from "vitest";
import {
  campoCSV,
  numeroCSV,
  linhasDoPeriodo,
  csvDoPeriodo,
  nomeDoArquivo,
  limitesDoMes,
} from "./contabil";
import type { MovimentoCaixa } from "./types";

const mov = (m: Partial<MovimentoCaixa>): MovimentoCaixa =>
  ({
    id: "m1",
    tipo: "entrada",
    categoria: "Venda",
    descricao: "Venda 1",
    valor: 100,
    formaPagamento: "dinheiro",
    data: "2026-07-10T10:00:00.000Z",
    ...m,
  }) as MovimentoCaixa;

describe("o formato que a planilha em português entende", () => {
  it("separa com ponto e vírgula, não vírgula", () => {
    // Com vírgula, o Excel em português abre a planilha inteira numa coluna
    // só e o contador devolve pedindo "manda de novo, veio tudo junto".
    expect(csvDoPeriodo([mov({})], "2026-07-01", "2026-07-31").split("\r\n")[0]).toContain(
      "Data;Tipo"
    );
  });

  it("número sai com vírgula decimal", () => {
    expect(numeroCSV(1234.5)).toBe("1234,50");
    expect(numeroCSV(0)).toBe("0,00");
  });

  it("descrição com ponto e vírgula vai entre aspas", () => {
    // Sem isso, uma descrição quebra todas as colunas dali para a frente.
    expect(campoCSV("Peça; cabo")).toBe('"Peça; cabo"');
  });

  it("aspas dentro do texto viram aspas duplas", () => {
    expect(campoCSV('Fonte "boa"')).toBe('"Fonte ""boa"""');
  });

  it("quebra de linha na descrição não quebra o arquivo", () => {
    expect(campoCSV("linha1\nlinha2")).toBe('"linha1\nlinha2"');
  });

  it("texto simples não ganha aspas à toa", () => {
    expect(campoCSV("Venda 12")).toBe("Venda 12");
  });
});

describe("as linhas do período", () => {
  const movs = [
    mov({ id: "a", data: "2026-07-05T10:00:00Z", valor: 100 }),
    mov({ id: "b", data: "2026-07-01T10:00:00Z", valor: 50, tipo: "saida", categoria: "Aluguel" }),
    mov({ id: "c", data: "2026-08-01T10:00:00Z", valor: 999 }),
  ];

  it("só o que está dentro do período, em ordem de data", () => {
    const l = linhasDoPeriodo(movs, "2026-07-01", "2026-07-31");
    expect(l).toHaveLength(2);
    expect(l[0].data).toBe("01/07/2026");
    expect(l[1].data).toBe("05/07/2026");
  });

  it("entrada e saída em colunas SEPARADAS", () => {
    // É assim que todo livro-caixa é montado, e somar coluna é a primeira
    // coisa que o contador faz ao abrir o arquivo.
    const l = linhasDoPeriodo(movs, "2026-07-01", "2026-07-31");
    const saida = l.find((x) => x.tipo === "Saída")!;
    expect(saida.saida).toBe(50);
    expect(saida.entrada).toBe(0);
  });

  it("data sai em dia/mês/ano, como o contador lê", () => {
    expect(linhasDoPeriodo([mov({})], "2026-07-01", "2026-07-31")[0].data).toBe("10/07/2026");
  });

  it("marca a compra de estoque, que não é despesa do mês", () => {
    const compra = mov({ tipo: "saida", categoria: "Compra de peça", compraEstoque: true });
    expect(linhasDoPeriodo([compra], "2026-07-01", "2026-07-31")[0].compraEstoque).toBe("sim");
    expect(linhasDoPeriodo([mov({ tipo: "saida", categoria: "Aluguel" })], "2026-07-01", "2026-07-31")[0].compraEstoque).toBe("nao");
  });

  it("sangria aparece como saída, com o rótulo próprio", () => {
    const l = linhasDoPeriodo([mov({ tipo: "sangria", valor: 300 })], "2026-07-01", "2026-07-31");
    expect(l[0].tipo).toBe("Sangria");
    expect(l[0].saida).toBe(300);
  });

  it("período vazio devolve arquivo só com cabeçalho e totais", () => {
    const csv = csvDoPeriodo([], "2026-07-01", "2026-07-31");
    expect(csv).toContain("Data;Tipo");
    expect(csv).toContain("TOTAL;;;;;0,00;0,00");
  });
});

describe("os totais vão dentro do arquivo", () => {
  it("soma entradas, saídas e o saldo", () => {
    // Sem os totais, a primeira coisa que o contador faz é somar — e se a
    // soma dele der diferente da tela, ninguém sabe qual está certa.
    const movs = [
      mov({ id: "a", valor: 300 }),
      mov({ id: "b", valor: 100, tipo: "saida" }),
    ];
    const csv = csvDoPeriodo(movs, "2026-07-01", "2026-07-31");
    expect(csv).toContain("TOTAL;;;;;300,00;100,00");
    expect(csv).toContain("SALDO;;;;;200,00");
  });

  it("termina as linhas em CRLF, que é o que a planilha espera", () => {
    expect(csvDoPeriodo([mov({})], "2026-07-01", "2026-07-31")).toContain("\r\n");
  });
});

describe("período e nome do arquivo", () => {
  it("o nome carrega o período: o contador guarda dez destes", () => {
    expect(nomeDoArquivo("2026-07-01", "2026-07-31")).toBe(
      "livro-caixa-2026-07-01-a-2026-07-31.csv"
    );
  });

  it("o último dia vem do calendário, não de um chute", () => {
    // Chutar 30 perderia o dia 31; chutar 31 traria lançamentos de fevereiro
    // para dentro de janeiro.
    expect(limitesDoMes("2026-01")).toEqual({ de: "2026-01-01", ate: "2026-01-31" });
    expect(limitesDoMes("2026-02")).toEqual({ de: "2026-02-01", ate: "2026-02-28" });
    expect(limitesDoMes("2028-02")).toEqual({ de: "2028-02-01", ate: "2028-02-29" });
    expect(limitesDoMes("2026-04")).toEqual({ de: "2026-04-01", ate: "2026-04-30" });
  });

  it("mês inválido não derruba a tela", () => {
    expect(limitesDoMes("")).toEqual({ de: "", ate: "" });
  });
});
