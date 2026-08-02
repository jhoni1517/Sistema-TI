import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Clique duplo no balcão acontece o tempo todo.
 *
 * O dedo bate duas vezes, a tela não respondeu ainda porque o 4G do balcão
 * está ruim, e a pessoa clica de novo — é o comportamento certo de quem usa
 * o sistema, não descuido. A gravação é `async`: entre o clique e a resposta
 * cabe outro clique inteiro.
 *
 * O estrago é sempre dinheiro em dobro, e sempre invisível:
 *
 * - Receber uma OS duas vezes lança a receita duas vezes E baixa as peças
 *   duas vezes. A conferência não pega: ela procura OS entregue SEM
 *   lançamento, não com dois.
 * - Lançar o fiado duas vezes faz o cliente dever o dobro, e o robô de
 *   cobrança vai atrás do valor errado.
 * - Baixar uma conta duas vezes tira o dinheiro do caixa duas vezes.
 *
 * A trava já existia no PDV, na devolução, no caixa, na entrada de nota e
 * no inventário, sempre com a mesma forma: confere a trava, levanta, grava,
 * baixa no fim. E não existia na OS, no fiado, nas contas e nas cotações.
 *
 * Regra escrita não segura nada. Este teste segura: ele lê o código do
 * disco e cobra a trava de toda função que grava dinheiro.
 */

const RAIZ = new URL("../..", import.meta.url).pathname;

/** As gravações que não podem acontecer duas vezes por um clique repetido */
const DINHEIRO = ["saveMovimento(", "saveFiado("];

/**
 * Corta o arquivo em funções assíncronas e cobra a trava de cada uma que
 * grava dinheiro.
 *
 * A trava é reconhecida pela FORMA, não por uma lista de nomes: `set<Algo>
 * (true)` antes de gravar, com `<algo>` conferido antes disso e baixado
 * depois. Lista de nomes envelhece — as telas usam `gravando`, `salvando` e
 * `recebendo`, e a próxima vai inventar outro.
 *
 * Os blocos NÃO se sobrepõem: um `setGravando(false)` de outro handler mais
 * abaixo no arquivo não pode servir de álibi para este.
 */
export function semTravaDeCliqueDuplo(codigo: string): string[] {
  const marcas = [...codigo.matchAll(/\basync\s*(?:function\b|\()/g)].map((m) => m.index!);
  const problemas: string[] = [];

  for (const [k, inicio] of marcas.entries()) {
    const bloco = codigo.slice(inicio, marcas[k + 1] ?? codigo.length);

    const posicoes = DINHEIRO.map((d) => bloco.indexOf(d)).filter((i) => i >= 0);
    if (posicoes.length === 0) continue;

    // Só o que vem ANTES da gravação conta: levantar a trava depois de já
    // ter lançado no caixa não impede nada.
    const antes = bloco.slice(0, Math.min(...posicoes));

    const sobe = /\bset([A-Z]\w*)\(\s*true\s*\)/.exec(antes);
    if (!sobe) {
      problemas.push("grava dinheiro sem levantar trava de clique duplo");
      continue;
    }

    const flag = sobe[1][0].toLowerCase() + sobe[1].slice(1);
    if (!new RegExp(`\\b${flag}\\b`).test(antes.slice(0, sobe.index))) {
      // Levantar sem conferir não impede nada: o segundo clique levanta de
      // novo e segue direto para a gravação.
      problemas.push(`levanta ${flag} sem conferir antes`);
      continue;
    }

    if (!new RegExp(`\\bset${sobe[1]}\\(\\s*false\\s*\\)`).test(bloco)) {
      // Trava que sobe e não desce prende a tela de vez, o que é pior do que
      // o problema que ela veio resolver.
      problemas.push(`levanta ${flag} e nunca baixa`);
    }
  }

  return problemas;
}

function arquivos(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === "dist" || nome.startsWith(".")) continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivos(caminho, achados);
    else if (/\.tsx?$/.test(nome) && !nome.includes(".test.")) achados.push(caminho);
  }
  return achados;
}

describe("clique duplo no balcão acontece o tempo todo", () => {
  it("o detector acha a gravação desprotegida", () => {
    // Sem isto, um erro no detector faria o teste de baixo passar sempre —
    // pior do que não ter teste, porque dá a impressão de estar coberto.
    const errado = `onReceber={async (forma) => { await saveMovimento(m); }}`;
    expect(semTravaDeCliqueDuplo(errado)).toEqual([
      "grava dinheiro sem levantar trava de clique duplo",
    ]);
  });

  it("o detector aceita a trava completa", () => {
    const certo = `const pagar = async () => {
      if (gravando) return;
      setGravando(true);
      try { await saveMovimento(m); } finally { setGravando(false); }
    };`;
    expect(semTravaDeCliqueDuplo(certo)).toEqual([]);
  });

  it("o nome da trava é livre: as telas já usam três diferentes", () => {
    const certo = `const receber = async () => {
      if (recebendo) return;
      setRecebendo(true);
      try { await saveFiado(f); } finally { setRecebendo(false); }
    };`;
    expect(semTravaDeCliqueDuplo(certo)).toEqual([]);
  });

  it("levantar sem conferir não protege nada", () => {
    // O segundo clique levanta a trava de novo e segue direto para a
    // gravação: sem a conferência, a trava é decoração.
    const errado = `const pagar = async () => {
      setGravando(true);
      try { await saveMovimento(m); } finally { setGravando(false); }
    };`;
    expect(semTravaDeCliqueDuplo(errado)).toEqual(["levanta gravando sem conferir antes"]);
  });

  it("trava que sobe e não desce prende a tela de vez", () => {
    const errado = `const pagar = async () => {
      if (gravando) return;
      setGravando(true);
      await saveMovimento(m);
    };`;
    expect(semTravaDeCliqueDuplo(errado)).toEqual(["levanta gravando e nunca baixa"]);
  });

  it("a trava de outro handler não serve de álibi", () => {
    // Os blocos não se sobrepõem: sem isso, o `setGravando(false)` de uma
    // função mais abaixo no arquivo cobriria a que está desprotegida.
    const codigo = `const receber = async () => { await saveMovimento(m); };
      const outro = async () => { if (gravando) return; setGravando(true); setGravando(false); };`;
    expect(semTravaDeCliqueDuplo(codigo)).toEqual([
      "grava dinheiro sem levantar trava de clique duplo",
    ]);
  });

  it("função que não mexe em dinheiro não é problema deste teste", () => {
    expect(semTravaDeCliqueDuplo(`const f = async () => { await saveProduto(p); };`)).toEqual([]);
  });

  it("nenhuma tela grava dinheiro sem trava de clique duplo", () => {
    const achados = arquivos(join(RAIZ, "src")).flatMap((f) =>
      semTravaDeCliqueDuplo(readFileSync(f, "utf8")).map((p) => `${f.replace(RAIZ, "")}: ${p}`)
    );
    expect(achados).toEqual([]);
  });
});
