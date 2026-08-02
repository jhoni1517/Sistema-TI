/**
 * O próximo número de venda e de ordem de serviço.
 *
 * As duas telas faziam `max(numero) + 1` em cima da lista que estava na
 * tela. Parece óbvio e tem dois buracos, os dois já previstos por outra
 * regra da casa:
 *
 * 1. **Falha de carga.** A leitura é tolerante a falha parcial de propósito
 *    — uma tabela com problema não pode zerar a tela. Mas com a tabela de
 *    vendas vazia por erro, `max` de nada é zero e a próxima venda nasce
 *    com o número 1, colidindo com a primeira venda da história da loja.
 *
 *    Na OS é pior: o rastreio público procura a ordem PELO NÚMERO. Dois
 *    aparelhos com OS00001 e o cliente abre o link e vê o conserto de
 *    outra pessoa, com nome e valor.
 *
 * 2. **Dois aparelhos ao mesmo tempo.** Balcão e celular vendendo juntos
 *    calculam o mesmo próximo número. Isso o banco resolveria com uma
 *    sequência, mas enquanto não existe, pelo menos não se erra sozinho.
 *
 * O conserto do primeiro buraco é recusar. Numerar por cima de dado que
 * não carregou é gravar em cima do histórico.
 */

const n = (v?: number | null): number => Number(v) || 0;

/** O maior número já usado, mais um. Lista vazia começa em 1. */
export function proximoNumero(existentes: { numero?: number }[]): number {
  return existentes.reduce((maior, x) => Math.max(maior, n(x.numero)), 0) + 1;
}

/**
 * Pode numerar agora?
 *
 * Devolve o motivo quando NÃO pode, vazio quando pode. Texto e não booleano
 * porque o balcão precisa saber por que o sistema recusou — "não foi
 * possível" manda a pessoa clicar de novo até dar certo.
 */
export function problemaParaNumerar(
  fontesComFalha: string[],
  fonte: string,
  oQue: string
): string {
  if (!fontesComFalha.includes(fonte)) return "";
  return (
    `A lista de ${fonte} não carregou, então o sistema não sabe qual é o ` +
    `próximo número.\n\n` +
    `Criar ${oQue} agora repetiria um número já usado, e número repetido ` +
    `bagunça o histórico e o recibo do cliente.\n\n` +
    `Atualize a página e tente de novo. Nada foi perdido.`
  );
}
