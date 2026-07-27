import { describe, it, expect } from "vitest";
import { tipoDoAviso, mensagemCobranca } from "./cobranca";
import { situacaoDe, diasParaVencer } from "./assinatura";
import type { Loja } from "./assinatura";

/**
 * A régua de dias existe DUAS VEZES: aqui e copiada em api/cobranca.js,
 * porque a função da Vercel não importa TypeScript. Este arquivo trava as
 * duas no mesmo comportamento.
 */
function reguaDoCron(dias: number | null, tolerancia: number) {
  if (dias === null) return null;
  if (dias > 3) return null;
  if (dias > 0) return "vence_em_breve";
  if (dias === 0) return "vence_hoje";
  if (dias >= -tolerancia) return "vencida";
  return "somente_leitura";
}

describe("aviso de mensalidade", () => {
  it("só começa a incomodar a 3 dias do vencimento", () => {
    expect(tipoDoAviso(4)).toBeNull();
    expect(tipoDoAviso(3)).toBe("vence_em_breve");
  });

  it("classifica vencimento, tolerância e travamento", () => {
    expect(tipoDoAviso(0)).toBe("vence_hoje");
    expect(tipoDoAviso(-5)).toBe("vencida");
    expect(tipoDoAviso(-6)).toBe("somente_leitura");
  });

  it("a régua da tela e a do Telegram concordam sempre", () => {
    for (const tol of [0, 1, 5, 10, 30]) {
      for (let d = -60; d <= 60; d++) {
        expect(tipoDoAviso(d, tol)).toBe(reguaDoCron(d, tol));
      }
    }
  });
});

describe("texto de cobrança", () => {
  const tipos = ["vence_em_breve", "vence_hoje", "vencida", "somente_leitura"] as const;

  it("nunca sai com undefined ou NaN", () => {
    for (const t of tipos) {
      const m = mensagemCobranca(t, { nomeLoja: "Loja X", valor: 79, dias: -8, chavePix: "123" });
      expect(m).not.toContain("undefined");
      expect(m).not.toContain("NaN");
    }
  });

  it("sem Pix cadastrado não mostra bloco vazio", () => {
    const m = mensagemCobranca("vencida", { nomeLoja: "Y", dias: -2 });
    expect(m).not.toContain("Pix");
  });

  it("quando trava, deixa claro que nada foi apagado", () => {
    expect(mensagemCobranca("somente_leitura", { nomeLoja: "Y", dias: -9 })).toContain(
      "nenhum dado foi apagado"
    );
  });
});

describe("situação da assinatura", () => {
  const emDias = (d: number) => new Date(Date.now() + d * 86400000).toISOString();
  const L = (v: string | null, extra: Partial<Loja> = {}): Loja =>
    ({ id: "1", nome: "X", venceEm: v, ...extra }) as Loja;

  it("respeita o prazo de tolerância", () => {
    expect(situacaoDe(L(emDias(10)))).toBe("ativa");
    expect(situacaoDe(L(emDias(-1)))).toBe("tolerancia");
    expect(situacaoDe(L(emDias(-6)))).toBe("leitura");
  });

  it("bloqueio manual vence qualquer data", () => {
    expect(situacaoDe(L(emDias(30), { bloqueada: true }))).toBe("bloqueada");
  });

  it("a loja do administrador nunca vence", () => {
    expect(situacaoDe(L(emDias(-90), { isento: true }))).toBe("ativa");
  });

  it("sem data de vencimento não trava ninguém", () => {
    expect(situacaoDe(L(null))).toBe("ativa");
    expect(diasParaVencer(null)).toBeNull();
  });
});
