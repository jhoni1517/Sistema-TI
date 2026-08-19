import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  problemaNoVideo,
  problemaNaDuracao,
  duracaoEscrita,
  MAX_SEGUNDOS,
  MAX_BYTES,
} from "./video";
import { videosParaOCliente, avisoDeFotoNaMensagem } from "./fotos-laudo";

const MB = 1024 * 1024;

describe("problemaNoVideo", () => {
  it("aceita o que sai da câmera de celular", () => {
    expect(problemaNoVideo({ type: "video/mp4", size: 20 * MB })).toBe("");
    expect(problemaNoVideo({ type: "video/quicktime", size: 20 * MB })).toBe("");
    expect(problemaNoVideo({ type: "video/webm", size: 20 * MB })).toBe("");
  });

  it("manda para o botão certo quem escolheu uma foto", () => {
    // "Arquivo inválido" faria a pessoa tentar três vezes antes de entender.
    expect(problemaNoVideo({ type: "image/jpeg", size: 1000 })).toMatch(/botão de foto/i);
  });

  it("recusa formato que não toca no celular de todo mundo", () => {
    expect(problemaNoVideo({ type: "video/x-matroska", size: 1000 })).toMatch(/não toca/i);
    expect(problemaNoVideo({ type: "video/avi", size: 1000 })).toMatch(/não toca/i);
  });

  it("recusa por tamanho dizendo o tamanho e o limite", () => {
    const recado = problemaNoVideo({ type: "video/mp4", size: 80 * MB });
    expect(recado).toMatch(/80 MB/);
    expect(recado).toMatch(/60 MB/);
    // E diz o que fazer, que é a regra da casa para mensagem de erro.
    expect(recado).toMatch(/trecho curto/i);
  });

  it("a recusa nunca se contradiz na mesma linha", () => {
    // Com toFixed(0), um arquivo de 60,0001 MB dizia "tem 60 MB e o limite é
    // 60 MB". Quem lê acha que o sistema quebrou, não que precisa gravar
    // outro vídeo.
    const recado = problemaNoVideo({ type: "video/mp4", size: MAX_BYTES + 1 });
    expect(recado).toMatch(/60,?\.?1 MB e o limite é 60 MB/);
  });

  it("o limite em si passa: recusar no valor exato é surpresa gratuita", () => {
    expect(problemaNoVideo({ type: "video/mp4", size: MAX_BYTES })).toBe("");
  });

  it("tipo em caixa alta continua valendo", () => {
    expect(problemaNoVideo({ type: "VIDEO/MP4", size: 1000 })).toBe("");
  });
});

describe("problemaNaDuracao", () => {
  it("passa dentro do teto", () => {
    expect(problemaNaDuracao(15)).toBe("");
    expect(problemaNaDuracao(MAX_SEGUNDOS)).toBe("");
  });

  it("recusa acima, dizendo que é para filmar de novo", () => {
    // Aqui não adianta escolher outro arquivo: o recado tem que ser outro.
    const recado = problemaNaDuracao(80);
    expect(recado).toMatch(/80 segundos/);
    expect(recado).toMatch(/filme de novo/i);
  });

  it("duração ilegível não vira recusa", () => {
    // Alguns MOV chegam com duration = Infinity. O arquivo pode estar
    // perfeito, e barrar por isso deixaria o técnico sem saída.
    expect(problemaNaDuracao(Infinity)).toBe("");
    expect(problemaNaDuracao(NaN)).toBe("");
    expect(problemaNaDuracao(0)).toBe("");
  });
});

describe("duracaoEscrita", () => {
  it("escreve como o player mostra", () => {
    expect(duracaoEscrita(12)).toBe("0:12");
    expect(duracaoEscrita(9)).toBe("0:09");
    expect(duracaoEscrita(75)).toBe("1:15");
  });

  it("some quando não há duração, em vez de mostrar 0:00", () => {
    expect(duracaoEscrita(0)).toBe("");
    expect(duracaoEscrita(undefined)).toBe("");
    expect(duracaoEscrita(NaN)).toBe("");
  });
});

describe("videosParaOCliente", () => {
  const v = (url: string, capa = "", duracao = 12) => ({ url, capa, duracao });

  it("lista ausente e vazia dão a mesma coisa", () => {
    expect(videosParaOCliente({})).toEqual([]);
    expect(videosParaOCliente({ videosLaudo: [] })).toEqual([]);
  });

  it("descarta o que não é endereço", () => {
    expect(
      videosParaOCliente({
        videosLaudo: [v(""), v("javascript:alert(1)"), v("https://x/a.mp4")],
      })
    ).toHaveLength(1);
  });

  it("capa inválida vira vazio em vez de imagem quebrada em cima do player", () => {
    const [saida] = videosParaOCliente({
      videosLaudo: [v("https://x/a.mp4", "arquivo-que-nao-existe")],
    });
    expect(saida.capa).toBe("");
  });

  it("não repete o mesmo vídeo", () => {
    expect(
      videosParaOCliente({ videosLaudo: [v("https://x/a.mp4"), v("https://x/a.mp4")] })
    ).toHaveLength(1);
  });

  it("duração ruim não vaza para a tela", () => {
    const [saida] = videosParaOCliente({
      videosLaudo: [{ url: "https://x/a.mp4", duracao: Infinity }],
    });
    expect(saida.duracao).toBe(0);
  });
});

