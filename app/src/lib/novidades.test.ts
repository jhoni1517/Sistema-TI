import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { lerNovidades, novidadesDoRamo, naoVistas, maisNova } from "./novidades";

const md = readFileSync(new URL("../../NOVIDADES.md", import.meta.url), "utf8");
const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");

describe("NOVIDADES.md", () => {
  const lista = lerNovidades(md);

  it("tem novidades e o exemplo do topo não vira novidade", () => {
    expect(lista.length).toBeGreaterThan(0);
    expect(lista.some((n) => n.titulo.includes("Título curto"))).toBe(false);
  });

  it("toda data existe e toda rota leva a uma tela do sistema", () => {
    const rotas = new Set(["/", ...[...app.matchAll(/<Route path="([a-z-]+)"/g)].map((m) => "/" + m[1])]);
    for (const n of lista) {
      expect(new Date(n.data + "T00:00:00Z").toISOString().slice(0, 10), n.titulo).toBe(n.data);
      expect(rotas.has(n.rota), `${n.titulo}: rota ${n.rota}`).toBe(true);
    }
  });

  it("frase curta e sem emoji (é o que aparece no sino)", () => {
    for (const n of lista) {
      expect(n.frase.length, n.titulo).toBeLessThanOrEqual(160);
      expect(/[\u{1F300}-\u{1FAFF}]/u.test(n.titulo + n.frase)).toBe(false);
    }
  });
});

describe("leitura", () => {
  const texto = [
    "## 2026-01-02 · Velha",
    "Frase velha.",
    "Rota: /caixa",
    "",
    "## 2026-03-01 · Nova",
    "Frase nova.",
    "Rota: /ordens",
    "Módulo: os",
    "",
    "## 2026-02-01 · Sem rota",
    "Some.",
  ].join("\n");

  it("ordena da mais nova e ignora bloco incompleto", () => {
    expect(lerNovidades(texto).map((n) => n.titulo)).toEqual(["Nova", "Velha"]);
  });

  it("módulo que a loja não tem não aparece", () => {
    const l = lerNovidades(texto);
    expect(novidadesDoRamo(l, "mercearia").map((n) => n.titulo)).toEqual(["Velha"]);
    expect(novidadesDoRamo(l, "assistencia")).toHaveLength(2);
  });

  it("não vistas: depois da última vista; aparelho novo só 30 dias", () => {
    const l = lerNovidades(texto);
    expect(naoVistas(l, "2026-01-02", "2026-03-10").map((n) => n.titulo)).toEqual(["Nova"]);
    expect(naoVistas(l, null, "2026-03-10").map((n) => n.titulo)).toEqual(["Nova"]);
    expect(naoVistas(l, "2026-03-01", "2026-03-10")).toEqual([]);
    expect(maisNova(l)).toBe("2026-03-01");
  });
});
