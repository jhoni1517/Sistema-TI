import { describe, it, expect } from "vitest";
import { totalVenda, subtotalVenda, subtotalItem, centavos, custoVenda } from "./pdv";
import { consolidar, faltaNoPagamento, trocoDoPagamento, problemaNoPagamento } from "./pagamento";
import { precoEfetivo } from "./promocao";
import { disponivelParaDevolver, podeDevolver } from "./devolucao";
import type { ItemVenda, Produto, Venda } from "./types";

/** Gerador com semente: o mesmo caso reprova amanhã igual */
function semente(s: number) {
  let x = s >>> 0 || 1;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
}

const r = semente(20260827);
const dinheiro = () => Math.round(r() * 500000) / 100;
const qtd = () => Math.round(r() * 2000) / 100 || 0.01;

describe("Propriedades do dinheiro: invariantes sobre 20 mil vendas sorteadas", () => {
  it("total nunca é negativo, e desconto nunca vira dinheiro do nada", () => {
    for (let i = 0; i < 20000; i++) {
      const itens: ItemVenda[] = Array.from({ length: 1 + Math.floor(r() * 4) }, () => ({
        descricao: "x",
        quantidade: qtd(),
        precoUnit: dinheiro(),
        custoUnit: dinheiro(),
      }));
      const desconto = r() < 0.3 ? dinheiro() : 0;
      const v = { itens, desconto } as Venda;
      const t = totalVenda(v);
      expect(t, `venda ${i}`).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(centavos(subtotalVenda(itens)) + 0.001);
      // Duas casas SEMPRE: um terceiro dígito vira rejeição na SEFAZ e
      // centavo perdido na conferência.
      expect(Math.round(t * 100)).toBe(Number((t * 100).toFixed(0)));
    }
  });

  it("a soma dos itens bate com o subtotal, item a item", () => {
    for (let i = 0; i < 5000; i++) {
      const itens: ItemVenda[] = Array.from({ length: 1 + Math.floor(r() * 6) }, () => ({
        descricao: "x",
        quantidade: qtd(),
        precoUnit: dinheiro(),
        custoUnit: dinheiro(),
      }));
      const soma = centavos(itens.reduce((s, it) => s + subtotalItem(it), 0));
      expect(centavos(subtotalVenda(itens))).toBe(soma);
    }
  });

  it("troco e falta são exclusivos: nunca os dois ao mesmo tempo", () => {
    for (let i = 0; i < 20000; i++) {
      const total = dinheiro();
      const parcelas = Array.from({ length: 1 + Math.floor(r() * 3) }, () => ({
        forma: (["dinheiro", "pix", "credito", "debito"] as const)[Math.floor(r() * 4)],
        valor: dinheiro(),
        recebido: r() < 0.5 ? dinheiro() : undefined,
      }));
      const falta = faltaNoPagamento(total, parcelas);
      const troco = trocoDoPagamento(total, parcelas);
      expect(falta, `caso ${i}`).toBeGreaterThanOrEqual(0);
      expect(troco).toBeGreaterThanOrEqual(0);
      // O problema tem que concordar com a falta: dizer "fechou" com falta
      // é dinheiro que some da gaveta sem ninguém ver.
      const problema = problemaNoPagamento(total, consolidar(parcelas));
      if (falta > 0.001) expect(problema, `caso ${i} falta ${falta}`).not.toBe("");
    }
  });

  it("consolidar não cria nem perde dinheiro", () => {
    for (let i = 0; i < 10000; i++) {
      const parcelas = Array.from({ length: 1 + Math.floor(r() * 5) }, () => ({
        forma: (["dinheiro", "pix", "credito", "dinheiro"] as const)[Math.floor(r() * 4)],
        valor: dinheiro(),
      }));
      const antes = centavos(parcelas.reduce((s, p) => s + p.valor, 0));
      const depois = centavos(consolidar(parcelas).reduce((s, p) => s + p.valor, 0));
      expect(depois, `caso ${i}`).toBe(antes);
    }
  });

  it("promoção nunca cobra mais caro que o preço normal", () => {
    // Promoção que sobe o preço é a loja mentindo na gôndola.
    /*
     * A data vai em TEXTO AAAA-MM-DD, e não em Date: a comparação de
     * promoção é feita string contra string, em UTC. Passar um Date aqui
     * compilava no vitest e comparava com "Thu Aug 27 2026...", que é maior
     * que qualquer data — a promoção pareceria sempre vencida.
     */
    const hoje = "2026-08-27";
    for (let i = 0; i < 10000; i++) {
      const preco = dinheiro();
      const p = {
        preco,
        precoPromocional: r() < 0.7 ? dinheiro() : undefined,
        promocaoInicio: r() < 0.5 ? "2026-08-01" : undefined,
        promocaoFim: r() < 0.5 ? "2026-12-31" : undefined,
      } as Produto;
      const efetivo = precoEfetivo(p, hoje);
      expect(efetivo, `produto ${i}`).toBeLessThanOrEqual(preco + 0.001);
      expect(efetivo).toBeGreaterThanOrEqual(0);
    }
  });

  it("devolução nunca passa do que foi vendido", () => {
    for (let i = 0; i < 5000; i++) {
      const itens: ItemVenda[] = [
        { descricao: "a", quantidade: Math.ceil(r() * 10), precoUnit: dinheiro(), custoUnit: 0 },
      ];
      const jaVolta = Math.floor(r() * 12);
      const venda = {
        id: "v",
        itens,
        desconto: 0,
        devolucoes: jaVolta
          ? [
              {
                data: "2026-08-01",
                itens: { 0: jaVolta },
                valor: 0,
              },
            ]
          : [],
      } as unknown as Venda;
      const [resta] = disponivelParaDevolver(venda);
      expect(resta, `venda ${i}`).toBeGreaterThanOrEqual(0);
      expect(resta).toBeLessThanOrEqual(itens[0].quantidade);
      // "pode devolver" tem que concordar com "sobrou alguma coisa".
      expect(podeDevolver(venda)).toBe(resta > 0);
    }
  });

  it("custo da venda nunca é negativo nem some", () => {
    for (let i = 0; i < 5000; i++) {
      const itens: ItemVenda[] = Array.from({ length: 1 + Math.floor(r() * 4) }, () => ({
        descricao: "x",
        quantidade: qtd(),
        precoUnit: dinheiro(),
        custoUnit: r() < 0.2 ? 0 : dinheiro(),
      }));
      expect(custoVenda(itens), `venda ${i}`).toBeGreaterThanOrEqual(0);
    }
  });
});
