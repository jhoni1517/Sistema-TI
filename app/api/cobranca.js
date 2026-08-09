// ============================================================
// Rotina diária de cobrança das mensalidades
// Endpoint: /api/cobranca  (chamado pelo cron do Vercel)
//
// O que faz: olha o vencimento de todas as lojas e manda no SEU Telegram
// um resumo do que precisa de ação — quem vence em breve, quem venceu e
// quem já está travada. Sem isto, o aviso só existe para quem abre o
// sistema, e quem sumiu por uma semana é pego de surpresa.
//
// DOIS DESTINOS, e a diferença não é detalhe:
//   - Mensalidade vai para TELEGRAM_CHAT_ID, o seu. Nome da loja e quanto
//     ela deve são da sua relação comercial com ela.
//   - Contas, agenda, aniversários, fiado e backup vão para o Telegram DE
//     CADA LOJA (Configurações > Avisos no Telegram). Nada de dentro de uma
//     loja pode chegar no chat do operador do sistema: é dado pessoal de
//     cliente de terceiro, e quem precisa do lembrete é o dono da loja.
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

/**
 * A régua do TESTE. Espelha tipoDoTeste() de src/lib/cobranca.ts, e
 * cobranca.cron.test.ts extrai esta função do disco e compara dia a dia.
 *
 * Existe separada porque loja em teste não é loja em atraso: ela nunca
 * contratou mensalidade nenhuma, e mandar "vencida" para ela é cobrar uma
 * dívida que não existe.
 */
function tipoDoTeste(dias) {
  if (dias === null) return null;
  if (dias > 3) return null;
  if (dias > 0) return "teste_acabando";
  if (dias === 0) return "teste_ultimo_dia";
  return "teste_acabou";
}

/**
 * Este prazo é cortesia?
 *
 * Espelha `emTeste` de src/lib/assinatura.ts: enquanto o vencimento não
 * passar do fim do teste, o que a loja tem é teste. Pagar empurra `venceEm`
 * para além de `testeAte` e a conta vira falsa sozinha.
 */
function ehTeste(l) {
  if (!l || l.isento || !l.testeAte || !l.venceEm) return false;
  const vence = new Date(l.venceEm).getTime();
  const teste = new Date(l.testeAte).getTime();
  if (Number.isNaN(vence) || Number.isNaN(teste)) return false;
  return vence <= teste;
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

async function enviarPara(chatId, texto) {
  if (!TELEGRAM_TOKEN || !chatId) return false;
  const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: texto,
      parse_mode: "Markdown",
    }),
  });
  return r.ok;
}

/**
 * Aviso que é do OPERADOR do sistema, não da loja.
 *
 * Só a cobrança de mensalidade passa por aqui: nome da loja e quanto ela
 * deve são da relação comercial dele com ela. Nada de dentro da loja —
 * cliente, dívida, agenda — pode usar este caminho.
 */
async function enviarTelegram(texto) {
  return enviarPara(TELEGRAM_CHAT_ID, texto);
}

/**
 * O Telegram de cada loja, lido da configuração que ela mesma edita.
 *
 * O cron usa a chave de serviço e enxerga TODAS as lojas. Antes ele juntava
 * o que achava e mandava tudo para um chat só, o do operador: nome e dívida
 * de cliente de mercearia, agenda de assistência técnica, conta a pagar de
 * pizzaria. Isso é dado pessoal de terceiro saindo da loja que o coletou
 * para o celular de outra pessoa — e nem serve, porque quem precisa do
 * lembrete é o dono da loja, não o dono do sistema.
 *
 * Loja sem chat configurado não recebe nada, e nada dela sai. Silêncio é o
 * padrão certo: o contrário vaza por omissão.
 */
async function chatsDasLojas() {
  const mapa = new Map();
  try {
    const linhas = await sb("configuracoes?select=id,dados");
    for (const l of linhas || []) {
      const chat = String(l?.dados?.telegramChatId || "").trim();
      if (chat) mapa.set(String(l.id), chat);
    }
  } catch {
    /* sem configuração nenhuma, ninguém recebe — que é o lado seguro */
  }
  return mapa;
}

