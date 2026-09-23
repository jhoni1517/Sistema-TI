import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  tempoDeCasa,
  separarOrdens,
  garantiasAtivas,
  linkDaArea,
  linkDeAcesso,
  acessoDoLink,
  mensagemDeAcesso,
  erroDoCadastro,
  erroDaSenha,
  aparelhoDaOS,
  type OSDoCliente,
} from "./area-cliente";

const os = (p: Partial<OSDoCliente>): OSDoCliente => ({ numero: 1, status: "aberta", ...p });

describe("tempo de casa", () => {
  it("conta meses completos", () => {
    expect(tempoDeCasa("2024-06-10", "2026-09-23")).toBe("2 anos e 3 meses");
    expect(tempoDeCasa("2026-01-23", "2026-09-23")).toBe("8 meses");
    expect(tempoDeCasa("2025-09-23", "2026-09-23")).toBe("1 ano");
  });
  it("mês incompleto não conta", () => {
    expect(tempoDeCasa("2026-08-31", "2026-09-30")).toBe("menos de um mês");
    expect(tempoDeCasa("2026-09-01", "2026-09-23")).toBe("menos de um mês");
  });
  it("aceita data com hora e recusa lixo", () => {
    expect(tempoDeCasa("2025-08-23T10:00:00.000Z", "2026-09-23")).toBe("1 ano e 1 mês");
    expect(tempoDeCasa("", "2026-09-23")).toBe("");
    expect(tempoDeCasa("2027-01-01", "2026-09-23")).toBe("");
  });
});

describe("ordens do cliente", () => {
  it("separa o que está na bancada do histórico", () => {
    const r = separarOrdens([
      os({ numero: 1, status: "em_reparo" }),
      os({ numero: 2, status: "entregue" }),
      os({ numero: 3, status: "cancelada" }),
      os({ numero: 4, status: "pronta" }),
    ]);
    expect(r.agora.map((o) => o.numero)).toEqual([1, 4]);
    expect(r.historico.map((o) => o.numero)).toEqual([2, 3]);
  });

  it("garantia ativa pela mesma regra da loja", () => {
    const g = garantiasAtivas(
      [
        os({ numero: 1, status: "entregue", entregueEm: "2026-09-01T12:00:00Z", garantiaDias: 90 }),
        os({ numero: 2, status: "entregue", entregueEm: "2025-01-01", garantiaDias: 90 }),
        os({ numero: 3, status: "cancelada", entregueEm: "2026-09-01", garantiaDias: 90 }),
        os({ numero: 4, status: "em_reparo", garantiaDias: 90 }),
      ],
      "2026-09-23"
    );
    expect(g.map((x) => x.os.numero)).toEqual([1]);
    expect(g[0].garantia.ate).toBe("2026-11-30");
  });

  it("nome do aparelho cai no número da OS quando não tem nada", () => {
    expect(aparelhoDaOS(os({ tipoAparelho: "Celular", marca: "Samsung", modelo: "A10" }))).toBe("Celular Samsung A10");
    expect(aparelhoDaOS(os({ numero: 7 }))).toBe("OS00007");
  });
});

describe("links", () => {
  it("área e acesso", () => {
    expect(linkDaArea("https://x.app/", "abc")).toBe("https://x.app/#/cliente/abc");
    expect(linkDaArea("https://x.app/", "")).toBe("");
    const l = linkDeAcesso("https://x.app/", "abc", "tk1");
    expect(l).toBe("https://x.app/#/cliente/abc?acesso=tk1");
    expect(acessoDoLink("#/cliente/abc?acesso=tk1")).toBe("tk1");
    expect(acessoDoLink("#/cliente/abc")).toBe("");
    expect(linkDeAcesso("https://x.app/", "abc", "")).toBe("");
  });

  it("recado de acesso tem o link e o primeiro nome", () => {
    const m = mensagemDeAcesso("Maria da Silva", "Loja X", "https://l");
    expect(m).toContain("Maria!");
    expect(m).not.toContain("Silva");
    expect(m).toContain("https://l");
  });
});

