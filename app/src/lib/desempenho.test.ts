import { describe, it, expect } from "vitest";
import {
  comparar,
  receitaEntre,
  recuar,
  comparativoRecente,
  ticketMedio,
  porHora,
  horariosDePico,
  comissoes,
  sangriaSugerida,
} from "./desempenho";
import type { MovimentoCaixa, OrdemServico, Venda, Config } from "./types";

const mov = (m: Partial<MovimentoCaixa>): MovimentoCaixa =>
  ({
    id: "m1",
    tipo: "entrada",
    categoria: "Venda",
    descricao: "",
    valor: 100,
    formaPagamento: "dinheiro",
    data: "2026-07-10T10:00:00.000Z",
    ...m,
  }) as MovimentoCaixa;

const venda = (v: Partial<Venda>): Venda =>
  ({
    id: "v1",
    numero: 1,
    itens: [{ descricao: "x", quantidade: 1, precoUnit: 100, custoUnit: 50 }],
    desconto: 0,
    formaPagamento: "dinheiro",
    criadoEm: "2026-07-10T13:00:00.000Z",
    ...v,
  }) as Venda;

const os = (o: Partial<OrdemServico>): OrdemServico =>
  ({
    id: "o1",
    numero: 1,
    clienteId: "c1",
    tipoAparelho: "PC",
    marca: "",
    modelo: "",
    defeitoRelatado: "",
    checklist: {},
    pecas: [],
    maoDeObra: 100,
    desconto: 0,
    status: "entregue",
    garantiaDias: 90,
    historico: [],
    criadoEm: "2026-07-01T00:00:00.000Z",
    atualizadoEm: "2026-07-05T00:00:00.000Z",
    entregueEm: "2026-07-05T00:00:00.000Z",
    ...o,
  }) as OrdemServico;

describe("comparar com o período anterior", () => {
  it("calcula a variação em porcentagem", () => {
    expect(comparar(150, 100).variacao).toBe(50);
    expect(comparar(80, 100).variacao).toBe(-20);
    expect(comparar(100, 100).melhorou).toBe(true);
  });

  it("período anterior zerado não vira crescimento infinito", () => {
    // No primeiro mês de uso a tela ficaria anunciando número absurdo, e o
    // indicador perderia a confiança justo quando devia começar a ganhar.
    const c = comparar(500, 0);
    expect(c.variacao).toBe(0);
    expect(Number.isFinite(c.variacao)).toBe(true);
  });

  it("recua datas em UTC, sem deslocar o dia pelo fuso", () => {
    expect(recuar("2026-03-01", 1)).toBe("2026-02-28");
    expect(recuar("2026-01-01", 1)).toBe("2025-12-31");
  });

  it("soma a receita do intervalo, incluindo as duas pontas", () => {
    const movs = [
      mov({ id: "a", data: "2026-07-01T10:00:00Z", valor: 10 }),
      mov({ id: "b", data: "2026-07-05T10:00:00Z", valor: 20 }),
      mov({ id: "c", data: "2026-07-10T10:00:00Z", valor: 30 }),
      mov({ id: "d", data: "2026-07-11T10:00:00Z", valor: 999 }),
    ];
    expect(receitaEntre(movs, "2026-07-01", "2026-07-10")).toBe(60);
  });

  it("só entrada conta como receita", () => {
    const movs = [mov({ valor: 100 }), mov({ id: "s", tipo: "saida", valor: 50 })];
    expect(receitaEntre(movs, "2026-07-01", "2026-07-31")).toBe(100);
  });

  it("sete dias contra sete, não este mês contra o passado", () => {
    // No dia 3 do mês a comparação mensal é três dias contra trinta, e o
    // sistema anuncia uma queda de 90% que não existe.
    const movs = [
      mov({ id: "a", data: "2026-07-10T10:00:00Z", valor: 200 }), // dentro dos 7
      mov({ id: "b", data: "2026-07-01T10:00:00Z", valor: 100 }), // 7 anteriores
    ];
    const c = comparativoRecente(movs, 7, "2026-07-10");
    expect(c.atual).toBe(200);
    expect(c.anterior).toBe(100);
    expect(c.variacao).toBe(100);
  });
});

