import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { gerarDemo } from "./demo";
import { db, entrarDemo, sairDemo, emDemo, definirLoja } from "./db";

const HOJE = new Date("2026-09-24T15:00:00Z");

describe("loja de exemplo", () => {
  const d = gerarDemo(HOJE);

  it("tem o tamanho prometido", () => {
    expect(d.ordens).toHaveLength(40);
    expect(d.produtos).toHaveLength(80);
    expect(d.clientes).toHaveLength(30);
  });

  it("é sempre a mesma loja (semente fixa)", () => {
    expect(gerarDemo(HOJE)).toEqual(d);
  });

  it("OS em todas as etapas, com número único", () => {
    const etapas = new Set(d.ordens.map((o) => o.status));
    expect(etapas.size).toBe(9);
    expect(new Set(d.ordens.map((o) => o.numero)).size).toBe(40);
    // Toda OS aponta para um cliente que existe
    const ids = new Set(d.clientes.map((c) => c.id));
    expect(d.ordens.every((o) => ids.has(o.clienteId))).toBe(true);
  });

  it("vendas cobrem 60 dias e cada uma tem o seu lançamento no caixa", () => {
    const dias = new Set(d.vendas.map((v) => v.criadoEm.slice(0, 10)));
    expect(dias.size).toBeGreaterThanOrEqual(50);
    const primeiro = [...dias].sort()[0];
    expect(primeiro >= "2026-07-26").toBe(true);
    const movs = new Map(d.movimentos.map((m) => [m.id, m]));
    for (const v of d.vendas) {
      const m = movs.get(v.movimentoId!);
      const total = v.itens.reduce((s, i) => s + i.precoUnit * i.quantidade, 0);
      expect(m?.valor).toBeCloseTo(total, 2);
      expect(m?.sessaoId).toBe(v.sessaoId);
    }
  });

  it("OS entregue entrou no caixa; as outras não", () => {
    for (const o of d.ordens) {
      const m = d.movimentos.filter((x) => x.osId === o.id);
      expect(m).toHaveLength(o.status === "entregue" ? 1 : 0);
      if (m[0]) {
        const total = o.maoDeObra + o.pecas.reduce((s, p) => s + p.precoUnit * p.quantidade, 0);
        expect(m[0].valor).toBeCloseTo(total, 2);
        expect(o.entregueEm?.slice(0, 10)).toBe(m[0].data.slice(0, 10));
      }
    }
  });

  it("todo lançamento cai num caixa que existe, no mesmo dia", () => {
    const sessoes = new Map(d.sessoes.map((s) => [s.id, s]));
    for (const m of d.movimentos) {
      const s = sessoes.get(m.sessaoId!);
      expect(s, m.id).toBeDefined();
      expect(s!.abertoEm.slice(0, 10)).toBe(m.data.slice(0, 10));
    }
    // Só o caixa de hoje fica aberto
    expect(d.sessoes.filter((s) => !s.fechadoEm)).toHaveLength(1);
  });

  it("estoque mostra o aviso de reposição e serviço não tem estoque", () => {
    expect(d.produtos.some((p) => !p.servico && p.quantidade <= p.estoqueMinimo)).toBe(true);
    expect(d.produtos.filter((p) => p.servico).every((p) => p.quantidade === 0)).toBe(true);
  });

  it("recado de vendas sem emoji", () => {
    const fonte = readFileSync(new URL("./demo.ts", import.meta.url), "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[\u{1F300}-\u{1FAFF}]/u.test(fonte)).toBe(false);
  });
});

describe("modo demonstração no db", () => {
  afterEach(() => sairDemo());

  it("lê e grava só na memória, e some ao sair", async () => {
    const d = gerarDemo(HOJE);
    definirLoja("demo");
    entrarDemo({ clientes: d.clientes }, d.config);
    expect(emDemo()).toBe(true);
    expect(await db.clientes.all()).toHaveLength(30);
    await db.clientes.save({ id: "novo", nome: "Teste", telefone: "", criadoEm: "" });
    expect(await db.clientes.all()).toHaveLength(31);
    await db.clientes.remove("novo");
    expect(await db.clientes.all()).toHaveLength(30);
    expect(await db.loja.ramo()).toBe("assistencia");
    expect((await db.config.get())?.nomeLoja).toMatch(/Exemplo/);
    sairDemo();
    expect(emDemo()).toBe(false);
    definirLoja(null);
  });

  it("entrar de novo recomeça do zero (não herda o que foi mexido)", async () => {
    const d = gerarDemo(HOJE);
    entrarDemo({ clientes: d.clientes }, d.config);
    await db.clientes.remove(d.clientes[0].id);
    sairDemo();
    entrarDemo({ clientes: d.clientes }, d.config);
    expect(await db.clientes.all()).toHaveLength(30);
  });

  it("interruptores da loja real recusam, dizendo o porquê", async () => {
    entrarDemo({}, {});
    await expect(db.loja.definirCatalogo(true)).rejects.toThrow(/loja de exemplo/);
    await expect(db.loja.gerarAcessoCliente("x")).rejects.toThrow(/loja de exemplo/);
  });
});
