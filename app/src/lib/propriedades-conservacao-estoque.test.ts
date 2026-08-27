import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { aposBaixa, aposRetorno, saldosApos, deltasApos, faltaNoEstoque, grama } from "./estoque";
import type { Produto } from "./types";

function semente(s: number) {
  let x = s >>> 0 || 1;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
}
const r = semente(161803398);

/** O campo do saldo chama `quantidade`. `estoqueMinimo` é outra coisa. */
const produto = (x: Partial<Produto> = {}): Produto =>
  ({ id: "p", nome: "x", preco: 10, custo: 5, quantidade: 0, estoqueMinimo: 0, ...x }) as Produto;

describe("Propriedades do estoque: negativo é informação, não erro", () => {
  it("baixar 3 de quem tem 1 deixa -2, e NUNCA zero", () => {
    /*
     * O bug: quatro telas desciam com `Math.max(0, ...)`. O zero parece
     * proteção e é o contrário — as duas unidades que saíram sem nunca ter
     * entrado sumiam do mapa. Nada para procurar, nada para a contagem
     * achar, e o detector de negativo da conferência nunca disparava numa
     * venda, que é onde o problema nasce.
     */
    expect(aposBaixa(produto({ quantidade: 1 }), 3)).toBe(-2);
    for (let i = 0; i < 20000; i++) {
      const tem = Math.round((r() * 200 - 100) * 1000) / 1000;
      const sai = Math.round(r() * 300 * 1000) / 1000;
      expect(aposBaixa(produto({ quantidade: tem }), sai), `caso ${i}`).toBeCloseTo(tem - sai, 3);
    }
  });

  it("baixar e devolver a mesma quantidade volta ao ponto de partida", () => {
    // Conservação: o que sai e volta não pode deixar resto. Um milésimo por
    // operação vira quilo perdido no fim do mês.
    for (let i = 0; i < 20000; i++) {
      const tem = Math.round((r() * 400 - 200) * 1000) / 1000;
      const q = Math.round(r() * 300 * 1000) / 1000;
      const ida = aposBaixa(produto({ quantidade: tem }), q);
      const volta = aposRetorno(produto({ quantidade: ida }), q);
      expect(volta, `caso ${i}`).toBeCloseTo(tem, 3);
    }
  });

  it("o MESMO produto em duas linhas desce as duas, e não só a última", () => {
    /*
     * O laço ingênuo lia a lista de produtos da tela, que só é atualizada
     * no fim: com o mesmo produto em duas linhas, a segunda volta calculava
     * em cima do saldo velho e sobrescrevia a primeira. Vende duas fontes,
     * desce uma — e a que não desceu vira lucro invisível.
     *
     * Acontece mais do que parece: a peça entra duas vezes quando o
     * atendente digita o nome numa linha e escolhe da lista na outra.
     */
    for (let i = 0; i < 20000; i++) {
      const tem = Math.round(r() * 100 * 1000) / 1000;
      const a = Math.round(r() * 20 * 1000) / 1000;
      const b = Math.round(r() * 20 * 1000) / 1000;
      const p = produto({ id: "p1", quantidade: tem });
      const saidas = saldosApos(
        [
          { produtoId: "p1", quantidade: a },
          { produtoId: "p1", quantidade: b },
        ],
        [p]
      );
      expect(saidas.length, `caso ${i}: uma gravação por produto`).toBe(1);
      expect(saidas[0].quantidade, `caso ${i}`).toBeCloseTo(tem - a - b, 3);
    }
  });

  it("serviço não tem estoque, e produto fora do cadastro não vira gravação fantasma", () => {
    /*
     * `Produto.servico` existe porque o atendente digitava 99999999999 na
     * quantidade para o item não ficar vermelho, e o valor do estoque foi
     * para a casa dos trilhões.
     */
    const servico = produto({ id: "s", servico: true, quantidade: 0 });
    for (let i = 0; i < 5000; i++) {
      const itens = [
        { produtoId: "s", quantidade: Math.ceil(r() * 50) },
        { produtoId: "nao-existe", quantidade: Math.ceil(r() * 50) },
      ];
      expect(saldosApos(itens, [servico]), `caso ${i}`).toEqual([]);
      expect(deltasApos(itens, [servico]), `caso ${i}`).toEqual([]);
      expect(faltaNoEstoque(itens, [servico]), `caso ${i}`).toEqual([]);
    }
  });

  it("deltas e saldos contam a MESMA história", () => {
    // Duas contas para o mesmo fato é o começo de duas verdades.
    for (let i = 0; i < 10000; i++) {
      const produtos: Produto[] = Array.from({ length: 1 + Math.floor(r() * 4) }, (_, k) =>
        produto({ id: `p${k}`, quantidade: Math.round(r() * 100 * 1000) / 1000 })
      );
      const itens = produtos.map((p) => ({
        produtoId: p.id,
        quantidade: Math.round((0.001 + r() * 10) * 1000) / 1000,
      }));
      const saldos = saldosApos(itens, produtos);
      const deltas = deltasApos(itens, produtos);
      expect(saldos.length, `caso ${i}`).toBe(deltas.length);
      for (const s of saldos) {
        const d = deltas.find((x) => x.produto.id === s.produto.id)!;
        expect(s.produto.quantidade + d.delta, `caso ${i} ${s.produto.id}`).toBeCloseTo(
          s.quantidade,
          3
        );
      }
    }
  });

  it("delta zero não vira ida ao banco — a função do banco recusa", () => {
    expect(deltasApos([{ produtoId: "p1", quantidade: 0 }], [produto({ id: "p1", quantidade: 5 })])).toEqual([]);
  });

  it("a lista do que vai ficar negativo bate com o saldo depois", () => {
    // É a última chance de ver antes de gravar. Ela não bloqueia nada: a
    // mercadoria já está na mão do cliente.
    for (let i = 0; i < 10000; i++) {
      const p = produto({ id: "p1", quantidade: Math.round((r() * 40 - 10) * 1000) / 1000 });
      const q = Math.round((0.001 + r() * 60) * 1000) / 1000;
      const faltas = faltaNoEstoque([{ produtoId: "p1", quantidade: q }], [p]);
      const [saldo] = saldosApos([{ produtoId: "p1", quantidade: q }], [p]);
      if (saldo.quantidade < 0) {
        expect(faltas.length, `caso ${i}`).toBe(1);
        expect(faltas[0].sobra, `caso ${i}`).toBeCloseTo(saldo.quantidade, 3);
      } else {
        expect(faltas, `caso ${i}`).toEqual([]);
      }
    }
  });

  it("peso arredonda em GRAMA, e não em centavo", () => {
    // 0,001 kg é a menor unidade que a balança manda. Arredondar em duas
    // casas transformaria 250 g em 0,25 kg toda vez que passasse por aqui.
    for (let i = 0; i < 10000; i++) {
      const v = r() * 100;
      expect(Math.abs(grama(v) - v), `caso ${i}`).toBeLessThanOrEqual(0.0005);
    }
    expect(grama(0.2505)).toBe(0.251);
  });

  it("nenhuma tela GRAVA estoque zerado à força", () => {
    /*
     * A regra já foi quebrada em QUATRO telas. Regra escrita não segura
     * nada: o que segura é o teste que lê o código do disco.
     *
     * A busca é por GRAVAÇÃO (`quantidade: Math.max(0, ...)`), e não por
     * qualquer `Math.max(0, ...)` perto da palavra estoque. A primeira
     * versão desta sonda era larga assim e acusou `custoMedio` em
     * entrada.ts, que é legítimo: estoque negativo ali inverteria a média
     * ponderada e produziria um custo maior que o da própria nota.
     */
    const raiz = join(__dirname, "..");
    const suspeitos: string[] = [];
    const varrer = (dir: string) => {
      for (const f of readdirSync(dir, { withFileTypes: true })) {
        const caminho = join(dir, f.name);
        if (f.isDirectory()) varrer(caminho);
        else if (/\.tsx?$/.test(f.name) && !f.name.includes(".test.")) {
          if (caminho.endsWith("lib/estoque.ts")) continue;
          for (const linha of readFileSync(caminho, "utf8").split("\n")) {
            if (/\bquantidade\s*:\s*Math\.max\(\s*0\s*,/.test(linha)) {
              suspeitos.push(`${caminho}: ${linha.trim()}`);
            }
          }
        }
      }
    };
    varrer(raiz);
    expect(suspeitos).toEqual([]);
  });
});
