import { describe, it, expect } from "vitest";
import {
  paraDuasOpcoes,
  proximoNomeDeOpcao,
  itensRepetidos,
  repeticoesDaOS,
  nomesDasOpcoes,
  pecasEfetivas,
  comOpcao,
} from "./orcamento";
import { totalOS } from "./calc";
import type { OrdemServico, PecaOS } from "./types";

/**
 * O caso real, da OS00033, com print.
 *
 * A loja tinha SSD 120 GB, bateria e carcaça digitados. Clicou em "mais de
 * uma opção", os três viraram COMUNS, e ela montou a Opção 1 com SSD 240 GB,
 * bateria e carcaça — que é como qualquer pessoa monta uma opção: inteira.
 *
 * A Opção 1 passou a somar R$ 1.360 em vez de R$ 730. Duas baterias, duas
 * carcaças e os dois SSDs no mesmo orçamento, para o cliente ler.
 */

const peca = (descricao: string, preco: number, custo = 0, opcao?: string): PecaOS => ({
  descricao,
  quantidade: 1,
  custoUnit: custo,
  precoUnit: preco,
  opcao,
});

const os = (pecas: PecaOS[], x: Partial<OrdemServico> = {}): OrdemServico =>
  ({
    id: "os33",
    numero: 33,
    clienteId: "c1",
    tipoAparelho: "Notebook",
    marca: "Dell",
    modelo: "Inspiron",
    defeitoRelatado: "não liga",
    checklist: {},
    pecas,
    maoDeObra: 0,
    desconto: 0,
    status: "aberta",
    garantiaDias: 90,
    historico: [],
    criadoEm: "2026-09-02T10:00:00.000Z",
    atualizadoEm: "2026-09-02T10:00:00.000Z",
    ...x,
  }) as unknown as OrdemServico;

describe("virar 'mais de uma opção' não pode espalhar o que já estava digitado", () => {
  it("o que estava na tela vira a Opção 1 INTEIRA, e não item comum", () => {
    /*
     * Opção é um cenário inteiro — é assim que a loja pensa e é assim que o
     * cliente lê. Deixar no balde comum fazia a pessoa remontar a opção do
     * zero e cobrar tudo duas vezes.
     */
    const antes = os([
      peca("Instalação SSD 120 GB", 380, 190),
      peca("Bateria Dell Original", 250, 130),
      peca("Carcaça tela frontal", 0),
    ]);
    const depois = paraDuasOpcoes(antes);

    expect(nomesDasOpcoes(depois)).toEqual(["Opção 1", "Opção 2"]);
    // Nada sobrou no comum.
    expect(depois.pecas.filter((p) => !p.opcao)).toEqual([]);
    // Os três foram para a primeira, com preço e custo intactos.
    const naPrimeira = depois.pecas.filter((p) => p.opcao === "Opção 1");
    expect(naPrimeira.map((p) => p.descricao)).toEqual([
      "Instalação SSD 120 GB",
      "Bateria Dell Original",
      "Carcaça tela frontal",
    ]);
    expect(naPrimeira.map((p) => p.precoUnit)).toEqual([380, 250, 0]);
  });

  it("a Opção 1 continua valendo o mesmo que valia antes da troca", () => {
    // Trocar o modo de exibição não pode mexer em dinheiro.
    const antes = os([peca("SSD", 380, 190), peca("Bateria", 250, 130)]);
    const depois = comOpcao(paraDuasOpcoes(antes), "Opção 1");
    expect(totalOS(depois)).toBe(totalOS(antes));
  });

  it("a segunda opção nasce vazia, com uma linha para digitar", () => {
    const depois = paraDuasOpcoes(os([peca("SSD", 380)]));
    const naSegunda = depois.pecas.filter((p) => p.opcao === "Opção 2");
    expect(naSegunda).toHaveLength(1);
    expect(naSegunda[0].descricao).toBe("");
    expect(naSegunda[0].precoUnit).toBe(0);
  });

  it("linha em branco que já estava na tela não vira peça da Opção 1", () => {
    // O formulário deixa linhas vazias para trás o tempo todo. Levá-las
    // encheria a opção de linhas sem nada para a pessoa apagar.
    const depois = paraDuasOpcoes(
      os([peca("SSD", 380), peca("", 0), { descricao: "  ", quantidade: 1, custoUnit: 0, precoUnit: 0 }])
    );
    expect(depois.pecas.filter((p) => p.opcao === "Opção 1")).toHaveLength(1);
  });

  it("OS sem peça nenhuma vira duas opções vazias, sem quebrar", () => {
    const depois = paraDuasOpcoes(os([]));
    expect(nomesDasOpcoes(depois)).toEqual(["Opção 2"]);
    expect(depois.pecas).toHaveLength(1);
  });

  it("ninguém sai com opção já escolhida: quem decide é o cliente", () => {
    // Marcar a primeira aqui faria a loja mandar um orçamento já aprovado
    // por ela mesma.
    expect(paraDuasOpcoes(os([peca("SSD", 380)])).opcaoEscolhida).toBeUndefined();
  });
});