/** Agrupa linhas por loja, ignorando o que não tem dono identificado */
function porLoja(linhas, campo = "lojaId") {
  const grupos = new Map();
  for (const l of linhas || []) {
    const id = String(l?.[campo] || "");
    if (!id) continue;
    if (!grupos.has(id)) grupos.set(id, []);
    grupos.get(id).push(l);
  }
  return grupos;
}

// Sem emoji: em alguns aparelhos elas chegam como "?" e sujam o aviso
const TITULO = {
  somente_leitura: "TRAVADAS (não conseguem cadastrar)",
  vencida: "VENCIDAS (ainda na tolerância)",
  vence_hoje: "VENCEM HOJE",
  vence_em_breve: "VENCEM EM BREVE",
  // Teste é venda a fazer, não dívida a cobrar — e por isso vem primeiro no
  // resumo: é o único bloco em que ainda dá para mudar o resultado.
  teste_ultimo_dia: "TESTE ACABA HOJE (ligue para essas)",
  teste_acabando: "TESTE ACABANDO",
  teste_acabou: "TESTOU E NÃO ASSINOU",
};

/** A ordem do resumo: primeiro o que dá para resolver hoje */
const ORDEM = [
  "teste_ultimo_dia",
  "teste_acabando",
  "somente_leitura",
  "vencida",
  "vence_hoje",
  "vence_em_breve",
  "teste_acabou",
];

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
      'lojas?select=id,nome,venceEm,testeAte,valor_mensal,bloqueada,isento' +
        '&venceEm=not.is.null&isento=is.false'
    );

    // Avisos já enviados, para não repetir o mesmo todo dia
    const jaEnviados = await sb("avisos_cobranca?select=loja_id,tipo,referencia");
    const chaveEnviada = new Set(
      (jaEnviados || []).map((a) => `${a.loja_id}|${a.tipo}|${a.referencia}`)
    );

    const novos = [];
    const grupos = {};
    for (const t of ORDEM) grupos[t] = [];

    for (const l of lojas || []) {
      if (l.bloqueada || l.isento) continue; // desligada de propósito, ou é a sua
      const dias = diasAte(l.venceEm);
      /*
       * Teste e mensalidade têm réguas separadas.
       *
       * Antes a loja em teste caía na régua da mensalidade e virava
       * "VENCIDA" no resumo — de uma mensalidade que ela nunca contratou.
       * O que era venda a fazer aparecia como dívida a cobrar, misturada com
       * quem realmente devia.
       */
      const tipo = ehTeste(l) ? tipoDoTeste(dias) : tipoDoAviso(dias, tolerancia);
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
      const chats = await chatsDasLojas();
      return res.status(200).json({
        ok: true,
        enviados: 0,
        mensagem: "nenhuma mensalidade nova",
        contas: await avisarContas(chats),
        agenda: await avisarAgenda(chats),
        fiado: await avisarFiado(chats),
        checklist: await avisarChecklist(chats),
        backup: await conferirBackup(chats),
      });
    }

    // Monta o resumo
    const partes = ["*Mensalidades — resumo do dia*"];
    let aReceber = 0;
    let emTeste = 0;
    for (const tipo of ORDEM) {
      const g = grupos[tipo];
      if (g.length === 0) continue;
      const itens = g.map((l) => {
        if (tipo === "teste_acabando") {
          emTeste += Number(l.valor) || 0;
          return `• ${l.nome} — teste acaba em ${l.dias}d (${dinheiro(l.valor)}/mes)`;
        }
        if (tipo === "teste_ultimo_dia") {
          emTeste += Number(l.valor) || 0;
          return `• ${l.nome} — ultimo dia (${dinheiro(l.valor)}/mes)`;
        }
        if (tipo === "teste_acabou") return `• ${l.nome} — acabou ha ${Math.abs(l.dias)}d`;
        if (tipo === "vence_em_breve") return `• ${l.nome} — em ${l.dias}d`;
        if (tipo === "vence_hoje") return `• ${l.nome} — hoje`;
        aReceber += Number(l.valor) || 0;
        return `• ${l.nome} — ${Math.abs(l.dias)}d em atraso (${dinheiro(l.valor)})`;
      });
      partes.push(`${TITULO[tipo]}\n${itens.join("\n")}`);
    }
    // Duas linhas separadas de propósito: uma é dinheiro que já é seu e não
    // chegou; a outra é dinheiro que só existe se você fizer a ligação.
    if (aReceber > 0) partes.push(`Total em atraso: *${dinheiro(aReceber)}*`);
    if (emTeste > 0) partes.push(`Em teste, a fechar: *${dinheiro(emTeste)}/mes*`);

    /*
     * O "acaba hoje" sai em mensagem SEPARADA, antes do resumo.
     *
     * Dentro do digest ele virava a terceira linha de um bloco de sete, e o
     * único dia em que ainda dá para mudar o resultado é justamente esse —
     * amanhã a loja já travou e a conversa passa a ser outra. Mensagem curta
     * e sozinha é a diferença entre ler no semáforo e ler à noite.
     */
    if (grupos.teste_ultimo_dia.length > 0) {
      await enviarTelegram(
        "*Teste acaba HOJE*\n" +
          grupos.teste_ultimo_dia
            .map((l) => `• ${l.nome} — ${dinheiro(l.valor)}/mes`)
            .join("\n") +
          "\n\nHoje e o dia de ligar. Amanha ela trava e a conversa muda."
      );
    }

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

    const chats = await chatsDasLojas();
    const contas = await avisarContas(chats);
    const agenda = await avisarAgenda(chats);
    const fiado = await avisarFiado(chats);
    const checklist = await avisarChecklist(chats);
    const backup = await conferirBackup(chats);

    return res.status(200).json({
      ok: true,
      enviados: enviou ? novos.length : 0,
      contas,
      agenda,
      fiado,
      checklist,
      backup,
      telegram: enviou ? "enviado" : "não configurado ou falhou",
    });
  } catch (e) {
    return res.status(500).json({ erro: String(e?.message || e) });
  }
}

