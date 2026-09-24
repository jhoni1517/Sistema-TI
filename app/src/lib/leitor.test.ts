import { describe, it, expect } from "vitest";
import { leituraDeProduto, leituraDeImei, mesmaLeitura } from "./leitor";

describe("leitura pela câmera", () => {
  it("produto: tira quebra de linha, mantém letra do SKU", () => {
    expect(leituraDeProduto(" 7891234567895\n")).toBe("7891234567895");
    expect(leituraDeProduto("ABC-123")).toBe("ABC-123");
    expect(leituraDeProduto(null)).toBe("");
  });

  it("IMEI: acha o válido no meio do texto da etiqueta ou do QR", () => {
    expect(leituraDeImei("356938035643809")).toBe("356938035643809");
    expect(leituraDeImei("IMEI1: 35 693803 564380 9 / IMEI2: 490154203237518")).toBe("356938035643809");
    expect(leituraDeImei("IMEI1:356938035643809;IMEI2:490154203237518")).toBe("356938035643809");
  });

  it("EAN de 13 dígitos ou IMEI com dígito errado não viram IMEI", () => {
    expect(leituraDeImei("7891234567895")).toBe("");
    expect(leituraDeImei("356938035643808")).toBe("");
    expect(leituraDeImei("SN: C39XK2ABHG7F")).toBe("");
  });

  it("o mesmo código lido duas vezes em sequência conta uma vez", () => {
    const a = { codigo: "789", em: 1000 };
    expect(mesmaLeitura(a, "789", 2000)).toBe(true);
    expect(mesmaLeitura(a, "789", 3000)).toBe(false);
    expect(mesmaLeitura(a, "790", 1100)).toBe(false);
    expect(mesmaLeitura(null, "789", 1100)).toBe(false);
  });
});
