import { describe, it, expect } from "vitest";
import {
  resumoCaixa,
  movimentosDaSessao,
  sessoesFechadas,
  sessaoAberta,
  conferencia,
  filtrarMovimentos,
  agruparPorDia,
  movimentosPorSessao,
} from "./caixa";
import type { MovimentoCaixa, SessaoCaixa } from "./types";

const mov = (m: Partial<MovimentoCaixa> = {}): MovimentoCaixa => ({
  id: Math.random().toString(36).slice(2),
  tipo: "entrada",
  categoria: "Venda",
  descricao: "venda",
  valor: 100,
  formaPagamento: "dinheiro",
  data: "2026-07-28T10:00:00.000Z",
  ...m,
});

const sessao = (s: Partial<SessaoCaixa> = {}): SessaoCaixa => ({
  id: "s1",
  abertoEm: "2026-07-28T08:00:00.000Z",
  valorAbertura: 50,
  ...s,
});

describe("resumoCaixa", () => {
  it("saldo é abertura mais entradas menos saídas e sangrias", () => {
    const r = resumoCaixa(sessao({ valorAbertura: 22 }), [
      mov({ valor: 29.9 }),
      mov({ tipo: "saida", valor: 10 }),
      mov({ tipo: "sangria", valor: 5 }),
    ]);
    expect(r.abertura).toBe(22);
    expect(r.entradas).toBe(29.9);
    expect(r.saidas).toBe(10);
    expect(r.sangrias).toBe(5);
    expect(r.saldo).toBeCloseTo(36.9, 2);
  });

  it("sem sessão, a abertura é zero em vez de quebrar", () => {
    expect(resumoCaixa(null, [mov({ valor: 40 })]).saldo).toBe(40);
  });

  it("separa as entradas por forma de pagamento, e só as entradas", () => {
    const r = resumoCaixa(sessao(), [
      mov({ valor: 30, formaPagamento: "credito" }),
      mov({ valor: 20, formaPagamento: "credito" }),
      mov({ valor: 15, formaPagamento: "pix" }),
      // Saída no cartão não pode aparecer como se fosse recebimento
      mov({ tipo: "saida", valor: 99, formaPagamento: "credito" }),
    ]);
    expect(r.porForma).toEqual({ credito: 50, pix: 15 });
  });

  it("conta quantas movimentações a sessão teve", () => {
    expect(resumoCaixa(sessao(), [mov(), mov(), mov()]).quantidade).toBe(3);
  });
});

describe("conferência da gaveta", () => {
  it("sem contagem a diferença é indefinida, não zero", () => {
    // Zero diria "conferi e bateu", que é bem diferente de "ninguém contou".
    const r = resumoCaixa(sessao(), [mov()]);
    expect(r.contado).toBeUndefined();
    expect(r.diferenca).toBeUndefined();
    expect(conferencia(r)).toBe("nao_conferido");
  });

  it("acusa falta quando a gaveta tem menos do que devia", () => {
    const r = resumoCaixa(sessao({ valorAbertura: 50, valorContado: 100 }), [mov({ valor: 100 })]);
    expect(r.saldo).toBe(150);
    expect(r.diferenca).toBe(-50);
    expect(conferencia(r)).toBe("falta");
  });

  it("acusa sobra quando tem mais", () => {
    const r = resumoCaixa(sessao({ valorAbertura: 0, valorContado: 120 }), [mov({ valor: 100 })]);
    expect(r.diferenca).toBe(20);
    expect(conferencia(r)).toBe("sobra");
  });

  it("centavo de troco não vira alarme todo dia", () => {
    // Diferença de moeda acontece sempre; alerta que aparece sempre para
    // de ser lido, e aí o alerta de verdade passa junto.
    const r = resumoCaixa(sessao({ valorAbertura: 0, valorContado: 100.3 }), [mov({ valor: 100 })]);
    expect(conferencia(r)).toBe("certo");
    expect(conferencia(r, 0.1)).toBe("sobra");
  });

  it("contar exatamente zero é uma contagem válida", () => {
    // Gaveta vazia depois de uma sangria total é resultado legítimo, e não
    // pode ser confundido com "não conferido".
    const r = resumoCaixa(sessao({ valorAbertura: 0, valorContado: 0 }), []);
    expect(r.contado).toBe(0);
    expect(r.diferenca).toBe(0);
    expect(conferencia(r)).toBe("certo");
  });

  it("não deixa o centavo virar dízima na comparação", () => {
    const r = resumoCaixa(sessao({ valorAbertura: 0, valorContado: 0.3 }), [
      mov({ valor: 0.1 }),
      mov({ valor: 0.2 }),
    ]);
    expect(r.diferenca).toBe(0);
  });
});

