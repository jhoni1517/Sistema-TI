import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { formatDate, formatDateTime } from "./format";

/**
 * O DIA 12 TEM QUE APARECER COMO 12.
 *
 * Relatado do balcão: "lanço uma coisa do dia 12 e ela aparece no dia 11".
 *
 * `new Date("2026-08-12")` é lido pelo JavaScript como MEIA-NOITE EM UTC.
 * No horário de Brasília (UTC-3) isso vira 21h do dia 11, e a tela mostra
 * 11/08. Valia para TODO campo que guarda só a data: vencimento de conta,
 * "cai no dia" da renda, validade do produto, nascimento do cliente.
 *
 * O erro caía para o lado que mais dói: a conta que vence dia 12 aparecia
 * vencendo dia 11, e quem pagasse no 11 acharia que estava adiantado.
 *
 * A regra da casa — data é texto AAAA-MM-DD e a conta é em UTC — já existia,
 * mas valia para o CÁLCULO. Ninguém tinha aplicado na EXIBIÇÃO, que é onde a
 * pessoa lê.
 */

describe("data pura aparece exatamente como foi guardada", () => {
  it("o caso relatado: dia 12 mostra 12", () => {
    expect(formatDate("2026-08-12")).toBe("12/08/2026");
    expect(formatDateTime("2026-08-12")).toBe("12/08/2026");
  });

  /**
   * As bordas do mês e do ano são onde o deslocamento de um dia vira
   * deslocamento de mês e de ano.
   */
  it("primeiro dia do mês não volta para o mês anterior", () => {
    expect(formatDate("2026-08-01")).toBe("01/08/2026");
    expect(formatDate("2026-03-01")).toBe("01/03/2026");
  });

  it("primeiro dia do ano não volta para o ano anterior", () => {
    expect(formatDate("2026-01-01")).toBe("01/01/2026");
  });

  it("29 de fevereiro continua 29 de fevereiro", () => {
    expect(formatDate("2028-02-29")).toBe("29/02/2028");
  });

  it("dia 31 continua 31", () => {
    expect(formatDate("2026-12-31")).toBe("31/12/2026");
  });

  /** Um ano inteiro, dia a dia: nenhum pode escorregar. */
  it("os 365 dias de 2026 aparecem certos", () => {
    const d = new Date(Date.UTC(2026, 0, 1));
    for (let i = 0; i < 365; i++) {
      const iso = d.toISOString().slice(0, 10);
      const [a, m, dia] = iso.split("-");
      expect(formatDate(iso), `dia ${iso}`).toBe(`${dia}/${m}/${a}`);
      d.setUTCDate(d.getUTCDate() + 1);
    }
  });
});

describe("carimbo com hora continua no horário de quem lê", () => {
  /**
   * Aqui converter É o certo: uma venda gravada às 13:00 UTC aconteceu às
   * 10:00 aqui, e 10:00 é o que a pessoa lembra. Converter só é errado
   * quando não existe hora nenhuma para converter.
   */
  it("mostra data e hora, sem quebrar", () => {
    const r = formatDateTime("2026-08-12T15:30:00.000Z");
    expect(r).toMatch(/^\d{2}\/\d{2}\/\d{4}/);
    expect(r).toMatch(/\d{2}:\d{2}/);
  });

  /** O carimbo do lançamento retroativo é meio-dia UTC justamente para
      sobreviver a qualquer fuso do Brasil sem trocar de dia. */
  it("lançamento retroativo ao meio-dia não troca de dia", () => {
    expect(formatDate("2026-08-12T12:00:00.000Z")).toBe("12/08/2026");
  });
});

describe("entrada ruim não vira data inventada", () => {
  it("vazio e lixo devolvem traço", () => {
    for (const v of ["", undefined, "abacaxi", "2026-13-45T99:99:99Z"]) {
      expect(formatDate(v as string)).toBe("-");
      expect(formatDateTime(v as string)).toBe("-");
    }
  });
});

/**
 * A REGRA, VARRENDO O CÓDIGO.
 *
 * `new Date(campoDeDataPura)` é a armadilha, e ela não está só no
 * `formatDate`: qualquer tela que faça isso volta a errar o dia. O teste lê
 * os arquivos do disco procurando a construção.
 *
 * Exceção se marca na linha com `// data-com-hora`, e o motivo ao lado — a
 * marca é a diferença entre decisão e descuido.
 */
describe("nenhuma tela constrói Date a partir de data pura", () => {
  const raiz = resolve(__dirname, "..");

  const arquivos: string[] = [];
  const varrer = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const caminho = join(dir, e.name);
      if (e.isDirectory()) varrer(caminho);
      else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
        arquivos.push(caminho);
      }
    }
  };
  varrer(raiz);

  it("achou os arquivos", () => {
    expect(arquivos.length).toBeGreaterThan(30);
  });

  it("nenhum `new Date(x.vencimento)` e parentes sem marca", () => {
    /*
     * Os campos que guardam SÓ a data. `new Date` em cima de qualquer um
     * deles desloca o dia inteiro no fuso do Brasil.
     */
    const camposDeDataPura =
      /new Date\(\s*[a-zA-Z_$][\w$.?]*\.(vencimento|validade|nascimento|dia|data)\s*\)/;

    const culpados: string[] = [];
    for (const arquivo of arquivos) {
      const linhas = readFileSync(arquivo, "utf8").split("\n");
      linhas.forEach((linha, i) => {
        if (!camposDeDataPura.test(linha)) return;
        if (linha.includes("data-com-hora")) return; // decisão marcada
        // `+ "T00:00:00Z"` é o jeito certo de ler data pura em UTC, e é o
        // que lib/contas.ts e lib/agenda.ts já fazem.
        if (linha.includes('T00:00:00Z')) return;
        culpados.push(`${arquivo.replace(raiz, "src")}:${i + 1}: ${linha.trim()}`);
      });
    }
    expect(culpados, "data pura virando Date sem marca").toEqual([]);
  });
});
