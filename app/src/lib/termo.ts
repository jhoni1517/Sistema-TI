import { txt, codigoOS, formatDateTime } from "./format";
import { linhaDoRecibo } from "./backup";
import { linhasDoEmprestimo } from "./reserva";
import type { OrdemServico, TermoAssinado, TipoTermo } from "./types";

/**
 * O termo que o cliente assina com o dedo na tela.
 *
 * Papel assinado some, molha e ninguém acha quando o cliente volta dizendo
 * que "o aparelho não estava riscado". O termo fica guardado na OS com a
 * assinatura, a hora e um HASH (SHA-256) de tudo junto. O hash é o lacre:
 * mexeu numa vírgula do texto depois de assinado, a conferência acusa.
 *
 * O texto é montado AQUI, uma vez, no momento da assinatura, e guardado
 * como ficou. Montar de novo na hora de imprimir usaria o cadastro de hoje
 * — e o cliente assinou o de ontem.
 */

export const TITULO_TERMO: Record<TipoTermo, string> = {
  entrada: "Termo de entrada do aparelho",
  retirada: "Termo de retirada do aparelho",
  emprestimo: "Termo de empréstimo de aparelho reserva",
};

const linha = (rotulo: string, valor?: string | null) => {
  const v = txt(valor).trim();
  return v ? `${rotulo}: ${v}` : "";
};

/** O texto que o cliente lê e assina. Linhas simples: vira PDF e vira hash. */
export function textoDoTermo(
  tipo: TipoTermo,
  os: OrdemServico,
  cliente: { nome?: string; telefone?: string; cpf?: string } | undefined,
  loja: string,
  quando: string,
  /** Prazo de retirada da loja (Config.diasAbandono) */
  diasGuarda = 90
): string {
  const aparelho = [os.tipoAparelho, os.marca, os.modelo].map((x) => txt(x).trim()).filter(Boolean).join(" ");
  const cabecalho = [
    `${TITULO_TERMO[tipo]} · ${codigoOS(os.numero)}`,
    `Loja: ${txt(loja).trim() || "-"}`,
    `Data e hora: ${formatDateTime(quando)}`,
    linha("Cliente", cliente?.nome),
    linha("CPF", cliente?.cpf),
    linha("Telefone", cliente?.telefone),
    linha("Aparelho", aparelho),
    linha("IMEI / série", os.imeiSerial),
  ];

  if (tipo === "entrada") {
    const marcados = Object.entries(os.checklist || {})
      .filter(([, v]) => v)
      .map(([k]) => k);
    return [
      ...cabecalho,
      linha("Defeito relatado", os.defeitoRelatado),
      linha("Acessórios deixados", os.acessorios || "nenhum"),
      marcados.length ? `Conferido na entrada: ${marcados.join(", ")}` : "",
      (os.fotos || []).length ? `Fotos do estado do aparelho: ${(os.fotos || []).length} (anexas)` : "",
      linhaDoRecibo(os),
      "",
      "Declaro que entreguei o aparelho acima no estado descrito e registrado nas fotos.",
      "Estou ciente de que a loja não se responsabiliza por dados (fotos, contatos, conversas) " +
        "sem backup, nem por defeitos que já existiam e não foram relatados.",
      `O aparelho não retirado em até ${diasGuarda} dias após o aviso de pronto pode ter taxa de guarda, conforme o termo da loja.`,
    ]
      .filter((l, i, a) => l !== "" || (i > 0 && a[i - 1] !== ""))
      .join("\n");
  }

  if (tipo === "emprestimo") {
    return [...cabecalho, ...(os.emprestimo ? linhasDoEmprestimo(os.emprestimo, loja) : [])]
      .filter((l, i, a) => l !== "" || (i > 0 && a[i - 1] !== ""))
      .join("\n");
  }

  return [
    ...cabecalho,
    linha("Serviço", os.defeitoConstatado || os.defeitoRelatado),
    os.garantiaDias ? `Garantia: ${os.garantiaDias} dias a partir da retirada` : "",
    "",
    "Declaro que recebi o aparelho acima funcionando, testado na minha frente, com os acessórios que deixei.",
  ]
    .filter((l, i, a) => l !== "" || (i > 0 && a[i - 1] !== ""))
    .join("\n");
}

/** O que entra no lacre: texto, assinatura e hora. Mudou um, muda o hash. */
export const conteudoDoLacre = (t: Pick<TermoAssinado, "texto" | "assinatura" | "assinadoEm">): string =>
  `${t.texto}\n---\nassinatura:${t.assinatura}\nassinadoEm:${t.assinadoEm}`;

export async function sha256(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function lacrar(t: Omit<TermoAssinado, "hash">): Promise<TermoAssinado> {
  return { ...t, hash: await sha256(conteudoDoLacre(t)) };
}

/** O termo continua exatamente como foi assinado? */
export async function termoIntacto(t: TermoAssinado): Promise<boolean> {
  return /^[0-9a-f]{64}$/.test(txt(t.hash)) && (await sha256(conteudoDoLacre(t))) === t.hash;
}

export const termoDoTipo = (os: Pick<OrdemServico, "termos">, tipo: TipoTermo): TermoAssinado | undefined =>
  [...(os.termos || [])].reverse().find((t) => t.tipo === tipo);

/** Retirada só faz sentido com o aparelho pronto ou saindo */
export const podeTermoRetirada = (os: Pick<OrdemServico, "status">): boolean =>
  os.status === "pronta" || os.status === "entregue";

const esc = (v: string): string =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** O documento para imprimir ou "Salvar como PDF" */
export function htmlDoTermo(t: TermoAssinado, fotos: string[] = []): string {
  const url = (u: string) => (/^https:\/\//i.test(u) ? esc(u) : "");
  const imgs = t.tipo === "entrada" ? fotos.map(url).filter(Boolean).slice(0, 6) : [];
  return `
  <div style="font-family:Arial,Helvetica,sans-serif">
    <div style="white-space:pre-wrap;font-size:12px;line-height:1.5">${esc(t.texto)}</div>
    ${
      imgs.length
        ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:10px">${imgs
            .map((u) => `<img src="${u}" style="width:30mm;height:30mm;object-fit:cover;border:1px solid #ccc">`)
            .join("")}</div>`
        : ""
    }
    <div style="margin-top:16px;border-top:1px solid #999;padding-top:6px">
      ${url(t.assinatura) ? `<img src="${url(t.assinatura)}" style="max-width:70mm;max-height:30mm">` : ""}
      <div style="font-size:11px">Assinado na tela em ${esc(formatDateTime(t.assinadoEm))}</div>
    </div>
    <div style="margin-top:10px;font-size:9px;color:#555;word-break:break-all">
      Lacre SHA-256: ${esc(t.hash)}
    </div>
  </div>`;
}
