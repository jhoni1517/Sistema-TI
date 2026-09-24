import type {
  Cliente,
  OrdemServico,
  OSStatus,
  Produto,
  MovimentoCaixa,
  SessaoCaixa,
  Venda,
  ItemVenda,
  FormaPagamento,
  PecaOS,
} from "./types";
import { tabelaVazia, type TabelaServicos } from "./tabela-precos";
import { codigoOS } from "./format";

/**
 * A loja de exemplo do "Ver o sistema funcionando".
 *
 * Quem está decidindo se aluga o sistema quer ver a loja DELE rodando, não
 * uma tela vazia pedindo cadastro. Os dados nascem aqui, ficam só na
 * memória (ver `entrarDemo` em lib/db.ts) e somem ao sair: nada disso
 * chega perto do Supabase.
 *
 * O sorteio tem semente fixa. Os números da demonstração são sempre os
 * mesmos, então dá para testar a conta e dá para o vendedor decorar o
 * roteiro ("olha a OS 1023, está esperando peça").
 */

export const LOJA_DEMO = "demo";

export interface DadosDemo {
  clientes: Cliente[];
  ordens: OrdemServico[];
  produtos: Produto[];
  movimentos: MovimentoCaixa[];
  sessoes: SessaoCaixa[];
  vendas: Venda[];
  config: Record<string, unknown>;
}

/** Sorteio com semente (mulberry32): mesma semente, mesma loja */
function sorteador(semente: number) {
  let s = semente >>> 0;
  const r = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(r() * (max - min + 1));
  const um = <T,>(lista: readonly T[]): T => lista[Math.floor(r() * lista.length)];
  return { r, int, um };
}

const NOMES = [
  "Ana", "Bruno", "Carla", "Diego", "Eduarda", "Fábio", "Gabriela", "Henrique",
  "Isabela", "João", "Karina", "Lucas", "Mariana", "Nelson", "Olívia", "Paulo",
  "Queila", "Rafael", "Sabrina", "Tiago", "Úrsula", "Vinícius", "Wesley", "Yasmin",
  "Zeca", "Patrícia", "Marcos", "Renata", "Sérgio", "Luana",
];
const SOBRENOMES = [
  "Silva", "Santos", "Oliveira", "Souza", "Lima", "Pereira", "Costa", "Almeida",
  "Ribeiro", "Carvalho", "Gomes", "Martins", "Rocha", "Barbosa",
];

