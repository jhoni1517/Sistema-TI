import { describe, it, expect } from "vitest";
import {
  pendenciasDaLoja,
  pendenciasDoProduto,
  pendenciasParaEmitir,
  produtosSemFiscal,
  fiscalDoProduto,
  regimeDe,
  usaCsosn,
  CODIGO_PAGAMENTO,
  minutosRestantesParaCancelar,
  documentoDoProduto,
} from "./fiscal";
import type { Config, ItemVenda, Produto } from "./types";

/** Loja pronta para emitir: é a partir dela que cada teste tira uma peça */
const loja = {
  nomeLoja: "Cantina do Zé",
  cnpj: "12.345.678/0001-95",
  inscricaoEstadual: "9012345678",
  regimeTributario: "simples",
  nfLogradouro: "Rua das Flores",
  nfNumero: "123",
  nfBairro: "Centro",
  nfCep: "83005-000",
  nfMunicipio: "São José dos Pinhais",
  nfCodigoIbge: "4125506",
  nfUf: "PR",
} as Config;

const produto = (p: Partial<Produto> = {}): Produto =>
  ({
    id: "p1",
    nome: "Pizza Calabresa",
    quantidade: 10,
    estoqueMinimo: 1,
    custo: 15,
    preco: 45,
    ncm: "19059090",
    ...p,
  }) as Produto;

describe("o que falta na loja", () => {
  it("loja completa não tem pendência", () => {
    expect(pendenciasDaLoja(loja)).toEqual([]);
  });

  it("CPF no lugar do CNPJ é apontado: nota não sai no CPF do dono", () => {
    const faltas = pendenciasDaLoja({ ...loja, cnpj: "123.456.789-00" } as Config);
    expect(faltas.join(" ")).toContain("CNPJ");
  });

  it("sem inscrição estadual não sai nota", () => {
    const faltas = pendenciasDaLoja({ ...loja, inscricaoEstadual: "  " } as Config);
    expect(faltas.join(" ")).toContain("Inscrição Estadual");
  });

  it("fora do Simples, CST padrão é obrigatório", () => {
    // No Simples o item leva CSOSN; fora dele leva CST. Mandar o campo
    // errado a SEFAZ rejeita a nota inteira.
    const normal = { ...loja, regimeTributario: "normal" } as Config;
    expect(pendenciasDaLoja(normal).join(" ")).toContain("CST");
    expect(pendenciasDaLoja({ ...normal, cstPadrao: "00" } as Config)).toEqual([]);
  });
});

describe("o endereço da nota", () => {
  it("endereço em uma linha só não serve: a nota quer campos separados", () => {
    // `enderecoLoja` é "Rua das Flores, 123 - Centro" e é ótimo no recibo.
    // A SEFAZ quer rua, número, bairro, CEP, cidade, UF e código IBGE em
    // campos próprios — e partir a linha depois não é confiável, porque
    // "Rua 15 de Novembro, 1500" tem número no nome da rua.
    const semEndereco = { ...loja, nfLogradouro: "", nfCodigoIbge: "" } as Config;
    const faltas = pendenciasDaLoja(semEndereco).join(" | ");
    expect(faltas).toContain("rua");
    expect(faltas).toContain("código IBGE");
  });

  it("código IBGE é da cidade e tem 7 dígitos", () => {
    // 4125506 é São José dos Pinhais. Com 6 dígitos é outra coisa.
    expect(pendenciasDaLoja({ ...loja, nfCodigoIbge: "412550" } as Config).join(" ")).toContain(
      "IBGE"
    );
    expect(pendenciasDaLoja({ ...loja, nfCodigoIbge: "4125506" } as Config)).toEqual([]);
  });

  it("CEP com pontuação vale; com menos de 8 dígitos, não", () => {
    expect(pendenciasDaLoja({ ...loja, nfCep: "83005-000" } as Config)).toEqual([]);
    expect(pendenciasDaLoja({ ...loja, nfCep: "8300" } as Config).join(" ")).toContain("CEP");
  });

  it("UF é a sigla de dois caracteres", () => {
    expect(pendenciasDaLoja({ ...loja, nfUf: "Paraná" } as Config).join(" ")).toContain("estado");
  });
});

describe("forma de pagamento vira código da SEFAZ", () => {
  it("cada forma tem o código que a nota exige", () => {
    // A SEFAZ não aceita a palavra "pix": quer 17. Sem a tradução a nota é
    // rejeitada inteira e volta um número que não diz nada no balcão.
    expect(CODIGO_PAGAMENTO.dinheiro).toBe("01");
    expect(CODIGO_PAGAMENTO.credito).toBe("03");
    expect(CODIGO_PAGAMENTO.debito).toBe("04");
    expect(CODIGO_PAGAMENTO.pix).toBe("17");
  });

  it("toda forma de pagamento do sistema tem código, sem sobrar nenhuma", () => {
    // Forma nova sem código aqui derruba a nota na hora do pagamento.
    const formas = ["dinheiro", "pix", "debito", "credito", "transferencia", "outro"];
    for (const f of formas) {
      expect(CODIGO_PAGAMENTO[f as keyof typeof CODIGO_PAGAMENTO], f).toMatch(/^\d{2}$/);
    }
    expect(Object.keys(CODIGO_PAGAMENTO).sort()).toEqual([...formas].sort());
  });
});

