import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { podeRecarregar, INTERVALO_RECARGA_MS } from "./recarga";

/** localStorage de mentira: os testes de lib rodam em node, sem navegador */
const memoria = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => memoria.get(k) ?? null,
  setItem: (k: string, v: string) => void memoria.set(k, v),
  removeItem: (k: string) => void memoria.delete(k),
  clear: () => memoria.clear(),
  key: () => null,
  length: 0,
};

const { db, leituraAtual } = await import("./db");

/*
 * O BUG
 *
 * A venda lançada no Caixa aparecia e sumia, e só voltava com F5.
 *
 * A tela recarregava a loja inteira a cada volta do foco da janela — e foco
 * dispara ao fechar o teclado do celular, ao voltar da câmera, ao tocar na
 * página depois de olhar o WhatsApp. Cada recarga são dezessete consultas que
 * no 4G do balcão levam segundos.
 *
 * Quando o operador registrava a venda no meio dessa janela, a resposta da
 * leitura — tirada do banco ANTES do insert — chegava depois e substituía a
 * lista inteira, levando embora o lançamento que já estava na tela.
 *
 * O dinheiro estava gravado o tempo todo. Mas quem lança uma venda e não a vê
 * lança de novo, e aí o problema deixa de ser de tela e vira furo de caixa.
 *
 * Duas travas, e as duas são necessárias:
 *   1. Leitura que foi ultrapassada por uma gravação não se aplica.
 *   2. Recarga tem intervalo mínimo, para a janela quase não existir.
 */

/*
 * A CORRIDA, REPRODUZIDA.
 *
 * A ordem exata que fazia a venda sumir da tela:
 *   1. Volta o foco da janela -> começa a recarga (dezessete consultas).
 *   2. O operador registra a venda. Ela entra na lista da tela.
 *   3. A recarga volta com a foto do banco tirada no passo 1, SEM a venda,
 *      e substitui a lista inteira.
 *
 * O dinheiro estava gravado o tempo todo. Quem lança uma venda e não a vê
 * lança de novo — e aí vira furo de caixa.
 */
describe("a leitura que começou antes da gravação", () => {
  it("sabe que foi ultrapassada e não deve ser aplicada", async () => {
    const aindaVale = leituraAtual(); // passo 1: a recarga começa
    expect(aindaVale()).toBe(true);

    // passo 2: o operador registra a venda no meio
    await db.movimentos.save({
      id: "mov-da-corrida",
      tipo: "entrada",
      categoria: "Venda",
      descricao: "Conector de Carga",
      valor: 100,
      formaPagamento: "pix",
      data: "2026-08-18T12:54:00.000Z",
    } as never);

    // passo 3: a resposta velha chega. A trava manda descartar.
    expect(aindaVale()).toBe(false);
  });

  it("uma leitura iniciada DEPOIS da gravação continua valendo", async () => {
    await db.movimentos.save({ id: "outro", tipo: "entrada", valor: 1 } as never);
    const aindaVale = leituraAtual();
    expect(aindaVale()).toBe(true);
  });

  it("apagar também conta: a leitura velha ressuscitaria o lançamento excluído", async () => {
    const aindaVale = leituraAtual();
    await db.movimentos.remove("mov-da-corrida");
    expect(aindaVale()).toBe(false);
  });
});

describe("podeRecarregar", () => {
  const agora = 1_800_000_000_000;

  it("a primeira abertura sempre carrega", () => {
    expect(podeRecarregar(0, agora)).toBe(true);
  });

  it("segura a recarga logo depois de uma", () => {
    expect(podeRecarregar(agora - 1_000, agora)).toBe(false);
    expect(podeRecarregar(agora - INTERVALO_RECARGA_MS + 1, agora)).toBe(false);
  });

  it("libera depois do intervalo", () => {
    expect(podeRecarregar(agora - INTERVALO_RECARGA_MS, agora)).toBe(true);
    expect(podeRecarregar(agora - 60_000, agora)).toBe(true);
  });

  it("relógio que andou para trás não trava a recarga para sempre", () => {
    // Acontece de verdade: celular que corrige a hora pela rede. Com uma
    // comparação ingênua o sistema pararia de buscar dados novos até alguém
    // fechar o aplicativo.
    expect(podeRecarregar(agora + 3_600_000, agora)).toBe(true);
  });

  it("valor inválido não trava nada", () => {
    expect(podeRecarregar(NaN, agora)).toBe(true);
    expect(podeRecarregar(Infinity, agora)).toBe(true);
  });

  it("o intervalo é curto o bastante para o outro balcão aparecer", () => {
    // Longo demais e uma venda feita no outro caixa demoraria a aparecer aqui,
    // que é justamente o motivo de a recarga existir.
    expect(INTERVALO_RECARGA_MS).toBeGreaterThanOrEqual(5_000);
    expect(INTERVALO_RECARGA_MS).toBeLessThanOrEqual(60_000);
  });
});

