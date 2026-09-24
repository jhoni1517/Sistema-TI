import { describe, it, expect } from "vitest";
import { comissoes, produtividade, regraDoTecnico, reciboComissao, chaveDoTecnico } from "./comissao";
import type { Config, OrdemServico } from "./types";

const os = (x: Partial<OrdemServico>): OrdemServico =>
  ({
    id: Math.random().toString(36),
    numero: 1,
    status: "entregue",
    maoDeObra: 100,
    desconto: 0,
    pecas: [{ descricao: "Tela", quantidade: 1, custoUnit: 150, precoUnit: 300 }],
    criadoEm: "2026-09-01T10:00:00Z",
    entregueEm: "2026-09-05T10:00:00Z",
    ...x,
  }) as OrdemServico;

const ordens = [
  os({ tecnico: "Carlos", imeiSerial: "356938035643809", prontaEm: "2026-09-03T10:00:00Z" }),
  os({ tecnico: "Carlos", criadoEm: "2026-09-10T10:00:00Z", entregueEm: "2026-09-12T10:00:00Z" }),
  os({ tecnico: "Marina", maoDeObra: 200, desconto: 50, pecas: [], entregueEm: "2026-09-20T10:00:00Z" }),
  os({ tecnico: "Marina", status: "em_reparo" }),
  os({ tecnico: "Carlos", entregueEm: "2026-08-20T10:00:00Z" }),
  // Voltou na garantia, atendida pela Marina, mas o conserto era do Carlos
  os({ tecnico: "Marina", status: "em_reparo", retornoGarantia: true, imeiSerial: "35-693803-564380-9", criadoEm: "2026-09-25T10:00:00Z" }),
];

describe("regra por técnico", () => {
  it("sem regra: % padrão sobre o lucro", () => {
    expect(regraDoTecnico("Carlos", { comissaoPadrao: 10 })).toEqual({ tipo: "lucro", valor: 10 });
  });
  it("a regra do técnico acha o nome sem acento e sem caixa", () => {
    const cfg = { comissaoPadrao: 10, regrasComissao: { [chaveDoTecnico("MARINA")]: { tipo: "fixo" as const, valor: 20 } } };
    expect(regraDoTecnico("marina", cfg)).toEqual({ tipo: "fixo", valor: 20 });
  });
});

describe("comissão do mês", () => {
  const set = { de: "2026-09-01", ate: "2026-09-30" };
  it("sobre o lucro (padrão): só entregues do mês", () => {
    const [carlos] = comissoes(ordens, { comissaoPadrao: 10 } as Config, set.de, set.ate).filter((c) => c.tecnico === "Carlos");
    // 2 OS × (100 + 300 − 150) = 500 de lucro
    expect(carlos).toMatchObject({ ordens: 2, lucro: 500, maoDeObra: 200, pecas: 600, valor: 50 });
  });
  it("sobre a mão de obra (com o desconto saindo dela), peça ou fixo", () => {
    const cfg = {
      comissaoPadrao: 10,
      regrasComissao: {
        marina: { tipo: "mao_de_obra" as const, valor: 40 },
        carlos: { tipo: "peca" as const, valor: 5 },
      },
    } as unknown as Config;
    const r = comissoes(ordens, cfg, set.de, set.ate);
    expect(r.find((c) => c.tecnico === "Marina")?.valor).toBe(60); // 40% de 150
    expect(r.find((c) => c.tecnico === "Carlos")?.valor).toBe(30); // 5% de 600
    const fixo = comissoes(ordens, { regrasComissao: { carlos: { tipo: "fixo", valor: 25 } } } as unknown as Config, set.de, set.ate);
    expect(fixo.find((c) => c.tecnico === "Carlos")?.valor).toBe(50);
  });
  it("lucro negativo não vira comissão negativa", () => {
    const [c] = comissoes([os({ tecnico: "Ana", maoDeObra: 0, pecas: [{ descricao: "X", quantidade: 1, custoUnit: 500, precoUnit: 100 }] })], { comissaoPadrao: 10 } as Config);
    expect(c.valor).toBe(0);
  });
});

describe("produtividade", () => {
  const p = produtividade(ordens, "2026-09-01", "2026-09-30");
  it("concluídas, tempo médio de bancada e valor gerado", () => {
    const carlos = p.find((x) => x.tecnico === "Carlos")!;
    expect(carlos.concluidas).toBe(2);
    // 2 dias (até pronta) e 2 dias (até entregue, sem pronta)
    expect(carlos.tempoMedio).toBe(2);
    expect(carlos.gerado).toBe(800);
  });
  it("retorno em garantia conta para quem fez o conserto original (pelo IMEI)", () => {
    expect(p.find((x) => x.tecnico === "Carlos")?.retornos).toBe(1);
    expect(p.find((x) => x.tecnico === "Carlos")?.retrabalho).toBe(50);
    expect(p.find((x) => x.tecnico === "Marina")?.retornos).toBe(0);
  });
});

describe("recibo", () => {
  it("leva mês, técnico, regra, valor e linha de assinatura; nome escapado", () => {
    const [c] = comissoes([os({ tecnico: "<b>Zé</b>" })], { comissaoPadrao: 10 } as Config);
    const h = reciboComissao(c, "2026-09", "Silva Cell");
    expect(h).toContain("09/2026");
    expect(h).toContain("&lt;b&gt;Zé&lt;/b&gt;");
    expect(h).toMatch(/10% sobre o lucro \(R\$\s?250,00\)/);
    expect(h).toMatch(/Recebi a quantia/);
  });
});
