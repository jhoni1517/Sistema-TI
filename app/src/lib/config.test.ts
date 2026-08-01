import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { paraNuvem, precisaGravarNaNuvem, problemaNoChatId, SO_NO_APARELHO } from "./config";
import type { Config } from "./types";

/**
 * Todo campo da configuração sobe para a nuvem, menos os quatro de sempre.
 *
 * O bug: a lista do que subia era escrita à mão dentro do AppStore, e toda
 * configuração criada depois daquele dia ficou de fora. Logo da loja, papel
 * da impressora, limite da gaveta, formato da balança e chat do Telegram
 * salvavam só no aparelho. A tela dizia "salvo".
 *
 * Ninguém percebe isso usando o sistema numa máquina só. Percebe-se quando
 * o robô diário responde "nenhuma loja com Telegram configurado" depois de
 * a loja ter preenchido o campo — ou, pior, quando alguém troca de celular.
 *
 * Este teste lê a definição de `Config` do disco e cobra campo por campo.
 */

const base: Config = {
  nomeLoja: "Mercearia",
  telefoneLoja: "",
  enderecoLoja: "",
  cnpj: "",
  senhaAcesso: "",
  tema: "claro",
  corDestaque: "azul",
  comissaoPadrao: 0,
  taxaArmazenamentoDia: 0,
  diasAbandono: 90,
  limparSenhaNaEntrega: true,
};

/** Os campos declarados em `interface Config`, lidos do arquivo de tipos */
function camposDeConfig(): string[] {
  const fonte = readFileSync(resolve(__dirname, "types.ts"), "utf8");
  const i = fonte.indexOf("export interface Config {");
  if (i < 0) throw new Error("não achei a interface Config em types.ts");
  const corpo = fonte.slice(i, fonte.indexOf("\n}", i));
  return [...corpo.matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]);
}

describe("o que sobe para a nuvem", () => {
  it("todo campo de Config sobe, menos os que ficam no aparelho", () => {
    // Se este teste falhar depois de você criar um campo novo, a pergunta é:
    // ele é do APARELHO (aparência, credencial) ou da LOJA? Se for da loja,
    // já está certo. Se for do aparelho, some com ele em SO_NO_APARELHO.
    const cheio = Object.fromEntries(camposDeConfig().map((c) => [c, "x"])) as unknown as Config;
    const subiram = Object.keys(paraNuvem(cheio));
    const esperados = camposDeConfig().filter(
      (c) => !(SO_NO_APARELHO as readonly string[]).includes(c)
    );
    expect(subiram.sort()).toEqual(esperados.sort());
  });

  it("o chat do Telegram sobe: era ele que não chegava no robô diário", () => {
    const r = paraNuvem({ ...base, telegramChatId: "123456" });
    expect(r.telegramChatId).toBe("123456");
  });

  it("a credencial da nuvem NUNCA sobe", () => {
    // Ela não pode morar dentro de uma linha da própria nuvem: circula no
    // backup e é o que permite entrar.
    const r = paraNuvem({ ...base, supabaseUrl: "https://x", supabaseKey: "segredo" });
    expect(r.supabaseUrl).toBeUndefined();
    expect(r.supabaseKey).toBeUndefined();
  });

  it("a aparência fica no aparelho: o balcão usa claro e a sala escuro", () => {
    const r = paraNuvem({ ...base, tema: "escuro", corDestaque: "verde" });
    expect(r.tema).toBeUndefined();
    expect(r.corDestaque).toBeUndefined();
  });
});