/** [nome, custo, preço, categoria] — peças e acessórios de balcão */
const CATALOGO: [string, number, number, string][] = [
  ["Tela iPhone 11", 180, 390, "Telas"],
  ["Tela iPhone 12", 260, 520, "Telas"],
  ["Tela iPhone 13", 340, 690, "Telas"],
  ["Tela Samsung A12", 95, 220, "Telas"],
  ["Tela Samsung A32", 140, 290, "Telas"],
  ["Tela Samsung A54", 210, 430, "Telas"],
  ["Tela Moto G22", 90, 210, "Telas"],
  ["Tela Moto G52", 150, 320, "Telas"],
  ["Tela Redmi Note 11", 120, 260, "Telas"],
  ["Tela Redmi Note 12", 135, 280, "Telas"],
  ["Bateria iPhone 11", 70, 180, "Baterias"],
  ["Bateria iPhone 12", 85, 210, "Baterias"],
  ["Bateria Samsung A12", 40, 120, "Baterias"],
  ["Bateria Samsung A32", 48, 130, "Baterias"],
  ["Bateria Moto G22", 38, 110, "Baterias"],
  ["Bateria Redmi Note 11", 42, 120, "Baterias"],
  ["Bateria notebook Dell Inspiron", 160, 340, "Baterias"],
  ["Bateria notebook Lenovo Ideapad", 150, 320, "Baterias"],
  ["Conector de carga tipo C", 8, 90, "Peças"],
  ["Conector de carga Lightning", 15, 120, "Peças"],
  ["Alto-falante auricular", 12, 80, "Peças"],
  ["Câmera traseira Samsung A32", 60, 160, "Peças"],
  ["Tampa traseira iPhone 11", 45, 150, "Peças"],
  ["Flex power/volume", 18, 90, "Peças"],
  ["SSD 240GB", 95, 190, "Informática"],
  ["SSD 480GB", 150, 290, "Informática"],
  ["SSD NVMe 512GB", 190, 360, "Informática"],
  ["Memória DDR4 8GB notebook", 85, 180, "Informática"],
  ["Memória DDR4 16GB notebook", 160, 320, "Informática"],
  ["Fonte ATX 500W", 170, 310, "Informática"],
  ["Teclado notebook Dell", 70, 180, "Informática"],
  ["Cooler notebook", 40, 120, "Informática"],
  ["Pasta térmica", 6, 25, "Informática"],
  ["Pendrive 32GB", 18, 39, "Acessórios"],
  ["Pendrive 64GB", 26, 55, "Acessórios"],
  ["Cartão de memória 64GB", 28, 59, "Acessórios"],
  ["Cabo USB-C 1m", 7, 29, "Acessórios"],
  ["Cabo USB-C 2m", 10, 39, "Acessórios"],
  ["Cabo Lightning 1m", 9, 35, "Acessórios"],
  ["Cabo micro USB", 5, 20, "Acessórios"],
  ["Carregador 20W USB-C", 28, 79, "Acessórios"],
  ["Carregador turbo 33W", 32, 89, "Acessórios"],
  ["Carregador veicular", 14, 45, "Acessórios"],
  ["Fone com fio P2", 9, 29, "Acessórios"],
  ["Fone Bluetooth", 45, 119, "Acessórios"],
  ["Caixinha de som Bluetooth", 55, 139, "Acessórios"],
  ["Suporte veicular", 15, 45, "Acessórios"],
  ["Power bank 10000mAh", 55, 129, "Acessórios"],
  ["Mouse sem fio", 22, 59, "Acessórios"],
  ["Teclado USB", 28, 69, "Acessórios"],
  ["Mouse pad", 6, 19, "Acessórios"],
  ["Hub USB 4 portas", 22, 59, "Acessórios"],
  ["Adaptador HDMI", 18, 49, "Acessórios"],
  ["Película de vidro iPhone 11", 3, 30, "Películas"],
  ["Película de vidro iPhone 12", 3, 30, "Películas"],
  ["Película de vidro iPhone 13", 3, 35, "Películas"],
  ["Película de vidro Samsung A12", 2.5, 25, "Películas"],
  ["Película de vidro Samsung A32", 2.5, 25, "Películas"],
  ["Película de vidro Samsung A54", 3, 30, "Películas"],
  ["Película de vidro Moto G22", 2.5, 25, "Películas"],
  ["Película de vidro Redmi Note 12", 2.5, 25, "Películas"],
  ["Película 3D privacidade", 6, 45, "Películas"],
  ["Capinha anti-impacto iPhone 11", 6, 35, "Capinhas"],
  ["Capinha anti-impacto iPhone 12", 6, 35, "Capinhas"],
  ["Capinha anti-impacto iPhone 13", 7, 39, "Capinhas"],
  ["Capinha anti-impacto Samsung A12", 5, 30, "Capinhas"],
  ["Capinha anti-impacto Samsung A32", 5, 30, "Capinhas"],
  ["Capinha anti-impacto Samsung A54", 6, 35, "Capinhas"],
  ["Capinha anti-impacto Moto G22", 5, 30, "Capinhas"],
  ["Capinha carteira Samsung", 9, 45, "Capinhas"],
  ["Capinha silicone iPhone", 8, 49, "Capinhas"],
  ["Chip pré-pago", 3, 10, "Acessórios"],
  ["Limpa telas", 4, 15, "Acessórios"],
  ["Carregador notebook universal", 55, 139, "Informática"],
];

