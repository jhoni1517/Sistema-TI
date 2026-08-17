import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { estadoDoSigilo, recadoDoSigilo, podeEditarSigilo } from "./sigilo";
import { revelar, proteger, estaCifrado } from "./cripto";
import type { OrdemServico } from "./types";

/*
 * O BUG
 *
 * A OS mostrava "Nenhum dado de acesso registrado" para um aparelho cuja
 * senha estava gravada. A decifragem devolvia texto vazio quando falhava, e
 * vazio é indistinguível de campo em branco.
 *
 * O primeiro estrago é o recado errado: o atendente liga para o cliente
 * pedindo de novo uma senha que o sistema tem na mão.
 *
 * O segundo é pior e não aparece: o vazio ficava na cópia em memória da OS, e
 * QUALQUER gravação seguinte daquela ordem — trocar status, receber, incluir
 * peça — subia o vazio por cima do bloco cifrado. A senha do cliente era
 * apagada do banco em silêncio, sem ninguém ter tocado no campo. É o mesmo
 * bug do formulário de Configurações que apagou a loja inteira.
 */

const os = (v: Partial<OrdemServico> = {}): OrdemServico =>
  ({
    senhaAparelho: "",
    padraoDesbloqueio: "",
    contaVinculada: "",
    ...v,
  }) as OrdemServico;

/** Um bloco no formato que sai de `proteger`, sem chave para abrir */
const CIFRADO = "enc1.YWJjZGVmZ2hpams=.bG1ub3BxcnN0dXZ4eXo=";

describe("estadoDoSigilo", () => {
  it("vazio quando ninguém anotou nada", () => {
    expect(estadoDoSigilo(os())).toBe("vazio");
    expect(estadoDoSigilo(os({ senhaAparelho: "   " }))).toBe("vazio");
  });

  it("tem quando qualquer um dos três está preenchido", () => {
    expect(estadoDoSigilo(os({ senhaAparelho: "1234" }))).toBe("tem");
    expect(estadoDoSigilo(os({ padraoDesbloqueio: "1-2-5-8" }))).toBe("tem");
    expect(estadoDoSigilo(os({ contaVinculada: "jose@gmail.com" }))).toBe("tem");
  });

  it("ilegível quando o bloco cifrado chegou à tela sem abrir", () => {
    expect(estadoDoSigilo(os({ senhaAparelho: CIFRADO }))).toBe("ilegivel");
    expect(estadoDoSigilo(os({ padraoDesbloqueio: CIFRADO }))).toBe("ilegivel");
  });

  it("ilegível ganha de tem: o atendente precisa saber que falta algo na tela", () => {
    // A conta vinculada abre (não é campo cifrado) e a senha não. Dizer "tem"
    // aqui esconderia justamente o campo que não está sendo mostrado.
    expect(
      estadoDoSigilo(os({ senhaAparelho: CIFRADO, contaVinculada: "jose@gmail.com" }))
    ).toBe("ilegivel");
  });
});

describe("recadoDoSigilo", () => {
  it("nunca diz que não tem nada quando o dado existe e não abriu", () => {
    const texto = recadoDoSigilo("ilegivel");
    expect(texto).not.toMatch(/nenhum dado/i);
    // Precisa dizer as duas coisas que acalmam: não se perdeu, e o que fazer.
    expect(texto).toMatch(/não foram perdidos/i);
    expect(texto).toMatch(/entre de novo/i);
  });

  it("o texto de vazio continua sendo o de vazio", () => {
    expect(recadoDoSigilo("vazio")).toMatch(/nenhum dado/i);
  });
});

describe("podeEditarSigilo", () => {
  it("bloqueia a edição enquanto o campo está ilegível", () => {
    expect(podeEditarSigilo(os({ senhaAparelho: CIFRADO }))).toBe(false);
  });

  it("libera no caso normal", () => {
    expect(podeEditarSigilo(os())).toBe(true);
    expect(podeEditarSigilo(os({ senhaAparelho: "1234" }))).toBe(true);
  });
});

describe("revelar: o contrato que impede o apagamento", () => {
  it("devolve null — e nunca vazio — quando não consegue abrir", async () => {
    // Sem chave carregada, que é o caso real: a leitura da loja falhou ou o
    // navegador não tem crypto.subtle.
    await expect(revelar(CIFRADO)).resolves.toBeNull();
  });

  it("texto sem prefixo volta inalterado (OS antiga, antes da criptografia)", async () => {
    await expect(revelar("1234")).resolves.toBe("1234");
  });

  it("campo realmente vazio continua vazio, e não null", async () => {
    // A diferença importa: "" é resposta, null é falha.
    await expect(revelar("")).resolves.toBe("");
    await expect(revelar(undefined)).resolves.toBe("");
  });

  it("proteger devolve o bloco cifrado igual — é o que salva o dado na regravação", async () => {
    // A trava toda depende disto: se `decifrarLinhas` guarda o bloco cifrado,
    // a gravação seguinte tem que subir o MESMO bloco, não cifrá-lo de novo
    // nem trocá-lo por outra coisa.
    expect(estaCifrado(CIFRADO)).toBe(true);
    await expect(proteger(CIFRADO)).resolves.toBe(CIFRADO);
  });
});

/*
 * A regra escrita não segura nada — este é o teste que reprova.
 *
 * `decifrarLinhas` é o único ponto por onde os campos sigilosos descem. Se
 * alguém voltar a gravar o resultado de `revelar` sem conferir, o apagamento
 * silencioso volta junto, e nenhum teste de função pura pega isso.
 */
describe("lib/db.ts não pode gravar o resultado de revelar sem conferir", () => {
  it("mantém o bloco cifrado quando a decifragem falha", () => {
    const fonte = readFileSync(new URL("./db.ts", import.meta.url), "utf8")
      // Comentário que explica a regra não pode contar como a regra.
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    const trecho = fonte.slice(fonte.indexOf("function decifrarLinhas"));
    const corpo = trecho.slice(0, trecho.indexOf("\n}"));

    expect(corpo).toContain("await revelar");
    // Jogar a resposta direto na linha é o bug: `copia[campo] = await
    // revelar(...)` grava o vazio da falha por cima do bloco cifrado.
    expect(corpo).not.toMatch(/copia\[[^\]]+\]\s*=\s*await revelar/);
    // E a conferência tem que ser por null, não por vazio: `if (claro)`
    // descartaria também uma decifragem legítima de string vazia.
    expect(corpo).toMatch(/claro\s*!==\s*null/);
  });
});
