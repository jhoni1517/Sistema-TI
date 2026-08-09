import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  semPrazo,
  fimDoTeste,
  situacaoDe,
  diasParaVencer,
  emTeste,
  testeAcabou,
  diasDeTeste,
  podeLiberarTeste,
  podeReabrirTeste,
  usouDeVerdade,
  nomeDoMotivo,
  MOTIVOS_TESTE,
  type Loja,
} from "./assinatura";

const loja = (x: Partial<Loja> = {}): Loja => ({ id: "l1", nome: "Pizzaria", ...x }) as Loja;

/** Uma data a N dias de hoje, no formato que vem do banco */
const emDias = (n: number): string => new Date(Date.now() + n * 86400000).toISOString();

/**
 * `situacao_loja()` no banco diz `if v_vence is null then return 'ativa'`, e
 * era assim que TODA loja nova nascia: sem data. Na prática, quem entrava no
 * sistema ganhava acesso ilimitado e de graça — e a lista do administrador
 * mostrava "Em dia", que é verdade e é justamente o que engana.
 */
describe("loja que usa o sistema de graça e para sempre", () => {
  it("sem data de vencimento é loja sem prazo", () => {
    expect(semPrazo(loja())).toBe(true);
    expect(semPrazo(loja({ venceEm: null }))).toBe(true);
  });

  it("e ainda assim o sistema a considera ATIVA — é este o buraco", () => {
    // A regra não muda aqui de propósito: mudá-la cortaria na hora o acesso
    // de todo cliente pagante que só não tem a data preenchida. O que muda
    // é o administrador PASSAR A VER.
    expect(situacaoDe(loja())).toBe("ativa");
  });

  it("com data, não é mais sem prazo", () => {
    expect(semPrazo(loja({ venceEm: "2026-12-01" }))).toBe(false);
  });

  it("a loja isenta não conta: é a de quem administra o sistema", () => {
    expect(semPrazo(loja({ isento: true }))).toBe(false);
  });

  it("a bloqueada não conta: ela já não usa nada", () => {
    expect(semPrazo(loja({ bloqueada: true }))).toBe(false);
  });
});

describe("o fim do teste", () => {
  const hoje = new Date("2026-08-09T15:00:00.000Z");

  it("conta de HOJE, não do vencimento anterior", () => {
    // Liberar teste para quem está vencido há três meses não pode virar
    // três meses de crédito.
    expect(fimDoTeste(7, hoje).toISOString().slice(0, 10)).toBe("2026-08-16");
  });

  it("zero dias não empurra nada", () => {
    expect(fimDoTeste(0, hoje).getTime()).toBe(hoje.getTime());
  });

  it("dias negativos não puxam o vencimento para trás", () => {
    // Um número negativo digitado por engano em Ajustes cortaria o acesso
    // da loja no mesmo instante.
    expect(fimDoTeste(-30, hoje).getTime()).toBe(hoje.getTime());
  });

  it("depois do teste, a loja vence de verdade", () => {
    const fim = fimDoTeste(7, hoje).toISOString();
    expect(diasParaVencer(fim)).toBeGreaterThan(0);
    expect(semPrazo(loja({ venceEm: fim }))).toBe(false);
  });
});

/**
 * Separar teste de assinatura paga.
 *
 * As duas são uma data no futuro em `venceEm`, e por isso a loja em teste
 * caía na régua da mensalidade: recebia "sua mensalidade venceu há 2 dias"
 * de uma mensalidade que nunca contratou. O que era venda a fazer chegava
 * como cobrança.
 */
describe("quem está em teste e quem está pagando", () => {
  it("as duas datas iguais é teste correndo", () => {
    const l = loja({ venceEm: emDias(5), testeAte: emDias(5) });
    expect(emTeste(l)).toBe(true);
    expect(testeAcabou(l)).toBe(false);
    expect(diasDeTeste(l)).toBeGreaterThan(0);
  });

  it("sem a marca do teste, é loja pagante", () => {
    // É o caso de toda loja anterior a esta migração: só `venceEm`. Ela não
    // pode virar teste sozinha, senão recebe "seu teste acabou" tendo pago.
    expect(emTeste(loja({ venceEm: emDias(20) }))).toBe(false);
  });

  it("pagar durante o teste tira a loja do teste sem apagar nada", () => {
    /*
     * `registrar_pagamento` empurra `venceEm` um mês para frente do maior
     * entre o vencimento atual e hoje. `testeAte` fica onde estava, e a
     * conta `venceEm <= testeAte` vira falsa no mesmo instante.
     *
     * É por isso que a marca é uma comparação e não um campo para alguém
     * lembrar de limpar: o que ninguém precisa lembrar é o que ninguém
     * esquece.
     */
    const fimDoTesteISO = emDias(3);
    const pagou = loja({ venceEm: emDias(33), testeAte: fimDoTesteISO });
    expect(emTeste(pagou)).toBe(false);
    expect(situacaoDe(pagou)).toBe("ativa");
  });

  it("teste que passou da data é teste que não converteu", () => {
    const l = loja({ venceEm: emDias(-2), testeAte: emDias(-2) });
    expect(emTeste(l)).toBe(true);
    expect(testeAcabou(l)).toBe(true);
  });

  it("a loja isenta nunca está em teste: é a de quem administra", () => {
    expect(emTeste(loja({ isento: true, venceEm: emDias(5), testeAte: emDias(5) }))).toBe(
      false
    );
  });

  it("data inválida não vira teste por acidente", () => {
    expect(emTeste(loja({ venceEm: "sei la", testeAte: "sei la" }))).toBe(false);
  });
});

