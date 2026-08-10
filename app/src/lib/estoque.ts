import type { Produto } from "./types";
import { txt } from "./format";

/**
 * A baixa de estoque, num lugar só.
 *
 * Três telas descontavam estoque com a mesma linha copiada:
 * `Math.max(0, quantidade - vendida)`. O zero parece uma proteção e é o
 * contrário disso — ele **apaga a prova de que a conta não bate**.
 *
 * Vender 3 de um item que o sistema acha que tem 1 deixa o saldo em 0, e
 * não em -2. As duas unidades que saíram sem nunca ter entrado somem do
 * mapa: não existe entrada faltando para procurar, não existe diferença
 * para conferir na contagem. E a conferência de integridade tem um
 * detector de estoque negativo que, por causa desse clamp, nunca dispara
 * numa venda — que é justamente onde o problema aparece.
 *
 * Pior: o próprio PDV avisa, com estas palavras, "a venda passa, mas o
 * saldo fica negativo". O aviso estava mentindo.
 *
 * Negativo não é erro do sistema, é o sistema dizendo que falta lançar uma
 * entrada. Quem conserta é a contagem, em Estoque.
 */

const n = (v?: number | null): number => Number(v) || 0;

/**
 * Balança trabalha em quilo, e 0.1 + 0.2 em ponto flutuante não dá 0.3.
 * Sem arredondar, um estoque zerado vira 0.00000000000000004 e a tela
 * mostra "tem" onde não tem.
 */
export const grama = (v: number): number => Math.round(v * 1000) / 1000;

/**
 * Quanto fica no estoque depois de sair `quantidade`.
 *
 * Serviço não tem estoque: devolve o que já estava lá. Existe porque o
 * atendente digitava 99999999999 na quantidade para o item não ficar
 * vermelho.
 */
export function aposBaixa(produto: Produto, quantidade: number): number {
  if (produto.servico) return n(produto.quantidade);
  return grama(n(produto.quantidade) - n(quantidade));
}

/** Quanto fica no estoque depois de voltar `quantidade` (devolução, cancelamento) */
export function aposRetorno(produto: Produto, quantidade: number): number {
  if (produto.servico) return n(produto.quantidade);
  return grama(n(produto.quantidade) + n(quantidade));
}

/**
 * Uma gravação por produto, com o saldo final depois de TODAS as linhas.
 *
 * O laço ingênuo — `for (item) { acha o produto; grava }` — lê sempre a
 * lista de produtos da tela, que só é atualizada depois que a função
 * inteira termina. Com o MESMO produto em duas linhas, a segunda volta
 * calcula em cima do saldo velho e sobrescreve a primeira: vende duas
 * fontes, desce uma.
 *
 * Acontece mais do que parece. No balcão a peça entra duas vezes quando o
 * atendente digita o nome numa linha e escolhe da lista na outra; na OS,
 * quando a mesma peça aparece numa opção e como item fixo.
 */
export function saldosApos(
  itens: { produtoId?: string; quantidade?: number }[],
  produtos: Produto[],
  direcao: "baixa" | "retorno" = "baixa"
): { produto: Produto; quantidade: number }[] {
  const somaPorProduto = new Map<string, number>();
  for (const i of itens) {
    if (!i.produtoId) continue;
    somaPorProduto.set(i.produtoId, (somaPorProduto.get(i.produtoId) || 0) + n(i.quantidade));
  }

  const saidas: { produto: Produto; quantidade: number }[] = [];
  for (const [id, total] of somaPorProduto) {
    const produto = produtos.find((x) => x.id === id);
    if (!produto || produto.servico) continue;
    saidas.push({
      produto,
      quantidade:
        direcao === "baixa" ? aposBaixa(produto, total) : aposRetorno(produto, total),
    });
  }
  return saidas;
}

/**
 * O que vai ficar negativo se esta venda fechar agora.
 *
 * O aviso na hora de adicionar o item se perde: o balcão adiciona dez
 * coisas e fecha. Esta lista é a última chance de ver antes de gravar —
 * e ela não bloqueia nada, porque a mercadoria já está na mão do cliente.
 */
