import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { separarOS, pedidoDoServicoDaOS, pedidoDaMercadoriaDaOS } from "./nota-os";
import { notaPendenteDaOS } from "./nota";
import type { Config, OrdemServico, Produto } from "./types";

/**
 * O caminho inteiro, da OS até o que sai pela rede.
 *
 * Os outros testes conferem as contas. Este confere o ENCANAMENTO: monta a
 * OS, separa nos dois documentos, gera os dois pedidos e ENTREGA cada um à
 * função do robô — a de verdade, arrancada do `api/nota.js` do disco — com
 * um `fetch` falso no lugar da rede.
 *
 * A função é extraída em vez de recopiada porque cópia dentro de teste
 * envelhece igual e os dois passam a mentir juntos. Mesmo motivo do
 * `agenda.cron.test.ts`.
 *
 * O que ele pega e nenhum outro pegava: o robô mandava TUDO para /v2/nfce.
 * A nota de serviço da OS ia para o governo errado, e ninguém veria antes
 * do contador.
 */

const fonte = readFileSync(resolve(__dirname, "..", "..", "api", "nota.js"), "utf8");

/** Arranca um trecho do arquivo do robô, do começo da declaração até a linha que fecha */
function trecho(inicio: string): string {
  const i = fonte.indexOf(inicio);
  if (i < 0) throw new Error(`"${inicio}" sumiu de api/nota.js`);
  const fim = fonte.indexOf("\n}\n", i);
  return fonte.slice(i, fim + 3);
}

/** O robô de verdade, com a rede trocada por um espião */
function roboDeVerdade(resposta: {
  status?: number;
  corpo?: Record<string, unknown>;
}): {
  enviar: (
    cred: { token: string; ambiente: string },
    nota: { id: string; tipo: string },
    pedido: unknown
  ) => Promise<Record<string, string>>;
  chamadas: { url: string; corpo: unknown; autorizacao: string }[];
} {
  const chamadas: { url: string; corpo: unknown; autorizacao: string }[] = [];
  const fetchFalso = async (url: string, opcoes: RequestInit) => {
    chamadas.push({
      url,
      corpo: JSON.parse(String(opcoes.body)),
      autorizacao: String((opcoes.headers as Record<string, string>).Authorization),
    });
    return {
      status: resposta.status ?? 200,
      json: async () => resposta.corpo ?? {},
    };
  };

  const codigo = `${trecho("const BASE = {").replace("const BASE", "var BASE")}
${trecho("function traduzErroFiscal(")}
${trecho("async function enviarNota(")}
return enviarNota;`;

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const fabrica = new Function("fetch", "Buffer", codigo);
  return { enviar: fabrica(fetchFalso, Buffer), chamadas };
}

const cred = { token: "tok-de-mentira", ambiente: "homologacao" };

const os: OrdemServico = {
  id: "os-1",
  numero: 42,
  clienteId: "c1",
  tipoAparelho: "Celular",
  marca: "Samsung",
  modelo: "A20",
  defeitoRelatado: "Tela quebrada",
  checklist: {},
  pecas: [
    { descricao: "Tela A20", quantidade: 1, custoUnit: 300, precoUnit: 630, produtoId: "p1" },
  ],
  maoDeObra: 180,
  desconto: 0,
  status: "pronta",
  garantiaDias: 90,
  historico: [],
  criadoEm: "2026-01-10T10:00:00.000Z",
  atualizadoEm: "2026-01-10T10:00:00.000Z",
} as unknown as OrdemServico;

const produtos: Produto[] = [
  {
    id: "p1",
    nome: "Tela A20",
    preco: 630,
    custo: 300,
    estoque: 2,
    ncm: "85177011",
    cfop: "5102",
    csosn: "102",
    origem: "0",
  } as unknown as Produto,
];

const config: Config = {
  nomeLoja: "Assistência",
  cnpj: "12345678000199",
  inscricaoEstadual: "1234567",
  inscricaoMunicipal: "987654",
  regimeTributario: "simples",
  codigoServicoPadrao: "14.01",
  aliquotaIssPadrao: 3,
  nfLogradouro: "Rua das Flores",
  nfNumero: "123",
  nfBairro: "Centro",
  nfCep: "83000000",
  nfMunicipio: "São José dos Pinhais",
  nfCodigoIbge: "4125506",
  nfUf: "PR",
} as unknown as Config;

