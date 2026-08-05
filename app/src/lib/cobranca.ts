/**
 * Textos de cobrança da mensalidade.
 *
 * ATENÇÃO: a função tipoDoAviso existe DUAS VEZES — aqui e copiada dentro
 * de api/cobranca.js. Não é descuido: as funções da Vercel rodam fora do
 * build do Vite e não conseguem importar TypeScript. Se mexer na régua de
 * dias aqui, mexa lá também, senão o aviso da tela e o do Telegram passam a
 * discordar.
 *
 * Tom: firme quanto ao prazo, cordial com a pessoa. Quem atrasa a
 * mensalidade quase sempre esqueceu — tratar como caloteiro de saída custa
 * mais caro do que os R$ 79.
 */

import { negrito } from "./format";

export type TipoAviso = "vence_em_breve" | "vence_hoje" | "vencida" | "somente_leitura";

export const AVISO_META: Record<TipoAviso, { label: string; cor: string }> = {
  vence_em_breve: { label: "Vence em breve", cor: "bg-blue-100 text-blue-700" },
  vence_hoje: { label: "Vence hoje", cor: "bg-amber-100 text-amber-700" },
  vencida: { label: "Vencida", cor: "bg-orange-100 text-orange-700" },
  somente_leitura: { label: "Sistema travado", cor: "bg-red-100 text-red-700" },
};

const dinheiro = (v?: number | null): string =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Classifica a loja pelo vencimento — mesma régua usada no resto do sistema */
export function tipoDoAviso(
  diasParaVencer: number | null,
  diasTolerancia = 5
): TipoAviso | null {
  if (diasParaVencer === null) return null;
  if (diasParaVencer > 3) return null; // longe demais: não incomoda
  if (diasParaVencer > 0) return "vence_em_breve";
  if (diasParaVencer === 0) return "vence_hoje";
  if (diasParaVencer >= -diasTolerancia) return "vencida";
  return "somente_leitura";
}

/** Mensagem para o LOJISTA (enviada por você, pelo WhatsApp) */
export function mensagemCobranca(
  tipo: TipoAviso,
  dados: {
    nomeLoja: string;
    valor?: number | null;
    dias?: number | null;
    chavePix?: string | null;
    titularPix?: string | null;
  }
): string {
  const { nomeLoja, valor, dias, chavePix, titularPix } = dados;
  const partes: string[] = [];

  // Identifica de qual loja é a assinatura logo na primeira linha:
  // quem tem duas lojas precisa saber qual delas está sendo cobrada.
  partes.push(`Olá! Sobre a assinatura do sistema da ${negrito(nomeLoja)}:`);

  switch (tipo) {
    case "vence_em_breve":
      partes.push(
        `Passando só para lembrar que sua mensalidade vence em *${dias} dia${dias === 1 ? "" : "s"}*.`
      );
      break;
    case "vence_hoje":
      partes.push("Sua mensalidade *vence hoje*.");
      break;
    case "vencida":
      partes.push(
        `Sua mensalidade venceu há *${Math.abs(dias || 0)} dia${Math.abs(dias || 0) === 1 ? "" : "s"}*. ` +
          "O sistema continua funcionando normalmente por mais alguns dias."
      );
      break;
    case "somente_leitura":
      partes.push(
        "Sua mensalidade está em atraso e o cadastro de novas OS e vendas foi *pausado*.\n\n" +
          "Fique tranquilo: *nenhum dado foi apagado*. Você continua consultando, " +
          "imprimindo e exportando tudo. Assim que o pagamento cair, volta na hora."
      );
      break;
  }

  if (valor) partes.push(`Valor: *${dinheiro(valor)}*`);

  if (chavePix) {
    partes.push(
      `*Pix:* ${chavePix}` + (titularPix ? `\n_Titular: ${titularPix}_` : "")
    );
  }

  partes.push("Qualquer dúvida é só chamar. Obrigado!");

  return partes.join("\n\n");
}