describe("para quem dá para liberar teste", () => {
  it("loja sem prazo nenhum: é o caso que este botão existe para resolver", () => {
    expect(podeLiberarTeste(loja())).toBe(true);
  });

  it("quem já pagou, não", () => {
    /*
     * `liberar_teste` conta a partir de HOJE. Numa loja que pagou o ano
     * inteiro ela jogaria o vencimento de dezembro para a semana que vem —
     * cortar acesso de cliente pagante é o erro mais caro deste sistema.
     * A trava de verdade está no banco; esta é só para o botão sumir.
     */
    expect(podeLiberarTeste(loja({ ultimoPagamento: emDias(-10) }))).toBe(false);
  });

  it("quem já está em teste, não: para esse o botão é esticar ou encurtar", () => {
    expect(podeLiberarTeste(loja({ venceEm: emDias(4), testeAte: emDias(4) }))).toBe(false);
  });

  it("teste que já acabou também não: para ele o caminho é esticar", () => {
    /*
     * A pessoa sumiu e um mês depois volta pedindo para ver de novo. Quem
     * resolve isso é "+7 dias" (ajustar_teste conta de hoje quando o teste
     * já morreu), e não um segundo "liberar".
     *
     * Uma loja tem UM teste, que estica e encurta. Dois começos separados
     * dariam duas histórias diferentes para a mesma loja, e aí ninguém mais
     * sabe quantos dias de cortesia ela já levou.
     */
    expect(podeLiberarTeste(loja({ venceEm: emDias(-30), testeAte: emDias(-30) }))).toBe(
      false
    );
  });

  it("a sua própria loja, não", () => {
    expect(podeLiberarTeste(loja({ isento: true }))).toBe(false);
  });
});

/**
 * Campo novo no TypeScript exige coluna nova no banco.
 *
 * `esquema.test.ts` só varre as interfaces de types.ts, e `Loja` mora aqui.
 * Sem esta conferência, `testeAte` viraria mais um
 * "Could not find the 'testeAte' column of 'lojas' in the schema cache" —
 * que na tela de Lojas derruba a leitura inteira e some com a lista.
 */
describe("a coluna do teste existe na migração", () => {
  const sql = readFileSync(
    resolve(__dirname, "..", "..", "supabase-migracao-teste-gratis.sql"),
    "utf8"
  );

  it('lojas ganha "testeAte"', () => {
    expect(sql).toContain('alter table lojas add column if not exists "testeAte"');
  });

  it("a tela pede a coluna na leitura", () => {
    // Sem isso `emTeste` devolve falso para todas as lojas e nada aparece.
    const lib = readFileSync(resolve(__dirname, "assinatura.ts"), "utf8");
    expect(lib).toContain('"venceEm", "testeAte"');
  });

  it("liberar_teste e ajustar_teste gravam as duas datas juntas", () => {
    // Mexer só em `venceEm` faria a loja deixar de ser teste ao ganhar um
    // dia a mais — e passar a receber cobrança de mensalidade.
    const gravacoes = sql.match(/set "venceEm" = [^;]*"testeAte" = [^;]*/g) || [];
    expect(gravacoes.length).toBeGreaterThanOrEqual(3);
  });
});


describe("reabrir o teste de quem já testou", () => {
  it("teste que acabou pode ser reaberto", () => {
    expect(podeReabrirTeste(loja({ venceEm: emDias(-30), testeAte: emDias(-30) }))).toBe(true);
  });

  it("teste que ainda corre, não: para esse o botão é esticar", () => {
    /*
     * Reabrir teste que está correndo daria dias de graça a quem já os tem, e
     * ainda contaria como cortesia nova — a loja apareceria com "3o teste"
     * tendo feito um só.
     */
    expect(podeReabrirTeste(loja({ venceEm: emDias(2), testeAte: emDias(2) }))).toBe(false);
  });

  it("loja que já pagou, nunca", () => {
    expect(
      podeReabrirTeste(
        loja({ venceEm: emDias(-30), testeAte: emDias(-30), ultimoPagamento: emDias(-5) })
      )
    ).toBe(false);
  });

  it("loja que nunca testou, também não", () => {
    // Para essa o caminho é `liberar_teste`, que conta como o primeiro.
    expect(podeReabrirTeste(loja())).toBe(false);
  });
});

