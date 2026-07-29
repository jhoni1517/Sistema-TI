import { describe, it, expect } from "vitest";
import { whatsappLink, paraNumero, paraTexto } from "./format";

describe("whatsappLink", () => {
  it("acrescenta o 55 quando o número vem sem código do país", () => {
    expect(whatsappLink("(11) 98888-7777", "oi")).toContain("wa.me/5511988887777");
  });

  it("não duplica o 55 de quem já digitou completo", () => {
    expect(whatsappLink("5511988887777", "oi")).toContain("wa.me/5511988887777");
  });

  it("sem número, abre a lista de contatos em vez de ir para o 'wa.me/55'", () => {
    // Montar "wa.me/55" levava para um número inexistente e o WhatsApp
    // reclamava; sem número ele deixa escolher o contato com o texto pronto.
    const l = whatsappLink("", "segue o link");
    expect(l.startsWith("https://wa.me/?text=")).toBe(true);
  });

  it("escapa o texto da mensagem", () => {
    expect(whatsappLink("11988887777", "a & b")).toContain("a%20%26%20b");
  });
});

describe("paraNumero", () => {
  it("campo vazio não vira zero", () => {
    // Este é o bug inteiro: +"" era 0, o input controlado reescrevia "0" na
    // tela, e apagar o zero ficava impossível.
    expect(paraNumero("")).toBeUndefined();
    expect(paraNumero("   ")).toBeUndefined();
  });

  it("aceita vírgula, que é o que o teclado do celular oferece", () => {
    expect(paraNumero("12,50")).toBe(12.5);
    expect(paraNumero("12.50")).toBe(12.5);
  });

  it("estados intermediários da digitação não viram NaN", () => {
    // Quem digita "-5" passa por "-"; quem digita ",5" passa por ",".
    expect(paraNumero("-")).toBeUndefined();
    expect(paraNumero(",")).toBeUndefined();
    expect(paraNumero("-,")).toBeUndefined();
  });

  it("texto que não é número não vira zero silenciosamente", () => {
    expect(paraNumero("abc")).toBeUndefined();
  });

  it("zero digitado de verdade é zero", () => {
    expect(paraNumero("0")).toBe(0);
    expect(paraNumero("0,00")).toBe(0);
  });

  it("negativo e decimal passam", () => {
    expect(paraNumero("-3,5")).toBe(-3.5);
  });
});

describe("paraTexto", () => {
  it("ausência de valor vira campo vazio, não '0'", () => {
    expect(paraTexto(undefined)).toBe("");
    expect(paraTexto(null)).toBe("");
    expect(paraTexto(NaN)).toBe("");
  });

  it("zero de verdade aparece como 0", () => {
    expect(paraTexto(0)).toBe("0");
  });
});
