import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fotosParaOCliente, avisoDeFotoNaMensagem } from "./fotos-laudo";
import { mensagemCliente } from "./mensagens";
import type { OrdemServico, Cliente, Config } from "./types";

const URL_A = "https://x.supabase.co/storage/v1/object/public/imagens/loja/laudos/placa-1.jpg";
const URL_B = "https://x.supabase.co/storage/v1/object/public/imagens/loja/laudos/placa-2.jpg";

describe("fotosParaOCliente", () => {
  it("lista vazia e ausente dão a mesma coisa", () => {
    expect(fotosParaOCliente({})).toEqual([]);
    expect(fotosParaOCliente({ fotosLaudo: [] })).toEqual([]);
  });

  it("devolve as fotos do laudo na ordem em que foram tiradas", () => {
    expect(fotosParaOCliente({ fotosLaudo: [URL_A, URL_B] })).toEqual([URL_A, URL_B]);
  });

  it("não repete a mesma foto", () => {
    // O técnico fotografa o mesmo ponto duas vezes com o cliente esperando, e
    // a página do cliente mostrava a mesma imagem duas vezes, como se fossem
    // dois problemas diferentes.
    expect(fotosParaOCliente({ fotosLaudo: [URL_A, URL_A, URL_B] })).toEqual([
      URL_A,
      URL_B,
    ]);
  });

  it("descarta o que não é endereço de imagem", () => {
    // Texto solto na lista viraria `src` na página aberta do cliente.
    expect(
      fotosParaOCliente({
        fotosLaudo: ["", "   ", "javascript:alert(1)", "data:text/html,x", URL_A],
      })
    ).toEqual([URL_A]);
  });

  it("para em seis", () => {
    const muitas = Array.from({ length: 12 }, (_, i) => `https://x/${i}.jpg`);
    expect(fotosParaOCliente({ fotosLaudo: muitas })).toHaveLength(6);
  });
});

describe("avisoDeFotoNaMensagem", () => {
  it("cala quando não há foto", () => {
    expect(avisoDeFotoNaMensagem({}, true)).toBe("");
  });

  it("cala quando não há link: anunciar foto sem onde vê-la é pior que nada", () => {
    expect(avisoDeFotoNaMensagem({ fotosLaudo: [URL_A] }, false)).toBe("");
  });

  it("fala no singular e no plural", () => {
    expect(avisoDeFotoNaMensagem({ fotosLaudo: [URL_A] }, true)).toMatch(/uma foto/);
    expect(avisoDeFotoNaMensagem({ fotosLaudo: [URL_A, URL_B] }, true)).toMatch(/2 fotos/);
  });

  it("sem emoji: este texto vai para o WhatsApp", () => {
    const texto = avisoDeFotoNaMensagem({ fotosLaudo: [URL_A, URL_B] }, true);
    expect(texto).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

/* ---------- Na mensagem inteira ---------- */

const config = { nomeLoja: "Assistência do Zé" } as Config;
const cliente = { id: "c1", nome: "Maria Souza" } as Cliente;

const ordem = (v: Partial<OrdemServico> = {}): OrdemServico =>
  ({
    id: "o1",
    numero: 15,
    clienteId: "c1",
    tipoAparelho: "Notebook",
    marca: "Dell",
    modelo: "Latitude 3400",
    checklist: {},
    pecas: [],
    maoDeObra: 0,
    desconto: 0,
    status: "aguardando_aprovacao",
    garantiaDias: 90,
    historico: [],
    criadoEm: "2026-08-01T10:00:00.000Z",
    atualizadoEm: "2026-08-01T10:00:00.000Z",
    ...v,
  }) as OrdemServico;

describe("mensagemCliente com foto do problema", () => {
  it("anuncia a foto logo depois do laudo, e antes do link", () => {
    const texto = mensagemCliente(
      ordem({ defeitoConstatado: "Trilha queimada perto do conector de carga", fotosLaudo: [URL_A] }),
      cliente,
      config,
      "https://loja/#/rastreio/OS00015?loja=1&t=abc"
    );
    expect(texto).toMatch(/uma foto do problema/i);
    expect(texto.indexOf("Trilha queimada")).toBeLessThan(texto.indexOf("foto do problema"));
    expect(texto.indexOf("foto do problema")).toBeLessThan(texto.indexOf("rastreio"));
  });

  it("não inventa foto quando a OS não tem nenhuma", () => {
    const texto = mensagemCliente(ordem(), cliente, config, "https://loja/#/x");
    expect(texto).not.toMatch(/foto/i);
  });
});

/*
 * O corte de quem vê o quê é feito no BANCO, e não aqui.
 *
 * A página de rastreio abre sem login. Filtrar campo na tela não esconde nada
 * de quem abre o painel do navegador: a única porta é `consultar_os`. Este
 * teste lê o SQL do disco e cobra que as fotos da ENTRADA — que pegam a tela
 * ligada e a tela de bloqueio do aparelho — nunca saiam por ali.
 */
describe("a função pública só devolve as fotos do laudo", () => {
  const sql = readFileSync(
    new URL("../../supabase-migracao-fotos-laudo.sql", import.meta.url),
    "utf8"
  )
    // Os comentários FALAM de `fotos` o tempo todo, explicando por que ela não
    // sai. Contá-los faria o teste reprovar a própria explicação.
    .replace(/^\s*--.*$/gm, "");

  it("lê fotosLaudo", () => {
    expect(sql).toMatch(/"fotosLaudo"/);
  });

  it("nunca lê a coluna fotos da ordem", () => {
    expect(sql).not.toMatch(/\ba\.fotos\b|\balvo\.fotos\b|coalesce\(\s*a\.fotos/i);
  });

  it("não devolve nada que a versão anterior já não devolvesse, além da foto", () => {
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

  it("recolhe a permissão do public antes de conceder, ao recriar a função", () => {
    // Recriar uma função devolve EXECUTE a todo mundo por padrão. Sem o
    // revoke, a migração deixaria a porta mais aberta do que estava.
    const iRevoke = sql.indexOf("revoke all on function consultar_os");
    const iGrant = sql.indexOf("grant execute on function consultar_os");
    expect(iRevoke).toBeGreaterThan(-1);
    expect(iGrant).toBeGreaterThan(iRevoke);
  });
});
