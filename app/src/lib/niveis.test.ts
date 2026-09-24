import { describe, it, expect } from "vitest";
import {
  nomeDoNivel,
  nivelDaOpcao,
  eOrcamentoEmNiveis,
  paraTresNiveis,
  ordemDosNiveis,
  aplicarGarantiaDoNivel,
  taxaDeEscolha,
} from "./niveis";
import { nomesDasOpcoes, opcaoAtual } from "./orcamento";
import type { OrdemServico } from "./types";

const base = (x: Partial<OrdemServico> = {}): OrdemServico =>
  ({ id: "1", numero: 1, pecas: [], status: "aguardando_aprovacao", garantiaDias: 90, ...x }) as OrdemServico;

describe("nomes dos níveis", () => {
  it("nome leva a garantia, e volta dele", () => {
    expect(nomeDoNivel("premium")).toBe("Premium · garantia 180 dias");
    expect(nivelDaOpcao("Premium · garantia 180 dias")).toEqual({ nivel: "premium", dias: 180 });
    expect(nivelDaOpcao("Econômica · garantia 30 dias")).toEqual({ nivel: "economica", dias: 30 });
    expect(nivelDaOpcao("Opção 1")).toBeNull();
    expect(nivelDaOpcao("")).toBeNull();
  });

  it("lado a lado só quando TODAS as opções são níveis", () => {
    expect(eOrcamentoEmNiveis([nomeDoNivel("economica"), nomeDoNivel("premium")])).toBe(true);
    expect(eOrcamentoEmNiveis([nomeDoNivel("economica"), "Opção 2"])).toBe(false);
    expect(eOrcamentoEmNiveis([nomeDoNivel("economica")])).toBe(false);
  });
});

describe("montar em 3 níveis", () => {
  it("o já digitado vira a Recomendada, que vem primeiro e é a sugestão", () => {
    const o = paraTresNiveis(
      base({ pecas: [{ descricao: "Tela", quantidade: 1, custoUnit: 100, precoUnit: 300 }], opcaoEscolhida: "X" })
    );
    expect(nomesDasOpcoes(o)).toEqual([nomeDoNivel("recomendada"), nomeDoNivel("economica"), nomeDoNivel("premium")]);
    expect(opcaoAtual(o)).toBe(nomeDoNivel("recomendada"));
    expect(o.opcaoEscolhida).toBeUndefined();
    expect(o.pecas[0].descricao).toBe("Tela");
  });

  it("OS vazia ganha uma linha em cada nível", () => {
    expect(paraTresNiveis(base()).pecas).toHaveLength(3);
  });

  it("mostra na ordem da prateleira", () => {
    const l = ordemDosNiveis([{ nome: nomeDoNivel("premium") }, { nome: nomeDoNivel("recomendada") }, { nome: nomeDoNivel("economica") }]);
    expect(l.map((x) => nivelDaOpcao(x.nome)?.nivel)).toEqual(["economica", "recomendada", "premium"]);
  });
});

describe("garantia do nível escolhido", () => {
  const tres = paraTresNiveis(base({ pecas: [{ descricao: "Tela", quantidade: 1, custoUnit: 1, precoUnit: 2 }] }));
  it("escolheu Premium: a OS passa a ter 180 dias", () => {
    expect(aplicarGarantiaDoNivel({ ...tres, opcaoEscolhida: nomeDoNivel("premium") }).garantiaDias).toBe(180);
    expect(aplicarGarantiaDoNivel({ ...tres, opcaoEscolhida: nomeDoNivel("economica") }).garantiaDias).toBe(30);
  });
  it("sem escolha, ou escolha que não é opção da OS, não mexe", () => {
    expect(aplicarGarantiaDoNivel(tres).garantiaDias).toBe(90);
    expect(aplicarGarantiaDoNivel({ ...tres, opcaoEscolhida: "Premium · garantia 999 dias" }).garantiaDias).toBe(90);
    const semNivel = base({ opcaoEscolhida: "Opção 1" });
    expect(aplicarGarantiaDoNivel(semNivel)).toBe(semNivel);
  });
});

describe("taxa de escolha", () => {
  const tres = paraTresNiveis(base({ pecas: [{ descricao: "Tela", quantidade: 1, custoUnit: 1, precoUnit: 2 }] }));
  it("conta só escolha registrada, fora canceladas e recusadas", () => {
    const t = taxaDeEscolha([
      { ...tres, opcaoEscolhida: nomeDoNivel("recomendada") },
      { ...tres, opcaoEscolhida: nomeDoNivel("recomendada") },
      { ...tres, opcaoEscolhida: nomeDoNivel("premium") },
      { ...tres, opcaoEscolhida: nomeDoNivel("economica"), status: "cancelada" },
      { ...tres, opcaoEscolhida: nomeDoNivel("economica"), recusadoEm: "2026-09-01" },
      tres,
      base({ opcaoEscolhida: "Opção 1" }),
    ]);
    expect(t.total).toBe(3);
    expect(t.porNivel.recomendada).toEqual({ n: 2, pct: 67 });
    expect(t.porNivel.premium).toEqual({ n: 1, pct: 33 });
    expect(t.porNivel.economica).toEqual({ n: 0, pct: 0 });
  });
  it("sem dados, zero em tudo", () => {
    expect(taxaDeEscolha([]).total).toBe(0);
  });
});
