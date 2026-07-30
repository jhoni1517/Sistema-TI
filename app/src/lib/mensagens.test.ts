import { describe, it, expect } from "vitest";
import { mensagemCliente } from "./mensagens";
import { escolherOpcao } from "./orcamento";
import { brl } from "./format";
import type { OrdemServico, PecaOS, Cliente, Config } from "./types";

const peca = (p: Partial<PecaOS>): PecaOS => ({
  descricao: "Peça",
  quantidade: 1,
  custoUnit: 0,
  precoUnit: 0,
  ...p,
});

const config = { nomeLoja: "Nova Geração" } as Config;
const cliente = { id: "c1", nome: "Pamela Souza" } as Cliente;

const os = (pecas: PecaOS[], extra: Partial<OrdemServico> = {}): OrdemServico =>
  ({
    id: "1",
    numero: 5,
    clienteId: "c1",
    tipoAparelho: "PC",
    marca: "",
    modelo: "",
    cor: "Preto",
    defeitoRelatado: "Não liga",
    checklist: {},
    pecas,
    maoDeObra: 50,
    desconto: 0,
    status: "aguardando_aprovacao",
    garantiaDias: 90,
    historico: [],
    criadoEm: "2026-01-01T00:00:00.000Z",
    atualizadoEm: "2026-01-01T00:00:00.000Z",
    ...extra,
  }) as OrdemServico;

const duasFontes = () =>
  os([
    peca({ descricao: "Fonte 500W PC nova", precoUnit: 399, opcao: "Fonte" }),
    peca({ descricao: "Fonte 200W PC nova", precoUnit: 149.9, opcao: "Fonte" }),
  ]);

describe("mensagem do cliente", () => {
  it("nunca soma alternativas: 548,90 é o número que não pode existir", () => {
    // A mensagem que gerou este arquivo listava as duas fontes e fechava com
    // "TOTAL: R$ 598,90" — a soma das duas mais a mão de obra.
    const texto = mensagemCliente(duasFontes(), cliente, config);
    expect(texto).not.toContain("598,90");
    expect(texto).not.toContain("548,90");
  });

  it("apresenta as alternativas numeradas com o total de cada uma", () => {
    const texto = mensagemCliente(duasFontes(), cliente, config);
    expect(texto).toContain("*ESCOLHA - FONTE*");
    expect(texto).toContain("*Opção 1 - Fonte 500W PC nova*");
    expect(texto).toContain("*Opção 2 - Fonte 200W PC nova*");
    // O total do serviço inteiro, que é sobre o que o cliente decide
    expect(texto).toContain(`Total do serviço: *${brl(449)}*`);
    expect(texto).toContain(`Total do serviço: *${brl(199.9)}*`);
  });

  it("pede o número da opção em vez de pedir SIM", () => {
    const texto = mensagemCliente(duasFontes(), cliente, config);
    expect(texto).toContain("Responda com o número da opção");
    expect(texto).not.toContain("responda *SIM*");
  });

  it("separa o que entra em qualquer opção do que é escolha", () => {
    const o = os([
      peca({ descricao: "Pasta térmica", precoUnit: 30 }),
      peca({ descricao: "Fonte 500W", precoUnit: 399, opcao: "Fonte" }),
      peca({ descricao: "Fonte 200W", precoUnit: 149.9, opcao: "Fonte" }),
    ]);
    const texto = mensagemCliente(o, cliente, config);
    expect(texto).toContain("*JÁ INCLUSO EM QUALQUER OPÇÃO*");
    expect(texto).toContain(`- Pasta térmica — ${brl(30)}`);
    expect(texto).toContain(`- Mão de obra — ${brl(50)}`);
  });

  it("marca a sugestão da loja sem esconder a outra opção", () => {
    const texto = mensagemCliente(escolherOpcao(duasFontes(), 1), cliente, config);
    expect(texto).toContain("Fonte 500W PC nova");
    expect(texto).toContain("Fonte 200W PC nova");
    expect(texto).toContain("Nossa sugestão.");
  });

  it("com dois grupos não promete um total por opção que não existe", () => {
    // O total de cada fonte depende também de qual disco for escolhido.
    const o = os([
      peca({ descricao: "Fonte 500W", precoUnit: 400, opcao: "Fonte", escolhida: true }),
      peca({ descricao: "Fonte 200W", precoUnit: 150, opcao: "Fonte" }),
      peca({ descricao: "SSD 1TB", precoUnit: 500, opcao: "Disco", escolhida: true }),
      peca({ descricao: "SSD 240GB", precoUnit: 200, opcao: "Disco" }),
    ]);
    const texto = mensagemCliente(o, cliente, config);
    expect(texto).not.toContain("Total do serviço:");
    expect(texto).toContain(`*TOTAL COM AS OPÇÕES SUGERIDAS: ${brl(950)}*`);
    expect(texto).toContain("qual opção prefere em cada escolha");
  });

  it("OS sem alternativa mantém o orçamento simples de sempre", () => {
    const o = os([peca({ descricao: "Fonte 500W", precoUnit: 399 })]);
    const texto = mensagemCliente(o, cliente, config);
    expect(texto).toContain("*ORÇAMENTO*");
    expect(texto).toContain(`*TOTAL: ${brl(449)}*`);
    expect(texto).not.toContain("ESCOLHA");
    expect(texto).toContain("responda *SIM*");
  });

  it("não sai emoji na mensagem", () => {
    // Em alguns aparelhos elas chegam como "?" e sujam o recado.
    const texto = mensagemCliente(duasFontes(), cliente, config, "https://x/y");
    expect(/\p{Extended_Pictographic}/u.test(texto)).toBe(false);
  });

  it("cabeçalho tem loja e código da OS nas duas primeiras linhas", () => {
    const linhas = mensagemCliente(duasFontes(), cliente, config).split("\n");
    expect(linhas[0]).toBe("*NOVA GERAÇÃO*");
    expect(linhas[1]).toBe("Ordem de serviço OS00005");
    expect(linhas[3]).toBe("Olá, Pamela!");
  });

  it("com link, convida a escolher e aprovar por lá", () => {
    const texto = mensagemCliente(duasFontes(), cliente, config, "https://loja/os/5");
    expect(texto).toContain("https://loja/os/5");
    expect(texto).toContain("escolha e aprove direto pelo link");
  });

  it("orçamento não aparece em etapa que ainda não tem valor", () => {
    const texto = mensagemCliente(
      os(duasFontes().pecas, { status: "aberta" }),
      cliente,
      config
    );
    expect(texto).not.toContain("ESCOLHA");
    expect(texto).not.toContain("R$");
  });

  it("bloco vazio não vira parágrafo em branco", () => {
    const texto = mensagemCliente(
      os([], { defeitoRelatado: "", maoDeObra: 0, status: "em_reparo" }),
      undefined,
      config
    );
    expect(texto).not.toContain("\n\n\n");
  });
});
