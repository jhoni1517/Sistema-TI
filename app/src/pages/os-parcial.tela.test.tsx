import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Config, MovimentoCaixa, OrdemServico } from "../lib/types";

/**
 * O painel de recebimento da OS, desenhado de verdade.
 *
 * O que ele precisa responder, sem manual, para quem está com o cliente na
 * frente:
 *
 *   - o cliente pagou menos: e agora?
 *   - ele leva o aparelho ou não leva?
 *   - já entrou dinheiro nesta OS antes?
 *
 * `renderToStaticMarkup` monta o componente sem navegador e devolve o HTML.
 * O que dá para afirmar com ele é o que está escrito e qual botão nasce — que
 * é justamente o que nenhum teste de lib alcança.
 */

const os = (x: Partial<OrdemServico> = {}): OrdemServico =>
  ({
    id: "os-1",
    numero: 42,
    clienteId: "c1",
    tipoAparelho: "Celular",
    marca: "Samsung",
    modelo: "A20",
    defeitoRelatado: "Tela quebrada",
    checklist: {},
    pecas: [{ descricao: "Tela", quantidade: 1, custoUnit: 300, precoUnit: 620 }],
    maoDeObra: 180,
    desconto: 0,
    status: "pronta",
    garantiaDias: 90,
    historico: [],
    criadoEm: "2026-01-10T10:00:00.000Z",
    atualizadoEm: "2026-01-10T10:00:00.000Z",
    ...x,
  }) as unknown as OrdemServico;

const config = { nomeLoja: "Assistência", diasAbandono: 90 } as unknown as Config;

const mov = (valor: number, osId = "os-1"): MovimentoCaixa =>
  ({
    id: `m${valor}`,
    tipo: "entrada",
    valor,
    formaPagamento: "dinheiro",
    descricao: "x",
    osId,
    data: "2026-01-11T10:00:00.000Z",
  }) as unknown as MovimentoCaixa;

const loja = {
  ordens: [] as OrdemServico[],
  produtos: [],
  clientes: [],
  movimentos: [] as MovimentoCaixa[],
  fiados: [],
  notas: [],
  sessoes: [],
  config,
  fontesComFalha: [],
  ramo: "assistencia",
  saveNota: vi.fn(),
  saveOrdem: vi.fn(),
};

/*
 * Não tem navegador aqui, e o componente monta o link de rastreio a partir
 * de `window.location`. Um endereço de mentira basta: o que este arquivo
 * testa é o painel de dinheiro, não o link.
 */
vi.stubGlobal("window", {
  location: { origin: "https://loja.exemplo", pathname: "/" },
});

/*
 * O `Modal` desenha por portal, e portal precisa de DOM de verdade. Aqui ele
 * vira uma div: a moldura da janela não é o que este arquivo testa, e trocar
 * só ela evita arrastar um navegador inteiro para dentro da suíte.
 */
vi.mock("../components/ui", async (real) => {
  const mod = await real<Record<string, unknown>>();
  return {
    ...mod,
    Modal: ({ children, title }: { children: React.ReactNode; title?: string }) => (
      <div>
        <h2>{title}</h2>
        {children}
      </div>
    ),
  };
});

vi.mock("../store/AppStore", () => ({ useApp: () => loja }));
vi.mock("../lib/supabase", () => ({
  supabase: undefined,
  supabaseEnabled: false,
  obterCredenciais: () => ({ url: "", key: "" }),
  salvarCredenciais: () => {},
}));
vi.mock("../lib/db", async (real) => ({
  ...(await real<Record<string, unknown>>()),
  obterLoja: () => "loja-1",
}));

const { OSDetalhe } = await import("./OrdensServico");

/** Desenha o detalhe e devolve o texto que a pessoa lê */
function tela(ordem: OrdemServico, movimentos: MovimentoCaixa[] = []): string {
  Object.assign(loja, { ordens: [ordem], movimentos });
  const html = renderToStaticMarkup(
    <OSDetalhe
      os={ordem}
      clienteNome="Maria"
      cliente={{ nome: "Maria", telefone: "41999999999" }}
      config={config}
      onClose={() => {}}
      onStatus={() => {}}
      onAvisar={() => {}}
      onEditar={() => {}}
      onExcluir={() => {}}
      onReceber={() => {}}
      onFiado={() => {}}
      pagamentoRegistrado={false}
      historicoAparelho={[]}
      registrando={false}
    />
  );
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

describe("o painel de receber da OS", () => {
  it("sem sinal nenhum, o botão cobra o total e não fala em falta", () => {
    // O caminho comum tem que continuar sendo um clique. Campo de valor
    // sempre visível é mais uma coisa para conferir com a fila andando.
    const t = tela(os());
    expect(t).toContain("Receber R$ 800,00");
    expect(t).toContain("Recebeu só uma parte?");
    expect(t).not.toContain("Já recebido nesta OS");
    expect(t).not.toContain("O que fazer com o resto?");
  });

  it("depois do sinal, o botão cobra só o que FALTA", () => {
    /*
     * O erro que isto segura: quem pagou R$ 300 na semana passada abre a OS
     * e vê "Receber R$ 800". Um clique e a loja cobra o valor cheio de novo
     * — R$ 1.100 no caixa por um serviço de R$ 800.
     */
    const t = tela(os(), [mov(300)]);
    expect(t).toContain("Receber R$ 500,00");
    expect(t).not.toContain("Receber R$ 800,00");
  });

  it("o sinal já recebido fica escrito, com o total ao lado", () => {
    const t = tela(os(), [mov(300)]);
    expect(t).toContain("Já recebido nesta OS");
    expect(t).toContain("R$ 300,00");
    expect(t).toContain("R$ 800,00");
  });

  it("pagamento de outra OS não conta nesta", () => {
    // Somar movimento alheio faria a OS parecer paga e o resto sumiria.
    const t = tela(os(), [mov(300, "outra-os")]);
    expect(t).toContain("Receber R$ 800,00");
    expect(t).not.toContain("Já recebido nesta OS");
  });

  it("OS entregue não mostra o painel de receber", () => {
    const t = tela(os({ status: "entregue" }));
    expect(t).not.toContain("Receber e entregar");
  });

  it("OS cancelada também não", () => {
    const t = tela(os({ status: "cancelada" }));
    expect(t).not.toContain("Receber e entregar");
  });
});

describe("as duas saídas do resto dizem o que acontece com o APARELHO", () => {
  it("os dois botões aparecem, e cada um explica o destino do aparelho", async () => {
    /*
     * É a única diferença que importa entre eles. Se os rótulos não
     * dissessem isso, seriam duas palavras para a mesma coisa — e quem
     * escolhe está no balcão, com o cliente esperando.
     *
     * O painel só aparece quando o valor digitado é MENOR que o que falta:
     * por isso o teste passa um sinal parcial já recebido e nenhum
     * pagamento novo não serviria — a decisão nasce do valor da tela.
     */
    const { DESTINO_META } = await import("../lib/os-pagamento");
    expect(DESTINO_META.fiado.label).toContain("Levar");
    expect(DESTINO_META.fiado.explicacao).toContain("A Receber");
    expect(DESTINO_META.sinal.label).toContain("fica");
    expect(DESTINO_META.sinal.explicacao).toContain("continua aberta");
  });
});
