import { txt, codigoOS, brl } from "./format";
import { totalOS } from "./calc";
import { OS_STATUS_META, type Cliente, type OrdemServico, type Produto } from "./types";

/**
 * Busca única, para achar qualquer coisa sem saber em que tela ela está.
 *
 * Antes era preciso adivinhar a tela antes de procurar: cliente em Clientes,
 * OS em Ordens, produto em Estoque. Com o telefone tocando e a pessoa do
 * outro lado dizendo só o primeiro nome, isso é um clique a mais e uma
 * chance a mais de abrir a tela errada.
 *
 * O que a busca precisa acertar, porque é o que se digita de verdade:
 *
 * - **"os12", "OS00012", "12"** → a ordem 12. Ninguém digita os cinco zeros.
 * - **telefone com ou sem máscara** → o mesmo cliente. O número chega
 *   copiado do WhatsApp, com parênteses e traço, e cadastrado sem nada.
 * - **nome sem acento** → acha "João". Quem digita rápido no balcão não
 *   acentua.
 */

export type TipoResultado = "cliente" | "os" | "produto";

export interface Resultado {
  tipo: TipoResultado;
  id: string;
  titulo: string;
  detalhe: string;
  /** Valor à direita: total da OS, preço do produto */
  extra?: string;
  /** Para onde a tela navega ao escolher */
  rota: string;
  /** Maior = aparece antes */
  peso: number;
}

/** Minúsculo, sem acento: é assim que os dois lados são comparados */
export const normalizar = (v?: string | null): string =>
  txt(v)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

/** Só os dígitos — telefone e documento chegam de todo jeito */
export const digitos = (v?: string | null): string => txt(v).replace(/\D/g, "");

/**
 * O número da OS que a pessoa quis dizer.
 *
 * "os12", "OS 12", "#12" e "12" são todos a ordem 12. Zero não é OS.
 */
