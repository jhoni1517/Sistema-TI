import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * O robô do Telegram/WhatsApp lançava TUDO como dinheiro.
 *
 * Era uma linha fixa: `formaPagamento: "dinheiro"`. Uma venda no Pix
 * anunciada pelo robô entrava no caixa como espécie, e aí o fechamento do
 * dia pedia na gaveta um dinheiro que nunca passou por ela — falta todo dia,
 * sem origem. É o mesmo erro que já tinha sido consertado do lado das
 * entradas do PDV, entrando de novo pela porta do robô.
 *
 * A lógica mora só em api/*.js, porque função da Vercel não importa
 * TypeScript. Em vez de recopiar o código aqui — o que só empurraria o
 * problema, já que a cópia do teste também envelhece — o arquivo real é
 * lido do disco e a função é extraída dele.
 */
const fonte = readFileSync(resolve(__dirname, "..", "..", "api", "_caixa.js"), "utf8");

function extrair(nome: string): string {
  const i = fonte.indexOf(`function ${nome}(`);
  if (i < 0) throw new Error(`função ${nome} sumiu de api/_caixa.js`);
  const abre = fonte.indexOf("{", i);
  let nivel = 0;
  for (let j = abre; j < fonte.length; j++) {
    if (fonte[j] === "{") nivel++;
    else if (fonte[j] === "}") {
      nivel--;
      if (nivel === 0) return fonte.slice(i, j + 1);
    }
  }
  throw new Error(`não consegui ler o corpo de ${nome}`);
}

const criar = <T>(nome: string, ...deps: string[]): T =>
  new Function(`${[...deps, nome].map(extrair).join("\n")}; return ${nome};`)() as T;

interface Lancamento {
  tipo: string;
  valor: number;
  descricao: string;
  categoria: string;
  forma: string;
}

const parse = criar<(t: string) => Lancamento | null>("parseMensagem", "formaDaMensagem");
const formaDaMensagem = criar<(t: string) => { forma: string; texto: string }>(
  "formaDaMensagem"
);

describe("o que o robô já entendia continua igual", () => {
  it("despesa simples", () => {
    expect(parse("café 5")).toMatchObject({ tipo: "saida", valor: 5, descricao: "café" });
  });

  it("entrada com o mais na frente", () => {
    expect(parse("+100 venda de película")).toMatchObject({ tipo: "entrada", valor: 100 });
  });

  it("sangria", () => {
    expect(parse("sangria 200")).toMatchObject({ tipo: "sangria", valor: 200 });
  });

  it("mensagem sem valor não vira lançamento", () => {
    expect(parse("bom dia")).toBeNull();
    expect(parse("")).toBeNull();
  });

  it("valor com vírgula ou ponto", () => {
    expect(parse("luz 230,50")?.valor).toBe(230.5);
    expect(parse("luz 230.50")?.valor).toBe(230.5);
  });
});

/**
 * Quem não disser a forma continua caindo em dinheiro: é o caso mais comum
 * no balcão e ninguém vai começar a digitar uma palavra a mais por causa
 * disso.
 */
describe("a forma de pagamento sai da mensagem", () => {
  it("sem dizer nada, é dinheiro", () => {
    expect(parse("café 5")?.forma).toBe("dinheiro");
    expect(parse("+100 venda")?.forma).toBe("dinheiro");
  });

  it("pix é reconhecido", () => {
    expect(parse("+100 venda de película pix")?.forma).toBe("pix");
    expect(parse("+100 pix venda de película")?.forma).toBe("pix");
  });

  it("débito e crédito, com e sem acento", () => {
    expect(parse("+50 debito")?.forma).toBe("debito");
    expect(parse("+50 débito")?.forma).toBe("debito");
    expect(parse("+50 credito")?.forma).toBe("credito");
    expect(parse("+50 crédito")?.forma).toBe("credito");
  });

  it("cartão de débito e cartão de crédito por extenso", () => {
    expect(parse("+50 cartão de débito")?.forma).toBe("debito");
    expect(parse("+50 cartao de credito")?.forma).toBe("credito");
  });

  it("cartão sem dizer qual cai em débito, que é o do balcão", () => {
    // Errar aqui custa um clique de correção na tela; a resposta do robô
    // diz qual foi, justamente para o erro aparecer na hora.
    expect(parse("+50 cartão")?.forma).toBe("debito");
    expect(parse("+50 maquininha")?.forma).toBe("debito");
  });

  it("dinheiro dito por extenso também vale", () => {
    expect(parse("+50 dinheiro")?.forma).toBe("dinheiro");
    expect(parse("+50 espécie")?.forma).toBe("dinheiro");
  });

  it("a palavra da forma some da descrição", () => {
    // Senão o caixa fica cheio de "venda de película pix", e a busca por
    // descrição passa a achar coisa que não é.
    expect(parse("+100 venda de película pix")?.descricao).toBe("venda de película");
    expect(parse("café 5 dinheiro")?.descricao).toBe("café");
  });

  it("descrição que sobra vazia ganha o nome do tipo", () => {
    expect(parse("+50 pix")?.descricao).toBe("Entrada");
    expect(parse("-30 pix")?.descricao).toBe("Despesa");
  });

  it("palavra parecida não é confundida com a forma", () => {
    // "pixel" não é "pix", e "creditou" não é "crédito".
    expect(parse("+50 pixel da tela")?.forma).toBe("dinheiro");
    expect(parse("+50 creditou na conta")?.forma).toBe("dinheiro");
  });
});

/**
 * Sangria é, por definição, papel saindo da gaveta para o cofre ou para o
 * banco. Aceitar "sangria 200 pix" gravaria uma retirada que não tira nada
 * da gaveta, e o fechamento passaria a acusar sobra.
 */
describe("sangria é sempre em espécie", () => {
  it("ignora a forma escrita na mensagem", () => {
    expect(parse("sangria 200 pix")?.forma).toBe("dinheiro");
    expect(parse("sangria 200 cartão")?.forma).toBe("dinheiro");
  });
});

describe("o detector de forma, sozinho", () => {
  it("devolve o texto sem a palavra da forma", () => {
    expect(formaDaMensagem("venda de película pix")).toEqual({
      forma: "pix",
      texto: "venda de película",
    });
  });

  it("sem forma na frase, devolve o texto intacto", () => {
    expect(formaDaMensagem("venda de película")).toEqual({
      forma: "",
      texto: "venda de película",
    });
  });

  it("tira só a primeira ocorrência, e não deixa espaço dobrado", () => {
    expect(formaDaMensagem("pix da venda").texto).toBe("da venda");
  });
});