describe("prazo para cancelar a nota", () => {
  const emitida = "2026-08-07T12:00:00.000Z";

  it("acabou de emitir: 30 minutos inteiros", () => {
    expect(minutosRestantesParaCancelar(emitida, new Date("2026-08-07T12:00:00.000Z"))).toBe(30);
  });

  it("no meio do prazo, mostra o que resta", () => {
    expect(minutosRestantesParaCancelar(emitida, new Date("2026-08-07T12:18:00.000Z"))).toBe(12);
  });

  it("passou dos 30 minutos: zero, e aí não é mais cancelamento", () => {
    // Depois do prazo o caminho é nota de devolução, que é outro documento
    // e quem faz é o contador. A tela não pode oferecer o que não existe.
    expect(minutosRestantesParaCancelar(emitida, new Date("2026-08-07T12:31:00.000Z"))).toBe(0);
    expect(minutosRestantesParaCancelar(emitida, new Date("2026-08-08T09:00:00.000Z"))).toBe(0);
  });

  it("nota que nunca foi emitida não tem prazo nenhum", () => {
    expect(minutosRestantesParaCancelar(undefined)).toBe(0);
    expect(minutosRestantesParaCancelar("data podre")).toBe(0);
  });
});

describe("o que falta no produto", () => {
  it("produto com NCM está pronto: o resto cai no padrão da loja", () => {
    // Obrigar a digitar CFOP em duzentos produtos é o caminho para ninguém
    // preencher nenhum. Só o NCM não tem padrão possível.
    expect(pendenciasDoProduto(produto(), loja)).toEqual([]);
  });

  it("NCM com menos de 8 dígitos não passa, e a mensagem diz qual produto", () => {
    const faltas = pendenciasDoProduto(produto({ ncm: "1905" }), loja);
    expect(faltas).toHaveLength(1);
    // "falta o NCM" não diz em qual dos duzentos produtos.
    expect(faltas[0]).toContain("Pizza Calabresa");
    expect(faltas[0]).toContain("NCM");
  });

  it("NCM com pontuação continua valendo: é o dígito que conta", () => {
    expect(pendenciasDoProduto(produto({ ncm: "1905.90.90" }), loja)).toEqual([]);
  });

  it("CFOP de fora do estado é recusado", () => {
    // NFC-e é sempre venda a consumidor final DENTRO do estado. Um 6102 é
    // venda interestadual, e a SEFAZ rejeita a nota.
    expect(pendenciasDoProduto(produto({ cfop: "6102" }), loja).join(" ")).toContain("CFOP");
    expect(pendenciasDoProduto(produto({ cfop: "5102" }), loja)).toEqual([]);
  });

  it("origem fora da tabela 0 a 8 é recusada", () => {
    expect(pendenciasDoProduto(produto({ origem: "9" }), loja).join(" ")).toContain("origem");
  });

  it("no Simples cobra CSOSN de 3 dígitos; fora dele, CST de 2", () => {
    const normal = { ...loja, regimeTributario: "normal", cstPadrao: "00" } as Config;
    expect(pendenciasDoProduto(produto({ csosn: "10" }), loja).join(" ")).toContain("CSOSN");
    expect(pendenciasDoProduto(produto({ cst: "000" }), normal).join(" ")).toContain("CST");
    expect(pendenciasDoProduto(produto({ cst: "00" }), normal)).toEqual([]);
  });
});

