import { describe, it, expect } from "vitest";
import {
  descontoAcima,
  problemaNoMotivo,
  novoRegistro,
  filtrarAuditoria,
  alertasDoDia,
  usuariosDaAuditoria,
  valorLegivel,
  type RegistroAuditoria,
} from "./auditoria";

const r = (acao: string, usuario: string, criadoEm: string, extra: Partial<RegistroAuditoria> = {}): RegistroAuditoria => ({
  id: Math.random().toString(36),
  acao,
  alvo: "x",
  usuario,
  criadoEm,
  ...extra,
});

describe("desconto", () => {
  it("em % do valor antes do desconto, e só acima do limite", () => {
    expect(descontoAcima(500, 50)).toBeNull(); // exatamente 10% não passa
    expect(descontoAcima(500, 51)).toBe(10.2);
    expect(descontoAcima(100, 30, 25)).toBe(30);
    expect(descontoAcima(0, 10)).toBeNull();
    expect(descontoAcima(100, 0)).toBeNull();
  });
});

describe("motivo", () => {
  it("obrigatório nas sensíveis, e não vale uma palavra", () => {
    expect(problemaNoMotivo("os_excluida", "")).toMatch(/motivo/);
    expect(problemaNoMotivo("os_excluida", "erro")).toMatch(/motivo/);
    expect(problemaNoMotivo("os_excluida", "OS duplicada, era a 120")).toBe("");
    expect(problemaNoMotivo("preco", "")).toBe("");
  });
});

describe("registro", () => {
  it("antes e depois viram texto; valor em centavos", () => {
    const x = novoRegistro("1", "preco", { alvo: "Cabo USB", antes: 10, depois: { preco: 12 }, valor: 12.345 });
    expect(x).toMatchObject({ acao: "preco", antes: "10", depois: '{"preco":12}', valor: 12.35, motivo: null });
  });
});

describe("filtro", () => {
  const lista = [
    r("estorno", "Ana", "2026-09-20T10:00:00Z", { motivo: "cliente desistiu" }),
    r("preco", "Bia", "2026-09-22T10:00:00Z"),
    r("estorno", "Bia", "2026-09-24T10:00:00Z"),
  ];
  it("por ação, pessoa, período e busca; mais novo primeiro", () => {
    expect(filtrarAuditoria(lista, { acao: "estorno" }).map((x) => x.usuario)).toEqual(["Bia", "Ana"]);
    expect(filtrarAuditoria(lista, { usuario: "Bia", de: "2026-09-23" })).toHaveLength(1);
    expect(filtrarAuditoria(lista, { busca: "DESISTIU" })).toHaveLength(1);
    expect(usuariosDaAuditoria(lista)).toEqual(["Ana", "Bia"]);
  });
});

describe("alerta do dia", () => {
  const hoje = "2026-09-25";
  it("5 cancelamentos no dia por uma pessoa dispara pelo limite", () => {
    const lista = Array.from({ length: 5 }, () => r("venda_cancelada", "Caio", `${hoje}T12:00:00Z`));
    const a = alertasDoDia(lista, hoje);
    expect(a).toHaveLength(1);
    expect(a[0].texto).toMatch(/Caio: 5 × venda cancelada/);
  });
  it("3 vezes a média também dispara; 1 num dia calmo não", () => {
    const passado = Array.from({ length: 3 }, (_, i) => r("sangria", "Ana", `2026-09-${10 + i}T12:00:00Z`));
    const hojeTres = Array.from({ length: 3 }, () => r("sangria", "Ana", `${hoje}T12:00:00Z`));
    expect(alertasDoDia([...passado, ...hojeTres], hoje)).toHaveLength(1);
    expect(alertasDoDia([...passado, r("sangria", "Ana", `${hoje}T12:00:00Z`)], hoje)).toEqual([]);
  });
  it("conta por pessoa, não somando a equipe", () => {
    const lista = [
      ...Array.from({ length: 3 }, () => r("venda_cancelada", "Ana", `${hoje}T12:00:00Z`)),
      ...Array.from({ length: 3 }, () => r("venda_cancelada", "Bia", `${hoje}T12:00:00Z`)),
    ];
    expect(alertasDoDia(lista, hoje)).toEqual([]);
  });
});

describe("valor legível", () => {
  it("objeto vira pares, data vira dd/mm/aaaa, texto fica", () => {
    expect(valorLegivel('{"valor":119,"forma":"pix","data":"2026-09-25T12:37:00.000Z"}')).toBe("valor: 119 · forma: pix · data: 25/09/2026");
    expect(valorLegivel("10")).toBe("10");
    expect(valorLegivel("atendente")).toBe("atendente");
    expect(valorLegivel(null)).toBe("—");
  });
});
