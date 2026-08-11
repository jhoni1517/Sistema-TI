import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ehReceber,
  ehPagar,
  custoFixoMensal,
  receitaFixaMensal,
  sobraFixaMensal,
  totalAPagarNoMes,
  totalAReceberNoMes,
  totalAtrasado,
  totalAtrasadoAReceber,
  situacaoConta,
  pagarConta,
} from "./contas";
import type { ContaPagar } from "./types";

const conta = (x: Partial<ContaPagar>): ContaPagar =>
  ({
    id: "c1",
    descricao: "Conta",
    categoria: "Outro",
    valor: 100,
    vencimento: "2026-08-10",
    recorrencia: "mensal",
    lembreteDias: 3,
    ativo: true,
    pagamentos: [],
    criadoEm: "2026-01-01T00:00:00Z",
    ...x,
  }) as ContaPagar;

describe("pagar ou receber", () => {
  /**
   * AUSENTE É PAGAR, E ISSO NÃO É DETALHE.
   *
   * Toda conta cadastrada antes deste campo existir volta do banco sem ele.
   * Ler ausente como "receber" transformaria o aluguel da loja em receita da
   * noite para o dia — e o mês fecharia com lucro que não existiu.
   */
  it("conta antiga, sem o campo, é a pagar", () => {
    const antiga = conta({});
    delete (antiga as { tipo?: string }).tipo;
    expect(ehReceber(antiga)).toBe(false);
    expect(ehPagar(antiga)).toBe(true);
  });

  it("lixo no campo também cai em pagar", () => {
    for (const ruim of ["", "PAGAR", "Receber", "x", null, undefined]) {
      expect(ehReceber({ tipo: ruim as never })).toBe(false);
    }
  });
});

describe("custo fixo x receita fixa", () => {
  const contas = [
    conta({ id: "a", valor: 1500, recorrencia: "mensal", tipo: "pagar" }), // aluguel
    conta({ id: "b", valor: 300, recorrencia: "mensal", tipo: "pagar" }), // luz
    conta({ id: "c", valor: 3000, recorrencia: "mensal", tipo: "receber" }), // salário
  ];

  /**
   * O BUG QUE ESTE TESTE EXISTE PARA IMPEDIR.
   *
   * Sem separar os lados, o salário de R$ 3.000 entraria como R$ 3.000 de
   * CUSTO fixo, e o número que a pessoa usa para saber quanto precisa
   * faturar por mês mostraria 4.800 no lugar de 1.800. É a mesma família da
   * compra de estoque contada como despesa: dinheiro do lado errado, num
   * número que ninguém confere porque parece plausível.
   */
  it("salário NÃO entra no custo fixo", () => {
    expect(custoFixoMensal(contas)).toBe(1800);
  });

  it("e entra na receita fixa", () => {
    expect(receitaFixaMensal(contas)).toBe(3000);
  });

  it("a sobra prevista é a diferença", () => {
    expect(sobraFixaMensal(contas)).toBe(1200);
  });

  /** Negativo é informação: o fixo não fecha e o resto tem que vir da venda. */
  it("sobra negativa aparece como negativa", () => {
    const apertado = [conta({ valor: 5000, tipo: "pagar" }), conta({ id: "s", valor: 2000, tipo: "receber" })];
    expect(sobraFixaMensal(apertado)).toBe(-3000);
  });

  it("conta única não entra em nenhum dos dois — não é fixa", () => {
    const unica = [conta({ valor: 900, recorrencia: "unica", tipo: "receber" })];
    expect(receitaFixaMensal(unica)).toBe(0);
    expect(custoFixoMensal(unica)).toBe(0);
  });

  it("desligada não entra", () => {
    const off = [conta({ valor: 900, tipo: "receber", ativo: false })];
    expect(receitaFixaMensal(off)).toBe(0);
  });

  /** Semanal usa 52/12: multiplicar por 4 esconde um mês por ano. */
  it("semanal normaliza por 52/12 nos dois lados", () => {
    expect(receitaFixaMensal([conta({ valor: 120, recorrencia: "semanal", tipo: "receber" })]))
      .toBeCloseTo(120 * (52 / 12), 6);
    expect(custoFixoMensal([conta({ valor: 120, recorrencia: "semanal", tipo: "pagar" })]))
      .toBeCloseTo(120 * (52 / 12), 6);
  });

  it("semestral divide por 6", () => {
    expect(receitaFixaMensal([conta({ valor: 600, recorrencia: "semestral", tipo: "receber" })])).toBe(100);
  });
});

