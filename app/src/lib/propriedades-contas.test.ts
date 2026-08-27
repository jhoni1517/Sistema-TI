import { describe, it, expect } from "vitest";
import {
  proximoVencimento,
  diasAteVencer,
  pagarConta,
  saldoDaConta,
  contaQuitada,
  parcialmentePaga,
  pagoNaReferencia,
  situacaoConta,
  ehReceber,
} from "./contas";
import { RECORRENCIA_META, type ContaPagar, type Recorrencia } from "./types";

function semente(s: number) {
  let x = s >>> 0 || 1;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
}
const r = semente(2718281828);

const conta = (x: Partial<ContaPagar> = {}): ContaPagar =>
  ({
    id: "c",
    descricao: "Cartão",
    valor: 1000,
    vencimento: "2026-03-31",
    recorrencia: "unica" as Recorrencia,
    pagamentos: [],
    ativo: true,
    criadoEm: "2026-01-01T00:00:00.000Z",
    ...x,
  }) as ContaPagar;

const pagar = (c: ContaPagar, valor: number, data = "2026-03-31T10:00:00.000Z") =>
  pagarConta(c, { valor, formaPagamento: "dinheiro", data });

describe("Propriedades das datas: os três casos que sempre quebram", () => {
  it("dia 31 mais um mês vira 28 em fevereiro e VOLTA para 31 em março", () => {
    /*
     * O erro clássico: quem guarda "28" depois de fevereiro perde o dia 31
     * para sempre, e a conta do cartão passa a vencer três dias antes todo
     * mês. O dia original tem que sobreviver ao mês curto.
     */
    expect(proximoVencimento("2026-01-31", "mensal")).toBe("2026-02-28");
    expect(proximoVencimento("2026-02-28", "mensal", 31)).toBe("2026-03-31");
    expect(proximoVencimento("2026-03-31", "mensal", 31)).toBe("2026-04-30");
    expect(proximoVencimento("2026-04-30", "mensal", 31)).toBe("2026-05-31");
  });

  it("29 de fevereiro anual cai em 28 nos anos comuns e volta no bissexto", () => {
    expect(proximoVencimento("2024-02-29", "anual")).toBe("2025-02-28");
    expect(proximoVencimento("2025-02-28", "anual", 29)).toBe("2026-02-28");
    expect(proximoVencimento("2027-02-28", "anual", 29)).toBe("2028-02-29");
  });

  it("virada de ano não perde nem ganha mês", () => {
    expect(proximoVencimento("2026-12-15", "mensal")).toBe("2027-01-15");
    expect(proximoVencimento("2026-12-31", "mensal")).toBe("2027-01-31");
    expect(proximoVencimento("2026-11-30", "bimestral")).toBe("2027-01-30");
    expect(proximoVencimento("2026-12-28", "semanal")).toBe("2027-01-04");
  });

  it("a conta é em UTC: o dia não desliza com o fuso, em 20 mil datas", () => {
    /*
     * Somar hora local desloca o dia inteiro conforme o fuso. Já aconteceu
     * aqui, e o sintoma é a conta vencer um dia antes para metade do país.
     */
    const tipos = Object.keys(RECORRENCIA_META).filter((k) => k !== "unica") as Recorrencia[];
    for (let i = 0; i < 20000; i++) {
      const ano = 2020 + Math.floor(r() * 15);
      const mes = 1 + Math.floor(r() * 12);
      const dia = 1 + Math.floor(r() * 28);
      const base = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
      const tipo = tipos[Math.floor(r() * tipos.length)];
      const prox = proximoVencimento(base, tipo);

      expect(prox, `caso ${i} ${base} ${tipo}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Sempre para a frente, nunca igual nem para trás.
      expect(prox > base, `caso ${i} ${base} ${tipo} -> ${prox}`).toBe(true);
      // O dia sobrevive quando o mês de destino comporta.
      if (RECORRENCIA_META[tipo].meses > 0) {
        expect(Number(prox.split("-")[2]) <= dia, `caso ${i} ${base} ${tipo}`).toBe(true);
      }
    }
  });

  it("recorrência única nunca anda sozinha", () => {
    // Conta de uma vez só que vira recorrente cobra para sempre.
    expect(proximoVencimento("2026-03-31", "unica")).toBe("2026-03-31");
  });

  it("diasAteVencer conta em dia cheio, sem hora sobrando", () => {
    expect(diasAteVencer("2026-08-27", "2026-08-27")).toBe(0);
    expect(diasAteVencer("2026-08-28", "2026-08-27")).toBe(1);
    expect(diasAteVencer("2026-08-26", "2026-08-27")).toBe(-1);
    for (let i = 0; i < 5000; i++) {
      const dias = Math.floor(r() * 800) - 400;
      const alvo = new Date(Date.parse("2026-08-27T00:00:00Z") + dias * 86400000)
        .toISOString()
        .slice(0, 10);
      expect(diasAteVencer(alvo, "2026-08-27"), `caso ${i}`).toBe(dias);
    }
  });
});

describe("Propriedades do pagamento parcial: o que falta nunca some", () => {
  it("pagar em partes chega no total sem sobrar nem faltar centavo", () => {
    for (let i = 0; i < 10000; i++) {
      const valor = Math.round((10 + r() * 5000) * 100) / 100;
      let c = conta({ valor, tipo: r() < 0.5 ? "receber" : "pagar" });
      let somaPaga = 0;

      for (let k = 0; k < 3; k++) {
        const resta = saldoDaConta(c);
        if (resta <= 0) break;
        const fatia = k === 2 ? resta : Math.round(r() * resta * 100) / 100;
        if (fatia <= 0) continue;
        c = pagar(c, fatia);
        somaPaga = Math.round((somaPaga + fatia) * 100) / 100;
      }

      expect(pagoNaReferencia(c, "2026-03-31"), `conta ${i}`).toBeCloseTo(somaPaga, 2);
      expect(saldoDaConta(c), `conta ${i}`).toBeCloseTo(Math.max(0, valor - somaPaga), 2);
      expect(saldoDaConta(c), `conta ${i}`).toBeGreaterThanOrEqual(0);
    }
  });

  it("quitada só quando o saldo zera — pagamento parcial NÃO quita", () => {
    /*
     * O bug que isto segura: pagar R$ 300 de uma fatura de R$ 1000 marcava
     * a conta como paga, e os R$ 700 sumiam do que a loja deve.
     */
    const parcial = pagar(conta({ valor: 1000 }), 300);
    expect(saldoDaConta(parcial)).toBe(700);
    expect(contaQuitada(parcial)).toBe(false);
    expect(parcialmentePaga(parcial)).toBe(true);
    expect(situacaoConta(parcial, "2026-04-05")).not.toBe("paga");

    const fim = pagar(parcial, 700);
    expect(saldoDaConta(fim)).toBe(0);
    expect(contaQuitada(fim)).toBe(true);
    expect(parcialmentePaga(fim)).toBe(false);
    expect(situacaoConta(fim, "2026-04-05")).toBe("paga");
  });

  it("pagar a mais não vira crédito escondido nem saldo negativo", () => {
    for (let i = 0; i < 5000; i++) {
      const valor = Math.round((10 + r() * 2000) * 100) / 100;
      const demais = valor + Math.round(r() * 500 * 100) / 100;
      const depois = pagar(conta({ valor }), demais);
      expect(saldoDaConta(depois), `conta ${i}`).toBe(0);
      expect(contaQuitada(depois), `conta ${i}`).toBe(true);
    }
  });

  it("a recorrente parcialmente paga NÃO pula para o mês seguinte", () => {
    // Pular deixaria o resto de hoje invisível e cobraria o mês que vem
    // como se este estivesse fechado.
    const c = conta({ valor: 1000, recorrencia: "mensal" });
    const parcial = pagar(c, 400);
    expect(parcial.vencimento, "virou o mês sem fechar a conta deste").toBe(c.vencimento);
    expect(saldoDaConta(parcial)).toBe(600);

    const fechada = pagar(parcial, 600);
    expect(fechada.vencimento, "fechou: agora sim vira o mês").toBe("2026-04-30");
  });

  it("o DIA ORIGINAL sobrevive a fevereiro, inclusive pagando em partes", () => {
    /*
     * O dia original vem do PRIMEIRO pagamento da conta, não do vencimento
     * corrente. Derivar do corrente perde o 31 assim que passa por
     * fevereiro — e o cartão passa a vencer três dias antes, para sempre.
     *
     * O parcial não pode atrapalhar: as parcelas do mesmo ciclo entram com
     * a MESMA referência, então o primeiro pagamento continua apontando
     * para o vencimento de origem.
     */
    let c = conta({ valor: 100, vencimento: "2026-01-31", recorrencia: "mensal" });
    const vistos: string[] = [];
    for (let k = 0; k < 6; k++) {
      // Metade agora, metade depois: o ciclo só fecha na segunda.
      c = pagarConta(c, { valor: 40, formaPagamento: "pix", data: "2026-01-01T00:00:00.000Z" });
      c = pagarConta(c, { valor: 60, formaPagamento: "pix", data: "2026-01-02T00:00:00.000Z" });
      vistos.push(c.vencimento);
    }
    expect(vistos).toEqual([
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
      "2026-06-30",
      "2026-07-31",
    ]);
  });

  it("receber e pagar não se misturam", () => {
    // Renda fixa lançada como despesa vira lucro negativo num mês lucrativo.
    expect(ehReceber(conta({ tipo: "receber" }))).toBe(true);
    expect(ehReceber(conta({ tipo: undefined }))).toBe(false);
    expect(ehReceber(conta({ tipo: "pagar" }))).toBe(false);
  });
});