/*
 * Regra escrita não segura nada: as duas travas viram teste que lê o código
 * do disco. Foi assim com "dinheiro primeiro" e com "sem emoji", que já
 * tinham sido quebradas depois de escritas.
 */

const semComentarios = (fonte: string): string =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("lib/db.ts conta as gravações", () => {
  const fonte = semComentarios(readFileSync(new URL("./db.ts", import.meta.url), "utf8"));

  it("upsert e remove sobem o contador", () => {
    // No único ponto por onde toda gravação passa. Em cada ação da loja
    // seriam vinte lugares para esquecer um.
    for (const nome of ["upsert", "remove"]) {
      const i = fonte.indexOf(`async function ${nome}`);
      expect(i, `função ${nome} não encontrada`).toBeGreaterThan(-1);
      const corpo = fonte.slice(i, fonte.indexOf("\n}", i));
      expect(corpo, `${nome} não conta a gravação`).toContain("escritas++");
    }
  });

  it("o contador sobe ANTES da tentativa, não depois de dar certo", () => {
    // Contar só no sucesso deixaria a janela aberta durante a gravação, que é
    // exatamente quando a leitura em voo costuma voltar.
    const i = fonte.indexOf("async function upsert");
    const corpo = fonte.slice(i, fonte.indexOf("\n}", i));
    expect(corpo.indexOf("escritas++")).toBeLessThan(corpo.indexOf("supabase"));
  });

  it("leituraAtual compara a marca de antes com a de agora", () => {
    expect(fonte).toMatch(/const inicio = escritas/);
    expect(fonte).toMatch(/escritas === inicio/);
  });
});

describe("o AppStore descarta a leitura ultrapassada", () => {
  const fonte = semComentarios(
    readFileSync(new URL("../store/AppStore.tsx", import.meta.url), "utf8")
  );
  const i = fonte.indexOf("const reload = useCallback");
  const corpo = fonte.slice(i, fonte.indexOf("}, [email]);", i));

  it("marca a leitura antes de pedir os dados", () => {
    expect(i, "reload não encontrado").toBeGreaterThan(-1);
    expect(corpo).toContain("leituraAtual()");
    expect(corpo.indexOf("leituraAtual()")).toBeLessThan(corpo.indexOf("allSettled"));
  });

  it("confere a marca ANTES de aplicar os resultados", () => {
    const iConfere = corpo.indexOf("aindaVale()");
    const iAplica = corpo.indexOf("resultados.forEach");
    expect(iConfere).toBeGreaterThan(corpo.indexOf("allSettled"));
    expect(iConfere).toBeLessThan(iAplica);
  });

  it("a configuração da nuvem passa pela mesma trava", () => {
    // Salvar configuração no meio de uma recarga desfazia a alteração na
    // tela, e o formulário de Configurações já apagou a loja inteira uma vez.
    expect(corpo).toMatch(/cloudCfg && aindaVale\(\)/);
  });

  it("a volta ao app respeita o intervalo mínimo", () => {
    expect(fonte).toContain("podeRecarregar(ultimaRecarga.current)");
  });

  it("o botão Atualizar dados continua recarregando na hora", () => {
    // O intervalo vale para a recarga automática. Quem apertou o botão está
    // pedindo dados novos AGORA, e responder "espera 20 segundos" sem dizer
    // nada faria a pessoa achar que o botão quebrou.
    const layout = semComentarios(
      readFileSync(new URL("../components/Layout.tsx", import.meta.url), "utf8")
    );
    expect(layout).toMatch(/onClick=\{[^}]*reload/);
    expect(layout).not.toContain("podeRecarregar");
  });
});
