import { describe, it, expect } from "vitest";
import { paraTodo, relato, type Gerador } from "./fuzz";
import {
  centavos,
  subtotalItem,
  subtotalVenda,
  totalVenda,
  custoVenda,
  lucroVenda,
  trocoDe,
  faltaPara,
  adicionar,
} from "./pdv";
import {
  totalPago,
  faltaNoPagamento,
  trocoDoPagamento,
  consolidar,
  type Parcela,
} from "./pagamento";
import type { ItemVenda, FormaPagamento } from "./types";

/**
 * Teste por PROPRIEDADE: o gerador escolhe a entrada, eu escolho a regra.
 *
 * Os 1300 testes desta base testam o caso que alguém pensou. O que sobra é
 * o que ninguém pensou — peso de 0,352 kg, desconto maior que o carrinho,
 * preço negativo que entrou por um campo mal validado. Aqui o computador
 * inventa os casos e eu cobro a verdade que tem que valer sempre.
 *
 * Semente fixa: reprovou hoje, reprova amanhã, e o caso vai para um teste.
 */

const item = (g: Gerador): ItemVenda =>
  ({
    produtoId: `p${g.inteiro(1, 9)}`,
    descricao: `Produto ${g.inteiro(1, 9)}`,
    quantidade: g.quantidade(),
    precoUnit: g.dinheiro(),
    custoUnit: g.dinheiro(),
  }) as ItemVenda;

const carrinho = (g: Gerador): ItemVenda[] =>
  Array.from({ length: g.inteiro(0, 8) }, () => item(g));

const FORMAS: FormaPagamento[] = ["dinheiro", "pix", "debito", "credito", "vale_refeicao"];

const parcela = (g: Gerador): Parcela => {
  const valor = g.dinheiro();
  const forma = g.de(FORMAS);
  return {
    forma,
    valor,
    // Só dinheiro tem "recebido": é o que a pessoa põe na mão do caixa.
    ...(forma === "dinheiro" && g.chance(0.5) ? { recebido: valor + g.dinheiro() } : {}),
  } as Parcela;
};

const conferir = (r: ReturnType<typeof paraTodo>) => {
  if (r.ok) return;
  throw new Error(relato(r));
};

describe("centavos: a base de toda conta de dinheiro", () => {
  it("é idempotente — arredondar de novo não muda nada", () => {
    conferir(
      paraTodo(
        5000,
        (g) => g.dinheiro(),
        (v) => centavos(v) === centavos(centavos(v)) || `${v}: ${centavos(v)} != ${centavos(centavos(v))}`
      )
    );
  });

  it("nunca devolve -0 (imprime como '-0,00' no cupom)", () => {
    conferir(
      paraTodo(
        5000,
        (g) => g.dinheiro(),
        (v) => !Object.is(centavos(v), -0) || `${v} virou -0`
      )
    );
  });

  it("nunca devolve NaN, nem para lixo", () => {
    const lixos = [NaN, Infinity, -Infinity, undefined, null, "", "abc", {}, []];
    for (const l of lixos) {
      expect(Number.isFinite(centavos(l as number)), `centavos(${JSON.stringify(l)})`).toBe(true);
    }
  });
});

