import { describe, it } from "vitest";
import { paraTodo, relato, type Gerador } from "./fuzz";
import { aposBaixa, aposRetorno, saldosApos, grama, faltaNoEstoque } from "./estoque";
import type { Produto } from "./types";

/**
 * CONSERVAÇÃO: o que sai mais o que fica é o que tinha.
 *
 * É a pergunta que a contagem de prateleira faz, e é a única que pega a
 * classe de bug que este sistema mais sofreu — mercadoria que some do mapa
 * sem deixar rastro. Um `Math.max(0, ...)` esquecido não quebra teste
 * nenhum: ele devolve um número plausível. Só a conta de conservação
 * denuncia, porque o total deixa de fechar.
 */

const conferir = (r: ReturnType<typeof paraTodo>) => {
  if (r.ok) return;
  throw new Error(relato(r));
};

const produto = (g: Gerador, id = `p${g.inteiro(1, 5)}`): Produto =>
  ({
    id,
    nome: `Produto ${id}`,
    quantidade: g.quantidade(),
    preco: g.dinheiro(),
    custo: g.dinheiro(),
    servico: g.chance(0.15),
  }) as Produto;

describe("baixa e retorno", () => {
  /**
   * IDA E VOLTA VOLTA AO MESMO LUGAR.
   *
   * Vender e devolver na mesma hora tem que deixar a prateleira como
   * estava. Se não voltar, a diferença some: não falta na contagem porque
   * o sistema "acha" que está certo, e ninguém procura.
   */
  it("dar baixa e devolver a mesma quantidade volta ao saldo original", () => {
    conferir(
      paraTodo(
        8000,
        (g) => ({ p: produto(g), q: g.quantidade() }),
        ({ p, q }) => {
          const depoisDaBaixa = aposBaixa(p, q);
          const devolvido = aposRetorno({ ...p, quantidade: depoisDaBaixa } as Produto, q);
          const original = grama(Number(p.quantidade) || 0);
          return devolvido === original || `${original} -> ${depoisDaBaixa} -> ${devolvido}`;
        }
      )
    );
  });

  /**
   * NEGATIVO É INFORMAÇÃO, NÃO ERRO.
   *
   * Está no CLAUDE.md e custou quatro telas: `Math.max(0, ...)` parece
   * proteção e é o contrário. Vender 3 de um item que o sistema acha que
   * tem 1 tem que deixar -2, senão as duas unidades que saíram sem nunca
   * ter entrado somem do mapa.
   */
  it("saldo fica negativo quando sai mais do que tem", () => {
    conferir(
      paraTodo(
        5000,
        (g) => ({ tinha: g.inteiro(0, 10), sai: g.inteiro(11, 30) }),
        ({ tinha, sai }) => {
          const p = { id: "x", quantidade: tinha, servico: false } as Produto;
          const r = aposBaixa(p, sai);
          return r === grama(tinha - sai) || `tinha ${tinha}, saiu ${sai}, ficou ${r}`;
        }
      )
    );
  });

  /** Serviço não tem estoque — nem para baixo, nem para cima. */
  it("serviço nunca muda de saldo", () => {
    conferir(
      paraTodo(
        5000,
        (g) => ({ p: { ...produto(g), servico: true } as Produto, q: g.quantidade() }),
        ({ p, q }) => {
          const antes = Number(p.quantidade) || 0;
          return (
            (aposBaixa(p, q) === antes && aposRetorno(p, q) === antes) ||
            `mudou: ${antes} -> ${aposBaixa(p, q)} / ${aposRetorno(p, q)}`
          );
        }
      )
    );
  });

  it("nunca devolve NaN nem dízima de ponto flutuante", () => {
    conferir(
      paraTodo(
        8000,
        (g) => ({ p: produto(g), q: g.quantidade() }),
        ({ p, q }) => {
          const b = aposBaixa(p, q);
          const r = aposRetorno(p, q);
          if (!Number.isFinite(b) || !Number.isFinite(r)) return `b=${b} r=${r}`;
          return (grama(b) === b && grama(r) === r) || `dízima: ${b} / ${r}`;
        }
      )
    );
  });
});