describe("cadastro", () => {
  const bom = {
    nome: "Maria Silva",
    cpf: "529.982.247-25",
    telefone: "(11) 99999-8888",
    nascimento: "1990-02-10",
    senha: "segredo1",
    confirmacao: "segredo1",
  };
  const hoje = "2026-09-23";

  it("aceita o cadastro certo", () => {
    expect(erroDoCadastro(bom, hoje)).toBe("");
  });
  it("diz o que corrigir", () => {
    expect(erroDoCadastro({ ...bom, nome: "Ma" }, hoje)).toMatch(/nome/);
    expect(erroDoCadastro({ ...bom, cpf: "111.111.111-11" }, hoje)).toMatch(/CPF/);
    expect(erroDoCadastro({ ...bom, telefone: "9999" }, hoje)).toMatch(/WhatsApp/);
    expect(erroDoCadastro({ ...bom, nascimento: "1990-02-31" }, hoje)).toMatch(/nascimento/);
    expect(erroDoCadastro({ ...bom, nascimento: "2030-01-01" }, hoje)).toMatch(/nascimento/);
    expect(erroDoCadastro({ ...bom, confirmacao: "outra" }, hoje)).toMatch(/iguais/);
  });
  it("senha curta", () => {
    expect(erroDaSenha("12345", "12345")).toMatch(/6/);
  });
});

/*
 * A senha NÃO pode ser a data de nascimento, e o cadastro pelo link NÃO pode
 * sobrescrever CPF que já existe (senão qualquer um criava senha em cima do
 * cliente de verdade). As duas travas moram no banco; este teste lê o SQL do
 * disco para ninguém tirar sem ver.
 */
describe("as travas do banco", () => {
  const sql = readFileSync(new URL("../../supabase-migracao-area-cliente.sql", import.meta.url), "utf8");

  it("senha guardada com hash, nunca em texto", () => {
    expect(sql).toMatch(/crypt\(p_senha, gen_salt\('bf'\)\)/);
  });
  it("CPF existente é recusado no cadastro", () => {
    expect(sql).toMatch(/Você já tem cadastro nesta loja/);
  });
  it("erro de senha conta tentativa sem exceção", () => {
    expect(sql).toMatch(/set tentativas = a\.tentativas \+ 1/);
  });
  it("tabelas de senha e sessão sem acesso direto", () => {
    expect(sql).toMatch(/revoke all on cliente_acesso from anon, authenticated/);
    expect(sql).toMatch(/revoke all on cliente_sessoes from anon, authenticated/);
    expect(sql).not.toMatch(/create policy[^;]*cliente_acesso/);
  });
  it("gerar o link de acesso é só para quem está logado na loja", () => {
    expect(sql).toMatch(/grant execute on function gerar_acesso_cliente\(text\) to authenticated;/);
    expect(sql).not.toMatch(/gerar_acesso_cliente\(text\) to anon/);
  });
});

describe("só o formulário", () => {
  it("link e recado", async () => {
    const { linkDeCadastro, mensagemDeFormulario } = await import("./area-cliente");
    expect(linkDeCadastro("https://x.app/", "abc")).toBe("https://x.app/#/cadastro/abc");
    expect(linkDeCadastro("https://x.app/", "")).toBe("");
    expect(mensagemDeFormulario("Loja X", "https://l")).toContain("https://l");
  });
  it("valida sem pedir senha, e-mail só se preenchido", async () => {
    const { erroDoFormulario } = await import("./area-cliente");
    const f = { nome: "Maria Silva", cpf: "52998224725", telefone: "11999998888", nascimento: "1990-02-10", email: "", endereco: "" };
    expect(erroDoFormulario(f, "2026-09-23")).toBe("");
    expect(erroDoFormulario({ ...f, email: "maria@" }, "2026-09-23")).toMatch(/e-mail/);
    expect(erroDoFormulario({ ...f, email: "maria@x.com" }, "2026-09-23")).toBe("");
  });
  it("as duas portas usam a mesma trava no banco", () => {
    const sql = readFileSync(new URL("../../supabase-migracao-cadastro-link.sql", import.meta.url), "utf8");
    expect(sql.match(/r := _cliente_pelo_link\(/g)?.length).toBe(2);
    expect(sql).toMatch(/revoke all on function _cliente_pelo_link[^;]*anon/);
  });
});
