import type { OrdemServico, Config, MovimentoCaixa, SessaoCaixa, Venda } from "./types";
import { OS_STATUS_META } from "./types";
import { brl, formatDate, formatDateTime, codigoOS, txt } from "./format";
import { totalPecas, totalOS } from "./calc";
import { opcaoDaPeca, opcaoAtual, subtotalPeca } from "./orcamento";
import { resumoCaixa, conferencia, CONFERENCIA_META } from "./caixa";
import { subtotalItem, subtotalVenda, totalVenda, trocoDe } from "./pdv";
import { barrasEAN13, precoDaEtiqueta, type Etiqueta } from "./etiqueta";
import { trocoDoPagamento } from "./pagamento";

/**
 * Escapa texto antes de entrar no HTML do recibo.
 *
 * Sem isto, um cliente chamado "Silva & Cia" ou um defeito descrito como
 * "tela < 5 polegadas" quebram a marcação e o recibo sai torto ou com
 * pedaços faltando. Também fecha a porta para alguém colar HTML num campo
 * de texto e alterar o que o recibo mostra.
 */
const esc = (v?: string | number | null): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Cabeçalho do documento impresso.
 *
 * A logo tem altura fixa em milímetros: definir em pixel dá tamanhos
 * diferentes em cada impressora, e uma logo ocupando meia folha no papel
 * térmico da bobina estraga o recibo inteiro.
 */
const cab = (config: Config) => `
  <div class="head">
    ${
      config.logoUrl
        ? `<img src="${esc(config.logoUrl)}" alt=""
             style="max-height:18mm;max-width:60mm;object-fit:contain;margin-bottom:4px" />`
        : ""
    }
    <h1>${esc(config.nomeLoja) || "Assistência Técnica"}</h1>
    ${config.enderecoLoja ? `<p>${esc(config.enderecoLoja)}</p>` : ""}
    <p>${[config.telefoneLoja, config.cnpj].filter(Boolean).map(esc).join(" · ")}</p>
  </div>`;

