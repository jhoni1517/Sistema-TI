import { describe, it, expect } from "vitest";
import {
  aoApagarCliente,
  aoApagarProduto,
  aoApagarOrdem,
  aoApagarFiado,
  textoDaConfirmacao,
} from "./exclusao";
import type { Cliente, Fiado, MovimentoCaixa, OrdemServico, Produto, Venda } from "./types";

const cli = (p: Partial<Cliente>): Cliente =>
  ({ id: "c1", nome: "João", telefone: "11999999999", criadoEm: "", ...p }) as Cliente;

const fiado = (p: Partial<Fiado>): Fiado =>
  ({
    id: "f1",
    clienteId: "c1",
    descricao: "",
    valor: 340,
    pagamentos: [],
    quitado: false,
    criadoEm: "",
    ...p,
  }) as Fiado;

const os = (p: Partial<OrdemServico>): OrdemServico =>
  ({
    id: "o1",
    numero: 7,
    clienteId: "c1",
    tipoAparelho: "Notebook",
    marca: "Dell",
    modelo: "G15",
    defeitoRelatado: "",
    checklist: {},
    pecas: [],
    maoDeObra: 0,
    desconto: 0,
    status: "em_reparo",
    garantiaDias: 90,
    historico: [],
    criadoEm: "",
    atualizadoEm: "",
    ...p,
  }) as OrdemServico;

const prod = (p: Partial<Produto>): Produto =>
  ({
    id: "p1",
    nome: "Fonte 500W",
    quantidade: 5,
    estoqueMinimo: 1,
    custo: 200,
    preco: 400,
    criadoEm: "",
    ...p,
  }) as Produto;

const venda = (p: Partial<Venda>): Venda =>
  ({
    id: "v1",
    numero: 1,
    itens: [],
    desconto: 0,
    formaPagamento: "dinheiro",
    criadoEm: "",
    ...p,
  }) as Venda;

const semNada = { fiados: [], ordens: [], vendas: [], movimentos: [] };

describe("apagar cliente", () => {
  it("dívida em aberto TRAVA: some o telefone de quem deve", () => {
    // É exatamente isto que virava "fiado órfão" na conferência: dívida sem
    // dono e sem como cobrar.
    const r = aoApagarCliente(cli({}), { ...semNada, fiados: [fiado({})] });
    expect(r.pode).toBe(false);
    expect(r.titulo).toContain("340.00");
    expect(r.saida).toContain("A Receber");
  });

  it("dívida já quitada não trava", () => {
    const r = aoApagarCliente(cli({}), { ...semNada, fiados: [fiado({ quitado: true })] });
    expect(r.pode).toBe(true);
  });

  it("dívida de OUTRO cliente não trava este", () => {
    const r = aoApagarCliente(cli({}), {
      ...semNada,
      fiados: [fiado({ clienteId: "outro" })],
    });
    expect(r.pode).toBe(true);
  });

  it("aparelho na bancada TRAVA, e diz quais", () => {
    // Apagar deixa aparelho de gente na loja sem saber de quem é.
    const r = aoApagarCliente(cli({}), { ...semNada, ordens: [os({})] });
    expect(r.pode).toBe(false);
    expect(r.perdas[0]).toContain("OS00007");
    expect(r.perdas[0]).toContain("Dell");
  });

  it("OS entregue não é aparelho na bancada", () => {
    const r = aoApagarCliente(cli({}), { ...semNada, ordens: [os({ status: "entregue" })] });
    expect(r.pode).toBe(true);
  });

  it("cliente limpo pode ser apagado, mas a tela avisa o que some", () => {
    const r = aoApagarCliente(cli({}), {
      ...semNada,
      ordens: [os({ status: "entregue" })],
      vendas: [venda({ clienteId: "c1" })],
    });
    expect(r.pode).toBe(true);
    expect(r.perdas.join(" ")).toContain("1 ordem");
    expect(r.perdas.join(" ")).toContain("1 compra");
    expect(r.perdas.join(" ")).toContain("11999999999");
  });
});