describe("o aviso na mensagem do WhatsApp", () => {
  const foto = "https://x/placa.jpg";
  const video = { url: "https://x/liga.mp4" };

  it("junta foto e vídeo numa frase só", () => {
    // Duas linhas seguidas dizendo quase a mesma coisa é o que faz a pessoa
    // parar de ler a mensagem.
    const texto = avisoDeFotoNaMensagem(
      { fotosLaudo: [foto], videosLaudo: [video] },
      true
    );
    expect(texto).toBe("Registramos uma foto e um vídeo do problema. Estão no link abaixo.");
  });

  it("singular quando é um só", () => {
    expect(avisoDeFotoNaMensagem({ videosLaudo: [video] }, true)).toMatch(
      /um vídeo do problema\. Está no link/
    );
  });

  it("cala sem link: anunciar prova sem onde vê-la é pior que nada", () => {
    expect(avisoDeFotoNaMensagem({ videosLaudo: [video] }, false)).toBe("");
  });

  it("sem emoji: este texto vai para o WhatsApp", () => {
    const texto = avisoDeFotoNaMensagem(
      { fotosLaudo: [foto], videosLaudo: [video] },
      true
    );
    expect(texto).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

/*
 * O que faz a página do cliente abrir rápido não é o vídeo ser pequeno: é ele
 * NÃO BAIXAR até alguém tocar no play. Três atributos seguram isso, e cada um
 * já foi esquecido em algum sistema por aí.
 */
describe("o player da página pública", () => {
  const tela = readFileSync(new URL("../pages/Rastreio.tsx", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");

  const marca = tela.slice(tela.indexOf("<video"), tela.indexOf("/>", tela.indexOf("<video")));

  it("existe", () => {
    expect(marca).toContain("<video");
  });

  it('não baixa nada até o play quando existe capa: preload="none"', () => {
    /*
     * Medido no Chrome com um servidor de teste: com `preload="metadata"` o
     * navegador PEDE o arquivo assim que a página abre. Um MP4 de celular
     * guarda o índice no fim, então esse pedido pode arrastar o arquivo
     * inteiro — dezenas de MB no 4G de quem só queria ver se ficou pronto.
     * Com "none", zero pedido.
     *
     * O "metadata" fica para o vídeo SEM capa, que sem ele seria um retângulo
     * preto.
     */
    expect(marca).toMatch(/preload=\{v\.capa \? "none" : "metadata"\}/);
  });

  it("mostra a capa em vez de um retângulo preto", () => {
    expect(marca).toMatch(/poster=/);
  });

  it("playsInline: sem ele o iPhone sequestra a tela no play", () => {
    // E aí a pessoa perde de vista o orçamento que estava lendo.
    expect(marca).toMatch(/playsInline/);
  });

  it("controls: sem eles não há como pausar nem voltar", () => {
    expect(marca).toMatch(/controls/);
  });
});

/*
 * O corte de quem vê o quê é feito no banco. A página abre sem login, e a
 * única porta é `consultar_os`.
 */
describe("a função pública devolve o vídeo campo a campo", () => {
  const sql = readFileSync(
    new URL("../../supabase-migracao-video-laudo.sql", import.meta.url),
    "utf8"
  ).replace(/^\s*--.*$/gm, "");

  it("monta o objeto em vez de devolver o que está gravado", () => {
    // Devolver a linha crua entregaria à página aberta qualquer campo que um
    // dia entre nessa lista. Montando, acrescentar campo vira decisão.
    expect(sql).toMatch(/jsonb_build_object\(\s*'url'/);
    expect(sql).not.toMatch(/jsonb_agg\(\s*v\.valor/);
  });

  it("só deixa passar endereço de verdade, no vídeo e na capa", () => {
    // Sem alias: o filtro mora na subconsulta e a montagem vem depois dela.
    expect(sql).toMatch(/\(v\.valor ->> 'url'\) ~\* '\^https\?:\/\/'/);
    expect(sql).toMatch(/\(valor ->> 'capa'\) ~\* '\^https\?:\/\/'/);
  });

  it("o depósito de vídeo é separado do de imagem", () => {
    // Subir o teto do bucket `imagens` deixaria passar o PNG de 50 MB do
    // scanner, que é lido inteiro em toda carga de produtos.
    expect(sql).toMatch(/storage\.buckets[\s\S]*'videos'/);
    expect(sql).not.toMatch(/'imagens',\s*'imagens'/);
  });

  it("o teto corta DEPOIS do filtro, e não junto dele", () => {
    /*
     * BUG ACHADO RODANDO A FUNÇÃO NUM POSTGRES DE VERDADE.
     *
     * Com `and pos <= 6` na mesma cláusula do filtro, a posição contada é a
     * da lista ORIGINAL: uma entrada inválida no meio gastava uma vaga do
     * teto. Sete fotos boas com duas entradas ruins antes delas devolviam
     * QUATRO — o cliente perdia foto que a loja publicou de propósito.
     *
     * Ler o SQL não pegava. Rodar pegou.
     */
    expect(sql).not.toMatch(/and\s+[fv]\.pos\s*<=/);
    expect(sql).toMatch(/order by f\.pos\s*\n\s*limit 6/);
    expect(sql).toMatch(/order by v\.pos\s*\n\s*limit 3/);
  });

  it("continua sem devolver nada sigiloso", () => {
    for (const proibido of [
      "senhaAparelho",
      "padraoDesbloqueio",
      "contaVinculada",
      "telefone",
      "custo",
      "imeiSerial",
    ]) {
      expect(sql).not.toContain(proibido);
    }
  });

  it("nunca devolve as fotos de ENTRADA", () => {
    expect(sql).not.toMatch(/\ba\.fotos\b|\balvo\.fotos\b|coalesce\(\s*a\.fotos/i);
  });
});
