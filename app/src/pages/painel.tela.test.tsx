import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Cliente, OrdemServico } from "../lib/types";

/**
 * A TV da bancada, desenhada de verdade.
 *
 * A TV fica virada para o salão: tudo o que ela mostra, quem está na fila
 * lê. O teste prende o que NÃO pode aparecer na parede.
 */

const clientes = [
  { id: "c1", nome: "Maria da Silva Souza", telefone: "41999990000" },
] as Cliente[];

const ordens = [
  {
    id: "o1",
    numero: 33,
    clienteId: "c1",
    marca: "Samsung",
    modelo: "A54",
    status: "pronta",
    defeitoRelatado: "tela quebrada depois da briga",
    imeiSerial: "356789012345678",
    senhaAparelho: "1234",
    maoDeObra: 480,
    criadoEm: "2026-09-01",
  },
] as unknown as OrdemServico[];

const loja = {
  ordens,
  clientes,
  config: { nomeLoja: "Silva Cell" },
  reload: async () => {},
};

vi.mock("../store/AppStore", () => ({ useApp: () => loja }));

const { PainelBancada } = await import("./PainelBancada");

describe("o painel da TV", () => {
  const html = renderToStaticMarkup(<PainelBancada />);

  it("mostra as quatro colunas e o cartão", () => {
    for (const t of ["Na fila", "Em reparo", "Aguardando peça", "Pronto"]) expect(html).toContain(t);
    expect(html).toContain("OS00033");
    expect(html).toContain("Maria");
    expect(html).toContain("Samsung A54");
  });

  it("não põe na parede sobrenome, telefone, defeito, IMEI, senha nem valor", () => {
    for (const proibido of ["Souza", "41999990000", "briga", "356789012345678", "1234", "480"]) {
      expect(html).not.toContain(proibido);
    }
  });
});
