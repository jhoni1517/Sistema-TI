import { describe, it, expect } from "vitest";
import { buscarTudo, numeroDeOS, normalizar, digitos } from "./busca";
import type { Cliente, OrdemServico, Produto } from "./types";

const clientes = [
  { id: "c1", nome: "João da Silva", telefone: "(11) 98765-4321", criadoEm: "" },
  { id: "c2", nome: "Maria José", telefone: "11912345678", cpf: "123.456.789-00", criadoEm: "" },
] as Cliente[];

const ordens = [
  {
    id: "o1",
    numero: 12,
    clienteId: "c1",
    tipoAparelho: "Celular",
    marca: "Samsung",
    modelo: "A54",
    defeitoRelatado: "Tela quebrada",
    checklist: {},
    pecas: [],
    maoDeObra: 0,
    desconto: 0,
    status: "aberta",
    garantiaDias: 90,
    historico: [],
    criadoEm: "",
    atualizadoEm: "",
  },
] as unknown as OrdemServico[];

const produtos = [
  {
    id: "p1",
    nome: "Película 12",
    quantidade: 30,
    estoqueMinimo: 5,
    custo: 2,
    preco: 10,
    codigoBarras: "7891234567895",
    criadoEm: "",
  },
  {
    id: "p2",
    nome: "Formatação",
    servico: true,
    quantidade: 0,
    estoqueMinimo: 0,
    custo: 0,
    preco: 80,
    criadoEm: "",
  },
] as Produto[];

const dados = { clientes, ordens, produtos };
const buscar = (t: string) => buscarTudo(t, dados);

describe("o número que a pessoa digita", () => {
  it("ninguém digita os cinco zeros", () => {
    expect(numeroDeOS("12")).toBe(12);
    expect(numeroDeOS("os12")).toBe(12);
    expect(numeroDeOS("OS 12")).toBe(12);
    expect(numeroDeOS("OS00012")).toBe(12);
    expect(numeroDeOS("#12")).toBe(12);
  });

  it("texto que não é número de OS não vira OS", () => {
    expect(numeroDeOS("samsung")).toBe(0);
    expect(numeroDeOS("os")).toBe(0);
    expect(numeroDeOS("12a")).toBe(0);
    expect(numeroDeOS("0")).toBe(0);
  });
});

describe("comparar do mesmo jeito nos dois lados", () => {
  it("tira acento e caixa: quem digita rápido no balcão não acentua", () => {
    expect(normalizar("João DA Silva")).toBe("joao da silva");
  });

  it("telefone chega com máscara do WhatsApp e cadastrado sem nada", () => {
    expect(digitos("(11) 98765-4321")).toBe("11987654321");
  });
});

describe("achar sem saber a tela", () => {
  it("digitar o número traz a OS daquele número em primeiro lugar", () => {
    // Existe um produto chamado "Película 12". A OS 12 vem antes.
    const r = buscar("12");
    expect(r[0].tipo).toBe("os");
    expect(r[0].titulo).toContain("OS00012");
  });

  it("acha o cliente sem acento", () => {
    expect(buscar("joao")[0].titulo).toBe("João da Silva");
  });

  it("acha o cliente pelo telefone com máscara", () => {
    const r = buscar("98765-4321");
    expect(r.some((x) => x.tipo === "cliente" && x.id === "c1")).toBe(true);
  });

  it("acha o cliente pelo telefone sem máscara", () => {
    expect(buscar("11912345678").some((x) => x.id === "c2")).toBe(true);
  });

  it("acha o cliente pelo CPF digitado só com números", () => {
    expect(buscar("12345678900").some((x) => x.id === "c2")).toBe(true);
  });

  it("nome que começa com o termo vem antes de nome que só contém", () => {
    // Quem digita "ma" quer a Maria, não alguém com "ma" no meio do nome.
    const r = buscar("mar").filter((x) => x.tipo === "cliente");
    expect(r[0].titulo).toBe("Maria José");
  });

  it("acha a OS pelo aparelho e pelo defeito", () => {
    expect(buscar("samsung")[0].tipo).toBe("os");
    expect(buscar("tela")[0].tipo).toBe("os");
  });

  it("acha a OS pelo nome do cliente: é assim que a pessoa liga", () => {
    // "Aqui é o João, do celular" — sem o número da OS em mãos.
    expect(buscar("silva").some((x) => x.tipo === "os")).toBe(true);
  });

  it("código de barras lido no leitor vai direto no produto", () => {
    const r = buscar("7891234567895");
    expect(r[0].tipo).toBe("produto");
    expect(r[0].id).toBe("p1");
  });

  it("cada resultado leva para a tela certa", () => {
    expect(buscar("joao")[0].rota).toBe("/clientes");
    expect(buscar("samsung")[0].rota).toBe("/ordens");
    expect(buscar("pelicula")[0].rota).toBe("/estoque");
  });

  it("mostra estoque do produto e marca o que é serviço", () => {
    expect(buscar("pelicula")[0].detalhe).toBe("30 un em estoque");
    expect(buscar("formata")[0].detalhe).toBe("serviço");
  });

  it("acha a OS pelo IMEI", () => {
    // É como a assistência acha o aparelho quando o cliente não sabe o
    // número da OS e o cadastro está no nome do irmão.
    const comImei = [{ ...ordens[0], imeiSerial: "356938035643809" }] as OrdemServico[];
    const r = buscarTudo("356938035643809", { clientes, ordens: comImei, produtos });
    expect(r[0].tipo).toBe("os");
  });

  it("a OS mostra a situação e o valor, para decidir sem abrir", () => {
    const r = buscar("samsung")[0];
    expect(r.detalhe).toContain("Aberta");
    expect(r.extra).toContain("R$");
  });

  it("uma letra só não busca nada: traria a loja inteira", () => {
    expect(buscar("a")).toEqual([]);
    expect(buscar(" ")).toEqual([]);
  });

  it("termo que não existe devolve lista vazia, não erro", () => {
    expect(buscar("geladeira")).toEqual([]);
  });

  it("respeita o limite para a lista não virar uma tela inteira", () => {
    const muitos = Array.from({ length: 50 }, (_, i) => ({
      ...produtos[0],
      id: `x${i}`,
      nome: `Cabo ${i}`,
      codigoBarras: "",
    }));
    expect(buscarTudo("cabo", { clientes: [], ordens: [], produtos: muitos }, 5)).toHaveLength(5);
  });
});
