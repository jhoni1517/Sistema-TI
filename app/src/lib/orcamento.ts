import { txt } from "./format";
import { normalizar } from "./busca";
import type { OrdemServico, PecaOS } from "./types";

/**
 * Mais de um orçamento na mesma OS.
 *
 * O mesmo conserto costuma ter mais de um caminho, e cada caminho pode ter
 * várias peças: "Opção 1 — fonte de 500W mais SSD de 1TB" contra "Opção 2 —
 * só a fonte de 200W". Antes disto tudo ia na mesma lista e o sistema SOMAVA
 * tudo: o cliente recebia um orçamento cobrando as duas fontes de uma vez, e
 * a loja parecia estar empurrando o dobro.
 *
 * A regra é uma só, aqui e no banco:
 *
 * - peça com `opcao` vazia entra em QUALQUER cenário (pasta térmica, limpeza);
 * - peça com `opcao` preenchida pertence àquele orçamento e só conta quando
 *   ele é o escolhido — em dinheiro, no estoque e na mensagem;
 * - `OrdemServico.opcaoEscolhida` guarda a decisão. Enquanto ninguém decide,
 *   vale a primeira opção, que é a sugestão da loja.
 *
 * Sem opção nenhuma preenchida, a OS se comporta exatamente como sempre se
 * comportou: uma lista só, tudo somado.
 *
 * A mesma conta existe em SQL, na função pública consultar_os — a página do
 * cliente calcula o total sozinha, e duas regras diferentes mostrariam dois
 * valores para o mesmo orçamento.
 */

const n = (v?: number | null): number => Number(v) || 0;

export const subtotalPeca = (p: PecaOS): number => n(p.precoUnit) * n(p.quantidade);

export const custoDaPeca = (p: PecaOS): number => n(p.custoUnit) * n(p.quantidade);

/** A qual orçamento a peça pertence. Vazio = entra em todos. */
export const opcaoDaPeca = (p: PecaOS): string => (p.opcao || "").trim();

/** Nomes dos orçamentos, na ordem em que aparecem na OS, sem repetir */
export function nomesDasOpcoes(o: OrdemServico): string[] {
  const nomes: string[] = [];
  for (const p of o.pecas || []) {
    const nome = opcaoDaPeca(p);
    if (nome && !nomes.includes(nome)) nomes.push(nome);
  }
  return nomes;
}

/** A OS oferece uma escolha ao cliente? */
export const temOpcoes = (o: OrdemServico): boolean => nomesDasOpcoes(o).length >= 2;

/**
 * O orçamento que vale agora.
 *
 * Sem decisão registrada vale o primeiro — é a sugestão da loja, e é melhor
 * do que deixar o total zerado enquanto o cliente não responde: o valor
 * apareceria menor do que qualquer cenário real.
 */
export function opcaoAtual(o: OrdemServico): string {
  const nomes = nomesDasOpcoes(o);
  const marcada = (o.opcaoEscolhida || "").trim();
  return nomes.includes(marcada) ? marcada : (nomes[0] ?? "");
}

/** O cliente já disse qual quer? */
export const escolhaConfirmada = (o: OrdemServico): boolean =>
  !temOpcoes(o) || nomesDasOpcoes(o).includes((o.opcaoEscolhida || "").trim());

/** Peças que entram em qualquer orçamento */
export const itensInclusos = (o: OrdemServico): PecaOS[] =>
  (o.pecas || []).filter((p) => !opcaoDaPeca(p));

/** Peças de um orçamento específico */
export const pecasDaOpcao = (o: OrdemServico, nome: string): PecaOS[] =>
  (o.pecas || []).filter((p) => opcaoDaPeca(p) === nome.trim());

/**
 * As peças que valem de verdade: as comuns mais as do orçamento escolhido.
 *
 * É esta lista que vira dinheiro no total e baixa do estoque na entrega. Peça
 * de orçamento recusado não custa nada e não sai da prateleira.
 */