describe("apagar produto", () => {
  it("produto já vendido NÃO se apaga", () => {
    // O cupom do cliente cita o nome, e o relatório passaria a mostrar venda
    // de item que não existe.
    const v = venda({ itens: [{ produtoId: "p1", descricao: "x", quantidade: 1, precoUnit: 1, custoUnit: 0 }] });
    const r = aoApagarProduto(prod({}), { vendas: [v], ordens: [] });
    expect(r.pode).toBe(false);
    expect(r.saida).toContain("Zere a quantidade");
  });

  it("peça usada em OS também trava", () => {
    const o = os({ pecas: [{ produtoId: "p1", descricao: "x", quantidade: 1, custoUnit: 0, precoUnit: 0 }] });
    expect(aoApagarProduto(prod({}), { vendas: [], ordens: [o] }).pode).toBe(false);
  });

  it("item avulso com o mesmo nome não trava: ele não tem produtoId", () => {
    const v = venda({ itens: [{ descricao: "Fonte 500W", quantidade: 1, precoUnit: 1, custoUnit: 0 }] });
    expect(aoApagarProduto(prod({}), { vendas: [v], ordens: [] }).pode).toBe(true);
  });

  it("produto sem histórico pode sair, avisando o estoque que some", () => {
    const r = aoApagarProduto(prod({ quantidade: 5, custo: 200 }), { vendas: [], ordens: [] });
    expect(r.pode).toBe(true);
    expect(r.perdas[0]).toContain("1000.00");
  });

  it("serviço não tem estoque para avisar", () => {
    const r = aoApagarProduto(prod({ servico: true, quantidade: 0 }), { vendas: [], ordens: [] });
    expect(r.perdas.some((p) => p.includes("em estoque"))).toBe(false);
  });
});

describe("apagar ordem de serviço", () => {
  const mov = (p: Partial<MovimentoCaixa>): MovimentoCaixa =>
    ({
      id: "m1",
      tipo: "entrada",
      categoria: "OS",
      descricao: "",
      valor: 250,
      formaPagamento: "dinheiro",
      data: "",
      osId: "o1",
      ...p,
    }) as MovimentoCaixa;

  it("dinheiro lançado TRAVA: receita ficaria sem origem", () => {
    const r = aoApagarOrdem(os({}), { movimentos: [mov({})], fiados: [] });
    expect(r.pode).toBe(false);
    expect(r.saida).toContain("Cancele");
    expect(r.perdas[0]).toContain("250.00");
  });

  it("fiado em aberto também trava", () => {
    const r = aoApagarOrdem(os({}), { movimentos: [], fiados: [fiado({ osId: "o1" })] });
    expect(r.pode).toBe(false);
  });

  it("fiado quitado não trava", () => {
    const r = aoApagarOrdem(os({}), {
      movimentos: [],
      fiados: [fiado({ osId: "o1", quitado: true })],
    });
    expect(r.pode).toBe(true);
  });

  it("OS sem dinheiro sai, avisando laudo e fotos", () => {
    const r = aoApagarOrdem(
      os({ maoDeObra: 300, defeitoConstatado: "Fonte queimada", fotos: ["a", "b"] }),
      { movimentos: [], fiados: [] }
    );
    expect(r.pode).toBe(true);
    expect(r.perdas.join(" ")).toContain("300.00");
    expect(r.perdas.join(" ")).toContain("2 foto");
    expect(r.perdas.join(" ")).toContain("laudo");
  });
});

describe("o texto que aparece na confirmação", () => {
  it("lista uma perda por linha: parágrafo em confirm ninguém lê", () => {
    const t = textoDaConfirmacao({
      pode: true,
      titulo: "Apagar João?",
      perdas: ["1 ordem", "o telefone"],
      saida: "",
    });
    expect(t).toContain("- 1 ordem");
    expect(t).toContain("- o telefone");
    expect(t).toContain("não pode ser desfeito");
  });

  it("sem perdas, ainda avisa que não tem volta", () => {
    const t = textoDaConfirmacao({ pode: true, titulo: "Apagar?", perdas: [], saida: "" });
    expect(t).toContain("não pode ser desfeito");
  });
});

/**
 * O botão de excluir fiado perguntava "Excluir este fiado?" e apagava.
 *
 * Um fiado de R$ 500 com R$ 300 já pagos tem três lançamentos de entrada no
 * caixa apontando para ele. Some a dívida, ficam as entradas: receita sem
 * origem, e o registro de que o cliente pagou vai junto.
 */
describe("apagar um fiado", () => {
  const fiado = (f: Partial<Fiado> = {}): Fiado =>
    ({ id: "f1", clienteId: "c1", descricao: "Conserto", valor: 500, pagamentos: [], quitado: false, criadoEm: "2026-07-01T10:00:00.000Z", ...f }) as Fiado;

  it("recusa quando já houve pagamento, e diz o que fazer", () => {
    const r = aoApagarFiado(
      fiado({ pagamentos: [{ data: "x", valor: 300, formaPagamento: "dinheiro" }] }),
      "Fulano"
    );
    expect(r.pode).toBe(false);
    expect(r.titulo).toContain("300");
    expect(r.saida).toContain("receita sem origem");
  });

  it("deixa apagar o que nunca foi pago, dizendo quanto se perdoa", () => {
    const r = aoApagarFiado(fiado(), "Fulano");
    expect(r.pode).toBe(true);
    expect(r.perdas.join(" ")).toContain("500");
  });

  it("fiado zerado e sem pagamento apaga sem drama", () => {
    const r = aoApagarFiado(fiado({ valor: 0 }));
    expect(r.pode).toBe(true);
    expect(r.perdas).toEqual([]);
  });
});
