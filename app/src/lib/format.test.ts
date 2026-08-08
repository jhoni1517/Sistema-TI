import { describe, it, expect } from "vitest";
import { whatsappLink, paraNumero, paraTexto, textoDigitado } from "./format";

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

/**
 * O zero que não saía do campo.
 *
 * O campo de quantidade nasce em "0". Digitar 5 no fim dele deixa "05", e o
 * "05" FICAVA: o campo só se reescreve quando o número muda, e 05 e 5 são o
 * mesmo número. A pessoa digitava o valor e voltava para apagar o zero,
 * item por item, com a fila andando.
 */
describe("zero à esquerda no campo de número", () => {
  it("some quando vem outro dígito atrás", () => {
    expect(textoDigitado("05")).toBe("5");
    expect(textoDigitado("012")).toBe("12");
    expect(textoDigitado("007")).toBe("7");
    expect(textoDigitado("000")).toBe("0");
  });

  it("zero sozinho fica: é um valor de verdade", () => {
    expect(textoDigitado("0")).toBe("0");
  });

  it("no campo que valia 0, a primeira tecla substitui — dos dois lados", () => {
    // Tocar no COMEÇO do campo e digitar 7 dava "70", que é setenta. No
    // celular o dedo cai onde cai, e os dois casos têm que dar em 7.
    expect(textoDigitado("70", "0")).toBe("7");
    expect(textoDigitado("07", "0")).toBe("7");
    expect(textoDigitado("00", "0")).toBe("0");
  });

  it("quem quer setenta consegue digitar setenta", () => {
    // Primeira tecla: o campo valia "0", e o 7 substitui.
    expect(textoDigitado("70", "0")).toBe("7");
    // Segunda tecla: o campo já vale "7", então o 0 entra normalmente.
    expect(textoDigitado("70", "7")).toBe("70");
  });

  it("a primeira tecla sendo vírgula não apaga o zero", () => {
    // Senão seria impossível digitar cinquenta centavos.
    expect(textoDigitado("0,", "0")).toBe("0,");
  });

  it("não estraga o que começa com zero de propósito", () => {
    // Sem isto seria impossível digitar cinquenta centavos.
    expect(textoDigitado("0,")).toBe("0,");
    expect(textoDigitado("0,50")).toBe("0,50");
    expect(textoDigitado("0.5")).toBe("0.5");
  });

  it("vale também para negativo", () => {
    expect(textoDigitado("-05")).toBe("-5");
    expect(textoDigitado("-0,5")).toBe("-0,5");
  });

  it("número normal passa intacto", () => {
    expect(textoDigitado("10")).toBe("10");
    expect(textoDigitado("1234,56")).toBe("1234,56");
    expect(textoDigitado("")).toBe("");
  });

  it("letra não entra no campo", () => {
    // Aceitar e depois "esquecer" o que a pessoa digitou é pior do que
    // não aceitar.
    expect(textoDigitado("12abc")).toBe("12");
    expect(textoDigitado("R$ 5")).toBe("5");
  });

  it("o que sai daqui continua virando o número certo", () => {
    expect(paraNumero(textoDigitado("05"))).toBe(5);
    expect(paraNumero(textoDigitado("0,50"))).toBe(0.5);
    expect(paraNumero(textoDigitado("0"))).toBe(0);
  });
});
