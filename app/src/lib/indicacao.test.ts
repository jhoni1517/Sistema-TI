import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  normalizarCodigo,
  codigoValido,
  linkDeIndicacao,
  mensagemDeIndicacao,
  mensagemQueroPorIndicacao,
  situacaoIndicada,
  resumoIndicacoes,
} from "./indicacao";

describe("indicação", () => {
  it("código normalizado como o banco guarda", () => {
    expect(normalizarCodigo(" ab-2c 3d ")).toBe("AB2C3D");
    expect(codigoValido("ab2c3d")).toBe(true);
    expect(codigoValido("AB0C1D")).toBe(false); // 0 e 1 não existem no sorteio
    expect(codigoValido("ABC")).toBe(false);
  });

  it("link e recados", () => {
    expect(linkDeIndicacao("https://x.app/", "ab2c3d")).toBe("https://x.app/#/indicar/AB2C3D");
    expect(linkDeIndicacao("https://x.app/", "")).toBe("");
    const m = mensagemDeIndicacao("Silva Cell ", "LINK");
    expect(m).toMatch(/da Silva Cell\./);
    expect(m).toMatch(/30 dias a mais/);
    expect(m.endsWith("LINK")).toBe(true);
    expect(mensagemQueroPorIndicacao("Silva Cell", "ab2c3d")).toMatch(/código AB2C3D/);
  });

  it("situação desconhecida vira 'testando', nunca 'pagou'", () => {
    expect(situacaoIndicada("pagou")).toBe("pagou");
    expect(situacaoIndicada("xyz")).toBe("em_teste");
  });

  it("resumo em voz de balcão", () => {
    expect(resumoIndicacoes([])).toMatch(/Nenhuma/);
    expect(resumoIndicacoes([{ situacao: "pagou" }, { situacao: "em_teste" }])).toBe(
      "2 lojas entraram pelo seu link, 1 pagou: 1 mês ganho."
    );
  });

  it("sem emoji nos recados", () => {
    const fonte = readFileSync(new URL("./indicacao.ts", import.meta.url), "utf8");
    expect(/[\u{1F300}-\u{1FAFF}]/u.test(fonte)).toBe(false);
  });
});

describe("o bônus é do banco", () => {
  const sql = readFileSync(new URL("../../supabase-migracao-indicacao.sql", import.meta.url), "utf8");
  it("o mês de quem indicou cai uma vez só, marcado antes do crédito", () => {
    const f = sql.slice(sql.indexOf("create or replace function bonus_de_indicacao"));
    expect(f.indexOf("bonus_indicacao_em = now()")).toBeLessThan(f.indexOf("interval '1 month'"));
    expect(f).toMatch(/where id = new\.id and bonus_indicacao_em is null/);
  });
  it("a trava da assinatura cobre as colunas da indicação", () => {
    const f = sql.slice(sql.indexOf("create or replace function protege_assinatura_loja"));
    for (const c of ["indicada_por", "indicada_em", "bonus_indicacao_em", "codigo_indicacao"]) expect(f).toContain(`new.${c}`);
  });
  it("não usa o próprio código nem usa duas vezes", () => {
    expect(sql).toMatch(/v_quem = v_minha\.id/);
    expect(sql).toMatch(/v_minha\.indicada_por is not null/);
  });
});
