import { brl, codigoOS, txt } from "./format";
import { totalOS, totalPecas, totalComOpcao } from "./calc";
import {
  nomesDasOpcoes,
  temOpcoes,
  opcaoAtual,
  itensInclusos,
  pecasDaOpcao,
  subtotalPeca,
} from "./orcamento";
import {
  OS_STATUS_META,
  type OrdemServico,
  type Cliente,
  type Config,
  type PecaOS,
} from "./types";

/**
 * Texto que o cliente recebe no WhatsApp.
 *
 * Duas coisas moldaram este arquivo, as duas vindas do balcão:
 *
 * 1. A versão original mandava "Aparelho:" vazio e "Valor do serviço:
 *    R$ 0,00" quando o orçamento nem existia. Por isso cada bloco só aparece
 *    quando tem conteúdo de verdade.
 *
 * 2. Quando a OS oferecia caminhos diferentes para o mesmo conserto — fonte
 *    de 500W mais SSD, ou só a fonte de 200W — a mensagem listava tudo em
 *    sequência e somava. O cliente lia um orçamento cobrando as duas fontes,
 *    e o texto virava um bloco só, sem onde descansar o olho. Agora cada
 *    orçamento é um bloco, com o TOTAL DO SERVIÇO — que é o número em cima
 *    do qual ele decide, não o preço da peça solta.
 *
 * Sem emoji: em alguns aparelhos elas chegam como "?" e sujam justamente a
 * mensagem que deveria causar boa impressão.
 */

const primeiroNome = (nome: string | undefined): string =>
  txt(nome).trim().split(/\s+/)[0] || "";

const aparelhoDe = (o: OrdemServico): string =>
  [txt(o.tipoAparelho), txt(o.marca), txt(o.modelo), txt(o.cor)]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");

const temDescricao = (p: PecaOS): boolean => !!txt(p.descricao).trim();

/** Uma linha de item: "- Fonte 500W (2x) — R$ 798,00" */
const linhaItem = (p: PecaOS): string => {
  const qtd = Number(p.quantidade) || 1;
  return `- ${txt(p.descricao)}${qtd > 1 ? ` (${qtd}x)` : ""} — ${brl(subtotalPeca(p))}`;
};

/**
 * Cabeçalho de um orçamento alternativo.
 *
 * O nome é livre — a loja pode chamar de "Opção 1" ou de "Completo". Quando
 * já vem numerado, numerar de novo daria "OPÇÃO 1 - OPÇÃO 1".
 */
const tituloOpcao = (nome: string, posicao: number): string =>
  /^op[çc][ãa]o\b/i.test(nome.trim())
    ? `*${txt(nome).toUpperCase()}*`
    : `*OPÇÃO ${posicao} - ${txt(nome).toUpperCase()}*`;

/**
 * Orçamento discriminado: o cliente vê no que o dinheiro dele vai.
 *
 * Volta em blocos separados para o WhatsApp respirar. Cada bloco vira um
 * parágrafo lá na conversa.
 */
export function blocosOrcamento(o: OrdemServico): string[] {
  const blocos: string[] = [];
  const nomes = nomesDasOpcoes(o);
  const varios = nomes.length >= 2;
  const comuns = itensInclusos(o).filter(temDescricao);

  // Com mais de um orçamento na mesa, o cabeçalho precisa deixar claro que o
  // que vem antes vale em qualquer caso. Sem isso o cliente acha que soma.
  const linhas: string[] = [varios ? "*JÁ INCLUSO EM QUALQUER OPÇÃO*" : "*ORÇAMENTO*"];
  for (const p of comuns) linhas.push(linhaItem(p));

  const mao = Number(o.maoDeObra) || 0;
  if (mao > 0) linhas.push(`- Mão de obra — ${brl(mao)}`);

  const desconto = Number(o.desconto) || 0;
  if (desconto > 0) linhas.push(`- Desconto — menos ${brl(desconto)}`);

  if (linhas.length > 1) blocos.push(linhas.join("\n"));

  if (!varios) {
    // Um orçamento só: as peças da opção única entram na lista de sempre.
    const total = totalOS(o);
    if (nomes.length === 1) {
      const soltos = pecasDaOpcao(o, nomes[0]).filter(temDescricao).map(linhaItem);
      if (soltos.length > 0) {
        blocos[0] = [blocos[0] || "*ORÇAMENTO*", ...soltos].join("\n");
      }
    }
    if (total > 0) blocos.push(`*TOTAL: ${brl(total)}*`);
    return blocos;
  }

  const escolhida = opcaoAtual(o);
  nomes.forEach((nome, i) => {
    const itens = pecasDaOpcao(o, nome).filter(temDescricao);
    const partes = [tituloOpcao(nome, i + 1)];
    for (const p of itens) partes.push(linhaItem(p));
    // O total do serviço INTEIRO, não a soma das peças da opção: é sobre este
    // número que o cliente decide, e ele não tem como somar de cabeça a mão
    // de obra e o que é comum às duas.
    partes.push(`Total do serviço: *${brl(totalComOpcao(o, nome))}*`);
    if (nome === escolhida) partes.push("Nossa sugestão.");
    blocos.push(partes.join("\n"));
  });

  return blocos;
}

