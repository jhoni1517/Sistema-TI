import type { OrdemServico, Config, MovimentoCaixa, SessaoCaixa } from "./types";
import { OS_STATUS_META } from "./types";
import { brl, formatDate, formatDateTime, codigoOS } from "./format";
import { totalPecas, totalOS, receitaBruta, totalDespesas, totalSangrias } from "./calc";

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

const cab = (config: Config) => `
  <div class="head">
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
  const pecas = os.pecas || [];
  const itens = pecas
    .map(
      (p) => `<tr>
        <td>${esc(p.descricao) || "-"}</td>
        <td class="center">${esc(p.quantidade)}</td>
        <td class="right">${brl(Number(p.precoUnit) || 0)}</td>
        <td class="right">${brl((Number(p.precoUnit) || 0) * (Number(p.quantidade) || 0))}</td>
      </tr>`
    )
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

  <div class="box" style="margin-top:14px">
    <div class="label">Termo de guarda e retirada</div>
    <div style="font-size:11px;color:#333">${termoGuarda}</div>
  </div>

  <div class="sign">
    <div>Assinatura do cliente</div>
    <div>${esc(config.nomeLoja) || "Assistência"}</div>
  </div>`;
}

export function reciboFechamento(
  sessao: SessaoCaixa | null,
  movimentos: MovimentoCaixa[],
  config: Config
): string {
  const entradas = receitaBruta(movimentos);
  const saidas = totalDespesas(movimentos);
  const sangrias = totalSangrias(movimentos);
  const abertura = sessao?.valorAbertura || 0;
  const saldo = abertura + entradas - saidas - sangrias;

  // por forma de pagamento (só entradas)
  const formas: Record<string, number> = {};
  movimentos
    .filter((m) => m.tipo === "entrada")
    .forEach((m) => (formas[m.formaPagamento] = (formas[m.formaPagamento] || 0) + m.valor));
  const linhasFormas = Object.entries(formas)
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
