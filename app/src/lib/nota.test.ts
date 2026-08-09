import { describe, it, expect } from "vitest";
import {
  pedidoDaNota,
  problemaParaEmitir,
  podeTentar,
  precisaDeAtencao,
  podeCancelar,
  notaPendente,
  notaDaVenda,
  notasComProblema,
  MAXIMO_DE_TENTATIVAS,
  type Nota,
} from "./nota";
import type { Cliente, Config, Produto, Venda } from "./types";

const loja: Config = {
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
  nome: "Pizza Calabresa",
  sku: "PIZ-CAL",
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

const venda = (v: Partial<Venda> = {}): Venda =>
  ({
    id: "v1",
    numero: 1,
    itens: [
      { produtoId: "p1", descricao: "Pizza Calabresa", quantidade: 1, precoUnit: 60, custoUnit: 15 },
    ],
    desconto: 0,
    formaPagamento: "dinheiro",
    criadoEm: "2026-08-09T20:00:00.000Z",
    ...v,
  }) as Venda;

const nota = (x: Partial<Nota> = {}): Nota =>
  ({ id: "n1", vendaId: "v1", tipo: "nfce", situacao: "pendente", tentativas: 0, ...x }) as Nota;

describe("o pedido que vai para o emissor", () => {
  it("leva o item com os códigos do cadastro", () => {
    const p = pedidoDaNota(venda(), [pizza], loja);
    expect(p.itens).toHaveLength(1);
    const i = p.itens[0];
    expect(i.numero).toBe(1);
    expect(i.codigo).toBe("PIZ-CAL");
    expect(i.ncm).toBe("19059090");
    expect(i.cfop).toBe("5102");
    expect(i.codigoTributacao).toBe("102"); // CSOSN, porque a loja é do Simples
    expect(i.origem).toBe("0");
    expect(i.valorBruto).toBe(60);
  });

  it("fora do Simples, o item leva CST e não CSOSN", () => {
    // São campos diferentes na nota. Mandar o errado a SEFAZ rejeita.
    const normal = { ...loja, regimeTributario: "normal" as const, cstPadrao: "00" };
    expect(pedidoDaNota(venda(), [pizza], normal).itens[0].codigoTributacao).toBe("00");
  });

  it("a forma de pagamento vira o código da SEFAZ", () => {
    expect(pedidoDaNota(venda(), [pizza], loja).pagamentos).toEqual([
      { formaPagamento: "01", valor: 60 },
    ]);
    expect(
      pedidoDaNota(venda({ formaPagamento: "vale_refeicao" }), [pizza], loja).pagamentos[0]
        .formaPagamento
    ).toBe("11");
  });

  it("venda dividida manda uma linha de pagamento por forma", () => {
    // A nota tem que fechar com o que entrou no caixa, senão a conferência
    // do contador não bate com a do sistema.
    const v = venda({
      itens: [
        { produtoId: "p1", descricao: "Pizza", quantidade: 2, precoUnit: 60, custoUnit: 15 },
      ],
      formaPagamento: "credito",
      pagamentos: [
        { forma: "credito", valor: 80 },
        { forma: "dinheiro", valor: 40 },
      ],
    });
    expect(pedidoDaNota(v, [pizza], loja).pagamentos).toEqual([
      { formaPagamento: "03", valor: 80 },
      { formaPagamento: "01", valor: 40 },
    ]);
  });

  it("o desconto vai no TOTAL, não rateado por item", () => {
    /*
     * Ratear obriga a distribuir centavo por centavo e, quando a divisão não
     * é exata, a soma dos itens deixa de bater com o total — que é
     * exatamente o erro que a SEFAZ rejeita.
     */
    const p = pedidoDaNota(venda({ desconto: 10 }), [pizza], loja);
    expect(p.itens[0].valorBruto).toBe(60);
    expect(p.valorDesconto).toBe(10);
    expect(p.valorTotal).toBe(50);
  });

  it("o valor do item é o subtotal ARREDONDADO, igual ao do cupom", () => {
    // A SEFAZ confere a soma. Somar sem arredondar produz um total diferente
    // do que está escrito nos itens.
    const porPeso = venda({
      itens: [
        { produtoId: "p1", descricao: "Queijo", quantidade: 0.315, precoUnit: 24.9, custoUnit: 10 },
      ],
    });
    expect(pedidoDaNota(porPeso, [pizza], loja).itens[0].valorBruto).toBe(7.84);
  });

  it("linha sem cadastro entra com código próprio em vez de inventar um", () => {
    // É a taxa de serviço e a taxa de entrega. Inventar um código faria a
    // nota apontar para um produto que não existe.
    const comTaxa = venda({
      itens: [
        { produtoId: "p1", descricao: "Pizza", quantidade: 1, precoUnit: 60, custoUnit: 15 },
        { descricao: "Taxa de servico 10%", quantidade: 1, precoUnit: 6, custoUnit: 0, taxaServico: true },
      ],
    });
    expect(pedidoDaNota(comTaxa, [pizza], loja).itens[1].codigo).toBe("SEM CADASTRO");
  });
});

describe("o CPF na nota", () => {
  const cliente = (cpf?: string): Cliente =>
    ({ id: "c1", nome: "Maria Silva", telefone: "", cpf, criadoEm: "" }) as Cliente;

  it("sem cliente, é nota sem identificação — que é a maioria no balcão", () => {
    const p = pedidoDaNota(venda(), [pizza], loja);
    expect(p.cpfDestinatario).toBeUndefined();
    expect(p.nomeDestinatario).toBeUndefined();
  });

  it("com CPF completo, vai só os dígitos e o nome junto", () => {
    const p = pedidoDaNota(venda(), [pizza], loja, cliente("529.982.247-25"));
    expect(p.cpfDestinatario).toBe("52998224725");
    expect(p.nomeDestinatario).toBe("Maria Silva");
  });

  it("CPF pela metade não vai: a SEFAZ rejeita a nota inteira", () => {
    expect(pedidoDaNota(venda(), [pizza], loja, cliente("5299822")).cpfDestinatario).toBeUndefined();
  });

  it("CNPJ no cadastro não vira CPF de destinatário", () => {
    // 14 dígitos não é CPF. Mandar como se fosse é nota rejeitada.
    expect(
      pedidoDaNota(venda(), [pizza], loja, cliente("11222333000181")).cpfDestinatario
    ).toBeUndefined();
  });
});

describe("o que impede de emitir", () => {
  it("venda pronta não tem impedimento", () => {
    expect(problemaParaEmitir(venda(), [pizza], loja)).toBe("");
  });

  it("venda de total zero é recusada antes de sair", () => {
    // Nota de R$ 0,00 é rejeitada pela SEFAZ, e descobrir isso depois é uma
    // ida e volta com o cliente esperando.
    const v = venda({ desconto: 60 });
    expect(problemaParaEmitir(v, [pizza], loja)).toContain("zero");
  });

  it("venda sem itens é recusada", () => {
    expect(problemaParaEmitir(venda({ itens: [] }), [pizza], loja)).toContain("sem itens");
  });

  it("lista TODAS as pendências de uma vez, não a primeira", () => {
    // Quem vai preencher prefere ver os cinco produtos que faltam do que
    // descobrir um a cada tentativa, com o cliente esperando o cupom.
    const semFiscal: Produto = { ...pizza, ncm: "", cfop: "", csosn: "" };
    const semRegime = { ...loja, csosnPadrao: "", cfopPadrao: "" };
    const p = problemaParaEmitir(venda(), [semFiscal], semRegime);
    expect(p).toContain("NCM");
    expect(p.split("\n").filter((l) => l.startsWith("-")).length).toBeGreaterThan(0);
  });
});

/**
 * Nota recusada por dado errado vai ser recusada para sempre. Sem um teto, o
 * robô bate na mesma pedra todo dia e a loja recebe o mesmo aviso até parar
 * de ler avisos.
 */
describe("quando parar de tentar", () => {
  it("pendente e sem estourar o teto, tenta", () => {
    expect(podeTentar(nota())).toBe(true);
    expect(podeTentar(nota({ tentativas: MAXIMO_DE_TENTATIVAS - 1 }))).toBe(true);
  });

  it("estourou o teto, para de tentar e passa a pedir gente", () => {
    const cansada = nota({ tentativas: MAXIMO_DE_TENTATIVAS });
    expect(podeTentar(cansada)).toBe(false);
    expect(precisaDeAtencao(cansada)).toBe(true);
  });

  it("autorizada e cancelada acabaram", () => {
    expect(podeTentar(nota({ situacao: "autorizada" }))).toBe(false);
    expect(podeTentar(nota({ situacao: "cancelada" }))).toBe(false);
    expect(precisaDeAtencao(nota({ situacao: "autorizada" }))).toBe(false);
  });

  it("rejeitada pede gente na hora, sem esperar o teto", () => {
    // A SEFAZ já disse o que está errado: insistir não muda a resposta.
    expect(precisaDeAtencao(nota({ situacao: "rejeitada" }))).toBe(true);
    expect(podeTentar(nota({ situacao: "rejeitada" }))).toBe(false);
  });

  it("só a autorizada pode ser cancelada", () => {
    // Não existe cancelar o que nunca foi autorizado, e a tela não pode
    // oferecer o que não existe.
    expect(podeCancelar(nota({ situacao: "autorizada" }))).toBe(true);
    expect(podeCancelar(nota())).toBe(false);
    expect(podeCancelar(nota({ situacao: "cancelada" }))).toBe(false);
  });
});

describe("a fila", () => {
  it("a nota nasce pendente, sem tentativa e sem erro", () => {
    // Pendente não é erro: é o estado normal de quem acabou de vender.
    const nova = notaPendente("n9", venda(), "2026-08-09T20:00:00.000Z");
    expect(nova.situacao).toBe("pendente");
    expect(nova.tentativas).toBe(0);
    expect(nova.erro).toBeUndefined();
    expect(nova.vendaId).toBe("v1");
  });

  it("acha a nota de uma venda", () => {
    const lista = [nota({ id: "a", vendaId: "v1" }), nota({ id: "b", vendaId: "v2" })];
    expect(notaDaVenda(lista, "v2")?.id).toBe("b");
    expect(notaDaVenda(lista, "v9")).toBeUndefined();
    expect(notaDaVenda(lista, undefined)).toBeUndefined();
  });

  it("as com problema vêm da mais antiga: nota parada é imposto atrasado", () => {
    const lista = [
      nota({ id: "nova", situacao: "rejeitada", criadoEm: "2026-08-09" }),
      nota({ id: "ok", situacao: "autorizada", criadoEm: "2026-01-01" }),
      nota({ id: "velha", situacao: "rejeitada", criadoEm: "2026-02-01" }),
    ];
    expect(notasComProblema(lista).map((x) => x.id)).toEqual(["velha", "nova"]);
  });
});
