import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * A regra de preço é uma só, e toda tela obedece.
 *
 * `precoEfetivo` aplica a promoção com prazo. Ele manda no PDV, na etiqueta
 * da balança, na etiqueta de prateleira e no catálogo público — e a mesma
 * conta existe em SQL, porque a página pública calcula sozinha.
 *
 * A regra está escrita no CLAUDE.md desde que a promoção foi criada, e mesmo
 * assim a entrada manual do Caixa lia `produto.preco` direto. Um produto em
 * promoção era anunciado por um valor na gôndola e cobrado por outro no
 * balcão — e quem aparece como mentiroso é a loja, não o sistema.
 *
 * Este teste varre as telas e reprova quem ler o preço cru de um produto.
 */

const RAIZ = new URL("../..", import.meta.url).pathname;

/**
 * Ler `.preco` de um produto é lícito em dois lugares: onde ele é EDITADO
 * (o cadastro precisa mostrar o valor cheio) e dentro do próprio cálculo da
 * promoção. Nos dois casos a linha é marcada.
 */
const PERMITIDO = "preco-cru-proposital";

/** Arquivos onde a leitura crua é a função do arquivo */
const FORA = ["promocao.ts", "etiqueta.ts", "types.ts"];

function arquivos(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === "dist" || nome.startsWith(".")) continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivos(caminho, achados);
    else if (/\.tsx?$/.test(nome) && !nome.includes(".test.") && !FORA.includes(nome)) {
      achados.push(caminho);
    }
  }
  return achados;
}

/**
 * Procura multiplicação ou soma usando o preço cru de um produto — que é
 * sempre um cálculo de quanto cobrar, e sempre precisa da promoção.
 */
export function precoCru(codigo: string): string[] {
  return codigo
    .split("\n")
    .map((linha, i) => ({ linha, n: i + 1 }))
    .filter(({ linha }) => {
      if (linha.includes(PERMITIDO)) return false;
      // (p.preco || 0) * quantidade  /  prod.preco * qtd  /  x.preco *
      return /\b\w+\.preco\b\s*(\|\|\s*0\s*\))?\s*[*+]/.test(linha);
    })
    .map(({ linha, n }) => `${n}: ${linha.trim()}`);
}

describe("a regra de preço é uma só", () => {
  it("o detector acha a leitura crua", () => {
    // Sem isto, um erro no padrão faria o teste de baixo passar sempre.
    expect(precoCru("setValor((p.preco || 0) * quantidade);")).toHaveLength(1);
    expect(precoCru("const t = prod.preco * qtd;")).toHaveLength(1);
  });

  it("o detector aceita precoEfetivo", () => {
    expect(precoCru("setValor(precoEfetivo(p) * quantidade);")).toEqual([]);
  });

  it("o detector aceita a linha marcada de propósito", () => {
    expect(precoCru("const v = p.preco * 1; // preco-cru-proposital")).toEqual([]);
  });

  it("nenhuma tela calcula quanto cobrar com o preço cru", () => {
    const achados = arquivos(join(RAIZ, "src")).flatMap((f) =>
      precoCru(readFileSync(f, "utf8")).map((l) => `${f.replace(RAIZ, "")}:${l}`)
    );
    expect(achados).toEqual([]);
  });
});
