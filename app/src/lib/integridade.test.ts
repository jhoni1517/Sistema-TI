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
  const gerar = (n: number): Dados => ({
    ordens: Array.from({ length: n }, (_, i) =>
      os({ id: `o${i}`, numero: i, maoDeObra: 10 })
    ),
    vendas: Array.from({ length: n }, (_, i) => venda({ id: `v${i}`, numero: i })),
    movimentos: Array.from({ length: n }, (_, i) =>
      mov({ id: `m${i}`, descricao: `Venda ${i} (1 item(ns))`, osId: `o${i}` })
    ),
    produtos: [],
    fiados: [],
    clientes: [],
    sessoes: [],
  });

  it("com tudo vinculado, nada é acusado — mesmo em volume", () => {
    // Se o casamento por número quebrar, este teste explode em 2.000 achados
    // falsos em vez de passar em silêncio.
    expect(conferirTudo(gerar(1000), HOJE)).toEqual([]);
  });

  it("dobrar os dados não multiplica o trabalho por quatro", () => {
    const medir = (n: number) => {
      const d = gerar(n);
      const t = performance.now();
      conferirTudo(d, HOJE);
      return performance.now() - t + 1; // +1 evita divisão por zero
    };
    // Aquece, para o primeiro custo de compilação não distorcer a razão.
    medir(200);
    const razao = medir(2000) / medir(1000);
    // Linear ficaria perto de 2; quadrático passa de 4 com folga. A margem é
    // generosa de propósito: o que se quer pegar é a volta do quadrático.
    expect(razao).toBeLessThan(3.5);
  });
});
