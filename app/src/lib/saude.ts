import { emTeste, situacaoDe, type Loja, type Situacao } from "./assinatura";
import { whatsappLink } from "./format";

/**
 * Saúde das lojas: quem está sumindo, quem está acabando o teste sem usar e
 * quem está feliz o bastante para indicar.
 *
 * Loja que cancela avisa semanas antes, pelo uso. Quando o recado chega como
 * "quero cancelar", já não tem conversa. A contagem vem de
 * `saude_das_lojas()` no banco; a conta mora aqui, com teste.
 */

/** O que o banco devolve por loja. Só contagem, nunca o conteúdo. */
export interface UsoRecente {
  loja: string;
  ultimoUso: string | null;
  /** OS abertas nos últimos 28 dias */
  osRecentes: number;
  /** OS abertas nos 28 dias antes desses */
  osAnteriores: number;
  vendasRecentes: number;
  vendasAnteriores: number;
  caixaRecentes: number;
  funcoes: string[];
}

export type Grupo = "risco" | "teste_acabando" | "feliz";

export interface SaudeLoja {
  loja: Loja;
  situacao: Situacao;
  diasSemUso: number | null;
  /** OS + vendas por semana, média das últimas 4 */
  porSemana: number;
  porSemanaAntes: number;
  /** Quanto o uso caiu, de 0 a 1. null quando não há base para comparar. */
  queda: number | null;
  funcoes: string[];
  teste: number | null;
  /** 0 a 100: quanto maior, mais perto de cancelar */
  risco: number;
  grupo: Grupo | null;
  motivos: string[];
}

export const NOMES_FUNCOES: Record<string, string> = {
  os: "OS",
  pdv: "PDV",
  caixa: "Caixa",
  estoque: "Estoque",
  clientes: "Clientes",
  fiado: "Fiado",
  contas: "Contas a pagar",
  comandas: "Comandas",
  notas: "Nota fiscal",
  agenda: "Agenda",
  site: "Orçamento pelo site",
  trocas: "Trocas (RMA)",
  metas: "Metas",
  tarefas: "Tarefas",
};

/**
 * Base mínima para falar em queda: 4 atendimentos no mês anterior.
 * Loja que fez 1 e depois 0 "caiu 100%" — e não é notícia, é segunda-feira.
 */
export const BASE_MINIMA = 4;

/** Uso bom o bastante para pedir indicação: 5 atendimentos por semana. */
export const USO_FELIZ_SEMANA = 5;

const DIA = 86400000;

/** Dias inteiros entre a data do último uso e hoje, contados pela data (UTC). */
export function diasDesde(iso: string | null | undefined, hoje: string): number | null {
  if (!iso) return null;
  const a = Date.parse(iso.slice(0, 10) + "T00:00:00Z");
  const b = Date.parse(hoje.slice(0, 10) + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / DIA));
}

const uma = (n: number) => Math.round(n * 10) / 10;

/**
 * A nota de risco e o grupo de uma loja.
 *
 * Isenta (a sua) fica sempre fora dos grupos: não cancela, não indica.
 */