export function reciboOS(
  os: OrdemServico,
  cliente: { nome?: string; telefone?: string; cpf?: string } | undefined,
  config: Config,
  opts?: { incluirCliente?: boolean }
): string {
  const incluirCliente = opts?.incluirCliente !== false && !!cliente?.nome;
  const dias = config.diasAbandono || 90;
  const taxa = config.taxaArmazenamentoDia || 0;
  const termoGuarda =
    `Prazo de retirada: o equipamento deve ser retirado em até ${dias} dias após a comunicação de conclusão do serviço.` +
    (taxa > 0
      ? ` Após esse prazo, será cobrada taxa de armazenamento/guarda de ${brl(taxa)} por dia.`
      : "") +
    ` Decorrido o prazo legal sem retirada, o aparelho poderá ser vendido para custear o serviço/armazenamento ou descartado, nos termos da legislação vigente. O cliente declara ciência destas condições.`;
  // Opção recusada sai riscada em vez de sumir: o cliente assina um
  // documento que mostra as opções que teve e a que ele escolheu.
  const escolhida = opcaoAtual(os);
  const pecas = os.pecas || [];
  const itens = pecas
    .map((p) => {
      const nome = opcaoDaPeca(p);
      const recusada = !!nome && nome !== escolhida;
      const marca = nome ? ` <span class="muted">(${esc(nome)})</span>` : "";
      return `<tr${recusada ? ' style="color:#999;text-decoration:line-through"' : ""}>
        <td>${esc(p.descricao) || "-"}${marca}</td>
        <td class="center">${esc(p.quantidade)}</td>
        <td class="right">${brl(Number(p.precoUnit) || 0)}</td>
        <td class="right">${brl(subtotalPeca(p))}</td>
      </tr>`;
    })
    .join("");

  return `
  ${cab(config)}
  <div class="row" style="margin-bottom:12px">
    <div><span class="badge">${codigoOS(os.numero)}</span> &nbsp; <b>${OS_STATUS_META[os.status].label}</b></div>
    <div class="muted">${formatDateTime(os.criadoEm)}</div>
  </div>

  <div class="row">
    ${
      incluirCliente
        ? `<div class="box" style="flex:1">
      <div class="label">Cliente</div>
      <div class="val"><b>${esc(cliente?.nome) || "-"}</b></div>
      <div class="label">Contato</div>
      <div class="val">${[cliente?.telefone, cliente?.cpf].filter(Boolean).map(esc).join(" · ") || "-"}</div>
    </div>`
        : ""
    }
    <div class="box" style="flex:1">
      <div class="label">Aparelho</div>
      <div class="val"><b>${[os.tipoAparelho, os.marca, os.modelo].filter(Boolean).map(esc).join(" ")}</b></div>
      <div class="label">Cor / IMEI / Série</div>
      <div class="val">${[os.cor, os.imeiSerial].filter(Boolean).map(esc).join(" · ") || "-"}</div>
      ${os.acessorios ? `<div class="label">Acessórios</div><div class="val">${esc(os.acessorios)}</div>` : ""}
    </div>
  </div>

  <div class="box">
    <div class="label">Defeito relatado</div>
    <div class="val">${esc(os.defeitoRelatado) || "-"}</div>
    ${os.defeitoConstatado ? `<div class="label">Laudo técnico</div><div class="val">${esc(os.defeitoConstatado)}</div>` : ""}
  </div>

  ${
    pecas.length
      ? `<table>
          <thead><tr><th>Peça / Serviço</th><th class="center">Qtd</th><th class="right">Preço</th><th class="right">Subtotal</th></tr></thead>
          <tbody>${itens}</tbody>
        </table>`
      : ""
  }

  <div class="tot">
    <div class="line"><span>Peças</span><span>${brl(totalPecas(os))}</span></div>
    <div class="line"><span>Mão de obra</span><span>${brl(os.maoDeObra || 0)}</span></div>
    ${os.desconto ? `<div class="line"><span>Desconto</span><span>- ${brl(os.desconto)}</span></div>` : ""}
    <div class="line grand"><span>Total</span><span>${brl(totalOS(os))}</span></div>
  </div>

  ${os.tecnico ? `<div class="muted" style="margin-top:10px">Técnico responsável: ${esc(os.tecnico)}</div>` : ""}

  ${
    // As fotos da entrada saem no papel que o cliente assina: é ali que elas
    // deixam de ser registro interno e passam a valer como prova do estado.
    (os.fotos || []).length > 0
      ? `<div class="box" style="margin-top:14px">
          <div class="label">Estado do aparelho na entrada</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">
            ${(os.fotos || [])
              .slice(0, 6)
              .map(
                (u) =>
                  `<img src="${esc(u)}" style="width:28mm;height:28mm;object-fit:cover;border:1px solid #ddd" />`
              )
              .join("")}
          </div>
        </div>`
      : ""
  }

  <div class="box" style="margin-top:14px">
    <div class="label">Termo de guarda e retirada</div>
    <div style="font-size:11px;color:#333">${termoGuarda}</div>
  </div>

  ${
    // Só no comprovante da entrega: o cliente está com o aparelho na mão e
    // satisfeito. É o único momento em que pedir avaliação faz sentido.
    os.status === "entregue" && txt(config.linkAvaliacao).trim()
      ? `<div class="box" style="margin-top:14px;text-align:center">
          <div style="font-size:12px">
            Seu feedback é importante para a ${esc(config.nomeLoja) || "nossa loja"}.
            Poste uma avaliação no nosso perfil.
          </div>
          <div style="font-size:11px;word-break:break-all;margin-top:4px">${esc(
            txt(config.linkAvaliacao).trim()
          )}</div>
        </div>`
      : ""
  }

  <div class="sign">
    <div>Assinatura do cliente</div>
    <div>${esc(config.nomeLoja) || "Assistência"}</div>
  </div>`;
}

