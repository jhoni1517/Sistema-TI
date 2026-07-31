// ============================================================
// Rotina diária de cobrança das mensalidades
// Endpoint: /api/cobranca  (chamado pelo cron do Vercel)
//
// O que faz: olha o vencimento de todas as lojas e manda no seu Telegram
// um resumo do que precisa de ação — quem vence em breve, quem venceu e
// quem já está travada. Sem isto, o aviso só existe para quem abre o
// sistema, e quem sumiu por uma semana é pego de surpresa.
//
// Cada aviso é gravado no banco para não repetir todo dia. O gatilho é a
// combinação loja + tipo + data de vencimento: quando a loja renova, a
// data muda e o ciclo recomeça naturalmente.
//
// Variáveis de ambiente no Vercel:
//   SUPABASE_URL                -> mesma do VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   -> chave "service_role" (Settings -> API)
//   TELEGRAM_TOKEN              -> já existe, do robô de despesas
//   TELEGRAM_CHAT_ID            -> seu chat, para onde vai o resumo
//   CRON_SECRET                 -> (opcional) protege a chamada manual
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const CRON_SECRET = process.env.CRON_SECRET;

const dinheiro = (v) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Dias inteiros até o vencimento (negativo = já venceu) */
const diasAte = (iso) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);

/** Mesma régua usada na interface (src/lib/cobranca.ts) */
function tipoDoAviso(dias, tolerancia) {
  if (dias === null) return null;
  if (dias > 3) return null;
  if (dias > 0) return "vence_em_breve";
  if (dias === 0) return "vence_hoje";
  if (dias >= -tolerancia) return "vencida";
  return "somente_leitura";
}

async function sb(caminho, opcoes = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
    ...opcoes,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(opcoes.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

async function enviarTelegram(texto) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return false;
  const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: texto,
      parse_mode: "Markdown",
    }),
  });
  return r.ok;
}

// Sem emoji: em alguns aparelhos elas chegam como "?" e sujam o aviso
const TITULO = {
  somente_leitura: "TRAVADAS (não conseguem cadastrar)",
  vencida: "VENCIDAS (ainda na tolerância)",
  vence_hoje: "VENCEM HOJE",
  vence_em_breve: "VENCEM EM BREVE",
};

