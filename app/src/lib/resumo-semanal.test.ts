import { describe, it, expect } from "vitest";
import { resumoDaSemana, semanaPassada, type DadosResumo } from "./resumo-semanal";
// @ts-expect-error: arquivo JS da Vercel, sem tipos
import * as doRobo from "../../api/_resumo.js";

const HOJE = "2026-09-28"; // segunda

const dados: DadosResumo = {
  movimentos: [
    { tipo: "entrada", valor: 1500, custoRelacionado: 600, clienteId: "c1", data: "2026-09-22T12:00:00Z" },
    { tipo: "entrada", valor: 300, clienteId: "c2", data: "2026-09-25T12:00:00Z" },
    { tipo: "entrada", valor: 1200, clienteId: "c2", data: "2026-09-27T20:00:00Z" },
    { tipo: "entrada", valor: 80, clienteId: "c3", data: "2026-09-26T12:00:00Z" },
    { tipo: "entrada", valor: 50, data: "2026-09-26T12:00:00Z" },
    { tipo: "saida", valor: 400, categoria: "Aluguel", data: "2026-09-23T12:00:00Z" },
    { tipo: "saida", valor: 900, categoria: "Compra de peça", compraEstoque: true, data: "2026-09-23T12:00:00Z" },
    { tipo: "saida", valor: 200, categoria: "Fatura", faturaCartao: true, data: "2026-09-24T12:00:00Z" },
    { tipo: "entrada", valor: 9999, clienteId: "c1", data: "2026-09-28T09:00:00Z" }, // hoje: fora
    { tipo: "entrada", valor: 7777, clienteId: "c1", data: "2026-09-20T09:00:00Z" }, // semana retrasada
  ],
  ordens: [
    { numero: 10, status: "entregue", entregueEm: "2026-09-24T15:00:00Z" },
    { numero: 11, status: "entregue", entregueEm: "2026-09-10T15:00:00Z" },
    { numero: 12, status: "aguardando_peca", atualizadoEm: "2026-09-15T10:00:00Z", marca: "Samsung", modelo: "A54" },
    { numero: 13, status: "em_reparo", atualizadoEm: "2026-09-26T10:00:00Z" },
    { numero: 14, status: "cancelada", atualizadoEm: "2026-08-01T10:00:00Z" },
  ],
  produtos: [
    { nome: "Tela iPhone 11", quantidade: 0, estoqueMinimo: 1 },
    { nome: "Película", quantidade: 2, estoqueMinimo: 5 },
    { nome: "Cabo", quantidade: 30, estoqueMinimo: 5 },
    { nome: "Formatação", quantidade: 0, estoqueMinimo: 0, servico: true },
  ],
  clientes: [
    { id: "c1", nome: "Maria" },
    { id: "c2", nome: "João" },
    { id: "c3", nome: "Ana" },
    { id: "c4", nome: "Zé" },
  ],
};

describe("resumo da semana", () => {
  const texto = resumoDaSemana(dados, HOJE, "Silva Cell");

  it("a semana é a que acabou: segunda a domingo", () => {
    expect(semanaPassada(HOJE)).toEqual({ de: "2026-09-21", ate: "2026-09-27" });
    expect(texto).toMatch(/^\*Silva Cell - resumo da semana\*\n21\/09 a 27\/09/);
  });

  it("entrou e sobrou, sem compra de estoque nem fatura como despesa", () => {
    expect(texto).toContain("Entrou: *R$ 3.130,00*");
    // 3130 − 600 de custo − 400 de aluguel
    expect(texto).toContain("Sobrou: *R$ 2.130,00*");
  });

  it("OS entregues na semana e paradas há mais de 7 dias", () => {
    expect(texto).toContain("OS entregues: 1");
    expect(texto).toContain("*Paradas há mais de 7 dias (1):*\n- OS00012 Samsung A54");
    expect(texto).not.toContain("OS00013");
    expect(texto).not.toContain("OS00014");
  });

  it("acabando: o zerado primeiro, serviço fora", () => {
    expect(texto).toContain("*Acabando no estoque (2):*\n- Tela iPhone 11 (0)\n- Película (2)");
    expect(texto).not.toContain("Formatação");
  });

  it("os 3 que mais compraram na semana", () => {
    expect(texto).toContain("*Quem mais comprou:*\n1. João - R$ 1.500,00\n2. Maria - R$ 1.500,00\n3. Ana - R$ 80,00");
  });

  it("sem emoji", () => {
    expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(texto)).toBe(false);
  });

  it("loja parada não inventa número", () => {
    const vazio = resumoDaSemana({ movimentos: [], ordens: [], produtos: [], clientes: [] }, HOJE, "X");
    expect(vazio).toContain("Semana sem movimento no sistema.");
    expect(vazio).not.toContain("Quem mais comprou");
  });
});

describe("paridade: o robô de segunda escreve o mesmo texto", () => {
  it("mesmos dados, mesmo resumo", () => {
    expect(doRobo.resumoDaSemana(dados, HOJE, "Silva Cell")).toBe(resumoDaSemana(dados, HOJE, "Silva Cell"));
    const vazio = { movimentos: [], ordens: [], produtos: [], clientes: [] };
    expect(doRobo.resumoDaSemana(vazio, HOJE, "")).toBe(resumoDaSemana(vazio, HOJE, ""));
    expect(doRobo.semanaPassada("2026-01-05")).toEqual(semanaPassada("2026-01-05"));
  });
});