describe("serviço e mercadoria são documentos diferentes", () => {
  const maoDeObra = produto({
    id: "srv",
    nome: "Mão de obra do conserto",
    servico: true,
    ncm: undefined,
    codigoServico: "14.01",
  });
  const comMunicipal = { ...loja, inscricaoMunicipal: "123456" } as Config;

  it("serviço nunca é cobrado por NCM — esse número não existe para ele", () => {
    // A primeira versão desta conferência exigia NCM de TODO produto. Um
    // serviço não tem NCM, nunca vai ter, e a pessoa ficaria procurando
    // para sempre um número que não existe.
    const faltas = pendenciasDoProduto(maoDeObra, comMunicipal);
    expect(faltas.join(" ")).not.toContain("NCM");
    expect(faltas.join(" ")).not.toContain("CFOP");
    expect(faltas).toEqual([]);
  });

  it("serviço é cobrado pelo código da lista de serviços", () => {
    const semCodigo = { ...maoDeObra, codigoServico: "" } as Produto;
    const faltas = pendenciasDoProduto(semCodigo, comMunicipal);
    expect(faltas.join(" ")).toContain("código do serviço");
    expect(faltas[0]).toContain("Mão de obra do conserto");
  });

  it("cada produto sabe qual documento ele vira", () => {
    expect(documentoDoProduto(maoDeObra)).toBe("nfse");
    expect(documentoDoProduto(produto())).toBe("nfce");
    expect(documentoDoProduto(undefined)).toBe("nfce");
  });

  it("quem só vende serviço não é cobrado por Inscrição Estadual", () => {
    // Mandar um lava-rápido atrás de inscrição estadual é mandar atrás de
    // papel que ele não vai usar.
    const soServico = { ...loja, inscricaoEstadual: "", inscricaoMunicipal: "123456" } as Config;
    expect(pendenciasDaLoja(soServico, ["nfse"])).toEqual([]);
    expect(pendenciasDaLoja(soServico, ["nfce"]).join(" ")).toContain("Inscrição Estadual");
  });

  it("quem só vende mercadoria não é cobrado por Inscrição Municipal", () => {
    expect(pendenciasDaLoja(loja, ["nfce"])).toEqual([]);
    expect(pendenciasDaLoja(loja, ["nfse"]).join(" ")).toContain("Inscrição Municipal");
  });

  it("a assistência técnica precisa das duas, porque vende peça E mão de obra", () => {
    // Este é o caso real: uma OS com peça e serviço gera dois documentos.
    const faltam = pendenciasDaLoja({ ...loja, inscricaoMunicipal: "" } as Config, [
      "nfce",
      "nfse",
    ]);
    expect(faltam.join(" ")).toContain("Inscrição Municipal");
    expect(pendenciasDaLoja(comMunicipal, ["nfce", "nfse"])).toEqual([]);
  });

  it("venda com peça e serviço junto cobra o que falta dos dois", () => {
    const itens = [
      { produtoId: "p1", descricao: "Fonte", quantidade: 1, precoUnit: 150, custoUnit: 90 },
      { produtoId: "srv", descricao: "Mão de obra", quantidade: 1, precoUnit: 80, custoUnit: 0 },
    ] as ItemVenda[];
    // A loja não tem inscrição municipal: a venda tem serviço, então cobra.
    const faltas = pendenciasParaEmitir(itens, [produto(), maoDeObra], loja);
    expect(faltas.join(" ")).toContain("Inscrição Municipal");
    // Com ela, a mesma venda passa: a peça tem NCM e o serviço tem código.
    expect(pendenciasParaEmitir(itens, [produto(), maoDeObra], comMunicipal)).toEqual([]);
  });

  it("venda só de mercadoria não cobra nada de serviço", () => {
    const itens = [
      { produtoId: "p1", descricao: "Fonte", quantidade: 1, precoUnit: 150, custoUnit: 90 },
    ] as ItemVenda[];
    expect(pendenciasParaEmitir(itens, [produto()], loja)).toEqual([]);
  });
});

describe("o padrão da loja preenche o que o produto não diz", () => {
  it("produto vazio herda CFOP, CSOSN e origem da loja", () => {
    const f = fiscalDoProduto(produto(), {
      ...loja,
      cfopPadrao: "5405",
      csosnPadrao: "500",
      origemPadrao: "1",
    } as Config);
    expect(f).toMatchObject({ cfop: "5405", codigoTributacao: "500", origem: "1" });
  });

  it("o que o produto diz ganha do padrão da loja", () => {
    const f = fiscalDoProduto(produto({ cfop: "5102", csosn: "102" }), {
      ...loja,
      cfopPadrao: "5405",
      csosnPadrao: "500",
    } as Config);
    expect(f).toMatchObject({ cfop: "5102", codigoTributacao: "102" });
  });

  it("sem padrão nenhum, cai no que a maioria das lojas usa", () => {
    const f = fiscalDoProduto(produto(), loja);
    expect(f).toMatchObject({ cfop: "5102", codigoTributacao: "102", origem: "0" });
  });

  it("produto por peso vai como KG, o resto como UN", () => {
    expect(fiscalDoProduto(produto({ porPeso: true }), loja).unidade).toBe("KG");
    expect(fiscalDoProduto(produto(), loja).unidade).toBe("UN");
    expect(fiscalDoProduto(produto({ unidadeTributavel: "cx" }), loja).unidade).toBe("CX");
  });
});

