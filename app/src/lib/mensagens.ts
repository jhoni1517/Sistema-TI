import { brl, codigoOS, txt } from "./format";
import { totalOS, totalPecas } from "./calc";
import { OS_STATUS_META, type OrdemServico, type Cliente, type Config } from "./types";

/**
 * Texto que o cliente recebe no WhatsApp.
 *
 * A versão anterior mandava "Aparelho:" vazio e "Valor do serviço: R$ 0,00"
 * quando o orçamento nem existia — passava a impressão de desleixo logo no
 * único contato escrito que a loja tem com o cliente. Aqui cada bloco só
 * aparece quando tem conteúdo de verdade, e o orçamento vai discriminado,
 * peça por peça, para o cliente entender o que está aprovando.
 */

const primeiroNome = (nome: string | undefined): string =>
  txt(nome).trim().split(/\s+/)[0] || "";

const aparelhoDe = (o: OrdemServico): string =>
  [txt(o.tipoAparelho), txt(o.marca), txt(o.modelo), txt(o.cor)]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");

/** Orçamento discriminado: o cliente vê no que o dinheiro dele vai */
const blocoOrcamento = (o: OrdemServico): string => {
  const linhas: string[] = [];
  const pecas = (o.pecas || []).filter((p) => txt(p.descricao).trim());

  if (pecas.length > 0) {
    linhas.push("*Peças e materiais*");
    for (const p of pecas) {
      const qtd = Number(p.quantidade) || 1;
      const unit = Number(p.precoUnit) || 0;
      linhas.push(
        `- ${txt(p.descricao)}${qtd > 1 ? ` (${qtd}x)` : ""} — ${brl(unit * qtd)}`
      );
    }
  }

  const mao = Number(o.maoDeObra) || 0;
  if (mao > 0) {
    if (linhas.length > 0) linhas.push("");
    linhas.push(`*Mão de obra*\n- Serviço técnico — ${brl(mao)}`);
  }

  const desconto = Number(o.desconto) || 0;
  if (desconto > 0) linhas.push(`\n_Desconto aplicado: -${brl(desconto)}_`);

  const total = totalOS(o);
  if (total > 0) {
    if (linhas.length > 0) linhas.push("");
    linhas.push(`*TOTAL: ${brl(total)}*`);
  }

  return linhas.join("\n");
};

/** Frase de fechamento de acordo com a etapa em que a OS está */
const chamada = (o: OrdemServico, temLink: boolean): string => {
  switch (o.status) {
    case "aguardando_aprovacao":
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

  partes.push(`*${txt(config.nomeLoja) || "Assistência Técnica"}*`);

  const nome = primeiroNome(cliente?.nome);
  partes.push(
    `${nome ? `Olá, ${nome}!` : "Olá!"} Atualização da sua ordem de serviço *${codigoOS(o.numero)}*.`
  );

  const aparelho = aparelhoDe(o);
  if (aparelho) partes.push(`*Aparelho:* ${aparelho}`);

  partes.push(`*Situação:* ${OS_STATUS_META[o.status].label}`);

  // O que o cliente nos contou — mostra que foi anotado direito
  const relatado = txt(o.defeitoRelatado).trim();
  if (relatado) partes.push(`*Problema relatado:*\n${relatado}`);

  // O que o técnico encontrou — é isto que faltava na mensagem antiga
  const constatado = txt(o.defeitoConstatado).trim();
  if (constatado) partes.push(`*O que encontramos:*\n${constatado}`);

  // Orçamento só nas etapas em que ele existe de fato
  const mostraValores =
    ["aguardando_aprovacao", "aprovada", "em_reparo", "pronta", "entregue"].includes(
      o.status
    ) && (totalOS(o) > 0 || totalPecas(o) > 0);
  if (mostraValores) {
    const orcamento = blocoOrcamento(o);
    if (orcamento) partes.push(orcamento);
  }

  if (o.status === "pronta" && txt(o.observacoes).trim()) {
    partes.push(`*Observações:*\n${txt(o.observacoes).trim()}`);
  }

  if (linkRastreio) {
    partes.push(`*Acompanhe em tempo real:*\n${linkRastreio}`);
  }

  partes.push(chamada(o, !!linkRastreio));

  // Pedido de avaliação só na entrega. Pedir estrela antes de o serviço
  // terminar é pedir no pior momento, e nota ruim colhida no meio do caminho
  // fica lá para sempre.
  const avaliacao = pedidoDeAvaliacao(o, config);
  if (avaliacao) partes.push(avaliacao);

  return partes.join("\n\n");
}
