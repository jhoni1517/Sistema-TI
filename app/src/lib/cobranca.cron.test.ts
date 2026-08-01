import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
    // Uma na definição da função e uma na chamada do resumo de mensalidade.
    expect(usos).toBe(2);
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
