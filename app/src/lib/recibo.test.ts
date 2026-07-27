import { describe, it, expect } from "vitest";
import { reciboOS } from "./recibo";
import type { Config, OrdemServico } from "./types";

const cfg = { nomeLoja: "Silva & Cia", telefoneLoja: "41999", cnpj: "52.679.376/0001-78", diasAbandono: 90 } as Config;
const os = {
  numero: 1,
  tipoAparelho: "Celular",
  marca: "Samsung",
  modelo: "A54",
  defeitoRelatado: 'Tela < 5" trincada & sem imagem',
  pecas: null,
  maoDeObra: 100,
  desconto: 0,
  status: "pronta",
  historico: [],
  criadoEm: "2026-07-01",
  atualizadoEm: "2026-07-01",
} as unknown as OrdemServico;
const cliente = { nome: 'João "Zé" Silva & Filhos', telefone: "41999", cpf: "111.444.777-35" };

describe("recibo da OS", () => {
  it("imprime mesmo com OS sem peças", () => {
    expect(reciboOS(os, cliente, cfg).length).toBeGreaterThan(500);
  });

  it("escapa & e aspas para a marcação não quebrar", () => {
    const html = reciboOS(os, cliente, cfg);
    expect(html).toContain("Silva &amp; Cia");
    expect(html).toContain("João &quot;Zé&quot; Silva &amp; Filhos");
  });

  it("escapa o sinal de menor no texto do defeito", () => {
    expect(reciboOS(os, cliente, cfg)).toContain("Tela &lt; 5&quot;");
  });

  it("não deixa injetar marcação por campo de texto", () => {
    const mau = { ...os, defeitoConstatado: "<script>alert(1)</script><h1>FALSO</h1>" };
    const html = reciboOS(mau, cliente, cfg);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<h1>FALSO");
    expect(html).toContain("&lt;script&gt;");
  });
});
