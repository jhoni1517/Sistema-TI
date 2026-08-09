import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  semPrazo,
  fimDoTeste,
  situacaoDe,
  diasParaVencer,
  emTeste,
  testeAcabou,
  diasDeTeste,
  podeLiberarTeste,
  type Loja,
} from "./assinatura";

const loja = (x: Partial<Loja> = {}): Loja => ({ id: "l1", nome: "Pizzaria", ...x }) as Loja;

/** Uma data a N dias de hoje, no formato que vem do banco */
const emDias = (n: number): string => new Date(Date.now() + n * 86400000).toISOString();

/**
 * `situacao_loja()` no banco diz `if v_vence is null then return 'ativa'`, e
 * era assim que TODA loja nova nascia: sem data. Na prática, quem entrava no
 * sistema ganhava acesso ilimitado e de graça — e a lista do administrador
 * mostrava "Em dia", que é verdade e é justamente o que engana.
 */
describe("loja que usa o sistema de graça e para sempre", () => {
  it("sem data de vencimento é loja sem prazo", () => {
    expect(semPrazo(loja())).toBe(true);
    expect(semPrazo(loja({ venceEm: null }))).toBe(true);
  });

  it("e ainda assim o sistema a considera ATIVA — é este o buraco", () => {
    // A regra não muda aqui de propósito: mudá-la cortaria na hora o acesso
    // de todo cliente pagante que só não tem a data preenchida. O que muda
    // é o administrador PASSAR A VER.
    expect(situacaoDe(loja())).toBe("ativa");
  });

  it("com data, não é mais sem prazo", () => {
    expect(semPrazo(loja({ venceEm: "2026-12-01" }))).toBe(false);
  });

  it("a loja isenta não conta: é a de quem administra o sistema", () => {
    expect(semPrazo(loja({ isento: true }))).toBe(false);
  });

  it("a bloqueada não conta: ela já não usa nada", () => {
    expect(semPrazo(loja({ bloqueada: true }))).toBe(false);
  });
});

describe("o fim do teste", () => {
  const hoje = new Date("2026-08-09T15:00:00.000Z");

  it("conta de HOJE, não do vencimento anterior", () => {
    // Liberar teste para quem está vencido há três meses não pode virar
    // três meses de crédito.
    expect(fimDoTeste(7, hoje).toISOString().slice(0, 10)).toBe("2026-08-16");
  });

  it("zero dias não empurra nada", () => {
    expect(fimDoTeste(0, hoje).getTime()).toBe(hoje.getTime());
  });

  it("dias negativos não puxam o vencimento para trás", () => {
    // Um número negativo digitado por engano em Ajustes cortaria o acesso
    // da loja no mesmo instante.
    expect(fimDoTeste(-30, hoje).getTime()).toBe(hoje.getTime());
  });

  it("depois do teste, a loja vence de verdade", () => {
    const fim = fimDoTeste(7, hoje).toISOString();
    expect(diasParaVencer(fim)).toBeGreaterThan(0);
    expect(semPrazo(loja({ venceEm: fim }))).toBe(false);
  });
});

/**
 * Separar teste de assinatura paga.
 *
 * As duas são uma data no futuro em `venceEm`, e por isso a loja em teste
 * caía na régua da mensalidade: recebia "sua mensalidade venceu há 2 dias"
 * de uma mensalidade que nunca contratou. O que era venda a fazer chegava
 * como cobrança.
 */
