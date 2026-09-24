import { describe, it, expect } from "vitest";
import {
  marcasDaTabela,
  modelosDaMarca,
  precoAPartirDe,
  horariosLivres,
  horariosDoDia,
  agendaSegura,
  somarDiasISO,
  problemaNoPedido,
  mensagemWhatsApp,
  osDoPedido,
  clienteDoPedido,
  ordenarPedidos,
  corSegura,
  textoSobre,
  AGENDA_SITE_PADRAO,
  type PedidoSite,
} from "./orcamento-online";
import { tabelaVazia, acrescentarModelo, acrescentarServico, definirPreco } from "./tabela-precos";

function tab() {
  let t = tabelaVazia();
  t = acrescentarModelo(t, "Apple", "iPhone 13", "i13");
  t = acrescentarModelo(t, "apple ", "iPhone 8", "i8");
  t = acrescentarModelo(t, "Samsung", "Galaxy A15", "a15");
  t = acrescentarServico(t, "Tela original", "tela-orig", "tela");
  t = definirPreco(t, "i13", "tela", 650);
  t = definirPreco(t, "i13", "tela-orig", 1100);
  t = definirPreco(t, "a15", "bateria", 180);
  return t;
}

describe("escolha na página", () => {
  it("marcas sem repetir por maiúscula ou espaço, modelos em ordem de número", () => {
    expect(marcasDaTabela(tab())).toEqual(["Apple", "Samsung"]);
    expect(modelosDaMarca(tab(), "APPLE").map((m) => m.modelo)).toEqual(["iPhone 8", "iPhone 13"]);
  });
  it("a partir de = o menor preço do problema", () => {
    expect(precoAPartirDe(tab(), "i13", "tela")).toBe(650);
    expect(precoAPartirDe(tab(), "i13", "bateria")).toBeNull();
    expect(precoAPartirDe(tab(), "i13", "outro")).toBeNull();
    expect(precoAPartirDe(tab(), "nada", "tela")).toBeNull();
  });
});

describe("horários livres", () => {
  // 2026-09-28 é segunda-feira; 2026-10-04 é domingo
  const a = { ...AGENDA_SITE_PADRAO, inicio: "09:00", fim: "12:00", intervalo: 60, porHorario: 1 };
  it("último horário termina no fim; domingo fechado", () => {
    expect(horariosDoDia(a, "2026-09-28")).toEqual(["09:00", "10:00", "11:00"]);
    expect(horariosDoDia(a, "2026-10-04")).toEqual([]);
  });
  it("tira o ocupado, o passado e o de daqui a menos de uma hora", () => {
    const r = horariosLivres(a, [{ data: "2026-09-29", hora: "10:00" }], "2026-09-28", "09:30", 2);
    expect(r).toEqual([
      { data: "2026-09-28", horas: ["11:00"] },
      { data: "2026-09-29", horas: ["09:00", "11:00"] },
    ]);
  });
  it("dois por horário: um ocupado ainda deixa vaga", () => {
    const r = horariosLivres({ ...a, porHorario: 2 }, [{ data: "2026-09-29", hora: "10:00:00" }], "2026-09-28", "23:00", 2);
    expect(r).toEqual([{ data: "2026-09-29", horas: ["09:00", "10:00", "11:00"] }]);
  });
  it("virada de mês e de ano em UTC", () => {
    expect(somarDiasISO("2026-12-31", 1)).toBe("2027-01-01");
    expect(somarDiasISO("2026-02-28", 1)).toBe("2026-03-01");
  });
  it("configuração torta vira o padrão", () => {
    expect(agendaSegura({ inicio: "25:00", fim: "08:00", intervalo: 5, porHorario: 0, dias: [9, 1] })).toEqual({
      ...AGENDA_SITE_PADRAO,
      dias: [1],
    });
    expect(agendaSegura(null)).toEqual(AGENDA_SITE_PADRAO);
  });
});

describe("pedido", () => {
  it("agenda pede nome e telefone com DDD; WhatsApp só o modelo", () => {
    const ok = { nome: "Ana", telefone: "(11) 98888-7777", modelo: "iPhone 13" };
    expect(problemaNoPedido(ok, "agenda")).toBe("");
    expect(problemaNoPedido({ ...ok, telefone: "98888-7777" }, "agenda")).toMatch(/DDD/);
    expect(problemaNoPedido({ ...ok, telefone: "+55 11 98888-7777" }, "agenda")).toBe("");
    expect(problemaNoPedido({ ...ok, nome: "" }, "agenda")).toMatch(/nome/);
    expect(problemaNoPedido({ ...ok, nome: "", telefone: "" }, "whatsapp")).toBe("");
    expect(problemaNoPedido({ ...ok, modelo: " " }, "whatsapp")).toMatch(/modelo/);
  });

  it("mensagem do WhatsApp com modelo, problema e preço, sem emoji", () => {
    const m = mensagemWhatsApp({ marca: "Apple", modelo: "iPhone 13", problema: "tela", preco: 650, data: "2026-09-29", hora: "10:00" });
    expect(m).toMatch(/Apple iPhone 13, problema: tela/);
    expect(m).toMatch(/a partir de R\$\s?650,00/);
    expect(m).toMatch(/29\/09\/2026 às 10:00/);
    expect(/[\u{1F300}-\u{1FAFF}]/u.test(m)).toBe(false);
    expect(mensagemWhatsApp({ marca: "", modelo: "Xing Ling", problema: "outro" })).toMatch(/Xing Ling, problema: outro.*\n.*valor e o prazo/);
  });

  const pedido: PedidoSite = {
    id: "p1",
    nome: "Ana",
    telefone: "11988887777",
    marca: "Apple",
    modelo: "iPhone 13",
    problema: "tela",
    detalhe: "caiu",
    preco: 650,
    canal: "agenda",
    status: "novo",
    criadoEm: "2026-09-28T12:00:00Z",
  };

  it("vira OS com o preço do site como item, e acha o cliente pelo telefone", () => {
    const o = osDoPedido(pedido);
    expect(o).toMatchObject({ marca: "Apple", modelo: "iPhone 13", defeitoRelatado: "Tela: caiu" });
    expect(o.pecas[0]).toMatchObject({ precoUnit: 650, custoUnit: 0 });
    expect(osDoPedido({ ...pedido, preco: null }).pecas).toEqual([]);
    expect(clienteDoPedido(pedido, [{ id: "c", telefone: "+55 (11) 98888-7777" }])?.id).toBe("c");
    expect(clienteDoPedido({ ...pedido, telefone: "" }, [{ id: "c", telefone: "" }])).toBeUndefined();
  });

  it("novos primeiro, o agendado mais cedo na frente", () => {
    const l = ordenarPedidos([
      { ...pedido, id: "a", status: "convertido" },
      { ...pedido, id: "b", data: "2026-09-30" },
      { ...pedido, id: "c", data: "2026-09-29" },
      { ...pedido, id: "d", data: null, canal: "whatsapp" },
    ]);
    expect(l.map((p) => p.id)).toEqual(["c", "b", "d", "a"]);
  });

  it("cor só hexadecimal", () => {
    expect(corSegura("#112233")).toBe("#112233");
    expect(corSegura("red;background:url(x)")).toBe("#bf3f0b");
    expect(textoSobre("#bf3f0b")).toBe("#ffffff");
    expect(textoSobre("#ffd400")).toBe("#1c1917");
    expect(textoSobre("#000000")).toBe("#ffffff");
  });
});
