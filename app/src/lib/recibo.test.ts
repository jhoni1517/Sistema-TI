import { describe, it, expect } from "vitest";
import { reciboOS } from "./recibo";
import { pedidoDeAvaliacao } from "./mensagens";
import type { Config, OrdemServico, OSStatus } from "./types";

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

describe("pedido de avaliação", () => {
  const conf = (extra: Partial<Config> = {}): Config =>
    ({
      nomeLoja: "Nova Geração",
      telefoneLoja: "",
      enderecoLoja: "",
      cnpj: "",
      senhaAcesso: "",
      ...extra,
    }) as Config;

  const ordem = (status: OSStatus): OrdemServico =>
    ({
      id: "o1",
      numero: 1,
      clienteId: "c1",
      tipoAparelho: "Celular",
      marca: "",
      modelo: "",
      defeitoRelatado: "não liga",
      checklist: {},
      pecas: [],
      maoDeObra: 0,
      desconto: 0,
      status,
      garantiaDias: 90,
      historico: [],
      criadoEm: "2026-07-28T10:00:00.000Z",
      atualizadoEm: "2026-07-28T10:00:00.000Z",
    }) as OrdemServico;

  const link = "https://g.page/r/exemplo/review";

  it("só pede avaliação depois de entregue", () => {
    // Pedir estrela antes de o serviço terminar é pedir no pior momento, e
    // nota ruim colhida no meio do caminho fica lá para sempre.
    for (const s of ["aberta", "em_reparo", "pronta"] as OSStatus[]) {
      expect(pedidoDeAvaliacao(ordem(s), conf({ linkAvaliacao: link })), s).toBe("");
    }
    expect(pedidoDeAvaliacao(ordem("entregue"), conf({ linkAvaliacao: link }))).toContain(link);
  });

  it("sem link configurado não inventa pedido nenhum", () => {
    expect(pedidoDeAvaliacao(ordem("entregue"), conf())).toBe("");
    expect(pedidoDeAvaliacao(ordem("entregue"), conf({ linkAvaliacao: "   " }))).toBe("");
  });

  it("usa o nome da loja no texto", () => {
    expect(pedidoDeAvaliacao(ordem("entregue"), conf({ linkAvaliacao: link }))).toContain(
      "Nova Geração"
    );
  });

  it("não leva emoji: em alguns aparelhos chegam como interrogação", () => {
    const t = pedidoDeAvaliacao(ordem("entregue"), conf({ linkAvaliacao: link }));
    expect(/\p{Extended_Pictographic}/u.test(t)).toBe(false);
  });

  it("OS cancelada não pede estrela", () => {
    expect(pedidoDeAvaliacao(ordem("cancelada"), conf({ linkAvaliacao: link }))).toBe("");
  });
});
