import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Relatado: "gerei o link, ela recebeu o pedido de confirmar o e-mail, e ao
 * confirmar dá erro ao acessar o site."
 *
 * Duas causas, e as duas viraram teste porque as duas são invisíveis de
 * dentro da loja: quem cria o convite nunca vê a tela que a outra pessoa vê.
 */

const comOrigem = async (href: string) => {
  const url = new URL(href);
  vi.stubGlobal("window", {
    location: { origin: url.origin, pathname: url.pathname, hash: url.hash },
  });
  vi.resetModules();
  return await import("./auth");
};

beforeEach(() => vi.unstubAllGlobals());

describe("para onde o e-mail de confirmação traz a pessoa de volta", () => {
  /**
   * Sem `emailRedirectTo`, o Supabase usa a "Site URL" do projeto — que
   * nasce valendo http://localhost:3000. O link do e-mail mandava a pessoa
   * para o localhost DELA, que não existe.
   */
  it("é o endereço onde o sistema está rodando, não um fixo", async () => {
    const { destinoDaConfirmacao } = await comOrigem("https://sistema-ti-caixa.vercel.app/");
    expect(destinoDaConfirmacao()).toBe("https://sistema-ti-caixa.vercel.app/");
  });

  /** A mesma base atende as prévias da Vercel e o npm run dev. */
  it("acompanha a prévia e o desenvolvimento", async () => {
    const previa = await comOrigem("https://sistema-ti-git-abc.vercel.app/");
    expect(previa.destinoDaConfirmacao()).toContain("sistema-ti-git-abc");

    const local = await comOrigem("http://localhost:5173/");
    expect(local.destinoDaConfirmacao()).toBe("http://localhost:5173/");
  });

  /**
   * O convite vai na URL porque o e-mail costuma abrir noutro navegador —
   * o embutido do aplicativo do Gmail tem outro localStorage.
   */
  it("leva o código do convite junto", async () => {
    const { destinoDaConfirmacao } = await comOrigem("https://sistema-ti-caixa.vercel.app/");
    expect(destinoDaConfirmacao("abc123")).toBe(
      "https://sistema-ti-caixa.vercel.app/#/entrar?convite=ABC123"
    );
  });

  it("sem convite não põe lixo na URL", async () => {
    const { destinoDaConfirmacao } = await comOrigem("https://x.app/");
    for (const vazio of [undefined, "", "   "]) {
      expect(destinoDaConfirmacao(vazio)).toBe("https://x.app/");
    }
  });

  it("código com caractere especial não quebra a URL", async () => {
    const { destinoDaConfirmacao } = await comOrigem("https://x.app/");
    expect(destinoDaConfirmacao("a b&c")).toBe("https://x.app/#/entrar?convite=A%20B%26C");
  });
});

/**
 * A leitura do convite na tela de "sem perfil" — a URL manda, o aparelho é
 * reserva. A regra é pequena e a consequência de errar não é: a pessoa fica
 * presa numa tela pedindo um código que ela nunca escolheu.
 */
const conviteDaTela = (hash: string, guardado: string | null): string => {
  const naUrl = new URLSearchParams(hash.split("?")[1] || "")
    .get("convite")
    ?.trim()
    .toUpperCase();
  return naUrl || guardado || "";
};

describe("de onde a tela sem-perfil tira o convite", () => {
  it("a URL vence o que está guardado", () => {
    expect(conviteDaTela("#/entrar?convite=NOVO", "VELHO")).toBe("NOVO");
  });

  it("sem URL, usa o guardado", () => {
    expect(conviteDaTela("#/entrar", "VELHO")).toBe("VELHO");
  });

  /** O caso que quebrava: outro navegador, localStorage vazio. */
  it("outro navegador: a URL salva", () => {
    expect(conviteDaTela("#/entrar?convite=ABC123", null)).toBe("ABC123");
  });

  it("nada em lugar nenhum: campo vazio, e a pessoa digita", () => {
    expect(conviteDaTela("#/entrar", null)).toBe("");
  });

  it("normaliza para maiúsculas, como o resto do sistema", () => {
    expect(conviteDaTela("#/entrar?convite=abc123", null)).toBe("ABC123");
  });
});
