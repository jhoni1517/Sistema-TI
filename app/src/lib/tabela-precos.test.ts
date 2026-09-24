import { describe, it, expect } from "vitest";
import {
  tabelaVazia,
  tabelaSegura,
  acrescentarModelo,
  acrescentarServico,
  definirPreco,
  precoDe,
  copiarPrecos,
  previaReajuste,
  aplicarMudancas,
  arredondarPreco,
  buscarNaTabela,
  modeloDaOS,
  sugestaoParaOS,
  importarCSV,
  exportarCSV,
  problemaDoNome,
  tirarServico,
  type TabelaServicos,
} from "./tabela-precos";
import { lerCSV } from "./planilha";

function base(): TabelaServicos {
  let t = tabelaVazia();
  t = acrescentarModelo(t, "Apple", "iPhone 13", "i13");
  t = acrescentarModelo(t, "Apple", "iPhone 13 Pro", "i13p");
  t = acrescentarModelo(t, "Samsung", "Galaxy A13", "a13");
  t = acrescentarModelo(t, "Motorola", "Moto G 13", "g13");
  t = definirPreco(t, "i13", "tela", 650);
  t = definirPreco(t, "i13", "bateria", 280);
  t = definirPreco(t, "i13p", "tela", 1200);
  t = definirPreco(t, "a13", "tela", 320);
  t = definirPreco(t, "a13", "conector", 120);
  return t;
}

describe("cadastro", () => {
  it("modelo repetido é recusado, sem ligar para maiúscula e acento", () => {
    expect(() => acrescentarModelo(base(), "apple", "IPHONE 13", "x")).toThrow(/já está/);
    expect(() => acrescentarModelo(base(), "", " ", "x")).toThrow(/modelo/);
  });

  it("serviço novo adivinha o problema pelo nome", () => {
    const t = acrescentarServico(tabelaVazia(), "Troca de display", "d");
    expect(t.servicos.at(-1)?.problema).toBe("tela");
    expect(problemaDoNome("Limpeza")).toBeUndefined();
    expect(problemaDoNome("Reparo de placa")).toBe("nao-liga");
    expect(() => acrescentarServico(t, "troca de TELA", "y")).toThrow(/já está/);
  });

  it("preço zerado apaga a célula; centavo quebrado arredonda", () => {
    let t = definirPreco(base(), "i13", "tela", 0);
    expect(precoDe(t, "i13", "tela")).toBeUndefined();
    t = definirPreco(t, "i13", "tela", 649.899999);
    expect(precoDe(t, "i13", "tela")).toBe(649.9);
  });

  it("tirar serviço tira o preço de todos os modelos", () => {
    const t = tirarServico(base(), "tela");
    expect(t.modelos.every((m) => m.precos.tela === undefined)).toBe(true);
  });

  it("tabela quebrada da nuvem não derruba a tela", () => {
    expect(tabelaSegura(null).servicos.length).toBeGreaterThan(0);
    expect(tabelaSegura({ servicos: [], modelos: [{ id: 1 }, { id: "a", modelo: "X" }] }).modelos).toEqual([
      { id: "a", modelo: "X", marca: "", precos: {} },
    ]);
  });
});

describe("copiar preços", () => {
  it("sem sobrescrever, só preenche o que falta", () => {
    const r = copiarPrecos(base(), "i13", ["i13p"]);
    expect(r.tabela.modelos.find((m) => m.id === "i13p")?.precos).toEqual({ tela: 1200, bateria: 280 });
    expect(r.copiados).toBe(1);
  });
  it("sobrescrevendo, copia tudo", () => {
    const r = copiarPrecos(base(), "i13", ["i13p", "a13"], true);
    expect(r.tabela.modelos.find((m) => m.id === "i13p")?.precos.tela).toBe(650);
    expect(r.tabela.modelos.find((m) => m.id === "a13")?.precos).toEqual({ tela: 650, bateria: 280, conector: 120 });
  });
});

describe("reajuste em massa", () => {
  it("10% em 649,90 dá 714,89, não 714,8900000001", () => {
    const t = definirPreco(base(), "i13", "tela", 649.9);
    const { mudancas } = previaReajuste(t, { modo: "%", valor: 10, servicoId: "tela", marca: "apple" });
    expect(mudancas.find((m) => m.modeloId === "i13")?.depois).toBe(714.89);
    expect(mudancas.map((m) => m.modeloId)).toEqual(["i13", "i13p"]);
  });

  it("filtro por marca e por serviço", () => {
    expect(previaReajuste(base(), { modo: "R$", valor: 20, marca: "Samsung" }).mudancas).toHaveLength(2);
    expect(previaReajuste(base(), { modo: "R$", valor: 20, servicoId: "bateria" }).mudancas).toHaveLength(1);
    expect(previaReajuste(base(), { modo: "R$", valor: 20 }).mudancas).toHaveLength(5);
  });

  it("prévia não muda nada; aplicar muda", () => {
    const t = base();
    const p = previaReajuste(t, { modo: "R$", valor: 50, servicoId: "tela", marca: "Apple" });
    expect(precoDe(t, "i13", "tela")).toBe(650);
    expect(precoDe(aplicarMudancas(t, p.mudancas), "i13", "tela")).toBe(700);
  });

  it("baixa que zera preço fica de fora, com aviso", () => {
    const p = previaReajuste(base(), { modo: "R$", valor: -400, servicoId: "tela" });
    expect(p.mudancas.map((m) => m.modeloId)).toEqual(["i13", "i13p"]);
    expect(p.avisos.join()).toMatch(/Galaxy A13.*zerado/);
    expect(previaReajuste(base(), { modo: "%", valor: -100 }).avisos[0]).toMatch(/zera/);
    expect(previaReajuste(base(), { modo: "%", valor: 0 }).avisos[0]).toMatch(/Informe/);
  });

  it("arredondamento sempre para cima", () => {
    expect(arredondarPreco(612.3, "final90")).toBe(619.9);
    expect(arredondarPreco(619.9, "final90")).toBe(619.9);
    expect(arredondarPreco(619.95, "final90")).toBe(629.9);
    expect(arredondarPreco(612.01, "inteiro")).toBe(613);
    expect(arredondarPreco(612, "inteiro")).toBe(612);
    const p = previaReajuste(base(), { modo: "%", valor: 7, servicoId: "tela", marca: "Apple", arredondar: "final90" });
    expect(p.mudancas.map((m) => m.depois)).toEqual([699.9, 1289.9]);
  });
});

