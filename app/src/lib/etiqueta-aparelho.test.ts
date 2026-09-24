import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { etiquetaDoAparelho, primeiroNome, linkAcionarGarantia } from "./etiqueta-aparelho";

const QR = "data:image/png;base64,iVBORw0KGgo=";

describe("etiqueta do aparelho", () => {
  it("leva código, primeiro nome e o QR", () => {
    const h = etiquetaDoAparelho({ loja: "Silva Cell", numero: 45, cliente: "Maria da Silva Souza", aparelho: "Samsung A54", qr: QR });
    expect(h).toContain("OS00045");
    expect(h).toContain(">Maria<");
    expect(h).not.toContain("Souza");
    expect(h).toContain(QR);
    expect(h).toMatch(/garantia/);
  });

  it("nome digitado não vira HTML", () => {
    const h = etiquetaDoAparelho({ loja: "<b>X</b>", numero: 1, cliente: "<img src=x onerror=alert(1)>", qr: QR });
    expect(h).not.toContain("<img src=x");
    expect(h).toContain("&lt;b&gt;X&lt;/b&gt;");
  });

  it("QR que não é imagem de verdade não entra", () => {
    const h = etiquetaDoAparelho({ loja: "L", numero: 1, qr: 'x" onerror="alert(1)' });
    expect(h).not.toContain("onerror");
    expect(h).toMatch(/Guarde este número/);
  });

  it("primeiro nome", () => {
    expect(primeiroNome("  João   Pedro ")).toBe("João");
    expect(primeiroNome(null)).toBe("");
  });

  it("acionar garantia leva o número da OS e a validade; sem WhatsApp da loja, sem botão", () => {
    const l = linkAcionarGarantia("(11) 98888-7777", 45, "2026-12-01");
    expect(l).toMatch(/^https:\/\/wa\.me\/5511988887777\?text=/);
    expect(decodeURIComponent(l)).toMatch(/OS00045.*01\/12\/2026/);
    expect(linkAcionarGarantia("", 45, "2026-12-01")).toBe("");
  });
});

describe("garantia_da_os", () => {
  const sql = readFileSync(new URL("../../supabase-migracao-garantia-publica.sql", import.meta.url), "utf8");
  it("mesma porta do rastreio, só entregue, sem preço", () => {
    expect(sql).toMatch(/rastreio = nullif\(trim\(coalesce\(p_token/);
    expect(sql).toMatch(/status = 'entregue'/);
    expect(sql).not.toMatch(/precoUnit|custoUnit|maoDeObra|observacoes|defeitoConstatado/);
  });
});