/** Serviços: não têm estoque (Produto.servico) */
const SERVICOS: [string, number][] = [
  ["Formatação com backup", 150],
  ["Limpeza interna notebook", 120],
  ["Troca de tela (mão de obra)", 80],
  ["Desbloqueio de conta", 100],
  ["Instalação de programas", 60],
  ["Diagnóstico", 50],
];

const APARELHOS: [string, string, string][] = [
  ["Celular", "Samsung", "Galaxy A12"],
  ["Celular", "Samsung", "Galaxy A32"],
  ["Celular", "Samsung", "Galaxy A54"],
  ["Celular", "Apple", "iPhone 11"],
  ["Celular", "Apple", "iPhone 12"],
  ["Celular", "Apple", "iPhone 13"],
  ["Celular", "Motorola", "Moto G22"],
  ["Celular", "Motorola", "Moto G52"],
  ["Celular", "Xiaomi", "Redmi Note 11"],
  ["Celular", "Xiaomi", "Redmi Note 12"],
  ["Notebook", "Dell", "Inspiron 15"],
  ["Notebook", "Lenovo", "Ideapad 3"],
  ["Notebook", "Acer", "Aspire 5"],
  ["PC", "Montado", "Gabinete preto"],
  ["Tablet", "Samsung", "Galaxy Tab A7"],
];

const DEFEITOS: [string, string, string][] = [
  // [relatado, constatado, peça que resolve (trecho do nome)]
  ["Tela quebrada, não dá toque", "Display trincado com touch morto", "Tela"],
  ["Bateria acaba muito rápido", "Bateria com 68% de saúde", "Bateria"],
  ["Não carrega", "Conector de carga oxidado", "Conector"],
  ["Muito lento", "HD mecânico com setores ruins", "SSD"],
  ["Esquentando e desligando", "Cooler travado e pasta térmica seca", "Pasta"],
  ["Não liga", "Placa com curto na linha de carga", ""],
  ["Caiu na água", "Oxidação na placa, precisa limpeza", ""],
  ["Não ouço a pessoa na ligação", "Alto-falante auricular sem som", "Alto-falante"],
  ["Esqueceu a conta Google", "Aparelho preso na conta", ""],
  ["Teclado com teclas falhando", "Teclado com líquido derramado", "Teclado"],
];

/**
 * Quantas OS de cada etapa. Dá as 40 pedidas e mostra o sistema inteiro:
 * bancada cheia, orçamento esperando resposta, peça atrasada e histórico.
 */
const ETAPAS: [OSStatus, number][] = [
  // As antigas primeiro: numeração cresce com o tempo, como na loja real.
  ["entregue", 13],
  ["cancelada", 2],
  ["aberta", 4],
  ["em_analise", 4],
  ["aguardando_aprovacao", 4],
  ["aprovada", 2],
  ["em_reparo", 4],
  ["aguardando_peca", 3],
  ["pronta", 4],
];

const TECNICOS = ["Carlos", "Marina"];
const DIAS_DE_VENDA = 60;
const PRIMEIRA_OS = 1001;
const PRIMEIRA_VENDA = 501;

const dinheiro = (v: number) => Math.round(v * 100) / 100;

/** Meio-dia UTC de N dias atrás, com a hora mexida: nunca troca o dia */
function momento(hoje: Date, diasAtras: number, minutos: number): string {
  const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate(), 11, 0));
  d.setUTCDate(d.getUTCDate() - diasAtras);
  d.setUTCMinutes(d.getUTCMinutes() + minutos);
  return d.toISOString();
}

const telefone = (int: (a: number, b: number) => number) =>
  `119${int(1000, 9999)}${int(1000, 9999)}`;