export default async function handler(req, res) {
  // Só o cron do Vercel ou quem tem o segredo. Um endpoint aberto que
  // dispara mensagem é convite para alguém encher seu Telegram.
  const doCron = !!req.headers["x-vercel-cron"];
  const token = req.query?.token || (req.headers.authorization || "").replace("Bearer ", "");
  if (!doCron && (!CRON_SECRET || token !== CRON_SECRET)) {
    return res.status(401).json({ erro: "não autorizado" });
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({
      erro: "Faltam as variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no Vercel.",
    });
  }

  try {
    const cfgs = await sb("sistema_config?select=dias_tolerancia&limit=1");
    const tolerancia = Number(cfgs?.[0]?.dias_tolerancia ?? 5);

    const lojas = await sb(
      'lojas?select=id,nome,venceEm,valor_mensal,bloqueada,isento' +
        '&venceEm=not.is.null&isento=is.false'
    );

    // Avisos já enviados, para não repetir o mesmo todo dia
    const jaEnviados = await sb("avisos_cobranca?select=loja_id,tipo,referencia");
    const chaveEnviada = new Set(
      (jaEnviados || []).map((a) => `${a.loja_id}|${a.tipo}|${a.referencia}`)
    );

    const novos = [];
    const grupos = {
      somente_leitura: [],
      vencida: [],
      vence_hoje: [],
      vence_em_breve: [],
    };

    for (const l of lojas || []) {
      if (l.bloqueada || l.isento) continue; // desligada de propósito, ou é a sua
      const dias = diasAte(l.venceEm);
      const tipo = tipoDoAviso(dias, tolerancia);
      if (!tipo) continue;

      const referencia = String(l.venceEm).slice(0, 10);
      const chave = `${l.id}|${tipo}|${referencia}`;
      if (chaveEnviada.has(chave)) continue; // este aviso já saiu

      grupos[tipo].push({ nome: l.nome, dias, valor: l.valor_mensal });
      novos.push({ loja_id: l.id, tipo, referencia });
    }

    // Sem mensalidade nova a avisar, os OUTROS avisos ainda precisam sair.
    // Antes o return curto aqui matava contas, agenda e fiado no mesmo dia:
    // bastava nenhuma loja estar vencendo para o aviso do aluguel sumir.
    if (novos.length === 0) {
      return res.status(200).json({
        ok: true,
        enviados: 0,
        mensagem: "nenhuma mensalidade nova",
        contas: await avisarContas(),
        agenda: await avisarAgenda(),
        fiado: await avisarFiado(),
      });
    }

    // Monta o resumo
    const partes = ["*Mensalidades — resumo do dia*"];
    let aReceber = 0;
    for (const tipo of ["somente_leitura", "vencida", "vence_hoje", "vence_em_breve"]) {
      const g = grupos[tipo];
      if (g.length === 0) continue;
      const itens = g.map((l) => {
        if (tipo === "vence_em_breve") return `• ${l.nome} — em ${l.dias}d`;
        if (tipo === "vence_hoje") return `• ${l.nome} — hoje`;
        aReceber += Number(l.valor) || 0;
        return `• ${l.nome} — ${Math.abs(l.dias)}d em atraso (${dinheiro(l.valor)})`;
      });
      partes.push(`${TITULO[tipo]}\n${itens.join("\n")}`);
    }
    if (aReceber > 0) partes.push(`Total em atraso: *${dinheiro(aReceber)}*`);

    const enviou = await enviarTelegram(partes.join("\n\n"));

    // Só marca como avisado se a mensagem realmente saiu — se o Telegram
    // estiver fora do ar, o aviso volta amanhã em vez de sumir.
    if (enviou) {
      await sb("avisos_cobranca", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates" },
        body: JSON.stringify(novos),
      });
    }

    const contas = await avisarContas();
    const agenda = await avisarAgenda();
    const fiado = await avisarFiado();

    return res.status(200).json({
      ok: true,
      enviados: enviou ? novos.length : 0,
      contas,
      agenda,
      fiado,
      telegram: enviou ? "enviado" : "não configurado ou falhou",
    });
  } catch (e) {
    return res.status(500).json({ erro: String(e?.message || e) });
  }
}

/**
 * Lembrete das contas a pagar de cada loja.
 *
 * A notificação do navegador só alcança quem está com o sistema aberto.
 * Este aqui chega no celular mesmo com tudo fechado — é o que evita
 * esquecer o aluguel por não ter entrado no sistema naquele dia.
 */
async function avisarContas() {
  // A tabela pode não existir ainda (migração não rodada): falhar aqui não
  // pode derrubar o aviso de mensalidade, que é independente.
  let contas;
  try {
    contas = await sb(
      'contas_pagar?select=id,descricao,valor,vencimento,"lembreteDias",ativo,recorrencia,pagamentos,"lojaId"&ativo=is.true'
    );
  } catch {
    return "tabela de contas ainda não existe";
  }

  let jaAvisados;
  try {
    jaAvisados = await sb("avisos_contas?select=conta_id,referencia,tipo");
  } catch {
    return "tabela de avisos ainda não existe";
  }

  const enviados = new Set(
    (jaAvisados || []).map((a) => `${a.conta_id}|${a.referencia}|${a.tipo}`)
  );

  const atrasadas = [];
  const hoje = [];
  const proximas = [];
  const novos = [];

  for (const c of contas || []) {
    // Conta avulsa já quitada não volta a cobrar
    if (c.recorrencia === "unica" && (c.pagamentos || []).length > 0) continue;

    const dias = diasAte(c.vencimento);
    const limite = Number(c.lembreteDias ?? 3);
    if (dias > limite) continue;

    const tipo = dias < 0 ? "atrasada" : dias === 0 ? "hoje" : "proxima";
    const referencia = String(c.vencimento).slice(0, 10);
    if (enviados.has(`${c.id}|${referencia}|${tipo}`)) continue;

    const linha = `• ${c.descricao} — ${dinheiro(c.valor)}` +
      (dias < 0 ? ` (${Math.abs(dias)}d em atraso)` : dias > 0 ? ` (em ${dias}d)` : "");
    (dias < 0 ? atrasadas : dias === 0 ? hoje : proximas).push(linha);

    novos.push({ lojaId: c.lojaId, conta_id: c.id, referencia, tipo });
  }

  if (novos.length === 0) return "nada novo";

  const partes = ["*Contas a pagar*"];
  if (atrasadas.length) partes.push(`EM ATRASO\n${atrasadas.join("\n")}`);
  if (hoje.length) partes.push(`VENCEM HOJE\n${hoje.join("\n")}`);
  if (proximas.length) partes.push(`CHEGANDO\n${proximas.join("\n")}`);

  const ok = await enviarTelegram(partes.join("\n\n"));
  if (!ok) return "telegram não configurado";

  await sb("avisos_contas", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates" },
    body: JSON.stringify(novos),
  });

  return `${novos.length} lembrete(s) enviado(s)`;
}

