/**
 * Quando vale a pena recarregar tudo de novo.
 *
 * ------------------------------------------------------------
 * O PROBLEMA
 *
 * A tela recarregava a loja inteira a CADA volta do foco da janela. Foco não
 * é evento raro: ele dispara ao fechar o teclado do celular, ao voltar da
 * câmera, ao tocar de novo na página depois de olhar o WhatsApp, ao trocar de
 * aba no computador. Numa hora de balcão são dezenas de vezes.
 *
 * Cada recarga são dezessete consultas mais a configuração e o ramo. No 4G do
 * balcão isso leva segundos, e nesses segundos a tela fica com o ícone
 * girando — o "delay" que se sente sem saber de onde vem.
 *
 * Pior que a lentidão: cada recarga é uma janela em que uma resposta antiga
 * pode chegar depois de uma gravação e apagar da tela o que acabou de ser
 * lançado. Recarregar menos é ter menos janelas.
 *
 * ------------------------------------------------------------
 * POR QUE UM INTERVALO E NÃO UM "SÓ QUANDO MUDAR"
 *
 * Saber que mudou exigiria o banco avisar, e a recarga existe justamente para
 * o caso em que outro aparelho gravou. Um intervalo mínimo resolve o que
 * importa — quem volta ao app depois de um tempo vê o que o outro balcão
 * lançou — e some com as dezenas de recargas que não tinham nada de novo para
 * trazer.
 *
 * Vinte segundos: curto o bastante para o outro caixa aparecer antes de
 * alguém reparar na falta, e longo o bastante para o vaivém entre o WhatsApp
 * e o sistema não virar consulta.
 */
export const INTERVALO_RECARGA_MS = 20_000;

/**
 * Já dá para recarregar de novo?
 *
 * `ultima` é o instante da última recarga (0 = nunca recarregou, e aí sempre
 * pode: é a primeira abertura do sistema).
 */
export function podeRecarregar(
  ultima: number,
  agora: number = Date.now(),
  intervalo: number = INTERVALO_RECARGA_MS
): boolean {
  if (!Number.isFinite(ultima) || ultima <= 0) return true;
  /*
   * Relógio que andou para trás não pode travar a recarga para sempre.
   *
   * Acontece de verdade: celular que corrige a hora pela rede, ou que estava
   * com a data errada. Com uma comparação ingênua, `agora - ultima` fica
   * negativo, nunca alcança o intervalo, e o sistema para de buscar dados
   * novos até alguém fechar o aplicativo.
   */
  if (agora < ultima) return true;
  return agora - ultima >= intervalo;
}
