import { supabase } from "./supabase";
import { PLANO_META, planoDe, type RecursoIA } from "./planos";

/**
 * A tela falando com /api/ia.
 *
 * A sessão vai no cabeçalho, e é por ela que o servidor descobre a loja e o
 * plano — a loja NUNCA vai no corpo, senão bastava trocar o id para gastar
 * os créditos de outra.
 *
 * O que volta é o texto CRU da IA. Quem valida é a lib de cada recurso
 * (leitura-nota, sugestao, voz-os), com teste — e nada é gravado sem a
 * pessoa revisar na tela.
 */
/**
 * A IA está ligada nesta instalação? Liga sozinha quando existe
 * GEMINI_API_KEY na Vercel — quem responde é o servidor, uma vez por
 * abertura do sistema.
 *
 * Sem chave, os botões de IA NEM APARECEM: botão que existe e responde
 * "falta chave" é botão quebrado na frente do cliente. Falha de rede na
 * pergunta também esconde (o lado seguro), e a próxima abertura pergunta
 * de novo. A sugestão pelo histórico da loja não depende disto: é conta
 * feita no navegador.
 */
let consulta: Promise<boolean> | null = null;
export function iaLigada(): Promise<boolean> {
  if (!consulta) {
    consulta = fetch("/api/ia?acao=status")
      .then((r) => (r.ok ? r.json() : { ligada: false }))
      .then((d) => d?.ligada === true)
      .catch(() => {
        consulta = null;
        return false;
      });
  }
  return consulta;
}

export interface RespostaIA {
  bruto: string;
  usados: number;
  limite: number;
}

export async function perguntarIA(
  acao: "ler-nota" | "diagnostico" | "voz",
  corpo: Record<string, unknown>
): Promise<RespostaIA> {
  const sessao = (await supabase?.auth.getSession())?.data.session?.access_token;
  if (!sessao) throw new Error("Sua sessão expirou. Entre de novo e repita.");
  let r: Response;
  try {
    r = await fetch(`/api/ia?acao=${acao}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sessao}`, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
  } catch {
    throw new Error("Sem internet agora. Nada foi gasto; tenta de novo quando voltar.");
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.erro || `O servidor respondeu ${r.status}.`);
  return d as RespostaIA;
}

/** O arquivo como base64 puro (sem o "data:...;base64,"), para ir no JSON */
export function paraBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result).split(",")[1] || "");
    leitor.onerror = () => reject(new Error("Não consegui ler o arquivo."));
    leitor.readAsDataURL(b);
  });
}

/** "3 de 20 este mês", para a pessoa saber quanto ainda tem */
export const usoDoMes = (usados: number, limite: number): string =>
  limite > 0 ? `${usados} de ${limite} este mês` : "";

/** O limite do plano, para a tela avisar antes de gastar */
export const limiteDoPlano = (plano: string | null | undefined, recurso: RecursoIA): number =>
  PLANO_META[planoDe(plano)].limitesIA[recurso];