export function avaliarLoja(loja: Loja, uso: UsoRecente | undefined, hoje: string): SaudeLoja {
  const situacao = situacaoDe(loja);
  const recentes = (uso?.osRecentes ?? 0) + (uso?.vendasRecentes ?? 0);
  const anteriores = (uso?.osAnteriores ?? 0) + (uso?.vendasAnteriores ?? 0);
  const diasSemUso = diasDesde(uso?.ultimoUso, hoje);
  const queda = anteriores >= BASE_MINIMA ? Math.max(0, uma(1 - recentes / anteriores)) : null;
  const funcoes = uso?.funcoes ?? [];
  // Dias de teste que faltam; null = não está em teste.
  const teste = emTeste(loja) ? diasDesde(hoje, loja.venceEm || "") : null;

  let risco = 0;
  const motivos: string[] = [];
  if (diasSemUso === null) {
    risco += 40;
    motivos.push("nunca usou");
  } else if (diasSemUso >= 14) {
    risco += 40;
    motivos.push(`${diasSemUso} dias sem uso`);
  } else if (diasSemUso >= 7) {
    risco += 25;
    motivos.push(`${diasSemUso} dias sem uso`);
  } else if (diasSemUso >= 3) {
    risco += 10;
  }
  if (queda !== null && queda > 0.5) {
    risco += 30;
    motivos.push(`uso caiu ${Math.round(queda * 100)}%`);
  } else if (queda !== null && queda > 0.25) {
    risco += 15;
    motivos.push(`uso caiu ${Math.round(queda * 100)}%`);
  }
  if (funcoes.length <= 1) {
    risco += 15;
    motivos.push(funcoes.length === 0 ? "nenhuma função usada" : "usa uma função só");
  } else if (funcoes.length === 2) {
    risco += 5;
  }
  if (situacao === "bloqueada") {
    risco += 25;
    motivos.push("bloqueada");
  } else if (situacao === "leitura" || situacao === "tolerancia") {
    risco += 15;
    motivos.push("mensalidade atrasada");
  }
  risco = Math.min(100, risco);

  const semUso = recentes === 0 || diasSemUso === null || diasSemUso >= 3;
  let grupo: Grupo | null = null;
  if (loja.isento) grupo = null;
  else if (teste !== null && teste <= 3 && (loja.venceEm || "").slice(0, 10) >= hoje && semUso) grupo = "teste_acabando";
  else if (teste === null && queda !== null && queda > 0.5) grupo = "risco";
  else if (
    teste === null &&
    situacao === "ativa" &&
    recentes / 4 >= USO_FELIZ_SEMANA &&
    (queda === null || queda <= 0.1) &&
    diasSemUso !== null &&
    diasSemUso <= 3
  )
    grupo = "feliz";

  return {
    loja,
    situacao,
    diasSemUso,
    porSemana: uma(recentes / 4),
    porSemanaAntes: uma(anteriores / 4),
    queda,
    funcoes,
    teste,
    risco,
    grupo,
    motivos,
  };
}

export function avaliarLojas(lojas: Loja[], uso: Record<string, UsoRecente>, hoje: string): SaudeLoja[] {
  return lojas.map((l) => avaliarLoja(l, uso[l.id], hoje)).sort((a, b) => b.risco - a.risco);
}

/**
 * A mensagem pronta de cada grupo, em voz de balcão e sem emoji (chega como
 * "?" em alguns aparelhos). Fala com a pessoa, não com o CNPJ.
 */
export function mensagemSaude(s: SaudeLoja): string {
  const nome = s.loja.nome ? `, pessoal da ${s.loja.nome.trim()}` : "";
  if (s.grupo === "teste_acabando") {
    const quando = s.teste === 0 ? "hoje" : s.teste === 1 ? "amanhã" : `em ${s.teste} dias`;
    return (
      `Oi${nome}! Aqui é do Sistema TI. Seu teste acaba ${quando} e vi que ainda não deu tempo de usar direito. ` +
      `Posso configurar com você por aqui mesmo, em 15 minutos? Cadastro a primeira OS junto e já fica rodando. Qual o melhor horário?`
    );
  }
  if (s.grupo === "risco") {
    return (
      `Oi${nome}! Aqui é do Sistema TI. Vi que o movimento no sistema caiu nas últimas semanas. ` +
      `Aconteceu alguma coisa ou tem algo travando? Se tiver uma tela atrapalhando, me fala que eu resolvo.`
    );
  }
  if (s.grupo === "feliz") {
    return (
      `Oi${nome}! Aqui é do Sistema TI. Vi que a loja está usando bastante o sistema, fico feliz demais. ` +
      `Posso te pedir um favor? Um depoimento curto de como está sendo, ou o contato de uma loja amiga que precise de um sistema. Ajuda muito quem está começando.`
    );
  }
  return `Oi${nome}! Aqui é do Sistema TI. Passando para saber como está sendo o sistema. Precisa de alguma coisa?`;
}

export const linkSaude = (s: SaudeLoja): string => whatsappLink(s.loja.whatsapp || "", mensagemSaude(s));
