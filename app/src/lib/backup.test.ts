import { describe, it, expect } from "vitest";
import {
  backupDe,
  mexeNosDados,
  avisoDeBackup,
  perguntaAntesDeConcluir,
  linhaDoRecibo,
} from "./backup";
import type { OrdemServico } from "./types";

const os = (p: Partial<OrdemServico> = {}): OrdemServico =>
  ({
    id: "o1",
    numero: 1,
    defeitoRelatado: "não liga",
    defeitoConstatado: "",
    pecas: [],
    maoDeObra: 0,
    desconto: 0,
    status: "aberta",
    historico: [],
    criadoEm: "2026-08-01T10:00:00.000Z",
    ...p,
  }) as unknown as OrdemServico;

/**
 * Formatação e troca de SSD apagam tudo, e apagar não tem desfazer. É o
 * único erro desta loja que nenhum conserto posterior resolve.
 */
describe("não decidir é um estado, e ele incomoda", () => {
  it("OS antiga, sem o campo, é pendente", () => {
    // Se o padrão fosse "não precisa", esquecer de perguntar viraria
    // autorização por omissão.
    expect(backupDe(os())).toBe("pendente");
    expect(backupDe(os({ backup: undefined }))).toBe("pendente");
  });

  it("valor estranho vindo do banco também cai em pendente", () => {
    expect(backupDe({ backup: "qualquer" } as never)).toBe("pendente");
  });

  it("o que foi decidido é respeitado", () => {
    expect(backupDe(os({ backup: "feito" }))).toBe("feito");
  });
});

describe("o sistema puxa o assunto sozinho", () => {
  it("reconhece o serviço que apaga dados pelo laudo", () => {
    expect(mexeNosDados(os({ defeitoConstatado: "necessário formatação" }))).toBe(true);
    expect(mexeNosDados(os({ defeitoRelatado: "quero upgrade de SSD" }))).toBe(true);
  });

  it("reconhece pela peça lançada", () => {
    const comPeca = os({
      pecas: [
        { descricao: "Formatação Computador ou Notebook", quantidade: 1, precoUnit: 150, custoUnit: 0 },
      ],
    });
    expect(mexeNosDados(comPeca)).toBe(true);
  });

  it("troca de tela não mexe em disco", () => {
    const tela = os({
      defeitoRelatado: "tela trincada",
      pecas: [{ descricao: "Tela A54", quantidade: 1, precoUnit: 300, custoUnit: 200 }],
    });
    expect(mexeNosDados(tela)).toBe(false);
  });
});

describe("o aviso na tela", () => {
  it("cobra quando o serviço apaga dados e ninguém decidiu", () => {
    const a = avisoDeBackup(os({ defeitoConstatado: "necessário formatação" }));
    expect(a).toContain("apaga os dados");
    expect(a).toContain("não tem desfazer");
  });

  it("cobra o backup que ficou como a fazer", () => {
    expect(avisoDeBackup(os({ backup: "a_fazer" }))).toContain("A FAZER");
  });

  it("cala quando está resolvido", () => {
    expect(avisoDeBackup(os({ backup: "feito", defeitoConstatado: "formatação" }))).toBe("");
    expect(avisoDeBackup(os({ backup: "nao_precisa", defeitoConstatado: "formatação" }))).toBe("");
  });

  it("cala em serviço que não mexe em disco", () => {
    expect(avisoDeBackup(os({ defeitoRelatado: "tela trincada" }))).toBe("");
  });
});

/**
 * A cobrança vem antes de a máquina ser mexida, não na entrega: perguntar
 * sobre backup com o aparelho já formatado não serve para nada.
 */
describe("a pergunta antes de concluir", () => {
  it("pergunta quando ficou marcado como a fazer", () => {
    expect(perguntaAntesDeConcluir(os({ backup: "a_fazer" }))).toContain("A FAZER");
  });

  it("pergunta quando apaga dados e nunca foi combinado", () => {
    expect(
      perguntaAntesDeConcluir(os({ defeitoConstatado: "formatação" }))
    ).toContain("nunca foi combinado");
  });

  it("não pergunta nada quando está resolvido", () => {
    expect(perguntaAntesDeConcluir(os({ backup: "feito" }))).toBe("");
    expect(perguntaAntesDeConcluir(os({ backup: "nao_precisa" }))).toBe("");
  });

  it("não atrapalha quem só trocou uma tela", () => {
    expect(perguntaAntesDeConcluir(os({ defeitoRelatado: "tela trincada" }))).toBe("");
  });
});

describe("o que vai para o papel que o cliente assina", () => {
  it("dispensa vira declaração de ciência", () => {
    const l = linhaDoRecibo(os({ backup: "nao_precisa" }));
    expect(l).toContain("dispensou");
    expect(l).toContain("ciência");
  });

  it("backup feito é registrado", () => {
    expect(linhaDoRecibo(os({ backup: "feito" }))).toContain("realizado");
  });

  it("pendente não vai para o papel", () => {
    // "Ainda não perguntei" no documento do cliente não informa nada e
    // ainda expõe a loja.
    expect(linhaDoRecibo(os())).toBe("");
  });

  it("sem emoji, como todo texto que sai do sistema", () => {
    for (const b of ["nao_precisa", "a_fazer", "feito"] as const) {
      expect(/\p{Extended_Pictographic}/u.test(linhaDoRecibo(os({ backup: b })))).toBe(false);
    }
  });
});