describe("ticket médio e horário de pico", () => {
  it("média das vendas de balcão", () => {
    const vendas = [
      venda({ id: "a", itens: [{ descricao: "x", quantidade: 1, precoUnit: 100, custoUnit: 0 }] }),
      venda({ id: "b", itens: [{ descricao: "x", quantidade: 1, precoUnit: 50, custoUnit: 0 }] }),
    ];
    expect(ticketMedio(vendas)).toBe(75);
  });

  it("desconto entra no ticket", () => {
    const vendas = [venda({ desconto: 20 })];
    expect(ticketMedio(vendas)).toBe(80);
  });

  it("venda sem item não entra na média", () => {
    // Ela puxaria o ticket para baixo sem representar compra nenhuma.
    expect(ticketMedio([venda({ itens: [] })])).toBe(0);
  });

  it("sem venda nenhuma o ticket é zero, não erro", () => {
    expect(ticketMedio([])).toBe(0);
  });

  it("separa o movimento por hora do relógio da loja", () => {
    const faixas = porHora([venda({ criadoEm: "2026-07-10T13:00:00" })]);
    expect(faixas).toHaveLength(24);
    expect(faixas[13].vendas).toBe(1);
  });

  it("aponta as horas mais cheias, da maior para a menor", () => {
    const vendas = [
      venda({ id: "a", criadoEm: "2026-07-10T09:00:00", itens: [{ descricao: "x", quantidade: 1, precoUnit: 10, custoUnit: 0 }] }),
      venda({ id: "b", criadoEm: "2026-07-10T18:00:00", itens: [{ descricao: "x", quantidade: 1, precoUnit: 500, custoUnit: 0 }] }),
    ];
    expect(horariosDePico(vendas, 2)[0].hora).toBe(18);
  });

  it("data estragada não derruba a conta", () => {
    expect(() => porHora([venda({ criadoEm: "ontem" })])).not.toThrow();
  });
});

describe("comissão do técnico", () => {
  const config = { comissaoPadrao: 10 } as Config;

  it("é sobre o LUCRO, não sobre o faturamento", () => {
    // Comissão sobre faturamento premia quem usa peça cara, não quem
    // conserta bem: a loja apenas repassou o preço da peça.
    const ordens = [
      os({
        tecnico: "Ana",
        maoDeObra: 100,
        pecas: [{ descricao: "Fonte", quantidade: 1, custoUnit: 400, precoUnit: 400 }],
      }),
    ];
    const [c] = comissoes(ordens, config);
    expect(c.faturado).toBe(500);
    expect(c.lucro).toBe(100);
    expect(c.valor).toBe(10); // 10% de 100, não de 500
  });

  it("agrupa por técnico e ordena pelo lucro gerado", () => {
    const ordens = [
      os({ id: "a", tecnico: "Ana", maoDeObra: 100 }),
      os({ id: "b", tecnico: "Bruno", maoDeObra: 300 }),
      os({ id: "c", tecnico: "Ana", maoDeObra: 50 }),
    ];
    const r = comissoes(ordens, config);
    expect(r.map((c) => c.tecnico)).toEqual(["Bruno", "Ana"]);
    expect(r[1].ordens).toBe(2);
    expect(r[1].lucro).toBe(150);
  });

  it("só ordem ENTREGUE gera comissão", () => {
    // Comissão sobre serviço que ainda pode ser cancelado é dinheiro que vai
    // ter que voltar.
    const ordens = [os({ status: "pronta" }), os({ id: "b", status: "cancelada" })];
    expect(comissoes(ordens, config)).toEqual([]);
  });

  it("prejuízo não vira comissão negativa", () => {
    // Descontar do técnico um prejuízo que foi decisão da loja é briga certa.
    const ordens = [
      os({
        tecnico: "Ana",
        maoDeObra: 0,
        pecas: [{ descricao: "x", quantidade: 1, custoUnit: 100, precoUnit: 10 }],
      }),
    ];
    expect(comissoes(ordens, config)[0].valor).toBe(0);
  });

  it("respeita o período pedido", () => {
    const ordens = [
      os({ id: "a", tecnico: "Ana", entregueEm: "2026-07-05T00:00:00Z" }),
      os({ id: "b", tecnico: "Ana", entregueEm: "2026-06-05T00:00:00Z" }),
    ];
    expect(comissoes(ordens, config, "2026-07-01", "2026-07-31")[0].ordens).toBe(1);
  });

  it("OS sem técnico ainda aparece, agrupada", () => {
    expect(comissoes([os({ tecnico: "" })], config)[0].tecnico).toBe("Sem técnico");
  });

  it("sem percentual configurado, a lista mostra o lucro e comissão zero", () => {
    const r = comissoes([os({ tecnico: "Ana" })], { comissaoPadrao: 0 } as Config);
    expect(r[0].lucro).toBe(100);
    expect(r[0].valor).toBe(0);
  });
});

describe("sangria sugerida", () => {
  it("avisa quando passa do limite e sugere um valor redondo", () => {
    // Sangrar R$ 347,63 obriga a mexer em moeda, e o troco da gaveta é
    // justamente o que não pode faltar.
    const s = sangriaSugerida(847.63, 500);
    expect(s.passou).toBe(true);
    expect(s.excedente).toBe(347.63);
    expect(s.sugestao).toBe(340);
  });

  it("dentro do limite não avisa nada", () => {
    expect(sangriaSugerida(300, 500).passou).toBe(false);
  });

  it("bater exatamente no limite ainda não é excesso", () => {
    expect(sangriaSugerida(500, 500).passou).toBe(false);
  });

  it("sem limite configurado, o aviso não existe", () => {
    // Ligado por padrão, o aviso apareceria para quem nunca pediu por ele.
    expect(sangriaSugerida(99999, 0).passou).toBe(false);
  });

  it("excedente menor que dez não vira sugestão de sangrar zero", () => {
    const s = sangriaSugerida(505, 500);
    expect(s.passou).toBe(true);
    expect(s.sugestao).toBe(0);
  });
});
