import { describe, it, expect, beforeEach } from "vitest";
import {
  RAMOS,
  RAMO_META,
  ramoDe,
  temModulo,
  temRecurso,
  vocabulario,
  ramoEfetivo,
  lerRamoAparelho,
  definirRamoAparelho,
  ramoLembrado,
  lembrarRamoDaConta,
} from "./ramos";

describe("ramos", () => {
  it("loja sem ramo cadastrado continua sendo assistência técnica", () => {
    // Toda loja existente foi criada antes deste campo. Nenhuma pode acordar
    // num sistema diferente do que ela usava ontem.
    expect(ramoDe(undefined)).toBe("assistencia");
    expect(ramoDe(null)).toBe("assistencia");
    expect(ramoDe("")).toBe("assistencia");
  });

  it("ramo inventado não derruba a tela", () => {
    expect(ramoDe("padaria")).toBe("assistencia");
    expect(() => vocabulario("padaria")).not.toThrow();
    expect(temModulo("padaria", "pdv")).toBe(false);
  });

  it("só a assistência tem ordem de serviço e rastreio", () => {
    expect(temModulo("assistencia", "os")).toBe(true);
    expect(temModulo("assistencia", "rastreio")).toBe(true);
    for (const r of RAMOS.filter((x) => x !== "assistencia")) {
      expect(temModulo(r, "os"), r).toBe(false);
      expect(temModulo(r, "rastreio"), r).toBe(false);
    }
  });

  it("assistência não tem PDV: lá a venda nasce da OS, não do balcão", () => {
    expect(temModulo("assistencia", "pdv")).toBe(false);
  });

  it("mesa e fila de preparo são só da pizzaria", () => {
    expect(temModulo("pizzaria", "mesas")).toBe(true);
    expect(temModulo("pizzaria", "producao")).toBe(true);
    for (const r of RAMOS.filter((x) => x !== "pizzaria")) {
      expect(temModulo(r, "mesas"), r).toBe(false);
      expect(temModulo(r, "producao"), r).toBe(false);
    }
  });

  it("IMEI e garantia são campos da assistência, não de mercearia", () => {
    expect(temRecurso("assistencia", "imei")).toBe(true);
    expect(temRecurso("assistencia", "garantia")).toBe(true);
    expect(temRecurso("mercearia", "imei")).toBe(false);
  });

  it("validade vale para quem vende comida e bebida", () => {
    expect(temRecurso("mercearia", "validade")).toBe(true);
    expect(temRecurso("bebidas", "validade")).toBe(true);
    expect(temRecurso("assistencia", "validade")).toBe(false);
  });

  it("só bebidas tem restrição de idade", () => {
    expect(temRecurso("bebidas", "idadeMinima")).toBe(true);
    for (const r of RAMOS.filter((x) => x !== "bebidas")) {
      expect(temRecurso(r, "idadeMinima"), r).toBe(false);
    }
  });

  it("todo ramo tem vocabulário completo, sem campo vazio", () => {
    for (const r of RAMOS) {
      for (const [campo, valor] of Object.entries(vocabulario(r))) {
        expect(valor.trim(), `${r}.${campo}`).not.toBe("");
      }
    }
  });

  it("cada ramo tem nome e descrição para aparecer na escolha", () => {
    for (const r of RAMOS) {
      expect(RAMO_META[r].label.trim()).not.toBe("");
      expect(RAMO_META[r].descricao.trim()).not.toBe("");
    }
  });

  it("nenhum ramo repete módulo nem recurso", () => {
    for (const r of RAMOS) {
      const { modulos, recursos } = RAMO_META[r];
      expect(new Set(modulos).size, `${r} módulos`).toBe(modulos.length);
      expect(new Set(recursos).size, `${r} recursos`).toBe(recursos.length);
    }
  });

  it("cada módulo declarado é usado por pelo menos um ramo", () => {
    // Módulo que ninguém usa é tela que ninguém abre: ou falta ligar em
    // algum ramo, ou sobra no código.
    const usados = new Set(RAMOS.flatMap((r) => RAMO_META[r].modulos));
    for (const m of ["os", "rastreio", "pdv", "delivery", "mesas", "producao"]) {
      expect(usados.has(m as never), `módulo ${m} não é de nenhum ramo`).toBe(true);
    }
  });
});

