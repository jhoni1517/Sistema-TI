/**
 * Gerador de casos aleatórios para os testes por propriedade.
 *
 * POR QUE ISTO EXISTE, JÁ QUE O SISTEMA TEM 1300 TESTES
 *
 * Todo teste escrito à mão testa o caso que quem escreveu PENSOU. O bug que
 * sobra é justamente o que ninguém pensou: quantidade 0,3 num item vendido
 * por peso, desconto maior que o carrinho, item com preço negativo que
 * entrou por um campo mal validado.
 *
 * Aqui é o contrário: o gerador inventa milhares de casos e o teste cobra
 * uma verdade que tem que valer SEMPRE ("total nunca é negativo"). Não se
 * escolhe a entrada, escolhe-se a regra.
 *
 * A SEMENTE É FIXA DE PROPÓSITO.
 *
 * Teste aleatório de verdade reprova hoje e passa amanhã, e o time aprende
 * a rodar de novo até passar — que é pior que não ter teste. Com semente,
 * a mesma sequência sai sempre: reprovou, reprova de novo, e o caso pode
 * ser copiado para um teste fixo.
 */

/** As datas estragadas que já apareceram, ou que apareceriam. */
const g_lixoDeData = [
  "",
  "   ",
  "2024-02-30",
  "2024-13-01",
  "2024-00-10",
  "2024-02-00",
  "0000-01-01",
  "24-01-01",
  "2024/01/01",
  "01/01/2024",
  "2024-1-1",
  "abacaxi",
  "2024-02-29T25:00:00Z",
  "9999-12-31",
];

/**
 * Gerador linear congruente (o mesmo do Numerical Recipes).
 *
 * Não serve para criptografia e não é para isso que está aqui: serve para
 * dar a MESMA sequência de números em qualquer máquina e em qualquer versão
 * do Node. `Math.random()` não promete isso.
 */
export function semente(valor: number) {
  let estado = valor >>> 0;
  const proximo = () => {
    estado = (estado * 1664525 + 1013904223) >>> 0;
    return estado / 4294967296;
  };
  return {
    /** Fracionário em [min, max) */
    real: (min: number, max: number) => min + proximo() * (max - min),
    /** Inteiro em [min, max] */
    inteiro: (min: number, max: number) => Math.floor(min + proximo() * (max - min + 1)),
    /** Um item da lista */
    de: <T>(lista: readonly T[]): T => lista[Math.floor(proximo() * lista.length)],
    /** Verdadeiro com a probabilidade dada */
    chance: (p: number) => proximo() < p,
    /**
     * Dinheiro, com os valores que quebram junto dos comuns.
     *
     * Sortear só entre 1 e 100 nunca acha bug: os que doem são o zero, o
     * centavo solto, o negativo que entrou por um campo mal validado e o
     * número grande que estoura a precisão do ponto flutuante.
     */
    dinheiro: () => {
      const r = proximo();
      if (r < 0.06) return 0;
      if (r < 0.1) return -Math.round(proximo() * 5000) / 100;
      if (r < 0.14) return Math.round(proximo() * 100000000) / 100;
      if (r < 0.2) return Math.round(proximo() * 100) / 100;
      return Math.round(proximo() * 50000) / 100;
    },
    /**
     * Quantidade, inteira ou fracionária.
     *
     * Fracionária existe porque a balança manda 0,352 kg — e a conta de
     * dinheiro por peso é onde o centavo se perde.
     */
    quantidade: () => {
      const r = proximo();
      if (r < 0.05) return 0;
      if (r < 0.1) return -Math.floor(proximo() * 5) - 1;
      if (r < 0.35) return Math.round(proximo() * 5000) / 1000;
      return Math.floor(proximo() * 20) + 1;
    },
    /**
     * Data AAAA-MM-DD que EXISTE no calendário, puxando para os dias que
     * quebram: 28 a 31 aparecem muito mais que o normal, porque são eles
     * que somem ao somar um mês, e fevereiro é onde a conta erra.
     *
     * O corte é pelo último dia do mês de verdade, e não por um `min(dia,
     * 31)`. Na primeira versão era o min, e o gerador cuspiu "2020-02-30" e
     * "2030-09-31" — datas que não existem. As propriedades reprovaram, e o
     * erro era do gerador, não do sistema. Fuzzer que inventa entrada
     * impossível gasta a tarde de quem for investigar.
     *
     * Para testar o que o sistema faz com data RUIM existe `dataRuim`, que
     * é outra pergunta e tem outra resposta certa.
     */
    data: () => {
      const ano = 2020 + Math.floor(proximo() * 12);
      const mes = 1 + Math.floor(proximo() * 12);
      const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
      const r = proximo();
      const bruto =
        r < 0.4 ? ultimo - Math.floor(proximo() * 4) : 1 + Math.floor(proximo() * ultimo);
      const dia = Math.min(Math.max(1, bruto), ultimo);
      return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    },

    /**
     * Data estragada, do jeito que ela chega de verdade.
     *
     * Não é hipótese: o banco tem coluna de texto, migração antiga gravou o
     * que veio, e o dono já rodou SQL na mão. Uma data impossível não pode
     * derrubar a tela nem virar outra data impossível mais adiante.
     */
    dataRuim: () =>
      g_lixoDeData[Math.floor(proximo() * g_lixoDeData.length)],
  };
}

export type Gerador = ReturnType<typeof semente>;

/**
 * Roda a propriedade N vezes e devolve o PRIMEIRO caso que reprovou.
 *
 * Devolver o primeiro, e não "reprovou", é o que torna isto útil: o caso
 * vai inteiro para a mensagem do erro, e de lá para um teste fixo.
 */
export function paraTodo<T>(
  quantas: number,
  gerar: (g: Gerador, i: number) => T,
  vale: (caso: T) => boolean | string,
  sementeInicial = 20260809
): { ok: true } | { ok: false; caso: T; motivo: string; rodada: number } {
  const g = semente(sementeInicial);
  for (let i = 0; i < quantas; i++) {
    const caso = gerar(g, i);
    let r: boolean | string;
    try {
      r = vale(caso);
    } catch (e) {
      return {
        ok: false,
        caso,
        motivo: `lançou: ${e instanceof Error ? e.message : String(e)}`,
        rodada: i,
      };
    }
    if (r !== true) {
      return { ok: false, caso, motivo: typeof r === "string" ? r : "propriedade falsa", rodada: i };
    }
  }
  return { ok: true };
}

/** Formata o caso que reprovou para caber na mensagem do vitest. */
export function relato(r: { caso: unknown; motivo: string; rodada: number }): string {
  return `\n  rodada ${r.rodada}: ${r.motivo}\n  caso: ${JSON.stringify(r.caso, null, 2)}\n`;
}
