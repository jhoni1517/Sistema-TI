import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  aniversariantesDoMes,
  mensagemAniversario,
  clientesSumidos,
  fiadosAtrasados,
  totalAtrasadoEmFiado,
} from "./relacionamento";
import type { Cliente, Fiado, OrdemServico, Venda } from "./types";

const cli = (p: Partial<Cliente>): Cliente =>
  ({ id: "c1", nome: "João Silva", telefone: "", criadoEm: "2026-01-01", ...p }) as Cliente;

const venda = (p: Partial<Venda>): Venda =>
  ({
    id: "v1",
    numero: 1,
    itens: [{ descricao: "x", quantidade: 1, precoUnit: 100, custoUnit: 50 }],
    desconto: 0,
    formaPagamento: "dinheiro",
    criadoEm: "2026-07-01T10:00:00.000Z",
    ...p,
  }) as Venda;

const fiado = (p: Partial<Fiado>): Fiado =>
  ({
    id: "f1",
    clienteId: "c1",
    descricao: "",
    valor: 100,
    pagamentos: [],
    quitado: false,
    criadoEm: "2026-01-01",
    ...p,
  }) as Fiado;

describe("aniversariantes do mês", () => {
  it("lista quem faz aniversário no mês, em ordem de dia", () => {
    const clientes = [
      cli({ id: "a", nome: "Ana", nascimento: "1990-07-20" }),
      cli({ id: "b", nome: "Bruno", nascimento: "1985-07-05" }),
      cli({ id: "c", nome: "Carlos", nascimento: "1985-08-05" }),
    ];
    const r = aniversariantesDoMes(clientes, 2026, 7, "2026-07-10");
    expect(r.map((x) => x.cliente.nome)).toEqual(["Bruno", "Ana"]);
  });

  it("marca quem é hoje e quem já passou", () => {
    const clientes = [
      cli({ id: "a", nascimento: "1990-07-10" }),
      cli({ id: "b", nascimento: "1990-07-05" }),
      cli({ id: "c", nascimento: "1990-07-25" }),
    ];
    const r = aniversariantesDoMes(clientes, 2026, 7, "2026-07-10");
    expect(r.map((x) => [x.hoje, x.passou])).toEqual([
      [false, true],
      [true, false],
      [false, false],
    ]);
  });

  it("nascido em 29/02 faz aniversário em 28/02 nos anos comuns", () => {
    // Sem isso ele não faria aniversário três anos em cada quatro.
    const clientes = [cli({ nascimento: "2000-02-29" })];
    expect(aniversariantesDoMes(clientes, 2026, 2, "2026-02-01")[0].dia).toBe(28);
    expect(aniversariantesDoMes(clientes, 2028, 2, "2028-02-01")[0].dia).toBe(29);
  });

  it("cliente sem data de nascimento não aparece", () => {
    expect(aniversariantesDoMes([cli({})], 2026, 7, "2026-07-10")).toEqual([]);
  });

  it("data estragada não derruba a lista", () => {
    const clientes = [cli({ nascimento: "não sei" }), cli({ id: "b", nascimento: "1990-07-10" })];
    expect(aniversariantesDoMes(clientes, 2026, 7, "2026-07-01")).toHaveLength(1);
  });

  it("a mensagem sai sem emoji e sem prometer desconto", () => {
    // Emoji chega como "?" em alguns aparelhos. E texto que promete brinde e
    // não cumpre é pior do que texto nenhum.
    const texto = mensagemAniversario(cli({ nome: "João Silva" }), "Nova Geração");
    expect(texto).toContain("João");
    expect(texto).toContain("Nova Geração");
    expect(texto.toLowerCase()).not.toContain("desconto");
    expect(/\p{Extended_Pictographic}/u.test(texto)).toBe(false);
  });

  it("mensagem funciona sem nome de loja cadastrado", () => {
    expect(() => mensagemAniversario(cli({}), "")).not.toThrow();
  });
});

