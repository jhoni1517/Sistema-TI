import { txt, soDigitos, cpfValido, codigoOS } from "./format";
import { garantiaDaOS, type Garantia } from "./garantia";
import type { OrdemServico, OSStatus } from "./types";

/**
 * A área do cliente: o link de cadastro e a página onde ele acompanha as
 * OS dele.
 *
 * A entrada é CPF + senha que O CLIENTE cria. Não é a data de nascimento:
 * CPF circula em todo cadastro e aniversário está no Facebook, e quem
 * soubesse os dois veria os consertos da pessoa. Esqueceu a senha, a loja
 * manda pelo WhatsApp um link pessoal para criar outra.
 *
 * Quem confere tudo é o banco (supabase-migracao-area-cliente.sql). Aqui
 * mora só o que a tela precisa para não mandar lixo nem mostrar conta
 * errada.
 */

/** Uma OS como a área do cliente recebe do banco */
export interface OSDoCliente {
  numero: number;
  status: OSStatus;
  tipoAparelho?: string | null;
  marca?: string | null;
  modelo?: string | null;
  defeito?: string | null;
  criadoEm?: string | null;
  entregueEm?: string | null;
  garantiaDias?: number | null;
  previsao?: string | null;
  rastreio?: string | null;
  /** Só vem com a OS pronta ou esperando aprovação, igual ao rastreio */
  total?: number | null;
}

export interface LojaDaArea {
  nome: string;
  logo?: string | null;
  cor?: string | null;
  whatsapp?: string | null;
}

export interface AreaDoCliente {
  nome: string;
  /** AAAA-MM-DD: o cadastro ou a primeira OS, o que veio antes */
  desde: string;
  loja: LojaDaArea | null;
  ordens: OSDoCliente[];
}

/** Na bancada agora: o que ainda não saiu da loja */
export const naBancada = (o: Pick<OSDoCliente, "status">): boolean =>
  o.status !== "entregue" && o.status !== "cancelada";

export function separarOrdens(ordens: OSDoCliente[]): {
  agora: OSDoCliente[];
  historico: OSDoCliente[];
} {
  return {
    agora: ordens.filter(naBancada),
    historico: ordens.filter((o) => !naBancada(o)),
  };
}

/** Garantia de uma OS da área, pela mesma regra da loja (lib/garantia.ts) */
export const garantiaDaArea = (o: OSDoCliente, hoje?: string): Garantia =>
  garantiaDaOS(
    {
      status: o.status,
      garantiaDias: Number(o.garantiaDias) || 0,
      entregueEm: txt(o.entregueEm),
    } as OrdemServico,
    hoje
  );

/** As garantias que ainda valem: o benefício que o cliente de fato tem */
export const garantiasAtivas = (ordens: OSDoCliente[], hoje?: string) =>
  ordens
    .map((o) => ({ os: o, garantia: garantiaDaArea(o, hoje) }))
    .filter((x) => x.garantia.situacao === "valida")
    .sort((a, b) => a.garantia.diasRestantes - b.garantia.diasRestantes);

/**
 * "Cliente há 2 anos e 3 meses".
 *
 * Conta em meses de calendário sobre a data pura (AAAA-MM-DD), sem hora:
 * somar hora local desloca o dia conforme o fuso. Mês incompleto não
 * conta — dizer "1 mês" no dia 30 de quem chegou no dia 31 é prometer
 * tempo que a pessoa ainda não tem.
 */
export function tempoDeCasa(desde: string, hoje: string): string {
  const d = txt(desde).slice(0, 10);
  const h = txt(hoje).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{4}-\d{2}-\d{2}$/.test(h) || d > h) return "";
  const [ad, md, dd] = d.split("-").map(Number);
  const [ah, mh, dh] = h.split("-").map(Number);
  let meses = (ah - ad) * 12 + (mh - md);
  if (dh < dd) meses -= 1;
  if (meses < 1) return "menos de um mês";
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  const pAno = anos === 1 ? "1 ano" : `${anos} anos`;
  const pMes = resto === 1 ? "1 mês" : `${resto} meses`;
  if (anos === 0) return pMes;
  if (resto === 0) return pAno;
  return `${pAno} e ${pMes}`;
}

/** Nome do aparelho para a lista: "Celular Samsung A10" */
export const aparelhoDaOS = (o: OSDoCliente): string =>
  [o.tipoAparelho, o.marca, o.modelo].map((x) => txt(x).trim()).filter(Boolean).join(" ") ||
  codigoOS(o.numero);

// ---------- Links ----------