describe("o mesmo item no comum e dentro da opção é cobrança dupla", () => {
  /** A OS00033 exatamente como estava no print */
  const os33 = os([
    peca("Instalação SSD 120 GB", 380, 190),
    peca("Bateria Dell Original", 250, 130),
    peca("Carcaça tela frontal", 0),
    peca("Instalação SSD 240 GB", 480, 190, "Opção 1"),
    peca("Bateria Dell Original", 250, 130, "Opção 1"),
    peca("Carcaça tela frontal", 0, 0, "Opção 1"),
  ]);

  it("aponta a peça repetida, pelo nome, uma vez só", () => {
    expect(itensRepetidos(os33, "Opção 1")).toEqual([
      "Bateria Dell Original",
      "Carcaça tela frontal",
    ]);
  });

  it("o caso real somava 1.360 onde o cenário custa 730", () => {
    // Prova de que a repetição é DINHEIRO, e não só desarrumação da tela.
    expect(totalOS(comOpcao(os33, "Opção 1"))).toBe(1360);
    const semRepetir = pecasEfetivas(comOpcao(os33, "Opção 1")).filter(
      (p) => p.opcao === "Opção 1"
    );
    expect(semRepetir.reduce((s, p) => s + p.precoUnit, 0)).toBe(730);
  });

  it("compara sem acento e sem caixa: 'BATERIA dell' é a mesma bateria", () => {
    /*
     * A comparação é pela DESCRIÇÃO e não pelo produto do cadastro: peça
     * digitada à mão não tem id nenhum, e foi justamente a digitada à mão
     * que apareceu repetida no caso real.
     */
    const o = os([peca("Bateria Dell Original", 250), peca("BATERIA DELL ORIGINAL", 250, 0, "Opção 1")]);
    expect(itensRepetidos(o, "Opção 1")).toEqual(["BATERIA DELL ORIGINAL"]);
  });

  it("peças diferentes não são acusadas", () => {
    // Alarme sem motivo é alarme que a pessoa aprende a ignorar.
    const o = os([peca("Pasta térmica", 20), peca("SSD 240", 480, 0, "Opção 1")]);
    expect(itensRepetidos(o, "Opção 1")).toEqual([]);
    expect(repeticoesDaOS(o)).toEqual([]);
  });

  it("linha em branco não conta como repetida", () => {
    const o = os([peca("", 0), peca("", 0, 0, "Opção 1")]);
    expect(itensRepetidos(o, "Opção 1")).toEqual([]);
  });

  it("a OS inteira diz qual opção tem repetição", () => {
    const o = os([
      peca("Bateria", 250),
      peca("SSD 240", 480, 0, "Opção 1"),
      peca("Bateria", 250, 0, "Opção 2"),
    ]);
    expect(repeticoesDaOS(o)).toEqual([{ opcao: "Opção 2", itens: ["Bateria"] }]);
  });

  it("depois da correção o caso real não acusa mais nada", () => {
    // Com o que já estava digitado indo para a Opção 1, o comum fica vazio
    // e não há como repetir.
    const corrigida = paraDuasOpcoes(
      os([
        peca("Instalação SSD 120 GB", 380, 190),
        peca("Bateria Dell Original", 250, 130),
        peca("Carcaça tela frontal", 0),
      ])
    );
    expect(repeticoesDaOS(corrigida)).toEqual([]);
  });
});

describe("a opção não some nem troca de número sozinha", () => {
  /*
   * Relatado do balcão: "a 1 meio que sumiu e virou 1 de novo a 2".
   *
   * Duas coisas se juntavam. A opção só existe enquanto tem peça, então
   * apagar a última fazia ela sumir; e o nome seguinte era o primeiro número
   * LIVRE, então a "Opção 1" voltava — e aparecia depois da "Opção 2", porque
   * a ordem sai de onde a peça está na lista.
   */
  it("o número passa do maior já usado, e nunca reaproveita o que sobrou", () => {
    const comDuas = os([
      peca("a", 10, 0, "Opção 1"),
      peca("b", 10, 0, "Opção 2"),
    ]);
    expect(proximoNomeDeOpcao(comDuas)).toBe("Opção 3");

    // A "Opção 1" sumiu (ficou sem peça). O próximo NÃO pode ser 1 de novo.
    const soASegunda = os([peca("b", 10, 0, "Opção 2")]);
    expect(proximoNomeDeOpcao(soASegunda)).toBe("Opção 3");
  });

  it("nome escrito à mão não entra na numeração", () => {
    // Quem renomeou para "Completo" não quer numeração.
    expect(proximoNomeDeOpcao(os([peca("a", 10, 0, "Completo")]))).toBe("Opção 1");
    expect(
      proximoNomeDeOpcao(os([peca("a", 10, 0, "Completo"), peca("b", 10, 0, "Opção 5")]))
    ).toBe("Opção 6");
  });

  it("OS sem opção nenhuma começa na 1", () => {
    expect(proximoNomeDeOpcao(os([peca("a", 10)]))).toBe("Opção 1");
  });

  it("a lista sai em ordem crescente sozinha, sem reordenar nada", () => {
    /*
     * Reordenar por nome seria perigoso: a mesma ordem existe no SQL da
     * página do cliente (`order by o.ordem`), e as duas divergindo mostrariam
     * sugestões diferentes para o mesmo orçamento. Com o número sempre
     * subindo, a ordem de digitação JÁ é a ordem crescente.
     */
    let o = os([peca("a", 10, 0, "Opção 1"), peca("b", 10, 0, "Opção 2")]);
    for (let i = 0; i < 3; i++) {
      const nome = proximoNomeDeOpcao(o);
      o = os([...o.pecas, peca("", 0, 0, nome)]);
    }
    expect(nomesDasOpcoes(o)).toEqual([
      "Opção 1",
      "Opção 2",
      "Opção 3",
      "Opção 4",
      "Opção 5",
    ]);
  });
});