describe("quando vale a pena gravar na nuvem", () => {
  it("trocar a cor não grava: a paleta chama isso a cada clique", () => {
    expect(precisaGravarNaNuvem(base, { ...base, corDestaque: "verde" })).toBe(false);
    expect(precisaGravarNaNuvem(base, { ...base, tema: "escuro" })).toBe(false);
  });

  it("trocar o nome da loja grava", () => {
    expect(precisaGravarNaNuvem(base, { ...base, nomeLoja: "Outra" })).toBe(true);
  });

  it("preencher o chat do Telegram grava", () => {
    expect(precisaGravarNaNuvem(base, { ...base, telegramChatId: "1" })).toBe(true);
  });

  it("salvar sem mudar nada não grava", () => {
    expect(precisaGravarNaNuvem(base, { ...base })).toBe(false);
  });
});

describe("o campo do chat id recusa o token do robô", () => {
  it("token colado no lugar do chat id é recusado, dizendo onde ele mora", () => {
    // Aconteceu de verdade. Os dois valores saem da mesma tela do BotFather,
    // e o token é o que está na mão na hora de configurar.
    const r = problemaNoChatId("8197980608:AAEbEIVx9fg93luP-nrdFLSNG8STnWexemplo");
    expect(r).toContain("TOKEN");
    expect(r).toContain("Vercel");
  });

  it("chat id de conversa passa", () => {
    expect(problemaNoChatId("123456789")).toBe("");
  });

  it("chat id de grupo passa: eles são negativos", () => {
    expect(problemaNoChatId("-100123456789")).toBe("");
  });

  it("vazio passa: a loja pode não querer aviso nenhum", () => {
    expect(problemaNoChatId("")).toBe("");
    expect(problemaNoChatId("   ")).toBe("");
  });

  it("qualquer outra coisa explica o que é o chat id", () => {
    expect(problemaNoChatId("@meubot")).toContain("só números");
    expect(problemaNoChatId("123")).toContain("só números");
  });
});

describe("o formulário em branco não pode apagar a loja", () => {
  /**
   * O bug mais caro desta sessão, e o único que apagou dado de verdade.
   *
   * O formulário de Configurações nascia com o que o APARELHO tinha e nunca
   * era atualizado — `useState(config)` só vale na primeira renderização. A
   * configuração da loja chega da nuvem um instante depois, e a tela
   * continuava mostrando o padrão: "Minha Assistência TI", telefone em
   * branco, sem logo, sem chat do Telegram.
   *
   * Isso já seria ruim. O grave é o passo seguinte: clicar em Salvar subia
   * esse formulário em branco por cima do que estava gravado, apagando para
   * TODOS os aparelhos de uma vez. Foi o que aconteceu — o celular abriu
   * vazio, o dono salvou, e o computador perdeu tudo junto.
   *
   * Duas travas vieram daí, e este teste guarda a segunda: nada sobe antes
   * da leitura da nuvem terminar.
   */
  const PADRAO: Config = { ...base, nomeLoja: "Minha Assistência TI" };
  const REAL: Config = {
    ...base,
    nomeLoja: "Nova Geração Informática",
    telefoneLoja: "4132830643",
    cnpj: "52679376000178",
    enderecoLoja: "Rua Castro, 855",
    telegramChatId: "123456789",
  };

  it("o padrão e o que a loja tem são diferentes: gravar um por cima do outro apaga", () => {
    expect(precisaGravarNaNuvem(REAL, PADRAO)).toBe(true);
  });

  it("o que sobe carrega TODOS os campos, então subir em branco apaga todos", () => {
    // É por isso que a trava é obrigatória: não existe gravação parcial que
    // salve a situação depois que o formulário está vazio.
    const emBranco = paraNuvem(PADRAO);
    expect(emBranco.telefoneLoja).toBe("");
    expect(emBranco.cnpj).toBe("");
    expect(emBranco.telegramChatId).toBeUndefined();
  });

  it("com a nuvem lida, os campos da loja continuam inteiros", () => {
    const r = paraNuvem(REAL);
    expect(r.nomeLoja).toBe("Nova Geração Informática");
    expect(r.telefoneLoja).toBe("4132830643");
    expect(r.telegramChatId).toBe("123456789");
  });
});
