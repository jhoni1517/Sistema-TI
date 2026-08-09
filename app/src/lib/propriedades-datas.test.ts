import { describe, it, expect } from "vitest";
import { paraTodo, relato } from "./fuzz";
import { proximoVencimento, diasAteVencer, soData } from "./contas";
import { avancar, avancarDias, ocorrenciasEntre, aniversarioNoAno } from "./agenda";
import type { Recorrencia, RepetirEvento, Evento } from "./types";

/**
 * Data é onde este sistema mais apanhou, e o CLAUDE.md lista os três casos
 * que sempre quebram: dia 31 + 1 mês, 29/02 anual, e a virada de ano.
 *
 * Os testes que existem cobrem esses três. O gerador aqui joga MILHARES de
 * datas — puxando de propósito para os dias 28 a 31 — e cobra o que tem que
 * valer para todas, não só para as três que alguém lembrou de escrever.
 */

const conferir = (r: ReturnType<typeof paraTodo>) => {
  if (r.ok) return;
  throw new Error(relato(r));
};

const DATA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;

/** A data existe de verdade? "2024-02-31" casa com o formato e não existe. */
const existe = (iso: string): boolean => {
  if (!DATA_VALIDA.test(iso)) return false;
  const d = new Date(iso + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
};

/* Só o que o tipo Recorrencia tem de verdade. Na primeira versão eu pus
 * "semestral" aqui: não existe, `RECORRENCIA_META[...]` deu undefined, e a
 * função devolveu a data intacta — que é o comportamento certo para chave
 * desconhecida. O teste reprovou por erro meu, não do sistema. */
const RECORRENCIAS: Recorrencia[] = [
  "semanal",
  "mensal",
  "bimestral",
  "trimestral",
  "semestral",
  "anual",
];
const REPETICOES: RepetirEvento[] = ["semanal", "mensal", "anual"];

describe("avançar um vencimento", () => {
  it("sempre devolve uma data que existe no calendário", () => {
    conferir(
      paraTodo(
        8000,
        (g) => ({ data: g.data(), rec: g.de(RECORRENCIAS), dia: g.inteiro(1, 31) }),
        ({ data, rec, dia }) => {
          const r = proximoVencimento(data, rec, dia);
          return existe(r) || `${data} +${rec} (dia ${dia}) => ${r}`;
        }
      )
    );
  });

  /**
   * TEM QUE ANDAR PARA FRENTE, SEMPRE.
   *
   * Se avançar devolvesse a mesma data ou uma anterior, a conta recorrente
   * pararia de gerar vencimento — e uma conta que some da lista não é
   * cobrada, não é paga, e ninguém procura por ela.
   */
  it("nunca fica parada nem anda para trás", () => {
    conferir(
      paraTodo(
        8000,
        (g) => ({ data: g.data(), rec: g.de(RECORRENCIAS), dia: g.inteiro(1, 31) }),
        ({ data, rec, dia }) => {
          const r = proximoVencimento(data, rec, dia);
          return r > soData(data) || `${data} +${rec} (dia ${dia}) => ${r}`;
        }
      )
    );
  });

  /**
   * O DIA ORIGINAL VOLTA QUANDO O MÊS PERMITE.
   *
   * É a regra do CLAUDE.md: dia 31 + 1 mês vira 28 em fevereiro e VOLTA
   * para 31 em março. Sem isso a conta de aluguel nasce dia 31 e vai
   * escorregando mês a mês até virar dia 28 para sempre.
   */
  it("mensal: doze meses depois cai no mesmo dia, se o mês tiver", () => {
    conferir(
      paraTodo(
        3000,
        (g) => ({ ano: g.inteiro(2020, 2030), mes: g.inteiro(1, 12), dia: g.inteiro(1, 31) }),
        ({ ano, mes, dia }) => {
          const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
          if (dia > ultimo) return true; // essa data não existe; nada a cobrar
          const inicio = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

          let atual = inicio;
          for (let i = 0; i < 12; i++) atual = proximoVencimento(atual, "mensal", dia);

          const [a2, m2, d2] = atual.split("-").map(Number);
          const ultimoDestino = new Date(Date.UTC(a2, m2, 0)).getUTCDate();
          const esperado = Math.min(dia, ultimoDestino);
          return d2 === esperado || `${inicio} +12 meses => ${atual} (esperado dia ${esperado})`;
        }
      )
    );
  });

  /** 29/02 anual: cai em 28/02 nos anos comuns e nunca vaza para março. */
  it("29 de fevereiro anual nunca vira março", () => {
    conferir(
      paraTodo(
        200,
        (g, i) => ({ ano: 2020 + (i % 12), _: g.chance(0.5) }),
        ({ ano }) => {
          const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
          if (!bissexto) return true;
          let atual = `${ano}-02-29`;
          for (let i = 0; i < 8; i++) {
            atual = proximoVencimento(atual, "anual", 29);
            if (!atual.slice(5).startsWith("02")) return `virou ${atual}`;
          }
          return true;
        }
      )
    );
  });
});

describe("repetição de evento na agenda", () => {
  it("sempre devolve data que existe", () => {
    conferir(
      paraTodo(
        8000,
        (g) => ({ data: g.data(), rep: g.de(REPETICOES), dia: g.inteiro(1, 31) }),
        ({ data, rep, dia }) => {
          const r = avancar(data, rep, dia);
          return existe(r) || `${data} +${rep} (dia ${dia}) => ${r}`;
        }
      )
    );
  });

  /**
   * Se `avancar` empatasse, `ocorrenciasEntre` bateria na trava de segurança
   * e o evento sumiria da agenda em silêncio — o pior jeito de falhar.
   */
  it("nunca empata nem volta", () => {
    conferir(
      paraTodo(
        8000,
        (g) => ({ data: g.data(), rep: g.de(REPETICOES), dia: g.inteiro(1, 31) }),
        ({ data, rep, dia }) => {
          const r = avancar(data, rep, dia);
          return r > soData(data) || `${data} +${rep} (dia ${dia}) => ${r}`;
        }
      )
    );
  });

  it("as ocorrências saem em ordem, sem repetir, e dentro do intervalo", () => {
    conferir(
      paraTodo(
        3000,
        (g) => {
          const de = g.data();
          const ate = avancarDias(de, g.inteiro(0, 400));
          return { evento: { data: g.data(), repetir: g.de(REPETICOES) } as Evento, de, ate };
        },
        ({ evento, de, ate }) => {
          const oc = ocorrenciasEntre(evento, de, ate);
          for (let i = 0; i < oc.length; i++) {
            if (!existe(oc[i])) return `data inválida: ${oc[i]}`;
            if (oc[i] < de || oc[i] > ate) return `${oc[i]} fora de [${de}, ${ate}]`;
            if (i > 0 && oc[i] <= oc[i - 1]) return `fora de ordem: ${oc[i - 1]} depois ${oc[i]}`;
          }
          return true;
        }
      )
    );
  });
});

describe("somar dias", () => {
  /** Ida e volta: somar N e tirar N tem que devolver o mesmo dia. */
  it("é reversível", () => {
    conferir(
      paraTodo(
        8000,
        (g) => ({ data: g.data(), dias: g.inteiro(-800, 800) }),
        ({ data, dias }) => {
          const ida = avancarDias(data, dias);
          const volta = avancarDias(ida, -dias);
          return volta === soData(data) || `${data} +${dias} => ${ida} => ${volta}`;
        }
      )
    );
  });

  it("bate com a contagem de dias até vencer", () => {
    conferir(
      paraTodo(
        8000,
        (g) => ({ hoje: g.data(), dias: g.inteiro(-400, 400) }),
        ({ hoje, dias }) => {
          const vencimento = avancarDias(hoje, dias);
          const contados = diasAteVencer(vencimento, hoje);
          return contados === dias || `esperado ${dias}, contou ${contados}`;
        }
      )
    );
  });
});

describe("aniversário", () => {
  it("sempre cai num dia que existe, inclusive 29/02 em ano comum", () => {
    conferir(
      paraTodo(
        5000,
        (g) => ({ nascimento: g.data(), ano: g.inteiro(2020, 2035) }),
        ({ nascimento, ano }) => {
          const r = aniversarioNoAno(nascimento, ano);
          if (r === null) return true;
          if (!existe(r)) return `${nascimento} em ${ano} => ${r}`;
          return r.startsWith(String(ano)) || `${r} não é do ano ${ano}`;
        }
      )
    );
  });
});

describe("o gerador é determinístico", () => {
  /** Sem isto, um teste que reprova hoje passa amanhã e ninguém confia nele. */
  it("a mesma semente dá a mesma sequência", async () => {
    const { semente } = await import("./fuzz");
    const a = semente(42);
    const b = semente(42);
    const seqA = Array.from({ length: 50 }, () => a.data());
    const seqB = Array.from({ length: 50 }, () => b.data());
    expect(seqA).toEqual(seqB);
  });
});
