import { describe, it, expect } from "vitest";
import { conferirTudo, dinheiroEmRisco, contarPorGravidade, type Dados } from "./integridade";
import type {
  Cliente,
  Fiado,
  MovimentoCaixa,
  OrdemServico,
  Produto,
  SessaoCaixa,
  Venda,
} from "./types";

const HOJE = new Date("2026-07-10T12:00:00.000Z");

const vazio = (): Dados => ({
  ordens: [],
  vendas: [],
  movimentos: [],
  produtos: [],
  fiados: [],
  clientes: [],
  sessoes: [],
});

const venda = (v: Partial<Venda>): Venda =>
  ({
    id: "v1",
    numero: 12,
    itens: [{ descricao: "x", quantidade: 1, precoUnit: 100, custoUnit: 50 }],
    desconto: 0,
    formaPagamento: "dinheiro",
    criadoEm: "2026-07-09T10:00:00.000Z",
    ...v,
  }) as Venda;

const mov = (m: Partial<MovimentoCaixa>): MovimentoCaixa =>
  ({
    id: "m1",
    tipo: "entrada",
    categoria: "Venda",
    descricao: "Venda 12 (1 item(ns))",
    valor: 100,
    formaPagamento: "dinheiro",
    data: "2026-07-09T10:00:00.000Z",
    ...m,
  }) as MovimentoCaixa;

const os = (o: Partial<OrdemServico>): OrdemServico =>
  ({
    id: "o1",
    numero: 5,
    clienteId: "c1",
    tipoAparelho: "PC",
    marca: "",
    modelo: "",
    defeitoRelatado: "",
    checklist: {},
    pecas: [],
    maoDeObra: 200,
    desconto: 0,
    status: "entregue",
    garantiaDias: 90,
    historico: [],
    criadoEm: "2026-07-01T00:00:00.000Z",
    atualizadoEm: "2026-07-09T00:00:00.000Z",
    entregueEm: "2026-07-09T00:00:00.000Z",
    ...o,
  }) as OrdemServico;

const prod = (p: Partial<Produto>): Produto =>
  ({
    id: "p1",
    nome: "Arroz",
    quantidade: 10,
    estoqueMinimo: 1,
    custo: 10,
    preco: 20,
    criadoEm: "2026-01-01",
    ...p,
  }) as Produto;

describe("venda gravada sem o dinheiro no caixa", () => {
  it("acusa quando o movimento não existe", () => {
    // A gravação é em duas etapas e a rede cai entre uma e outra: o cupom
    // existe, a mercadoria saiu, e o caixa não sabe.
    const d = { ...vazio(), vendas: [venda({})] };
    const a = conferirTudo(d, HOJE).filter((x) => x.tipo === "venda-sem-caixa");
    expect(a).toHaveLength(1);
    expect(a[0].gravidade).toBe("erro");
    expect(a[0].valor).toBe(100);
  });

  it("venda com movimento vinculado não acusa", () => {
    const d = {
      ...vazio(),
      vendas: [venda({ movimentoId: "m1" })],
      movimentos: [mov({ id: "m1" })],
    };
    expect(conferirTudo(d, HOJE).filter((x) => x.tipo === "venda-sem-caixa")).toEqual([]);
  });

  it("venda antiga sem vínculo casa pela descrição do movimento", () => {
    // Vendas gravadas antes do campo existir não têm movimentoId. Acusar
    // todas elas encheria a tela de alarme falso no primeiro uso.
    const d = { ...vazio(), vendas: [venda({})], movimentos: [mov({ id: "outro" })] };
    expect(conferirTudo(d, HOJE).filter((x) => x.tipo === "venda-sem-caixa")).toEqual([]);
  });

  it("descrição de OUTRA venda não conta como vínculo", () => {
    // "Venda 1" não pode cobrir a "Venda 12": sem o espaço no fim, todo
    // número que começa igual passaria batido.
    const d = {
      ...vazio(),
      vendas: [venda({ numero: 12 })],
      movimentos: [mov({ descricao: "Venda 1 (2 item(ns))" })],
    };
    expect(conferirTudo(d, HOJE).filter((x) => x.tipo === "venda-sem-caixa")).toHaveLength(1);
  });
});

