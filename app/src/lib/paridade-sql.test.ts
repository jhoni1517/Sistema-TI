import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { precoEfetivo } from "./promocao";
import { totalOS } from "./calc";
import { pecasEfetivas } from "./orcamento";
import { TETO_CATALOGO } from "./catalogo";
import type { OrdemServico, PecaOS, Produto } from "./types";

/**
 * ============================================================
 *  A MESMA CONTA, NOS DOIS LADOS, DÁ O MESMO NÚMERO?
 * ============================================================
 *
 * Duas regras do sistema existem DUAS VEZES de propósito, porque a página
 * pública calcula sozinha no banco e não pode chamar o TypeScript:
 *
 *   preço com promoção .... lib/promocao.ts  e  catalogo_loja()
 *   total do orçamento .... lib/orcamento.ts e  consultar_os()
 *
 * O CLAUDE.md diz por que isso é perigoso: "duas regras diferentes
 * mostrariam dois valores para o mesmo orçamento", e "tela que lê
 * produto.preco direto faz a gôndola dizer um valor e o caixa cobrar outro —
 * e quem aparece como mentiroso é a loja, não o sistema".
 *
 * Só que até aqui ninguém tinha CONFERIDO se os dois lados concordam. Havia
 * teste para cada um separado, e nenhum comparando os dois com o mesmo dado.
 *
 * Este arquivo compara: sorteia centenas de produtos e ordens, joga no
 * Postgres de verdade, chama a função SQL, e confronta cada centavo com o
 * que o TypeScript devolve para a mesma linha.
 *
 * ------------------------------------------------------------
 * PRECISA DE POSTGRES, E POR ISSO SE AUTODISPENSA
 *
 * Sem `psql` na máquina (é o caso do CI e do computador do balcão) o teste
 * PULA em vez de reprovar. Teste que quebra por falta de ferramenta ensina
 * a ignorar teste quebrado, que é o começo de ignorar todos.
 *
 * Para rodar de verdade: `bash scripts/banco-de-teste.sh` sobe o banco e
 * imprime a variável a exportar.
 * ------------------------------------------------------------
 */

const URL_TESTE = process.env.PARIDADE_PG;

