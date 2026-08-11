import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resumoRenda, rendaOrdenada, pagarConta, situacaoConta } from "./contas";
import type { ContaPagar } from "./types";

/**
 * Renda fixa: quem recebe dois salários e auxílio do governo.
 *
 * A pergunta desta tela não é "quanto eu ganho" — é "o que já caiu e o que
 * ainda falta cair". Quem depende do dinheiro passa o mês fazendo essa
 * conta de cabeça.
 */

const renda = (x: Partial<ContaPagar>): ContaPagar =>
  ({
    id: "r1",
    descricao: "Salário",
    categoria: "Salário",
    valor: 2000,
    vencimento: "2026-08-05",
    recorrencia: "mensal",
    tipo: "receber",
    lembreteDias: 3,
    ativo: true,
    pagamentos: [],
    criadoEm: "2026-01-01T00:00:00Z",
    ...x,
  }) as ContaPagar;

const hoje = "2026-08-11";

describe("o retrato do mês", () => {
  const contas = [
    /* Já recebido: `pagarConta` registrou o pagamento E avançou a data para
       setembro, que é o que acontece de verdade ao tocar em "Recebi". Na
       primeira versão deste teste eu deixei a data em agosto, e ele reprovou
       acusando "não caiu" um salário que tinha caído — cenário meu impossível
       na vida real, não bug do sistema. */
    renda({ id: "a", descricao: "Salário fábrica", valor: 2000, vencimento: "2026-09-05",
            pagamentos: [{ data: "2026-08-05T12:00:00Z", valor: 1950, formaPagamento: "pix", referencia: "2026-08-05" }] }),
    renda({ id: "b", descricao: "Salário meio período", valor: 1200, vencimento: "2026-08-20" }),
    renda({ id: "c", descricao: "Bolsa Família", valor: 600, vencimento: "2026-08-08" }),
    // Despesa não pode entrar em nada disto.
    renda({ id: "z", descricao: "Energia", valor: 300, tipo: "pagar", vencimento: "2026-08-15" }),
  ];
  const r = resumoRenda(contas, hoje);

  it("previsto do mês soma só o que entra", () => {
    expect(r.previstoMes).toBe(3800);
  });

  /**
   * O RECEBIDO SAI DO PAGAMENTO, NÃO DO CADASTRO.
   *
   * O salário veio R$ 1.950 e não R$ 2.000 — desconto, falta, o que for.
   * Mostrar o cadastrado faria a tela mentir para o lado otimista, e quem
   * depende do dinheiro é justamente quem não pode ser enganado sobre ele.
   */
  it("já caiu usa o valor que entrou de verdade", () => {
    expect(r.recebidoMes).toBe(1950);
  });

  it("ainda vem é o que não venceu", () => {
    expect(r.aReceberMes).toBe(1200);
  });

  /** O auxílio de 08/08 não caiu e hoje é 11/08. */
  it("não caiu é o que passou da data", () => {
    expect(r.atrasado).toBe(600);
  });

  it("conta o número de fontes, sem as despesas", () => {
    expect(r.fontes).toBe(3);
  });

  it("mês vazio não inventa número", () => {
    const vazio = resumoRenda([], hoje);
    expect(vazio).toEqual({ previstoMes: 0, recebidoMes: 0, aReceberMes: 0, atrasado: 0, fontes: 0 });
  });

  it("renda desligada sai de tudo", () => {
    const off = resumoRenda([renda({ ativo: false })], hoje);
    expect(off.previstoMes).toBe(0);
    expect(off.fontes).toBe(0);
  });

  /** Pagamento de outro mês não pode contar como deste. */
  it("recebimento do mês passado não entra", () => {
    const antiga = renda({
      pagamentos: [{ data: "2026-07-05T12:00:00Z", valor: 2000, formaPagamento: "pix", referencia: "2026-07-05" }],
    });
    expect(resumoRenda([antiga], hoje).recebidoMes).toBe(0);
  });
});