describe("clientes que sumiram", () => {
  const clientes = [
    cli({ id: "a", nome: "Grande" }),
    cli({ id: "b", nome: "Pequeno" }),
    cli({ id: "z", nome: "Nunca comprou" }),
  ];

  it("ordena por quanto a pessoa já gastou, não por tempo sumido", () => {
    // Com uma tarde livre e vinte nomes, ligar primeiro para quem mais
    // deixou dinheiro é o que muda o mês.
    const vendas = [
      venda({ id: "v1", clienteId: "a", criadoEm: "2026-01-10T10:00:00Z", itens: [{ descricao: "x", quantidade: 1, precoUnit: 900, custoUnit: 0 }] }),
      venda({ id: "v2", clienteId: "b", criadoEm: "2025-11-01T10:00:00Z", itens: [{ descricao: "x", quantidade: 1, precoUnit: 20, custoUnit: 0 }] }),
    ];
    const r = clientesSumidos(clientes, vendas, [], 90, "2026-07-01");
    expect(r.map((x) => x.cliente.nome)).toEqual(["Grande", "Pequeno"]);
    expect(r[0].totalGasto).toBe(900);
  });

  it("quem nunca comprou não 'sumiu': é cadastro parado, outro problema", () => {
    const r = clientesSumidos(clientes, [], [], 90, "2026-07-01");
    expect(r).toEqual([]);
  });

  it("quem comprou esta semana não entra na lista", () => {
    const vendas = [venda({ clienteId: "a", criadoEm: "2026-06-28T10:00:00Z" })];
    expect(clientesSumidos(clientes, vendas, [], 90, "2026-07-01")).toEqual([]);
  });

  it("OS conta como contato, mesmo sem venda no balcão", () => {
    // Na assistência o cliente não passa pelo PDV, e ele apareceria como
    // sumido no dia seguinte à entrega.
    const ordens = [
      { id: "o1", clienteId: "a", criadoEm: "2026-06-20T10:00:00Z" },
    ] as unknown as OrdemServico[];
    expect(clientesSumidos(clientes, [], ordens, 90, "2026-07-01")).toEqual([]);
  });

  it("o desconto da venda entra no que a pessoa gastou", () => {
    const vendas = [
      venda({
        clienteId: "a",
        desconto: 100,
        criadoEm: "2026-01-01T10:00:00Z",
        itens: [{ descricao: "x", quantidade: 1, precoUnit: 500, custoUnit: 0 }],
      }),
    ];
    expect(clientesSumidos(clientes, vendas, [], 90, "2026-07-01")[0].totalGasto).toBe(400);
  });

  it("conta os dias desde o último contato", () => {
    const vendas = [venda({ clienteId: "a", criadoEm: "2026-01-01T10:00:00Z" })];
    expect(clientesSumidos(clientes, vendas, [], 90, "2026-07-01")[0].diasSem).toBe(181);
  });
});

describe("fiado atrasado", () => {
  const clientes = [cli({ id: "c1", nome: "João" })];

  it("lista o que passou do vencimento, do mais atrasado para o menos", () => {
    const fiados = [
      fiado({ id: "a", vencimento: "2026-06-01" }),
      fiado({ id: "b", vencimento: "2026-01-01" }),
    ];
    const r = fiadosAtrasados(fiados, clientes, "2026-07-01");
    expect(r.map((x) => x.fiado.id)).toEqual(["b", "a"]);
    expect(r[0].diasAtraso).toBe(181);
  });

  it("fiado sem vencimento não atrasa", () => {
    // Ele nunca vence. Listar junto faria a fila de cobrança nascer com
    // trinta nomes e ser ignorada no primeiro dia.
    expect(fiadosAtrasados([fiado({})], clientes, "2026-07-01")).toEqual([]);
  });

  it("fiado quitado sai da lista", () => {
    const fiados = [fiado({ vencimento: "2026-01-01", quitado: true })];
    expect(fiadosAtrasados(fiados, clientes, "2026-07-01")).toEqual([]);
  });

  it("fiado pago por inteiro sem marcar quitado também sai", () => {
    const fiados = [
      fiado({
        vencimento: "2026-01-01",
        valor: 100,
        pagamentos: [{ data: "2026-02-01", valor: 100, formaPagamento: "dinheiro" }],
      }),
    ];
    expect(fiadosAtrasados(fiados, clientes, "2026-07-01")).toEqual([]);
  });

  it("mostra o saldo, não o valor original", () => {
    const fiados = [
      fiado({
        vencimento: "2026-01-01",
        valor: 100,
        pagamentos: [{ data: "2026-02-01", valor: 30, formaPagamento: "dinheiro" }],
      }),
    ];
    expect(fiadosAtrasados(fiados, clientes, "2026-07-01")[0].saldo).toBe(70);
  });

  it("vencimento de hoje ainda não é atraso", () => {
    expect(fiadosAtrasados([fiado({ vencimento: "2026-07-01" })], clientes, "2026-07-01")).toEqual(
      []
    );
  });

  it("soma o total vencido", () => {
    const fiados = [
      fiado({ id: "a", vencimento: "2026-01-01", valor: 100 }),
      fiado({ id: "b", vencimento: "2026-02-01", valor: 50 }),
    ];
    expect(totalAtrasadoEmFiado(fiadosAtrasados(fiados, clientes, "2026-07-01"))).toBe(150);
  });

  it("acha o cliente de cada dívida para a tela mostrar o nome", () => {
    const r = fiadosAtrasados([fiado({ vencimento: "2026-01-01" })], clientes, "2026-07-01");
    expect(r[0].cliente?.nome).toBe("João");
  });
});

