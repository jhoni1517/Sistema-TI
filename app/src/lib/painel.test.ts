import { describe, it, expect } from "vitest";
import { colunasDoPainel, cartaoDoPainel, novasProntas, retratoDosStatus, CARTOES_POR_COLUNA } from "./painel";
import type { OrdemServico } from "./types";

const os = (o: Partial<OrdemServico>): OrdemServico =>
  ({
    id: "x",
    numero: 1,
    clienteId: "c1",
    marca: "Samsung",
    modelo: "A54",
    status: "aberta",
    criadoEm: "2026-09-01T10:00:00Z",
    ...o,
  }) as OrdemServico;

const clientes = [{ id: "c1", nome: "Maria da Silva Souza" }];

describe("o que vai na parede", () => {
  it("só código, primeiro nome e aparelho", () => {
    const c = cartaoDoPainel(
      os({ numero: 33, defeitoRelatado: "não liga", imeiSerial: "123" }),
      clientes[0]
    );
    expect(c).toEqual({ id: "x", codigo: "OS00033", primeiroNome: "Maria", aparelho: "Samsung A54" });
  });

  it("entregue e cancelada não aparecem", () => {
    const cols = colunasDoPainel(
      [os({ id: "a", status: "entregue" }), os({ id: "b", status: "cancelada" })],
      clientes
    );
    expect(cols.every((c) => c.total === 0)).toBe(true);
  });

  it("cada status na sua coluna; aguardando aprovação é fila", () => {
    const cols = colunasDoPainel(
      [
        os({ id: "a", status: "aguardando_aprovacao" }),
        os({ id: "b", status: "em_reparo" }),
        os({ id: "c", status: "aguardando_peca" }),
        os({ id: "d", status: "pronta" }),
      ],
      clientes
    );
    expect(cols.map((c) => c.cartoes.map((x) => x.id))).toEqual([["a"], ["b"], ["c"], ["d"]]);
  });

  it("na bancada o mais antigo no topo; no pronto, o mais recente", () => {
    const cols = colunasDoPainel(
      [
        os({ id: "novo", status: "em_reparo", criadoEm: "2026-09-10" }),
        os({ id: "velho", status: "em_reparo", criadoEm: "2026-09-01" }),
        os({ id: "p1", status: "pronta", prontaEm: "2026-09-01" }),
        os({ id: "p2", status: "pronta", prontaEm: "2026-09-10" }),
      ],
      clientes
    );
    expect(cols[1].cartoes.map((c) => c.id)).toEqual(["velho", "novo"]);
    expect(cols[3].cartoes.map((c) => c.id)).toEqual(["p2", "p1"]);
  });

  it("coluna cheia corta e diz quantas sobraram", () => {
    const muitas = Array.from({ length: CARTOES_POR_COLUNA + 3 }, (_, i) =>
      os({ id: `o${i}`, status: "em_reparo" })
    );
    const [, reparo] = colunasDoPainel(muitas, clientes);
    expect(reparo.cartoes).toHaveLength(CARTOES_POR_COLUNA);
    expect(reparo.mais).toBe(3);
    expect(reparo.total).toBe(CARTOES_POR_COLUNA + 3);
  });
});

describe("carimbo de PRONTO", () => {
  it("anima só a que mudou para pronta desde a última olhada", () => {
    const antes = retratoDosStatus([
      { id: "a", status: "em_reparo" },
      { id: "b", status: "pronta" },
    ]);
    expect(
      novasProntas(antes, [
        { id: "a", status: "pronta" },
        { id: "b", status: "pronta" },
        { id: "c", status: "pronta" },
      ])
    ).toEqual(["a"]);
  });

  it("ao ligar a TV nada anima", () => {
    expect(novasProntas(null, [{ id: "a", status: "pronta" }])).toEqual([]);
  });
});
