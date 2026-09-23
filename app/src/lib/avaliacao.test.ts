import { describe, it, expect } from "vitest";
import { avaliacaoRecente, podePedirAvaliacao, mensagemPedidoAvaliacao } from "./avaliacao";
import { pedidoDeAvaliacao } from "./mensagens";
import type { Cliente, Config, OrdemServico } from "./types";

const HOJE = "2026-09-23";
const cfg = { nomeLoja: "Silva Cell", linkAvaliacao: "https://g.page/r/silva/review" } as Config;
const cli = (c: Partial<Cliente> = {}): Cliente =>
  ({ id: "c1", nome: "Maria Souza", telefone: "41999990000", criadoEm: "2026-01-01", ...c }) as Cliente;
const os = (status: OrdemServico["status"] = "entregue") =>
  ({ id: "o1", numero: 1, status, marca: "Samsung", modelo: "A54" }) as OrdemServico;

describe("não pedir avaliação duas vezes em 90 dias", () => {
  it("nunca pedido: pode", () => {
    expect(avaliacaoRecente(cli(), HOJE)).toBe(false);
    expect(podePedirAvaliacao(os(), cli(), cfg, HOJE).pode).toBe(true);
  });

  it("pedido há 89 dias segura; há 90 libera", () => {
    expect(avaliacaoRecente(cli({ avaliacaoPedidaEm: "2026-06-26" }), HOJE)).toBe(true);
    expect(avaliacaoRecente(cli({ avaliacaoPedidaEm: "2026-06-25" }), HOJE)).toBe(false);
  });

  it("recusa dizendo quando foi o último pedido", () => {
    const r = podePedirAvaliacao(os(), cli({ avaliacaoPedidaEm: "2026-09-01" }), cfg, HOJE);
    expect(r.pode).toBe(false);
    expect(r.motivo).toContain("01/09/2026");
  });

  it("só depois de entregue, com link e com telefone", () => {
    expect(podePedirAvaliacao(os("pronta"), cli(), cfg, HOJE).pode).toBe(false);
    expect(podePedirAvaliacao(os(), cli(), { ...cfg, linkAvaliacao: " " }, HOJE).motivo).toContain(
      "Configurações"
    );
    expect(podePedirAvaliacao(os(), cli({ telefone: "" }), cfg, HOJE).pode).toBe(false);
    expect(podePedirAvaliacao(os(), undefined, cfg, HOJE).pode).toBe(false);
  });

  it("a mensagem de entrega também não repete o convite", () => {
    expect(pedidoDeAvaliacao(os(), cfg, cli())).toContain(cfg.linkAvaliacao!);
    expect(pedidoDeAvaliacao(os(), cfg, cli({ avaliacaoPedidaEm: new Date().toISOString().slice(0, 10) }))).toBe("");
  });
});

describe("mensagem do pedido", () => {
  const m = mensagemPedidoAvaliacao(os(), cli(), cfg);

  it("primeiro nome, loja, aparelho e o link", () => {
    expect(m).toContain("Oi, Maria!");
    expect(m).not.toContain("Souza");
    expect(m).toContain("Silva Cell");
    expect(m).toContain("Samsung A54");
    expect(m).toContain("https://g.page/r/silva/review");
  });

  it("sem emoji: vai para o WhatsApp", () => {
    expect(m).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
