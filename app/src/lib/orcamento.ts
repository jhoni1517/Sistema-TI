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

/** Nome livre para o próximo orçamento: "Opção 1", "Opção 2"... */
export function proximoNomeDeOpcao(o: OrdemServico): string {
  const usados = nomesDasOpcoes(o);
  for (let i = 1; i <= usados.length + 1; i++) {
    const nome = `Opção ${i}`;
    if (!usados.includes(nome)) return nome;
  }
  return `Opção ${usados.length + 1}`;
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
