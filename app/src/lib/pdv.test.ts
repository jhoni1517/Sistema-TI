import { describe, it, expect } from "vitest";
import {
  subtotalItem,
  subtotalVenda,
  totalVenda,
  custoVenda,
  lucroVenda,
  totalItens,
  trocoDe,
  faltaPara,
  itemDoProduto,
  adicionar,
  buscarProduto,
  sugerirProdutos,
  situacaoValidade,
  produtosVencendo,
  problemaNoCarrinho,
} from "./pdv";
import { saldosApos } from "./estoque";
import type { ItemVenda, Produto } from "./types";

const prod = (p: Partial<Produto> = {}): Produto => ({
  id: "p1",
  nome: "Arroz 5kg",
  quantidade: 10,
  estoqueMinimo: 2,
  custo: 20,
  preco: 30,
  criadoEm: "2026-01-01T00:00:00.000Z",
  ...p,
});

const item = (i: Partial<ItemVenda> = {}): ItemVenda => ({
  produtoId: "p1",
  descricao: "Arroz 5kg",
  quantidade: 1,
  precoUnit: 30,
  custoUnit: 20,
  ...i,
});

describe("conta do carrinho", () => {
  it("linha simples é quantidade vezes preço", () => {
    expect(subtotalItem(item({ quantidade: 3, precoUnit: 12.5 }))).toBe(37.5);
  });

  it("venda por peso arredonda o centavo na própria linha", () => {
    // 0,315 kg a R$ 24,90 dá 7,8435. O cliente não paga fração de centavo,
    // e a etiqueta da balança mostra 7,84.
    expect(subtotalItem(item({ quantidade: 0.315, precoUnit: 24.9, porPeso: true }))).toBe(7.84);
  });

  it("o total é a soma das linhas JÁ arredondadas", () => {
    // Somar sem arredondar daria 15,69 aqui; os itens somam 15,68. O total
    // precisa bater com o que está escrito linha a linha, senão a fila
    // discute na frente do caixa.
    const itens = [
      item({ quantidade: 0.315, precoUnit: 24.9, porPeso: true }), // 7,84
      item({ quantidade: 0.315, precoUnit: 24.9, porPeso: true }), // 7,84
    ];
    expect(subtotalVenda(itens)).toBe(15.68);
  });

  it("não sobra dízima do ponto flutuante", () => {
    const itens = [
      item({ quantidade: 1, precoUnit: 0.1 }),
      item({ quantidade: 1, precoUnit: 0.2 }),
    ];
    expect(subtotalVenda(itens)).toBe(0.3);
  });

  it("carrinho vazio soma zero, não NaN", () => {
    expect(subtotalVenda([])).toBe(0);
    expect(totalVenda({ itens: [], desconto: 0 })).toBe(0);
  });
});

describe("desconto", () => {
  it("abate do total", () => {
    expect(totalVenda({ itens: [item({ precoUnit: 50 })], desconto: 5 })).toBe(45);
  });

  it("desconto maior que a compra não devolve dinheiro do caixa", () => {
    // Digitar 100 de desconto numa compra de 30 não pode virar -70.
    expect(totalVenda({ itens: [item({ precoUnit: 30 })], desconto: 100 })).toBe(0);
  });

  it("desconto negativo é ignorado em vez de aumentar a conta", () => {
    expect(totalVenda({ itens: [item({ precoUnit: 30 })], desconto: -20 })).toBe(30);
  });
});

describe("custo e lucro", () => {
  it("custo acompanha a quantidade, inclusive fracionária", () => {
    expect(custoVenda([item({ quantidade: 2.5, custoUnit: 4 })])).toBe(10);
  });

  it("lucro é o total cobrado menos o custo da mercadoria", () => {
    const v = { itens: [item({ quantidade: 2, precoUnit: 30, custoUnit: 20 })], desconto: 10 };
    expect(totalVenda(v)).toBe(50);
    expect(lucroVenda(v)).toBe(10);
  });

  it("o desconto sai do lucro, não do custo", () => {
    const v = { itens: [item({ precoUnit: 30, custoUnit: 20 })], desconto: 15 };
    expect(lucroVenda(v)).toBe(-5);
  });
});

describe("troco", () => {
  it("devolve a diferença", () => {
    expect(trocoDe(37.5, 50)).toBe(12.5);
  });

  it("recebido a menos não vira troco negativo", () => {
    expect(trocoDe(50, 20)).toBe(0);
    expect(faltaPara(50, 20)).toBe(30);
  });

  it("sem valor informado, falta a conta inteira", () => {
    expect(trocoDe(50, undefined)).toBe(0);
    expect(faltaPara(50, undefined)).toBe(50);
  });

  it("valor exato não deixa resto nem falta", () => {
    expect(trocoDe(37.5, 37.5)).toBe(0);
    expect(faltaPara(37.5, 37.5)).toBe(0);
  });
});

