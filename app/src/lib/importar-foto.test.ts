import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  lerClientesDaIA,
  lerProdutosDaIA,
  telefoneLido,
  clienteRepetido,
  produtoRepetido,
  produtoDaLinha,
  clienteDaLinha,
  MAX_LINHAS_POR_FOTO,
} from "./importar-foto";

describe("resposta quebrada da IA", () => {
  it("sem JSON nenhum: pede outra foto", () => {
    expect(() => lerClientesDaIA("Desculpe, não consigo ler.", [])).toThrow(/outra/);
  });
  it("JSON cortado no meio: pede outra foto", () => {
    expect(() => lerProdutosDaIA('{"produtos": [{"nome": "Cabo", "preco": 2', [])).toThrow(/outra/);
  });
  it("JSON sem a lista: diz que não achou", () => {
    expect(() => lerClientesDaIA('{"pessoas": []}', [])).toThrow(/nenhum cliente/);
    expect(() => lerProdutosDaIA("{}", [])).toThrow(/nenhum produto/);
  });
  it("aceita o ```json em volta e item que não é objeto", () => {
    const r = lerClientesDaIA('```json\n{"clientes": [null, 3, {"nome": "Ana", "telefone": "(11) 98888-7777"}]}\n```', []);
    expect(r.linhas.map((l) => l.nome)).toEqual(["Ana"]);
    expect(r.avisos).toHaveLength(2);
  });
  it("lista enorme é cortada, com aviso", () => {
    const muitos = Array.from({ length: MAX_LINHAS_POR_FOTO + 20 }, (_, i) => ({ nome: `Item ${i}`, preco: 1 }));
    const r = lerProdutosDaIA({ produtos: muitos }, []);
    expect(r.linhas).toHaveLength(MAX_LINHAS_POR_FOTO);
    expect(r.avisos[0]).toMatch(/primeiras/);
  });
  it("tira caractere de controle e sinal de HTML do nome", () => {
    const r = lerClientesDaIA({ clientes: [{ nome: "<b>Zé</b>\u0000 da Silva", telefone: "" }] }, []);
    expect(r.linhas[0].nome).toBe("b Zé /b da Silva");
  });
});

describe("clientes do caderno", () => {
  it("telefone: 55 na frente sai, sem DDD vira aviso e não é inventado", () => {
    expect(telefoneLido("+55 (11) 98888-7777")).toEqual({ telefone: "11988887777", problema: "" });
    expect(telefoneLido("98888-7777")).toEqual({ telefone: "988887777", problema: "sem DDD" });
    expect(telefoneLido("123")).toEqual({ telefone: "123", problema: "número incompleto" });
    expect(telefoneLido(null)).toEqual({ telefone: "", problema: "" });
  });

  it("duplicado vem marcado e desmarcado, não some", () => {
    const existentes = [{ nome: "Maria Aparecida", telefone: "11988887777" }];
    const r = lerClientesDaIA(
      {
        clientes: [
          { nome: "Maria", telefone: "(11) 98888-7777" },
          { nome: "João Pedro", telefone: "11977776666" },
          { nome: "joão pedro", telefone: "" },
          { nome: "Maria Souza", telefone: "" },
        ],
      },
      existentes
    );
    expect(r.linhas.map((l) => [l.nome, l.importar])).toEqual([
      ["Maria", false],
      ["João Pedro", true],
      ["joão pedro", false],
      ["Maria Souza", true],
    ]);
    expect(r.linhas[0].duplicado).toMatch(/Já cadastrado.*mesmo telefone/);
    expect(r.linhas[2].duplicado).toMatch(/Repetido nas fotos/);
  });

  it("repetido entre fotos diferentes também", () => {
    const foto1 = lerClientesDaIA({ clientes: [{ nome: "Carla Dias", telefone: "21999990000" }] }, []);
    const foto2 = lerClientesDaIA({ clientes: [{ nome: "Carla", telefone: "21 99999-0000" }] }, [], foto1.linhas);
    expect(foto2.linhas[0].importar).toBe(false);
  });

  it("Maria Silva e Maria Souza são duas pessoas", () => {
    expect(clienteRepetido({ nome: "Maria Silva", telefone: "" }, [{ nome: "Maria Souza", telefone: "" }])).toBe("");
  });

  it("vira cliente só com dígitos no telefone", () => {
    const c = clienteDaLinha({ nome: "Ana", telefone: "(11) 9888-7777", duplicado: "", importar: true }, "x", "t");
    expect(c.telefone).toBe("1198887777");
  });
});

describe("produtos do caderno", () => {
  it("lê número brasileiro e avisa o que ficou estranho", () => {
    const r = lerProdutosDaIA(
      {
        produtos: [
          { nome: "Película", quantidade: "20", custo: "3,50", preco: "R$ 30,00" },
          { nome: "Cabo", quantidade: "dez", custo: 40, preco: 25 },
          { nome: "Fone", preco: 0 },
        ],
      },
      []
    );
    expect(r.linhas.map((l) => [l.nome, l.quantidade, l.custo, l.preco, l.importar])).toEqual([
      ["Película", 20, 3.5, 30, true],
      ["Cabo", 0, 40, 25, true],
      ["Fone", 0, 0, 0, false],
    ]);
    expect(r.avisos.join("\n")).toMatch(/Cabo: quantidade ilegível/);
    expect(r.avisos.join("\n")).toMatch(/Cabo: custo maior que o preço/);
    expect(r.avisos.join("\n")).toMatch(/Fone: sem preço/);
  });

  it("marca o que já está no estoque", () => {
    expect(produtoRepetido("CABO USB-C 1M", [{ nome: "Cabo USB C 1m" }])).toMatch(/Já no estoque/);
    expect(produtoRepetido("Fonte 500W", [{ nome: "Fonte 200W" }])).toBe("");
  });

  it("vira produto sem estoque mínimo inventado", () => {
    const p = produtoDaLinha({ nome: "X", quantidade: 2, custo: 1, preco: 3, duplicado: "", importar: true }, "id", "t");
    expect(p).toMatchObject({ id: "id", quantidade: 2, custo: 1, preco: 3, estoqueMinimo: 0 });
  });
});

describe("servidor", () => {
  const ia = readFileSync(new URL("../../api/ia.js", import.meta.url), "utf8");
  it("importar-foto passa pelo crédito do plano e confere o tipo da imagem", () => {
    const bloco = ia.slice(ia.indexOf('acao === "importar-foto"'));
    expect(bloco).toMatch(/atenderIA\(req, res, "importacao"/);
    expect(bloco).toMatch(/TIPOS_IMAGEM\.includes/);
    expect(bloco).toMatch(/base64Valido/);
  });
});