export function gerarDemo(hoje: Date = new Date(), semente = 2024): DadosDemo {
  const { r, int, um } = sorteador(semente);

  // ---------- Clientes ----------
  const clientes: Cliente[] = NOMES.map((n, i) => ({
    id: `demo-cli-${i + 1}`,
    nome: `${n} ${SOBRENOMES[i % SOBRENOMES.length]}`,
    telefone: telefone(int),
    criadoEm: momento(hoje, int(10, 400), 0),
  }));

  // ---------- Produtos ----------
  const produtos: Produto[] = [
    ...CATALOGO.map(([nome, custo, preco, categoria], i): Produto => ({
      id: `demo-prod-${i + 1}`,
      nome,
      categoria,
      custo,
      preco,
      // Alguns zerados e alguns abaixo do mínimo: é o aviso de reposição
      // que o dono precisa ver funcionando.
      // Tela e bateria são caras e sob encomenda: loja de bairro tem poucas.
      quantidade:
        i % 11 === 0 ? 0 : i % 13 === 0 ? 1 : categoria === "Telas" || categoria === "Baterias" ? int(1, 4) : int(4, 25),
      estoqueMinimo: categoria === "Telas" || categoria === "Baterias" ? 1 : 3,
      codigoBarras: `789${String(1000000000 + i * 7919).slice(0, 10)}`,
      criadoEm: momento(hoje, 120, i),
    })),
    ...SERVICOS.map(([nome, preco], i): Produto => ({
      id: `demo-serv-${i + 1}`,
      nome,
      categoria: "Serviços",
      custo: 0,
      preco,
      quantidade: 0,
      estoqueMinimo: 0,
      servico: true,
      criadoEm: momento(hoje, 120, 100 + i),
    })),
  ];
  const vendaveis = produtos.filter((p) => !p.servico && p.categoria !== "Telas" && p.categoria !== "Baterias");

  const sessoes: SessaoCaixa[] = [];
  const movimentos: MovimentoCaixa[] = [];
  const vendas: Venda[] = [];

  // Um caixa por dia útil; o de hoje fica aberto, como numa loja de verdade.
  const sessaoDoDia = new Map<number, string>();
  for (let dia = DIAS_DE_VENDA - 1; dia >= 0; dia--) {
    const semana = new Date(momento(hoje, dia, 0)).getUTCDay();
    // Domingo fechado. Hoje abre sempre: a demonstração mostra caixa aberto.
    if (semana === 0 && dia > 0) continue;
    const id = `demo-sessao-${dia}`;
    sessaoDoDia.set(dia, id);
    sessoes.push({
      id,
      abertoEm: momento(hoje, dia, -150),
      fechadoEm: dia === 0 ? undefined : momento(hoje, dia, 450),
      valorAbertura: 100,
      valorContado: dia === 0 ? undefined : 0,
    });
  }
  const diaAberto = (dia: number) => {
    let d = dia;
    while (!sessaoDoDia.has(d) && d > 0) d--;
    return d;
  };

  // ---------- Ordens de serviço ----------
  const ordens: OrdemServico[] = [];
  let numero = PRIMEIRA_OS;
  for (const [status, quantas] of ETAPAS) {
    for (let k = 0; k < quantas; k++) {
      const ap = um(APARELHOS);
      const defeitos = DEFEITOS.filter(([, , peca]) =>
        ap[0] === "Celular" || ap[0] === "Tablet"
          ? !["SSD", "Pasta", "Teclado"].includes(peca)
          : !["Tela", "Conector", "Alto-falante"].includes(peca)
      );
      const [relatado, constatado, trecho] = um(defeitos);
      const cliente = um(clientes);
      const concluida = status === "entregue" || status === "cancelada";
      // Entregue é passado; o resto está na bancada há poucos dias.
      const diasAtras = concluida ? int(3, 55) : int(0, 9);
      const criadoEm = momento(hoje, diasAtras, int(0, 300));

      const pecas: PecaOS[] = [];
      if (trecho && status !== "aberta" && status !== "em_analise") {
        const modelo = ap[2].replace("Galaxy ", "");
        const peca =
          produtos.find((p) => p.nome.includes(trecho) && p.nome.includes(modelo)) ||
          produtos.find((p) => p.nome.includes(trecho));
        if (peca) {
          pecas.push({
            produtoId: peca.id,
            descricao: peca.nome,
            quantidade: 1,
            custoUnit: peca.custo,
            precoUnit: peca.preco,
          });
        }
      }
      const maoDeObra = status === "aberta" || status === "em_analise" ? 0 : um([60, 80, 100, 120, 150]);
      const historico = [{ data: criadoEm, status: "aberta" as OSStatus }];
      if (status !== "aberta") historico.push({ data: momento(hoje, diasAtras, 400), status });

      const os: OrdemServico = {
        id: `demo-os-${numero}`,
        numero,
        clienteId: cliente.id,
        tipoAparelho: ap[0],
        marca: ap[1],
        modelo: ap[2],
        defeitoRelatado: relatado,
        defeitoConstatado: status === "aberta" ? undefined : constatado,
        checklist: {},
        pecas,
        maoDeObra,
        desconto: 0,
        status,
        tecnico: um(TECNICOS),
        garantiaDias: 90,
        historico,
        rastreio: `demo${numero}`,
        criadoEm,
        atualizadoEm: momento(hoje, Math.max(0, diasAtras - 1), 0),
        previsaoEntrega: concluida ? undefined : momento(hoje, -int(1, 5), 0).slice(0, 10),
      };
      if (status === "pronta") os.prontaEm = momento(hoje, int(0, 3), 0);

      if (status === "entregue") {
        // Entrega só em dia de caixa aberto: domingo a loja não abre.
        const dia = diaAberto(Math.max(0, diasAtras - int(1, 3)));
        os.entregueEm = momento(hoje, dia, 200);
        const total = dinheiro(maoDeObra + pecas.reduce((s, p) => s + p.precoUnit * p.quantidade, 0));
        movimentos.push({
          id: `demo-mov-os-${numero}`,
          tipo: "entrada",
          categoria: "OS",
          descricao: `${codigoOS(numero)} - ${cliente.nome}`,
          valor: total,
          formaPagamento: um<FormaPagamento>(["pix", "pix", "dinheiro", "credito", "debito"]),
          osId: os.id,
          clienteId: cliente.id,
          custoRelacionado: pecas.reduce((s, p) => s + p.custoUnit * p.quantidade, 0),
          data: os.entregueEm,
          sessaoId: sessaoDoDia.get(dia),
        });
      }
      ordens.push(os);
      numero++;
    }
  }

  // ---------- Vendas de balcão ----------
  let numeroVenda = PRIMEIRA_VENDA;
  for (let dia = DIAS_DE_VENDA - 1; dia >= 0; dia--) {
    const sessaoId = sessaoDoDia.get(dia);
    if (!sessaoId) continue;
    const quantas = dia === 0 ? 3 : int(2, 6);
    for (let v = 0; v < quantas; v++) {
      const itens: ItemVenda[] = [];
      const linhas = r() < 0.7 ? 1 : 2;
      for (let l = 0; l < linhas; l++) {
        const p = um(vendaveis);
        if (itens.some((i) => i.produtoId === p.id)) continue;
        itens.push({
          produtoId: p.id,
          descricao: p.nome,
          quantidade: r() < 0.85 ? 1 : 2,
          precoUnit: p.preco,
          custoUnit: p.custo,
        });
      }
      const total = dinheiro(itens.reduce((s, i) => s + i.precoUnit * i.quantidade, 0));
      const forma = um<FormaPagamento>(["pix", "pix", "dinheiro", "dinheiro", "debito", "credito"]);
      const quando = momento(hoje, dia, int(0, 420));
      const movId = `demo-mov-v-${numeroVenda}`;
      movimentos.push({
        id: movId,
        tipo: "entrada",
        categoria: "Venda",
        descricao: `Venda ${numeroVenda} (${itens.length} item(ns))`,
        valor: total,
        formaPagamento: forma,
        custoRelacionado: dinheiro(itens.reduce((s, i) => s + i.custoUnit * i.quantidade, 0)),
        data: quando,
        sessaoId,
      });
      vendas.push({
        id: `demo-venda-${numeroVenda}`,
        numero: numeroVenda,
        itens,
        desconto: 0,
        formaPagamento: forma,
        valorRecebido: forma === "dinheiro" ? Math.ceil(total / 10) * 10 : undefined,
        movimentoId: movId,
        sessaoId,
        criadoEm: quando,
      });
      numeroVenda++;
    }
  }

  // Uma despesa por semana (motoboy, café, internet): sem isso o
  // relatório mostra lucro igual ao faturamento, que ninguém acredita.
  for (let dia = DIAS_DE_VENDA - 1; dia >= 0; dia -= 7) {
    const d = diaAberto(dia);
    const [descricao, valor] = um<[string, number]>([
      ["Motoboy peças", 35],
      ["Material de limpeza", 48],
      ["Café e água", 42],
      ["Internet da loja", 119],
    ]);
    movimentos.push({
      id: `demo-mov-desp-${dia}`,
      tipo: "saida",
      categoria: "Despesa",
      descricao,
      valor,
      formaPagamento: "dinheiro",
      data: momento(hoje, d, 300),
      sessaoId: sessaoDoDia.get(d),
    });
  }

  // O caixa fechado bate com a gaveta: a demonstração não acusa falta.
  for (const s of sessoes) {
    if (!s.fechadoEm) continue;
    const doDia = movimentos.filter((m) => m.sessaoId === s.id && m.formaPagamento === "dinheiro");
    const especie = doDia.reduce((t, m) => t + (m.tipo === "entrada" ? m.valor : -m.valor), 0);
    s.valorContado = dinheiro(s.valorAbertura + especie);
  }

  const config: Record<string, unknown> = {
    nomeLoja: "Assistência Exemplo",
    telefoneLoja: "11990000000",
    enderecoLoja: "Rua das Flores, 123 - Centro",
    horarioAtendimento: "Seg a sáb, 9h às 18h",
    ramo: "assistencia",
    tabelaServicos: tabelaDemo(),
  };

  return { clientes, ordens, produtos, movimentos, sessoes, vendas, config };
}