describe("totais do mês, cada um do seu lado", () => {
  const hoje = "2026-08-11";
  const contas = [
    conta({ id: "a", valor: 800, vencimento: "2026-08-20", tipo: "pagar" }),
    conta({ id: "b", valor: 4000, vencimento: "2026-08-05", tipo: "receber" }),
    conta({ id: "c", valor: 200, vencimento: "2026-09-01", tipo: "pagar" }),
  ];

  it("a pagar no mês não inclui o que entra", () => {
    expect(totalAPagarNoMes(contas, hoje)).toBe(800);
  });

  it("a receber no mês não inclui o que sai", () => {
    expect(totalAReceberNoMes(contas, hoje)).toBe(4000);
  });

  /**
   * Somar os dois atrasos num número só daria um valor sem significado:
   * conta de luz atrasada e salário que não caiu são problemas opostos, e o
   * que se faz com cada um é o oposto também.
   */
  it("atraso é separado por lado", () => {
    expect(totalAtrasado(contas, hoje)).toBe(0);
    expect(totalAtrasadoAReceber(contas, hoje)).toBe(4000);
  });
});

describe("a receita fixa reusa a regra de vencimento", () => {
  /**
   * É o motivo de isto ser um CAMPO e não uma tela nova: a conta do dia 31
   * já custou caro para acertar, e tela nova a duplicaria.
   */
  it("salário do dia 31 passa por fevereiro e volta para 31", () => {
    let c = conta({ valor: 3000, tipo: "receber", vencimento: "2026-01-31", recorrencia: "mensal" });
    c = pagarConta(c, { valor: 3000, formaPagamento: "pix" });
    expect(c.vencimento).toBe("2026-02-28");
    c = pagarConta(c, { valor: 3000, formaPagamento: "pix" });
    expect(c.vencimento).toBe("2026-03-31");
  });

  it("recebimento único quita e não anda", () => {
    let c = conta({ valor: 500, tipo: "receber", recorrencia: "unica" });
    c = pagarConta(c, { valor: 500, formaPagamento: "pix" });
    expect(c.vencimento).toBe("2026-08-10");
    expect(situacaoConta(c, "2026-08-11")).toBe("paga");
  });
});

/**
 * O lado do lançamento no caixa vem do tipo da conta.
 *
 * Salário lançado como saída tiraria do caixa o dinheiro que acabou de
 * entrar — e o erro dobra: o valor some do que entrou E aparece no que saiu.
 * O mês fecharia com o dobro do salário de prejuízo.
 *
 * O teste lê a tela do disco em vez de recopiar a lógica: cópia dentro de
 * teste envelhece igual ao original e os dois passam a mentir juntos.
 */
describe("Contas.tsx lança do lado certo", () => {
  const fonte = readFileSync(resolve(__dirname, "..", "pages", "Contas.tsx"), "utf8");

  it("o tipo do movimento é decidido pelo tipo da conta", () => {
    expect(fonte).toMatch(/tipo:\s*recebendo\s*\?\s*"entrada"\s*:\s*"saida"/);
  });

  it("recebimento nunca é marcado como compra de estoque nem fatura", () => {
    expect(fonte).toMatch(/compraEstoque:\s*!recebendo/);
    expect(fonte).toMatch(/faturaCartao:\s*!recebendo/);
  });
});