describe("adicionar ao carrinho", () => {
  it("ler o mesmo produto duas vezes vira 2x, não duas linhas", () => {
    const um = itemDoProduto(prod());
    const carrinho = adicionar(adicionar([], um), itemDoProduto(prod()));
    expect(carrinho).toHaveLength(1);
    expect(carrinho[0].quantidade).toBe(2);
  });

  it("produto por peso nunca junta: cada pesagem é uma pesagem", () => {
    // Somar 0,300 com 0,450 apagaria que foram dois pacotes diferentes.
    const p = prod({ porPeso: true });
    const carrinho = adicionar(
      adicionar([], itemDoProduto(p, 0.3)),
      itemDoProduto(p, 0.45)
    );
    expect(carrinho).toHaveLength(2);
    expect(totalItens(carrinho)).toBeCloseTo(0.75, 3);
  });

  it("linha com recado nunca se junta: a cozinha erraria um dos dois", () => {
    // "X-Burger sem cebola" e um X-Burger normal são o mesmo produtoId.
    // Juntá-los daria quantidade 2 com o recado valendo para os dois: a
    // cozinha faz os dois sem cebola e uma das pessoas recebe errado.
    const semCebola: ItemVenda = { ...itemDoProduto(prod()), observacao: "sem cebola" };
    const normal = itemDoProduto(prod());

    const a = adicionar(adicionar([], semCebola), normal);
    expect(a).toHaveLength(2);
    expect(a[0].observacao).toBe("sem cebola");
    expect(a[1].observacao).toBeUndefined();

    // E na ordem contrária o recado não pode sobrescrever a linha limpa —
    // aí seria a outra pessoa comendo cebola.
    const b = adicionar(adicionar([], normal), semCebola);
    expect(b).toHaveLength(2);
    expect(b[0].quantidade).toBe(1);
  });

  it("recado em branco não impede a soma de sempre", () => {
    // Campo tocado e apagado não pode virar uma linha nova por engano.
    const vazio: ItemVenda = { ...itemDoProduto(prod()), observacao: "   " };
    expect(adicionar([vazio], itemDoProduto(prod()))).toHaveLength(1);
  });

  it("produtos diferentes ficam em linhas diferentes", () => {
    const carrinho = adicionar(
      adicionar([], itemDoProduto(prod({ id: "a" }))),
      itemDoProduto(prod({ id: "b" }))
    );
    expect(carrinho).toHaveLength(2);
  });

  it("item avulso, sem produto cadastrado, não se junta a nada", () => {
    const avulso: ItemVenda = { descricao: "diverso", quantidade: 1, precoUnit: 5, custoUnit: 0 };
    expect(adicionar([avulso], { ...avulso })).toHaveLength(2);
  });
});

describe("buscar produto", () => {
  const lista = [
    prod({ id: "a", nome: "Arroz", codigoBarras: "7891234567890" }),
    prod({ id: "b", nome: "789", sku: "FEIJAO" }),
    prod({ id: "c", nome: "Feijão preto" }),
  ];

  it("código de barras ganha do nome", () => {
    // O leitor se comporta como teclado: digita o código e dá Enter. Se o
    // nome ganhasse, o produto chamado "789" roubaria a leitura.
    expect(buscarProduto(lista, "7891234567890")?.id).toBe("a");
  });

  it("acha por SKU sem diferenciar maiúscula", () => {
    expect(buscarProduto(lista, "feijao")?.id).toBe("b");
  });

  it("acha por nome exato quando não há código", () => {
    expect(buscarProduto(lista, "Feijão preto")?.id).toBe("c");
  });

  it("termo vazio não devolve produto nenhum", () => {
    expect(buscarProduto(lista, "")).toBeUndefined();
    expect(buscarProduto(lista, "   ")).toBeUndefined();
  });

  it("sugere por pedaço do nome para quem digita", () => {
    // "c" chama "Feijão preto"; "b" só tem FEIJAO no SKU. Os dois aparecem,
    // e o nome vem primeiro — no balcão quem digita "fei" quer o feijão, não
    // o item cujo código interno por acaso começa igual.
    expect(sugerirProdutos(lista, "fei").map((p) => p.id)).toEqual(["c", "b"]);
  });

  it("acha sem acento, que é como se digita no balcão", () => {
    // Foi a terceira vez que esta busca comparou texto cru. Quem digitava
    // "feijao" concluía que o produto não estava cadastrado e chamava de
    // avulso — a venda saía sem baixa de estoque.
    expect(sugerirProdutos(lista, "feijao").map((p) => p.id)).toContain("c");
  });
});