export function numeroDeOS(termo: string): number {
  const t = normalizar(termo).replace(/^#/, "");
  const m = t.match(/^(?:os\s*)?0*(\d{1,6})$/);
  return m ? Number(m[1]) : 0;
}

const contem = (alvo: string | undefined, termo: string): boolean =>
  normalizar(alvo).includes(termo);

/**
 * Procura em clientes, ordens e produtos de uma vez.
 *
 * A ordem importa mais do que parece: quem digita um número quase sempre
 * quer a OS daquele número, e ela precisa vir em primeiro lugar mesmo que
 * exista um produto com aquele número no nome.
 */
export function buscarTudo(
  termo: string,
  dados: { clientes: Cliente[]; ordens: OrdemServico[]; produtos: Produto[] },
  limite = 12
): Resultado[] {
  const t = normalizar(termo);
  if (t.length < 2) return [];
  const num = numeroDeOS(termo);
  const dig = digitos(termo);
  const out: Resultado[] = [];

  const nomeCliente = (id: string): string =>
    dados.clientes.find((c) => c.id === id)?.nome || "sem cliente";

  for (const o of dados.ordens) {
    const exata = num > 0 && o.numero === num;
    const bate =
      exata ||
      contem(o.modelo, t) ||
      contem(o.marca, t) ||
      contem(o.defeitoRelatado, t) ||
      // IMEI é como a assistência acha o aparelho quando o cliente não sabe
      // o número da OS e o nome está no cadastro do irmão.
      contem(o.imeiSerial, t) ||
      contem(nomeCliente(o.clienteId), t);
    if (!bate) continue;
    out.push({
      tipo: "os",
      id: o.id,
      titulo: `${codigoOS(o.numero)} · ${[o.marca, o.modelo].filter(Boolean).join(" ") || o.tipoAparelho}`,
      detalhe: `${nomeCliente(o.clienteId)} — ${OS_STATUS_META[o.status].label}`,
      extra: brl(totalOS(o)),
      rota: "/ordens",
      // A OS pedida pelo número vem na frente de tudo.
      peso: exata ? 100 : 40,
    });
  }

  for (const c of dados.clientes) {
    const porTelefone = dig.length >= 4 && digitos(c.telefone).includes(dig);
    const porDocumento = dig.length >= 4 && digitos(c.cpf).includes(dig);
    const bate = contem(c.nome, t) || contem(c.nomeFantasia, t) || porTelefone || porDocumento;
    if (!bate) continue;
    out.push({
      tipo: "cliente",
      id: c.id,
      titulo: c.nome,
      detalhe: [c.telefone, c.email].filter(Boolean).join(" · ") || "sem contato",
      rota: "/clientes",
      // Nome que COMEÇA com o que foi digitado vem antes: quem digita "jo"
      // quer o João, não a Maria José.
      peso: normalizar(c.nome).startsWith(t) ? 60 : 50,
    });
  }

  for (const p of dados.produtos) {
    const porCodigo =
      txt(p.codigoBarras).trim() === termo.trim() ||
      normalizar(p.sku) === t ||
      txt(p.codigoBalanca).trim() === termo.trim();
    const bate = porCodigo || contem(p.nome, t) || contem(p.categoria, t);
    if (!bate) continue;
    out.push({
      tipo: "produto",
      id: p.id,
      titulo: p.nome,
      detalhe: p.servico
        ? "serviço"
        : `${p.quantidade}${p.porPeso ? " kg" : " un"} em estoque`,
      extra: brl(p.preco),
      rota: "/estoque",
      // Código lido no leitor é escolha exata, não palpite.
      peso: porCodigo ? 90 : 30,
    });
  }

  return out
    .sort((a, b) => b.peso - a.peso || a.titulo.localeCompare(b.titulo))
    .slice(0, limite);
}

/**
 * Produtos para escolher dentro de uma OS, na ordem em que se escolhe.
 *
 * A tela de OS listava o estoque inteiro num `<select>` cru, na ordem em que
 * as linhas voltaram do banco — que não é ordem nenhuma. Sem busca e sem
 * ordem, achar "Fonte 500W" no meio de trezentos itens virava rolar a roda do
 * celular até dar sorte, e o atendente desistia e digitava a peça na mão: a
 * OS perdia o vínculo com o estoque, e a baixa nunca acontecia.
 *
 * A busca é a mesma do resto do sistema — sem acento, por nome, categoria,
 * SKU e código de barras — porque quem digita rápido no balcão não acentua e
 * porque o leitor do balcão dispara o código inteiro de uma vez.
 *
 * Sem nada digitado devolve a lista em ordem alfabética: abrir o campo tem
 * que mostrar algo previsível, não a primeira linha que o banco devolveu.
 */
export function produtosParaOS(
  produtos: Produto[],
  termo: string,
  limite = 8
): Produto[] {
  const t = normalizar(termo);
  const alfabetica = (a: Produto, b: Produto) => txt(a.nome).localeCompare(txt(b.nome));

  if (!t) return [...produtos].sort(alfabetica).slice(0, limite);

  const pontos = (p: Produto): number => {
    // Código lido no leitor é escolha exata, não palpite: vai na frente de
    // qualquer nome parecido.
    if (txt(p.codigoBarras).trim() === termo.trim() || normalizar(p.sku) === t) return 3;
    // Nome que COMEÇA com o que foi digitado vem antes: quem digita "fon"
    // quer a fonte, não o "cabo de força para fonte".
    if (normalizar(p.nome).startsWith(t)) return 2;
    if (contem(p.nome, t)) return 1;
    return contem(p.categoria, t) ? 0 : -1;
  };

  return produtos
    .map((p) => ({ p, peso: pontos(p) }))
    .filter((x) => x.peso >= 0)
    .sort((a, b) => b.peso - a.peso || alfabetica(a.p, b.p))
    .map((x) => x.p)
    .slice(0, limite);
}
