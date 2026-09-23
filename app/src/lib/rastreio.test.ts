import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  linkDeRastreio,
  tokenDoLink,
  problemaNoLink,
  linhaDoTempo,
  proximasEtapas,
  dataDaFoto,
  previsaoDeEntrega,
  linkFalarComLoja,
  corDaLoja,
} from "./rastreio";
import type { OrdemServico } from "./types";

const RAIZ = new URL("../..", import.meta.url).pathname;

const os = (o: Partial<OrdemServico> = {}): OrdemServico =>
  ({ id: "o1", numero: 7, rastreio: "a1b2c3d4e5f6", ...o }) as OrdemServico;

/**
 * O rastreio público era enumerável.
 *
 * O link que a loja manda leva o UUID da loja: `#/rastreio/OS00007?loja=<id>`.
 * A consulta pedia SÓ a loja e o número, e o número é sequencial. Quem recebe
 * um link — todo cliente, e qualquer pessoa para quem ele encaminhe — trocava
 * o 7 por 1, 2, 3 e lia a assistência inteira: primeiro nome, aparelho e
 * valor de cada conserto. A própria página oferecia o campo de busca para
 * isso, sem precisar montar URL nenhuma.
 *
 * E a resposta ao orçamento tinha a mesma porta: `responder_orcamento` só
 * pedia loja e número. Dava para CANCELAR, um por um, todos os orçamentos
 * aguardando aprovação da loja.
 *
 * O código da OS não serve de senha porque ele é sequencial de propósito —
 * é o que o cliente lê no balcão. Quem faz o papel de senha é um segredo por
 * ordem, sorteado no banco, que só existe no link.
 */
describe("o link do rastreio carrega o segredo da ordem", () => {
  const origem = "https://sistema-ti-caixa.vercel.app/";

  it("monta o link com loja, número e segredo", () => {
    const l = linkDeRastreio(origem, "loja-uuid", os());
    expect(l).toBe(
      "https://sistema-ti-caixa.vercel.app/#/rastreio/OS00007?loja=loja-uuid&t=a1b2c3d4e5f6"
    );
  });

  it("sem loja não monta link nenhum: link pela metade vira suporte", () => {
    expect(linkDeRastreio(origem, "", os())).toBe("");
  });

  it("ordem antiga, ainda sem segredo, também não monta link", () => {
    // Melhor não oferecer o link do que mandar um que vai ser recusado.
    expect(linkDeRastreio(origem, "loja-uuid", os({ rastreio: undefined }))).toBe("");
  });

  it("lê o segredo de volta do link", () => {
    expect(tokenDoLink("#/rastreio/OS00007?loja=x&t=a1b2c3d4e5f6")).toBe("a1b2c3d4e5f6");
    expect(tokenDoLink("#/rastreio/OS00007?t=abc&loja=x")).toBe("abc");
  });

  it("link sem segredo devolve vazio, e não o da última consulta", () => {
    expect(tokenDoLink("#/rastreio/OS00007?loja=x")).toBe("");
    expect(tokenDoLink("")).toBe("");
  });

  it("diz o que fazer quando o link é antigo, em vez de 'não encontrada'", () => {
    // "Ordem não encontrada" manda o cliente conferir o código, que está
    // certo. O problema é o link, e quem resolve é a loja.
    const p = problemaNoLink("loja-uuid", "");
    expect(p).toContain("link");
    expect(p).toContain("novo");
  });

  it("sem loja no link, a saída é a mesma: pedir link novo", () => {
    expect(problemaNoLink("", "abc")).toContain("novo");
  });

  it("link completo não tem problema", () => {
    expect(problemaNoLink("loja-uuid", "a1b2c3d4e5f6")).toBe("");
  });
});

/**
 * O corte é feito no BANCO, não na tela.
 *
 * Esconder o campo de busca da página resolveria o campo de busca. Não
 * resolveria nada de quem monta a chamada na mão — e a chamada é pública,
 * concedida a `anon`. As duas funções que a página pública usa precisam
 * EXIGIR o segredo, e é isto que este teste lê do disco e cobra.
 */