/** Recado de quem saiu da demonstração querendo a conta. Sem emoji. */
export const MENSAGEM_QUERO_CONTA =
  "Oi! Vi a loja de exemplo do Sistema TI e quero criar a conta da minha loja.";

/** A sessão de mentira da demonstração: dono, para ver todas as telas */
export const SESSAO_DEMO = {
  userId: "demo",
  email: "",
  perfil: { id: "demo", loja_id: LOJA_DEMO, nome: "Você", papel: "dono" as const, ativo: true },
};

/** Preços de mercado de 2026, redondos: a tabela mostra a busca "13 tela" funcionando. */
function tabelaDemo(): TabelaServicos {
  const precos: Record<string, [number, number, number, number]> = {
    "Galaxy A12": [260, 150, 110, 180],
    "Galaxy A32": [390, 170, 120, 220],
    "Galaxy A54": [690, 220, 150, 280],
    "iPhone 11": [480, 260, 220, 350],
    "iPhone 12": [690, 290, 240, 390],
    "iPhone 13": [850, 320, 260, 450],
    "Moto G22": [290, 160, 110, 180],
    "Moto G52": [420, 180, 120, 220],
    "Redmi Note 11": [370, 170, 120, 200],
  };
  const t = tabelaVazia();
  for (const [, marca, modelo] of APARELHOS) {
    const p = precos[modelo];
    if (!p || t.modelos.some((m) => m.modelo === modelo)) continue;
    t.modelos.push({
      id: `tab-${modelo.replace(/\W+/g, "-").toLowerCase()}`, // texto-cru-proposital: id interno
      marca,
      modelo,
      precos: { tela: p[0], bateria: p[1], conector: p[2], "nao-liga": p[3] },
    });
  }
  return t;
}