describe("o que impede esta venda de virar nota", () => {
  const item = (p: Partial<ItemVenda> = {}): ItemVenda =>
    ({ produtoId: "p1", descricao: "Pizza Calabresa", quantidade: 1, precoUnit: 45, custoUnit: 15, ...p }) as ItemVenda;

  it("venda de produto pronto, loja pronta: nada impede", () => {
    expect(pendenciasParaEmitir([item()], [produto()], loja)).toEqual([]);
  });

  it("devolve tudo de uma vez, não o primeiro problema", () => {
    // Quem vai preencher prefere ver os cinco produtos que faltam do que
    // descobrir um a cada tentativa.
    const faltas = pendenciasParaEmitir(
      [item(), item({ produtoId: "p2", descricao: "Refrigerante" })],
      [produto({ ncm: "" }), produto({ id: "p2", nome: "Refrigerante", ncm: "" })],
      { ...loja, inscricaoEstadual: "" } as Config
    );
    expect(faltas.length).toBe(3);
    expect(faltas.join(" ")).toContain("Inscrição Estadual");
    expect(faltas.join(" ")).toContain("Pizza Calabresa");
    expect(faltas.join(" ")).toContain("Refrigerante");
  });

  it("o mesmo produto em duas linhas é apontado uma vez só", () => {
    const faltas = pendenciasParaEmitir([item(), item()], [produto({ ncm: "" })], loja);
    expect(faltas).toHaveLength(1);
  });

  it("item avulso é apontado pelo que é: falta cadastro, não campo", () => {
    // Não adianta mandar preencher NCM de um item que não existe no
    // cadastro. A saída ali é cadastrar o produto.
    const faltas = pendenciasParaEmitir(
      [item({ produtoId: undefined, descricao: "Diversos" })],
      [produto()],
      loja
    );
    expect(faltas.join(" ")).toContain("Diversos");
    expect(faltas.join(" ")).toContain("avulso");
  });

  it("produto apagado do cadastro depois da venda não passa em branco", () => {
    const faltas = pendenciasParaEmitir([item({ produtoId: "sumiu" })], [produto()], loja);
    expect(faltas.join(" ")).toContain("não está mais no cadastro");
  });
});

describe("quantos produtos ainda não estão prontos", () => {
  it("conta só os que faltam algo", () => {
    const lista = [produto(), produto({ id: "p2", nome: "Suco", ncm: "" })];
    expect(produtosSemFiscal(lista, loja).map((p) => p.nome)).toEqual(["Suco"]);
  });
});

describe("regime tributário", () => {
  it("quem nunca escolheu fica no Simples, que é a maioria das lojas de bairro", () => {
    expect(regimeDe(undefined)).toBe("simples");
    expect(regimeDe("qualquer coisa")).toBe("simples");
    expect(usaCsosn(regimeDe(undefined))).toBe(true);
  });

  it("só o Simples puro usa CSOSN", () => {
    expect(usaCsosn("simples")).toBe(true);
    expect(usaCsosn("simples_excesso")).toBe(false);
    expect(usaCsosn("normal")).toBe(false);
  });
});

/**
 * A taxa de serviço da mesa é uma linha da venda sem produtoId — e a regra
 * do item avulso mandava "cadastre o produto". Conselho errado: gorjeta não
 * tem NCM e nunca vai ter. Quem sabe declarar taxa de serviço é o emissor.
 */
describe("a gorjeta não é mercadoria", () => {
  const lojaOk: Config = {
    ...({} as Config),
    cnpj: "11222333000181",
    inscricaoEstadual: "1234567890",
    regimeTributario: "simples",
    nfLogradouro: "Rua das Flores",
    nfNumero: "123",
    nfBairro: "Centro",
    nfCep: "83010000",
    nfMunicipio: "São José dos Pinhais",
    nfCodigoIbge: "4125506",
    nfUf: "PR",
  };
  const pizza: Produto = {
    id: "p1",
    nome: "Pizza",
    quantidade: 10,
    estoqueMinimo: 1,
    custo: 15,
    preco: 60,
    criadoEm: "",
    ncm: "19059090",
    cfop: "5102",
    csosn: "102",
    origem: "0",
  };

  it("a linha da taxa não vira pendência de NCM", () => {
    const itens: ItemVenda[] = [
      { produtoId: "p1", descricao: "Pizza", quantidade: 1, precoUnit: 60, custoUnit: 15 },
      { descricao: "Taxa de servico 10%", quantidade: 1, precoUnit: 6, custoUnit: 0, taxaServico: true },
    ];
    expect(pendenciasParaEmitir(itens, [pizza], lojaOk)).toEqual([]);
  });

  it("item avulso de verdade continua sendo apontado", () => {
    // A marca é só para a taxa. Peça digitada na mão continua impedindo a
    // nota, porque ali a saída é cadastrar o produto mesmo.
    const itens: ItemVenda[] = [
      { descricao: "Cabo avulso", quantidade: 1, precoUnit: 10, custoUnit: 4 },
    ];
    expect(pendenciasParaEmitir(itens, [pizza], lojaOk).join(" ")).toContain("Cabo avulso");
  });
});