describe("as funções públicas exigem o segredo", () => {
  const sql = readdirSync(RAIZ)
    .filter((f) => f.startsWith("supabase-") && f.endsWith(".sql"))
    .map((f) => readFileSync(join(RAIZ, f), "utf8"))
    .join("\n");

  /** O corpo da última definição de uma função, que é a que vale */
  const definicao = (nome: string): string => {
    const partes = sql.split(new RegExp(`create (?:or replace )?function ${nome}\\s*\\(`));
    return partes[partes.length - 1];
  };

  it("a coluna do segredo existe na tabela de ordens", () => {
    expect(sql).toMatch(/alter table ordens\s+add column if not exists\s+"?rastreio"?/);
  });

  it("consultar_os recebe e confere o segredo", () => {
    const d = definicao("consultar_os");
    // Receber e ignorar seria pior do que não receber: pareceria protegido.
    // Por isso as duas coisas — o parâmetro entra E a coluna é comparada.
    expect(d).toContain("p_token");
    expect(d).toMatch(/\brastreio\s*=\s*\S/);
  });

  it("responder_orcamento recebe e confere o segredo", () => {
    // Ler a fila dos outros é ruim; CANCELAR a fila dos outros é pior.
    const d = definicao("responder_orcamento");
    expect(d).toContain("p_token");
    expect(d).toMatch(/\brastreio\s*=\s*\S/);
  });

  it("as versões sem segredo saem de cena", () => {
    // Deixar a antiga concedida a anon mantém a porta aberta ao lado da
    // fechada, e ninguém repara porque a tela nova nem chama.
    expect(sql).toMatch(/drop function if exists consultar_os\(uuid, integer\)/);
    expect(sql).toMatch(
      /drop function if exists responder_orcamento\(uuid, integer, boolean, text\)/
    );
  });
});

describe("linha do tempo do cliente", () => {
  it("põe em ordem de data e fecha no status de agora", () => {
    const t = linhaDoTempo(
      [
        { status: "em_reparo", data: "2026-09-21T09:00:00Z" },
        { status: "aberta", data: "2026-09-20T10:00:00Z" },
      ],
      "em_reparo"
    );
    expect(t.map((p) => p.status)).toEqual(["aberta", "em_reparo"]);
    expect(t[0].data).toBe("2026-09-20T10:00:00Z");
  });

  it("salvar duas vezes sem mudar nada não vira dois passos", () => {
    const t = linhaDoTempo(
      [
        { status: "em_reparo", data: "2026-09-21T09:00:00Z" },
        { status: "em_reparo", data: "2026-09-21T15:00:00Z" },
      ],
      "em_reparo"
    );
    expect(t).toHaveLength(1);
    expect(t[0].data).toBe("2026-09-21T09:00:00Z");
  });

  it("ida e volta fica: é ela que explica o atraso", () => {
    const t = linhaDoTempo(
      [
        { status: "em_reparo", data: "2026-09-21" },
        { status: "aguardando_peca", data: "2026-09-22" },
        { status: "em_reparo", data: "2026-09-25" },
      ],
      "em_reparo"
    );
    expect(t.map((p) => p.status)).toEqual(["em_reparo", "aguardando_peca", "em_reparo"]);
  });

  it("OS antiga, sem histórico, mostra o status de agora sem data", () => {
    expect(linhaDoTempo(null, "pronta")).toEqual([{ status: "pronta", data: "" }]);
    expect(linhaDoTempo([], "aberta")).toEqual([{ status: "aberta", data: "" }]);
  });

  it("status desconhecido é descartado, não desenhado", () => {
    const t = linhaDoTempo(
      [{ status: "hackeado" as never, data: "2026-09-20" }, { status: "aberta", data: "2026-09-20" }],
      "aberta"
    );
    expect(t.map((p) => p.status)).toEqual(["aberta"]);
  });

  it("o que vem depois é o caminho feliz, sem prometer atraso", () => {
    expect(proximasEtapas("em_reparo")).toEqual(["pronta", "entregue"]);
    expect(proximasEtapas("aguardando_peca")).toEqual(["em_reparo", "pronta", "entregue"]);
    expect(proximasEtapas("entregue")).toEqual([]);
    expect(proximasEtapas("cancelada")).toEqual([]);
    expect(proximasEtapas("aberta")).not.toContain("aguardando_peca");
  });
});

describe("hora da foto, lida do nome do arquivo", () => {
  it("lê o horário que o depósito grava no nome", () => {
    const ms = Date.parse("2026-09-21T14:30:00Z");
    expect(dataDaFoto(`https://x.supabase.co/storage/v1/object/public/imagens/l/laudo/placa-${ms}.jpg`)).toBe(
      "2026-09-21T14:30:00.000Z"
    );
  });

  it("nome fora do padrão não inventa hora", () => {
    expect(dataDaFoto("https://x/foto.jpg")).toBe("");
    expect(dataDaFoto("https://x/foto-123.jpg")).toBe("");
    // 13 dígitos que não são data plausível
    expect(dataDaFoto("https://x/foto-9999999999999.jpg")).toBe("");
    expect(dataDaFoto("")).toBe("");
  });
});

