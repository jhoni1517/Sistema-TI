/**
 * O resumo da semana, para o dono ler na segunda de manhã.
 *
 * Sem IA: é conta, e conta tem teste. Sai o que muda a semana que começa:
 * quanto entrou e sobrou, o que foi entregue, o que está parado na
 * bancada, o que está acabando e quem mais comprou.
 *
 * ESTA CONTA EXISTE DUAS VEZES: aqui (Painel) e em api/_resumo.js (o robô
 * de segunda). Função da Vercel não importa TypeScript. O
 * resumo-semanal.test.ts roda as duas nos mesmos dados e reprova se o
 * texto sair diferente.
 */

export interface DadosResumo {
  movimentos: { tipo: string; valor: number; custoRelacionado?: number; compraEstoque?: boolean; faturaCartao?: boolean; categoria?: string; clienteId?: string; data: string }[];
  ordens: { numero: number; status: string; clienteId?: string; entregueEm?: string; atualizadoEm?: string; criadoEm?: string; marca?: string; modelo?: string }[];
  produtos: { nome: string; quantidade: number; estoqueMinimo: number; servico?: boolean }[];
  clientes: { id: string; nome: string }[];
}

const FINAIS = ["entregue", "cancelada"];
const n = (v: unknown) => Number(v) || 0;
const dia = (iso?: string) => String(iso || "").slice(0, 10);
const brl = (v: number) =>
  "R$ " + (Math.round(v * 100) / 100).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");

function menosDias(d: string, k: number): string {
  const x = new Date(d + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() - k);
  return x.toISOString().slice(0, 10);
}

const estoqueOuFatura = (m: DadosResumo["movimentos"][number]) =>
  m.tipo === "saida" &&
  (m.compraEstoque === true ||
    m.faturaCartao === true ||
    (m.compraEstoque === undefined && /^(compra de pe[cç]as?|fornecedor)$/i.test(String(m.categoria || "").trim())));

/** A semana que ACABOU: os 7 dias antes de hoje (segunda pega seg a dom) */
export function semanaPassada(hoje: string): { de: string; ate: string } {
  return { de: menosDias(hoje, 7), ate: menosDias(hoje, 1) };
}

export function resumoDaSemana(d: DadosResumo, hoje: string, nomeLoja: string): string {
  const { de, ate } = semanaPassada(hoje);
  const naSemana = (iso?: string) => dia(iso) >= de && dia(iso) <= ate;
  const movs = d.movimentos.filter((m) => naSemana(m.data));
  const entrou = movs.filter((m) => m.tipo === "entrada").reduce((s, m) => s + n(m.valor), 0);
  const custo = movs.reduce((s, m) => s + n(m.custoRelacionado), 0);
  const despesas = movs.filter((m) => m.tipo === "saida" && !estoqueOuFatura(m)).reduce((s, m) => s + n(m.valor), 0);
  const sobra = entrou - custo - despesas;

  const entregues = d.ordens.filter((o) => o.status === "entregue" && naSemana(o.entregueEm)).length;
  const paradas = d.ordens
    .filter((o) => !FINAIS.includes(o.status) && dia(o.atualizadoEm || o.criadoEm) && dia(o.atualizadoEm || o.criadoEm) <= menosDias(hoje, 7))
    .sort((a, b) => dia(a.atualizadoEm || a.criadoEm).localeCompare(dia(b.atualizadoEm || b.criadoEm)));
  const acabando = d.produtos
    .filter((p) => !p.servico && n(p.quantidade) <= n(p.estoqueMinimo))
    .sort((a, b) => n(a.quantidade) - n(b.quantidade) || a.nome.localeCompare(b.nome));

  const porCliente = new Map<string, number>();
  for (const m of movs) if (m.tipo === "entrada" && m.clienteId) porCliente.set(m.clienteId, (porCliente.get(m.clienteId) || 0) + n(m.valor));
  const nome = new Map(d.clientes.map((c) => [c.id, c.nome]));
  const melhores = [...porCliente.entries()]
    .filter(([id]) => nome.has(id))
    .sort((a, b) => b[1] - a[1] || String(nome.get(a[0])).localeCompare(String(nome.get(b[0]))))
    .slice(0, 3);

  const dm = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
  const linhas = [
    `*${String(nomeLoja || "Sua loja").trim()} - resumo da semana*`,
    `${dm(de)} a ${dm(ate)}`,
    "",
    `Entrou: *${brl(entrou)}*`,
    `Sobrou: *${brl(sobra)}* (tirando peças, produtos e despesas)`,
  ];
  if (d.ordens.length > 0) linhas.push(`OS entregues: ${entregues}`);
  if (paradas.length > 0) {
    linhas.push("", `*Paradas há mais de 7 dias (${paradas.length}):*`);
    for (const o of paradas.slice(0, 5)) {
      linhas.push(`- OS${String(o.numero).padStart(5, "0")} ${[o.marca, o.modelo].filter(Boolean).join(" ")}`.trimEnd());
    }
  }
  if (acabando.length > 0) {
    linhas.push("", `*Acabando no estoque (${acabando.length}):*`);
    for (const p of acabando.slice(0, 5)) linhas.push(`- ${p.nome} (${n(p.quantidade)})`);
  }
  if (melhores.length > 0) {
    linhas.push("", "*Quem mais comprou:*");
    melhores.forEach(([id, v], i) => linhas.push(`${i + 1}. ${nome.get(id)} - ${brl(v)}`));
  }
  if (entrou === 0 && d.ordens.length === 0) linhas.push("", "Semana sem movimento no sistema.");
  return linhas.join("\n");
}
