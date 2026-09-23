import { describe, it, expect } from "vitest";
import {
  sugerir,
  semelhanca,
  temDadosParaSugerir,
  resumoParaIA,
  lerDiagnosticoDaIA,
  laudoSugerido,
} from "./sugestao";
import type { OrdemServico } from "./types";

let seq = 0;
const os = (o: Partial<OrdemServico>): OrdemServico =>
  ({
    id: `o${++seq}`,
    numero: seq,
    clienteId: "c",
    tipoAparelho: "Celular",
    marca: "Samsung",
    modelo: "Galaxy A54",
    defeitoRelatado: "tela quebrada",
    status: "entregue",
    pecas: [],
    maoDeObra: 100,
    desconto: 0,
    criadoEm: "2026-09-01T10:00:00Z",
    prontaEm: "2026-09-03T10:00:00Z",
    ...o,
  }) as OrdemServico;

const tela = (preco: number) => ({ descricao: "Tela A54", quantidade: 1, custoUnit: 200, precoUnit: preco });

describe("sugestão pelo histórico da loja", () => {
  const alvo = { marca: "Samsung", modelo: "Galaxy A54", defeitoRelatado: "tela quebrada, não liga touch" };
  const historico = [
    os({ pecas: [tela(300)], maoDeObra: 80 }),
    os({ pecas: [tela(340)], maoDeObra: 120, prontaEm: "2026-09-05T10:00:00Z" }),
    os({ pecas: [tela(320)], maoDeObra: 100 }),
    os({ modelo: "iPhone 13", marca: "Apple", pecas: [tela(1200)] }),
    os({ defeitoRelatado: "não carrega", pecas: [{ descricao: "Conector", quantidade: 1, custoUnit: 10, precoUnit: 60 }] }),
    os({ status: "aberta", pecas: [tela(9999)] }),
  ];

  it("usa só OS concluídas, do mesmo modelo e defeito parecido — e diz de onde veio", () => {
    const s = sugerir(historico, alvo)!;
    expect(s.base).toBe(3);
    expect(s.origem).toBe("baseado em 3 OS suas");
    expect(s.precoMedio).toBe(420); // (380 + 460 + 420) / 3
    expect(s.precoMin).toBe(380);
    expect(s.precoMax).toBe(460);
    expect(s.maoDeObraMedia).toBe(100);
    expect(s.diasMedios).toBe(3); // 2, 4, 2 → 2,67
    expect(s.pecas[0]).toMatchObject({ descricao: "Tela A54", vezes: 3, precoMedio: 320 });
  });

  it("modelo diferente não entra na média, mesmo com o mesmo defeito", () => {
    expect(semelhanca(os({ modelo: "iPhone 13", marca: "Apple" }), alvo)).toBe(0);
  });

  it("com menos de 2 OS parecidas não sugere: uma só é coincidência", () => {
    expect(sugerir([historico[0]], alvo)).toBeNull();
  });

  it("sem modelo ou defeito, não sugere nada", () => {
    expect(temDadosParaSugerir({ modelo: "", defeitoRelatado: "tela" })).toBe(false);
    expect(sugerir(historico, { modelo: "Galaxy A54", defeitoRelatado: "" })).toBeNull();
  });

  it("a própria OS não conta como histórico dela mesma", () => {
    const s = sugerir(historico, { ...alvo, id: historico[0].id })!;
    expect(s.numeros).not.toContain(historico[0].numero);
  });

  it("o resumo para a IA não leva nome de cliente", () => {
    const r = resumoParaIA(sugerir(historico, alvo));
    expect(r).toContain("3 OS parecidas");
    expect(r).toContain("Tela A54");
    expect(resumoParaIA(null)).toBe("");
  });
});

describe("resposta da IA para o diagnóstico", () => {
  it("resposta boa vira causas e testes", () => {
    const d = lerDiagnosticoDaIA(
      '```json\n{"causas":[{"causa":"Flex do display rompido","chance":"Alta"}],"testes":["Testar com tela reserva"],"observacao":"ok"}\n```'
    );
    expect(d.causas).toEqual([{ causa: "Flex do display rompido", chance: "alta" }]);
    expect(d.testes).toEqual(["Testar com tela reserva"]);
    expect(laudoSugerido(d)).toContain("Flex do display rompido (alta)");
  });

  it("chance fora do formato vira média; causa vazia sai; excesso é cortado", () => {
    const d = lerDiagnosticoDaIA({
      causas: [{ causa: "", chance: "alta" }, { causa: "Bateria", chance: "talvez" }, ...Array(10).fill({ causa: "x", chance: "baixa" })],
      testes: Array(20).fill("medir"),
    });
    expect(d.causas[0]).toEqual({ causa: "Bateria", chance: "media" });
    expect(d.causas).toHaveLength(5);
    expect(d.testes).toHaveLength(8);
  });

  it("respostas quebradas dizem o que fazer", () => {
    expect(() => lerDiagnosticoDaIA("desculpe, não sei")).toThrow(/tenta de novo/i);
    expect(() => lerDiagnosticoDaIA('{"causas": [')).toThrow();
    expect(() => lerDiagnosticoDaIA('{"causas": [], "testes": []}')).toThrow(/nenhuma causa/);
    expect(() => lerDiagnosticoDaIA({ causas: "tela", testes: 3 })).toThrow(/nenhuma causa/);
  });

  it("marcação na resposta é limpa", () => {
    const d = lerDiagnosticoDaIA({ causas: [{ causa: "<b>Placa</b>", chance: "baixa" }] });
    expect(d.causas[0].causa).not.toContain("<");
  });
});
