import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TETO_CATALOGO, vaiParaVitrine, publicaveis, foraDoCatalogo } from "./catalogo";
import type { Produto } from "./types";

/**
 * O teto da vitrine, que era invisível.
 *
 * A loja com 400 produtos publicava 300 e mandava o link achando que mandou
 * a loja inteira. Os outros 100 não existiam para quem abrisse — sem aviso
 * para ninguém.
 */

const produto = (x: Partial<Produto> = {}): Produto =>
  ({ id: "p", nome: "x", preco: 10, custo: 1, quantidade: 1, ...x }) as Produto;

const HOJE = "2026-08-27";

describe("quem entra na vitrine", () => {
  it("preço zerado fica de fora, igual ao SQL", () => {
    // `and coalesce(p.preco, 0) > 0` na função. Produto sem preço na vitrine
    // é o cliente perguntando quanto custa o que a loja nem vende.
    expect(vaiParaVitrine(produto({ preco: 0 }), HOJE)).toBe(false);
    expect(vaiParaVitrine(produto({ preco: 0.01 }), HOJE)).toBe(true);
  });

  it("vencido não vai para a vitrine em hipótese alguma", () => {
    expect(vaiParaVitrine(produto({ validade: "2026-08-26" }), HOJE)).toBe(false);
    // Vence hoje ainda está valendo hoje.
    expect(vaiParaVitrine(produto({ validade: "2026-08-27" }), HOJE)).toBe(true);
    expect(vaiParaVitrine(produto({ validade: "2026-12-31" }), HOJE)).toBe(true);
    expect(vaiParaVitrine(produto({ validade: undefined }), HOJE)).toBe(true);
  });
});

describe("o aviso de quem fica de fora", () => {
  const muitos = (n: number): Produto[] =>
    Array.from({ length: n }, (_, i) => produto({ id: `p${i}` }));

  it("cabendo tudo, não avisa nada", () => {
    // Aviso que aparece sempre é aviso que a pessoa aprende a ignorar.
    expect(foraDoCatalogo(muitos(1), HOJE)).toBe(0);
    expect(foraDoCatalogo(muitos(TETO_CATALOGO), HOJE)).toBe(0);
    expect(foraDoCatalogo([], HOJE)).toBe(0);
  });

  it("passando do teto, diz QUANTOS ficam de fora", () => {
    expect(foraDoCatalogo(muitos(TETO_CATALOGO + 1), HOJE)).toBe(1);
    expect(foraDoCatalogo(muitos(400), HOJE)).toBe(400 - TETO_CATALOGO);
  });

  it("quem já estava de fora não conta como sobra", () => {
    /*
     * O erro fácil aqui: contar o cadastro inteiro. A loja com 500 produtos
     * dos quais 300 são serviços sem preço e itens vencidos publicaria 200 —
     * e um aviso dizendo "200 ficam de fora" mandaria a pessoa procurar um
     * problema que não existe.
     */
    const lista = [
      ...Array.from({ length: TETO_CATALOGO }, (_, i) => produto({ id: `ok${i}` })),
      ...Array.from({ length: 50 }, (_, i) => produto({ id: `sem${i}`, preco: 0 })),
      ...Array.from({ length: 50 }, (_, i) =>
        produto({ id: `venc${i}`, validade: "2020-01-01" })
      ),
    ];
    expect(publicaveis(lista, HOJE).length).toBe(TETO_CATALOGO);
    expect(foraDoCatalogo(lista, HOJE)).toBe(0);
  });
});

describe("o teto daqui é o mesmo do banco", () => {
  it("TETO_CATALOGO bate com o limit da função SQL", () => {
    /*
     * Os dois números existem em lugares diferentes porque a função é SQL e
     * o aviso é tela. Divergindo, o aviso mente: ou fala de produto que
     * está publicado, ou cala sobre produto que não está.
     *
     * O teste LÊ a migração do disco em vez de recopiar o número — cópia
     * dentro de teste envelhece igual e os dois passam a mentir juntos.
     */
    const sql = readFileSync(
      join(__dirname, "..", "..", "supabase-migracao-catalogo.sql"),
      "utf8"
    );
    // O `limit` da VITRINE, e não o `limit 1` da busca da loja logo acima:
    // ancorado no `order by` que ordena os produtos disponíveis primeiro.
    const doBanco = sql.match(/order by \(coalesce\(p\.servico[\s\S]{0,120}?limit\s+(\d+)/i)?.[1];
    expect(doBanco, "não achei o limit da vitrine na migração").toBeTruthy();
    expect(Number(doBanco)).toBe(TETO_CATALOGO);
  });
});
