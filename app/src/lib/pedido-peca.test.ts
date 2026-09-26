import { describe, it, expect } from "vitest";
import { pecasACaminho, reservas, conflitoComReserva, chegadaDaEntrada, mensagemPecaChegou, problemaNoPedido } from "./pedido-peca";
import type { OrdemServico, PedidoPeca } from "./types";

const ped = (x: Partial<PedidoPeca>): PedidoPeca => ({ id: "p", descricao: "Tela A15", quantidade: 1, status: "pedido", pedidoEm: "2026-09-20T10:00:00Z", ...x });
const os = (x: Partial<OrdemServico>): OrdemServico =>
  ({ id: "o", numero: 10, status: "aguardando_peca", marca: "Samsung", modelo: "A15", historico: [], pedidosPeca: [], ...x }) as OrdemServico;

describe("peças a caminho", () => {
  it("atrasado primeiro; entregue e cancelada ficam de fora", () => {
    const l = pecasACaminho(
      [
        os({ id: "a", numero: 1, pedidosPeca: [ped({ id: "1", previsao: "2026-09-28" })] }),
        os({ id: "b", numero: 2, pedidosPeca: [ped({ id: "2", previsao: "2026-09-20" })] }),
        os({ id: "c", numero: 3, status: "entregue", pedidosPeca: [ped({ id: "3" })] }),
        os({ id: "d", numero: 4, pedidosPeca: [ped({ id: "4", status: "chegou" })] }),
      ],
      "2026-09-25"
    );
    expect(l.map((x) => [x.os.numero, x.atraso])).toEqual([
      [2, 5],
      [1, 0],
    ]);
  });
});

describe("chegada pela nota", () => {
  const o1 = os({ id: "o1", numero: 1, pedidosPeca: [ped({ id: "a", produtoId: "tela", pedidoEm: "2026-09-10T00:00:00Z" })] });
  const o2 = os({ id: "o2", numero: 2, pedidosPeca: [ped({ id: "b", produtoId: "tela", pedidoEm: "2026-09-12T00:00:00Z" })] });
  const o3 = os({
    id: "o3",
    numero: 3,
    pedidosPeca: [ped({ id: "c", produtoId: "tela", pedidoEm: "2026-09-15T00:00:00Z" }), ped({ id: "d", produtoId: "bat", pedidoEm: "2026-09-15T00:00:00Z" })],
  });
  it("o pedido mais antigo leva primeiro; o que não coube continua esperando", () => {
    const r = chegadaDaEntrada([o3, o2, o1], [{ produtoId: "tela", quantidade: 2 }], "AGORA");
    expect(r.chegadas.map((c) => c.os.numero)).toEqual([1, 2]);
    const a1 = r.atualizadas.find((o) => o.id === "o1")!;
    expect(a1.status).toBe("em_reparo");
    expect(a1.historico.at(-1)).toEqual({ data: "AGORA", status: "em_reparo", nota: "Peça chegou: Tela A15" });
    expect(r.atualizadas.find((o) => o.id === "o3")).toBeUndefined();
  });
  it("OS que ainda espera outra peça não volta para a bancada", () => {
    const r = chegadaDaEntrada([o3], [{ produtoId: "tela", quantidade: 1 }], "AGORA");
    expect(r.atualizadas[0].status).toBe("aguardando_peca");
    expect(r.atualizadas[0].pedidosPeca?.find((p) => p.id === "c")?.status).toBe("chegou");
  });
  it("peça sem produto ligado não casa com a nota", () => {
    const r = chegadaDaEntrada([os({ pedidosPeca: [ped({})] })], [{ produtoId: "tela", quantidade: 5 }], "x");
    expect(r.chegadas).toEqual([]);
  });
});

describe("reserva no balcão", () => {
  const ordens = [os({ numero: 52, status: "em_reparo", pedidosPeca: [ped({ produtoId: "tela", status: "chegou", quantidade: 1 })] })];
  const produtos = [{ id: "tela", nome: "Tela A15", quantidade: 2 }];
  it("vende a livre, recusa a reservada", () => {
    const r = reservas(ordens);
    expect(r.get("tela")).toEqual({ total: 1, ordens: [52] });
    expect(conflitoComReserva([{ produtoId: "tela", quantidade: 1 }], produtos, r)).toBe("");
    expect(conflitoComReserva([{ produtoId: "tela", quantidade: 2 }], produtos, r)).toMatch(/só 1 livre.*OS 52/);
    expect(conflitoComReserva([{ produtoId: "tela", quantidade: 1 }], [{ ...produtos[0], quantidade: 1 }], r)).toMatch(/reservada para OS 52/);
  });
  it("entregue libera a reserva; sem reserva, estoque negativo continua passando", () => {
    expect(reservas([{ ...ordens[0], status: "entregue" }]).size).toBe(0);
    expect(conflitoComReserva([{ produtoId: "x", quantidade: 9 }], [{ id: "x", nome: "X", quantidade: 0 }], new Map())).toBe("");
  });
});

describe("textos", () => {
  it("mensagem sem emoji e validação", () => {
    const m = mensagemPecaChegou("Ana Souza", "Cell X", { numero: 52, marca: "Samsung", modelo: "A15" }, "https://x");
    expect(m).toMatch(/^Oi, Ana! .*Samsung A15 \(OS 52\) chegou/);
    expect(/[\u{1F300}-\u{1FAFF}]/u.test(m)).toBe(false);
    expect(problemaNoPedido({ descricao: "", quantidade: 1 })).toMatch(/peça/);
  });
});
