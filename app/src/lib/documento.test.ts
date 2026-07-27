import { describe, it, expect } from "vitest";
import { mascaraDocumento, cpfValido, cnpjValido, documentoValido, soDigitos } from "./format";

describe("CPF e CNPJ", () => {
  it("aplica a máscara conforme o tamanho", () => {
    expect(mascaraDocumento("52679376000178")).toBe("52.679.376/0001-78");
    expect(mascaraDocumento("11144477735")).toBe("111.444.777-35");
  });

  it("não quebra com documento pela metade", () => {
    expect(mascaraDocumento("526")).toBe("526");
    expect(mascaraDocumento("")).toBe("");
  });

  it("guarda só os dígitos", () => {
    expect(soDigitos("52.679.376/0001-78")).toBe("52679376000178");
  });

  it("confere os dígitos verificadores", () => {
    expect(cpfValido("111.444.777-35")).toBe(true);
    expect(cpfValido("111.444.777-34")).toBe(false);
    expect(cnpjValido("52.679.376/0001-78")).toBe(true);
    expect(cnpjValido("52.679.376/0001-79")).toBe(false);
  });

  it("recusa documento com todos os dígitos iguais", () => {
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(cnpjValido("11.111.111/1111-11")).toBe(false);
  });

  it("campo em branco passa: cliente de balcão nem sempre informa", () => {
    expect(documentoValido("")).toBe(true);
    expect(documentoValido(null)).toBe(true);
  });

  it("tamanho que não é de CPF nem de CNPJ é recusado", () => {
    expect(documentoValido("123456")).toBe(false);
  });
});
