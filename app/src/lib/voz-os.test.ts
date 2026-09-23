import { describe, it, expect } from "vitest";
import { lerOSPorVoz, telefoneDitado, clienteDaVoz, preencherPelaVoz } from "./voz-os";
import type { Cliente, OrdemServico } from "./types";

const resposta = {
  transcricao: "Maria Souza, 41 99999-0000, Samsung A54, tela quebrada, senha 1234, com capinha",
  nomeCliente: "Maria Souza",
  telefone: "(41) 99999-0000",
  tipoAparelho: "Celular",
  marca: "Samsung",
  modelo: "A54",
  defeito: "tela quebrada",
  senha: "1234",
  acessorios: "capinha",
};

describe("OS por voz: a resposta da IA", () => {
  it("resposta boa, com telefone formatado virando dígitos", () => {
    const v = lerOSPorVoz(JSON.stringify(resposta));
    expect(v.telefone).toBe("41999990000");
    expect(v.modelo).toBe("A54");
    expect(v.avisos).toEqual([]);
  });

  it("dentro de ```json``` e com lixo em volta", () => {
    expect(lerOSPorVoz("ok:\n```json\n" + JSON.stringify(resposta) + "\n```").nomeCliente).toBe("Maria Souza");
  });

  it("telefone sem DDD vira vazio, com aviso", () => {
    const v = lerOSPorVoz({ ...resposta, telefone: "99999-0000" });
    expect(v.telefone).toBe("");
    expect(v.avisos[0]).toContain("DDD");
  });

  it("telefone com +55 perde o país", () => {
    expect(telefoneDitado("+55 41 99999-0000")).toBe("41999990000");
    expect(telefoneDitado("123")).toBe("");
  });

  it("respostas quebradas dizem para gravar de novo", () => {
    expect(() => lerOSPorVoz("não entendi")).toThrow(/de novo/);
    expect(() => lerOSPorVoz('{"nomeCliente": "Ma')).toThrow();
    expect(() => lerOSPorVoz({ transcricao: "hmm" })).toThrow(/nome, aparelho nem defeito/);
    expect(() => lerOSPorVoz("")).toThrow();
  });

  it("marcação e quebras de linha são limpas", () => {
    expect(lerOSPorVoz({ ...resposta, defeito: "tela\n<b>quebrada</b>" }).defeito).not.toMatch(/[<\n]/);
  });
});

describe("OS por voz: cliente e formulário", () => {
  const c = (x: Partial<Cliente>): Cliente => ({ id: "c", nome: "", telefone: "", criadoEm: "", ...x }) as Cliente;
  const clientes = [
    c({ id: "maria", nome: "Maria Souza", telefone: "(41) 99999-0000" }),
    c({ id: "maria2", nome: "Maria Lima", telefone: "41888887777" }),
  ];

  it("acha o cliente pelo telefone", () => {
    expect(clienteDaVoz({ telefone: "41999990000", nomeCliente: "outro nome" }, clientes)?.id).toBe("maria");
  });

  it("pelo nome, só nome inteiro e único — 'Maria' sozinha não casa", () => {
    expect(clienteDaVoz({ telefone: "", nomeCliente: "maria souza" }, clientes)?.id).toBe("maria");
    expect(clienteDaVoz({ telefone: "", nomeCliente: "Maria" }, clientes)).toBeUndefined();
  });

  it("só preenche o que está vazio: não apaga o que a pessoa digitou", () => {
    const os = { clienteId: "", marca: "Motorola", modelo: "", defeitoRelatado: "", tipoAparelho: "", senhaAparelho: "" } as unknown as OrdemServico;
    const v = lerOSPorVoz(resposta);
    const p = preencherPelaVoz(os, v, clientes[0], true);
    expect(p).toMatchObject({ clienteId: "maria", modelo: "A54", defeitoRelatado: "tela quebrada", senhaAparelho: "1234" });
    expect(p.marca).toBeUndefined();
  });

  it("senha só entra quando o ramo tem o campo", () => {
    const os = { senhaAparelho: "" } as unknown as OrdemServico;
    expect(preencherPelaVoz(os, lerOSPorVoz(resposta), undefined, false).senhaAparelho).toBeUndefined();
  });
});
