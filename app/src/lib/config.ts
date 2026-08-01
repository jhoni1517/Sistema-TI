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
