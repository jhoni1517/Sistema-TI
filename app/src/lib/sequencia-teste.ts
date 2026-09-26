/**
 * A sequência do período grátis: um recado por etapa, escolhido pelo USO e
 * não só pela data.
 *
 * "Complete os primeiros passos" para quem já completou é ruído, e ruído
 * ensina a pessoa a fechar o aviso sem ler — inclusive o do dia 25, que é o
 * que importa. Por isso cada etapa só aparece se ainda faz sentido.
 *
 * A mesma regra existe em api/_teste.js, que manda o e-mail pelo cron
 * diário. `sequencia-teste.test.ts` compara as duas dia a dia.
 */

export type EtapaTeste = "d1" | "d3" | "d7" | "d25";

export interface UsoNoTeste {
  /** 1 no dia em que a loja foi criada */
  diaDoTeste: number;
  /** Dias até o teste acabar (0 = acaba hoje) */
  faltam: number;
  passosCompletos: boolean;
  ordens: number;
  vendas: number;
  /** Vezes que um cliente abriu o rastreio (uma por OS por dia) */
  rastreios: number;
  /** O ramo tem OS? Mercearia não tem, e o recado muda. */
  temOS: boolean;
}

/**
 * Qual recado vale hoje, ou null.
 *
 * Do mais urgente para o menos: o fim do teste passa na frente de tudo,
 * porque é o único que tem prazo.
 */
export function etapaDoTeste(u: UsoNoTeste): EtapaTeste | null {
  if (u.faltam < 0) return null;
  if (u.faltam <= 5) return "d25";
  if (u.diaDoTeste >= 7 && u.diaDoTeste <= 21) return "d7";
  const comecou = u.temOS ? u.ordens > 0 : u.vendas > 0;
  if (u.diaDoTeste >= 3 && u.diaDoTeste <= 6 && !comecou) return "d3";
  if (u.diaDoTeste >= 1 && u.diaDoTeste <= 2 && !u.passosCompletos) return "d1";
  return null;
}

export interface RecadoTeste {
  etapa: EtapaTeste;
  titulo: string;
  texto: string;
}

const vezes = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** O texto de cada etapa, em voz de balcão e sem emoji (vai por e-mail também). */
export function recadoDoTeste(etapa: EtapaTeste, u: UsoNoTeste): RecadoTeste {
  if (etapa === "d1") {
    return {
      etapa,
      titulo: "Complete os primeiros passos",
      texto: u.temOS
        ? "Leva dez minutos: nome e WhatsApp da loja, a logo e um produto no estoque. Com isso a primeira OS já sai com a cara da sua loja."
        : "Leva dez minutos: nome e WhatsApp da loja, a logo e um produto no estoque. Com isso a primeira venda já sai com a cara da sua loja.",
    };
  }
  if (etapa === "d3") {
    return {
      etapa,
      titulo: "Posso configurar com você?",
      texto: u.temOS
        ? "Três dias e nenhuma OS ainda. É normal: o começo é a parte mais chata. Me chama no WhatsApp que eu abro a primeira junto com você, em 15 minutos."
        : "Três dias e nenhuma venda ainda. É normal: o começo é a parte mais chata. Me chama no WhatsApp que eu faço a primeira junto com você, em 15 minutos.",
    };
  }
  if (etapa === "d7") {
    if (!u.temOS) {
      return {
        etapa,
        titulo: `Uma semana: ${vezes(u.vendas, "venda registrada", "vendas registradas")}`,
        texto: "Cada venda registrada é estoque que baixa sozinho e caixa que fecha sem conta de cabeça.",
      };
    }
    if (u.rastreios > 0) {
      return {
        etapa,
        titulo: `Você já economizou ${vezes(u.rastreios, "ligação", "ligações")}`,
        texto: `${vezes(u.rastreios, "vez", "vezes")} um cliente abriu o link para ver como estava o aparelho, em vez de ligar para a loja perguntar.`,
      };
    }
    return {
      etapa,
      titulo: "Mande o link de acompanhamento",
      texto: "Cada cliente que abre o link é uma ligação a menos no balcão. O link sai pronto no WhatsApp da OS.",
    };
  }
  const quando = u.faltam === 0 ? "hoje" : u.faltam === 1 ? "amanhã" : `em ${u.faltam} dias`;
  return {
    etapa,
    titulo: `Seu teste acaba ${quando}`,
    texto: "Garanta a vaga de Fundador: assine antes de acabar e continue de onde parou, com tudo o que já cadastrou.",
  };
}

const DIA = 86400000;
const soData = (iso: string) => Date.parse(iso.slice(0, 10) + "T00:00:00Z");

/** Dia do teste (1 = dia da criação) e dias que faltam, contados pela data. */
export function diasDoTeste(criadoEm: string, venceEm: string, hoje: string): { diaDoTeste: number; faltam: number } {
  const h = soData(hoje);
  return {
    diaDoTeste: Math.round((h - soData(criadoEm)) / DIA) + 1,
    faltam: Math.round((soData(venceEm) - h) / DIA),
  };
}
