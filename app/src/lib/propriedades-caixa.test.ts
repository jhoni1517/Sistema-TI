import { describe, it, expect } from "vitest";
import { resumoCaixa, conferencia, totaisParaCongelar, agruparPorDia } from "./caixa";
import type { MovimentoCaixa, SessaoCaixa } from "./types";

/**
* PROPRIEDADE: do caixa. A regra que precisa aguentar tudo:
 *
 *   a gaveta se confere contra o PAPEL, nunca contra o saldo.
 *
 * O saldo soma cartão e Pix, que nunca passaram pela gaveta. Conferir contra
 * ele acusa falta todo santo dia numa loja que vende na maquininha — e
 * diferença que aparece sempre é diferença que a pessoa aprende a ignorar,
 * justamente para o dia em que falta dinheiro de verdade.
 */

function semente(s: number) {
  let x = s >>> 0 || 1;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
}
const r = semente(987654321);
const din = () => Math.round(r() * 200000) / 100;

const FORMAS = ["dinheiro", "pix", "credito", "debito", "transferencia", "vale_refeicao"] as const;

function movimentos(n: number, sessaoId: string): MovimentoCaixa[] {
  return Array.from({ length: n }, (_, i) => {
    const dado = r();
    return {
      id: `m${i}`,
      sessaoId,
      tipo: dado < 0.6 ? "entrada" : dado < 0.85 ? "saida" : "sangria",
      valor: din(),
      // Um em cada dez volta da nuvem SEM forma: é o lançamento gravado
      // antes de a coluna existir, e ele conta como dinheiro.
      formaPagamento: r() < 0.1 ? undefined : FORMAS[Math.floor(r() * FORMAS.length)],
      descricao: "x",
      data: "2026-08-27T12:00:00.000Z",
    } as unknown as MovimentoCaixa;
  });
}

