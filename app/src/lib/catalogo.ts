import { situacaoValidade } from "./pdv";
import type { Produto } from "./types";

/**
 * O que a vitrine pública publica, e o que ela deixa de fora.
 *
 * ------------------------------------------------------------
 * O TETO EXISTE, E ELE ERA SILENCIOSO
 *
 * `catalogo_loja()` publica no máximo 300 produtos. O teto é defensável — a
 * página abre no 4G do cliente, e uma lista de mil itens com foto não abre.
 *
 * O problema era ninguém saber. A loja com 400 produtos publicava 300, e os
 * outros 100 simplesmente não existiam para quem abria o link. Sem aviso
 * para o dono, sem aviso para o cliente. A pessoa manda o link achando que
 * mandou a loja inteira, e o cliente pergunta pelo produto que "não tem".
 *
 * Descoberto medindo a função no banco, não lendo o código: o `limit 300`
 * está lá desde o começo, escrito e correto, e mesmo assim ninguém tinha
 * percebido o efeito.
 * ------------------------------------------------------------
 *
 * A conta de QUEM entra tem que ser a mesma do SQL, senão o aviso mente na
 * outra direção. Ver `catalogo_loja` em supabase-migracao-catalogo.sql:
 * entra quem tem preço acima de zero e não está vencido.
 */

/** Quantos itens a vitrine publica. Tem que bater com o `limit` do SQL. */
export const TETO_CATALOGO = 300;

/** Este produto aparece na vitrine? Mesma regra do SQL. */
export const vaiParaVitrine = (p: Produto, hoje?: string): boolean =>
  Number(p?.preco) > 0 && situacaoValidade(p, 7, hoje) !== "vencido";

/** Os que a vitrine publicaria, antes do teto */
export const publicaveis = (produtos: Produto[], hoje?: string): Produto[] =>
  (produtos || []).filter((p) => vaiParaVitrine(p, hoje));

/**
 * Quantos ficam DE FORA por causa do teto. Zero quando cabe tudo.
 *
 * É este número que a tela mostra. Avisar sempre — "o catálogo mostra até
 * 300" — seria mais um texto que ninguém lê; avisar só quando sobra é o que
 * faz a pessoa olhar.
 */
export const foraDoCatalogo = (produtos: Produto[], hoje?: string): number =>
  Math.max(0, publicaveis(produtos, hoje).length - TETO_CATALOGO);