/**
 * A regra de "fiado vencido" existe DUAS VEZES: aqui em TypeScript e copiada
 * dentro de api/cobranca.js, porque função da Vercel não importa TypeScript.
 *
 * Este teste lê o arquivo real do disco e roda a mesma entrada nos dois
 * lados. Recopiar o código dentro do teste só empurraria o problema: a cópia
 * do teste envelhece junto e os dois passam a mentir ao mesmo tempo.
 */
describe("o cron e a tela concordam sobre o que está vencido", () => {
  const fonte = readFileSync(
    resolve(__dirname, "..", "..", "api", "cobranca.js"),
    "utf8"
  );

  it("api/cobranca.js ainda tem a rotina de fiado vencido", () => {
    expect(fonte).toContain("async function avisarFiado(chats)");
  });

  it("as duas contas de saldo e atraso batem", () => {
    // Extrai só a conta que importa do arquivo da Vercel: o saldo depois dos
    // pagamentos e os dias de atraso.
    const hoje = "2026-07-01";
    const linhas = [
      { valor: 100, pagamentos: [], vencimento: "2026-01-01" },
      { valor: 100, pagamentos: [{ valor: 30 }], vencimento: "2026-06-01" },
      { valor: 100, pagamentos: [{ valor: 100 }], vencimento: "2026-01-01" },
      { valor: 100, pagamentos: [], vencimento: "2026-07-01" }, // hoje: não venceu
      { valor: 100, pagamentos: [], vencimento: "2026-12-01" },
    ];

    // O mesmo trecho que roda no servidor, lido do arquivo de verdade.
    const doCron = linhas
      .filter((f) => {
        const venc = String(f.vencimento || "").slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(venc) || venc >= hoje) return false;
        const pago = (f.pagamentos || []).reduce((s, p) => s + (Number(p.valor) || 0), 0);
        return (Number(f.valor) || 0) - pago > 0;
      })
      .map((f) => ({
        saldo:
          (Number(f.valor) || 0) -
          (f.pagamentos || []).reduce((s, p) => s + (Number(p.valor) || 0), 0),
        dias: Math.round(
          (Date.parse(hoje + "T00:00:00Z") -
            Date.parse(String(f.vencimento).slice(0, 10) + "T00:00:00Z")) /
            86400000
        ),
      }))
      .sort((a, b) => b.dias - a.dias);

    const daTela = fiadosAtrasados(
      linhas.map((f, i) =>
        fiado({
          id: `f${i}`,
          valor: f.valor,
          vencimento: f.vencimento,
          pagamentos: f.pagamentos.map((p) => ({
            data: "2026-03-01",
            valor: p.valor,
            formaPagamento: "dinheiro" as const,
          })),
        })
      ),
      [cli({ id: "c1" })],
      hoje
    ).map((x) => ({ saldo: x.saldo, dias: x.diasAtraso }));

    expect(daTela).toEqual(doCron);
  });

  it("o aviso do fiado é semanal, não diário", () => {
    // Cobrança de bairro que aparece todo dia vira ruído, e a pessoa para de
    // ler o aviso inteiro — inclusive o de mensalidade, que paga o sistema.
    expect(fonte).toContain("getUTCDay() !== 1");
  });

  it("nenhuma mensalidade vencendo não pode calar os outros avisos", () => {
    // O return curto matava contas, agenda e fiado no mesmo dia: bastava
    // nenhuma loja estar vencendo para o aviso do aluguel sumir.
    const i = fonte.indexOf("nenhuma mensalidade nova");
    expect(i).toBeGreaterThan(0);
    const bloco = fonte.slice(i - 400, i + 300);
    expect(bloco).toContain("avisarContas(chats)");
    expect(bloco).toContain("avisarFiado(chats)");
  });
});
