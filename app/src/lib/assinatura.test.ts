import { describe, it, expect } from "vitest";
import { semPrazo, fimDoTeste, situacaoDe, diasParaVencer, type Loja } from "./assinatura";

const loja = (x: Partial<Loja> = {}): Loja => ({ id: "l1", nome: "Pizzaria", ...x }) as Loja;

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
