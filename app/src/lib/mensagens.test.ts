import { describe, it, expect } from "vitest";
import { mensagemCliente } from "./mensagens";
import { comOpcao } from "./orcamento";
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

/** Dois caminhos, e o caro leva duas peças */
const doisCaminhos = () =>
  os([
    peca({ descricao: "Pasta térmica", precoUnit: 30 }),
    peca({ descricao: "Fonte 500W PC nova", precoUnit: 399, opcao: "Opção 1" }),
    peca({ descricao: "SSD 1TB", precoUnit: 500, opcao: "Opção 1" }),
    peca({ descricao: "Fonte 200W PC nova", precoUnit: 149.9, opcao: "Opção 2" }),
  ]);

describe("mensagem do cliente", () => {
  it("nunca soma os caminhos: 1.128,90 é o número que não pode existir", () => {
    // A mensagem que gerou este arquivo listava as duas fontes em sequência e
    // fechava com a soma de tudo.
    const texto = mensagemCliente(doisCaminhos(), cliente, config);
    expect(texto).not.toContain("1.128,90");
  });

  it("cada opção vira um bloco com as peças dela e o total do serviço", () => {
    const texto = mensagemCliente(doisCaminhos(), cliente, config);
    expect(texto).toContain("*OPÇÃO 1*");
    expect(texto).toContain("*OPÇÃO 2*");
    expect(texto).toContain("- SSD 1TB");
    // O total do serviço INTEIRO, que é sobre o que o cliente decide
    expect(texto).toContain(`Total do serviço: *${brl(979)}*`);
    expect(texto).toContain(`Total do serviço: *${brl(229.9)}*`);
  });

  it("separa o que entra em qualquer opção do que é escolha", () => {
    const texto = mensagemCliente(doisCaminhos(), cliente, config);
    expect(texto).toContain("*JÁ INCLUSO EM QUALQUER OPÇÃO*");
    expect(texto).toContain(`- Pasta térmica — ${brl(30)}`);
    expect(texto).toContain(`- Mão de obra — ${brl(50)}`);
  });

  it("pede o número da opção em vez de pedir SIM", () => {
    const texto = mensagemCliente(doisCaminhos(), cliente, config);
    expect(texto).toContain("Responda com o número da opção");
    expect(texto).not.toContain("responda *SIM*");
  });

  it("marca a sugestão da loja sem esconder a outra opção", () => {
    const texto = mensagemCliente(comOpcao(doisCaminhos(), "Opção 2"), cliente, config);
    expect(texto).toContain("Fonte 500W PC nova");
    expect(texto).toContain("Fonte 200W PC nova");
    expect(texto).toContain("Nossa sugestão.");
    // A sugestão fica no bloco da opção escolhida, não em outro
    const blocos = texto.split("\n\n");
    const daSugestao = blocos.find((b) => b.includes("Nossa sugestão."));
    expect(daSugestao).toContain("Fonte 200W PC nova");
  });

  it("nome livre ganha a numeração; nome já numerado não numera duas vezes", () => {
    const o = os([
      peca({ descricao: "Fonte 500W", precoUnit: 399, opcao: "Completo" }),
      peca({ descricao: "Fonte 200W", precoUnit: 149.9, opcao: "Essencial" }),
    ]);
    const texto = mensagemCliente(o, cliente, config);
    expect(texto).toContain("*OPÇÃO 1 - COMPLETO*");
    expect(texto).toContain("*OPÇÃO 2 - ESSENCIAL*");
    expect(texto).not.toContain("OPÇÃO 1 - OPÇÃO 1");
  });

  it("OS sem opção mantém o orçamento simples de sempre", () => {
    const o = os([peca({ descricao: "Fonte 500W", precoUnit: 399 })]);
    const texto = mensagemCliente(o, cliente, config);
    expect(texto).toContain("*ORÇAMENTO*");
    expect(texto).toContain(`*TOTAL: ${brl(449)}*`);
    expect(texto).not.toContain("OPÇÃO");
    expect(texto).toContain("responda *SIM*");
  });

  it("com uma opção só, as peças dela entram na lista normal", () => {
    // Não existe escolha aqui, então não faz sentido montar bloco de opção —
    // e a peça não pode sumir da mensagem por causa disso.
    const o = os([peca({ descricao: "Fonte 500W", precoUnit: 399, opcao: "Opção 1" })]);
    const texto = mensagemCliente(o, cliente, config);
    expect(texto).toContain("- Fonte 500W");
    expect(texto).toContain(`*TOTAL: ${brl(449)}*`);
    expect(texto).not.toContain("Total do serviço:");
  });

  it("espaço sobrando no nome da loja não pode matar o negrito", () => {
    // "*NOVA GERAÇÃO INFORMÁTICA *" chegou assim no celular do cliente, com
    // os asteriscos à mostra: o WhatsApp cancela o negrito quando tem espaço
    // encostado no asterisco. O espaço estava no cadastro, onde não se vê.
    const texto = mensagemCliente(doisCaminhos(), cliente, {
      nomeLoja: "  Nova Geração Informática ",
    } as Config);
    expect(texto.split("\n")[0]).toBe("*NOVA GERAÇÃO INFORMÁTICA*");
    // Nenhum negrito da mensagem pode ter espaço encostado por dentro. Fora
    // dos asteriscos pode: "*Aparelho:* PC Gamer" é negrito válido.
    for (const trecho of texto.match(/\*[^*\n]+\*/g) || []) {
      const dentro = trecho.slice(1, -1);
      expect(dentro).toBe(dentro.trim());
    }
  });

  it("descrição de peça com espaço sobrando não vira dois espaços na linha", () => {
    const o = os([peca({ descricao: "Formatação Computador ", precoUnit: 150 })]);
    const texto = mensagemCliente(o, cliente, config);
    expect(texto).toContain(`- Formatação Computador — ${brl(150)}`);
  });

  it("a situação vai sozinha no parágrafo, em caixa alta e falando com o cliente", () => {
    // Antes vinha "*Situação:* Pronta" colada no aparelho, com o negrito no
    // rótulo em vez do estado — a informação que o cliente abriu a mensagem
    // para ver era a menos visível de todas.
    const texto = mensagemCliente(os([], { status: "pronta" }), cliente, config);
    expect(texto.split("\n\n")).toContain("*PRONTA PARA RETIRADA*");
    expect(texto).not.toContain("*Situação:*");
  });

  it("decidido, a mensagem não devolve a escolha que o cliente já fez", () => {
    // O print que gerou este teste: OS PRONTA mandando as duas opções, com o
    // total de cada uma e "Nossa sugestão" no fim. O valor que a pessoa ia
    // pagar no balcão ficava no meio de dois totais que não valiam mais.
    const o = comOpcao(os(doisCaminhos().pecas, { status: "pronta" }), "Opção 2");
    const texto = mensagemCliente(o, cliente, config);
    expect(texto).not.toContain("OPÇÃO");
    expect(texto).not.toContain("Nossa sugestão");
    expect(texto).not.toContain("Total do serviço");
    // O caminho recusado não pode reaparecer: ele não vai ser cobrado
    expect(texto).not.toContain("Fonte 500W PC nova");
    expect(texto).toContain("*ORÇAMENTO*");
    expect(texto).toContain(`- Fonte 200W PC nova — ${brl(149.9)}`);
    expect(texto).toContain(`*TOTAL A PAGAR: ${brl(229.9)}*`);
  });

  it("serviço acabado não devolve ao cliente a frase que ele mesmo falou", () => {
    const o = os(doisCaminhos().pecas, { status: "pronta", defeitoRelatado: "Não liga" });
    const texto = mensagemCliente(o, cliente, config);
    expect(texto).not.toContain("PROBLEMA RELATADO");
    // Em aberto ela continua: é o que mostra que a loja anotou direito
    expect(mensagemCliente({ ...o, status: "em_reparo" }, cliente, config)).toContain(
      "*PROBLEMA RELATADO*\nNão liga"
    );
  });

  it("total vira 'a pagar' só na retirada", () => {
    const emReparo = mensagemCliente(
      comOpcao(os(doisCaminhos().pecas, { status: "em_reparo" }), "Opção 2"),
      cliente,
      config
    );
    expect(emReparo).toContain(`*TOTAL: ${brl(229.9)}*`);
    expect(emReparo).not.toContain("TOTAL A PAGAR");
  });

  it("o link só pede resposta onde existe pergunta", () => {
    const pronta = mensagemCliente(
      os(doisCaminhos().pecas, { status: "pronta" }),
      cliente,
      config,
      "https://loja/os/5"
    );
    expect(pronta).toContain("*ACOMPANHE POR AQUI*");
    expect(pronta).not.toContain("RESPONDA");
  });

  it("não sai emoji na mensagem", () => {
    // Em alguns aparelhos elas chegam como "?" e sujam o recado.
    const texto = mensagemCliente(doisCaminhos(), cliente, config, "https://x/y");
    expect(/\p{Extended_Pictographic}/u.test(texto)).toBe(false);
  });

  it("cabeçalho tem loja e código da OS nas duas primeiras linhas", () => {
    const linhas = mensagemCliente(doisCaminhos(), cliente, config).split("\n");
    expect(linhas[0]).toBe("*NOVA GERAÇÃO*");
    expect(linhas[1]).toBe("Ordem de serviço OS00005");
    expect(linhas[3]).toBe("Olá, Pamela!");
  });

  it("com link, convida a escolher e aprovar por lá", () => {
    const texto = mensagemCliente(doisCaminhos(), cliente, config, "https://loja/os/5");
    expect(texto).toContain("https://loja/os/5");
    expect(texto).toContain("escolha e aprove direto pelo link");
  });

  it("orçamento não aparece em etapa que ainda não tem valor", () => {
    const texto = mensagemCliente(
      os(doisCaminhos().pecas, { status: "aberta" }),
      cliente,
      config
    );
    expect(texto).not.toContain("OPÇÃO");
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