describe("Propriedades do caixa: 20 mil sessões sorteadas", () => {
  it("papel e saldo diferem EXATAMENTE pelo que não passou pela gaveta", () => {
    /*
     * A primeira versão desta sonda exigia `emEspecie <= saldo` e reprovou —
     * a invariante é que estava frouxa, não o sistema. Saída paga no cartão
     * (estorno de devolução, compra por Pix) não tira nota da gaveta, então
     * ela pode deixar o papel ACIMA do saldo. Isso é o certo.
     *
     * A identidade abaixo é a que prende os dois de verdade:
     *
     *   emEspecie - saldo = saídas fora do dinheiro - entradas fora do dinheiro
     */
    const foraDoDinheiro = (m: MovimentoCaixa, tipo: string) =>
      m.tipo === tipo && !!m.formaPagamento && m.formaPagamento !== "dinheiro";

    for (let i = 0; i < 20000; i++) {
      const sessao = { id: "s", valorAbertura: din() } as SessaoCaixa;
      const movs = movimentos(1 + Math.floor(r() * 8), "s");
      const res = resumoCaixa(sessao, movs);

      const soma = (tipo: string) =>
        movs.filter((m) => foraDoDinheiro(m, tipo)).reduce((s, m) => s + Number(m.valor), 0);
      expect(res.emEspecie - res.saldo, `sessão ${i}`).toBeCloseTo(soma("saida") - soma("entrada"), 1);

      // Só dinheiro: papel e saldo são a mesma coisa.
      const soDinheiro = movs.map((m) => ({ ...m, formaPagamento: "dinheiro" as const }));
      const r2 = resumoCaixa(sessao, soDinheiro);
      expect(Math.abs(r2.emEspecie - r2.saldo), `sessão ${i} só dinheiro`).toBeLessThan(0.011);
    }
  });

  it("a diferença é contado menos PAPEL, nunca contado menos saldo", () => {
    /*
     * O bug que custou a conferência inteira: numa loja que vendeu R$ 3.000
     * na maquininha e tem R$ 200 em papel, conferir contra o saldo acusava
     * "falta R$ 3.000" todo dia.
     */
    for (let i = 0; i < 20000; i++) {
      const sessao = { id: "s", valorAbertura: din(), valorContado: din() } as SessaoCaixa;
      const movs = movimentos(1 + Math.floor(r() * 8), "s");
      const res = resumoCaixa(sessao, movs);
      const esperado = Math.round((sessao.valorContado! - res.emEspecie) * 100) / 100;
      expect(res.diferenca, `sessão ${i}`).toBeCloseTo(esperado, 2);
    }
  });

  it("sem contagem a diferença é indefinida, e nunca zero", () => {
    // Zero ali seria mentira: "não conferido" não é "conferido e bateu".
    for (let i = 0; i < 2000; i++) {
      const res = resumoCaixa({ id: "s", valorAbertura: din() } as SessaoCaixa, movimentos(4, "s"));
      expect(res.diferenca, `sessão ${i}`).toBeUndefined();
      expect(conferencia(res)).toBe("nao_conferido");
    }
  });

  it("a sessão CONGELADA não muda quando alguém mexe num lançamento antigo", () => {
    /*
     * Recalcular fazia a conferência de ontem mostrar um valor que não
     * existia ontem — e quem fosse procurar o erro procuraria dinheiro que
     * nunca faltou.
     */
    for (let i = 0; i < 5000; i++) {
      const movs = movimentos(1 + Math.floor(r() * 6), "s");
      const aberta = { id: "s", valorAbertura: din() } as SessaoCaixa;
      const congelados = totaisParaCongelar(resumoCaixa(aberta, movs));
      const fechada = {
        ...aberta,
        totaisFechamento: congelados,
        valorContado: din(),
      } as SessaoCaixa;

      // Chega um lançamento atrasado, com data de semana passada.
      const comAtrasado = [...movs, ...movimentos(3, "s")];
      const depois = resumoCaixa(fechada, comAtrasado);

      expect(depois.saldo, `sessão ${i}`).toBe(congelados.saldo);
      expect(depois.emEspecie).toBe(congelados.emEspecie);
      expect(depois.entradas).toBe(congelados.entradas);
    }
  });

  it("a conferência concorda com o sinal da diferença", () => {
    for (let i = 0; i < 20000; i++) {
      const sessao = { id: "s", valorAbertura: din(), valorContado: din() } as SessaoCaixa;
      const res = resumoCaixa(sessao, movimentos(1 + Math.floor(r() * 6), "s"));
      const c = conferencia(res);
      const d = res.diferenca!;
      if (d > 0.5) expect(c, `sessão ${i} d=${d}`).toBe("sobra");
      else if (d < -0.5) expect(c, `sessão ${i} d=${d}`).toBe("falta");
      else expect(c, `sessão ${i} d=${d}`).toBe("certo");
    }
  });

  it("entrada sem forma conta como PAPEL, igual à saída sem forma", () => {
    /*
     * A saída sem forma já descontava da gaveta; a entrada sem forma caía
     * num balde "outro" e não entrava no papel. O sistema esperava MENOS
     * papel do que a gaveta tinha e o fechamento acusava sobra todo dia.
     */
    const sessao = { id: "s", valorAbertura: 0 } as SessaoCaixa;
    const semForma = [
      { id: "a", sessaoId: "s", tipo: "entrada", valor: 100, descricao: "x", data: "2026-08-27T12:00:00.000Z" },
      { id: "b", sessaoId: "s", tipo: "saida", valor: 30, descricao: "x", data: "2026-08-27T12:00:00.000Z" },
    ] as unknown as MovimentoCaixa[];
    const res = resumoCaixa(sessao, semForma);
    expect(res.emEspecie).toBe(70);
    expect(res.saldo).toBe(70);
  });

  it("agrupar por dia não perde nem inventa lançamento", () => {
    for (let i = 0; i < 3000; i++) {
      const movs = movimentos(1 + Math.floor(r() * 10), "s").map((m, k) => ({
        ...m,
        data: `2026-0${1 + (k % 8)}-1${k % 9}T10:00:00.000Z`,
      }));
      const dias = agruparPorDia(movs);
      const soma = dias.reduce((s, d) => s + d.movimentos.length, 0);
      expect(soma, `caso ${i}`).toBe(movs.length);
    }
  });
});