describe("OS entregue sem pagamento", () => {
  it("é o buraco mais caro: acusa como erro, com o valor", () => {
    const a = conferirTudo({ ...vazio(), ordens: [os({})] }, HOJE);
    const achado = a.find((x) => x.tipo === "os-sem-pagamento");
    expect(achado?.gravidade).toBe("erro");
    expect(achado?.valor).toBe(200);
    expect(achado?.saida).toContain("Receber");
  });

  it("com movimento vinculado não acusa", () => {
    const d = { ...vazio(), ordens: [os({})], movimentos: [mov({ osId: "o1" })] };
    expect(conferirTudo(d, HOJE).filter((x) => x.tipo === "os-sem-pagamento")).toEqual([]);
  });

  it("com fiado lançado não acusa", () => {
    const fiado = { id: "f1", clienteId: "c1", osId: "o1", valor: 200, pagamentos: [], quitado: false, descricao: "", criadoEm: "" } as Fiado;
    const d = { ...vazio(), ordens: [os({})], fiados: [fiado], clientes: [{ id: "c1" } as Cliente] };
    expect(conferirTudo(d, HOJE).filter((x) => x.tipo === "os-sem-pagamento")).toEqual([]);
  });

  it("OS de valor zero não acusa: não havia o que receber", () => {
    const d = { ...vazio(), ordens: [os({ maoDeObra: 0 })] };
    expect(conferirTudo(d, HOJE).filter((x) => x.tipo === "os-sem-pagamento")).toEqual([]);
  });

  it("OS que ainda não foi entregue não acusa", () => {
    const d = { ...vazio(), ordens: [os({ status: "pronta" })] };
    expect(conferirTudo(d, HOJE).filter((x) => x.tipo === "os-sem-pagamento")).toEqual([]);
  });
});

describe("estoque negativo", () => {
  it("acusa e explica que falta lançar entrada", () => {
    const d = { ...vazio(), produtos: [prod({ quantidade: -3 })] };
    const a = conferirTudo(d, HOJE).find((x) => x.tipo === "estoque-negativo");
    expect(a?.titulo).toContain("-3");
    expect(a?.saida).toContain("Contagem");
  });

  it("serviço nunca é estoque negativo", () => {
    const d = { ...vazio(), produtos: [prod({ servico: true, quantidade: -99 })] };
    expect(conferirTudo(d, HOJE).filter((x) => x.tipo === "estoque-negativo")).toEqual([]);
  });

  it("estoque zerado não é problema", () => {
    const d = { ...vazio(), produtos: [prod({ quantidade: 0 })] };
    expect(conferirTudo(d, HOJE).filter((x) => x.tipo === "estoque-negativo")).toEqual([]);
  });
});

describe("dívida sem dono e caixa esquecido", () => {
  it("fiado de cliente apagado vira achado", () => {
    const fiado = { id: "f1", clienteId: "sumiu", valor: 300, pagamentos: [], quitado: false, descricao: "", criadoEm: "" } as Fiado;
    const a = conferirTudo({ ...vazio(), fiados: [fiado] }, HOJE);
    expect(a.find((x) => x.tipo === "fiado-orfao")?.valor).toBe(300);
  });

  it("fiado quitado de cliente apagado não interessa mais", () => {
    const fiado = { id: "f1", clienteId: "sumiu", valor: 300, pagamentos: [], quitado: true, descricao: "", criadoEm: "" } as Fiado;
    expect(conferirTudo({ ...vazio(), fiados: [fiado] }, HOJE)).toEqual([]);
  });

  it("caixa aberto há dias faz o fechamento perder o sentido", () => {
    const s = { id: "s1", abertoEm: "2026-07-01T08:00:00.000Z", valorAbertura: 100 } as SessaoCaixa;
    const a = conferirTudo({ ...vazio(), sessoes: [s] }, HOJE);
    expect(a.find((x) => x.tipo === "caixa-esquecido")?.titulo).toContain("9 dias");
  });

  it("caixa aberto hoje é o normal, não um achado", () => {
    const s = { id: "s1", abertoEm: "2026-07-10T08:00:00.000Z", valorAbertura: 100 } as SessaoCaixa;
    expect(conferirTudo({ ...vazio(), sessoes: [s] }, HOJE)).toEqual([]);
  });

  it("caixa já fechado nunca acusa", () => {
    const s = {
      id: "s1",
      abertoEm: "2026-01-01T08:00:00.000Z",
      fechadoEm: "2026-01-01T20:00:00.000Z",
      valorAbertura: 100,
    } as SessaoCaixa;
    expect(conferirTudo({ ...vazio(), sessoes: [s] }, HOJE)).toEqual([]);
  });
});

