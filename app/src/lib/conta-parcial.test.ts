import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  pagarConta,
  saldoDaConta,
  pagoNaReferencia,
  parcialmentePaga,
  contaQuitada,
  situacaoConta,
  totalAPagarNoMes,
  totalAtrasado,
  totalAReceberNoMes,
} from "./contas";
import { projetarCaixa, ocorrenciasDaConta } from "./projecao";
import type { ContaPagar } from "./types";

/**
 * ============================================================
 *  PAGAR UM PEDAÇO DA CONTA
 * ============================================================
 *
 * A fatura do cartão é R$ 1.000 e neste mês dá para pagar R$ 300.
 *
 * Antes, todo pagamento fechava o ciclo: a conta era dada como paga e a
 * recorrente pulava para o mês seguinte. Os R$ 700 que continuavam devidos
 * sumiam da lista, do total do mês, da previsão e do aviso de vencimento — e
 * a única lembrança de que existiam era a memória de quem pagou.
 *
 * Dívida que some da tela é a pior classe de erro deste sistema: ninguém
 * procura por uma conta que o sistema diz que não existe.
 */

const fatura = (o: Partial<ContaPagar> = {}): ContaPagar =>
  ({
    id: "cartao",
    descricao: "Cartão de crédito",
    categoria: "Outro",
    valor: 1000,
    vencimento: "2026-08-10",
    recorrencia: "mensal",
    lembreteDias: 3,
    ativo: true,
    tipo: "pagar",
    pagamentos: [],
    criadoEm: "2026-01-01",
    ...o,
  }) as ContaPagar;

const pagar = (c: ContaPagar, valor: number, data = "2026-08-12T10:00:00.000Z") =>
  pagarConta(c, { valor, formaPagamento: "pix", data });

describe("pagar R$ 300 de uma fatura de R$ 1.000", () => {
  const depois = pagar(fatura(), 300);

  it("abate o que foi pago", () => {
    expect(pagoNaReferencia(depois)).toBe(300);
    expect(saldoDaConta(depois)).toBe(700);
  });

  it("NÃO empurra o vencimento", () => {
    // Era o bug: a conta pulava para setembro e os R$ 700 sumiam.
    expect(depois.vencimento).toBe("2026-08-10");
  });

  it("continua aparecendo como conta em aberto", () => {
    expect(situacaoConta(depois, "2026-08-12")).toBe("atrasada");
    expect(parcialmentePaga(depois)).toBe(true);
  });

  it("o total do mês passa a cobrar só o que falta", () => {
    // Continuar somando R$ 1.000 mandaria separar de novo um dinheiro que já
    // saiu do caixa.
    expect(totalAPagarNoMes([depois], "2026-08-12")).toBe(700);
    expect(totalAtrasado([depois], "2026-08-12")).toBe(700);
  });
});

describe("terminar de pagar", () => {
  it("o segundo pagamento fecha o ciclo e anda o vencimento", () => {
    const c = pagar(pagar(fatura(), 300), 700);
    // O ciclo de agosto ficou pago inteiro...
    expect(pagoNaReferencia(c, "2026-08-10")).toBe(1000);
    // ...e por isso a conta andou para setembro.
    expect(c.vencimento).toBe("2026-09-10");
    expect(c.pagamentos).toHaveLength(2);
  });

  it("o novo ciclo nasce devendo o valor cheio", () => {
    // Os pagamentos do ciclo anterior ficam presos à referência DELE. Sem
    // isso, uma conta paga há dois anos apareceria com saldo negativo e nunca
    // mais cobraria nada.
    const c = pagar(pagar(fatura(), 300), 700);
    expect(pagoNaReferencia(c)).toBe(0);
    expect(saldoDaConta(c)).toBe(1000);
  });

  it("três parcelas também fecham", () => {
    const c = pagar(pagar(pagar(fatura(), 300), 300), 400);
    expect(pagoNaReferencia(c, "2026-08-10")).toBe(1000);
    expect(c.vencimento).toBe("2026-09-10");
  });

  it("pagar tudo de uma vez continua funcionando como antes", () => {
    const c = pagar(fatura(), 1000);
    expect(c.vencimento).toBe("2026-09-10");
    expect(saldoDaConta(c)).toBe(1000);
  });
});

describe("os cantos que doem", () => {
  it("pagar a mais não vira crédito para o mês seguinte", () => {
    /*
     * Crédito com fornecedor é conversa entre pessoas, não conta de sistema.
     * Um abatimento automático que ninguém pediu faria a conta do mês
     * seguinte nascer menor sem explicação na tela.
     */
    const c = pagar(fatura(), 1100);
    expect(c.vencimento).toBe("2026-09-10");
    // Setembro nasce devendo os R$ 1.000 cheios: os R$ 100 a mais não viram
    // desconto no mês seguinte.
    expect(saldoDaConta(c)).toBe(1000);
  });

  it("centavos não deixam resto que impede o fechamento", () => {
    // 0.1 + 0.2 dá 0.30000000000000004 em ponto flutuante. Sem arredondar em
    // centavos, a conta ficaria eternamente devendo um resto invisível e
    // nunca andaria de mês.
    const c = pagar(pagar(fatura({ valor: 0.3 }), 0.1), 0.2);
    expect(pagoNaReferencia(c, "2026-08-10")).toBe(0.3);
    expect(c.vencimento).toBe("2026-09-10");
  });

  it("conta única paga pela metade não fica quitada", () => {
    const c = pagar(fatura({ recorrencia: "unica" }), 300);
    expect(contaQuitada(c)).toBe(false);
    expect(saldoDaConta(c)).toBe(700);
  });

  it("conta única paga inteira fica quitada", () => {
    const c = pagar(fatura({ recorrencia: "unica" }), 1000);
    expect(contaQuitada(c)).toBe(true);
  });

  it("a conta do dia 31 continua voltando para o dia 31", () => {
    /*
     * A regra que já custou caro: dia 31 + 1 mês vira 28 em fevereiro e
     * PRECISA voltar para 31 em março. O dia de origem sai do primeiro
     * pagamento da vida da conta, e o pagamento parcial não pode estragar
     * isso — as parcelas do mesmo ciclo entram com a mesma referência.
     */
    let c = fatura({ vencimento: "2026-01-31" });
    c = pagar(c, 500);
    c = pagar(c, 500);
    expect(c.vencimento).toBe("2026-02-28");
    c = pagar(c, 400);
    expect(c.vencimento).toBe("2026-02-28"); // parcial: não andou
    c = pagar(c, 600);
    expect(c.vencimento).toBe("2026-03-31"); // voltou para o 31
  });
});