describe("previsão de entrega", () => {
  const hoje = "2026-09-23"; // quarta-feira

  it("fala como gente: hoje, amanhã, dia da semana", () => {
    expect(previsaoDeEntrega("2026-09-23", "em_reparo", hoje)?.texto).toBe("Previsão: hoje");
    expect(previsaoDeEntrega("2026-09-24", "em_reparo", hoje)?.texto).toBe("Previsão: amanhã");
    expect(previsaoDeEntrega("2026-09-26", "em_reparo", hoje)?.texto).toBe("Previsão: sábado, 26/09");
  });

  it("vencida é dita, não escondida", () => {
    const p = previsaoDeEntrega("2026-09-20", "aguardando_peca", hoje);
    expect(p?.atrasada).toBe(true);
    expect(p?.texto).toContain("20/09");
  });

  it("pronta, entregue ou cancelada não têm previsão", () => {
    for (const s of ["pronta", "entregue", "cancelada"] as const) {
      expect(previsaoDeEntrega("2026-09-26", s, hoje)).toBeNull();
    }
  });

  it("sem data ou data inválida não mostra nada", () => {
    expect(previsaoDeEntrega("", "em_reparo", hoje)).toBeNull();
    expect(previsaoDeEntrega(undefined, "em_reparo", hoje)).toBeNull();
    expect(previsaoDeEntrega("26/09/2026", "em_reparo", hoje)).toBeNull();
    expect(previsaoDeEntrega("2026-02-31", "em_reparo", hoje)).toBeNull();
  });

  it("virada de ano não quebra o dia da semana", () => {
    expect(previsaoDeEntrega("2027-01-01", "em_reparo", "2026-12-30")?.texto).toBe(
      "Previsão: sexta, 01/01"
    );
  });
});

describe("falar com a loja", () => {
  it("abre o WhatsApp da loja com o número da OS", () => {
    const l = linkFalarComLoja("(41) 99999-0000", 33);
    expect(l).toContain("wa.me/5541999990000");
    expect(decodeURIComponent(l)).toContain("OS00033");
  });

  it("sem telefone da loja, sem botão", () => {
    expect(linkFalarComLoja("", 33)).toBe("");
    expect(linkFalarComLoja(null, 33)).toBe("");
    expect(linkFalarComLoja("123", 33)).toBe("");
  });

  it("sem emoji na mensagem", () => {
    expect(decodeURIComponent(linkFalarComLoja("41999990000", 1))).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("a cor da loja sai só da lista do sistema", () => {
    expect(corDaLoja("laranja")).toMatch(/^#[0-9a-f]{6}$/i);
    expect(corDaLoja("red; background:url(x)")).toBe("");
    expect(corDaLoja(null)).toBe("");
  });
});

/**
 * O que a página pública mostra é decidido no banco.
 *
 * A migração do rastreio de entrega abriu a função para devolver histórico
 * e dados da loja. Este teste lê o SQL e cobra que a porta não abriu mais
 * do que isso.
 */
describe("consultar_os do rastreio de entrega não vaza", () => {
  const sql = readFileSync(join(RAIZ, "supabase-migracao-rastreio-delivery.sql"), "utf8").replace(
    /^\s*--.*$/gm,
    ""
  );

  it("do histórico sai só status e data, nunca a nota interna", () => {
    expect(sql).toMatch(/jsonb_build_object\('status', b\.valor ->> 'status', 'data', b\.valor ->> 'data'\)/);
    expect(sql).not.toMatch(/'nota'/);
    expect(sql).not.toMatch(/to_jsonb\(a\.historico\)|a\.historico as/);
  });

  it("do cliente sai só o primeiro nome, e nenhum telefone dele", () => {
    expect(sql).toContain("split_part(coalesce(c.nome, ''), ' ', 1)");
    expect(sql).not.toMatch(/c\.telefone|c\.email|c\.documento|c\.nome as/);
    for (const proibido of ["senhaAparelho", "padraoDesbloqueio", "contaVinculada", "imeiSerial", "custo"]) {
      expect(sql).not.toContain(proibido);
    }
  });

  it("o telefone é o do balcão, não o do dono com quem se cobra a mensalidade", () => {
    expect(sql).toContain("telefoneLoja");
    expect(sql).not.toMatch(/l\.whatsapp/);
  });

  it("continua exigindo o segredo, e recolhe a permissão antes de conceder", () => {
    expect(sql).toMatch(/rastreio = nullif\(trim\(coalesce\(p_token/);
    const iRevoke = sql.indexOf("revoke all on function consultar_os");
    expect(iRevoke).toBeGreaterThan(-1);
    expect(sql.indexOf("grant execute on function consultar_os")).toBeGreaterThan(iRevoke);
  });

  it("o teto do histórico vem depois do filtro", () => {
    expect(sql).toMatch(/order by x\.pos desc\s*\n\s*limit 40/);
  });
});
