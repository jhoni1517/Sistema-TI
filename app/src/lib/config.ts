import type { Config } from "./types";

/**
 * O que da configuração sobe para a nuvem, e o que fica no aparelho.
 *
 * A versão anterior tinha uma LISTA DO QUE SUBIA, escrita à mão:
 *
 *     db.config.save({ nomeLoja, telefoneLoja, enderecoLoja, cnpj,
 *                      senhaAcesso, comissaoPadrao, ... })
 *
 * Toda configuração criada depois daquele dia ficou de fora sem ninguém
 * perceber — logo da loja, papel da impressora, limite da gaveta, formato da
 * balança, chat do Telegram. Elas salvavam no aparelho, a tela dizia
 * "salvo", e na máquina seguinte estava tudo em branco. O robô diário, que
 * lê a configuração pelo banco, não achava o chat de ninguém e respondia
 * "nenhuma loja com Telegram configurado".
 *
 * A lista agora é invertida: **sobe tudo, MENOS o que está aqui.**
 * Esquecer de adicionar uma exceção deixa um campo a mais na nuvem, que é
 * chato. Esquecer de adicionar à lista antiga perdia o campo, que é bug.
 * Quando as duas opções são erradas, escolhe-se a que dói menos.
 */

/**
 * Nunca sobe.
 *
 * Aparência é do aparelho: o balcão usa claro e a sala escuro, e sincronizar
 * isso brigaria com quem escolheu. Credencial da nuvem não pode morar dentro
 * de uma linha da própria nuvem — além de circular no backup, ela é o que
 * permite entrar.
 */
export const SO_NO_APARELHO = [
  "tema",
  "corDestaque",
  "supabaseUrl",
  "supabaseKey",
] as const satisfies readonly (keyof Config)[];

/** A configuração pronta para gravar na nuvem */
export function paraNuvem(c: Config): Record<string, unknown> {
  const saida: Record<string, unknown> = { ...c };
  for (const chave of SO_NO_APARELHO) delete saida[chave];
  return saida;
}

/**
 * Mudou só a aparência?
 *
 * A escolha de cor chama o salvamento a cada clique para dar
 * pré-visualização ao vivo. Sem esta pergunta, cada clique viraria uma
 * gravação na nuvem — no 4G do balcão, com o dedo arrastando na paleta.
 */
export function precisaGravarNaNuvem(antes: Config, depois: Config): boolean {
  return JSON.stringify(paraNuvem(antes)) !== JSON.stringify(paraNuvem(depois));
}

/**
 * O campo do Telegram recebeu o TOKEN do robô em vez do chat id.
 *
 * Aconteceu de verdade, e o estrago é sério: o token dá controle total do
 * robô, e este campo sobe para o banco, entra no backup e sai no export —
 * que circulam por WhatsApp e e-mail. Um segredo colado aqui está queimado
 * no minuto seguinte.
 *
 * A culpa não é de quem colou. Os dois valores vêm da mesma tela do
 * BotFather, com nomes parecidos, e o token é o que está na mão na hora de
 * configurar. Cabe ao campo saber a diferença.
 *
 * Token tem a forma `123456789:AAH-letras-e-numeros`. Chat id é só dígitos,
 * com um sinal de menos na frente quando é grupo.
 */
export function problemaNoChatId(valor: string): string {
  const v = (valor || "").trim();
  if (!v) return "";

  if (/^\d+:[\w-]{20,}$/.test(v)) {
    return (
      "Isto é o TOKEN do robô, não o chat id. O token nunca pode ser colado " +
      "aqui: este campo vai para o banco e sai no backup, que circula por " +
      "conversa.\n\n" +
      "O token mora só nas variáveis do Vercel (TELEGRAM_TOKEN).\n\n" +
      "O chat id é só o número que o robô responde quando você manda /start."
    );
  }

  // Grupo tem id negativo, conversa direta é positivo. Nada além de dígitos.
  if (!/^-?\d{5,}$/.test(v)) {
    return (
      "O chat id é só números — algo como 123456789, ou -100123456789 se for " +
      "um grupo. Mande /start para o robô no Telegram e ele responde com o seu."
    );
  }

  return "";
}
