import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Config, MovimentoCaixa, OrdemServico, Produto } from "../lib/types";
import type { Nota } from "../lib/nota";

/**
 * A TELA da nota da OS, desenhada de verdade.
 *
 * Os outros testes conferem as contas e o que sai pela rede. Faltava o
 * pedaço que o dono da loja realmente vê — e tela sem teste é onde o erro
 * fica invisível: a conta certa mostrada no lugar errado engana igual.
 *
 * Não tem navegador aqui, e não precisa: `renderToStaticMarkup` monta o
 * componente de verdade e devolve o HTML. O que dá para afirmar com ele é o
 * que está escrito e em que estado cada botão nasce, que é justamente o que
 * eu não conseguia afirmar antes.
 */

const produtos: Produto[] = [
  {
    id: "p1",
    nome: "Tela A20",
    preco: 630,
    custo: 300,
    estoque: 2,
    ncm: "85177011",
    cfop: "5102",
    csosn: "102",
    origem: "0",
  } as unknown as Produto,
];

const os: OrdemServico = {
  id: "os-1",
  numero: 42,
  clienteId: "c1",
  tipoAparelho: "Celular",
  marca: "Samsung",
  modelo: "A20",
  defeitoRelatado: "Tela quebrada",
  checklist: {},
  pecas: [
    { descricao: "Tela A20", quantidade: 1, custoUnit: 300, precoUnit: 630, produtoId: "p1" },
  ],
  maoDeObra: 180,
  desconto: 0,
  status: "pronta",
  garantiaDias: 90,
  historico: [],
  criadoEm: "2026-01-10T10:00:00.000Z",
  atualizadoEm: "2026-01-10T10:00:00.000Z",
} as unknown as OrdemServico;

const config: Config = {
  nomeLoja: "Assistência",
  cnpj: "12345678000199",
  inscricaoEstadual: "1234567",
  inscricaoMunicipal: "987654",
  regimeTributario: "simples",
  codigoServicoPadrao: "14.01",
  aliquotaIssPadrao: 3,
  nfLogradouro: "Rua das Flores",
  nfNumero: "123",
  nfBairro: "Centro",
  nfCep: "83000000",
  nfMunicipio: "São José dos Pinhais",
  nfCodigoIbge: "4125506",
  nfUf: "PR",
} as unknown as Config;

/** A loja de mentira que o componente enxerga */
const loja = {
  ordens: [os],
  produtos,
  clientes: [{ id: "c1", nome: "João", telefone: "41999999999", criadoEm: "" }],
  movimentos: [] as MovimentoCaixa[],
  notas: [] as Nota[],
  saveNota: vi.fn(),
  saveOrdem: vi.fn(),
  ramo: "assistencia",
};

vi.mock("../store/AppStore", () => ({ useApp: () => loja }));
// O componente não fala com a nuvem ao desenhar, mas o módulo importa o
// cliente do Supabase — e ele reclama de credencial faltando na importação.
vi.mock("../lib/supabase", () => ({
  supabase: undefined,
  supabaseEnabled: false,
  obterCredenciais: () => ({ url: "", key: "" }),
  salvarCredenciais: () => {},
}));

const { NotaFiscalDaOS } = await import("./OrdensServico");

/** Desenha a tela com a loja no estado pedido e devolve o texto que aparece */
function tela(x: Partial<typeof loja> = {}, ordem = os): string {
  Object.assign(loja, {
    ordens: [ordem],
    produtos,
    movimentos: [],
    notas: [],
    ...x,
  });
  const html = renderToStaticMarkup(<NotaFiscalDaOS os={ordem} config={config} />);
  // Tira as tags: o que importa é o que a pessoa lê.
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

describe("a tela da nota da OS", () => {
  it("mostra os DOIS documentos, com o imposto e o valor de cada um", () => {
    /*
     * É o ponto inteiro da tela. Um documento só, ou dois sem dizer qual
     * imposto é de quem, e a pessoa emite tudo para o governo errado sem
     * nunca saber que escolheu.
     */
    const t = tela();
    expect(t).toContain("Nota de serviço (NFS-e)");
    expect(t).toContain("ISS, municipal");
    expect(t).toContain("R$ 180,00");

    expect(t).toContain("Nota de consumidor (NFC-e)");
    expect(t).toContain("ICMS, estadual");
    expect(t).toContain("R$ 630,00");
  });

  it("os dois lados nascem com botão de emitir, um para cada", () => {
    const html = renderToStaticMarkup(<NotaFiscalDaOS os={os} config={config} />);
    expect(html.match(/Emitir/g)?.length).toBe(2);
  });

  it("o lado que já tem nota mostra a situação dela, e não o botão", () => {
    // Botão de emitir numa nota já pedida é o caminho para nota em
    // duplicidade — e a segunda tem prazo de 30 minutos para cancelar.
    const t = tela({
      notas: [
        { id: "n1", osId: "os-1", tipo: "nfse", situacao: "pendente" },
      ] as Nota[],
    });
    expect(t).toContain("Aguardando envio");
    expect(t.match(/Emitir/g)?.length).toBe(1);
  });

  it("nota recusada mostra o motivo na cara, e não escondido", () => {
    const t = tela({
      notas: [
        {
          id: "n1",
          osId: "os-1",
          tipo: "nfse",
          situacao: "rejeitada",
          erro: "Inscrição Municipal não habilitada na prefeitura",
        },
      ] as Nota[],
    });
    expect(t).toContain("Recusada pela SEFAZ");
    expect(t).toContain("Inscrição Municipal não habilitada");
  });

  it("OS sem peça não mostra o lado da mercadoria como emitível", () => {
    const soServico = { ...os, pecas: [] } as OrdemServico;
    const t = tela({}, soServico);
    expect(t).toContain("Nada deste lado");
    expect(t.match(/Emitir/g)?.length).toBe(1);
  });

  it("OS zerada não mostra bloco nenhum", () => {
    // Nota de R$ 0,00 é rejeitada. Oferecer o botão seria prometer o que
    // não existe.
    const vazia = { ...os, pecas: [], maoDeObra: 0 } as OrdemServico;
    Object.assign(loja, { ordens: [vazia], notas: [] });
    expect(renderToStaticMarkup(<NotaFiscalDaOS os={vazia} config={config} />)).toBe("");
  });

  it("cada peça mostra em que documento está e o botão para mudar", () => {
    const t = tela();
    expect(t).toContain("Algum item está no documento errado?");
    expect(t).toContain("Tela A20");
    expect(t).toContain("Mover para NFS-e");
  });

  it("a peça movida aparece do outro lado — a tela lê a OS VIVA da loja", () => {
    /*
     * O bug que isto segura: o modal de detalhe guarda uma cópia da OS de
     * quando a janela abriu. Lendo a cópia, mover um item gravava certo e a
     * tela não mexia um fio — e a pessoa clica de novo achando que o botão
     * está quebrado.
     *
     * Por isso o componente recebe a OS ANTIGA de propósito aqui, e a loja
     * tem a nova: o que ele desenhar tem que ser a nova.
     */
    const movida = {
      ...os,
      pecas: [{ ...os.pecas[0], documentoForcado: "nfse" as const }],
    } as OrdemServico;
    Object.assign(loja, { ordens: [movida], notas: [] });

    const t = renderToStaticMarkup(<NotaFiscalDaOS os={os} config={config} />)
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ");

    // Os R$ 630 da peça atravessaram para o lado do serviço: 180 + 630.
    expect(t).toContain("R$ 810,00");
    expect(t).toContain("Nada deste lado");
    expect(t).toContain("Mover para NFC-e");
  });
});
