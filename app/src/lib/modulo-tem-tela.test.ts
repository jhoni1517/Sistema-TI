import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RAMO_META, RAMOS, type Modulo } from "./ramos";

/**
 * Módulo declarado tem que ter tela de verdade.
 *
 * O ramo "pizzaria" declarava quatro módulos — pdv, delivery, mesas e
 * producao — e a descrição que a loja lê ao escolher o ramo prometia
 * "pedido com fila de preparo, entrega e comanda de mesa". Três desses não
 * existiam: nenhuma página, nenhuma rota, nenhuma entrada no menu. Uma
 * pizzaria que assinasse recebia o PDV e mais nada do que define a casa
 * dela.
 *
 * O `ramos.test.ts` cobrava o contrário — que todo módulo pertença a algum
 * ramo — e por isso passava: os três tinham dono, só não tinham tela.
 *
 * Erro de declaração é pior do que erro de código: ele não quebra nada,
 * não aparece em teste nenhum, e só é descoberto pelo cliente que pagou
 * por uma tela que não existe.
 *
 * Este teste lê o menu do disco em vez de recopiar a lista, pelo mesmo
 * motivo de sempre: cópia dentro de teste envelhece igual e os dois passam
 * a mentir juntos.
 */

/** Módulos que de propósito não têm entrada no menu, e por quê */
const SEM_MENU: Record<string, string> = {
  // Página pública, aberta pelo link que a loja manda ao cliente. Quem
  // abre é o cliente, não a loja — não existe menu para ele.
  rastreio: "página pública do cliente, aberta por link",
};

/**
 * A dívida que ainda existe, escrita com nome e sobrenome.
 *
 * Estes dois módulos são prometidos e não existem. Estão aqui em vez de
 * fora do teste porque uma lista explícita é uma dívida COBRÁVEL: qualquer
 * um que abra este arquivo vê o que falta, e apagar a linha é o critério
 * de aceite da tela quando ela for feita.
 *
 * O teste continua valendo para o que importa mais: nenhum módulo NOVO
 * pode ser declarado sem tela. Foi assim que os três primeiros passaram.
 */
const AINDA_NAO_FEITOS: Record<string, string> = {
  delivery: "entrega, taxa e entregador (bloco 3)",
};

/** Os módulos que o menu declara, lidos do arquivo do disco */
function modulosComMenu(): Set<string> {
  const fonte = readFileSync(
    resolve(__dirname, "../components/Layout.tsx"),
    "utf8"
  );
  return new Set(
    [...fonte.matchAll(/modulo:\s*"(\w+)"/g)].map((m) => m[1])
  );
}

describe("módulo prometido é módulo entregue", () => {
  it("todo módulo de todo ramo tem entrada no menu", () => {
    const comMenu = modulosComMenu();
    const faltando: string[] = [];

    for (const ramo of RAMOS) {
      for (const m of RAMO_META[ramo].modulos) {
        if (comMenu.has(m) || SEM_MENU[m] || AINDA_NAO_FEITOS[m]) continue;
        faltando.push(`${m} (prometido por ${ramo})`);
      }
    }

    expect(
      faltando,
      `Módulo declarado sem tela: ${faltando.join(", ")}.\n` +
        "Ou a tela precisa ser feita e ligada no menu de Layout.tsx, ou o " +
        "módulo sai de RAMO_META — e a descrição do ramo sai junto, porque " +
        "é ela que a loja lê antes de assinar."
    ).toEqual([]);
  });

  it("a dívida escrita continua sendo dívida: nada saiu da lista sozinho", () => {
    // Quando a tela for feita, a linha some daqui e o teste de cima passa a
    // cobrar de verdade. Se alguém apagar a linha SEM fazer a tela, o teste
    // de cima falha na hora — que é exatamente o ponto.
    const comMenu = modulosComMenu();
    for (const m of Object.keys(AINDA_NAO_FEITOS)) {
      expect(comMenu.has(m), `${m} já tem tela: tire da lista de dívida`).toBe(false);
    }
  });

  it("a descrição do ramo não promete módulo que ele não tem", () => {
    // A descrição aparece na escolha do ramo, em Configurações. É o texto
    // de venda do sistema; prometer ali o que não existe é o pior lugar.
    const pistas: Record<string, Modulo> = {
      entrega: "delivery",
      comanda: "mesas",
      mesa: "mesas",
      preparo: "producao",
      cozinha: "producao",
    };

    for (const ramo of RAMOS) {
      const { descricao, modulos } = RAMO_META[ramo];
      const texto = descricao.toLowerCase();
      for (const [palavra, modulo] of Object.entries(pistas)) {
        if (!texto.includes(palavra)) continue;
        expect(
          modulos.includes(modulo),
          `${ramo} fala em "${palavra}" na descrição, mas não tem o módulo ${modulo}`
        ).toBe(true);
      }
    }
  });
});
