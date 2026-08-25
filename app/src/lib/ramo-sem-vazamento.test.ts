import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/*
 * ============================================================
 *  NADA DE ASSISTÊNCIA TÉCNICA EM QUEM NÃO CONSERTA
 * ============================================================
 *
 * O pedido: "não pode ter área de TI nas áreas não correspondentes".
 *
 * A tela da OS já estava resolvida — ela só existe para quem tem o módulo.
 * O vazamento estava nas telas COMPARTILHADAS, que todo ramo abre:
 *
 *   Clientes ....... crachá "0 OS" em cada linha, e "Ordens: 0" no histórico
 *   Relatórios ..... "Ordens por status" e "Comissão por técnico", vazios
 *   Configurações .. prazo de abandono, taxa de guarda, comissão do técnico
 *                    e o cartão inteiro sobre a senha do aparelho
 *   Caixa .......... "OS" na lista de categorias de entrada
 *   Busca .......... "OS, cliente, telefone, IMEI..." no campo
 *   Conferência .... "aparelho entregue sem pagamento"
 *
 * Nenhum desses quebrava nada. Todos diziam à pizzaria que ela devia ter
 * ordens de serviço e não tem — e o de Configurações era pior: oferecia
 * ajustar como guardar a senha do celular do cliente a uma loja que nunca
 * guarda senha nenhuma.
 *
 * ------------------------------------------------------------
 * O QUE ESTE TESTE COBRA
 *
 * Que cada palavra de conserto numa tela compartilhada esteja atrás de uma
 * condição de ramo. Não é possível conferir isso lendo a tela renderizada
 * sem um navegador, então a conferência é no código: o texto tem que estar
 * dentro do alcance de `temOS`, `temModulo(..., "os")` ou `temRecurso`.
 */

const raiz = new URL("../", import.meta.url);
const ler = (rel: string): string => readFileSync(new URL(rel, raiz), "utf8");

/** Comentário que EXPLICA o vazamento não pode contar como o vazamento */
const semComentarios = (fonte: string): string =>
  fonte
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/** Telas que TODO ramo abre. A da OS não entra: ela só existe com o módulo. */
const COMPARTILHADAS = [
  "pages/Clientes.tsx",
  "pages/Relatorios.tsx",
  "pages/Config.tsx",
  "pages/Caixa.tsx",
  "pages/Dashboard.tsx",
  "pages/Estoque.tsx",
  "components/BuscaGlobal.tsx",
  "components/Conferencia.tsx",
];

describe("tela compartilhada não fala de conserto sem conferir o ramo", () => {
  for (const tela of COMPARTILHADAS) {
    const fonte = semComentarios(ler(tela));

    it(`${tela}: toda palavra de conserto está atrás de uma condição`, () => {
      /*
       * As palavras que só existem em quem conserta. Ficam fora da lista as
       * genéricas ("serviço", "peça"), que valem em qualquer ramo: uma
       * pizzaria também cobra serviço e uma mercearia também compra peça de
       * reposição.
       */
      const SO_DE_CONSERTO =
        /Ordens por status|Comissão por técnico|Nenhuma OS|ordens de serviço|aparelho entregue|senha do aparelho|Prazo para retirada|Taxa de armazenamento/i;

      const linhas = fonte.split("\n");
      const suspeitas = linhas
        .map((l, i) => ({ l, i }))
        .filter(({ l }) => SO_DE_CONSERTO.test(l));

      // Cada suspeita tem que ter uma condição de ramo nas linhas anteriores
      // do mesmo bloco. Trinta linhas cobre com folga o cartão mais alto.
      for (const { l, i } of suspeitas) {
        const antes = linhas.slice(Math.max(0, i - 30), i + 1).join("\n");
        expect(
          /temOS|temModulo\([^)]*"os"\)|temRecurso\([^)]*"senhaAparelho"\)/.test(antes),
          `${tela}:${i + 1} fala de conserto sem conferir o ramo:\n  ${l.trim()}`
        ).toBe(true);
      }
    });
  }
});

describe("os pontos exatos que vazavam", () => {
  it("Clientes: o crachá de OS e o histórico de ordens", () => {
    const t = semComentarios(ler("pages/Clientes.tsx"));
    expect(t).toContain("temOS && (");
    // O número de OS por cliente era um zero fixo em toda linha da lista.
    expect(t).toMatch(/temOS &&[\s\S]{0,200}osCount/);
  });

  it("Relatórios: o gráfico de OS e a comissão do técnico", () => {
    const t = semComentarios(ler("pages/Relatorios.tsx"));
    expect(t.match(/\{temOS && \(/g)?.length).toBe(2);
  });

  it("Configurações: guarda, comissão e senha do aparelho", () => {
    const t = semComentarios(ler("pages/Config.tsx"));
    expect(t).toMatch(/temModulo\(ramoContratado, "os"\)/);
    // Guardar senha de terceiro é o maior risco jurídico do sistema. O ajuste
    // não pode aparecer para quem não guarda nenhuma.
    expect(t).toMatch(/temRecurso\(ramoContratado, "senhaAparelho"\)/);
  });

  it("Caixa: a categoria OS sai da lista de entrada", () => {
    const t = semComentarios(ler("pages/Caixa.tsx"));
    expect(t).toContain("catsEntrada(temModulo(ramo, \"os\"))");
    // A lista fixa com "OS" dentro não pode voltar.
    expect(t).not.toMatch(/const CATS_ENTRADA = \[[^\]]*"OS"/);
  });

  it("Busca: o campo não promete OS nem IMEI a quem não tem", () => {
    const t = semComentarios(ler("components/BuscaGlobal.tsx"));
    expect(t).toMatch(/temOS\s*\?/);
    expect(t).not.toMatch(/placeholder="OS, cliente/);
  });
});
