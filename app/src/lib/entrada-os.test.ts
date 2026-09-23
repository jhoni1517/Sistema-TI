import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  pedeWindows,
  ehNotebook,
  problemaNaFonte,
  textoDaFonte,
  versaoWindowsDe,
  WINDOWS_META,
} from "./entrada-os";
import { reciboOS } from "./recibo";
import type { Config, OrdemServico, PecaOS } from "./types";

const peca = (descricao: string): PecaOS => ({ descricao, quantidade: 1, custoUnit: 0, precoUnit: 100 });

const os = (x: Partial<OrdemServico> = {}): OrdemServico =>
  ({
    id: "o1",
    numero: 1,
    clienteId: "c1",
    tipoAparelho: "Notebook",
    marca: "Dell",
    modelo: "Inspiron",
    defeitoRelatado: "lento",
    checklist: {},
    pecas: [],
    maoDeObra: 0,
    desconto: 0,
    status: "aberta",
    garantiaDias: 90,
    historico: [],
    criadoEm: "2026-09-23T10:00:00.000Z",
    atualizadoEm: "2026-09-23T10:00:00.000Z",
    ...x,
  }) as unknown as OrdemServico;

describe("qual Windows: a pergunta aparece só na formatação", () => {
  it("serviço de formatação na lista de peças pede a versão", () => {
    expect(pedeWindows(os({ pecas: [peca("Formatação Computador ou Notebook")] }))).toBe(true);
  });

  it("sem acento e em maiúscula também — cada loja escreve de um jeito", () => {
    expect(pedeWindows(os({ pecas: [peca("FORMATACAO")] }))).toBe(true);
    expect(pedeWindows(os({ pecas: [peca("Instalação do Windows")] }))).toBe(true);
    expect(pedeWindows(os({ pecas: [peca("reinstalação de sistema")] }))).toBe(true);
  });

  it("o cliente dizendo 'quero formatar' no defeito já basta", () => {
    // É digitado ali antes de alguém lançar o serviço na lista de peças.
    expect(pedeWindows(os({ defeitoRelatado: "quer formatar, está lento" }))).toBe(true);
  });

  it("troca de tela ou de bateria não pergunta Windows nenhum", () => {
    // Campo que aparece sempre vira campo que ninguém preenche.
    expect(pedeWindows(os({ pecas: [peca("Tela 15.6"), peca("Bateria")] }))).toBe(false);
  });

  it("troca de SSD sozinha não pergunta: pode ser clonagem, sem sistema novo", () => {
    expect(pedeWindows(os({ pecas: [peca("Troca de SSD 240 GB")] }))).toBe(false);
  });

  it("as três versões que a loja instala, e nada além", () => {
    expect(Object.values(WINDOWS_META).map((w) => w.label)).toEqual([
      "Windows 10 Lite",
      "Windows 10 Pro",
      "Windows 11 Pro",
    ]);
    expect(versaoWindowsDe("11_pro")).toBe("11_pro");
    // Valor estranho vindo do banco não vira versão inventada no recibo.
    expect(versaoWindowsDe("xp")).toBeUndefined();
    expect(versaoWindowsDe(undefined)).toBeUndefined();
  });
});

describe("fonte do notebook: a pergunta aparece só para notebook", () => {
  it("reconhece notebook de qualquer jeito que foi escrito", () => {
    expect(ehNotebook("Notebook")).toBe(true);
    expect(ehNotebook("NOTEBOOK gamer")).toBe(true);
    expect(ehNotebook("Celular")).toBe(false);
    expect(ehNotebook("PC")).toBe(false);
  });

  it("deixou a fonte sem dizer qual: recusa, pedindo o modelo", () => {
    /*
     * "Deixou a fonte" sem modelo não protege ninguém: na retirada o cliente
     * diz que a dele era a original de 90W e a da gaveta é genérica de 65W.
     */
    expect(problemaNaFonte(os({ fonteDeixada: true }))).toContain("modelo");
    expect(problemaNaFonte(os({ fonteDeixada: true, fonteModelo: "   " }))).toContain("modelo");
    expect(problemaNaFonte(os({ fonteDeixada: true, fonteModelo: "Dell 65W" }))).toBe("");
  });

  it("não deixou, ou ninguém perguntou: não trava", () => {
    expect(problemaNaFonte(os({ fonteDeixada: false }))).toBe("");
    expect(problemaNaFonte(os({ fonteDeixada: undefined }))).toBe("");
  });

  it("celular nunca é cobrado por fonte, mesmo com lixo de antes no campo", () => {
    expect(problemaNaFonte(os({ tipoAparelho: "Celular", fonteDeixada: true }))).toBe("");
    expect(textoDaFonte(os({ tipoAparelho: "Celular", fonteDeixada: true, fonteModelo: "x" }))).toBe("");
  });

  it("o texto diferencia 'não deixou' de 'ninguém perguntou'", () => {
    // Só o primeiro protege a loja. O segundo não sai no papel.
    expect(textoDaFonte(os({ fonteDeixada: false }))).toBe("Não deixou");
    expect(textoDaFonte(os({ fonteDeixada: undefined }))).toBe("");
    expect(textoDaFonte(os({ fonteDeixada: true, fonteModelo: "Dell 65W" }))).toBe("Deixou — Dell 65W");
  });
});

describe("as duas respostas saem no papel que o cliente assina", () => {
  const config = { nomeLoja: "Loja" } as unknown as Config;

  it("o recibo traz a fonte com o modelo e a versão do Windows", () => {
    // É no papel assinado que isto vira prova na retirada.
    const html = reciboOS(
      os({ fonteDeixada: true, fonteModelo: "Dell 65W original", versaoWindows: "11_pro" }),
      undefined,
      config
    );
    expect(html).toContain("Dell 65W original");
    expect(html).toContain("Windows 11 Pro");
  });

  it("OS sem as respostas não imprime linha vazia", () => {
    const html = reciboOS(os({ tipoAparelho: "Celular" }), undefined, config);
    expect(html).not.toContain("Fonte / carregador");
    expect(html).not.toContain("Windows");
  });
});

describe("a tela liga as perguntas às regras", () => {
  const tela = readFileSync(join(__dirname, "..", "pages", "OrdensServico.tsx"), "utf8");

  it("salvar a OS confere o modelo da fonte", () => {
    const salvar = tela.slice(tela.indexOf("const salvar = async"), tela.indexOf("setEditando(null);"));
    expect(salvar).toContain("problemaNaFonte(");
  });

  it("as perguntas só aparecem nas condições delas", () => {
    expect(tela).toContain("pedeWindows(os) &&");
    expect(tela).toContain("ehNotebook(os.tipoAparelho) &&");
  });
});
