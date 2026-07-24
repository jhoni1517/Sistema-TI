import type { OrdemServico, Config, MovimentoCaixa, SessaoCaixa } from "./types";
import { OS_STATUS_META } from "./types";
import { brl, formatDate, formatDateTime, codigoOS } from "./format";
import { totalPecas, totalOS, receitaBruta, totalDespesas, totalSangrias } from "./calc";

const cab = (config: Config) => `
  <div class="head">
    <h1>${config.nomeLoja || "Assistência Técnica"}</h1>
    ${config.enderecoLoja ? `<p>${config.enderecoLoja}</p>` : ""}
    <p>${[config.telefoneLoja, config.cnpj].filter(Boolean).join(" · ")}</p>
  </div>`;

export function reciboOS(
  os: OrdemServico,
  cliente: { nome?: string; telefone?: string; cpf?: string } | undefined,
  config: Config
): string {
  const itens = os.pecas
    .map(
      (p) => `<tr>
        <td>${p.descricao || "-"}</td>
        <td class="center">${p.quantidade}</td>
        <td class="right">${brl(p.precoUnit)}</td>
        <td class="right">${brl(p.precoUnit * p.quantidade)}</td>
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
    <div class="box" style="flex:1">
      <div class="label">Cliente</div>
      <div class="val"><b>${cliente?.nome || "-"}</b></div>
      <div class="label">Contato</div>
      <div class="val">${[cliente?.telefone, cliente?.cpf].filter(Boolean).join(" · ") || "-"}</div>
    </div>
    <div class="box" style="flex:1">
      <div class="label">Aparelho</div>
      <div class="val"><b>${[os.tipoAparelho, os.marca, os.modelo].filter(Boolean).join(" ")}</b></div>
      <div class="label">Cor / IMEI / Série</div>
      <div class="val">${[os.cor, os.imeiSerial].filter(Boolean).join(" · ") || "-"}</div>
      ${os.acessorios ? `<div class="label">Acessórios</div><div class="val">${os.acessorios}</div>` : ""}
    </div>
  </div>

  <div class="box">
    <div class="label">Defeito relatado</div>
    <div class="val">${os.defeitoRelatado || "-"}</div>
    ${os.defeitoConstatado ? `<div class="label">Laudo técnico</div><div class="val">${os.defeitoConstatado}</div>` : ""}
  </div>

  ${
    os.pecas.length
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

  <div class="foot">
    Garantia de ${os.garantiaDias} dias sobre o serviço realizado.<br/>
    ${os.tecnico ? `Técnico responsável: ${os.tecnico}` : ""}
  </div>

  <div class="sign">
    <div>Assinatura do cliente</div>
    <div>${config.nomeLoja || "Assistência"}</div>
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
        <td>${m.descricao}</td>
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
    <div>${config.nomeLoja || "Responsável"}</div>
  </div>`;
}