describe("quem está em teste e quem está pagando", () => {
  it("as duas datas iguais é teste correndo", () => {
    const l = loja({ venceEm: emDias(5), testeAte: emDias(5) });
    expect(emTeste(l)).toBe(true);
    expect(testeAcabou(l)).toBe(false);
    expect(diasDeTeste(l)).toBeGreaterThan(0);
  });

  it("sem a marca do teste, é loja pagante", () => {
    // É o caso de toda loja anterior a esta migração: só `venceEm`. Ela não
    // pode virar teste sozinha, senão recebe "seu teste acabou" tendo pago.
    expect(emTeste(loja({ venceEm: emDias(20) }))).toBe(false);
  });

  it("pagar durante o teste tira a loja do teste sem apagar nada", () => {
    /*
     * `registrar_pagamento` empurra `venceEm` um mês para frente do maior
     * entre o vencimento atual e hoje. `testeAte` fica onde estava, e a
     * conta `venceEm <= testeAte` vira falsa no mesmo instante.
     *
     * É por isso que a marca é uma comparação e não um campo para alguém
     * lembrar de limpar: o que ninguém precisa lembrar é o que ninguém
     * esquece.
     */
    const fimDoTesteISO = emDias(3);
    const pagou = loja({ venceEm: emDias(33), testeAte: fimDoTesteISO });
    expect(emTeste(pagou)).toBe(false);
    expect(situacaoDe(pagou)).toBe("ativa");
  });

  it("teste que passou da data é teste que não converteu", () => {
    const l = loja({ venceEm: emDias(-2), testeAte: emDias(-2) });
    expect(emTeste(l)).toBe(true);
    expect(testeAcabou(l)).toBe(true);
  });

  it("a loja isenta nunca está em teste: é a de quem administra", () => {
    expect(emTeste(loja({ isento: true, venceEm: emDias(5), testeAte: emDias(5) }))).toBe(
      false
    );
  });

  it("data inválida não vira teste por acidente", () => {
    expect(emTeste(loja({ venceEm: "sei la", testeAte: "sei la" }))).toBe(false);
  });
});

describe("para quem dá para liberar teste", () => {
  it("loja sem prazo nenhum: é o caso que este botão existe para resolver", () => {
    expect(podeLiberarTeste(loja())).toBe(true);
  });

  it("quem já pagou, não", () => {
    /*
     * `liberar_teste` conta a partir de HOJE. Numa loja que pagou o ano
     * inteiro ela jogaria o vencimento de dezembro para a semana que vem —
     * cortar acesso de cliente pagante é o erro mais caro deste sistema.
     * A trava de verdade está no banco; esta é só para o botão sumir.
     */
    expect(podeLiberarTeste(loja({ ultimoPagamento: emDias(-10) }))).toBe(false);
  });

  it("quem já está em teste, não: para esse o botão é esticar ou encurtar", () => {
    expect(podeLiberarTeste(loja({ venceEm: emDias(4), testeAte: emDias(4) }))).toBe(false);
  });

  it("teste que já acabou também não: para ele o caminho é esticar", () => {
    /*
     * A pessoa sumiu e um mês depois volta pedindo para ver de novo. Quem
     * resolve isso é "+7 dias" (ajustar_teste conta de hoje quando o teste
     * já morreu), e não um segundo "liberar".
     *
     * Uma loja tem UM teste, que estica e encurta. Dois começos separados
     * dariam duas histórias diferentes para a mesma loja, e aí ninguém mais
     * sabe quantos dias de cortesia ela já levou.
     */
    expect(podeLiberarTeste(loja({ venceEm: emDias(-30), testeAte: emDias(-30) }))).toBe(
      false
    );
  });

  it("a sua própria loja, não", () => {
    expect(podeLiberarTeste(loja({ isento: true }))).toBe(false);
  });
});

/**
 * Campo novo no TypeScript exige coluna nova no banco.
 *
 * `esquema.test.ts` só varre as interfaces de types.ts, e `Loja` mora aqui.
 * Sem esta conferência, `testeAte` viraria mais um
 * "Could not find the 'testeAte' column of 'lojas' in the schema cache" —
 * que na tela de Lojas derruba a leitura inteira e some com a lista.
 */
describe("a coluna do teste existe na migração", () => {
  const sql = readFileSync(
    resolve(__dirname, "..", "..", "supabase-migracao-teste-gratis.sql"),
    "utf8"
  );

  it('lojas ganha "testeAte"', () => {
    expect(sql).toContain('alter table lojas add column if not exists "testeAte"');
  });

  it("a tela pede a coluna na leitura", () => {
    // Sem isso `emTeste` devolve falso para todas as lojas e nada aparece.
    const lib = readFileSync(resolve(__dirname, "assinatura.ts"), "utf8");
    expect(lib).toContain('"venceEm", "testeAte"');
  });

  it("liberar_teste e ajustar_teste gravam as duas datas juntas", () => {
    // Mexer só em `venceEm` faria a loja deixar de ser teste ao ganhar um
    // dia a mais — e passar a receber cobrança de mensalidade.
    const gravacoes = sql.match(/set "venceEm" = [^;]*"testeAte" = [^;]*/g) || [];
    expect(gravacoes.length).toBeGreaterThanOrEqual(3);
  });
});
