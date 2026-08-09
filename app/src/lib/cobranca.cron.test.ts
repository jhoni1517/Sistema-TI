import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tipoDoTeste } from "./cobranca";

/**
 * Nada de dentro de uma loja pode sair no Telegram do operador do sistema.
 *
 * A rotina diária roda com a chave de serviço, que enxerga TODAS as lojas.
 * Ela juntava o que achava e mandava para um chat só, o do dono do sistema:
 * nome e dívida de cliente de mercearia, agenda de assistência técnica,
 * conta a pagar de pizzaria. Dado pessoal coletado por uma loja indo parar
 * no celular de outra pessoa — e sem serventia, porque quem precisa do
 * lembrete é o dono da loja, não o dono do sistema.
 *
 * A separação é simples e vale a pena travar: `enviarTelegram` é o canal do
 * operador e SÓ a mensalidade usa ele; todo o resto sai por `enviarPara`,
 * com o chat da loja. Este teste lê o arquivo do disco e reprova quem
 * misturar os dois de novo.
 */
const fonte = readFileSync(
  resolve(__dirname, "..", "..", "api", "cobranca.js"),
  "utf8"
);

/** Corpo de uma função do arquivo, andando pelas chaves até fechar */
function corpo(nome: string): string {
  const i = fonte.indexOf(`function ${nome}(`);
  if (i < 0) throw new Error(`função ${nome} sumiu de api/cobranca.js`);
  const abre = fonte.indexOf("{", i);
  let nivel = 0;
  for (let j = abre; j < fonte.length; j++) {
    if (fonte[j] === "{") nivel++;
    else if (fonte[j] === "}" && --nivel === 0) return fonte.slice(i, j + 1);
  }
  throw new Error(`não consegui ler o corpo de ${nome}`);
}

/** As rotinas que leem dado de DENTRO da loja */
const DA_LOJA = [
  "avisarContas",
  "avisarAgenda",
  "avisarFiado",
  "conferirBackup",
  "aniversariosProximos",
];

describe("o cron não manda dado de loja para o chat do operador", () => {
  it.each(DA_LOJA)("%s não usa o canal do operador", (nome) => {
    // enviarTelegram() manda para TELEGRAM_CHAT_ID, que é do dono do
    // sistema. Estas rotinas têm que usar enviarPara(chatDaLoja, ...).
    expect(corpo(nome)).not.toContain("enviarTelegram(");
  });

  it.each(DA_LOJA)("%s recebe os chats das lojas por parâmetro", (nome) => {
    // Sem o parâmetro a função não tem como saber para quem mandar, e a
    // tentação é cair de volta no chat do operador.
    expect(corpo(nome).slice(0, corpo(nome).indexOf(")"))).toContain("chats");
  });

  it("só a mensalidade fala com o chat do operador", () => {
    // Nome da loja e quanto ela deve são da relação comercial do operador
    // com ela — isso pode e deve chegar nele.
    const usos = fonte.split("enviarTelegram(").length - 1;
    /*
     * Três: a definição da função, o resumo de mensalidade, e o aviso curto
     * de "teste acaba hoje" — que também é assinatura, não conteúdo de loja.
     *
     * O número é conferido na unha de propósito. Ele não protege um estilo:
     * protege a regra de que NADA de dentro de uma loja (cliente, dívida,
     * agenda) escape para o chat de outra pessoa. Subir este número exige
     * olhar a chamada nova e responder se o que ela manda é da relação
     * comercial ou é dado do cliente da loja.
     */
    expect(usos).toBe(3);
  });

  it("o chat do operador aparece em um lugar só do código", () => {
    // Se aparecer em outro ponto, alguém arrumou um atalho de volta.
    // Comentário não conta: explicar a regra não é usá-la.
    const codigo = fonte
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    const linhas = codigo
      .split("\n")
      .filter((l) => l.includes("TELEGRAM_CHAT_ID"))
      .map((l) => l.trim());
    expect(linhas).toEqual([
      "const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;",
      "return enviarPara(TELEGRAM_CHAT_ID, texto);",
    ]);
  });

  it("a busca de aniversário filtra pelas lojas que vão receber", () => {
    // Puxar nome de cliente de loja que não recebe nada é carregar o dado
    // mais sensível do sistema sem nenhum uso.
    expect(corpo("aniversariosProximos")).toContain("lojaId=in.");
  });

  it("o fiado filtra pelas lojas que vão receber", () => {
    expect(corpo("avisarFiado")).toContain("lojaId=in.");
  });

  it("a contagem do backup é por loja, não do sistema inteiro", () => {
    // Antes ela somava as quatro tabelas de TODAS as lojas e mandava o
    // total como se fosse o tamanho de uma.
    expect(corpo("conferirBackup")).toContain("lojaId=eq.");
  });
});