/** Frase de fechamento de acordo com a etapa em que a OS está */
const chamada = (o: OrdemServico, temLink: boolean): string => {
  switch (o.status) {
    case "aguardando_aprovacao":
      if (temOpcoes(o)) {
        // Aprovar sem dizer qual opção é o mesmo problema de antes, só que
        // por escrito: alguém teria que adivinhar quais peças comprar.
        const como = "Responda com o número da opção que prefere";
        return temLink
          ? `${como}, ou escolha e aprove direto pelo link acima.`
          : `${como} e já autorizamos o serviço.`;
      }
      return totalOS(o) > 0
        ? temLink
          ? "Para autorizar o serviço, aprove pelo link acima ou responda *SIM* por aqui."
          : "Para autorizar o serviço, responda *SIM* por aqui. Se preferir não fazer, responda *NÃO*."
        : "Assim que fecharmos o orçamento, enviamos os valores para sua aprovação.";
    case "pronta":
      return "Seu aparelho está pronto para retirada, dentro do nosso horário de atendimento.";
    case "em_reparo":
      return "O serviço está em andamento. Avisamos assim que ficar pronto.";
    case "em_analise":
      return "Estamos analisando o aparelho. Em breve enviamos o diagnóstico com os valores.";
    case "entregue":
      return "Obrigado pela confiança! Qualquer coisa sobre este serviço, é só chamar.";
    case "cancelada":
      return "O serviço foi cancelado e o aparelho está disponível para retirada.";
    default:
      return "Qualquer dúvida, estamos à disposição.";
  }
};

/**
 * Convite para avaliar a loja.
 *
 * Sem emoji: em alguns aparelhos elas chegam como "?" e sujam justamente a
 * mensagem que deveria causar boa impressão.
 */
export function pedidoDeAvaliacao(o: OrdemServico, config: Config): string {
  const link = txt(config.linkAvaliacao).trim();
  if (!link || o.status !== "entregue") return "";
  const loja = txt(config.nomeLoja).trim() || "nossa loja";
  return (
    `Seu feedback é importante para a ${loja}. ` +
    `Poste uma avaliação no nosso perfil.\n${link}`
  );
}

export function mensagemCliente(
  o: OrdemServico,
  cliente: Cliente | undefined,
  config: Config,
  linkRastreio?: string
): string {
  const partes: string[] = [];

  // Cabeçalho: quem está falando e sobre qual serviço, nas duas primeiras
  // linhas. É o que aparece na prévia da notificação do celular.
  partes.push(
    `*${(txt(config.nomeLoja) || "Assistência Técnica").toUpperCase()}*\n` +
      `Ordem de serviço ${codigoOS(o.numero)}`
  );

  const nome = primeiroNome(cliente?.nome);
  partes.push(nome ? `Olá, ${nome}!` : "Olá!");

  // Aparelho e situação juntos: são duas informações curtas, e separá-las em
  // parágrafos só esticava a mensagem sem deixar nada mais claro.
  const aparelho = aparelhoDe(o);
  const identificacao = [
    aparelho ? `*Aparelho:* ${aparelho}` : "",
    `*Situação:* ${OS_STATUS_META[o.status].label}`,
  ].filter(Boolean);
  partes.push(identificacao.join("\n"));

  // O que o cliente nos contou — mostra que foi anotado direito
  const relatado = txt(o.defeitoRelatado).trim();
  if (relatado) partes.push(`*PROBLEMA RELATADO*\n${relatado}`);

  // O que o técnico encontrou — é isto que faltava na mensagem antiga
  const constatado = txt(o.defeitoConstatado).trim();
  if (constatado) partes.push(`*O QUE ENCONTRAMOS*\n${constatado}`);

  // Orçamento só nas etapas em que ele existe de fato
  const mostraValores =
    ["aguardando_aprovacao", "aprovada", "em_reparo", "pronta", "entregue"].includes(
      o.status
    ) &&
    (totalOS(o) > 0 || totalPecas(o) > 0 || temOpcoes(o));
  if (mostraValores) partes.push(...blocosOrcamento(o));

  if (o.status === "pronta" && txt(o.observacoes).trim()) {
    partes.push(`*OBSERVAÇÕES*\n${txt(o.observacoes).trim()}`);
  }

  if (linkRastreio) {
    partes.push(`*ACOMPANHE E RESPONDA POR AQUI*\n${linkRastreio}`);
  }

  partes.push(chamada(o, !!linkRastreio));

  // Pedido de avaliação só na entrega. Pedir estrela antes de o serviço
  // terminar é pedir no pior momento, e nota ruim colhida no meio do caminho
  // fica lá para sempre.
  const avaliacao = pedidoDeAvaliacao(o, config);
  if (avaliacao) partes.push(avaliacao);

  return partes.filter(Boolean).join("\n\n");
}
