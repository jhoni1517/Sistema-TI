import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resumoCaixa, totaisParaCongelar, conferencia } from "./caixa";
import type { MovimentoCaixa, SessaoCaixa } from "./types";

/**
 * O FECHAMENTO DE ONTEM NÃO PODE MUDAR HOJE.
 *
 * O histórico recalculava tudo a partir dos movimentos, a cada abertura da
 * tela. Então corrigir um valor, apagar uma saída ou lançar com data
 * retroativa mudava RETROATIVAMENTE a conferência de um dia que o operador
 * já tinha contado e assinado.
 *
 * A diferença de ontem passava a mostrar um valor que não existia ontem — e
 * quem fosse procurar o erro procuraria dinheiro que nunca faltou.
 *
 * Ficou mais grave quando o lançamento manual ganhou campo de data: hoje dá
 * para lançar uma saída de semana passada, e ela cai dentro de uma sessão
 * já fechada.
 */

const mov = (x: Partial<MovimentoCaixa>): MovimentoCaixa =>
  ({
    id: "m" + Math.random(),
    tipo: "entrada",
    categoria: "Venda",
    descricao: "",
    valor: 100,
    formaPagamento: "dinheiro",
    data: "2026-08-10T12:00:00Z",
    sessaoId: "s1",
    ...x,
  }) as MovimentoCaixa;

const sessao = (x: Partial<SessaoCaixa> = {}): SessaoCaixa =>
  ({
    id: "s1",
    abertoEm: "2026-08-10T08:00:00Z",
    valorAbertura: 100,
    ...x,
  }) as SessaoCaixa;

describe("sessão fechada com os totais congelados", () => {
  const movs = [
    mov({ valor: 200, formaPagamento: "dinheiro" }),
    mov({ valor: 500, formaPagamento: "credito" }),
    mov({ tipo: "saida", valor: 50, formaPagamento: "dinheiro" }),
  ];

  const aberta = sessao();
  const congelados = totaisParaCongelar(resumoCaixa(aberta, movs));

  it("congela o que a tela mostrava no fechamento", () => {
    expect(congelados.abertura).toBe(100);
    expect(congelados.entradas).toBe(700);
    expect(congelados.saidas).toBe(50);
    expect(congelados.saldo).toBe(750);
    // Só papel: os R$ 500 do crédito nunca passaram pela gaveta.
    expect(congelados.emEspecie).toBe(250);
    expect(congelados.quantidade).toBe(3);
  });

  /**
   * O TESTE QUE É O PONTO DE TUDO.
   *
   * Depois de fechada, chega um lançamento retroativo naquela sessão. O
   * resumo tem que ignorar: aquele dia já foi contado e assinado.
   */
  it("lançamento novo NÃO muda o fechamento já feito", () => {
    const fechada = sessao({
      fechadoEm: "2026-08-10T18:00:00Z",
      valorContado: 250,
      totaisFechamento: congelados,
    });

    const comIntruso = [...movs, mov({ tipo: "saida", valor: 999, descricao: "lançado depois" })];
    const r = resumoCaixa(fechada, comIntruso);

    expect(r.saldo).toBe(750);
    expect(r.emEspecie).toBe(250);
    expect(r.quantidade).toBe(3);
    expect(r.diferenca).toBe(0);
    expect(conferencia(r)).toBe("certo");
  });

  it("apagar um movimento também não mexe", () => {
    const fechada = sessao({ fechadoEm: "x", valorContado: 250, totaisFechamento: congelados });
    const r = resumoCaixa(fechada, []);
    expect(r.entradas).toBe(700);
    expect(r.diferenca).toBe(0);
  });

  /** A diferença continua sendo calculada — só a base é que é congelada. */
  it("a diferença sai da contagem, não do congelado", () => {
    const faltou = sessao({ fechadoEm: "x", valorContado: 230, totaisFechamento: congelados });
    expect(resumoCaixa(faltou, movs).diferenca).toBe(-20);
    expect(conferencia(resumoCaixa(faltou, movs))).toBe("falta");
  });

  /**
   * "Não conferido" não é "conferido e bateu": zero ali seria mentira, e
   * apagaria a diferença entre ninguém ter contado e ter contado certo.
   */
  it("sem contagem, a diferença continua indefinida", () => {
    const semContar = sessao({ fechadoEm: "x", totaisFechamento: congelados });
    expect(resumoCaixa(semContar, movs).diferenca).toBeUndefined();
    expect(conferencia(resumoCaixa(semContar, movs))).toBe("nao_conferido");
  });

  /** A diferença é contra o PAPEL, nunca contra o saldo. Vale congelado também. */
  it("a diferença é contra emEspecie, não contra o saldo", () => {
    const fechada = sessao({ fechadoEm: "x", valorContado: 250, totaisFechamento: congelados });
    const r = resumoCaixa(fechada, movs);
    // Contra o saldo daria -500, e o operador procuraria meio dia por um
    // dinheiro que está na maquininha.
    expect(r.diferenca).toBe(0);
    expect(r.saldo).toBe(750);
  });
});

describe("sessão antiga, sem os totais", () => {
  /**
   * Fechada antes do campo existir. Continua sendo recalculada — é o melhor
   * que dá para fazer com o histórico que já existe, e é por isso que a
   * checagem é pelo CAMPO e não pela data de fechamento.
   */
  it("recalcula, como fazia antes", () => {
    const antiga = sessao({ fechadoEm: "2026-01-05T18:00:00Z", valorContado: 300 });
    const r = resumoCaixa(antiga, [mov({ valor: 200 })]);
    expect(r.entradas).toBe(200);
    expect(r.emEspecie).toBe(300);
    expect(r.diferenca).toBe(0);
  });

  it("sessão aberta sempre recalcula: ela ainda está viva", () => {
    const r = resumoCaixa(sessao(), [mov({ valor: 200 })]);
    expect(r.entradas).toBe(200);
  });
});

/**
 * A tela grava o MESMO resumo que mostrou, e não um recálculo à parte.
 * Gravar número diferente do que o operador acabou de conferir seria a pior
 * forma possível de errar aqui.
 */
describe("Caixa.tsx congela o que estava na tela", () => {
  const fonte = readFileSync(resolve(__dirname, "..", "pages", "Caixa.tsx"), "utf8");

  it("usa totaisParaCongelar no fechamento", () => {
    expect(fonte).toContain("totaisFechamento: totaisParaCongelar(resumo)");
  });

  it("e o `resumo` é o mesmo que a tela usa", () => {
    expect(fonte).toMatch(/const resumo = useMemo\(/);
  });
});