/**
 * Recibo de uma venda, para entregar ao cliente.
 *
 * É outro documento que o fechamento de caixa: aquele é conferência interna
 * e mostra o dia inteiro, inclusive despesas e sangrias — coisa que nenhum
 * cliente pode levar para casa. Aqui sai só a compra dele.
 */
export function reciboVenda(
  mov: MovimentoCaixa,
  config: Config,
  cliente?: { nome?: string; telefone?: string; cpf?: string }
): string {
  const valor = Number(mov.valor) || 0;
  return `
  ${cab(config)}
  <h2 class="center" style="margin-bottom:6px">Recibo de Venda</h2>
  <p class="center muted" style="margin-bottom:14px">
    ${formatDateTime(mov.data)}
  </p>

  ${
    cliente?.nome
      ? `<div class="box">
          <div class="label">Cliente</div>
          <div class="val"><b>${esc(cliente.nome)}</b></div>
          ${
            cliente.telefone || cliente.cpf
              ? `<div class="val muted">${[cliente.telefone, cliente.cpf].filter(Boolean).map(esc).join(" · ")}</div>`
              : ""
          }
        </div>`
      : ""
  }

  <table>
    <thead><tr><th>Descrição</th><th class="right">Valor</th></tr></thead>
    <tbody>
      <tr>
        <td>${esc(mov.descricao) || "Venda"}</td>
        <td class="right">${brl(valor)}</td>
      </tr>
    </tbody>
  </table>

  <div class="tot">
    <div class="line"><span>Forma de pagamento</span><span style="text-transform:capitalize">${esc(mov.formaPagamento)}</span></div>
    <div class="line grand"><span>Total</span><span>${brl(valor)}</span></div>
  </div>

  <p style="margin-top:14px;font-size:12px">
    Recebemos de ${cliente?.nome ? `<b>${esc(cliente.nome)}</b>` : "_____________________________"}
    a importância de <b>${brl(valor)}</b> referente ao descrito acima.
  </p>

  <div class="sign">
    <div>Cliente</div>
    <div>${esc(config.nomeLoja) || "Loja"}</div>
  </div>`;
}

/**
 * Cupom da venda de balcão, com os itens.
 *
 * Diferente do reciboVenda, que descreve um lançamento avulso do caixa:
 * aqui existe carrinho, e o cliente confere item por item. Sem os itens o
 * cupom não serve para trocar nem devolver mercadoria.
 */