/**
 * localStorage de mentira: os testes de lib rodam em node, sem navegador.
 * Um jsdom inteiro só para guardar quatro strings deixaria a suíte lenta
 * para todo mundo — e o que precisa ser testado aqui é a regra, não o
 * navegador.
 */
const memoria = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => memoria.get(k) ?? null,
  setItem: (k: string, v: string) => void memoria.set(k, v),
  removeItem: (k: string) => void memoria.delete(k),
  clear: () => memoria.clear(),
};

describe("ramo escolhido no aparelho", () => {
  beforeEach(() => memoria.clear());

  it("sem escolha local, vale o ramo da loja", () => {
    expect(ramoEfetivo("pizzaria")).toBe("pizzaria");
    expect(ramoEfetivo(undefined)).toBe("assistencia");
  });

  it("a escolha do aparelho ganha da loja", () => {
    definirRamoAparelho("mercearia");
    expect(ramoEfetivo("assistencia")).toBe("mercearia");
  });

  it("dá para voltar ao normal sem mexer na loja", () => {
    definirRamoAparelho("mercearia");
    definirRamoAparelho(null);
    expect(ramoEfetivo("assistencia")).toBe("assistencia");
  });

  it("valor estragado no armazenamento não derruba a tela", () => {
    memoria.set("sistema-ti:ramo-aparelho", "padaria");
    expect(lerRamoAparelho()).toBeNull();
    expect(ramoEfetivo("pizzaria")).toBe("pizzaria");
  });
});

/**
 * A tela de entrada mostrava quatro botões de tipo de loja para todo mundo,
 * e para o cliente eles não faziam nada — só o administrador muda de ramo.
 * Clicar e nada acontecer parecia defeito.
 */
describe("o aparelho lembra o ramo de quem já entrou", () => {
  beforeEach(() => memoria.clear());

  it("conta que nunca entrou aqui não é reconhecida", () => {
    expect(ramoLembrado("novo@loja.com")).toBeNull();
  });

  it("depois de entrar uma vez, a tela já sabe o tipo de loja", () => {
    lembrarRamoDaConta("dona@mercearia.com", "mercearia");
    expect(ramoLembrado("dona@mercearia.com")).toBe("mercearia");
  });

  it("e-mail com espaço ou maiúscula é a mesma conta", () => {
    // Quem digita no celular acerta o endereço e erra a caixa: reconhecer
    // "Dona@Mercearia.com " como outra conta faria a tela esquecer à toa.
    lembrarRamoDaConta("dona@mercearia.com", "mercearia");
    expect(ramoLembrado("  Dona@Mercearia.COM ")).toBe("mercearia");
  });

  it("aparelho de balcão guarda mais de uma conta", () => {
    lembrarRamoDaConta("a@x.com", "mercearia");
    lembrarRamoDaConta("b@x.com", "pizzaria");
    expect(ramoLembrado("a@x.com")).toBe("mercearia");
    expect(ramoLembrado("b@x.com")).toBe("pizzaria");
  });

  it("mudança de plano sobrescreve o que estava guardado", () => {
    lembrarRamoDaConta("a@x.com", "mercearia");
    lembrarRamoDaConta("a@x.com", "bebidas");
    expect(ramoLembrado("a@x.com")).toBe("bebidas");
  });

  it("guarda as últimas contas e esquece as antigas", () => {
    for (const n of [1, 2, 3, 4, 5, 6]) lembrarRamoDaConta(`c${n}@x.com`, "mercearia");
    expect(ramoLembrado("c6@x.com")).toBe("mercearia");
    expect(ramoLembrado("c1@x.com")).toBeNull();
  });

  it("e-mail vazio não vira conta guardada", () => {
    lembrarRamoDaConta("   ", "mercearia");
    expect(ramoLembrado("")).toBeNull();
  });

  it("armazenamento estragado não impede ninguém de entrar", () => {
    memoria.set("sistema-ti:ramo-por-conta", "isto não é json");
    expect(() => ramoLembrado("a@x.com")).not.toThrow();
    expect(ramoLembrado("a@x.com")).toBeNull();
  });

  it("ramo inventado no armazenamento é ignorado", () => {
    memoria.set(
      "sistema-ti:ramo-por-conta",
      JSON.stringify([{ email: "a@x.com", ramo: "padaria" }])
    );
    expect(ramoLembrado("a@x.com")).toBeNull();
  });
});

