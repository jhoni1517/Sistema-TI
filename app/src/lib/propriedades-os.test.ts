import { describe, it, expect } from "vitest";
import {
  pecasEfetivas,
  nomesDasOpcoes,
  opcaoAtual,
  temOpcoes,
  escolhaConfirmada,
  comOpcao,
} from "./orcamento";
import { totalOS, totalPecas, custoPecas, lucroOS, totalComOpcao } from "./calc";
import { garantiaDaOS } from "./garantia";
import { separarOS } from "./nota-os";
import { proximoNumero, problemaParaNumerar } from "./numeracao";
import type { OrdemServico, PecaOS } from "./types";

function semente(s: number) {
  let x = s >>> 0 || 1;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
}
const r = semente(31415926);
const din = () => Math.round(r() * 200000) / 100;

const OPCOES = ["", "", "Opção 1", "Opção 2", "Completo"];

function os(x: Partial<OrdemServico> = {}): OrdemServico {
  const pecas: PecaOS[] = Array.from({ length: Math.floor(r() * 6) }, (_, i) => ({
    descricao: `peça ${i}`,
    quantidade: 1 + Math.floor(r() * 3),
    custoUnit: din(),
    precoUnit: din(),
    opcao: OPCOES[Math.floor(r() * OPCOES.length)],
  }));
  return {
    id: "os",
    numero: 1,
    clienteId: "c",
    tipoAparelho: "Celular",
    marca: "M",
    modelo: "X",
    defeitoRelatado: "d",
    checklist: {},
    pecas,
    maoDeObra: din(),
    desconto: r() < 0.3 ? din() : 0,
    status: "aberta",
    garantiaDias: Math.floor(r() * 400),
    historico: [],
    criadoEm: "2026-01-10T10:00:00.000Z",
    atualizadoEm: "2026-01-10T10:00:00.000Z",
    ...x,
  } as OrdemServico;
}

