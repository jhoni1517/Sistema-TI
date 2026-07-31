import { describe, it, expect, beforeEach } from "vitest";
import {
  ehFalhaDeRede,
  enfileirar,
  fila,
  remover,
  marcarFalha,
  limparFila,
  tamanhoDaFila,
  descarregar,
  CHAVE_FILA,
} from "./fila";

/** localStorage de mentira: os testes de lib rodam em node, sem navegador */
const memoria = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => memoria.get(k) ?? null,
  setItem: (k: string, v: string) => void memoria.set(k, v),
  removeItem: (k: string) => void memoria.delete(k),
  clear: () => memoria.clear(),
};

describe("rede caiu ou o banco recusou?", () => {
  it("falha de rede vale tentar de novo", () => {
    // "Failed to fetch" é o que o navegador devolve quando não conseguiu nem
    // sair da máquina.
    expect(ehFalhaDeRede(new Error("TypeError: Failed to fetch"))).toBe(true);
    expect(ehFalhaDeRede(new Error("NetworkError when attempting to fetch"))).toBe(true);
    expect(ehFalhaDeRede(new Error("The request timed out"))).toBe(true);
  });

  it("recusa do banco NÃO entra na fila: vai falhar de novo para sempre", () => {
    // Enfileirar isso criaria fila infinita tentando gravar o impossível, e o
    // operador acharia que salvou.
    expect(
      ehFalhaDeRede(new Error("Could not find the 'x' column of 'y' in the schema cache"))
    ).toBe(false);
    expect(ehFalhaDeRede(new Error("new row violates row-level security policy"))).toBe(
      false
    );
    expect(
      ehFalhaDeRede(new Error("a assinatura do sistema está vencida"))
    ).toBe(false);
    expect(ehFalhaDeRede(new Error("duplicate key value"))).toBe(false);
    expect(ehFalhaDeRede(new Error("permission denied"))).toBe(false);
  });

  it("sessão expirada não entra na fila: gravar depois daria o mesmo erro", () => {
    expect(ehFalhaDeRede(new Error("Sua sessão expirou e o registro não foi salvo."))).toBe(
      false
    );
  });

  it("erro sem mensagem não vira fila por acidente", () => {
    expect(ehFalhaDeRede(new Error(""))).toBe(false);
    expect(ehFalhaDeRede(null)).toBe(false);
  });
});

describe("a fila", () => {
  beforeEach(() => {
    memoria.clear();
  });

  it("guarda a linha inteira, com a tabela", () => {
    enfileirar("vendas", { id: "v1", numero: 3 });
    const [p] = fila();
    expect(p.tabela).toBe("vendas");
    expect(p.linha.numero).toBe(3);
    expect(p.tentativas).toBe(0);
  });

  it("editar o mesmo registro cinco vezes grava UMA, com o último valor", () => {
    // Empilhar geraria cinco gravações e um piscar de valores antigos na
    // tela de quem estiver com o sistema aberto em outro aparelho.
    for (const q of [1, 2, 3, 4, 5]) enfileirar("produtos", { id: "p1", quantidade: q });
    expect(tamanhoDaFila()).toBe(1);
    expect(fila()[0].linha.quantidade).toBe(5);
  });

  it("registros diferentes convivem", () => {
    enfileirar("produtos", { id: "p1" });
    enfileirar("produtos", { id: "p2" });
    enfileirar("vendas", { id: "p1" });
    expect(tamanhoDaFila()).toBe(3);
  });

  it("linha sem id não entra: não teria como gravar depois", () => {
    enfileirar("vendas", { numero: 3 });
    expect(tamanhoDaFila()).toBe(0);
  });

  it("marcar falha conta a tentativa sem perder o item", () => {
    enfileirar("vendas", { id: "v1" });
    marcarFalha("vendas", "v1", "sem internet");
    expect(fila()[0].tentativas).toBe(1);
    expect(fila()[0].ultimoErro).toBe("sem internet");
  });

  it("remover e limpar funcionam", () => {
    enfileirar("vendas", { id: "v1" });
    enfileirar("vendas", { id: "v2" });
    remover("vendas", "v1");
    expect(tamanhoDaFila()).toBe(1);
    limparFila();
    expect(tamanhoDaFila()).toBe(0);
  });

  it("fila ilegível não trava o sistema", () => {
    memoria.set(CHAVE_FILA, "isto não é json");
    expect(() => fila()).not.toThrow();
    expect(fila()).toEqual([]);
  });
});

describe("descarregar quando a internet volta", () => {
  beforeEach(() => memoria.clear());

  it("grava tudo e esvazia", async () => {
    enfileirar("vendas", { id: "v1" });
    enfileirar("movimentos", { id: "m1" });
    const r = await descarregar(async () => {});
    expect(r.gravados).toBe(2);
    expect(r.restantes).toBe(0);
  });

  it("grava na ordem de entrada", async () => {
    // A venda tem que gravar antes do movimento de caixa que aponta para ela.
    enfileirar("vendas", { id: "v1" });
    enfileirar("movimentos", { id: "m1" });
    const ordem: string[] = [];
    await descarregar(async (tabela) => {
      ordem.push(tabela);
    });
    expect(ordem).toEqual(["vendas", "movimentos"]);
  });

  it("para no primeiro erro de rede em vez de esperar trinta tempos-limite", async () => {
    enfileirar("vendas", { id: "v1" });
    enfileirar("vendas", { id: "v2" });
    enfileirar("vendas", { id: "v3" });
    const r = await descarregar(async () => {
      throw new Error("Failed to fetch");
    });
    expect(r.gravados).toBe(0);
    expect(r.restantes).toBe(3);
    expect(fila()[0].tentativas).toBe(1);
  });

  it("item recusado pelo banco sai da fila e vira aviso", async () => {
    // Um item impossível não pode segurar os outros para sempre.
    enfileirar("vendas", { id: "ruim" });
    enfileirar("vendas", { id: "bom" });
    const r = await descarregar(async (_t, linha) => {
      if (linha.id === "ruim") throw new Error("violates row-level security policy");
    });
    expect(r.gravados).toBe(1);
    expect(r.recusados).toHaveLength(1);
    expect(r.recusados[0].linha.id).toBe("ruim");
    expect(r.restantes).toBe(0);
  });

  it("fila vazia não faz nada e não dá erro", async () => {
    const r = await descarregar(async () => {
      throw new Error("não deveria ser chamado");
    });
    expect(r).toEqual({ gravados: 0, recusados: [], restantes: 0 });
  });
});
