import { describe, it, expect } from "vitest";
import { textoDoTermo, lacrar, termoIntacto, sha256, termoDoTipo, podeTermoRetirada, htmlDoTermo } from "./termo";
import type { OrdemServico } from "./types";

const os = {
  id: "o1",
  numero: 45,
  clienteId: "c1",
  tipoAparelho: "Celular",
  marca: "Samsung",
  modelo: "A54",
  imeiSerial: "356938035643809",
  defeitoRelatado: "Tela quebrada",
  acessorios: "capinha",
  checklist: { "Liga": true, "Câmera": false },
  fotos: ["https://x.supabase.co/a.jpg", "https://x.supabase.co/b.jpg"],
  pecas: [],
  maoDeObra: 0,
  desconto: 0,
  status: "aberta",
  garantiaDias: 90,
  historico: [],
  criadoEm: "",
  atualizadoEm: "",
} as unknown as OrdemServico;
const cliente = { nome: "Maria da Silva", telefone: "11988887777", cpf: "529.982.247-25" };
const QUANDO = "2026-09-25T13:30:00.000Z";

describe("texto do termo", () => {
  it("entrada: aparelho, estado, acessórios, fotos e a isenção de dados", () => {
    const t = textoDoTermo("entrada", os, cliente, "Silva Cell", QUANDO, 60);
    expect(t).toMatch(/Termo de entrada do aparelho · OS00045/);
    expect(t).toMatch(/Cliente: Maria da Silva/);
    expect(t).toMatch(/IMEI \/ série: 356938035643809/);
    expect(t).toMatch(/Acessórios deixados: capinha/);
    expect(t).toMatch(/Conferido na entrada: Liga$/m);
    expect(t).not.toMatch(/Câmera/);
    expect(t).toMatch(/Fotos do estado do aparelho: 2/);
    expect(t).toMatch(/não se responsabiliza por dados/);
    expect(t).toMatch(/até 60 dias/);
    expect(t).not.toMatch(/\n\n\n/);
  });

  it("retirada: recebi funcionando, com a garantia", () => {
    const t = textoDoTermo("retirada", os, cliente, "Silva Cell", QUANDO);
    expect(t).toMatch(/recebi o aparelho acima funcionando/);
    expect(t).toMatch(/Garantia: 90 dias/);
  });

  it("sem cliente e sem acessórios não quebra", () => {
    const t = textoDoTermo("entrada", { ...os, acessorios: "", fotos: [] }, undefined, "", QUANDO);
    expect(t).toMatch(/Acessórios deixados: nenhum/);
    expect(t).not.toMatch(/Cliente:/);
  });
});

describe("lacre", () => {
  it("sha256 conhecido", async () => {
    expect(await sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("assinado confere; qualquer mudança acusa", async () => {
    const t = await lacrar({ tipo: "entrada", texto: "Declaro X", assinatura: "https://x/a.png", assinadoEm: QUANDO });
    expect(t.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await termoIntacto(t)).toBe(true);
    expect(await termoIntacto({ ...t, texto: "Declaro Y" })).toBe(false);
    expect(await termoIntacto({ ...t, assinatura: "https://x/outra.png" })).toBe(false);
    expect(await termoIntacto({ ...t, assinadoEm: "2026-09-26T00:00:00Z" })).toBe(false);
    expect(await termoIntacto({ ...t, hash: "" })).toBe(false);
  });
});

describe("na OS", () => {
  it("o último termo de cada tipo vale; retirada só pronta ou entregue", async () => {
    const a = await lacrar({ tipo: "entrada", texto: "1", assinatura: "u", assinadoEm: "1" });
    const b = await lacrar({ tipo: "entrada", texto: "2", assinatura: "u", assinadoEm: "2" });
    expect(termoDoTipo({ termos: [a, b] }, "entrada")?.texto).toBe("2");
    expect(termoDoTipo({ termos: [a] }, "retirada")).toBeUndefined();
    expect(podeTermoRetirada({ status: "em_reparo" })).toBe(false);
    expect(podeTermoRetirada({ status: "pronta" })).toBe(true);
  });

  it("documento escapa o texto e só aceita imagem https", async () => {
    const t = await lacrar({ tipo: "entrada", texto: "<script>x</script>", assinatura: "javascript:alert(1)", assinadoEm: QUANDO });
    const h = htmlDoTermo(t, ["https://x/f.jpg", "javascript:x"]);
    expect(h).not.toContain("<script>");
    expect(h).not.toContain("javascript:");
    expect(h).toContain("https://x/f.jpg");
    expect(h).toContain(t.hash);
  });
});