export function pecasEfetivas(o: OrdemServico): PecaOS[] {
  const atual = opcaoAtual(o);
  return (o.pecas || []).filter((p) => {
    const nome = opcaoDaPeca(p);
    return !nome || nome === atual;
  });
}

/** A OS com este orçamento escolhido */
export const comOpcao = (o: OrdemServico, nome: string): OrdemServico => ({
  ...o,
  opcaoEscolhida: nome.trim() || undefined,
});

/**
 * Nome livre para o próximo orçamento: "Opção 1", "Opção 2"...
 *
 * ------------------------------------------------------------
 * O NÚMERO NUNCA VOLTA, MESMO DEPOIS DE SOBRAR
 *
 * A primeira versão procurava o primeiro número LIVRE. Parecia arrumado e
 * embaralhava a tela: apagando a última peça da "Opção 1", ela sumia da
 * lista (a opção só existe enquanto tem peça), e o próximo "adicionar"
 * devolvia "Opção 1" de novo — que aparecia DEPOIS da "Opção 2", porque a
 * ordem sai de onde a peça está na lista.
 *
 * Relatado assim, do balcão: "a 1 meio que sumiu e virou 1 de novo a 2".
 *
 * Agora ele passa do maior já usado. O número não se repete e a lista sai em
 * ordem crescente sozinha, sem precisar reordenar nada — e reordenar seria
 * perigoso, porque a mesma ordem existe no SQL da página do cliente
 * (`order by o.ordem`), e as duas divergindo mostrariam sugestões
 * diferentes para o mesmo orçamento.
 *
 * Nome escrito à mão ("Completo") não entra na conta: quem renomeou não
 * quer numeração.
 * ------------------------------------------------------------
 */
export function proximoNomeDeOpcao(o: OrdemServico): string {
  let maior = 0;
  for (const nome of nomesDasOpcoes(o)) {
    const n = Number(nome.match(/^Opção (\d+)$/)?.[1]);
    if (Number.isFinite(n) && n > maior) maior = n;
  }
  return `Opção ${maior + 1}`;
}

/**
 * Renomeia um orçamento, levando junto as peças e a escolha.
 *
 * Sem levar a escolha junto, renomear "Opção 1" para "Completo" fazia a OS
 * cair na primeira opção da lista — o cliente aprovava uma coisa e a loja
 * montava outra.
 */
export function renomearOpcao(o: OrdemServico, de: string, para: string): OrdemServico {
  const antigo = de.trim();
  const novo = para.trim();
  if (!antigo || antigo === novo) return o;
  return {
    ...o,
    pecas: (o.pecas || []).map((p) =>
      opcaoDaPeca(p) === antigo ? { ...p, opcao: novo || undefined } : p
    ),
    opcaoEscolhida:
      (o.opcaoEscolhida || "").trim() === antigo ? novo || undefined : o.opcaoEscolhida,
  };
}

/** Apaga um orçamento inteiro, com as peças dele */
export function removerOpcao(o: OrdemServico, nome: string): OrdemServico {
  const alvo = nome.trim();
  return {
    ...o,
    pecas: (o.pecas || []).filter((p) => opcaoDaPeca(p) !== alvo),
    opcaoEscolhida:
      (o.opcaoEscolhida || "").trim() === alvo ? undefined : o.opcaoEscolhida,
  };
}

/**
 * Junta tudo numa lista só: volta para o orçamento único.
 *
 * As peças ficam — apagá-las perderia trabalho já digitado. Quem quiser
 * menos peças tira uma a uma, vendo o que está tirando.
 */
export const juntarEmUmOrcamento = (o: OrdemServico): OrdemServico => ({
  ...o,
  pecas: (o.pecas || []).map((p) => ({ ...p, opcao: undefined })),
  opcaoEscolhida: undefined,
});