describe("a renda recebida pela metade", () => {
  const salario = (o: Partial<ContaPagar> = {}) =>
    fatura({
      id: "sal",
      descricao: "Salário",
      tipo: "receber",
      valor: 2000,
      vencimento: "2026-08-05",
      ...o,
    });

  it("metade que caiu para de contar como dinheiro que ainda vem", () => {
    const c = pagar(salario(), 1200);
    expect(saldoDaConta(c)).toBe(800);
    expect(totalAReceberNoMes([c], "2026-08-03")).toBe(800);
  });
});

describe("a previsão de caixa", () => {
  it("o ciclo corrente entra pelo saldo e os seguintes pelo valor cheio", () => {
    /*
     * Usar o saldo em todas faria a previsão do trimestre nascer R$ 300 mais
     * barata; usar o cheio na primeira mandaria separar dinheiro já pago. Os
     * dois erros mentem sobre a mesma decisão — dá para pagar o fornecedor
     * hoje?
     */
    const c = pagar(fatura({ vencimento: "2026-08-20" }), 300, "2026-08-12T10:00:00.000Z");
    const ocorr = ocorrenciasDaConta(c, "2026-08-12", "2026-10-31");
    expect(ocorr.map((o) => o.valor)).toEqual([700, 1000, 1000]);
  });

  it("o total a sair desconta o que já foi pago", () => {
    const c = pagar(fatura({ vencimento: "2026-08-20" }), 300, "2026-08-12T10:00:00.000Z");
    const p = projetarCaixa([c], "2026-08-12", 20);
    expect(p.totalSai).toBe(700);
  });

  it("conta vencida e paga pela metade entra HOJE, pelo que falta", () => {
    // Vencida e não paga entra hoje porque é quando precisa ser resolvida.
    // Paga pela metade continua valendo a mesma regra, com o saldo.
    const c = pagar(fatura({ vencimento: "2026-08-01" }), 300, "2026-08-12T10:00:00.000Z");
    const p = projetarCaixa([c], "2026-08-12", 5);
    expect(p.dias[0].dia).toBe("2026-08-12");
    expect(p.dias[0].sai).toBe(700);
    expect(p.dias[0].compromissos[0].atrasado).toBe(true);
  });
});

/*
 * A tela de Renda fixa tem modal próprio, com vocabulário próprio: aqui o
 * dinheiro CAI, não vence, e ninguém "paga" um salário. A regra é a mesma do
 * Contas a pagar, mas a tela é outra — e a segunda tela é justamente onde
 * uma regra escrita costuma ficar de fora.
 */
describe("a tela de Renda fixa usa a mesma regra", () => {
  const tela = readFileSync(new URL("../pages/Renda.tsx", import.meta.url), "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("o campo já vem com o que FALTA, não com o combinado", () => {
    // De R$ 650 com R$ 400 recebidos, oferecer R$ 650 de novo faria a pessoa
    // lançar o mês inteiro duas vezes.
    expect(tela).toMatch(/setValorRec\(saldoDaConta\(c\)\)/);
    expect(tela).not.toMatch(/setValorRec\(Number\(c\.valor\)/);
  });

  it("avisa antes de confirmar que a renda continua esperando", () => {
    expect(tela).toMatch(/Caiu só uma parte/);
    expect(tela).toMatch(/CONTINUA na lista esperando/);
  });

  it("a lista mostra quanto ainda vem, e não o combinado", () => {
    expect(tela).toMatch(/parcialmentePaga\(c\) \? saldoDaConta\(c\)/);
    expect(tela).toMatch(/Caiu em parte · faltam/);
  });

  it("o alarme de valor diferente compara com o que falta", () => {
    /*
     * Comparando com o cadastrado, lançar os R$ 250 certos de uma renda de
     * R$ 650 com R$ 400 já recebidos disparava "diferente do cadastrado
     * (R$ 650,00)" — alarme falso no lançamento CORRETO. Alarme que dispara
     * sempre é alarme que ninguém lê.
     */
    expect(tela).toMatch(/valorRec !== saldoDaConta\(recebendo\)/);
  });

  it("o lançamento no caixa sai marcado como parcial", () => {
    expect(tela).toMatch(/" - parcial"/);
  });

  it("não promete a próxima data quando ainda falta cair", () => {
    // "Próximo: 05/09" depois de um recebimento parcial faria a pessoa sair
    // da tela achando que o mês está resolvido.
    expect(tela).toMatch(/Ainda faltam \$\{brl\(restou\)\} desta renda/);
  });
});