/**
 * Trava do que a loja consegue usar.
 *
 * O ramo saiu da configuração da loja e virou o QUE FOI VENDIDO. Antes ele
 * morava no JSON de configurações, que a própria loja edita: quem contratou
 * mercearia podia se virar pizzaria sozinho e usar o que não pagou.
 *
 * Aqui está a parte da regra que vive no código. A outra metade é um gatilho
 * no banco (supabase-migracao-ramo-loja.sql), porque tela não é trava.
 */
describe("plano contratado", () => {
  beforeEach(() => memoria.clear());

  /** Mesma conta que o AppStore faz para decidir o que aparece */
  const ramoQueVale = (contratado: string | null, souSuperAdmin: boolean): string =>
    souSuperAdmin ? (lerRamoAparelho() ?? ramoDe(contratado)) : ramoDe(contratado);

  it("a loja vê o que contratou, e só isso", () => {
    expect(ramoQueVale("mercearia", false)).toBe("mercearia");
    expect(temModulo(ramoQueVale("mercearia", false), "pdv")).toBe(true);
    expect(temModulo(ramoQueVale("mercearia", false), "os")).toBe(false);
    expect(temModulo(ramoQueVale("mercearia", false), "mesas")).toBe(false);
  });

  it("escolher outro tipo na tela de entrada não libera nada para a loja", () => {
    // Sem esta regra bastaria clicar em "Pizzaria" antes de entrar para usar
    // o que não foi pago.
    definirRamoAparelho("pizzaria");
    expect(ramoQueVale("mercearia", false)).toBe("mercearia");
    expect(temModulo(ramoQueVale("mercearia", false), "mesas")).toBe(false);
  });

  it("o administrador do sistema continua conseguindo demonstrar", () => {
    definirRamoAparelho("pizzaria");
    expect(ramoQueVale("assistencia", true)).toBe("pizzaria");
  });

  it("loja sem ramo gravado continua na assistência", () => {
    // Toda loja criada antes deste campo. Nenhuma pode acordar sem as OS.
    expect(ramoQueVale(null, false)).toBe("assistencia");
    expect(temModulo(ramoQueVale(null, false), "os")).toBe(true);
  });

  it("ramo inventado no banco não vira passe livre", () => {
    expect(ramoQueVale("tudo", false)).toBe("assistencia");
    expect(temModulo(ramoQueVale("tudo", false), "pdv")).toBe(false);
  });

  it("cada plano entrega algo que nenhum outro entrega", () => {
    // Se dois planos fossem idênticos não haveria o que vender separado, e a
    // trava não faria sentido.
    //
    // Módulos E recursos contam: mercearia não tem tela exclusiva nenhuma —
    // ela divide o PDV com pizzaria e adega — e mesmo assim é um sistema
    // diferente, por causa da balança e da validade. Foi por isso que este
    // teste falhou na primeira escrita: a régua estava só nos módulos.
    for (const r of RAMOS) {
      const meu = [...RAMO_META[r].modulos, ...RAMO_META[r].recursos];
      const dosOutros = new Set(
        RAMOS.filter((x) => x !== r).flatMap((x) => [
          ...RAMO_META[x].modulos,
          ...RAMO_META[x].recursos,
        ])
      );
      expect(
        meu.some((item) => !dosOutros.has(item as never)),
        `${r} entrega exatamente o mesmo que os outros`
      ).toBe(true);
    }
  });
});
