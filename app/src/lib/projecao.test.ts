import { describe, it, expect } from "vitest";
import { projetarCaixa, ocorrenciasDaConta, resumoDaProjecao } from "./projecao";
import type { ContaPagar } from "./types";

const conta = (x: Partial<ContaPagar>): ContaPagar =>
  ({
    id: "c1",
    descricao: "Conta",
    categoria: "Outro",
    valor: 100,
    vencimento: "2026-08-20",
    recorrencia: "mensal",
    lembreteDias: 3,
    ativo: true,
    pagamentos: [],
    criadoEm: "2026-01-01T00:00:00Z",
    ...x,
  }) as ContaPagar;

const hoje = "2026-08-12";

describe("as ocorrências de uma conta na janela", () => {
  it("mensal repete dentro do período", () => {
    const oc = ocorrenciasDaConta(
      conta({ vencimento: "2026-08-15", recorrencia: "mensal" }),
      hoje,
      "2026-11-30"
    );
    expect(oc.map((o) => o.dia)).toEqual(["2026-08-15", "2026-09-15", "2026-10-15", "2026-11-15"]);
  });

  /** A primeira é a gravada; as outras são calculadas, e a tela precisa saber. */
  it("marca quais são projeção e qual é a real", () => {
    const oc = ocorrenciasDaConta(conta({ vencimento: "2026-08-15" }), hoje, "2026-10-30");
    expect(oc.map((o) => o.projetado)).toEqual([false, true, true]);
  });

  /**
   * A REGRA DO DIA 31 VALE AQUI TAMBÉM.
   *
   * É o motivo de reusar `proximoVencimento` em vez de somar um mês na mão:
   * a conta do dia 31 tem que voltar para 31 depois de fevereiro, e uma
   * segunda implementação envelheceria em um dos dois lugares.
   */
  it("dia 31 passa por fevereiro e volta", () => {
    const oc = ocorrenciasDaConta(
      conta({ vencimento: "2026-01-31", recorrencia: "mensal" }),
      "2026-01-01",
      "2026-04-30"
    );
    expect(oc.map((o) => o.dia)).toEqual([
      "2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30",
    ]);
  });

  it("conta única aparece uma vez só", () => {
    const oc = ocorrenciasDaConta(
      conta({ vencimento: "2026-08-20", recorrencia: "unica" }),
      hoje,
      "2026-12-31"
    );
    expect(oc).toHaveLength(1);
  });

  it("única já paga não aparece", () => {
    const paga = conta({
      recorrencia: "unica",
      pagamentos: [{ data: "2026-08-01T12:00:00Z", valor: 100, formaPagamento: "pix", referencia: "2026-08-20" }],
    });
    expect(ocorrenciasDaConta(paga, hoje, "2026-12-31")).toEqual([]);
  });

  it("desligada não aparece", () => {
    expect(ocorrenciasDaConta(conta({ ativo: false }), hoje, "2026-12-31")).toEqual([]);
  });

  it("valor zerado não aparece — não é compromisso", () => {
    expect(ocorrenciasDaConta(conta({ valor: 0 }), hoje, "2026-12-31")).toEqual([]);
  });

  /**
   * VENCIDA E NÃO PAGA ENTRA HOJE, e este teste é o que pegou o bug.
   *
   * A primeira versão só olhava de hoje para frente, e a conta vencida
   * anteontem sumia da previsão. O dinheiro continua tendo que sair, com
   * MAIS urgência — e uma previsão que esconde o atrasado esconde
   * exatamente o buraco que ela existe para mostrar.
   */
  it("conta vencida e não paga entra no dia de hoje", () => {
    const oc = ocorrenciasDaConta(
      conta({ vencimento: "2026-08-10", recorrencia: "mensal" }),
      hoje,
      "2026-09-30"
    );
    expect(oc.map((o) => o.dia)).toEqual([hoje, "2026-09-10"]);
    expect(oc[0].atrasado).toBe(true);
    expect(oc[1].atrasado).toBe(false);
  });

  /**
   * A ASSIMETRIA QUE SEGURA A HONESTIDADE DA PREVISÃO.
   *
   * Conta atrasada aumenta o buraco; renda atrasada NÃO o tapa. O salário
   * que era para cair dia 5 e não caiu é exatamente o dinheiro com que não
   * se pode contar — somá-lo faria a tela dizer que o mês está coberto por
   * causa de dinheiro que já provou que pode não vir.
   */
  it("renda atrasada NÃO entra: não se conta com o que não caiu", () => {
    const oc = ocorrenciasDaConta(
      conta({ vencimento: "2026-08-05", recorrencia: "mensal", tipo: "receber" }),
      hoje,
      "2026-09-30"
    );
    expect(oc.map((o) => o.dia)).toEqual(["2026-09-05"]);
  });

  it("o que está no futuro não é marcado como atrasado", () => {
    const oc = ocorrenciasDaConta(conta({ vencimento: "2026-08-20" }), hoje, "2026-09-30");
    expect(oc.every((o) => !o.atrasado)).toBe(true);
  });
});