describe("o total da venda", () => {
  /**
   * A ORDEM DOS ITENS NÃO PODE MUDAR O TOTAL.
   *
   * Parece óbvio e não é: cada linha é arredondada antes de somar, e
   * arredondamento não é associativo. Se quebrar, o mesmo carrinho fecha por
   * valores diferentes conforme a ordem em que o operador bipou — e ninguém
   * nunca ia desconfiar disso.
   */
  it("não muda se os itens forem bipados noutra ordem", () => {
    conferir(
      paraTodo(
        3000,
        (g) => {
          const itens = carrinho(g);
          const invertido = [...itens].reverse();
          return { itens, invertido, desconto: g.dinheiro() };
        },
        ({ itens, invertido, desconto }) => {
          const a = totalVenda({ itens, desconto } as never);
          const b = totalVenda({ itens: invertido, desconto } as never);
          return a === b || `${a} != ${b}`;
        }
      )
    );
  });

  it("nunca é negativo, nem com desconto maior que o carrinho", () => {
    conferir(
      paraTodo(
        5000,
        (g) => ({ itens: carrinho(g), desconto: g.dinheiro() }),
        (v) => {
          const t = totalVenda(v as never);
          return t >= 0 || `total ${t}`;
        }
      )
    );
  });

  it("é sempre um valor de dinheiro fechado, sem dízima", () => {
    conferir(
      paraTodo(
        5000,
        (g) => ({ itens: carrinho(g), desconto: g.dinheiro() }),
        (v) => {
          const t = totalVenda(v as never);
          return Number.isFinite(t) && centavos(t) === t ? true : `total ${t}`;
        }
      )
    );
  });

  it("carrinho vazio custa zero", () => {
    conferir(
      paraTodo(
        500,
        (g) => g.dinheiro(),
        (desconto) => totalVenda({ itens: [], desconto } as never) === 0
      )
    );
  });

  /** Somar as linhas de outro jeito tem que dar o mesmo. */
  it("o subtotal é a soma das linhas", () => {
    conferir(
      paraTodo(
        3000,
        (g) => carrinho(g),
        (itens) => {
          const soma = centavos(itens.reduce((s, i) => s + subtotalItem(i), 0));
          const sub = subtotalVenda(itens);
          return soma === sub || `${soma} != ${sub}`;
        }
      )
    );
  });

  it("lucro é sempre total menos custo, sem sobra de arredondamento", () => {
    conferir(
      paraTodo(
        3000,
        (g) => ({ itens: carrinho(g), desconto: g.dinheiro() }),
        (v) => {
          const esperado = centavos(totalVenda(v as never) - custoVenda(v.itens));
          const obtido = lucroVenda(v as never);
          return esperado === obtido || `${esperado} != ${obtido}`;
        }
      )
    );
  });
});

describe("troco e falta", () => {
  /**
   * OS DOIS NUNCA PODEM SER MAIORES QUE ZERO AO MESMO TEMPO.
   *
   * A tela mostra os dois campos. "Falta R$ 5" e "Troco R$ 3" juntos é o
   * caixa sem saber se pega ou devolve dinheiro, com a fila esperando.
   */
  it("nunca aparecem juntos", () => {
    conferir(
      paraTodo(
        5000,
        (g) => ({ total: g.dinheiro(), recebido: g.chance(0.15) ? undefined : g.dinheiro() }),
        ({ total, recebido }) => {
          const t = trocoDe(total, recebido);
          const f = faltaPara(total, recebido);
          return !(t > 0 && f > 0) || `troco ${t} e falta ${f}`;
        }
      )
    );
  });

  it("nenhum dos dois é negativo", () => {
    conferir(
      paraTodo(
        5000,
        (g) => ({ total: g.dinheiro(), recebido: g.chance(0.15) ? undefined : g.dinheiro() }),
        ({ total, recebido }) =>
          (trocoDe(total, recebido) >= 0 && faltaPara(total, recebido) >= 0) ||
          `troco ${trocoDe(total, recebido)} falta ${faltaPara(total, recebido)}`
      )
    );
  });

  /** recebido - total = troco - falta, para todo total positivo. */
  it("fecham a conta entre si", () => {
    conferir(
      paraTodo(
        5000,
        (g) => ({ total: Math.abs(g.dinheiro()), recebido: Math.abs(g.dinheiro()) }),
        ({ total, recebido }) => {
          const esquerda = centavos(recebido - total);
          const direita = centavos(trocoDe(total, recebido) - faltaPara(total, recebido));
          return esquerda === direita || `${esquerda} != ${direita}`;
        }
      )
    );
  });
});