export function reciboPDV(
  v: Venda,
  config: Config,
  cliente?: { nome?: string; telefone?: string; cpf?: string }
): string {
  const bruto = subtotalVenda(v.itens || []);
  const total = totalVenda(v);
  const desconto = Math.max(0, Number(v.desconto) || 0);
  const recebido = Number(v.valorRecebido) || 0;

  const linhas = (v.itens || [])
    .map(
      (i) => `<tr>
        <td>${esc(i.descricao)}</td>
        <td class="center">${
          i.porPeso
            ? `${Number(i.quantidade).toFixed(3).replace(".", ",")} kg`
            : esc(i.quantidade)
        }</td>
        <td class="right">${brl(Number(i.precoUnit) || 0)}${i.porPeso ? "/kg" : ""}</td>
        <td class="right">${brl(subtotalItem(i))}</td>
      </tr>`
    )
    .join("");

  return `
  ${cab(config)}
  <h2 class="center" style="margin-bottom:6px">Cupom de Venda ${esc(v.numero)}</h2>
  <p class="center muted" style="margin-bottom:14px">${formatDateTime(v.criadoEm)}</p>

  ${
    cliente?.nome
      ? `<div class="box"><div class="label">Cliente</div><div class="val"><b>${esc(
          cliente.nome
        )}</b></div></div>`
      : ""
  }

  <table>
    <thead><tr><th>Item</th><th class="center">Qtd</th><th class="right">Preço</th><th class="right">Total</th></tr></thead>
    <tbody>${linhas || '<tr><td colspan="4" class="center muted">Sem itens</td></tr>'}</tbody>
  </table>

  <div class="tot">
    ${desconto > 0 ? `<div class="line"><span>Subtotal</span><span>${brl(bruto)}</span></div>` : ""}
    ${desconto > 0 ? `<div class="line"><span>Desconto</span><span>- ${brl(desconto)}</span></div>` : ""}
    <div class="line grand"><span>Total</span><span>${brl(total)}</span></div>
    ${
      // Venda dividida mostra CADA forma. Um cupom dizendo só "crédito" numa
      // venda de 200 com 10 em espécie não bate com o que o cliente pagou —
      // e é o cupom que ele leva para conferir.
      (v.pagamentos || []).length > 1
        ? (v.pagamentos || [])
            .map(
              (pg) =>
                `<div class="line"><span style="text-transform:capitalize">${esc(
                  pg.forma
                )}</span><span>${brl(Number(pg.valor) || 0)}</span></div>`
            )
            .join("")
        : `<div class="line"><span>Pagamento</span><span style="text-transform:capitalize">${esc(
            v.formaPagamento
          )}</span></div>`
    }
    ${
      (v.pagamentos || []).length > 1
        ? (() => {
            const t = trocoDoPagamento(total, v.pagamentos || []);
            return t > 0
              ? `<div class="line"><span>Troco</span><span>${brl(t)}</span></div>`
              : "";
          })()
        : v.formaPagamento === "dinheiro" && recebido > 0
          ? `<div class="line"><span>Recebido</span><span>${brl(recebido)}</span></div>
             <div class="line"><span>Troco</span><span>${brl(trocoDe(total, recebido))}</span></div>`
          : ""
    }
  </div>

  <p class="center muted" style="margin-top:14px;font-size:11px">
    Documento sem valor fiscal. Guarde para troca ou devolucao.
  </p>`;
}

export function reciboFechamento(
  sessao: SessaoCaixa | null,
  movimentos: MovimentoCaixa[],
  config: Config
): string {
  // A conta vem de lib/caixa.ts, a mesma que a tela usa. Recibo com número
  // diferente do que estava na tela é o pior tipo de erro: ninguém sabe em
  // qual acreditar.
  const r = resumoCaixa(sessao, movimentos);
  const { abertura, entradas, saidas, sangrias, saldo } = r;
  const conf = conferencia(r);

  const linhasFormas = Object.entries(r.porForma)
    .map(([f, v]) => `<div class="line"><span style="text-transform:capitalize">${f}</span><span>${brl(v)}</span></div>`)
    .join("");

  const linhasMov = [...movimentos]
    .sort((a, b) => a.data.localeCompare(b.data))
    .map(
      (m) => `<tr>
        <td>${formatDateTime(m.data)}</td>
        <td>${esc(m.descricao)}</td>
        <td style="text-transform:capitalize">${m.tipo === "entrada" ? "Entrada" : m.tipo === "sangria" ? "Sangria" : "Saída"}</td>
        <td class="right">${m.tipo === "entrada" ? "" : "- "}${brl(m.valor)}</td>
      </tr>`
    )
    .join("");

  return `
  ${cab(config)}
  <h2 class="center" style="margin-bottom:6px">Fechamento de Caixa</h2>
  <p class="center muted" style="margin-bottom:14px">
    ${sessao ? `Aberto em ${formatDateTime(sessao.abertoEm)}` : "Movimento do dia"} · Emitido ${formatDate(new Date().toISOString())}
  </p>

  <div class="row">
    <div class="box" style="flex:1">
      <div class="tot" style="width:100%">
        <div class="line"><span>Abertura (troco)</span><span>${brl(abertura)}</span></div>
        <div class="line"><span>Entradas</span><span>${brl(entradas)}</span></div>
        <div class="line"><span>Saídas</span><span>- ${brl(saidas)}</span></div>
        <div class="line"><span>Sangrias</span><span>- ${brl(sangrias)}</span></div>
        <div class="line grand"><span>Saldo em caixa</span><span>${brl(saldo)}</span></div>
        ${
          r.contado !== undefined
            ? `<div class="line"><span>Contado na gaveta</span><span>${brl(r.contado)}</span></div>
               <div class="line"><b>${CONFERENCIA_META[conf].label}</b><b>${
                 (r.diferenca || 0) > 0 ? "+ " : (r.diferenca || 0) < 0 ? "- " : ""
               }${brl(Math.abs(r.diferenca || 0))}</b></div>`
            : ""
        }
      </div>
    </div>
    <div class="box" style="flex:1">
      <div class="label" style="margin-bottom:6px">Entradas por forma de pagamento</div>
      <div class="tot" style="width:100%">${linhasFormas || '<div class="muted">Sem entradas</div>'}</div>
    </div>
  </div>

  <table>
    <thead><tr><th>Data</th><th>Descrição</th><th>Tipo</th><th class="right">Valor</th></tr></thead>
    <tbody>${linhasMov || '<tr><td colspan="4" class="center muted">Sem movimentações</td></tr>'}</tbody>
  </table>

  <div class="sign">
    <div>Conferido por</div>
    <div>${esc(config.nomeLoja) || "Responsável"}</div>
  </div>`;
}

