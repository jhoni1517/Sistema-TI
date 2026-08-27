import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ehCompraEstoque, receitaBruta, despesasOperacionais, lucroLiquido, custoProdutos } from "./calc";
import { SO_NO_APARELHO, paraNuvem, precisaGravarNaNuvem } from "./config";
import type { Config, MovimentoCaixa } from "./types";

function semente(s: number) {
  let x = s >>> 0 || 1;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
}
const r = semente(112358);
const din = () => Math.round(r() * 100000) / 100;

const mov = (x: Partial<MovimentoCaixa>): MovimentoCaixa =>
  ({
    id: "m",
    tipo: "entrada",
    valor: 100,
    formaPagamento: "dinheiro",
    descricao: "x",
    data: "2026-08-27T12:00:00.000Z",
    ...x,
  }) as MovimentoCaixa;

describe("Propriedades do resultado: compra de estoque NÃO é despesa do mês", () => {
  it("repor peça não entra em despesa: senão a venda lucrativa mostra prejuízo", () => {
    /*
     * Repor peça é troca de dinheiro por mercadoria; vira custo quando a
     * peça é VENDIDA (CMV). Contar como despesa E como custo mostrava
     * lucro negativo numa venda lucrativa.
     */
    const compra = mov({ tipo: "saida", valor: 800, compraEstoque: true });
    const aluguel = mov({ tipo: "saida", valor: 1200, compraEstoque: false });

    expect(ehCompraEstoque(compra)).toBe(true);
    expect(ehCompraEstoque(aluguel)).toBe(false);

    const movs = [
      mov({ tipo: "entrada", valor: 3000, custoRelacionado: 900 }),
      compra,
      aluguel,
    ];
    expect(despesasOperacionais(movs), "a compra de estoque entrou na despesa").toBe(1200);
    expect(custoProdutos(movs)).toBe(900);
    // 3000 de receita - 900 de CMV - 1200 de aluguel = 900. A compra de
    // R$ 800 não aparece: ela virou mercadoria na prateleira.
    expect(lucroLiquido(movs)).toBe(900);
  });

  it("o lucro é receita - CMV - despesa, em 20 mil meses sorteados", () => {
    for (let i = 0; i < 20000; i++) {
      const movs: MovimentoCaixa[] = Array.from({ length: 1 + Math.floor(r() * 8) }, () => {
        const entrada = r() < 0.5;
        return mov({
          tipo: entrada ? "entrada" : r() < 0.8 ? "saida" : "sangria",
          valor: din(),
          custoRelacionado: entrada ? din() : 0,
          compraEstoque: !entrada && r() < 0.4,
        });
      });
      const esperado =
        Math.round(
          (receitaBruta(movs) - custoProdutos(movs) - despesasOperacionais(movs)) * 100
        ) / 100;
      expect(lucroLiquido(movs), `mês ${i}`).toBeCloseTo(esperado, 2);
    }
  });

  it("sangria nunca conta como despesa — é dinheiro trocando de bolso", () => {
    // Sangria é papel saindo da gaveta para o cofre. Contar como despesa
    // faria a loja parecer que gastou o próprio faturamento.
    const movs = [mov({ tipo: "entrada", valor: 1000 }), mov({ tipo: "sangria", valor: 700 })];
    expect(despesasOperacionais(movs)).toBe(0);
    expect(lucroLiquido(movs)).toBe(1000);
  });
});

describe("Propriedades das Configurações: sobe TUDO menos o que fica no aparelho", () => {
  it("todo campo novo da Config sobe para a nuvem sozinho", () => {
    /*
     * O bug: `saveConfig` gravava uma lista escrita à mão, e oito
     * configurações criadas depois ficaram de fora sem ninguém perceber.
     * Salvavam no aparelho, a tela dizia "salvo", e na máquina seguinte
     * estava tudo em branco.
     *
     * Esta sonda lê a INTERFACE do disco e cobra campo por campo. Campo
     * novo entra aqui sozinho, sem ninguém lembrar de nada.
     */
    const fonte = readFileSync(join(__dirname, "types.ts"), "utf8");
    const bloco = fonte.match(/export interface Config\s*\{([\s\S]*?)\n\}/)![1];
    const campos = bloco
      .split("\n")
      .map((l) => l.match(/^\s{2}(\w+)\??\s*:/)?.[1])
      .filter((x): x is string => !!x);

    expect(campos.length, "não achei os campos da Config").toBeGreaterThan(40);

    const cheia = Object.fromEntries(campos.map((c) => [c, "valor"])) as unknown as Config;
    const naNuvem = paraNuvem(cheia);

    for (const campo of campos) {
      if ((SO_NO_APARELHO as readonly string[]).includes(campo)) {
        expect(naNuvem, `${campo} é do aparelho e vazou para a nuvem`).not.toHaveProperty(campo);
      } else {
        expect(naNuvem, `${campo} não sobe para a nuvem`).toHaveProperty(campo);
      }
    }

    // E os dois campos da nota de serviço, criados agora, estão lá.
    expect(campos).toContain("codigoServicoPadrao");
    expect(campos).toContain("aliquotaIssPadrao");
    expect(naNuvem).toHaveProperty("codigoServicoPadrao");
    expect(naNuvem).toHaveProperty("aliquotaIssPadrao");
  });

  it("credencial e aparência NUNCA sobem", () => {
    // Limpar o localStorage no logout apagava as credenciais da nuvem; a
    // outra ponta do mesmo problema é subi-las para o banco.
    expect([...SO_NO_APARELHO]).toEqual(
      expect.arrayContaining(["supabaseUrl", "supabaseKey", "tema", "corDestaque"])
    );
  });

  it("mexer só na cor não dispara gravação na nuvem", () => {
    /*
     * A paleta chama o salvamento a cada clique para dar prévia ao vivo.
     * Sem esta pergunta, cada clique viraria uma gravação — no 4G do
     * balcão, com o dedo arrastando.
     */
    const base = { nomeLoja: "Loja", corDestaque: "azul" } as unknown as Config;
    expect(precisaGravarNaNuvem(base, { ...base, corDestaque: "verde" })).toBe(false);
    expect(precisaGravarNaNuvem(base, { ...base, nomeLoja: "Outra" })).toBe(true);
  });
});