describe("a ordem em que os achados aparecem", () => {
  it("erro primeiro, e dentro dele o de maior valor", () => {
    // Com vinte achados na tela, o que decide é qual custa mais dinheiro.
    const d: Dados = {
      ...vazio(),
      produtos: [prod({ quantidade: -1 })], // alerta
      vendas: [venda({ numero: 1, itens: [{ descricao: "x", quantidade: 1, precoUnit: 50, custoUnit: 0 }] })],
      ordens: [os({ maoDeObra: 900 })], // erro, valor maior
    };
    const a = conferirTudo(d, HOJE);
    expect(a[0].tipo).toBe("os-sem-pagamento");
    expect(a[1].tipo).toBe("venda-sem-caixa");
    expect(a[2].gravidade).toBe("alerta");
  });

  it("soma o dinheiro em risco só dos erros", () => {
    const d: Dados = {
      ...vazio(),
      ordens: [os({ maoDeObra: 200 })],
      produtos: [prod({ quantidade: -1 })],
    };
    expect(dinheiroEmRisco(conferirTudo(d, HOJE))).toBe(200);
  });

  it("conta por gravidade para a tela resumir", () => {
    const d: Dados = { ...vazio(), ordens: [os({})], produtos: [prod({ quantidade: -1 })] };
    const c = contarPorGravidade(conferirTudo(d, HOJE));
    expect(c.erro).toBe(1);
    expect(c.alerta).toBe(1);
  });

  it("sistema limpo não devolve achado nenhum", () => {
    expect(conferirTudo(vazio(), HOJE)).toEqual([]);
  });

  it("todo achado diz o que fazer", () => {
    // Lista de problemas sem saída vira tela que a pessoa fecha sem ler.
    const d: Dados = {
      ...vazio(),
      ordens: [os({}), os({ id: "o2", numero: 6, status: "aberta", atualizadoEm: "2026-01-01T00:00:00Z" })],
      produtos: [prod({ quantidade: -1 })],
      vendas: [venda({ itens: [{ descricao: "x", quantidade: 1, precoUnit: 0, custoUnit: 0 }] })],
    };
    for (const a of conferirTudo(d, HOJE)) {
      expect(a.saida.trim().length, a.titulo).toBeGreaterThan(20);
      expect(a.titulo.trim()).not.toBe("");
    }
  });
});

describe("OS esquecida na bancada", () => {
  it("acusa a que não se move há mais de 30 dias", () => {
    const d = {
      ...vazio(),
      ordens: [os({ status: "em_reparo", atualizadoEm: "2026-05-01T00:00:00.000Z" })],
    };
    const a = conferirTudo(d, HOJE).find((x) => x.tipo === "os-parada");
    expect(a?.titulo).toContain("70 dias");
    expect(a?.saida).toContain("cancele");
  });

  it("OS entregue ou cancelada não conta como parada", () => {
    const d = {
      ...vazio(),
      ordens: [
        os({ id: "a", status: "cancelada", atualizadoEm: "2026-01-01T00:00:00.000Z", maoDeObra: 0 }),
      ],
    };
    expect(conferirTudo(d, HOJE).filter((x) => x.tipo === "os-parada")).toEqual([]);
  });
});

/**
 * A conferência roda no PAINEL, a cada mudança de dado.
 *
 * A primeira versão varria a lista de movimentos inteira para cada venda e
 * para cada ordem. Com 3.000 de cada, eram nove milhões de comparações de
 * texto: meio segundo travando a tela toda vez que alguém registrava uma
 * venda. Numa loja com dois anos de histórico, o painel não abria.
 *
 * Este teste não mede tempo — medir tempo em teste é frágil e falha em
 * máquina lenta. Ele fixa o que causava o problema: o custo tem que crescer
 * junto com os dados, não ao quadrado.
 */