/**
 * Folha de etiquetas de gôndola.
 *
 * Três por linha em papel A4, que é o que cabe legível sem lupa e sem
 * desperdiçar papel. O código de barras vai em SVG: etiqueta impressa em
 * baixa resolução não é lida pelo leitor, e o vetor sai nítido até na jato
 * de tinta velha do balcão.
 *
 * `page-break-inside: avoid` em cada etiqueta impede o pior resultado
 * possível — a etiqueta cortada ao meio pela quebra de página, que só
 * aparece depois de imprimir cem delas.
 */
export function folhaDeEtiquetas(etiquetas: Etiqueta[], config: Config): string {
  const celulas = etiquetas
    .map((e) => {
      const barras = barrasEAN13(e.codigo, 30);
      return `<div class="etq">
        <div class="etq-loja">${esc(config.nomeLoja) || ""}</div>
        <div class="etq-nome">${esc(e.nome)}</div>
        ${
          e.precoDe > 0
            ? `<div class="etq-de">de ${brl(e.precoDe)}</div>`
            : ""
        }
        <div class="etq-preco">${esc(precoDaEtiqueta(e))}</div>
        ${
          barras
            ? `<div class="etq-barras">${barras}</div>
               <div class="etq-cod">${esc(e.codigo)}</div>`
            : `<div class="etq-cod">${esc(e.codigo) || "sem código"}</div>`
        }
      </div>`;
    })
    .join("");

  return `
  <style>
    .etqs { display: flex; flex-wrap: wrap; gap: 4mm; }
    .etq {
      width: 60mm; padding: 3mm; border: 1px dashed #999; border-radius: 2mm;
      text-align: center; page-break-inside: avoid;
    }
    .etq-loja { font-size: 8px; text-transform: uppercase; color: #777; letter-spacing: .05em; }
    .etq-nome { font-size: 12px; font-weight: bold; margin: 1mm 0; min-height: 9mm; }
    .etq-de { font-size: 10px; color: #777; text-decoration: line-through; }
    .etq-preco { font-size: 22px; font-weight: bold; line-height: 1.1; }
    .etq-barras { margin-top: 1.5mm; }
    .etq-cod { font-size: 9px; letter-spacing: .12em; color: #333; }
  </style>
  <div class="etqs">${celulas}</div>`;
}