describe("movimentosDaSessao", () => {
  it("pega só o que é da sessão", () => {
    const s = sessao();
    const dela = mov({ sessaoId: "s1" });
    const deOutra = mov({ sessaoId: "s2" });
    expect(movimentosDaSessao(s, [dela, deOutra])).toEqual([dela]);
  });

  it("sem sessão aberta mostra o movimento de hoje", () => {
    const hoje = mov({ data: new Date().toISOString() });
    const antigo = mov({ data: "2020-01-01T10:00:00.000Z" });
    expect(movimentosDaSessao(null, [hoje, antigo])).toEqual([hoje]);
  });
});

describe("listas de sessões", () => {
  const a = sessao({ id: "a", abertoEm: "2026-07-26T08:00:00.000Z", fechadoEm: "2026-07-26T18:00:00.000Z" });
  const b = sessao({ id: "b", abertoEm: "2026-07-28T08:00:00.000Z", fechadoEm: "2026-07-28T18:00:00.000Z" });
  const aberta = sessao({ id: "c", abertoEm: "2026-07-29T08:00:00.000Z" });

  it("fechadas vêm da mais recente para a mais antiga", () => {
    expect(sessoesFechadas([a, b, aberta]).map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("a sessão sem fechamento é a aberta", () => {
    expect(sessaoAberta([a, b, aberta])?.id).toBe("c");
    expect(sessaoAberta([a, b])).toBeNull();
  });
});

/**
 * O limite da gaveta é sobre PAPEL.
 *
 * O aviso de sangria olhava o saldo, que soma cartão e Pix. Um dia com
 * R$ 3.000 na maquininha disparava o aviso sem ter um centavo a mais na
 * gaveta — e aviso que dispara sem motivo é aviso que a pessoa ignora.
 */
describe("dinheiro em espécie na gaveta", () => {
  it("cartão e Pix não entram", () => {
    const movs = [
      mov({ id: "a", tipo: "entrada", valor: 3000, formaPagamento: "credito" }),
      mov({ id: "b", tipo: "entrada", valor: 100, formaPagamento: "dinheiro" }),
    ];
    const r = resumoCaixa(sessao({ valorAbertura: 50 }), movs);
    expect(r.saldo).toBe(3150);
    expect(r.emEspecie).toBe(150);
  });

  it("a abertura conta: o troco começa o dia na gaveta", () => {
    expect(resumoCaixa(sessao({ valorAbertura: 200 }), []).emEspecie).toBe(200);
  });

  it("saída e sangria saem da gaveta", () => {
    const movs = [
      mov({ id: "a", tipo: "entrada", valor: 500, formaPagamento: "dinheiro" }),
      mov({ id: "b", tipo: "saida", valor: 80 }),
      mov({ id: "c", tipo: "sangria", valor: 300 }),
    ];
    expect(resumoCaixa(sessao({ valorAbertura: 100 }), movs).emEspecie).toBe(220);
  });

  it("dia só de cartão deixa na gaveta apenas o troco de abertura", () => {
    const movs = [mov({ tipo: "entrada", valor: 900, formaPagamento: "pix" })];
    expect(resumoCaixa(sessao({ valorAbertura: 100 }), movs).emEspecie).toBe(100);
  });
});

describe("procurar no caixa", () => {
  const m = (p: Partial<MovimentoCaixa>): MovimentoCaixa =>
    ({
      id: "m",
      tipo: "entrada",
      categoria: "Venda",
      descricao: "",
      valor: 10,
      formaPagamento: "dinheiro",
      data: "2026-08-01T10:00:00.000Z",
      ...p,
    }) as MovimentoCaixa;

  const lista = [
    m({ id: "1", descricao: "Venda 12", valor: 100, data: "2026-08-01T10:00:00.000Z" }),
    m({ id: "2", tipo: "saida", categoria: "Energia", descricao: "Conta de luz", valor: 230, data: "2026-08-01T14:00:00.000Z" }),
    m({ id: "3", tipo: "sangria", categoria: "Sangria", descricao: "Banco", valor: 50, data: "2026-07-31T18:00:00.000Z" }),
    m({ id: "4", descricao: "Venda 13", valor: 60, formaPagamento: "pix", data: "2026-07-31T09:00:00.000Z" }),
  ];

  it("sem filtro, devolve tudo", () => {
    expect(filtrarMovimentos(lista)).toHaveLength(4);
  });

  it("acha pela descrição", () => {
    expect(filtrarMovimentos(lista, { termo: "luz" }).map((x) => x.id)).toEqual(["2"]);
  });

  it("acha pela CATEGORIA: é assim que a pessoa lembra", () => {
    // "as de energia" — ninguém lembra o texto exato que digitou.
    expect(filtrarMovimentos(lista, { termo: "energia" }).map((x) => x.id)).toEqual(["2"]);
  });

  it("acha pela forma de pagamento: 'aquela do pix'", () => {
    expect(filtrarMovimentos(lista, { termo: "pix" }).map((x) => x.id)).toEqual(["4"]);
  });

  it("não diferencia maiúscula", () => {
    expect(filtrarMovimentos(lista, { termo: "CONTA DE LUZ" })).toHaveLength(1);
  });

  it("filtra por tipo", () => {
    expect(filtrarMovimentos(lista, { tipo: "sangria" }).map((x) => x.id)).toEqual(["3"]);
    expect(filtrarMovimentos(lista, { tipo: "entrada" })).toHaveLength(2);
  });

  it("tipo e termo somam", () => {
    expect(filtrarMovimentos(lista, { tipo: "entrada", termo: "venda" })).toHaveLength(2);
    expect(filtrarMovimentos(lista, { tipo: "saida", termo: "venda" })).toHaveLength(0);
  });

  it("filtra por dia", () => {
    expect(filtrarMovimentos(lista, { dia: "2026-07-31" }).map((x) => x.id)).toEqual(["3", "4"]);
  });
});

describe("o caixa agrupado por dia", () => {
  const m = (p: Partial<MovimentoCaixa>): MovimentoCaixa =>
    ({
      id: "m",
      tipo: "entrada",
      categoria: "Venda",
      descricao: "",
      valor: 10,
      formaPagamento: "dinheiro",
      data: "2026-08-01T10:00:00.000Z",
      ...p,
    }) as MovimentoCaixa;

  it("junta por dia, do mais recente para o mais antigo", () => {
    const dias = agruparPorDia([
      m({ id: "1", data: "2026-07-30T10:00:00.000Z" }),
      m({ id: "2", data: "2026-08-01T10:00:00.000Z" }),
    ]);
    expect(dias.map((d) => d.dia)).toEqual(["2026-08-01", "2026-07-30"]);
  });

  it("o subtotal do dia responde 'quanto entrou ontem' sem somar na cabeça", () => {
    const dias = agruparPorDia([
      m({ id: "1", valor: 100 }),
      m({ id: "2", tipo: "saida", valor: 30, categoria: "Despesa" }),
      m({ id: "3", tipo: "sangria", valor: 20 }),
    ]);
    expect(dias).toHaveLength(1);
    expect(dias[0].entradas).toBe(100);
    expect(dias[0].saidas).toBe(30);
    expect(dias[0].resultado).toBe(50);
  });

  it("dentro do dia, o mais recente vem primeiro", () => {
    const dias = agruparPorDia([
      m({ id: "cedo", data: "2026-08-01T08:00:00.000Z" }),
      m({ id: "tarde", data: "2026-08-01T19:00:00.000Z" }),
    ]);
    expect(dias[0].movimentos.map((x) => x.id)).toEqual(["tarde", "cedo"]);
  });

  it("movimento sem data não inventa um dia", () => {
    // Agrupar num dia chutado colocaria dinheiro na conta do dia errado.
    expect(agruparPorDia([m({ id: "1", data: "" })])).toEqual([]);
  });

  it("centavos não viram dízima no subtotal", () => {
    const dias = agruparPorDia([m({ id: "1", valor: 0.1 }), m({ id: "2", valor: 0.2 })]);
    expect(dias[0].resultado).toBe(0.3);
  });
});

describe("a gaveta se confere contra o PAPEL, não contra o saldo", () => {
  /**
   * O bug que quebrava a conferência inteira em qualquer loja com maquininha.
   *
   * O saldo soma cartão e Pix, que nunca passaram pela gaveta. Numa loja que
   * vendeu R$ 3.000 no cartão e tem R$ 200 em papel, o sistema pedia
   * R$ 3.200 contados e acusava falta de R$ 3.000 — todo santo dia.
   *
   * Diferença que aparece sempre é diferença que a pessoa aprende a ignorar,
   * e aí a conferência deixa de existir justamente para o dia em que falta
   * dinheiro de verdade.
   */
  const sessao = (v: Partial<SessaoCaixa> = {}): SessaoCaixa =>
    ({ id: "s1", abertoEm: "2026-08-01T08:00:00.000Z", valorAbertura: 100, ...v }) as SessaoCaixa;

  const mov = (p: Partial<MovimentoCaixa>): MovimentoCaixa =>
    ({
      id: "m",
      tipo: "entrada",
      categoria: "Venda",
      descricao: "",
      valor: 0,
      formaPagamento: "dinheiro",
      data: "2026-08-01T10:00:00.000Z",
      ...p,
    }) as MovimentoCaixa;

  const dia = [
    mov({ id: "1", valor: 3000, formaPagamento: "credito" }),
    mov({ id: "2", valor: 100, formaPagamento: "dinheiro" }),
  ];

  it("o esperado em papel ignora cartão e Pix", () => {
    // Abertura 100 + 100 em dinheiro = 200 na gaveta. Os 3.000 do cartão
    // estão no saldo, mas não em papel.
    const r = resumoCaixa(sessao(), dia);
    expect(r.saldo).toBe(3200);
    expect(r.emEspecie).toBe(200);
  });

  it("contar exatamente o que está na gaveta dá diferença ZERO", () => {
    // Antes isto acusava falta de R$ 3.000.
    const r = resumoCaixa(sessao({ valorContado: 200 }), dia);
    expect(r.diferenca).toBe(0);
    expect(conferencia(r)).toBe("certo");
  });

  it("falta de verdade continua aparecendo", () => {
    const r = resumoCaixa(sessao({ valorContado: 180 }), dia);
    expect(r.diferenca).toBe(-20);
    expect(conferencia(r)).toBe("falta");
  });

  it("sobra de verdade continua aparecendo", () => {
    const r = resumoCaixa(sessao({ valorContado: 230 }), dia);
    expect(r.diferenca).toBe(30);
    expect(conferencia(r)).toBe("sobra");
  });

  it("sangria e despesa saem do papel", () => {
    const r = resumoCaixa(sessao({ valorContado: 120 }), [
      ...dia,
      mov({ id: "3", tipo: "sangria", valor: 50 }),
      mov({ id: "4", tipo: "saida", categoria: "Despesa", valor: 30 }),
    ]);
    // 100 abertura + 100 dinheiro - 50 sangria - 30 despesa = 120
    expect(r.emEspecie).toBe(120);
    expect(r.diferenca).toBe(0);
  });

  it("sem contagem, não existe diferença: não conferido não é conferido e bateu", () => {
    const r = resumoCaixa(sessao(), dia);
    expect(r.diferenca).toBeUndefined();
    expect(conferencia(r)).toBe("nao_conferido");
  });
});

describe("o histórico de fechamentos não pode ficar quadrático", () => {
  /**
   * Chamar movimentosDaSessao dentro do laço varre a lista inteira de
   * movimentos para CADA sessão. Com um ano de fechamentos diários e dez mil
   * lançamentos são três milhões e meio de comparações por renderização — o
   * mesmo erro que já tinha travado o painel na conferência de integridade.
   */
  const mov = (id: string, sessaoId?: string): MovimentoCaixa =>
    ({
      id,
      tipo: "entrada",
      categoria: "Venda",
      descricao: "",
      valor: 10,
      formaPagamento: "dinheiro",
      data: "2026-08-01T10:00:00.000Z",
      sessaoId,
    }) as MovimentoCaixa;

  it("agrupa por sessão", () => {
    const mapa = movimentosPorSessao([mov("1", "s1"), mov("2", "s2"), mov("3", "s1")]);
    expect(mapa.get("s1")?.map((m) => m.id)).toEqual(["1", "3"]);
    expect(mapa.get("s2")?.map((m) => m.id)).toEqual(["2"]);
  });

  it("movimento sem sessão não entra: ele não pertence a fechamento nenhum", () => {
    const mapa = movimentosPorSessao([mov("1"), mov("2", "")]);
    expect(mapa.size).toBe(0);
  });

  it("sessão sem movimento nenhum simplesmente não aparece no índice", () => {
    // Quem consulta precisa tratar o vazio, e não receber undefined por erro.
    const mapa = movimentosPorSessao([mov("1", "s1")]);
    expect(mapa.get("s9")).toBeUndefined();
    expect(mapa.get("s9") ?? []).toEqual([]);
  });

  it("dá o mesmo resultado que filtrar na mão, que é o que ele substitui", () => {
    const lista = [mov("1", "s1"), mov("2", "s2"), mov("3", "s1"), mov("4")];
    const mapa = movimentosPorSessao(lista);
    for (const s of ["s1", "s2"]) {
      expect(mapa.get(s) ?? []).toEqual(lista.filter((m) => m.sessaoId === s));
    }
  });
});