/**
 * O PAINEL RESPEITA O RAMO, IGUAL AO MENU.
 *
 * O menu já filtrava por módulo; o Painel não — e o Painel é a PRIMEIRA
 * tela. Quem contratou mercearia abria o sistema e via "OS em aberto" e
 * "Crie a primeira em Ordens de Serviço", apontando para um menu que não
 * existe para ela. Parece sistema quebrado.
 */
describe("Dashboard.tsx não mostra OS para quem não tem", () => {
  const fonte = readFileSync(resolve(__dirname, "..", "pages", "Dashboard.tsx"), "utf8");

  it("pergunta o módulo antes de mostrar", () => {
    expect(fonte).toContain('temModulo(ramo, "os")');
  });

  it("os cards de OS estão atrás da pergunta", () => {
    expect(fonte).toMatch(/temOS\s*\?/);
  });

  it("a lista de ordens recentes também", () => {
    expect(fonte).toMatch(/\{temOS && \(/);
  });

  /**
   * Nenhuma menção a OS pode ficar FORA de um bloco guardado por `temOS`.
   *
   * A primeira versão deste teste cortava o arquivo no `{temOS && (` e
   * conferia o que vinha antes — e reprovou o código certo, porque os cards
   * usam o ternário `temOS ? ... : ...`, que está antes e é condicional do
   * mesmo jeito. O teste estava errado, não a tela.
   *
   * A régua boa é por LINHA: cada linha que fala de ordem de serviço tem que
   * estar dentro de um dos dois blocos.
   */
  it("nenhuma menção a OS fica fora de um bloco guardado", () => {
    /*
     * Apaga o CONTEÚDO dos comentários e preserva as quebras de linha, para
     * o número da linha do relatório continuar batendo com o arquivo.
     * Comentário não renderiza — o que explica o bug pode citar o texto dele,
     * e foi assim que este teste reprovou o código certo na segunda versão.
     */
    const semComentarios = fonte
      .replace(/\/\*[\s\S]*?\*\//g, (bloco) => bloco.replace(/[^\n]/g, " "))
      .replace(/\/\/[^\n]*/g, (linha) => linha.replace(/./g, " "));
    const linhas = semComentarios.split("\n");
    const inicioTernario = linhas.findIndex((l) => l.includes("temOS ? ("));
    const fimTernario = linhas.findIndex((l, i) => i > inicioTernario && l.includes(") : ("));
    const inicioBloco = linhas.findIndex((l) => l.includes("{temOS && ("));

    /*
     * AS GUARDAS TÊM QUE EXISTIR ANTES DE PROTEGEREM ALGUMA COISA.
     *
     * A primeira versão não conferia isto, e o furo era exatamente o que o
     * teste devia pegar: apagando o `temOS ? (`, o `findIndex` devolve -1, e
     * daí TODA linha entre -1 e o fim do ternário passava por "guardada".
     * O teste aprovava a tela com o bug de volta.
     *
     * Provei quebrando de propósito: trocar `temOS ? (` por `true ? (` não
     * reprovava nada. Agora reprova.
     */
    expect(inicioTernario, "sumiu a guarda dos cards de OS").toBeGreaterThan(-1);
    expect(fimTernario, "sumiu o outro lado do ternário").toBeGreaterThan(inicioTernario);
    expect(inicioBloco, "sumiu a guarda da lista de ordens").toBeGreaterThan(-1);

    const guardada = (i: number) =>
      (i >= inicioTernario && i <= fimTernario) || i >= inicioBloco;

    const soltas = linhas
      .map((linha, i) => ({ linha, i }))
      .filter(({ linha }) => /OS em aberto|Ordens de Serviço|navigate\("\/ordens"\)/.test(linha))
      .filter(({ i }) => !guardada(i));

    expect(
      soltas.map((x) => `linha ${x.i + 1}: ${x.linha.trim()}`),
      "menção a OS sem passar por temOS"
    ).toEqual([]);
  });
});