/**
 * O que a loja fez lá dentro separa dois telefonemas.
 *
 * Quem cadastrou 200 produtos e sumiu esbarrou em alguma coisa concreta; quem
 * cadastrou 3 nunca começou. Antes disto os dois recebiam o mesmo recado.
 */
describe("a loja usou de verdade?", () => {
  it("quem mal mexeu não usou", () => {
    expect(usouDeVerdade({ loja: "1", produtos: 3, clientes: 1, ordens: 0, vendas: 0 })).toBe(
      false
    );
  });

  it("quem construiu alguma coisa, usou", () => {
    expect(usouDeVerdade({ loja: "1", produtos: 40, clientes: 5, ordens: 0, vendas: 12 })).toBe(
      true
    );
  });

  it("sem dado nenhum não inventa que usou", () => {
    // A migração nova pode não ter rodado: `resumoUsoLojas` devolve vazio, e
    // vazio não pode virar "esta loja não usou" na tela.
    expect(usouDeVerdade(null)).toBe(false);
    expect(usouDeVerdade(undefined)).toBe(false);
  });
});

describe("o motivo de não ter fechado", () => {
  it("cada motivo da lista tem nome para a tela", () => {
    for (const m of MOTIVOS_TESTE) {
      expect(nomeDoMotivo(m.k), `motivo ${m.k} sem nome`).toBe(m.nome);
    }
  });

  it("sem motivo não escreve nada", () => {
    expect(nomeDoMotivo(null)).toBe("");
    expect(nomeDoMotivo("")).toBe("");
  });

  it("motivo antigo que saiu da lista aparece cru, e não some", () => {
    // Trocar a lista não pode apagar da tela o que já foi anotado: o dado
    // continua no banco, e some da vista é o pior dos dois mundos.
    expect(nomeDoMotivo("motivo_de_2025")).toBe("motivo_de_2025");
  });
});

/**
 * Campo novo no TypeScript exige coluna nova no banco — de novo.
 *
 * `esquema.test.ts` varre só as interfaces de types.ts, e `Loja` mora em
 * assinatura.ts. Sem esta conferência, `motivoTeste` viraria mais um
 * "Could not find the 'motivoTeste' column of 'lojas' in the schema cache".
 */
describe("as colunas do controle de teste existem na migração", () => {
  const sql = readFileSync(
    resolve(__dirname, "..", "..", "supabase-migracao-teste-controle.sql"),
    "utf8"
  );

  it.each([["motivoTeste"], ["testesDados"]])('lojas ganha "%s"', (col) => {
    expect(sql).toContain(`alter table lojas add column if not exists "${col}"`);
  });

  it.each([["dias_reteste"], ["tolerancia_no_teste"]])(
    "sistema_config ganha %s",
    (col) => {
      expect(sql).toContain(`alter table sistema_config add column if not exists ${col}`);
    }
  );

  it("a tela pede as colunas novas na leitura", () => {
    const lib = readFileSync(resolve(__dirname, "assinatura.ts"), "utf8");
    expect(lib).toContain('"motivoTeste", "testesDados"');
  });

  it("a assinatura antiga de encerrar_teste é removida antes da nova", () => {
    /*
     * Com as duas no banco, `encerrar_teste(id)` vira "function name is not
     * unique" e o botão para de funcionar — sem erro na tela, porque quem
     * chama é o Supabase e o recado vem em inglês.
     */
    expect(sql).toContain("drop function if exists encerrar_teste(uuid);");
  });

  it("a tolerância no teste é decidida no BANCO, não só na tela", () => {
    // `situacao_loja()` é quem as políticas de escrita consultam. Esconder a
    // regra só na tela deixaria a loja gravando por mais cinco dias enquanto
    // o painel dizia que ela estava travada.
    const situacao = sql.slice(sql.indexOf("create or replace function situacao_loja()"));
    expect(situacao).toContain("tolerancia_no_teste");
  });

  it("o resumo de uso devolve contagem, e nunca conteúdo", () => {
    /*
     * Quantos produtos a loja cadastrou é da relação comercial. QUAIS
     * produtos, o nome dos clientes e o valor das vendas não são — e a
     * função do banco não pode abrir essa porta, porque ela roda como
     * `security definer` e enxerga tudo.
     */
    const fn = sql.slice(sql.indexOf("create or replace function resumo_uso_lojas()"));
    const ate = fn.slice(0, fn.indexOf("$$;") + 3);
    expect(ate).toContain("select count(*)");
    expect(ate).not.toMatch(/select\s+(nome|valor|descricao|total)\b/);
  });
});
