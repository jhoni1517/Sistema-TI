import { describe, it, expect } from "vitest";
import { imeiValido, pareceImei, chaveDoAparelho, mesmoAparelho, fichaDoAparelho } from "./imei";
import type { OrdemServico } from "./types";

describe("IMEI (Luhn)", () => {
  it("válidos e inválidos", () => {
    expect(imeiValido("356938035643809")).toBe(true);
    expect(imeiValido("35-693803-564380-9")).toBe(true);
    expect(imeiValido("490154203237518")).toBe(true);
    expect(imeiValido("356938035643808")).toBe(false); // último dígito trocado
    expect(imeiValido("356983035643809")).toBe(false); // dois dígitos invertidos
    // Limite conhecido do Luhn: trocar 0 e 9 de lugar passa. Não é bug daqui.
    expect(imeiValido("356938035643890")).toBe(true);
    expect(imeiValido("35693803564380")).toBe(false); // 14 dígitos
    expect(imeiValido("")).toBe(false);
  });

  it("série de notebook não é tratada como IMEI", () => {
    expect(pareceImei("5CD1234XYZ")).toBe(false);
    expect(pareceImei("35 693803 564380 9")).toBe(true);
  });

  it("o mesmo aparelho escrito de jeitos diferentes", () => {
    expect(chaveDoAparelho(" 35-693803-564380-9 ")).toBe("356938035643809");
    expect(mesmoAparelho("356938035643809", "35 693803 564380 9")).toBe(true);
    expect(mesmoAparelho("5CD 1234XYZ", "5cd1234xyz")).toBe(true);
    expect(mesmoAparelho("123", "123")).toBe(false); // curto demais para afirmar
    expect(mesmoAparelho("", "")).toBe(false);
  });
});

const os = (x: Partial<OrdemServico>): OrdemServico =>
  ({ id: "x", numero: 1, pecas: [], status: "aberta", garantiaDias: 0, criadoEm: "", ...x }) as OrdemServico;

describe("ficha do aparelho", () => {
  const ordens = [
    os({ id: "a", numero: 100, imeiSerial: "356938035643809", status: "entregue", criadoEm: "2026-05-01", entregueEm: "2026-05-03T12:00:00Z", garantiaDias: 90,
      pecas: [{ descricao: "Bateria", quantidade: 1, custoUnit: 1, precoUnit: 2 }] }),
    os({ id: "b", numero: 123, imeiSerial: "35-693803-564380-9", status: "entregue", criadoEm: "2026-08-10", entregueEm: "2026-08-14T12:00:00Z", garantiaDias: 90,
      opcaoEscolhida: "Original",
      pecas: [
        { descricao: "Tela original", quantidade: 1, custoUnit: 1, precoUnit: 2, opcao: "Original" },
        { descricao: "Tela paralela", quantidade: 1, custoUnit: 1, precoUnit: 2, opcao: "Paralela" },
      ] }),
    os({ id: "c", numero: 130, imeiSerial: "356938035643809", status: "cancelada", criadoEm: "2026-09-01",
      pecas: [{ descricao: "Placa", quantidade: 1, custoUnit: 1, precoUnit: 2 }] }),
    os({ id: "d", numero: 131, imeiSerial: "490154203237518", status: "entregue", criadoEm: "2026-09-01" }),
  ];

  it("junta as OS do aparelho, da mais nova para a mais velha", () => {
    const f = fichaDoAparelho("356938035643809", ordens, undefined, "2026-09-25");
    expect(f.ordens.map((o) => o.numero)).toEqual([130, 123, 100]);
  });

  it("peças: só de OS entregue e só do orçamento escolhido", () => {
    const f = fichaDoAparelho("356938035643809", ordens, undefined, "2026-09-25");
    expect(f.pecas.map((p) => p.descricao)).toEqual(["Tela original", "Bateria"]);
  });

  it("garantia que ainda vale, com o número da OS", () => {
    const f = fichaDoAparelho("356938035643809", ordens, undefined, "2026-09-25");
    expect(f.garantia?.os.numero).toBe(123);
    expect(f.garantia?.ate).toBe("2026-11-12");
    expect(fichaDoAparelho("356938035643809", ordens, undefined, "2027-01-01").garantia).toBeNull();
  });

  it("a própria OS em edição não entra na ficha", () => {
    expect(fichaDoAparelho("356938035643809", ordens, "c", "2026-09-25").ordens).toHaveLength(2);
  });
});
