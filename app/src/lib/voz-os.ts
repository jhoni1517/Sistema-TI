import { txt, normalizar } from "./format";
import type { Cliente, OrdemServico } from "./types";

/**
 * Abrir a OS falando.
 *
 * No balcão, o atendente está com o aparelho numa mão e o cliente falando
 * na frente; digitar oito campos é o que faz a OS sair com "não liga" no
 * defeito e sem telefone. Falando, sai completa — MAS a IA ouve errado com
 * cara de certo ("A54" vira "A 54", "nove oito" vira "98"). Por isso o que
 * volta passa por aqui, e só PREENCHE o formulário: salvar continua sendo
 * o botão de sempre, depois de a pessoa conferir.
 */

export interface OSPorVoz {
  transcricao: string;
  nomeCliente: string;
  /** Só dígitos, com DDD (10 ou 11). Vazio se não deu para entender. */
  telefone: string;
  tipoAparelho: string;
  marca: string;
  modelo: string;
  defeito: string;
  senha: string;
  acessorios: string;
  avisos: string[];
}

const campo = (v: unknown, max = 200): string =>
  txt(typeof v === "string" || typeof v === "number" ? String(v) : "")
    .replace(/[\u0000-\u001f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/**
 * Telefone ditado virando dígitos com DDD. "+55 (41) 99999-0000" →
 * "41999990000". Sem DDD não serve: o WhatsApp da OS iria para o número
 * errado, e o cliente não recebe o "tá pronto".
 */
export function telefoneDitado(v: unknown): string {
  let d = campo(v).replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  return d.length === 10 || d.length === 11 ? d : "";
}

export function lerOSPorVoz(bruto: unknown): OSPorVoz {
  let obj: Record<string, unknown>;
  if (bruto && typeof bruto === "object") obj = bruto as Record<string, unknown>;
  else {
    const s = txt(bruto as string).trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    const i = s.indexOf("{");
    const f = s.lastIndexOf("}");
    if (i < 0 || f <= i) throw new Error("Não entendi o áudio. Fala de novo, mais perto do microfone.");
    try {
      obj = JSON.parse(s.slice(i, f + 1));
    } catch {
      throw new Error("A IA devolveu o áudio pela metade. Grava de novo.");
    }
  }
  const avisos: string[] = [];
  const telBruto = campo(obj.telefone);
  const telefone = telefoneDitado(telBruto);
  if (telBruto && !telefone) avisos.push(`Telefone "${telBruto}" sem DDD ou incompleto. Confira.`);

  const r: OSPorVoz = {
    transcricao: campo(obj.transcricao, 1000),
    nomeCliente: campo(obj.nomeCliente, 80),
    telefone,
    tipoAparelho: campo(obj.tipoAparelho, 40),
    marca: campo(obj.marca, 40),
    modelo: campo(obj.modelo, 60),
    defeito: campo(obj.defeito, 500),
    senha: campo(obj.senha, 60),
    acessorios: campo(obj.acessorios, 200),
    avisos,
  };
  if (!r.nomeCliente && !r.modelo && !r.defeito && !r.marca) {
    throw new Error("Não peguei nome, aparelho nem defeito. Grava de novo falando os três.");
  }
  return r;
}

/**
 * O cliente que a voz descreveu, se ele já é cadastrado.
 *
 * Telefone manda: é único e a IA acerta dígito melhor que nome. Sem
 * telefone, o nome precisa bater INTEIRO (sem acento): "Maria" sozinha
 * casaria com a primeira Maria da lista, e a OS iria para a cliente errada.
 */
export function clienteDaVoz(v: Pick<OSPorVoz, "telefone" | "nomeCliente">, clientes: Cliente[]): Cliente | undefined {
  if (v.telefone) {
    const porTel = clientes.find((c) => {
      const d = txt(c.telefone).replace(/\D/g, "");
      return d.length >= 10 && (d === v.telefone || d.endsWith(v.telefone) || v.telefone.endsWith(d));
    });
    if (porTel) return porTel;
  }
  const nome = normalizar(v.nomeCliente);
  if (nome.split(" ").length < 2) return undefined;
  const iguais = clientes.filter((c) => normalizar(c.nome) === nome);
  return iguais.length === 1 ? iguais[0] : undefined;
}

/**
 * O que a voz muda no formulário: só os campos VAZIOS.
 *
 * Quem começou a digitar e depois gravou não pode ter o que digitou
 * apagado pelo que a IA ouviu. E senha só entra se o ramo tem o campo.
 */
export function preencherPelaVoz(
  os: OrdemServico,
  v: OSPorVoz,
  cliente: Cliente | undefined,
  comSenha: boolean
): Partial<OrdemServico> {
  const vazio = (x: unknown) => !txt(x as string).trim();
  const patch: Partial<OrdemServico> = {};
  if (cliente && vazio(os.clienteId)) patch.clienteId = cliente.id;
  if (v.tipoAparelho && vazio(os.tipoAparelho)) patch.tipoAparelho = v.tipoAparelho;
  if (v.marca && vazio(os.marca)) patch.marca = v.marca;
  if (v.modelo && vazio(os.modelo)) patch.modelo = v.modelo;
  if (v.defeito && vazio(os.defeitoRelatado)) patch.defeitoRelatado = v.defeito;
  if (v.acessorios && vazio(os.acessorios)) patch.acessorios = v.acessorios;
  if (comSenha && v.senha && vazio(os.senhaAparelho)) patch.senhaAparelho = v.senha;
  return patch;
}