describe("venda dividida em várias formas", () => {
  it("a soma das parcelas é o total pago, em qualquer ordem", () => {
    conferir(
      paraTodo(
        3000,
        (g) => {
          const p = Array.from({ length: g.inteiro(0, 5) }, () => parcela(g));
          return { p, invertido: [...p].reverse() };
        },
        ({ p, invertido }) => {
          const a = totalPago(p);
          const b = totalPago(invertido);
          return a === b || `${a} != ${b}`;
        }
      )
    );
  });

  it("falta nunca é negativa", () => {
    conferir(
      paraTodo(
        3000,
        (g) => ({
          total: g.dinheiro(),
          parcelas: Array.from({ length: g.inteiro(0, 5) }, () => parcela(g)),
        }),
        ({ total, parcelas }) => {
          const f = faltaNoPagamento(total, parcelas);
          return f >= 0 || `falta ${f}`;
        }
      )
    );
  });

  /**
   * TROCO SÓ SAI DE DINHEIRO.
   *
   * Passar R$ 100 no cartão numa compra de R$ 80 não gera R$ 20 de troco:
   * gera estorno. Devolver isso da gaveta é prejuízo puro, e só aparece na
   * conferência dias depois, sem origem rastreável.
   */
  it("sem parcela em dinheiro, troco é zero", () => {
    conferir(
      paraTodo(
        3000,
        (g) => ({
          total: g.dinheiro(),
          parcelas: Array.from({ length: g.inteiro(1, 4) }, () => {
            const p = parcela(g);
            const semDinheiro: FormaPagamento[] = ["pix", "debito", "credito", "transferencia"];
            return { ...p, forma: g.de(semDinheiro) } as Parcela;
          }),
        }),
        ({ total, parcelas }) => {
          const t = trocoDoPagamento(total, parcelas);
          return t === 0 || `troco ${t} sem dinheiro na jogada`;
        }
      )
    );
  });

  /**
   * Consolidar junta as parcelas da mesma forma. O dinheiro não pode
   * aparecer nem sumir no caminho.
   */
  it("consolidar não cria nem perde dinheiro", () => {
    conferir(
      paraTodo(
        3000,
        (g) => Array.from({ length: g.inteiro(0, 6) }, () => parcela(g)),
        (parcelas) => {
          const antes = totalPago(parcelas.filter((p) => (Number(p.valor) || 0) > 0));
          const depois = totalPago(consolidar(parcelas));
          return antes === depois || `antes ${antes}, depois ${depois}`;
        }
      )
    );
  });

  it("consolidar é idempotente", () => {
    conferir(
      paraTodo(
        3000,
        (g) => Array.from({ length: g.inteiro(0, 6) }, () => parcela(g)),
        (parcelas) => {
          const uma = consolidar(parcelas);
          const duas = consolidar(uma);
          return JSON.stringify(uma) === JSON.stringify(duas) || "mudou na segunda vez";
        }
      )
    );
  });
});

describe("adicionar item ao carrinho", () => {
  /**
   * Juntar a linha repetida não pode mexer no total.
   *
   * Bipar o mesmo produto duas vezes soma na linha que já existe. Se essa
   * junção errasse a conta, o erro seria invisível: o carrinho parece certo
   * e o total é outro.
   */
  it("bipar N vezes o mesmo produto dá o mesmo total que N na quantidade", () => {
    conferir(
      paraTodo(
        2000,
        (g) => ({
          base: { ...item(g), quantidade: 1 } as ItemVenda,
          vezes: g.inteiro(1, 6),
        }),
        ({ base, vezes }) => {
          let itens: ItemVenda[] = [];
          for (let i = 0; i < vezes; i++) itens = adicionar(itens, { ...base });
          const bipado = totalVenda({ itens, desconto: 0 } as never);
          const digitado = totalVenda({
            itens: [{ ...base, quantidade: vezes }],
            desconto: 0,
          } as never);
          return bipado === digitado || `bipado ${bipado} != digitado ${digitado}`;
        }
      )
    );
  });
});
