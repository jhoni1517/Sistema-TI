// O fuso precisa valer antes de qualquer Date deste arquivo.
process.env.TZ = "America/Sao_Paulo";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { hojeISO, diasAteVencer, situacaoConta } from "./contas";
import { promocaoValendo, precoEfetivo } from "./promocao";
import { situacaoValidade } from "./pdv";
import type { ContaPagar, Produto } from "./types";

/**
 * "Hoje" é o dia do balcão, não o de Greenwich.
 *
 * A regra da casa — data é texto AAAA-MM-DD e a conta é em UTC — vale para a
 * ARITMÉTICA: somar um mês, virar o ano, dia 31 em fevereiro. Ela nunca
 * quis dizer que o dia de HOJE fosse o de Greenwich.
 *
 * E era. `hojeISO()` devolvia `new Date().toISOString().slice(0,10)`, que é
 * a data em UTC. No Brasil (UTC-3), das 21h à meia-noite o sistema inteiro
 * já estava no dia seguinte — três horas por dia, todo dia, e justamente as
 * horas cheias de uma pizzaria ou de uma loja de bebidas.
 *
 * O que isso fazia, das 21h em diante:
 *
 * - Promoção que termina hoje parava de valer. A etiqueta da gôndola dizia
 *   um preço e o caixa cobrava outro — e quem aparece como mentiroso é a
 *   loja, não o sistema.
 * - Produto que vence amanhã já entrava como VENCIDO no PDV.
 * - Conta que vence hoje aparecia como atrasada.
 */

const CINCO_DA_TARDE = new Date("2026-08-02T20:00:00Z"); // 17h em São Paulo
const DEZ_DA_NOITE = new Date("2026-08-03T01:00:00Z"); // 22h de 2 de agosto

const prod = (p: Partial<Produto> = {}): Produto =>
  ({
    id: "p1",
    nome: "Cerveja",
    quantidade: 10,
    estoqueMinimo: 1,
    custo: 4,
    preco: 10,
    criadoEm: "2026-01-01T00:00:00.000Z",
    ...p,
  }) as Produto;

const conta = (c: Partial<ContaPagar> = {}): ContaPagar =>
  ({
    id: "c1",
    descricao: "Aluguel",
    valor: 2000,
    vencimento: "2026-08-02",
    recorrencia: "mensal",
    ativo: true,
    pagamentos: [],
    criadoEm: "2026-01-01T00:00:00.000Z",
    ...c,
  }) as ContaPagar;

describe("o dia do balcão", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("às cinco da tarde, hoje é hoje", () => {
    vi.setSystemTime(CINCO_DA_TARDE);
    expect(hojeISO()).toBe("2026-08-02");
  });

  it("às dez da noite ainda é o MESMO dia, e não o de amanhã", () => {
    // É aqui que o sistema virava o dia sozinho, três horas mais cedo.
    vi.setSystemTime(DEZ_DA_NOITE);
    expect(hojeISO()).toBe("2026-08-02");
  });

  it("promoção que termina hoje continua valendo às dez da noite", () => {
    vi.setSystemTime(DEZ_DA_NOITE);
    const p = prod({ precoPromocional: 7, promocaoFim: "2026-08-02" });
    expect(promocaoValendo(p)).toBe(true);
    expect(precoEfetivo(p)).toBe(7);
  });

  it("promoção que começa amanhã não vale hoje à noite", () => {
    vi.setSystemTime(DEZ_DA_NOITE);
    const p = prod({ precoPromocional: 7, promocaoInicio: "2026-08-03" });
    expect(promocaoValendo(p)).toBe(false);
  });

  it("produto que vence amanhã não é vendido como vencido hoje à noite", () => {
    vi.setSystemTime(DEZ_DA_NOITE);
    expect(situacaoValidade({ validade: "2026-08-03" })).toBe("vence_perto");
    expect(situacaoValidade({ validade: "2026-08-02" })).toBe("vence_perto");
    expect(situacaoValidade({ validade: "2026-08-01" })).toBe("vencido");
  });

  it("conta que vence hoje não vira atrasada às dez da noite", () => {
    vi.setSystemTime(DEZ_DA_NOITE);
    expect(diasAteVencer("2026-08-02")).toBe(0);
    expect(situacaoConta(conta())).toBe("vence_hoje");
  });
});