const parcelas = [{ forma: "pix" as const, valor: 810 }];

describe("da OS até o que sai pela rede", () => {
  it("a mão de obra vai para a PREFEITURA e a peça para a SEFAZ", async () => {
    /*
     * O teste que mais importa deste arquivo. Um caminho só mandaria os
     * dois documentos para o mesmo governo, e o imposto seria recolhido
     * errado sem ninguém ver até o contador.
     */
    const lados = separarOS(os, produtos);
    const robo = roboDeVerdade({ corpo: { status: "processando_autorizacao" } });

    await robo.enviar(
      cred,
      notaPendenteDaOS("n-servico", os.id, "nfse"),
      pedidoDoServicoDaOS(os, lados.servico, produtos, config, parcelas)
    );
    await robo.enviar(
      cred,
      notaPendenteDaOS("n-peca", os.id, "nfce"),
      pedidoDaMercadoriaDaOS(os, lados.mercadoria, produtos, config, parcelas)
    );

    expect(robo.chamadas[0].url).toBe(
      "https://homologacao.focusnfe.com.br/v2/nfse?ref=n-servico"
    );
    expect(robo.chamadas[1].url).toBe(
      "https://homologacao.focusnfe.com.br/v2/nfce?ref=n-peca"
    );
  });

  it("cada documento leva os campos DELE, e não os do outro", async () => {
    const lados = separarOS(os, produtos);
    const robo = roboDeVerdade({ corpo: { status: "processando_autorizacao" } });

    await robo.enviar(
      cred,
      notaPendenteDaOS("n-servico", os.id, "nfse"),
      pedidoDoServicoDaOS(os, lados.servico, produtos, config, parcelas)
    );
    await robo.enviar(
      cred,
      notaPendenteDaOS("n-peca", os.id, "nfce"),
      pedidoDaMercadoriaDaOS(os, lados.mercadoria, produtos, config, parcelas)
    );

    const servico = robo.chamadas[0].corpo as {
      discriminacao: string;
      codigoMunicipio: string;
      itens: { codigoServico: string; aliquotaIss: number; ncm?: string }[];
      valorTotal: number;
    };
    const peca = robo.chamadas[1].corpo as {
      itens: { ncm: string; cfop: string; codigoServico?: string }[];
      valorTotal: number;
    };

    // Serviço: código da lista e ISS, e NENHUM NCM — esse número não existe
    // para mão de obra, e cobrá-lo travaria a emissão para sempre.
    expect(servico.itens[0].codigoServico).toBe("14.01");
    expect(servico.itens[0].aliquotaIss).toBe(3);
    expect(servico.itens[0].ncm).toBeUndefined();
    expect(servico.discriminacao).toContain("OS 42");
    expect(servico.codigoMunicipio).toBe("4125506");
    expect(servico.valorTotal).toBe(180);

    // Mercadoria: NCM e CFOP, e nenhum código de serviço.
    expect(peca.itens[0].ncm).toBe("85177011");
    expect(peca.itens[0].cfop).toBe("5102");
    expect(peca.itens[0].codigoServico).toBeUndefined();
    expect(peca.valorTotal).toBe(630);

    // E as duas somam a OS inteira. Nem um centavo a mais nem a menos.
    expect(servico.valorTotal + peca.valorTotal).toBe(810);
  });

  it("a referência é o ID da nota, que é o que impede nota em duplicidade", async () => {
    /*
     * Um timeout sem referência vira DUAS notas fiscais para um serviço só,
     * e a segunda tem que ser cancelada em 30 minutos ou vira nota de
     * devolução com o contador.
     */
    const lados = separarOS(os, produtos);
    const robo = roboDeVerdade({ corpo: { status: "processando_autorizacao" } });
    const nota = notaPendenteDaOS("id-unico-da-nota", os.id, "nfse");

    await robo.enviar(cred, nota, pedidoDoServicoDaOS(os, lados.servico, produtos, config, parcelas));
    await robo.enviar(cred, nota, pedidoDoServicoDaOS(os, lados.servico, produtos, config, parcelas));

    expect(robo.chamadas[0].url).toContain("ref=id-unico-da-nota");
    expect(robo.chamadas[1].url).toBe(robo.chamadas[0].url);
  });

  it("a NFS-e autorizada guarda o código de verificação da prefeitura", async () => {
    /*
     * A NFC-e volta com chave de 44 dígitos; a NFS-e volta com código de
     * verificação e nenhuma chave. Descartar deixaria a nota de serviço
     * autorizada sem nada que a identifique na tela — e é por esse código
     * que o cliente confere a nota no site da cidade.
     */
    const robo = roboDeVerdade({
      corpo: {
        status: "autorizado",
        numero: "88",
        codigo_verificacao: "ABC-123",
        url: "https://prefeitura.exemplo/nota/88",
      },
    });
    const r = await robo.enviar(cred, notaPendenteDaOS("n1", os.id, "nfse"), {});

    expect(r.situacao).toBe("autorizada");
    expect(r.chave).toBe("ABC-123");
    expect(r.url).toBe("https://prefeitura.exemplo/nota/88");
    expect(r.emitidaEm).toBeTruthy();
  });

  it("a NFC-e autorizada continua guardando a chave de 44 dígitos", async () => {
    // A nota de mercadoria não podia perder nada no caminho da mudança.
    const robo = roboDeVerdade({
      corpo: {
        status: "autorizado",
        chave_nfe: "41260112345678000199650010000000881234567890",
        numero: "88",
        serie: "1",
        protocolo: "141260000123456",
        caminho_danfe: "/danfe/88.pdf",
      },
    });
    const r = await robo.enviar(cred, notaPendenteDaOS("n2", os.id, "nfce"), {});

    expect(r.chave).toBe("41260112345678000199650010000000881234567890");
    expect(r.protocolo).toBe("141260000123456");
    expect(r.url).toBe("/danfe/88.pdf");
  });

  it("recusa da prefeitura vira texto que diz o que fazer", async () => {
    const robo = roboDeVerdade({
      corpo: { status: "erro_autorizacao", mensagem: "Inscricao municipal nao habilitada" },
    });
    const r = await robo.enviar(cred, notaPendenteDaOS("n3", os.id, "nfse"), {});

    expect(r.situacao).toBe("rejeitada");
    expect(r.erro).toContain("Inscrição Estadual da loja está errada ou não está ativa");
    // O texto cru vai junto, no fim: é ele que o contador usa quando a
    // tradução não cobre o caso.
    expect(r.erro).toContain("Inscricao municipal nao habilitada");
  });

  it("emissor fora do ar deixa PENDENTE, e não rejeitada", async () => {
    // Rejeitada é o que a SEFAZ recusou. O resto é temporário, e marcar
    // como recusada faria a loja procurar erro de cadastro que não existe.
    const robo = roboDeVerdade({ status: 500, corpo: {} });
    const r = await robo.enviar(cred, notaPendenteDaOS("n4", os.id, "nfse"), {});
    expect(r.situacao).toBe("pendente");
  });

  it("a loja nova fala com HOMOLOGAÇÃO, nunca com produção", async () => {
    // Mandar para produção sem querer emite documento fiscal de verdade,
    // com número consumido e prazo de cancelamento correndo.
    const robo = roboDeVerdade({ corpo: { status: "processando_autorizacao" } });
    await robo.enviar({ token: "t", ambiente: "" }, notaPendenteDaOS("n5", os.id, "nfse"), {});
    expect(robo.chamadas[0].url).toContain("homologacao.focusnfe.com.br");

    const robo2 = roboDeVerdade({ corpo: { status: "processando_autorizacao" } });
    await robo2.enviar({ token: "t", ambiente: "producao" }, notaPendenteDaOS("n6", os.id, "nfce"), {});
    expect(robo2.chamadas[0].url).toContain("api.focusnfe.com.br");
  });
});