describe("busca de balcão", () => {
  it('"13 tela" acha o iPhone 13 antes do 13 Pro, e não o Galaxy A13', () => {
    const r = buscarNaTabela(base(), "13 tela");
    expect(r.map((a) => [a.modelo.modelo, a.preco])).toEqual([
      ["iPhone 13", 650],
      ["iPhone 13 Pro", 1200],
    ]);
  });
  it("sem acento, pedaço de palavra e sinônimo", () => {
    expect(buscarNaTabela(base(), "a13 conec")[0].preco).toBe(120);
    expect(buscarNaTabela(base(), "iphone display").map((a) => a.preco)).toEqual([650, 1200]);
    expect(buscarNaTabela(base(), "bat 13")[0].preco).toBe(280);
  });
  it("só o serviço lista todos os modelos com aquele preço", () => {
    expect(buscarNaTabela(base(), "tela")).toHaveLength(3);
    expect(buscarNaTabela(base(), "")).toEqual([]);
    expect(buscarNaTabela(base(), "xiaomi")).toEqual([]);
  });
});

describe("sugestão na OS", () => {
  it("modelo digitado casa com a linha mais específica", () => {
    expect(modeloDaOS(base(), "Apple", "iPhone 13 Pro 128GB")?.id).toBe("i13p");
    expect(modeloDaOS(base(), "", "iphone 13")?.id).toBe("i13");
    expect(modeloDaOS(base(), "Samsung", "A13")).toBeUndefined();
    expect(modeloDaOS(base(), "Samsung", "Galaxy A13")?.id).toBe("a13");
    expect(modeloDaOS(base(), "Samsung", "")).toBeUndefined();
  });
  it("marca diferente não casa", () => {
    let t = acrescentarModelo(base(), "Motorola", "Galaxy A13", "falso");
    t = definirPreco(t, "falso", "tela", 1);
    expect(modeloDaOS(t, "Samsung", "Galaxy A13")?.id).toBe("a13");
  });
  it("o serviço do defeito vem primeiro", () => {
    const s = sugestaoParaOS(base(), { marca: "Apple", modelo: "iPhone 13", defeitoRelatado: "Bateria descarregando rápido" });
    expect(s?.itens.map((i) => [i.servico.id, i.combina])).toEqual([
      ["bateria", true],
      ["tela", false],
    ]);
    const t = sugestaoParaOS(base(), { marca: "Apple", modelo: "iPhone 13", defeitoRelatado: "caiu e a tela trincou" });
    expect(t?.itens[0]).toMatchObject({ preco: 650, combina: true });
  });
  it("modelo sem preço nenhum não sugere", () => {
    expect(sugestaoParaOS(base(), { marca: "Motorola", modelo: "Moto G 13" })).toBeNull();
  });
});

describe("CSV", () => {
  it("importa, mescla e não apaga com célula vazia", () => {
    let n = 0;
    const csv = "Marca;Modelo;Troca de tela;Troca de câmera\nApple;iPhone 13;700,00;\nXiaomi;Redmi Note 12;R$ 350;180\nApple;;10\nApple;iPhone 13 Pro;abc;";
    const r = importarCSV(base(), lerCSV(csv), () => `n${++n}`);
    expect(precoDe(r.tabela, "i13", "tela")).toBe(700);
    expect(precoDe(r.tabela, "i13", "bateria")).toBe(280);
    expect(r.tabela.servicos.map((s) => s.nome)).toContain("Troca de câmera");
    const redmi = r.tabela.modelos.find((m) => m.modelo === "Redmi Note 12");
    expect(redmi?.precos).toEqual({ tela: 350, n1: 180 });
    expect(r.modelosNovos).toBe(1);
    expect(r.precos).toBe(3);
    expect(r.problemas).toEqual(["Linha 4: sem modelo.", 'Linha 5 (iPhone 13 Pro): "abc" não é um preço.']);
  });
  it("sem coluna Modelo, diz", () => {
    expect(importarCSV(base(), [["Aparelhinho", "Tela"]], () => "x").problemas[0]).toMatch(/Modelo/);
  });
  it("ida e volta", () => {
    let n = 0;
    const volta = importarCSV(tabelaVazia(), lerCSV(exportarCSV(base())), () => `v${++n}`).tabela;
    for (const m of base().modelos) {
      const achado = volta.modelos.find((x) => x.modelo === m.modelo && x.marca === m.marca);
      expect(achado?.precos).toEqual(m.precos);
    }
  });
});