/**
 * Lembrete da agenda do dia.
 *
 * Só o que acontece HOJE e o que já entrou na antecedência pedida. Agenda
 * que manda a semana inteira todo dia vira ruído, e ruído a pessoa silencia.
 *
 * Sem tabela de controle aqui: o compromisso do dia pode ser lembrado de
 * novo amanhã se ainda não foi concluído, ao contrário da conta, que só
 * precisa ser cobrada uma vez por vencimento.
 */
async function avisarAgenda() {
  let eventos;
  try {
    eventos = await sb(
      'eventos?select=id,titulo,tipo,data,hora,local,repetir,"avisarDiasAntes",concluido&concluido=is.false'
    );
  } catch {
    return "tabela de eventos ainda não existe";
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const doDia = [];
  const chegando = [];

  for (const e of eventos || []) {
    const data = proximaData(e, hoje);
    if (!data) continue;
    const dias = diasAte(data + "T00:00:00Z");
    if (dias < 0) continue;
    const antecedencia = Number(e.avisarDiasAntes ?? 0);
    if (dias > antecedencia) continue;

    const linha = `• ${e.hora ? e.hora + " " : ""}${e.titulo}` +
      (e.local ? ` — ${e.local}` : "") +
      (dias > 0 ? ` (em ${dias}d)` : "");
    (dias === 0 ? doDia : chegando).push(linha);
  }

  // Aniversários avisam na véspera: dá tempo de separar um brinde.
  const parabens = await aniversariosProximos(hoje);

  if (doDia.length === 0 && chegando.length === 0 && parabens.length === 0) {
    return "nada na agenda";
  }

  const partes = ["*Agenda*"];
  if (doDia.length) partes.push(`HOJE\n${doDia.join("\n")}`);
  if (chegando.length) partes.push(`CHEGANDO\n${chegando.join("\n")}`);
  if (parabens.length) partes.push(`ANIVERSÁRIOS\n${parabens.join("\n")}`);

  const ok = await enviarTelegram(partes.join("\n\n"));
  return ok ? `${doDia.length + chegando.length + parabens.length} item(ns)` : "telegram não configurado";
}

/** Próxima data do evento, respeitando a repetição. Espelha src/lib/agenda.ts */
function proximaData(evento, hoje) {
  const inicio = String(evento.data || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return null;
  const repetir = evento.repetir || "nenhuma";
  if (repetir === "nenhuma") return inicio >= hoje ? inicio : null;

  const diaOriginal = Number(inicio.slice(8, 10));
  let atual = inicio;
  for (let i = 0; i < 400; i++) {
    if (atual >= hoje) return atual;
    const proxima = avancarData(atual, repetir, diaOriginal);
    if (proxima <= atual) return null;
    atual = proxima;
  }
  return null;
}

/** Espelha avancar() de src/lib/agenda.ts — um teste compara os dois */
function avancarData(data, repetir, diaOriginal) {
  const base = new Date(data + "T00:00:00Z");
  if (Number.isNaN(base.getTime()) || repetir === "nenhuma") return data;
  if (repetir === "semanal") {
    base.setUTCDate(base.getUTCDate() + 7);
    return base.toISOString().slice(0, 10);
  }
  const passo = repetir === "anual" ? 12 : 1;
  const dia = diaOriginal || base.getUTCDate();
  const alvoMes = base.getUTCMonth() + passo;
  const ano = base.getUTCFullYear() + Math.floor(alvoMes / 12);
  const mes0 = ((alvoMes % 12) + 12) % 12;
  const ultimo = new Date(Date.UTC(ano, mes0 + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ano, mes0, Math.min(dia, ultimo))).toISOString().slice(0, 10);
}

/** Clientes que fazem aniversário hoje ou amanhã */
async function aniversariosProximos(hoje) {
  let clientes;
  try {
    clientes = await sb("clientes?select=nome,nascimento&nascimento=not.is.null");
  } catch {
    return [];
  }
  const ano = Number(hoje.slice(0, 4));
  const saida = [];
  for (const c of clientes || []) {
    const n = String(c.nascimento || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(n)) continue;
    const mes0 = Number(n.slice(5, 7)) - 1;
    const ultimo = new Date(Date.UTC(ano, mes0 + 1, 0)).getUTCDate();
    const data = new Date(
      Date.UTC(ano, mes0, Math.min(Number(n.slice(8, 10)), ultimo))
    )
      .toISOString()
      .slice(0, 10);
    const dias = diasAte(data + "T00:00:00Z");
    if (dias === 0) saida.push(`• ${c.nome} faz aniversário hoje`);
    else if (dias === 1) saida.push(`• ${c.nome} faz aniversário amanhã`);
  }
  return saida;
}


/**
 * Fiado vencido, uma vez por semana.
 *
 * A tela "Quem chamar hoje" só alcança quem abre o sistema, e fiado vencido é
 * exatamente o que se esquece: o valor não some da tela, mas ninguém abre a
 * tela. Aqui chega no celular.
 *
 * Semanal, não diário, de propósito. Cobrança de bairro que aparece todo dia
 * vira ruído e a pessoa para de ler o aviso inteiro — inclusive o de
 * mensalidade, que é o que paga o sistema.
 */
async function avisarFiado() {
  // Segunda-feira. Em outro dia nem consulta o banco.
  if (new Date().getUTCDay() !== 1) return "fora do dia (só segunda)";

  let fiados;
  try {
    fiados = await sb(
      'fiados?select=id,"clienteId",descricao,valor,pagamentos,quitado,vencimento' +
        "&quitado=is.false&vencimento=not.is.null"
    );
  } catch {
    return "tabela de fiados ainda não existe";
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const atrasados = [];

  for (const f of fiados || []) {
    const venc = String(f.vencimento || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(venc) || venc >= hoje) continue;
    const pago = (f.pagamentos || []).reduce((s, p) => s + (Number(p.valor) || 0), 0);
    const saldo = (Number(f.valor) || 0) - pago;
    if (saldo <= 0) continue;
    atrasados.push({
      clienteId: f.clienteId,
      descricao: f.descricao || "fiado",
      saldo,
      dias: Math.round(
        (Date.parse(hoje + "T00:00:00Z") - Date.parse(venc + "T00:00:00Z")) / 86400000
      ),
    });
  }

  if (atrasados.length === 0) return "nenhum fiado vencido";

  // Nomes num pedido só: uma consulta por devedor deixaria o cron lento e
  // caro sem nenhum ganho.
  let nomes = {};
  try {
    const ids = [...new Set(atrasados.map((a) => a.clienteId).filter(Boolean))];
    if (ids.length > 0) {
      const linhas = await sb(`clientes?select=id,nome&id=in.(${ids.join(",")})`);
      for (const c of linhas || []) nomes[c.id] = c.nome;
    }
  } catch {
    /* sem os nomes o aviso ainda serve: o valor é o que importa */
  }

  atrasados.sort((a, b) => b.dias - a.dias);
  const total = atrasados.reduce((s, a) => s + a.saldo, 0);
  const linhas = atrasados
    .slice(0, 15)
    .map(
      (a) =>
        `• ${nomes[a.clienteId] || "sem cliente"} — ${dinheiro(a.saldo)} (${a.dias}d)`
    );
  if (atrasados.length > 15) linhas.push(`• e mais ${atrasados.length - 15}`);

  const enviou = await enviarTelegram(
    `*Fiado vencido*\n${linhas.join("\n")}\n\nTotal: *${dinheiro(total)}*`
  );
  return enviou ? `${atrasados.length} avisado(s)` : "telegram não configurado";
}
