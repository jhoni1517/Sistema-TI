import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { FUNDOS, fundoValido } from "./themes";
import { SO_NO_APARELHO } from "./config";

/*
 * Cada fundo da lista precisa existir em três lugares: aqui, no index.css
 * (claro E escuro) e no script do index.html que aplica antes da primeira
 * pintura. Esquecer o CSS deixa o botão sem efeito; esquecer o escuro deixa
 * letra clara em fundo claro. Este teste lê os arquivos do disco.
 */
const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");
const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

describe("fundos", () => {
  for (const f of FUNDOS.filter((x) => x.k !== "balcao")) {
    it(`${f.k} tem claro, escuro e menu`, () => {
      expect(css).toContain(`:root[data-fundo="${f.k}"] {\n  --papel`);
      expect(css).toContain(`:root.dark[data-fundo="${f.k}"] {\n  --papel`);
      expect(css).toContain(`:root[data-fundo="${f.k}"] {\n  --menu:`);
      expect(html).toMatch(new RegExp(`\\|?${f.k}\\|?`));
    });
  }

  it("fundo desconhecido vale o Balcão", () => {
    expect(fundoValido("xyz")).toBe("balcao");
    expect(fundoValido(undefined)).toBe("balcao");
    expect(fundoValido("lavanda")).toBe("lavanda");
  });

  it("é aparência do aparelho, não sobe para a nuvem", () => {
    expect(SO_NO_APARELHO).toContain("fundo");
  });
});