export function faltaNoEstoque(
  itens: { produtoId?: string; quantidade?: number }[],
  produtos: Produto[]
): { produto: Produto; saida: number; sobra: number }[] {
  const somaPorProduto = new Map<string, number>();
  for (const i of itens) {
    if (!i.produtoId) continue;
    somaPorProduto.set(i.produtoId, (somaPorProduto.get(i.produtoId) || 0) + n(i.quantidade));
  }

  const falta: { produto: Produto; saida: number; sobra: number }[] = [];
  for (const [id, saida] of somaPorProduto) {
    const p = produtos.find((x) => x.id === id);
    // Duas linhas do mesmo produto no carrinho só estouram somadas: 3 + 3
    // num estoque de 5 passa item a item e não passa no total.
    if (!p || p.servico) continue;
    const sobra = aposBaixa(p, saida);
    if (sobra < 0) falta.push({ produto: p, saida, sobra });
  }
  return falta;
}

/** O texto do aviso, pronto. Sem emoji: em alguns aparelhos chega como "?". */
export function avisoDeFalta(
  falta: { produto: Produto; saida: number; sobra: number }[]
): string {
  if (falta.length === 0) return "";
  return (
    "O estoque vai ficar negativo:\n\n" +
    falta
      .map((f) => `- ${f.produto.nome}: saem ${f.saida}, fica ${f.sobra}`)
      .join("\n") +
    "\n\nA venda pode fechar assim. Negativo quer dizer que falta lançar uma " +
    "entrada — acerte depois em Estoque > Contagem."
  );
}

/**
 * O estoque subiu no CADASTRO. De onde veio essa mercadoria?
 *
 * Relatado do balcão: "comprei uma fonte no dia 04, entrou no estoque, mas
 * não deu baixa no dinheiro do caixa."
 *
 * Foi isso: abrir o produto e digitar a quantidade nova sobe o estoque e não
 * encosta no caixa. Não é bug do salvamento — é o cadastro fazendo o que ele
 * faz. O bug é ele fazer isso CALADO, porque as duas coisas que a pessoa
 * quer dizer com esse gesto são opostas:
 *
 *   "comprei"          -> tem que sair dinheiro, e o custo médio muda
 *   "contei e tinha 3" -> não sai dinheiro nenhum, é correção
 *
 * E o jeito errado é o silencioso: aparece mercadoria que ninguém pagou, o
 * custo continua o de seis meses atrás, e o lucro do mês fica inflado. Como
 * diz o CLAUDE.md, LUCRO INFLADO É INVISÍVEL — ninguém procura por ele. Uma
 * saída de caixa sobrando salta aos olhos; esta não salta nada.
 *
 * Devolve o aviso a mostrar, ou vazio quando não há o que perguntar.
 * Diminuir estoque não entra aqui: quebra e perda não tiram dinheiro do
 * caixa, então não há decisão de dinheiro a tomar.
 */
export function avisoDeEstoqueQueSubiu(
  antes: Produto | undefined,
  depois: Produto
): string {
  if (depois.servico) return "";
  const de = n(antes?.quantidade);
  const para = n(depois.quantidade);
  if (para <= de) return "";

  const novo = !antes;
  const quanto = grama(para - de);
  const custo = n(depois.custo);
  const gasto = custo > 0 ? ` (${quanto} x ${custo.toFixed(2)})` : "";

  return (
    `O estoque de "${txt(depois.nome) || "este produto"}" ` +
    (novo ? `nasce com ${para}.` : `sobe de ${grama(de)} para ${grama(para)}, mais ${quanto}.`) +
    `\n\nSE VOCE COMPROU${gasto}: cancele e use "Entrada de nota". ` +
    `Ela soma o estoque, recalcula o custo médio e DESCONTA DO CAIXA.` +
    `\n\nSE E CORRECAO DE CONTAGEM: confirme. O estoque sobe e nada sai do caixa.`
  );
}