/**
 * A régua do fiado sem prazo existe em DOIS lugares.
 *
 * A tela usa `DIAS_PARA_COBRAR_SEM_VENCIMENTO` de src/lib/fiado.ts; o robô
 * de segunda-feira usa `DIAS_PARADO` de api/cobranca.js, porque função da
 * Vercel não importa TypeScript. Divergindo, a tela diz que o cliente está
 * parado há tempo demais e o robô fica calado — ou o contrário, e a loja
 * recebe aviso de dívida que a tela mostra como em dia.
 *
 * O teste LÊ os dois arquivos do disco em vez de recopiar o número: cópia
 * dentro de teste envelhece igual e os dois passam a mentir juntos.
 */
/** O código sem os comentários, para procurar literal sem cair no texto */
const semComentarios = (t: string): string =>
  t
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join("\n");

describe("a régua do fiado é a mesma na tela e no robô", () => {
  it("DIAS_PARADO do cron bate com DIAS_PARA_COBRAR_SEM_VENCIMENTO da lib", () => {
    const doCron = fonte.match(/const DIAS_PARADO = (\d+);/)?.[1];
    const daLib = readFileSync(resolve(__dirname, "fiado.ts"), "utf8").match(
      /DIAS_PARA_COBRAR_SEM_VENCIMENTO = (\d+);/
    )?.[1];
    expect(doCron, "DIAS_PARADO sumiu de api/cobranca.js").toBeTruthy();
    expect(daLib, "DIAS_PARA_COBRAR_SEM_VENCIMENTO sumiu de lib/fiado.ts").toBeTruthy();
    expect(doCron).toBe(daLib);
  });

  it("o robô não filtra mais por vencimento preenchido", () => {
    /*
     * Este filtro deixava de fora justamente o fiado mais comum: o da OS
     * entregue a prazo, que nasce sem vencimento nenhum. A dívida ficava
     * para sempre no "Total a receber" sem nunca virar aviso.
     */
    // Sem os comentários: o próprio comentário que explica a remoção cita o
    // filtro pelo nome, e ele reprovaria o código já consertado.
    expect(semComentarios(corpo("avisarFiado"))).not.toContain("vencimento=not.is.null");
  });

  it("o robô lê a data de criação, que é o que mede a dívida sem prazo", () => {
    expect(corpo("avisarFiado")).toContain('"criadoEm"');
  });
});

/**
 * Teste grátis não é mensalidade em atraso.
 *
 * A régua do teste também existe duas vezes: `tipoDoTeste` em
 * src/lib/cobranca.ts e a cópia em api/cobranca.js. Divergindo, a tela
 * mostra a loja como "teste acabando" e o robô manda "VENCIDA" para a mesma
 * loja no mesmo dia — cobrando uma mensalidade que ela nunca contratou.
 *
 * O teste EXECUTA a função do robô, lida do disco, em vez de recopiar a
 * régua: cópia dentro de teste envelhece igual e as duas passam a mentir
 * juntas.
 */
describe("a régua do teste é a mesma na tela e no robô", () => {
  const doRobo = new Function(
    `${corpo("tipoDoTeste")}\nreturn tipoDoTeste;`
  )() as (dias: number | null) => string | null;

  it("responde igual em todos os dias que importam", () => {
    for (let dias = -40; dias <= 40; dias++) {
      expect(doRobo(dias), `divergiu em ${dias} dia(s)`).toBe(tipoDoTeste(dias));
    }
    expect(doRobo(null)).toBe(tipoDoTeste(null));
  });

  it("loja em teste não entra na régua da mensalidade", () => {
    // O `ehTeste(l) ? ... : ...` é a bifurcação inteira. Sem ela o teste
    // volta a virar "VENCIDA" no resumo do Telegram.
    expect(semComentarios(fonte)).toContain("ehTeste(l) ? tipoDoTeste(dias)");
  });

  it("o robô lê a marca do teste do banco", () => {
    // Sem `testeAte` na consulta, `ehTeste` devolve falso para todo mundo e
    // a bifurcação acima nunca acontece — o defeito volta calado.
    expect(fonte).toContain("lojas?select=id,nome,venceEm,testeAte");
  });

  it("a conta de 'está em teste' é a mesma dos dois lados", () => {
    // `venceEm <= testeAte`. Pagar empurra o vencimento para além do fim do
    // teste e a conta vira falsa sozinha, sem ninguém limpar campo nenhum.
    expect(semComentarios(corpo("ehTeste"))).toContain("return vence <= teste;");
    const daLib = readFileSync(resolve(__dirname, "assinatura.ts"), "utf8");
    expect(semComentarios(daLib)).toContain("return vence <= teste;");
  });
});