/**
 * Lembrete das contas a pagar, para o Telegram DE CADA LOJA.
 *
 * A notificação do navegador só alcança quem está com o sistema aberto.
 * Este aqui chega no celular mesmo com tudo fechado — é o que evita
 * esquecer o aluguel por não ter entrado no sistema naquele dia.
 *
 * Uma mensagem por loja, no chat dela. Antes ia tudo para o chat do
 * operador do sistema: ele recebia o aluguel da pizzaria, a conta de luz da
 * mercearia e o fornecedor da assistência, e nenhum dos três donos recebia
 * nada.
 */
async function avisarContas(chats) {
  if (chats.size === 0) return "nenhuma loja com Telegram configurado";

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

  let lojasAvisadas = 0;
  let total = 0;

  for (const [lojaId, doLoja] of porLoja(contas)) {
    const chat = chats.get(lojaId);
    // Loja sem chat não gera mensagem, e o que é dela não vai para lugar
    // nenhum. Sem o `continue` o dado escaparia para o chat do operador.
    if (!chat) continue;

    const atrasadas = [];
    const hoje = [];
    const proximas = [];
    const novos = [];

    for (const c of doLoja) {
      // Conta avulsa já quitada não volta a cobrar
      if (c.recorrencia === "unica" && (c.pagamentos || []).length > 0) continue;

      const dias = diasAte(c.vencimento);
      const limite = Number(c.lembreteDias ?? 3);
      if (dias > limite) continue;

      const tipo = dias < 0 ? "atrasada" : dias === 0 ? "hoje" : "proxima";
      const referencia = String(c.vencimento).slice(0, 10);
      if (enviados.has(`${c.id}|${referencia}|${tipo}`)) continue;

      const linha =
        `• ${c.descricao} — ${dinheiro(c.valor)}` +
        (dias < 0 ? ` (${Math.abs(dias)}d em atraso)` : dias > 0 ? ` (em ${dias}d)` : "");
      (dias < 0 ? atrasadas : dias === 0 ? hoje : proximas).push(linha);

      novos.push({ lojaId: c.lojaId, conta_id: c.id, referencia, tipo });
    }

    if (novos.length === 0) continue;

    const partes = ["*Contas a pagar*"];
    if (atrasadas.length) partes.push(`EM ATRASO\n${atrasadas.join("\n")}`);
    if (hoje.length) partes.push(`VENCEM HOJE\n${hoje.join("\n")}`);
    if (proximas.length) partes.push(`CHEGANDO\n${proximas.join("\n")}`);

    // Só marca como avisado se a mensagem realmente saiu — Telegram fora do
    // ar faz o aviso voltar amanhã em vez de sumir para sempre.
    if (!(await enviarPara(chat, partes.join("\n\n")))) continue;

    await sb("avisos_contas", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify(novos),
    });

    lojasAvisadas++;
    total += novos.length;
  }

  return lojasAvisadas === 0
    ? "nada novo"
    : `${total} lembrete(s) em ${lojasAvisadas} loja(s)`;
}

