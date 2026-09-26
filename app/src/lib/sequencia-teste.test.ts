import { describe, it, expect } from "vitest";
import { etapaDoTeste, recadoDoTeste, diasDoTeste, type UsoNoTeste } from "./sequencia-teste";
// @ts-expect-error: arquivo JS da Vercel, sem tipos
import * as api from "../../api/_teste.js";

const base: UsoNoTeste = { diaDoTeste: 1, faltam: 29, passosCompletos: false, ordens: 0, vendas: 0, rastreios: 0, temOS: true };
const u = (x: Partial<UsoNoTeste>) => ({ ...base, ...x });

describe("etapaDoTeste", () => {
  it("dia 1 sem os primeiros passos pede para completar", () => {
    expect(etapaDoTeste(u({ diaDoTeste: 1 }))).toBe("d1");
  });
  it("dia 1 com tudo feito não manda nada", () => {
    expect(etapaDoTeste(u({ diaDoTeste: 1, passosCompletos: true }))).toBeNull();
  });
  it("dia 3 sem OS oferece ajuda; com OS fica quieto", () => {
    expect(etapaDoTeste(u({ diaDoTeste: 3 }))).toBe("d3");
    expect(etapaDoTeste(u({ diaDoTeste: 3, ordens: 1 }))).toBeNull();
  });
  it("mercearia conta venda no lugar de OS", () => {
    expect(etapaDoTeste(u({ diaDoTeste: 4, temOS: false, ordens: 0, vendas: 2 }))).toBeNull();
    expect(etapaDoTeste(u({ diaDoTeste: 4, temOS: false }))).toBe("d3");
  });
  it("dia 7 em diante mostra o que o sistema já fez", () => {
    expect(etapaDoTeste(u({ diaDoTeste: 7, faltam: 23 }))).toBe("d7");
    expect(etapaDoTeste(u({ diaDoTeste: 22, faltam: 8 }))).toBeNull();
  });
  it("faltando 5 dias ou menos, o fim do teste passa na frente", () => {
    expect(etapaDoTeste(u({ diaDoTeste: 25, faltam: 5 }))).toBe("d25");
    expect(etapaDoTeste(u({ diaDoTeste: 2, faltam: 3 }))).toBe("d25");
    expect(etapaDoTeste(u({ faltam: 0 }))).toBe("d25");
  });
  it("teste acabado não recebe mais nada", () => {
    expect(etapaDoTeste(u({ faltam: -1 }))).toBeNull();
  });
});

describe("recadoDoTeste", () => {
  it("dia 7 conta as ligações economizadas", () => {
    const r = recadoDoTeste("d7", u({ rastreios: 12 }));
    expect(r.titulo).toBe("Você já economizou 12 ligações");
    expect(recadoDoTeste("d7", u({ rastreios: 1 })).titulo).toBe("Você já economizou 1 ligação");
  });
  it("dia 7 sem nenhum rastreio ensina a mandar o link, em vez de dizer 0", () => {
    expect(recadoDoTeste("d7", u({})).titulo).toContain("link");
  });
  it("dia 25 fala da vaga de Fundador", () => {
    const r = recadoDoTeste("d25", u({ faltam: 5 }));
    expect(r.titulo).toBe("Seu teste acaba em 5 dias");
    expect(r.texto).toContain("Fundador");
    expect(recadoDoTeste("d25", u({ faltam: 1 })).titulo).toBe("Seu teste acaba amanhã");
  });
  it("nenhum recado tem emoji", () => {
    for (const e of ["d1", "d3", "d7", "d25"] as const)
      for (const temOS of [true, false]) {
        const r = recadoDoTeste(e, u({ temOS, rastreios: 3, vendas: 3 }));
        expect(r.titulo + r.texto).not.toMatch(/\p{Extended_Pictographic}/u);
      }
  });
});

describe("diasDoTeste", () => {
  it("o dia da criação é o dia 1, e a conta atravessa o ano", () => {
    expect(diasDoTeste("2026-12-30T22:00:00Z", "2027-01-29T00:00:00Z", "2027-01-05")).toEqual({ diaDoTeste: 7, faltam: 24 });
    expect(diasDoTeste("2026-09-26", "2026-10-26", "2026-09-26")).toEqual({ diaDoTeste: 1, faltam: 30 });
  });
});

describe("paridade com api/_teste.js", () => {
  it("mesma etapa e mesmo texto em todas as combinações", () => {
    for (let dia = 0; dia <= 32; dia++)
      for (const faltam of [-1, 0, 1, 5, 6, 20])
        for (const temOS of [true, false])
          for (const passosCompletos of [true, false])
            for (const ordens of [0, 3])
              for (const rastreios of [0, 1, 9]) {
                const x = u({ diaDoTeste: dia, faltam, temOS, passosCompletos, ordens, vendas: ordens, rastreios });
                const e = etapaDoTeste(x);
                expect(api.etapaDoTeste(x)).toBe(e);
                if (e) expect(api.recadoDoTeste(e, x)).toEqual(recadoDoTeste(e, x));
              }
    expect(api.diasDoTeste("2026-12-30T22:00:00Z", "2027-01-29", "2027-01-05")).toEqual(diasDoTeste("2026-12-30T22:00:00Z", "2027-01-29", "2027-01-05"));
  });

  it("passos completos no servidor seguem os mesmos itens do app", () => {
    const d = { nomeLoja: "Cell Center", telefoneLoja: "11 99999-0000", logoUrl: "https://x/l.jpg" };
    expect(api.passosCompletos(d, 1, 1, 0, true)).toBe(true);
    expect(api.passosCompletos({ ...d, logoUrl: "" }, 1, 1, 0, true)).toBe(false);
    expect(api.passosCompletos({ ...d, nomeLoja: "Minha Assistência TI" }, 1, 1, 0, true)).toBe(false);
    expect(api.passosCompletos(d, 1, 0, 1, false)).toBe(true);
  });

  it("e-mail escapa o nome da loja", () => {
    const m = api.emailDoRecado({ titulo: "T", texto: "x" }, "<b>Loja</b>", "https://a");
    expect(m.html).toContain("&lt;b&gt;Loja");
  });
});

describe("ramos com OS no servidor", () => {
  it("é a mesma lista de temModulo(ramo, 'os')", async () => {
    const { RAMOS, temModulo } = await import("./ramos");
    expect([...api.RAMOS_COM_OS].sort()).toEqual(RAMOS.filter((r) => temModulo(r, "os")).sort());
    expect(api.ramoTemOS(null)).toBe(true);
  });
});
