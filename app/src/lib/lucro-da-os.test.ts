import { describe, it, expect } from "vitest";
import {
  custoPecas,
  totalOS,
  lucroOS,
  receitaBruta,
  custoProdutos,
  despesasOperacionais,
  lucroLiquido,
  lucroDoMovimento,
} from "./calc";
import type { OrdemServico, MovimentoCaixa } from "./types";

/**
 * ============================================================
 *  UMA OS DE R$ 180 COM PEÇA DE R$ 80
 * ============================================================
 *
 * A pergunta veio do balcão: "entrou o valor total ou só o lucro?".
 *
 * A resposta é que entram os R$ 180 CHEIOS. Tem que ser assim: é o que o
 * cliente pagou e é o que precisa bater com o dinheiro na gaveta no
 * fechamento. Lançar R$ 100 no caixa faria a conferência acusar sobra de
 * R$ 80 todo dia, e diferença que aparece sempre é diferença que a pessoa
 * aprende a ignorar.
 *
 * O custo não se perde: ele viaja JUNTO do lançamento, em `custoRelacionado`,
 * e sai do lucro. O caixa mostra 180; o resultado mostra 100.
 *
 * Este teste percorre a cadeia inteira — a OS, o lançamento que a tela monta,
 * e o lucro do mês — com os números exatos do caso que gerou a pergunta.
 */

const osDoLucas = (): OrdemServico =>
  ({
    id: "os16",
    numero: 16,
    clienteId: "c1",
    pecas: [{ descricao: "Conector de carga", quantidade: 1, custoUnit: 80, precoUnit: 130 }],
    maoDeObra: 50,
    desconto: 0,
    checklist: {},
    historico: [],
    status: "pronta",
    garantiaDias: 90,
    criadoEm: "2026-08-18T10:00:00.000Z",
    atualizadoEm: "2026-08-18T10:00:00.000Z",
  }) as unknown as OrdemServico;

/** O lançamento exatamente como a tela da OS o monta ao receber */
const movimentoDaEntrega = (o: OrdemServico): MovimentoCaixa =>
  ({
    id: "m1",
    tipo: "entrada",
    categoria: "OS",
    descricao: "OS00016 - Lucas Garcia Francisco",
    valor: totalOS(o),
    formaPagamento: "pix",
    osId: o.id,
    custoRelacionado: custoPecas(o),
    data: "2026-08-18T19:14:00.000Z",
  }) as unknown as MovimentoCaixa;

describe("a OS antes de receber", () => {
  const os = osDoLucas();

  it("cobra R$ 180 do cliente", () => {
    expect(totalOS(os)).toBe(180);
  });

  it("custou R$ 80 para a loja", () => {
    expect(custoPecas(os)).toBe(80);
  });

  it("o lucro da OS é R$ 100", () => {
    expect(lucroOS(os)).toBe(100);
  });
});

describe("o que entra no caixa", () => {
  const mov = movimentoDaEntrega(osDoLucas());

  it("entra o valor CHEIO, e não o lucro", () => {
    // Lançar R$ 100 faria a conferência acusar sobra de R$ 80 todo dia.
    expect(mov.valor).toBe(180);
  });

  it("o custo vai junto, gravado na mesma linha", () => {
    expect(mov.custoRelacionado).toBe(80);
  });

  it("a linha do caixa consegue mostrar custo e sobra", () => {
    // Sem isto o custo existe, está gravado, e é invisível na tela — que foi
    // exatamente o que gerou a dúvida.
    expect(lucroDoMovimento(mov)).toEqual({ custo: 80, lucro: 100 });
  });

  it("entrada sem custo cadastrado não inventa margem", () => {
    // "lucro R$ 5,00" numa venda de R$ 5,00 sem custo seria afirmar 100% de
    // margem que ninguém conferiu.
    expect(lucroDoMovimento({ ...mov, custoRelacionado: 0 })).toBeNull();
    expect(lucroDoMovimento({ ...mov, custoRelacionado: undefined })).toBeNull();
  });

  it("saída e sangria não têm lucro para mostrar", () => {
    expect(lucroDoMovimento({ ...mov, tipo: "saida" })).toBeNull();
    expect(lucroDoMovimento({ ...mov, tipo: "sangria" })).toBeNull();
  });
});

describe("o resultado do mês", () => {
  const mov = movimentoDaEntrega(osDoLucas());

  it("receita 180, custo 80, lucro 100", () => {
    const movs = [mov];
    expect(receitaBruta(movs)).toBe(180);
    expect(custoProdutos(movs)).toBe(80);
    expect(lucroLiquido(movs)).toBe(100);
  });

  it("a compra da peça NÃO é descontada de novo", () => {
    /*
     * Repor peça é troca de dinheiro por mercadoria: ela vira custo quando é
     * vendida. Contar como despesa do mês E como CMV desconta os mesmos
     * R$ 80 duas vezes, e o lucro de R$ 100 apareceria como R$ 20.
     *
     * A categoria é o que decide, e "Compra de peça" está na lista.
     */
    const movs = [
      mov,
      { tipo: "saida", valor: 80, categoria: "Compra de peça" } as MovimentoCaixa,
    ];
    expect(despesasOperacionais(movs)).toBe(0);
    expect(lucroLiquido(movs)).toBe(100);
  });

  it("a mesma peça lançada como Despesa comum desconta duas vezes", () => {
    // Não é o sistema errando: é a categoria errada no lançamento. Fica
    // registrado aqui porque é a explicação de "meu lucro sumiu".
    const movs = [
      mov,
      { tipo: "saida", valor: 80, categoria: "Despesa" } as MovimentoCaixa,
    ];
    expect(lucroLiquido(movs)).toBe(20);
  });

  it("aluguel e energia pesam no resultado, como devem", () => {
    const movs = [
      mov,
      { tipo: "saida", valor: 1700, categoria: "Aluguel" } as MovimentoCaixa,
    ];
    expect(lucroLiquido(movs)).toBe(-1600);
  });
});