/**
 * Lembrete da agenda do dia, no Telegram de cada loja.
 *
 * Só o que acontece HOJE e o que já entrou na antecedência pedida. Agenda
 * que manda a semana inteira todo dia vira ruído, e ruído a pessoa silencia.
 *
 * Sem tabela de controle aqui: o compromisso do dia pode ser lembrado de
 * novo amanhã se ainda não foi concluído, ao contrário da conta, que só
 * precisa ser cobrada uma vez por vencimento.
 */
async function avisarAgenda(chats) {
  if (chats.size === 0) return "nenhuma loja com Telegram configurado";

  let eventos;
  try {
    eventos = await sb(
      'eventos?select=id,titulo,tipo,data,hora,local,repetir,"avisarDiasAntes",concluido,"lojaId"&concluido=is.false'
    );
  } catch {
    return "tabela de eventos ainda não existe";
  }

  const hoje = new Date().toISOString().slice(0, 10);
  // Aniversários avisam na véspera: dá tempo de separar um brinde.
  const parabensPorLoja = await aniversariosProximos(hoje, chats);
  const eventosPorLoja = porLoja(eventos);

  let lojasAvisadas = 0;
  let itens = 0;

  for (const [lojaId, chat] of chats) {
    const doDia = [];
    const chegando = [];

    for (const e of eventosPorLoja.get(lojaId) || []) {
      const data = proximaData(e, hoje);
      if (!data) continue;
      const dias = diasAte(data + "T00:00:00Z");
      if (dias < 0) continue;
      const antecedencia = Number(e.avisarDiasAntes ?? 0);
      if (dias > antecedencia) continue;

      const linha =
        `• ${e.hora ? e.hora + " " : ""}${e.titulo}` +
        (e.local ? ` — ${e.local}` : "") +
        (dias > 0 ? ` (em ${dias}d)` : "");
      (dias === 0 ? doDia : chegando).push(linha);
    }

    const parabens = parabensPorLoja.get(lojaId) || [];
    if (doDia.length === 0 && chegando.length === 0 && parabens.length === 0) continue;

    const partes = ["*Agenda*"];
    if (doDia.length) partes.push(`HOJE\n${doDia.join("\n")}`);
    if (chegando.length) partes.push(`CHEGANDO\n${chegando.join("\n")}`);
    if (parabens.length) partes.push(`ANIVERSÁRIOS\n${parabens.join("\n")}`);

    if (!(await enviarPara(chat, partes.join("\n\n")))) continue;
    lojasAvisadas++;
    itens += doDia.length + chegando.length + parabens.length;
  }

  return lojasAvisadas === 0 ? "nada na agenda" : `${itens} item(ns) em ${lojasAvisadas} loja(s)`;
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

/**
 * Clientes que fazem aniversário hoje ou amanhã, separados por loja.
 *
 * A consulta traz só as lojas que têm Telegram configurado. Nome de cliente
 * é o dado mais sensível que passa por aqui — puxar o de quem não vai
 * receber nada seria carregar risco sem nenhum uso.
 */
async function aniversariosProximos(hoje, chats) {
  const saida = new Map();
  const ids = [...chats.keys()];
  if (ids.length === 0) return saida;

  let clientes;
  try {
    clientes = await sb(
      `clientes?select=nome,nascimento,"lojaId"&nascimento=not.is.null` +
        `&lojaId=in.(${ids.join(",")})`
    );
  } catch {
    return saida;
  }

  const ano = Number(hoje.slice(0, 4));
  for (const c of clientes || []) {
    const lojaId = String(c.lojaId || "");
    if (!chats.has(lojaId)) continue;
    const n = String(c.nascimento || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(n)) continue;
    const mes0 = Number(n.slice(5, 7)) - 1;
    const ultimo = new Date(Date.UTC(ano, mes0 + 1, 0)).getUTCDate();
    const data = new Date(Date.UTC(ano, mes0, Math.min(Number(n.slice(8, 10)), ultimo)))
      .toISOString()
      .slice(0, 10);
    const dias = diasAte(data + "T00:00:00Z");
    if (dias !== 0 && dias !== 1) continue;
    if (!saida.has(lojaId)) saida.set(lojaId, []);
    saida
      .get(lojaId)
      .push(`• ${c.nome} faz aniversário ${dias === 0 ? "hoje" : "amanhã"}`);
  }
  return saida;
}

/**
 * Fiado vencido, uma vez por semana, no Telegram da própria loja.
 *
 * A tela "Quem chamar hoje" só alcança quem abre o sistema, e fiado vencido é
 * exatamente o que se esquece: o valor não some da tela, mas ninguém abre a
 * tela. Aqui chega no celular.
 *
 * Semanal, não diário, de propósito. Cobrança de bairro que aparece todo dia
 * vira ruído e a pessoa para de ler o aviso inteiro.
 */
/**
 * A partir de quantos dias uma dívida SEM vencimento passa a ser cobrada.
 * Tem que bater com DIAS_PARA_COBRAR_SEM_VENCIMENTO de src/lib/fiado.ts —
 * cobranca.cron.test.ts lê os dois arquivos do disco e reprova se divergir.
 */
const DIAS_PARADO = 30;

async function avisarFiado(chats) {
  // Segunda-feira. Em outro dia nem consulta o banco.
  if (new Date().getUTCDay() !== 1) return "fora do dia (só segunda)";
  if (chats.size === 0) return "nenhuma loja com Telegram configurado";

  const ids = [...chats.keys()];
  let fiados;
  try {
    /*
     * SEM o filtro `vencimento=not.is.null`.
     *
     * Ele estava aqui e deixava de fora justamente o fiado mais comum: o da
     * OS entregue a prazo, que nasce sem vencimento nenhum. A dívida ficava
     * para sempre no "Total a receber" sem nunca virar aviso, e ninguém
     * procura por dinheiro que nunca chegou.
     *
     * `criadoEm` vem junto porque é ele que mede a dívida sem prazo. Ver
     * DIAS_PARADO logo abaixo e src/lib/fiado.ts.
     */
    fiados = await sb(
      'fiados?select=id,"clienteId",descricao,valor,pagamentos,quitado,vencimento,"criadoEm","lojaId"' +
        `&quitado=is.false&lojaId=in.(${ids.join(",")})`
    );
  } catch {
    return "tabela de fiados ainda não existe";
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const porLojaId = new Map();

  const dias = (de) =>
    Math.round((Date.parse(hoje + "T00:00:00Z") - Date.parse(de + "T00:00:00Z")) / 86400000);

  for (const f of fiados || []) {
    const lojaId = String(f.lojaId || "");
    if (!chats.has(lojaId)) continue;

    /*
     * Duas réguas, e a diferença importa.
     *
     * Com vencimento: atrasado é ter passado do prazo COMBINADO.
     * Sem vencimento: nenhum prazo foi quebrado — o que dá para afirmar é
     * que a dívida está parada há DIAS_PARADO. Inventar um vencimento aqui
     * faria o robô cobrar, em nome da loja, um acordo que não existiu.
     *
     * Esta régua é a mesma de `estadoFiado` em src/lib/fiado.ts, e a
     * paridade entre as duas é cobrada por cobranca.cron.test.ts.
     */
    const venc = String(f.vencimento || "").slice(0, 10);
    const temVenc = /^\d{4}-\d{2}-\d{2}$/.test(venc);
    const nasceu = String(f.criadoEm || "").slice(0, 10);
    const temNasceu = /^\d{4}-\d{2}-\d{2}$/.test(nasceu);

    let atraso;
    let parado = false;
    if (temVenc) {
      atraso = dias(venc);
      if (atraso <= 0) continue;
    } else {
      if (!temNasceu) continue;
      atraso = dias(nasceu);
      if (atraso < DIAS_PARADO) continue;
      parado = true;
    }

    const pago = (f.pagamentos || []).reduce((s, p) => s + (Number(p.valor) || 0), 0);
    const saldo = (Number(f.valor) || 0) - pago;
    if (saldo <= 0) continue;
    if (!porLojaId.has(lojaId)) porLojaId.set(lojaId, []);
    porLojaId.get(lojaId).push({
      clienteId: f.clienteId,
      descricao: f.descricao || "fiado",
      saldo,
      dias: atraso,
      parado,
    });
  }

  if (porLojaId.size === 0) return "nenhum fiado vencido";

  // Nomes num pedido só: uma consulta por devedor deixaria o cron lento e
  // caro sem nenhum ganho.
  const nomes = {};
  try {
    const devedores = [
      ...new Set(
        [...porLojaId.values()].flat().map((a) => a.clienteId).filter(Boolean)
      ),
    ];
    if (devedores.length > 0) {
      const linhas = await sb(`clientes?select=id,nome&id=in.(${devedores.join(",")})`);
      for (const c of linhas || []) nomes[c.id] = c.nome;
    }
  } catch {
    /* sem os nomes o aviso ainda serve: o valor é o que importa */
  }

  let lojasAvisadas = 0;
  let devedoresAvisados = 0;

  for (const [lojaId, atrasados] of porLojaId) {
    atrasados.sort((a, b) => b.dias - a.dias);
    const total = atrasados.reduce((s, a) => s + a.saldo, 0);
    const linhas = atrasados
      .slice(0, 15)
      .map(
        (a) =>
          `• ${nomes[a.clienteId] || "sem cliente"} — ${dinheiro(a.saldo)} ` +
          // "parado" separa quem quebrou um prazo de quem nunca combinou
          // um: a loja não cobra os dois do mesmo jeito.
          (a.parado ? `(sem prazo, ${a.dias}d)` : `(${a.dias}d)`)
      );
    if (atrasados.length > 15) linhas.push(`• e mais ${atrasados.length - 15}`);

    const enviou = await enviarPara(
      chats.get(lojaId),
      `*Fiado a cobrar*\n${linhas.join("\n")}\n\nTotal: *${dinheiro(total)}*`
    );
    if (!enviou) continue;
    lojasAvisadas++;
    devedoresAvisados += atrasados.length;
  }

  return lojasAvisadas === 0
    ? "telegram não configurado"
    : `${devedoresAvisados} devedor(es) em ${lojasAvisadas} loja(s)`;
}

/**
 * Lembrete semanal de backup, com o tamanho da loja no recado.
 *
 * O botão "Exportar" existe em Configurações desde o começo e ninguém clica:
 * backup é a tarefa que só parece importante depois que já era tarde. O
 * lembrete não faz o backup sozinho de propósito — o arquivo tem dado de
 * cliente e mandá-lo por Telegram, sem criptografia e para um chat que fica
 * aberto no celular, criaria um risco maior do que o que resolve.
 *
 * Domingo, e só quando há o que perder: lembrar loja vazia de fazer backup
 * é o jeito mais rápido de a pessoa parar de ler os avisos.
 */
/* ------------------------------------------------------------------ */
/* Checklist diário                                                    */
/* ------------------------------------------------------------------ */

/**
 * O fuso do balcão.
 *
 * O robô roda no servidor, em UTC. A tarefa marcada para as 14h é 14h no
 * relógio de quem está na loja, não em Greenwich — sem isto o lembrete das
 * duas da tarde chegaria às onze da manhã.
 *
 * Brasil não tem mais horário de verão desde 2019, então -3 é estável para
 * a maior parte do país. Acre e parte do Amazonas ficariam uma ou duas
 * horas adiantados; quando aparecer a primeira loja de lá, isto vira campo
 * de configuração.
 */
const FUSO_LOJA = -3;

/**
 * O robô roda uma vez por dia?
 *
 * No plano gratuito da Vercel o cron só pode disparar diariamente, e aí o
 * recado das 14h precisa sair junto com o das 9h — senão nunca sai. Quem
 * trocar o cron para de hora em hora põe CHECKLIST_RESUMO_DIARIO=0 e cada
 * tarefa passa a chegar na hora dela.
 */
const RESUMO_DIARIO = process.env.CHECKLIST_RESUMO_DIARIO !== "0";

/** "HH:MM" no relógio da loja */
function horaDaLoja(agora, fuso) {
  const d = new Date(agora.getTime() + fuso * 3600000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** "AAAA-MM-DD" no relógio da loja */
function diaDaLoja(agora, fuso) {
  return new Date(agora.getTime() + fuso * 3600000).toISOString().slice(0, 10);
}

/**
 * A tarefa vale hoje? Espelha valeHoje() de src/lib/checklist.ts.
 *
 * Dia da semana lido em UTC a partir da data pura, como no resto da casa:
 * ler em hora local devolveria o dia anterior em qualquer fuso negativo.
 */
function tarefaValeHoje(t, hoje) {
  if (t.ativo === false) return false;
  const dias = Array.isArray(t.dias) ? t.dias : [];
  if (dias.length === 0) return true;
  return dias.includes(new Date(hoje + "T00:00:00Z").getUTCDay());
}

/**
 * Tarefas que ainda esperam recado hoje: pediram aviso, valem hoje, não
 * foram feitas e ainda não foram avisadas.
 *
 * `avisadoEm` é o que impede o mesmo recado de sair a cada disparo do robô:
 * aviso repetido é o jeito mais rápido de a pessoa desligar tudo.
 */
function tarefasComAviso(tarefas, hoje) {
  return tarefas
    .filter((t) => t.avisar === true)
    .filter((t) => tarefaValeHoje(t, hoje))
    .filter((t) => !(Array.isArray(t.feitoEm) ? t.feitoEm : []).includes(hoje))
    .filter((t) => String(t.avisadoEm || "").slice(0, 10) !== hoje)
    .filter((t) => /^\d{2}:\d{2}$/.test(String(t.horario || "").trim()))
    .sort((a, b) => String(a.horario).localeCompare(String(b.horario)));
}

/**
 * O que já passou da hora. Espelha pendentesAgora() de src/lib/checklist.ts.
 */
function tarefasParaAvisar(tarefas, hoje, agora) {
  return tarefasComAviso(tarefas, hoje).filter((t) => String(t.horario) <= agora);
}

/** O que ainda vai chegar hoje */
function tarefasMaisTarde(tarefas, hoje, agora) {
  return tarefasComAviso(tarefas, hoje).filter((t) => String(t.horario) > agora);
}

async function avisarChecklist(chats) {
  if (chats.size === 0) return "nenhuma loja com Telegram configurado";

  let tarefas;
  try {
    tarefas = await sb(
      'tarefas?select=id,titulo,horario,dias,"feitoEm",avisar,"avisadoEm",ativo,"lojaId"&avisar=is.true'
    );
  } catch {
    return "tabela de tarefas ainda não existe";
  }

  const agora = new Date();
  const hoje = diaDaLoja(agora, FUSO_LOJA);
  const hora = horaDaLoja(agora, FUSO_LOJA);
  const porLojaId = porLoja(tarefas);

  let lojasAvisadas = 0;
  let itens = 0;

  for (const [lojaId, chat] of chats) {
    const daLoja = porLojaId.get(lojaId) || [];
    const pendentes = tarefasParaAvisar(daLoja, hoje, hora);
    /*
     * Com o robô rodando UMA VEZ POR DIA, esta é a única chance do dia.
     *
     * Sem o resumo, a tarefa marcada para as 14h nunca receberia recado
     * nenhum: às 9h ela ainda não venceu, e o próximo disparo já é amanhã.
     * O resumo manda tudo junto de manhã, com o horário de cada uma, e
     * marca como avisadas — senão sairiam de novo no dia seguinte como se
     * fossem de hoje.
     *
     * Rodando mais de uma vez por dia, isto atrapalha: o resumo repetiria a
     * cada disparo e cada tarefa perderia o aviso na hora dela. Por isso é
     * desligável em CHECKLIST_RESUMO_DIARIO=0, que é o que se faz junto com
     * trocar o cron para de hora em hora.
     */
    const maisTarde = RESUMO_DIARIO ? tarefasMaisTarde(daLoja, hoje, hora) : [];
    if (pendentes.length === 0 && maisTarde.length === 0) continue;

    // Sem emoji: em alguns aparelhos chegam como "?" e sujam o recado.
    const partes = ["*Checklist do dia*"];
    if (pendentes.length) {
      partes.push(`AGORA\n${pendentes.map((t) => `• ${t.horario} ${t.titulo}`).join("\n")}`);
    }
    if (maisTarde.length) {
      partes.push(
        `MAIS TARDE HOJE\n${maisTarde.map((t) => `• ${t.horario} ${t.titulo}`).join("\n")}`
      );
    }
    if (!(await enviarPara(chat, partes.join("\n\n")))) continue;

    /*
     * Marca o aviso DEPOIS de o envio dar certo.
     *
     * Marcar antes e o envio falhar apagaria o lembrete sem ele ter
     * chegado — e ninguém procura por um aviso que nunca veio. Marcando
     * depois, o pior caso é o recado sair duas vezes, que a pessoa
     * percebe e não custa nada.
     */
    for (const t of [...pendentes, ...maisTarde]) {
      try {
        await sb(`tarefas?id=eq.${encodeURIComponent(t.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ avisadoEm: hoje }),
        });
      } catch {
        // Falhar aqui só faz o recado repetir no próximo disparo.
      }
    }

    lojasAvisadas++;
    itens += pendentes.length + maisTarde.length;
  }

  return lojasAvisadas === 0
    ? "nada pendente no checklist"
    : `${itens} tarefa(s) em ${lojasAvisadas} loja(s)`;
}

async function conferirBackup(chats) {
  if (new Date().getUTCDay() !== 0) return "fora do dia (só domingo)";
  if (chats.size === 0) return "nenhuma loja com Telegram configurado";

  const contar = async (tabela, lojaId) => {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/${tabela}?select=id&lojaId=eq.${lojaId}`,
        {
          headers: {
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
            Prefer: "count=exact",
            Range: "0-0",
          },
        }
      );
      // O total vem no cabeçalho, sem trazer as linhas: contar puxando tudo
      // custaria caro e não serve para mais nada aqui.
      const faixa = r.headers.get("content-range") || "";
      return Number(faixa.split("/")[1]) || 0;
    } catch {
      return 0;
    }
  };

  let lojasAvisadas = 0;
  for (const [lojaId, chat] of chats) {
    const [clientes, ordens, produtos, movimentos] = await Promise.all([
      contar("clientes", lojaId),
      contar("ordens", lojaId),
      contar("produtos", lojaId),
      contar("movimentos", lojaId),
    ]);
    const total = clientes + ordens + produtos + movimentos;
    if (total === 0) continue; // loja vazia não precisa de lembrete

    const enviou = await enviarPara(
      chat,
      "*Backup semanal*\n" +
        `Hoje o sistema guarda ${clientes} cliente(s), ${ordens} ordem(ns), ` +
        `${produtos} produto(s) e ${movimentos} lançamento(s) de caixa.\n\n` +
        "Abra Configurações e clique em Exportar. O arquivo fica no seu " +
        "aparelho — ele tem dado de cliente e não deve circular por conversa."
    );
    if (enviou) lojasAvisadas++;
  }

  return lojasAvisadas === 0
    ? "nada a proteger ainda"
    : `lembrete enviado para ${lojasAvisadas} loja(s)`;
}
