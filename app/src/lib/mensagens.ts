import { brl, codigoOS, txt } from "./format";
import { totalOS, totalPecas, totalComOpcao } from "./calc";
import { escolhasDoCliente, itensInclusos, subtotalPeca } from "./orcamento";
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
 *    de 500W ou de 200W — a mensagem listava os dois em sequência e somava
 *    tudo. O cliente lia um orçamento cobrando as duas fontes, e o texto
 *    virava um bloco só, sem onde descansar o olho. Agora alternativa vira
 *    um bloco de escolha, com o TOTAL DO SERVIÇO de cada opção — que é o
 *    número em cima do qual ele decide, não o preço da peça solta.
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
 * Orçamento discriminado: o cliente vê no que o dinheiro dele vai.
 *
 * Volta em blocos separados para o WhatsApp respirar. Cada bloco vira um
 * parágrafo lá na conversa.
 */
export function blocosOrcamento(o: OrdemServico): string[] {
  const blocos: string[] = [];
  const escolhas = escolhasDoCliente(o);
  const fixos = itensInclusos(o).filter(temDescricao);

  // Com alternativas em jogo, o cabeçalho precisa deixar claro que o que vem
  // antes vale em qualquer caso. Sem isso o cliente acha que está somando.
  const rotuloFixos = escolhas.length > 0 ? "*JÁ INCLUSO EM QUALQUER OPÇÃO*" : "*ORÇAMENTO*";

  const linhas: string[] = [rotuloFixos];
  for (const p of fixos) linhas.push(linhaItem(p));

  const mao = Number(o.maoDeObra) || 0;
  if (mao > 0) linhas.push(`- Mão de obra — ${brl(mao)}`);

  const desconto = Number(o.desconto) || 0;
  if (desconto > 0) linhas.push(`- Desconto — menos ${brl(desconto)}`);

  if (linhas.length > 1) blocos.push(linhas.join("\n"));

  // Com mais de um grupo de escolha, "total do serviço" por opção mentiria:
  // ele depende também do que o cliente escolher no outro grupo.
  const totalPorOpcao = escolhas.length === 1;

  for (const g of escolhas) {
    const titulo = `*ESCOLHA - ${txt(g.nome).toUpperCase()}*`;
    const partes = [
      titulo,
      "As opções abaixo resolvem o mesmo problema. Escolha uma:",
      "",
    ];
    g.itens.forEach((p, i) => {
      partes.push(`*Opção ${i + 1} - ${txt(p.descricao) || "Sem descrição"}*`);
      partes.push(`Peça: ${brl(subtotalPeca(p))}`);
      if (totalPorOpcao) {
        partes.push(`Total do serviço: *${brl(totalComOpcao(o, p))}*`);
      }
      if (g.escolhida === p) partes.push("Nossa sugestão.");
      if (i < g.itens.length - 1) partes.push("");
    });
    blocos.push(partes.join("\n"));
  }

  const total = totalOS(o);
  if (escolhas.length === 0) {
    if (total > 0) blocos.push(`*TOTAL: ${brl(total)}*`);
  } else if (!totalPorOpcao && total > 0) {
    blocos.push(`*TOTAL COM AS OPÇÕES SUGERIDAS: ${brl(total)}*`);
  }

  return blocos;
}

/** Frase de fechamento de acordo com a etapa em que a OS está */
const chamada = (o: OrdemServico, temLink: boolean): string => {
  const escolhas = escolhasDoCliente(o);

  switch (o.status) {
    case "aguardando_aprovacao":
      if (escolhas.length > 0) {
        // Aprovar sem dizer qual opção é o mesmo problema de antes, só que
        // por escrito: alguém teria que adivinhar qual peça comprar.
        const como =
          escolhas.length === 1
            ? "Responda com o número da opção que prefere"
            : "Responda dizendo qual opção prefere em cada escolha";
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
    (totalOS(o) > 0 || totalPecas(o) > 0 || escolhasDoCliente(o).length > 0);
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
