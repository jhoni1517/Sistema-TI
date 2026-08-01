import { describe, it, expect } from "vitest";
import {
  encaixar,
  problemaNoArquivo,
  caminhoDaImagem,
  caminhoDaUrl,
  daLoja,
  BUCKET,
} from "./imagens";

describe("encolher a imagem antes de subir", () => {
  it("foto de celular deitada cabe no quadrado sem distorcer", () => {
    // 4000x3000 é o que sai de um celular comum. Subir isso no 4G do balcão
    // leva meia dúzia de segundos por produto, e a tela baixa tudo de novo a
    // cada abertura.
    const r = encaixar({ largura: 4000, altura: 3000 }, 800);
    expect(r).toEqual({ largura: 800, altura: 600 });
  });

  it("foto em pé também", () => {
    expect(encaixar({ largura: 3000, altura: 4000 }, 800)).toEqual({
      largura: 600,
      altura: 800,
    });
  });

  it("imagem menor que o limite NÃO é esticada", () => {
    // Esticar só cria arquivo maior com a mesma informação, e deixa a logo
    // borrada no recibo.
    expect(encaixar({ largura: 120, altura: 60 }, 800)).toEqual({
      largura: 120,
      altura: 60,
    });
  });

  it("proporção é mantida mesmo em imagem bem estreita", () => {
    const r = encaixar({ largura: 2000, altura: 100 }, 800);
    expect(r.largura).toBe(800);
    expect(r.altura).toBe(40);
  });

  it("nunca devolve zero: canvas de altura 0 não desenha nada", () => {
    const r = encaixar({ largura: 5000, altura: 3 }, 800);
    expect(r.altura).toBeGreaterThanOrEqual(1);
  });

  it("medida estragada não quebra a conta", () => {
    expect(encaixar({ largura: 0, altura: 0 }, 800)).toEqual({
      largura: 800,
      altura: 800,
    });
  });
});

describe("o que barra antes de tentar subir", () => {
  it("aceita as fotos que o balcão realmente usa", () => {
    expect(problemaNoArquivo({ type: "image/jpeg", size: 3_000_000 })).toBe("");
    expect(problemaNoArquivo({ type: "image/png", size: 500_000 })).toBe("");
    expect(problemaNoArquivo({ type: "image/webp", size: 500_000 })).toBe("");
  });

  it("recusa arquivo que não é imagem, dizendo o que serve", () => {
    const erro = problemaNoArquivo({ type: "video/mp4", size: 1000 });
    expect(erro).toContain("JPG");
  });

  it("recusa arquivo gigante dizendo o tamanho e o limite", () => {
    // "Não foi possível enviar" faria a pessoa tentar dez vezes o mesmo
    // arquivo sem entender.
    const erro = problemaNoArquivo({ type: "image/jpeg", size: 20 * 1024 * 1024 });
    expect(erro).toContain("20.0 MB");
    expect(erro).toContain("15 MB");
  });
});

describe("caminho dentro do depósito", () => {
  const loja = "11111111-2222-3333-4444-555555555555";

  it("começa pelo id da loja: é nisso que a trava do banco se apoia", () => {
    expect(caminhoDaImagem(loja, "produtos", "Coca").startsWith(`${loja}/produtos/`)).toBe(
      true
    );
  });

  it("acento e espaço no nome do arquivo não viram caminho torto", () => {
    const c = caminhoDaImagem(loja, "produtos", "Pão de Açúcar 1kg");
    expect(c).toContain("pao-de-acucar-1kg");
    expect(c).not.toMatch(/[^\w\-/.]/);
  });

  it("nome só de símbolos ainda gera um arquivo válido", () => {
    expect(caminhoDaImagem(loja, "logo", "!!!###")).toContain("/logo/img-");
  });

  it("dois envios seguidos geram nomes diferentes", () => {
    // Mesmo nome faria o navegador mostrar a imagem antiga do cache, e a
    // pessoa acharia que não salvou.
    const a = caminhoDaImagem(loja, "logo", "logo");
    const b = caminhoDaImagem(loja, "logo", "logo");
    expect(a === b && !a.includes("-")).toBe(false);
  });

  it("termina em .jpg, que é o formato que sai daqui", () => {
    expect(caminhoDaImagem(loja, "produtos", "x").endsWith(".jpg")).toBe(true);
  });
});

describe("apagar só o que é da própria loja", () => {
  const loja = "loja-a";

  it("reconhece o caminho da própria loja", () => {
    expect(daLoja(`${loja}/produtos/x.jpg`, loja)).toBe(true);
  });

  it("recusa caminho de outra loja", () => {
    expect(daLoja("loja-b/produtos/x.jpg", loja)).toBe(false);
  });

  it("nome parecido não passa por engano", () => {
    // "loja-abc" começa com "loja-a", mas é outra loja.
    expect(daLoja("loja-abc/produtos/x.jpg", loja)).toBe(false);
  });

  it("sem loja identificada não apaga nada", () => {
    expect(daLoja("loja-a/produtos/x.jpg", "")).toBe(false);
  });

  it("tira o caminho de dentro do endereço público", () => {
    const url = `https://abc.supabase.co/storage/v1/object/public/${BUCKET}/loja-a/logo/x.jpg`;
    expect(caminhoDaUrl(url)).toBe("loja-a/logo/x.jpg");
  });

  it("endereço de fora do depósito não vira caminho", () => {
    expect(caminhoDaUrl("https://site.com/foto.jpg")).toBe("");
  });

  it("caminho com espaço codificado volta legível", () => {
    const url = `https://x/storage/v1/object/public/${BUCKET}/loja-a/logo/meu%20arquivo.jpg`;
    expect(caminhoDaUrl(url)).toBe("loja-a/logo/meu arquivo.jpg");
  });
});