describe("a conferência não pode travar o painel", () => {
  /**
   * Conta quantas vezes cada movimento é LIDO, em vez de cronometrar.
   *
   * A primeira versão deste teste media `performance.now()` e comparava a
   * razão entre 1.000 e 2.000 registros. Falhava sozinha em máquina
   * ocupada — 10ms contra 10ms é ruído, não medição — e teste que falha à
   * toa é teste que a gente aprende a ignorar.
   *
   * O que causava o travamento era varrer a lista inteira de movimentos
   * para cada venda. Então o que o teste fixa é isto, e nada mais: cada
   * movimento é lido um punhado de vezes, não uma vez por venda.
   */
  const gerar = (n: number, leituras: { total: number }): Dados => ({
    ordens: Array.from({ length: n }, (_, i) =>
      os({ id: `o${i}`, numero: i, maoDeObra: 10 })
    ),
    vendas: Array.from({ length: n }, (_, i) => venda({ id: `v${i}`, numero: i })),
    movimentos: Array.from({ length: n }, (_, i) => {
      const m = mov({ id: `m${i}`, osId: `o${i}` });
      const descricao = `Venda ${i} (1 item(ns))`;
      Object.defineProperty(m, "descricao", {
        get() {
          leituras.total++;
          return descricao;
        },
      });
      return m;
    }),
    produtos: [],
    fiados: [],
    clientes: [],
    sessoes: [],
  });

  it("com tudo vinculado, nada é acusado — mesmo em volume", () => {
    // Se o casamento por número quebrar, este teste explode em 2.000 achados
    // falsos em vez de passar em silêncio.
    expect(conferirTudo(gerar(1000, { total: 0 }), HOJE)).toEqual([]);
  });

  it("dobrar os dados não multiplica as leituras por quatro", () => {
    const ler = (n: number) => {
      const leituras = { total: 0 };
      conferirTudo(gerar(n, leituras), HOJE);
      return leituras.total;
    };
    const mil = ler(1000);
    const doisMil = ler(2000);

    // Linear: uma leitura por movimento, com alguma folga para o dia em que
    // outra conferência precisar do mesmo campo.
    expect(mil).toBeLessThanOrEqual(1000 * 3);
    // Quadrático daria 4x aqui. Se voltar, este número explode.
    expect(doisMil / mil).toBeLessThan(2.5);
  });
});

/**
 * O espelho de "OS entregue sem pagamento", e o mais caro dos dois.
 *
 * Receita a menos aparece: o dono conta a gaveta e sente falta. Receita a
 * MAIS não aparece em lugar nenhum — o mês fecha melhor do que foi.
 */
describe("OS cobrada duas vezes", () => {
  const os200 = (): OrdemServico =>
    ({
      id: "o1",
      numero: 7,
      status: "entregue",
      pecas: [],
      maoDeObra: 200,
      desconto: 0,
      historico: [],
      criadoEm: "2026-07-01T10:00:00.000Z",
    }) as unknown as OrdemServico;

  const entrada = (id: string, valor: number): MovimentoCaixa =>
    ({
      id,
      tipo: "entrada",
      categoria: "OS",
      descricao: "OS00007",
      valor,
      formaPagamento: "dinheiro",
      osId: "o1",
      data: "2026-07-02T10:00:00.000Z",
    }) as MovimentoCaixa;

  const base = (p: Partial<Dados> = {}): Dados => ({
    ordens: [os200()],
    vendas: [],
    movimentos: [],
    produtos: [],
    fiados: [],
    clientes: [],
    sessoes: [],
    ...p,
  });

  it("acusa quando os lançamentos somam mais do que a OS vale", () => {
    const a = conferirTudo(base({ movimentos: [entrada("m1", 200), entrada("m2", 200)] }))
      .filter((x) => x.tipo === "os-paga-duas-vezes");
    expect(a).toHaveLength(1);
    expect(a[0].gravidade).toBe("erro");
    // O valor do achado é o EXCESSO: é isso que precisa sair.
    expect(a[0].valor).toBe(200);
  });

  it("pagamento dividido em duas formas NÃO é cobrança dupla", () => {
    // Duas entradas somando o total é o normal da venda dividida.
    const a = conferirTudo(base({ movimentos: [entrada("m1", 150), entrada("m2", 50)] }))
      .filter((x) => x.tipo === "os-paga-duas-vezes");
    expect(a).toEqual([]);
  });

  it("pega também caixa mais fiado pela mesma OS", () => {
    const fiado = { id: "f1", clienteId: "c1", osId: "o1", valor: 200, pagamentos: [], quitado: false, criadoEm: "" } as unknown as Fiado;
    const a = conferirTudo(base({ movimentos: [entrada("m1", 200)], fiados: [fiado] }))
      .filter((x) => x.tipo === "os-paga-duas-vezes");
    expect(a).toHaveLength(1);
  });

  it("um lançamento só não acusa nada", () => {
    expect(
      conferirTudo(base({ movimentos: [entrada("m1", 200)] })).filter(
        (x) => x.tipo === "os-paga-duas-vezes"
      )
    ).toEqual([]);
  });

  it("o excesso entra no dinheiro em risco", () => {
    const achados = conferirTudo(base({ movimentos: [entrada("m1", 200), entrada("m2", 200)] }));
    expect(dinheiroEmRisco(achados)).toBeGreaterThanOrEqual(200);
  });
});