describe("saldos de uma venda inteira", () => {
  /**
   * O MESMO PRODUTO EM DUAS LINHAS DESCE AS DUAS.
   *
   * É o bug que `saldosApos` existe para evitar, e é invisível: vende duas
   * fontes e desce uma, com o carrinho na tela mostrando as duas linhas
   * certas. Aqui o gerador repete produto de propósito.
   */
  it("linhas repetidas do mesmo produto somam", () => {
    conferir(
      paraTodo(
        4000,
        (g) => {
          // Poucos ids para garantir repetição
          const produtos = ["p1", "p2", "p3"].map((id) => ({
            ...produto(g, id),
            servico: false,
          })) as Produto[];
          const itens = Array.from({ length: g.inteiro(1, 8) }, () => ({
            produtoId: g.de(["p1", "p2", "p3"]),
            quantidade: g.quantidade(),
          }));
          return { produtos, itens };
        },
        ({ produtos, itens }) => {
          const saldos = saldosApos(itens, produtos, "baixa");

          // Uma gravação por produto, nunca duas.
          const ids = saldos.map((s) => s.produto.id);
          if (new Set(ids).size !== ids.length) return `produto repetido: ${ids.join(",")}`;

          // E o saldo bate com a soma de TODAS as linhas daquele produto.
          for (const s of saldos) {
            const somaDasLinhas = itens
              .filter((i) => i.produtoId === s.produto.id)
              .reduce((t, i) => t + (Number(i.quantidade) || 0), 0);
            const esperado = grama((Number(s.produto.quantidade) || 0) - somaDasLinhas);
            if (s.quantidade !== esperado) {
              return `${s.produto.id}: esperado ${esperado}, veio ${s.quantidade}`;
            }
          }
          return true;
        }
      )
    );
  });

  /** Baixar a venda e depois devolvê-la inteira volta ao estoque original. */
  it("venda seguida de devolução total não muda o estoque", () => {
    conferir(
      paraTodo(
        4000,
        (g) => {
          const produtos = ["p1", "p2", "p3"].map((id) => ({
            ...produto(g, id),
            servico: false,
          })) as Produto[];
          const itens = Array.from({ length: g.inteiro(1, 6) }, () => ({
            produtoId: g.de(["p1", "p2", "p3"]),
            quantidade: g.quantidade(),
          }));
          return { produtos, itens };
        },
        ({ produtos, itens }) => {
          const baixados = saldosApos(itens, produtos, "baixa");
          const intermediario = produtos.map((p) => {
            const achou = baixados.find((b) => b.produto.id === p.id);
            return achou ? ({ ...p, quantidade: achou.quantidade } as Produto) : p;
          });
          const voltados = saldosApos(itens, intermediario, "retorno");

          for (const v of voltados) {
            const original = produtos.find((p) => p.id === v.produto.id);
            const esperado = grama(Number(original?.quantidade) || 0);
            if (v.quantidade !== esperado) {
              return `${v.produto.id}: voltou para ${v.quantidade}, era ${esperado}`;
            }
          }
          return true;
        }
      )
    );
  });

  /** Serviço nunca entra na lista de gravação: não tem o que gravar. */
  it("serviço nunca aparece nos saldos", () => {
    conferir(
      paraTodo(
        3000,
        (g) => {
          const produtos = ["p1", "p2"].map((id) => ({
            ...produto(g, id),
            servico: true,
          })) as Produto[];
          const itens = Array.from({ length: g.inteiro(1, 5) }, () => ({
            produtoId: g.de(["p1", "p2"]),
            quantidade: g.quantidade(),
          }));
          return { produtos, itens };
        },
        ({ produtos, itens }) => {
          const s = saldosApos(itens, produtos, "baixa");
          return s.length === 0 || `gravaria ${s.length} serviço(s)`;
        }
      )
    );
  });

  /** Produto que não está no cadastro não pode virar gravação fantasma. */
  it("item sem produto correspondente é ignorado", () => {
    conferir(
      paraTodo(
        3000,
        (g) => ({
          itens: Array.from({ length: g.inteiro(1, 5) }, () => ({
            produtoId: `fantasma${g.inteiro(1, 99)}`,
            quantidade: g.quantidade(),
          })),
        }),
        ({ itens }) => {
          const s = saldosApos(itens, [], "baixa");
          return s.length === 0 || `inventou ${s.length} gravação(ões)`;
        }
      )
    );
  });
});

describe("aviso de falta", () => {
  /**
   * Quem o aviso lista tem que ser exatamente quem vai ficar negativo.
   *
   * Avisar de menos deixa o furo passar; avisar de mais faz a pessoa
   * aprender a ignorar o aviso — que dá no mesmo, mais devagar.
   */
  it("lista exatamente os que ficam negativos", () => {
    conferir(
      paraTodo(
        4000,
        (g) => {
          const produtos = ["p1", "p2", "p3"].map((id) => ({
            ...produto(g, id),
            servico: false,
          })) as Produto[];
          const itens = Array.from({ length: g.inteiro(1, 6) }, () => ({
            produtoId: g.de(["p1", "p2", "p3"]),
            quantidade: g.quantidade(),
          }));
          return { produtos, itens };
        },
        ({ produtos, itens }) => {
          const avisados = faltaNoEstoque(itens, produtos).map((f) => f.produto.id).sort();
          const negativos = saldosApos(itens, produtos, "baixa")
            .filter((s) => s.quantidade < 0)
            .map((s) => s.produto.id)
            .sort();
          return (
            JSON.stringify(avisados) === JSON.stringify(negativos) ||
            `avisou [${avisados}] e ficam negativos [${negativos}]`
          );
        }
      )
    );
  });
});