describe("a projeção do caixa", () => {
  const contas = [
    conta({ id: "sal", descricao: "Salário", valor: 2000, vencimento: "2026-08-05", tipo: "receber" }),
    conta({ id: "alu", descricao: "Aluguel", valor: 1500, vencimento: "2026-08-15" }),
    conta({ id: "luz", descricao: "Energia", valor: 300, vencimento: "2026-08-20" }),
  ];

  /**
   * O NÚMERO DA TELA É A DATA EM QUE FALTA, E O PRIMEIRO DIA.
   *
   * Aqui o salário do dia 5 já passou (hoje é 12), então entra só o do dia 5
   * de setembro. O aluguel do dia 15 abre o buraco de 1500, e a luz do dia 20
   * aumenta para 1800 — mas o dia que importa é o 15, porque é nele que a
   * pessoa precisa ter feito alguma coisa.
   */
  it("aponta o PRIMEIRO dia negativo, não o pior", () => {
    const p = projetarCaixa(contas, hoje, 20);
    expect(p.aperto?.dia).toBe("2026-08-15");
    expect(p.aperto?.falta).toBe(1500);
    expect(p.menorSaldo.dia).toBe("2026-08-20");
    expect(p.menorSaldo.valor).toBe(-1800);
  });

  it("soma o que entra e o que sai no período", () => {
    const p = projetarCaixa(contas, hoje, 20);
    expect(p.totalSai).toBe(1800);
    expect(p.totalEntra).toBe(0);
    expect(p.precisaVir).toBe(1800);
  });

  /** Janela maior alcança o salário do mês seguinte e muda o quadro. */
  it("a janela de 60 dias alcança o mês seguinte", () => {
    const p = projetarCaixa(contas, hoje, 60);
    // 60 dias a partir de 12/08 vai até 11/10: pega o salário de setembro E o
    // de outubro. Na primeira versão eu contei só um e o teste me corrigiu.
    expect(p.totalEntra).toBe(4000);
    expect(p.totalSai).toBe(3600);
  });

  it("sem nada cadastrado não inventa número", () => {
    const p = projetarCaixa([], hoje, 60);
    expect(p.dias).toEqual([]);
    expect(p.aperto).toBeUndefined();
    expect(p.precisaVir).toBe(0);
  });

  /** Mês coberto não pode acusar aperto. */
  it("quando entra mais do que sai, não há aperto", () => {
    const folgado = [
      conta({ id: "s", valor: 5000, vencimento: "2026-08-13", tipo: "receber" }),
      conta({ id: "a", valor: 1500, vencimento: "2026-08-15" }),
    ];
    const p = projetarCaixa(folgado, hoje, 20);
    expect(p.aperto).toBeUndefined();
    expect(p.precisaVir).toBe(0);
  });

  /**
   * A ORDEM DENTRO DO DIA: o que sai primeiro.
   * Quem abre a tela quer ver o que preocupa, não o que alivia.
   */
  it("dentro do dia, a saída aparece antes da entrada", () => {
    const mesmoDia = [
      conta({ id: "e", valor: 500, vencimento: "2026-08-14", tipo: "receber" }),
      conta({ id: "s", valor: 200, vencimento: "2026-08-14" }),
    ];
    const p = projetarCaixa(mesmoDia, hoje, 10);
    expect(p.dias[0].compromissos.map((c) => c.direcao)).toEqual(["sai", "entra"]);
    expect(p.dias[0].acumulado).toBe(300);
  });

  it("os dias saem em ordem cronológica", () => {
    const p = projetarCaixa(contas, hoje, 60);
    const dias = p.dias.map((d) => d.dia);
    expect([...dias].sort()).toEqual(dias);
  });

  /** Dinheiro fechado em centavos, como tudo no sistema. */
  it("nunca devolve dízima", () => {
    const quebrado = [
      conta({ id: "a", valor: 33.33, vencimento: "2026-08-14" }),
      conta({ id: "b", valor: 33.33, vencimento: "2026-08-15" }),
      conta({ id: "c", valor: 33.34, vencimento: "2026-08-16" }),
    ];
    const p = projetarCaixa(quebrado, hoje, 20);
    expect(p.totalSai).toBe(100);
    for (const d of p.dias) {
      expect(Math.round(d.acumulado * 100) / 100).toBe(d.acumulado);
    }
  });
});

describe("a frase que vai para a tela", () => {
  it("com aperto, diz o dia e quanto falta", () => {
    const p = projetarCaixa(
      [conta({ valor: 1500, vencimento: "2026-08-15" })],
      hoje,
      20
    );
    const f = resumoDaProjecao(p, 20);
    expect(f).toContain("dia 15/08");
    expect(f).toContain("R$ 1.500,00");
  });

  it("sem nada cadastrado, ensina o que fazer em vez de mostrar zero", () => {
    expect(resumoDaProjecao(projetarCaixa([], hoje), 60)).toContain("Cadastre");
  });

  it("coberto, diz que está coberto", () => {
    const p = projetarCaixa(
      [
        conta({ id: "s", valor: 5000, vencimento: "2026-08-13", tipo: "receber" }),
        conta({ id: "a", valor: 100, vencimento: "2026-08-15" }),
      ],
      hoje,
      20
    );
    expect(resumoDaProjecao(p, 20)).toContain("cobertos");
  });

  /** O texto também sai no Telegram: emoji vira "?" em alguns aparelhos. */
  it("não tem emoji", () => {
    const p = projetarCaixa([conta({ valor: 1500, vencimento: "2026-08-15" })], hoje, 20);
    for (const dias of [20, 60]) {
      expect(resumoDaProjecao(p, dias)).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    }
  });
});