/** Link da área (e do cadastro) da loja */
export const linkDaArea = (origem: string, loja: string | null | undefined): string => {
  const l = txt(loja).trim();
  return l ? `${origem}#/cliente/${encodeURIComponent(l)}` : "";
};

/**
 * Link só do formulário: o cliente preenche e o cadastro cai na lista da
 * loja, sem senha e sem área. É o "preenche aqui que eu já te cadastro".
 */
export const linkDeCadastro = (origem: string, loja: string | null | undefined): string => {
  const l = txt(loja).trim();
  return l ? `${origem}#/cadastro/${encodeURIComponent(l)}` : "";
};

/** Link pessoal para criar a senha. Vale 48 horas e uma vez só (no banco). */
export const linkDeAcesso = (origem: string, loja: string | null | undefined, token: string): string => {
  const base = linkDaArea(origem, loja);
  const t = txt(token).trim();
  return base && t ? `${base}?acesso=${encodeURIComponent(t)}` : "";
};

/** O segredo que veio no endereço (`?acesso=`) */
export const acessoDoLink = (hash: string): string => {
  const q = txt(hash).split("?")[1] || "";
  return new URLSearchParams(q).get("acesso")?.trim() || "";
};

/** Recado do WhatsApp com o link de acesso. Sem emoji: chega como "?". */
export function mensagemDeAcesso(nomeCliente: string, nomeLoja: string, link: string): string {
  const primeiro = txt(nomeCliente).trim().split(/\s+/)[0] || "";
  return [
    `Oi${primeiro ? `, ${primeiro}` : ""}! Aqui é da ${txt(nomeLoja).trim() || "loja"}.`,
    "",
    "Por este link você cria sua senha e acompanha todos os seus consertos com a gente:",
    link,
    "",
    "Depois é só entrar com seu CPF e a senha que você criou. O link vale por 48 horas.",
  ].join("\n");
}

/** Recado com o link da área (cadastro com senha) */
export function mensagemDeCadastro(nomeLoja: string, link: string): string {
  return [
    `Oi! Aqui é da ${txt(nomeLoja).trim() || "loja"}.`,
    "",
    "Faça seu cadastro por este link e acompanhe seus consertos pelo celular:",
    link,
  ].join("\n");
}

/** Recado com o link só do formulário */
export function mensagemDeFormulario(nomeLoja: string, link: string): string {
  return [
    `Oi! Aqui é da ${txt(nomeLoja).trim() || "loja"}.`,
    "",
    "Para adiantar seu atendimento, preencha seu cadastro por este link. Leva um minuto:",
    link,
  ].join("\n");
}

// ---------- Formulários ----------

export interface CadastroDoCliente {
  nome: string;
  cpf: string;
  telefone: string;
  nascimento: string;
  senha: string;
  confirmacao: string;
}

/** Data AAAA-MM-DD que existe de verdade (31/02 não passa) */
const dataReal = (v: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

export const MINIMO_SENHA = 6;

export function erroDaSenha(senha: string, confirmacao: string): string {
  if (txt(senha).length < MINIMO_SENHA) return `A senha precisa de pelo menos ${MINIMO_SENHA} caracteres.`;
  if (senha !== confirmacao) return "As duas senhas não estão iguais.";
  return "";
}

export interface FormularioDoCliente {
  nome: string;
  cpf: string;
  telefone: string;
  nascimento: string;
  email: string;
  endereco: string;
}

/** O que está errado no formulário sem senha, ou vazio */
export function erroDoFormulario(c: FormularioDoCliente, hoje: string): string {
  const email = txt(c.email).trim();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "Confira o e-mail.";
  return erroDoCadastro({ ...c, senha: "xxxxxx", confirmacao: "xxxxxx" }, hoje);
}

/**
 * O que está errado no cadastro, ou vazio. O banco confere de novo: aqui é
 * para a pessoa saber o que corrigir antes de apertar o botão.
 */
export function erroDoCadastro(c: CadastroDoCliente, hoje: string): string {
  const nome = txt(c.nome).trim();
  if (nome.length < 3) return "Escreva seu nome completo.";
  if (!cpfValido(soDigitos(c.cpf))) return "Confira o CPF: os números não batem.";
  const tel = soDigitos(c.telefone);
  if (tel.length < 10 || tel.length > 11) return "Confira o WhatsApp com DDD.";
  if (!dataReal(c.nascimento) || c.nascimento < "1900-01-01" || c.nascimento > hoje) {
    return "Confira a data de nascimento.";
  }
  return erroDaSenha(c.senha, c.confirmacao);
}