/**
 * Passa a oferecer mais de uma opção, levando o que já foi digitado para a
 * PRIMEIRA delas.
 *
 * ------------------------------------------------------------
 * A PRIMEIRA VERSÃO DEIXAVA TUDO NO BALDE COMUM, E ISSO COBRAVA EM DOBRO
 *
 * O raciocínio era: "as peças que já estavam digitadas continuam valendo
 * para as duas — jogá-las numa opção obrigaria a redigitar tudo na outra".
 * Parece economia de digitação e é o contrário.
 *
 * Relatado do balcão, na OS00033: a loja tinha SSD 120 GB, bateria e
 * carcaça digitados. Clicou em "mais de uma opção", os três viraram COMUNS,
 * e ela montou a Opção 1 com SSD 240 GB, bateria e carcaça — que é como
 * qualquer pessoa monta uma opção: inteira.
 *
 * O resultado foi a Opção 1 somando R$ 1.360 em vez de R$ 730: duas
 * baterias, duas carcaças e os dois SSDs no mesmo orçamento. Exatamente o
 * "orçamento cobrando as duas fontes" que este recurso existe para impedir,
 * entrando por outra porta.
 *
 * Opção é um CENÁRIO INTEIRO — é assim que a loja pensa e é assim que o
 * cliente lê. O que já estava na tela é o primeiro cenário, não um pedaço
 * solto que entra em todos. O balde comum continua existindo (pasta térmica,
 * limpeza), mas agora ele é uma escolha deliberada, e não o lugar onde o
 * trabalho já feito cai sozinho.
 * ------------------------------------------------------------
 *
 * A segunda opção nasce com uma linha em branco, para ter onde digitar.
 */
export function paraDuasOpcoes(o: OrdemServico): OrdemServico {
  const primeira = "Opção 1";
  const segunda = "Opção 2";
  const jaDigitadas = (o.pecas || []).filter(
    (p) => txt(p.descricao).trim() || n(p.precoUnit) > 0 || p.produtoId
  );

  return {
    ...o,
    pecas: [
      // O que já existia vira o primeiro cenário, inteiro.
      ...jaDigitadas.map((p) => ({ ...p, opcao: primeira })),
      { descricao: "", quantidade: 1, custoUnit: 0, precoUnit: 0, opcao: segunda },
    ],
    /*
     * Sem escolha registrada de propósito: quem decide é o cliente. Marcar a
     * primeira aqui faria a loja mandar um orçamento já "aprovado" por ela.
     */
    opcaoEscolhida: undefined,
  };
}

/**
 * As peças que estão no comum E dentro de alguma opção — ou seja, cobradas
 * duas vezes no mesmo orçamento.
 *
 * Devolve a descrição de cada uma, uma vez só. Vazio quando está tudo certo.
 *
 * A comparação é pela DESCRIÇÃO, sem acento e sem caixa, e não pelo
 * `produtoId`: a peça digitada à mão não tem id nenhum, e foi justamente a
 * digitada à mão que apareceu repetida no caso real.
 *
 * Por que não bloquear: cobrar duas unidades da mesma peça é legítimo (dois
 * pentes de memória). Só que aí a quantidade é 2 numa linha só — duas linhas
 * iguais em lugares diferentes é quase sempre engano, e o sistema tem que
 * dizer isso antes de o orçamento sair para o cliente.
 */
export function itensRepetidos(o: OrdemServico, nome: string): string[] {
  const chave = (p: PecaOS): string => normalizar(txt(p.descricao));
  const comuns = new Set(itensInclusos(o).map(chave).filter(Boolean));
  const vistos = new Set<string>();
  const saida: string[] = [];

  for (const p of pecasDaOpcao(o, nome)) {
    const k = chave(p);
    if (!k || !comuns.has(k) || vistos.has(k)) continue;
    vistos.add(k);
    saida.push(txt(p.descricao).trim());
  }
  return saida;
}

/** O mesmo, para a OS inteira: qual opção tem repetição e qual peça é */
export function repeticoesDaOS(o: OrdemServico): { opcao: string; itens: string[] }[] {
  return nomesDasOpcoes(o)
    .map((nome) => ({ opcao: nome, itens: itensRepetidos(o, nome) }))
    .filter((x) => x.itens.length > 0);
}
