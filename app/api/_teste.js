// ============================================================
// Sequência do período grátis, para o e-mail do cron diário (api/cobranca.js).
//
// A MESMA regra existe em src/lib/sequencia-teste.ts (o aviso dentro do
// app). sequencia-teste.test.ts importa este arquivo e compara os dois dia
// a dia — cópia dentro de teste envelhece igual.
// ============================================================

export function etapaDoTeste(u) {
  if (u.faltam < 0) return null;
  if (u.faltam <= 5) return "d25";
  if (u.diaDoTeste >= 7 && u.diaDoTeste <= 21) return "d7";
  const comecou = u.temOS ? u.ordens > 0 : u.vendas > 0;
  if (u.diaDoTeste >= 3 && u.diaDoTeste <= 6 && !comecou) return "d3";
  if (u.diaDoTeste >= 1 && u.diaDoTeste <= 2 && !u.passosCompletos) return "d1";
  return null;
}

const vezes = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/** O texto de cada etapa, em voz de balcão e sem emoji (vai por e-mail também). */
export function recadoDoTeste(etapa, u) {
  if (etapa === "d1") {
    return {
      etapa,
      titulo: "Complete os primeiros passos",
      texto: u.temOS
        ? "Leva dez minutos: nome e WhatsApp da loja, a logo e um produto no estoque. Com isso a primeira OS já sai com a cara da sua loja."
        : "Leva dez minutos: nome e WhatsApp da loja, a logo e um produto no estoque. Com isso a primeira venda já sai com a cara da sua loja.",
    };
  }
  if (etapa === "d3") {
    return {
      etapa,
      titulo: "Posso configurar com você?",
      texto: u.temOS
        ? "Três dias e nenhuma OS ainda. É normal: o começo é a parte mais chata. Me chama no WhatsApp que eu abro a primeira junto com você, em 15 minutos."
        : "Três dias e nenhuma venda ainda. É normal: o começo é a parte mais chata. Me chama no WhatsApp que eu faço a primeira junto com você, em 15 minutos.",
    };
  }
  if (etapa === "d7") {
    if (!u.temOS) {
      return {
        etapa,
        titulo: `Uma semana: ${vezes(u.vendas, "venda registrada", "vendas registradas")}`,
        texto: "Cada venda registrada é estoque que baixa sozinho e caixa que fecha sem conta de cabeça.",
      };
    }
    if (u.rastreios > 0) {
      return {
        etapa,
        titulo: `Você já economizou ${vezes(u.rastreios, "ligação", "ligações")}`,
        texto: `${vezes(u.rastreios, "vez", "vezes")} um cliente abriu o link para ver como estava o aparelho, em vez de ligar para a loja perguntar.`,
      };
    }
    return {
      etapa,
      titulo: "Mande o link de acompanhamento",
      texto: "Cada cliente que abre o link é uma ligação a menos no balcão. O link sai pronto no WhatsApp da OS.",
    };
  }
  const quando = u.faltam === 0 ? "hoje" : u.faltam === 1 ? "amanhã" : `em ${u.faltam} dias`;
  return {
    etapa,
    titulo: `Seu teste acaba ${quando}`,
    texto: "Garanta a vaga de Fundador: assine antes de acabar e continue de onde parou, com tudo o que já cadastrou.",
  };
}

const DIA = 86400000;
const soData = (iso) => Date.parse(iso.slice(0, 10) + "T00:00:00Z");

/** Dia do teste (1 = dia da criação) e dias que faltam, contados pela data. */
export function diasDoTeste(criadoEm, venceEm, hoje) {
  const h = soData(hoje);
  return {
    diaDoTeste: Math.round((h - soData(criadoEm)) / DIA) + 1,
    faltam: Math.round((soData(venceEm) - h) / DIA),
  };
}

/**
 * Os primeiros passos, vistos do servidor. O app confere também "viu o link
 * do cliente", que só existe no aparelho; aqui fica o que dá para ver nos
 * dados. Errar para o lado de "completo" só deixa de mandar um e-mail.
 */
export function passosCompletos(dados, produtos, ordens, vendas, temOS) {
  const d = dados || {};
  const nome = String(d.nomeLoja || "").trim();
  const loja = !!nome && nome !== "Minha Assistência TI" && !!String(d.telefoneLoja || "").replace(/\D/g, "");
  return loja && !!d.logoUrl && produtos > 0 && (temOS ? ordens > 0 : vendas > 0);
}

/** Ramos que têm OS. Espelha `temModulo(ramo, "os")`; o teste confere. */
export const RAMOS_COM_OS = ["assistencia", "motores"];
export const ramoTemOS = (ramo) => RAMOS_COM_OS.includes(ramo || "assistencia");

const escapar = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** O e-mail de uma etapa: assunto e corpo, sem emoji (chega como "?"). */
export function emailDoRecado(recado, nomeLoja, urlApp) {
  const ola = nomeLoja ? `Oi, pessoal da ${escapar(nomeLoja)}!` : "Oi!";
  return {
    assunto: recado.titulo,
    html:
      `<p>${ola}</p><p><b>${escapar(recado.titulo)}</b></p><p>${escapar(recado.texto)}</p>` +
      `<p><a href="${escapar(urlApp)}">Abrir o sistema</a></p>` +
      `<p style="color:#888;font-size:12px">Para não receber estes e-mails, desligue em Configurações.</p>`,
  };
}
