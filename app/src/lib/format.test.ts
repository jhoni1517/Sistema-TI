import { describe, it, expect } from "vitest";
import { whatsappLink } from "./format";

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
