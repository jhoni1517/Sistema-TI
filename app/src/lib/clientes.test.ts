import { describe, it, expect } from "vitest";
import { avaliarCliente, travaAtendimento, classificacaoDe } from "./clientes";
import type { Cliente, Fiado, OrdemServico } from "./types";

/**
 * Classificação de cliente.
 * O risco aqui não é técnico, é humano: marcar cliente bom como caloteiro
 * custa mais caro do que deixar um ruim passar. Os testes fixam esse viés.
 */

const cli = (o: Partial<Cliente> = {}): Cliente =>
  ({ id: "c1", nome: "Fulano", telefone: "", criadoEm: "", ...o }) as Cliente;

const diasAtras = (d: number) => new Date(Date.now() - d * 86400000).toISOString();

const os = (o: Partial<OrdemServico>): OrdemServico =>
  ({ id: "o", clienteId: "c1", pecas: [], status: "entregue", ...o }) as OrdemServico;

const fiado = (f: Partial<Fiado>): Fiado =>
  ({ id: "f", clienteId: "c1", valor: 0, pagamentos: [], quitado: false, criadoEm: "", ...f }) as Fiado;

describe("cliente sem histórico", () => {
  it("não levanta nenhum sinal", () => {
    const a = avaliarCliente(cli(), [], []);
    expect(a.sinais).toEqual([]);
    expect(a.sugestao).toBe("normal");
  });

  it("cliente novo nunca nasce bloqueado", () => {
    expect(avaliarCliente(cli(), [], []).sugestao).not.toBe("bloqueado");
  });
});

describe("dívida em aberto", () => {
  it("valor recente é só um sinal leve", () => {
    const a = avaliarCliente(cli(), [], [fiado({ valor: 200, criadoEm: diasAtras(5) })]);
    expect(a.pontos).toBe(1);
    expect(a.sugestao).toBe("normal");
  });

  it("mais de 30 dias já pede atenção", () => {
    const a = avaliarCliente(cli(), [], [fiado({ valor: 500, criadoEm: diasAtras(45) })]);
    expect(a.sugestao).toBe("atencao");
  });

  it("dívida antiga pesa mais", () => {
    const a = avaliarCliente(cli(), [], [fiado({ valor: 800, criadoEm: diasAtras(200) })]);
    expect(a.pontos).toBe(3);
    expect(a.sinais[0].texto).toContain("meses");
  });

  it("fiado quitado não conta como dívida", () => {
    const a = avaliarCliente(cli(), [], [fiado({ valor: 800, criadoEm: diasAtras(200), quitado: true })]);
    expect(a.pontos).toBeLessThanOrEqual(0);
  });
});

describe("aparelho abandonado", () => {
  it("pronto há 60 dias vira sinal", () => {
    const a = avaliarCliente(cli(), [os({ status: "pronta", prontaEm: diasAtras(70) })], []);
    expect(a.sinais[0].texto).toContain("sem retirar");
  });

  it("pronto há pouco tempo não é abandono", () => {
    const a = avaliarCliente(cli(), [os({ status: "pronta", prontaEm: diasAtras(10) })], []);
    expect(a.sinais).toEqual([]);
  });

  it("vários abandonos somam e chegam a bloqueio", () => {
    const ordens = [
      os({ id: "1", status: "pronta", prontaEm: diasAtras(90) }),
      os({ id: "2", status: "pronta", prontaEm: diasAtras(90) }),
      os({ id: "3", status: "pronta", prontaEm: diasAtras(90) }),
    ];
    expect(avaliarCliente(cli(), ordens, []).sugestao).toBe("bloqueado");
  });
});

describe("recusa de orçamento", () => {
  it("recusar uma ou duas vezes é direito do cliente, não sinal", () => {
    const ordens = [os({ id: "1", status: "cancelada" }), os({ id: "2", status: "cancelada" })];
    expect(avaliarCliente(cli(), ordens, []).sinais).toEqual([]);
  });

  it("só vira sinal quando é padrão repetido", () => {
    const ordens = [1, 2, 3].map((i) => os({ id: String(i), status: "cancelada" }));
    expect(avaliarCliente(cli(), ordens, []).sinais[0].texto).toContain("Recusou");
  });
});

describe("histórico bom compensa", () => {
  it("cliente antigo com dívida recente não vira caso de atenção", () => {
    const ordens = Array.from({ length: 6 }, (_, i) => os({ id: String(i) }));
    const a = avaliarCliente(cli(), ordens, [fiado({ valor: 300, criadoEm: diasAtras(40) })]);
    expect(a.sugestao).toBe("normal");
    expect(a.sinais.some((s) => s.peso < 0)).toBe(true);
  });
});

describe("a decisão final é da loja", () => {
  it("avisa quando os fatos são piores que a marcação atual", () => {
    const ordens = [1, 2, 3].map((i) => os({ id: String(i), status: "pronta", prontaEm: diasAtras(90) }));
    expect(avaliarCliente(cli(), ordens, []).divergente).toBe(true);
  });

  it("não insiste quando a loja resolveu perdoar", () => {
    const a = avaliarCliente(
      cli({ classificacao: "bloqueado" }),
      [],
      [fiado({ valor: 500, criadoEm: diasAtras(45) })]
    );
    expect(a.divergente).toBe(false);
  });
});

describe("trava no atendimento", () => {
  it("cliente normal não atrapalha ninguém", () => {
    const t = travaAtendimento(cli());
    expect(t.bloqueia).toBe(false);
    expect(t.avisa).toBe(false);
  });

  it("atenção avisa mas deixa seguir", () => {
    const t = travaAtendimento(cli({ classificacao: "atencao", motivoClassificacao: "Some com o aparelho" }));
    expect(t.avisa).toBe(true);
    expect(t.bloqueia).toBe(false);
    expect(t.motivo).toBe("Some com o aparelho");
  });

  it("bloqueado impede a abertura da OS", () => {
    expect(travaAtendimento(cli({ classificacao: "bloqueado" })).bloqueia).toBe(true);
  });

  it("sem motivo registrado, diz isso em vez de mentir", () => {
    expect(travaAtendimento(cli({ classificacao: "bloqueado" })).motivo).toContain("Sem motivo");
  });

  it("cadastro antigo, sem o campo, é tratado como normal", () => {
    expect(classificacaoDe(cli())).toBe("normal");
    expect(classificacaoDe(null)).toBe("normal");
  });
});
