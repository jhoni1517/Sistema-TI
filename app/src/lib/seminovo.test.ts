import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  CHECKLIST_USADO,
  avaliar,
  fatorBateria,
  chaveDoModelo,
  novoTokenDaFicha,
  linkDaFicha,
  produtoSeminovo,
  textoGarantiaSeminovo,
} from "./seminovo";
import { temRecurso } from "./ramos";

const tudoOk = Object.fromEntries(CHECKLIST_USADO.map((i) => [i.k, true]));

describe("avaliação do usado", () => {
  it("perfeito: vende pela referência, oferta deixa 35% de margem", () => {
    expect(avaliar({ referencia: 2000, ok: tudoOk, bateria: 92 })).toEqual({ venda: 2000, oferta: 1300, defeitos: [] });
  });

  it("cada defeito desconta o fator dele, em cascata", () => {
    const r = avaliar({ referencia: 2000, ok: { ...tudoOk, tela: false, biometria: false }, bateria: 90 });
    // 2000 × 0,70 × 0,85 = 1190
    expect(r.venda).toBe(1190);
    expect(r.oferta).toBe(770); // 1190 × 0,65 = 773,5 -> 770
    expect(r.defeitos).toHaveLength(2);
  });

  it("bateria gasta derruba o preço; sem informação, não mexe", () => {
    expect(fatorBateria(79)).toBe(0.88);
    expect(fatorBateria(83)).toBe(0.95);
    expect(fatorBateria(90)).toBe(1);
    expect(fatorBateria(undefined)).toBe(1);
    expect(avaliar({ referencia: 1000, ok: tudoOk, bateria: 75 }).venda).toBe(880);
  });

  it("nada marcado é tudo defeito: o técnico marca o que testou", () => {
    expect(avaliar({ referencia: 1000, ok: {} }).defeitos).toHaveLength(CHECKLIST_USADO.length);
  });

  it("sem referência, zero (não inventa preço)", () => {
    expect(avaliar({ referencia: 0, ok: tudoOk })).toMatchObject({ venda: 0, oferta: 0 });
  });
});

describe("produto e ficha", () => {
  it("modelo vira chave igual para a referência lembrada", () => {
    expect(chaveDoModelo("  iPhone 11   128GB ")).toBe("iphone 11 128gb");
  });

  it("segredo do link é longo e diferente a cada vez", () => {
    const a = novoTokenDaFicha();
    expect(a).toMatch(/^[0-9a-f]{24}$/);
    expect(novoTokenDaFicha()).not.toBe(a);
    expect(linkDaFicha("https://x/", "L1", a)).toBe(`https://x/#/seminovo/L1/${a}`);
    expect(linkDaFicha("https://x/", "L1", "")).toBe("");
  });

  it("entra no estoque com 1 unidade, custo pago e a ficha junto", () => {
    const p = produtoSeminovo({ id: "p", modelo: "iPhone 11", venda: 1800, custo: 1100, criadoEm: "t", ficha: { ok: tudoOk } });
    expect(p).toMatchObject({ nome: "iPhone 11 (seminovo)", quantidade: 1, custo: 1100, preco: 1800, categoria: "Seminovos" });
    expect(p.seminovo?.ok).toEqual(tudoOk);
  });

  it("garantia escrita", () => {
    expect(textoGarantiaSeminovo(90)).toBe("90 dias de garantia da loja");
    expect(textoGarantiaSeminovo(0)).toBe("Sem garantia");
  });

  it("é recurso da assistência, não de mercearia", () => {
    expect(temRecurso("assistencia", "seminovos")).toBe(true);
    expect(temRecurso("mercearia", "seminovos")).toBe(false);
  });
});

describe("ficha_seminovo (SQL)", () => {
  const sql = readFileSync(new URL("../../supabase-migracao-seminovos.sql", import.meta.url), "utf8");
  const corpo = sql.slice(sql.indexOf("as $$"), sql.lastIndexOf("$$;"));
  it("nunca devolve custo nem quantidade exata", () => {
    expect(corpo).not.toMatch(/p\.custo|custoUnit/);
    expect(corpo).toMatch(/coalesce\(p\.quantidade, 0\) > 0/);
  });
  it("porta é loja + segredo, e do IMEI só o final", () => {
    expect(corpo).toMatch(/p\.seminovo ->> 'ficha' = nullif/);
    expect(corpo).toMatch(/right\(regexp_replace/);
  });
});
