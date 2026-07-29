import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Trava do bug que fez a tela abrir zerada.
 *
 * O carregamento usava Promise.all para ler todas as tabelas de uma vez.
 * Promise.all rejeita no PRIMEIRO erro e descarta todos os outros
 * resultados — então uma tabela nova, cuja migração ainda não tinha sido
 * rodada, apagava clientes, estoque, caixa e o nome da loja da tela ao mesmo
 * tempo. E o catch só escrevia no console: nenhum aviso, tela idêntica à de
 * um sistema que perdeu os dados.
 *
 * Este teste lê o arquivo do disco em vez de exercitar o componente porque
 * o que precisa ser garantido é a ESCOLHA — allSettled, e falha visível.
 */
const store = readFileSync(
  resolve(__dirname, "..", "store", "AppStore.tsx"),
  "utf8"
);

describe("carregamento dos dados", () => {
  it("usa allSettled: uma tabela com problema não derruba as outras", () => {
    expect(store).toContain("Promise.allSettled");
  });

  it("não voltou a usar Promise.all na carga", () => {
    // Promise.all em qualquer lugar do arquivo é suspeito o bastante para
    // parar o build e obrigar a olhar.
    expect(/Promise\.all\s*\(/.test(store)).toBe(false);
  });

  it("falha de carga aparece na tela, não só no console", () => {
    expect(store).toContain("setErroCarga");
    expect(store).toMatch(/aviso\.erro/);
  });

  it("o estado de erro é exposto para as telas", () => {
    // Sem isso não há como diferenciar "está vazio" de "não carregou".
    expect(store).toMatch(/erroCarga:\s*string/);
  });
});

describe("erro de leitura do banco", () => {
  const db = readFileSync(resolve(__dirname, "db.ts"), "utf8");

  it("tabela que não existe vira instrução de rodar a migração", () => {
    expect(db).toContain("42P01");
    expect(db).toMatch(/migração/i);
  });

  it("a leitura passa pelo tradutor, e não devolve o erro cru do PostgREST", () => {
    expect(db).toContain("traduzirErroLeitura");
  });
});