const rodar = (sql: string): string => {
  const dir = mkdtempSync(join(tmpdir(), "paridade-"));
  const arquivo = join(dir, "consulta.sql");
  writeFileSync(arquivo, sql);
  chmodSync(dir, 0o777);
  chmodSync(arquivo, 0o666);
  return execFileSync("psql", [URL_TESTE!, "-tA", "-f", arquivo], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
};

function semente(s: number) {
  let x = s >>> 0 || 1;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
}

const LOJA = "11111111-1111-1111-1111-111111111111";
const HOJE = new Date().toISOString().slice(0, 10);
const dia = (offset: number): string =>
  new Date(Date.parse(HOJE + "T00:00:00Z") + offset * 86400000).toISOString().slice(0, 10);

const aspas = (v: string | undefined | null): string =>
  v === undefined || v === null ? "null" : `'${String(v).replace(/'/g, "''")}'`;

const suite = URL_TESTE ? describe : describe.skip;

suite("o preço da vitrine é o mesmo que o do caixa", () => {
  it("promoção: TypeScript e SQL concordam em 250 produtos sorteados", () => {
    /*
     * Os casos que separam as duas implementações são as BORDAS da data e
     * da comparação: promoção que começa hoje, que termina hoje, que já
     * venceu, que é mais CARA que o preço cheio (não vale), e a que tem
     * data vazia em vez de nula — que é como o campo volta da nuvem quando
     * alguém apagou o conteúdo em vez de limpar.
     */
    /*
     * 250 e não 600: a função tem `limit 300` de propósito, e passar do teto
     * faria este teste medir o corte em vez da regra de preço. O teto tem
     * teste próprio logo abaixo.
     */
    const r = semente(20260827);
    const produtos: Produto[] = [];
    for (let i = 0; i < 250; i++) {
      const preco = Math.round((1 + r() * 5000) * 100) / 100;
      const temPromo = r() < 0.75;
      // Metade das promoções é MAIS CARA de propósito: ela não pode valer.
      const promo = temPromo
        ? Math.round((r() < 0.5 ? preco * r() : preco * (1 + r())) * 100) / 100
        : undefined;
      const inicios = [undefined, "", dia(-30), dia(0), dia(1), dia(-1)];
      const fins = [undefined, "", dia(30), dia(0), dia(-1), dia(1)];
      produtos.push({
        id: `pp${i}`,
        nome: `Produto ${i}`,
        preco,
        custo: 1,
        quantidade: 5,
        precoPromocional: promo,
        promocaoInicio: inicios[Math.floor(r() * inicios.length)],
        promocaoFim: fins[Math.floor(r() * fins.length)],
      } as unknown as Produto);
    }

    const linhas = produtos
      .map(
        (p) =>
          `('${p.id}', ${aspas(p.nome)}, 'Cat', 5, 1, ${p.preco}, '${LOJA}', ` +
          `${p.precoPromocional ?? "null"}, ${aspas(p.promocaoInicio)}, ${aspas(p.promocaoFim)})`
      )
      .join(",\n");

    const saida = rodar(`
      delete from produtos where "lojaId" = '${LOJA}';
      insert into lojas (id, nome, ativa, catalogo_ativo)
      values ('${LOJA}', 'Loja Paridade', true, true)
      on conflict (id) do update set catalogo_ativo = true, ativa = true, bloqueada = false;
      insert into produtos (id, nome, categoria, quantidade, custo, preco, "lojaId",
                            "precoPromocional", "promocaoInicio", "promocaoFim")
      values ${linhas};
      select itens from catalogo_loja('${LOJA}');
    `);

    const doBanco = JSON.parse(saida.trim().split("\n").pop()!) as {
      nome: string;
      preco: number;
      preco_de: number | null;
    }[];

    expect(doBanco.length, "o catálogo não devolveu os produtos").toBe(produtos.length);

    const porNome = new Map(doBanco.map((x) => [x.nome, x]));
    const divergentes: string[] = [];

    for (const p of produtos) {
      const sql = porNome.get(p.nome)!;
      const ts = precoEfetivo(p, HOJE);
      if (Math.abs(Number(sql.preco) - ts) > 0.001) {
        divergentes.push(
          `${p.nome}: SQL cobra ${sql.preco} e o caixa cobra ${ts} ` +
            `(cheio ${p.preco}, promo ${p.precoPromocional}, ` +
            `de ${p.promocaoInicio ?? "-"} até ${p.promocaoFim ?? "-"})`
        );
      }
      // E o "de" riscado só aparece quando a promoção realmente valeu.
      const riscadoEsperado = ts < Number(p.preco) - 0.001 ? Number(p.preco) : null;
      const riscadoSql = sql.preco_de === null ? null : Number(sql.preco_de);
      if (riscadoEsperado !== riscadoSql) {
        divergentes.push(
          `${p.nome}: preço riscado SQL=${riscadoSql} esperado=${riscadoEsperado}`
        );
      }
    }

    expect(divergentes, divergentes.slice(0, 10).join("\n")).toEqual([]);
  });

  it("a vitrine corta em 300 produtos, e o corte é SILENCIOSO", () => {
    /*
     * Descoberto medindo: a loja com 400 produtos publica 300 e os outros
     * 100 não existem para quem abre o link — sem aviso nenhum, nem para o
     * dono nem para o cliente.
     *
     * O teto em si é defensável (a página tem que abrir no 4G do balcão).
     * O que este teste prende é o NÚMERO: quem mexer nele mexe no que a
     * loja publica, e precisa mexer também no aviso da tela de
     * Configurações, que é onde o dono descobre que tem produto de fora.
     */
    const linhas = Array.from(
      { length: 340 },
      (_, i) => `('teto${i}', 'Teto ${i}', 'Cat', 5, 1, 10, '${LOJA}')`
    ).join(",");

    const saida = rodar(`
      delete from produtos where "lojaId" = '${LOJA}';
      insert into lojas (id, nome, ativa, catalogo_ativo)
      values ('${LOJA}', 'Loja Paridade', true, true)
      on conflict (id) do update set catalogo_ativo = true, ativa = true, bloqueada = false;
      insert into produtos (id, nome, categoria, quantidade, custo, preco, "lojaId")
      values ${linhas};
      select jsonb_array_length(itens) from catalogo_loja('${LOJA}');
    `);

    expect(Number(saida.trim().split("\n").pop())).toBe(TETO_CATALOGO);
  });
});

suite("o total que o cliente vê no link é o que a loja vai cobrar", () => {
  it("orçamento com opções: TypeScript e SQL concordam em 400 ordens sorteadas", () => {
    /*
     * O bug de origem: "fonte de 500W mais SSD" contra "só a fonte de
     * 200W" ia tudo na mesma lista e o sistema SOMAVA tudo — o cliente
     * recebia um orçamento cobrando as duas fontes.
     *
     * A regra vive nos dois lados, e a página pública calcula sozinha. Se
     * o SQL escolher outro cenário que o TypeScript, o cliente aprova um
     * valor no link e recebe outro no balcão.
     */
    const r = semente(31337);
    const OPCOES = ["", "", "Opção 1", "Opção 2", "Completo"];
    const ordens: OrdemServico[] = [];

    for (let i = 0; i < 400; i++) {
      const pecas: PecaOS[] = Array.from({ length: Math.floor(r() * 6) }, (_, k) => ({
        descricao: `peça ${k}`,
        quantidade: 1 + Math.floor(r() * 3),
        custoUnit: Math.round(r() * 20000) / 100,
        precoUnit: Math.round(r() * 90000) / 100,
        opcao: OPCOES[Math.floor(r() * OPCOES.length)],
      }));
      const nomes = [...new Set(pecas.map((p) => (p.opcao || "").trim()).filter(Boolean))];
      // Um terço com escolha registrada, um terço sem, um terço com escolha
      // INVÁLIDA — que tem que cair na sugestão da loja nos dois lados.
      const sorteio = r();
      const escolhida =
        sorteio < 0.33 && nomes.length
          ? nomes[Math.floor(r() * nomes.length)]
          : sorteio < 0.66
            ? undefined
            : "cenário que não existe";

      ordens.push({
        id: `oo${i}`,
        numero: 5000 + i,
        clienteId: "cpar",
        tipoAparelho: "Celular",
        marca: "M",
        modelo: "X",
        defeitoRelatado: "d",
        checklist: {},
        pecas,
        opcaoEscolhida: escolhida,
        maoDeObra: Math.round(r() * 50000) / 100,
        desconto: r() < 0.3 ? Math.round(r() * 20000) / 100 : 0,
        status: r() < 0.5 ? "pronta" : "aguardando_aprovacao",
        garantiaDias: 90,
        historico: [],
        criadoEm: "2026-01-10T10:00:00.000Z",
        atualizadoEm: "2026-01-10T10:00:00.000Z",
      } as unknown as OrdemServico);
    }

    const linhas = ordens
      .map(
        (o) =>
          `('${o.id}', ${o.numero}, 'cpar', 'Celular', 'M', 'X', 'd', ` +
          `'${JSON.stringify(o.pecas).replace(/'/g, "''")}'::jsonb, ` +
          `${aspas(o.opcaoEscolhida)}, ${o.maoDeObra}, ${o.desconto}, ${aspas(o.status)}, 90, ` +
          `'${LOJA}', now()::text, now()::text)`
      )
      .join(",\n");

    const saida = rodar(`
      delete from ordens where "lojaId" = '${LOJA}';
      insert into clientes (id, nome, telefone, "lojaId", "criadoEm")
      values ('cpar', 'Cliente Paridade', '41999999999', '${LOJA}', now()::text)
      on conflict (id) do nothing;
      insert into ordens (id, numero, "clienteId", "tipoAparelho", marca, modelo,
                          "defeitoRelatado", pecas, "opcaoEscolhida", "maoDeObra", desconto,
                          status, "garantiaDias", "lojaId", "criadoEm", "atualizadoEm")
      values ${linhas};
      select json_agg(json_build_object('id', o.id, 'total', c.total))
        from ordens o
        cross join lateral consultar_os('${LOJA}', o.numero, o.rastreio) c
       where o."lojaId" = '${LOJA}';
    `);

    const doBanco = JSON.parse(saida.trim().split("\n").pop()!) as {
      id: string;
      total: number;
    }[];

    expect(doBanco.length, "o rastreio não devolveu as ordens").toBe(ordens.length);

    const porId = new Map(doBanco.map((x) => [x.id, Number(x.total)]));
    const divergentes: string[] = [];

    for (const o of ordens) {
      const sql = porId.get(o.id)!;
      const ts = Math.round(totalOS(o) * 100) / 100;
      if (Math.abs(sql - ts) > 0.001) {
        divergentes.push(
          `${o.id}: link mostra ${sql} e a loja cobra ${ts} ` +
            `(escolha ${o.opcaoEscolhida ?? "nenhuma"}, ` +
            `${pecasEfetivas(o).length} de ${o.pecas.length} peças)`
        );
      }
    }

    expect(divergentes, divergentes.slice(0, 10).join("\n")).toEqual([]);
  });
});

suite("o preço que o cliente lê fecha com a lista que ele vê", () => {
  it("a soma dos itens de cada opção é o total daquela opção", () => {
    /*
     * Relatado do balcão, na OS00033: "coloquei a bateria nos dois
     * orçamentos e não apareceu pro cliente". A página mostrava "Opção 1,
     * R$ 730,00" com uma peça de R$ 480 embaixo — os R$ 250 da bateria
     * entravam na conta e sumiam da lista.
     *
     * Preço que não fecha com a lista faz a loja parecer que está inflando
     * o orçamento, e a página promete com todas as letras que cada opção JÁ
     * É o valor do serviço completo.
     *
     * O sorteio inclui mão de obra e desconto de propósito: os dois moram na
     * `base` do SQL, que é exatamente o pedaço que não aparecia.
     */
    const r = semente(908070);
    const ordens: string[] = [];
    const esperado: { numero: number; opcoes: number }[] = [];

    for (let i = 0; i < 120; i++) {
      const numero = 9000 + i;
      const comuns = Math.floor(r() * 3);
      const pecas: Record<string, unknown>[] = [];
      for (let k = 0; k < comuns; k++) {
        pecas.push({
          descricao: `Comum ${k}`,
          quantidade: 1 + Math.floor(r() * 3),
          custoUnit: 1,
          precoUnit: Math.round(r() * 30000) / 100,
        });
      }
      const quantasOpcoes = 2 + Math.floor(r() * 2);
      for (let o = 1; o <= quantasOpcoes; o++) {
        for (let k = 0; k < 1 + Math.floor(r() * 3); k++) {
          pecas.push({
            descricao: `Peça ${o}-${k}`,
            quantidade: 1 + Math.floor(r() * 3),
            custoUnit: 1,
            precoUnit: Math.round(r() * 60000) / 100,
            opcao: `Opção ${o}`,
          });
        }
      }
      const mao = r() < 0.6 ? Math.round(r() * 40000) / 100 : 0;
      const desc = r() < 0.3 ? Math.round(r() * 5000) / 100 : 0;

      ordens.push(
        `('oc${i}', ${numero}, 'cpar', 'Notebook', 'D', 'x', 'd', ` +
          `'${JSON.stringify(pecas).replace(/'/g, "''")}'::jsonb, ${mao}, ${desc}, ` +
          `'aguardando_aprovacao', 90, '${LOJA}', now()::text, now()::text)`
      );
      esperado.push({ numero, opcoes: quantasOpcoes });
    }

    const saida = rodar(`
      delete from ordens where "lojaId" = '${LOJA}';
      insert into clientes (id, nome, telefone, "lojaId", "criadoEm")
      values ('cpar', 'Cliente Paridade', '41999999999', '${LOJA}', now()::text)
      on conflict (id) do nothing;
      insert into ordens (id, numero, "clienteId", "tipoAparelho", marca, modelo,
                          "defeitoRelatado", pecas, "maoDeObra", desconto,
                          status, "garantiaDias", "lojaId", "criadoEm", "atualizadoEm")
      values ${ordens.join(",\n")};
      select json_agg(json_build_object(
               'numero', o.numero,
               'opcao', x->>'nome',
               'total', (x->>'total')::numeric,
               'soma', (select coalesce(sum((i->>'valor')::numeric), 0)
                          from jsonb_array_elements(x->'itens') i)
             ))
        from ordens o
        cross join lateral consultar_os('${LOJA}', o.numero, o.rastreio) c
        cross join lateral jsonb_array_elements(c.opcoes) x
       where o."lojaId" = '${LOJA}';
    `);

    const linhas = JSON.parse(saida.trim().split("\n").pop()!) as {
      numero: number;
      opcao: string;
      total: number;
      soma: number;
    }[];

    // Toda opção de toda OS foi conferida — sem isto o teste passaria vazio.
    expect(linhas.length).toBe(esperado.reduce((s, x) => s + x.opcoes, 0));

    const divergentes = linhas
      .filter((l) => Math.abs(Number(l.total) - Number(l.soma)) > 0.001)
      .map(
        (l) =>
          `OS ${l.numero} ${l.opcao}: a página cobra ${l.total} e lista ${l.soma}`
      );
    expect(divergentes, divergentes.slice(0, 10).join("\n")).toEqual([]);
  });
});