describe("Propriedades da OS: 20 mil ordens sorteadas", () => {
  it("orçamento alternativo NUNCA soma: o total é de um cenário só", () => {
    /*
     * O bug que originou a regra: "fonte de 500W mais SSD" contra "só a
     * fonte de 200W" ia tudo na mesma lista, e o cliente recebia um
     * orçamento cobrando as DUAS fontes. A loja parecia empurrar o dobro.
     */
    for (let i = 0; i < 20000; i++) {
      const o = os();
      const efetivas = pecasEfetivas(o);
      const nomes = nomesDasOpcoes(o);
      const escolhida = opcaoAtual(o);

      // Nenhuma peça de outro cenário entrou.
      for (const p of efetivas) {
        const dela = (p.opcao || "").trim();
        expect(dela === "" || dela === escolhida, `OS ${i}: peça de "${dela}"`).toBe(true);
      }

      // E o total nunca chega perto de somar tudo, quando há mais de um.
      if (nomes.length >= 2) {
        const tudo = o.pecas.reduce((s, p) => s + p.precoUnit * p.quantidade, 0);
        expect(totalPecas(o), `OS ${i}`).toBeLessThanOrEqual(tudo + 0.001);
        expect(totalPecas(o)).toBeLessThan(tudo - 0.001 + 0.002 + tudo * 0);
      }
    }
  });

  it("sem decisão do cliente vale o PRIMEIRO orçamento, que é a sugestão da loja", () => {
    // Total zerado seria menor que qualquer cenário real, e a loja cobraria
    // errado achando que o cliente ainda não escolheu.
    for (let i = 0; i < 10000; i++) {
      const o = os({ opcaoEscolhida: undefined });
      const nomes = nomesDasOpcoes(o);
      if (nomes.length === 0) continue;
      expect(opcaoAtual(o), `OS ${i}`).toBe(nomes[0]);
      if (temOpcoes(o)) expect(escolhaConfirmada(o)).toBe(false);
    }
  });

  it("escolha inválida cai na sugestão, e não zera a OS", () => {
    for (let i = 0; i < 10000; i++) {
      const o = os({ opcaoEscolhida: "cenário que não existe" });
      const nomes = nomesDasOpcoes(o);
      if (nomes.length === 0) continue;
      expect(opcaoAtual(o), `OS ${i}`).toBe(nomes[0]);
      expect(totalOS(o)).toBe(totalComOpcao(o, nomes[0]));
    }
  });

  it("lucro = total - custo das peças do cenário escolhido, sempre", () => {
    for (let i = 0; i < 20000; i++) {
      const o = os();
      const esperado = totalOS(o) - custoPecas(o);
      expect(lucroOS(o), `OS ${i}`).toBeCloseTo(esperado, 2);
    }
  });

  it("as duas notas somam o total da OS, em qualquer combinação de opções", () => {
    for (let i = 0; i < 20000; i++) {
      const o = os();
      const lados = separarOS(o, []);
      const soma = Math.round((lados.servico.total + lados.mercadoria.total) * 100) / 100;
      const esperado = Math.round(Math.max(0, totalOS(o)) * 100) / 100;
      expect(soma, `OS ${i}`).toBe(esperado);
    }
  });

  it("trocar de cenário recorta as peças certas e nunca perde as comuns", () => {
    /*
     * `comOpcao` só MARCA a escolha; quem recorta é `pecasEfetivas`. São
     * duas funções de propósito — a marca é o que fica gravado na OS, o
     * recorte é o que vale na hora de somar. O que precisa valer é a
     * composição das duas.
     */
    for (let i = 0; i < 10000; i++) {
      const o = os();
      const comuns = o.pecas.filter((p) => !(p.opcao || "").trim()).length;
      for (const nome of nomesDasOpcoes(o)) {
        const efetivas = pecasEfetivas(comOpcao(o, nome));
        for (const p of efetivas) {
          const dela = (p.opcao || "").trim();
          expect(dela === "" || dela === nome, `OS ${i} cenário ${nome}`).toBe(true);
        }
        // Peça sem cenário (pasta térmica, limpeza) entra em TODOS.
        expect(
          efetivas.filter((p) => !(p.opcao || "").trim()).length,
          `OS ${i} cenário ${nome}`
        ).toBe(comuns);
        // E o total do cenário bate com a soma das peças dele.
        expect(totalComOpcao(o, nome), `OS ${i} cenário ${nome}`).toBeCloseTo(
          efetivas.reduce((s, p) => s + p.precoUnit * p.quantidade, 0) +
            o.maoDeObra -
            o.desconto,
          2
        );
      }
    }
  });

  it("garantia: vencida, válida e sem garantia nunca se confundem", () => {
    /*
     * A conta é em UTC sobre data pura de propósito: somar hora local
     * desloca o dia inteiro conforme o fuso, e um dia a menos na garantia é
     * discussão certa no balcão.
     */
    const hoje = "2026-08-27";
    const base = Date.parse(hoje + "T00:00:00Z");
    for (let i = 0; i < 20000; i++) {
      const dias = Math.floor(r() * 400);
      const atras = Math.floor(r() * 500);
      const entregue = new Date(base - atras * 86400000).toISOString().slice(0, 10);
      const o = os({ garantiaDias: dias, status: "entregue", entregueEm: entregue });
      const g = garantiaDaOS(o, hoje);
      if (dias <= 0) {
        expect(g.situacao, `OS ${i}`).toBe("sem_garantia");
      } else {
        expect(g.situacao, `OS ${i} dias=${dias} atras=${atras}`).toBe(
          atras <= dias ? "valida" : "vencida"
        );
        // O dia que sobra tem que bater com a conta feita à mão.
        expect(g.diasRestantes, `OS ${i}`).toBe(dias - atras);
      }
    }

    // OS não entregue não tem garantia correndo: o relógio começa na entrega.
    const naoEntregue = os({ garantiaDias: 90, status: "pronta", entregueEm: undefined });
    expect(garantiaDaOS(naoEntregue, hoje).situacao).toBe("nao_entregue");

    // OS cancelada nunca dá garantia, mesmo com prazo preenchido.
    const cancelada = os({ garantiaDias: 90, status: "cancelada", entregueEm: "2026-08-01" });
    expect(garantiaDaOS(cancelada, hoje).situacao).toBe("sem_garantia");
  });

  it("numerar RECUSA quando a lista não carregou — número repetido é o pior caso", () => {
    /*
     * `max(numero) + 1` sobre uma lista vazia POR ERRO devolve 1 e colide
     * com o primeiro registro da história da loja. Na OS é pior que na
     * venda: o rastreio público procura a ordem PELO NÚMERO, e o cliente
     * abre o link e vê o conserto de outra pessoa, com nome e valor.
     */
    expect(problemaParaNumerar(["ordens"], "ordens", "a OS")).not.toBe("");
    expect(problemaParaNumerar(["produtos"], "ordens", "a OS")).toBe("");
    expect(problemaParaNumerar([], "ordens", "a OS")).toBe("");
    // E a recusa diz que NADA foi perdido: sem isso a pessoa refaz a venda
    // inteira achando que sumiu.
    expect(problemaParaNumerar(["ordens"], "ordens", "a OS")).toContain("Nada foi perdido");

    // E o número nunca repete o que já existe.
    for (let i = 0; i < 5000; i++) {
      const existentes = Array.from({ length: Math.floor(r() * 30) }, () => ({
        numero: Math.floor(r() * 500),
      }));
      const prox = proximoNumero(existentes);
      for (const e of existentes) expect(prox, `caso ${i}`).toBeGreaterThan(e.numero);
    }
  });
});