describe("validade", () => {
  const hoje = "2026-07-28";

  it("produto sem validade não vira alerta", () => {
    expect(situacaoValidade({}, 7, hoje)).toBe("sem_validade");
    expect(situacaoValidade({ validade: "" }, 7, hoje)).toBe("sem_validade");
  });

  it("vencido é o que já passou da data", () => {
    expect(situacaoValidade({ validade: "2026-07-27" }, 7, hoje)).toBe("vencido");
  });

  it("vence hoje ainda conta como vencendo, não como vencido", () => {
    expect(situacaoValidade({ validade: "2026-07-28" }, 7, hoje)).toBe("vence_perto");
  });

  it("avisa com antecedência: no dia do vencimento não dá para fazer nada", () => {
    expect(situacaoValidade({ validade: "2026-08-03" }, 7, hoje)).toBe("vence_perto");
    expect(situacaoValidade({ validade: "2026-08-05" }, 7, hoje)).toBe("ok");
  });

  it("lista os que precisam de atenção, do mais urgente para o menos", () => {
    const lista = [
      prod({ id: "ok", validade: "2027-01-01" }),
      prod({ id: "perto", validade: "2026-07-30" }),
      prod({ id: "vencido", validade: "2026-07-01" }),
      prod({ id: "sem" }),
    ];
    expect(produtosVencendo(lista, 7, hoje).map((p) => p.id)).toEqual(["vencido", "perto"]);
  });
});

/**
 * O carrinho não fecha com linha que não é venda.
 *
 * A quantidade do produto por peso é campo livre — tem que ser, porque é
 * ali que o operador digita 0,315 sem abrir janela nenhuma. Só que ele
 * aceitava zero e NEGATIVO, e o fechamento só conferia o preço.
 *
 * Linha negativa é o pior dos dois: ela desconta do total E soma no
 * estoque. Vender "Arroz 2" junto de "Feijão -2" fecha a venda por R$ 0,00
 * e ainda credita dois quilos de feijão na prateleira. Não sobra nada para
 * a conferência achar: o estoque não fica negativo, o preço não é zero, e o
 * lucro inflado ninguém procura.
 *
 * Linha com quantidade zero é a mercadoria saindo de graça: total zero e
 * baixa zero.
 */
describe("o carrinho não fecha com linha que não é venda", () => {
  it("carrinho vazio", () => {
    expect(problemaNoCarrinho([])).toContain("vazio");
  });

  it("recusa quantidade negativa e diz onde é a saída", () => {
    const p = problemaNoCarrinho([item(), item({ descricao: "Feijão", quantidade: -2 })]);
    expect(p).toContain("Feijão");
    expect(p).toContain("negativa");
    // Quem quer tirar mercadoria da venda tem um caminho próprio, com
    // comprovante e lançamento no caixa.
    expect(p).toContain("Devolução");
  });

  it("recusa quantidade zero", () => {
    const p = problemaNoCarrinho([item({ descricao: "Queijo", quantidade: 0, porPeso: true })]);
    expect(p).toContain("Queijo");
    expect(p).toContain("zero");
  });

  it("recusa item sem preço, dizendo qual", () => {
    const p = problemaNoCarrinho([item(), item({ descricao: "Item avulso", precoUnit: 0 })]);
    expect(p).toContain("Item avulso");
    expect(p).toContain("preço");
  });

  it("recusa preço negativo", () => {
    expect(problemaNoCarrinho([item({ precoUnit: -1 })])).toContain("preço");
  });

  it("carrinho normal fecha", () => {
    expect(problemaNoCarrinho([item(), item({ descricao: "Queijo", quantidade: 0.315, precoUnit: 24.9, porPeso: true })])).toBe("");
  });

  it("mostra o estrago: a linha negativa zerava a venda e CREDITAVA o estoque", () => {
    // É este resultado que a recusa impede. Sem ela, a venda vai para o
    // banco com total zero e dois quilos entram na prateleira sem nota.
    const itens = [
      item({ produtoId: "a", descricao: "Arroz", quantidade: 2, precoUnit: 30 }),
      item({ produtoId: "b", descricao: "Feijão", quantidade: -2, precoUnit: 30 }),
    ];
    expect(totalVenda({ itens, desconto: 0 })).toBe(0);
    const feijao = prod({ id: "b", nome: "Feijão", quantidade: 10 });
    const saldos = saldosApos(itens, [prod({ id: "a" }), feijao]);
    expect(saldos.find((s) => s.produto.id === "b")?.quantidade).toBe(12);
  });
});