describe("a ordem da lista", () => {
  /**
   * O auxílio de R$ 600 atrasado pesa mais na vida de quem depende dele do
   * que o salário de R$ 3.000 que cai daqui a vinte dias. Ordenar por valor
   * seria o erro clássico.
   */
  it("o que não caiu vem primeiro, mesmo valendo menos", () => {
    const lista = rendaOrdenada(
      [
        renda({ id: "grande", valor: 3000, vencimento: "2026-08-30" }),
        renda({ id: "atrasado", valor: 600, vencimento: "2026-08-02" }),
      ],
      hoje
    );
    expect(lista.map((c) => c.id)).toEqual(["atrasado", "grande"]);
  });

  it("depois vem o que cai antes", () => {
    const lista = rendaOrdenada(
      [
        renda({ id: "dia25", vencimento: "2026-08-25" }),
        renda({ id: "dia15", vencimento: "2026-08-15" }),
      ],
      hoje
    );
    expect(lista.map((c) => c.id)).toEqual(["dia15", "dia25"]);
  });

  it("desligada vai para o fim", () => {
    const lista = rendaOrdenada(
      [
        renda({ id: "off", ativo: false, vencimento: "2026-08-12" }),
        renda({ id: "on", vencimento: "2026-08-28" }),
      ],
      hoje
    );
    expect(lista.map((c) => c.id)).toEqual(["on", "off"]);
  });

  it("despesa nunca aparece na lista de renda", () => {
    const lista = rendaOrdenada([renda({ id: "x", tipo: "pagar" })], hoje);
    expect(lista).toEqual([]);
  });
});

describe("a regra de vencimento é a mesma, e é esse o ponto", () => {
  /**
   * É o motivo de a tela nova ler os MESMOS dados e usar as MESMAS funções:
   * a conta do dia 31 já custou caro para acertar, e uma segunda
   * implementação envelheceria em um dos dois lugares.
   */
  it("auxílio do dia 31 passa por fevereiro e volta para 31", () => {
    let c = renda({ valor: 600, vencimento: "2026-01-31" });
    c = pagarConta(c, { valor: 600, formaPagamento: "pix" });
    expect(c.vencimento).toBe("2026-02-28");
    c = pagarConta(c, { valor: 600, formaPagamento: "pix" });
    expect(c.vencimento).toBe("2026-03-31");
  });

  it("recebimento único quita e não anda", () => {
    let c = renda({ recorrencia: "unica", vencimento: "2026-08-05" });
    c = pagarConta(c, { valor: 2000, formaPagamento: "pix" });
    expect(situacaoConta(c, hoje)).toBe("paga");
  });
});

/**
 * AS DUAS TELAS NÃO PODEM MOSTRAR O DADO UMA DA OUTRA.
 *
 * O dado é o mesmo (`contas_pagar`), e o corte é por `tipo`. Se um dos dois
 * lados esquecer de filtrar, o salário aparece no meio das contas a pagar —
 * ou, pior, a conta de luz aparece como renda e o total do mês mente.
 *
 * Lê os arquivos do disco em vez de recopiar a lógica: cópia dentro de teste
 * envelhece igual ao original e os dois passam a mentir juntos.
 */
describe("cada tela mostra só o seu lado", () => {
  const contas = readFileSync(resolve(__dirname, "..", "pages", "Contas.tsx"), "utf8");
  const renda = readFileSync(resolve(__dirname, "..", "pages", "Renda.tsx"), "utf8");

  it("Contas a Pagar filtra por ehPagar", () => {
    expect(contas).toMatch(/contas\.filter\(ehPagar\)/);
  });

  it("o aviso do topo de Contas também filtra", () => {
    expect(contas).toMatch(/contasParaAvisar\(contas\.filter\(ehPagar\)\)/);
  });

  it("Renda usa rendaOrdenada, que já filtra", () => {
    expect(renda).toContain("rendaOrdenada(contas");
  });

  /**
   * A armadilha que existiu por um commit: o seletor "sai / entra" no
   * formulário de Contas fazia a conta SUMIR da tela no instante em que era
   * salva como "entra", porque a lista de lá filtra por ehPagar. Sumir sem
   * erro e sem explicação é o pior jeito de uma tela responder.
   */
  it("Contas não oferece cadastrar o que entra", () => {
    expect(contas).not.toContain("Entra (recebo)");
    expect(contas).not.toContain("TIPO_CONTA_META");
  });

  it("Renda grava sempre como receber, sem perguntar", () => {
    expect(renda).toMatch(/tipo:\s*"receber"/);
  });

  it("Renda lança ENTRADA no caixa, nunca saída", () => {
    expect(renda).toMatch(/tipo:\s*"entrada"/);
    expect(renda).not.toMatch(/tipo:\s*"saida"/);
  });

  /** Dinheiro primeiro: o movimento é gravado antes da baixa da renda. */
  it("Renda grava o movimento antes da conta", () => {
    expect(renda.indexOf("saveMovimento(")).toBeLessThan(renda.indexOf("saveConta(atualizada)"));
  });
});
