import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { db, sincronizarPendentes } from "../lib/db";
import { tamanhoDaFila } from "../lib/fila";
import { paraNuvem, precisaGravarNaNuvem } from "../lib/config";
import { aviso } from "../components/Aviso";
import { aplicarTema } from "../lib/themes";
import {
  ramoDe,
  lerRamoAparelho,
  definirRamoAparelho,
  lembrarRamoDaConta,
  type Ramo,
} from "../lib/ramos";
import type {
  Cliente,
  OrdemServico,
  Produto,
  MovimentoCaixa,
  SessaoCaixa,
  Fiado,
  Categoria,
  Fornecedor,
  Cotacao,
  PrecoFornecedor,
  ContaPagar,
  Meta,
  Evento,
  TarefaDiaria,
  Comanda,
  Venda,
  Config,
} from "../lib/types";
import type { Nota } from "../lib/nota";

const DEFAULT_CONFIG: Config = {
  nomeLoja: "Minha Assistência TI",
  telefoneLoja: "",
  enderecoLoja: "",
  cnpj: "",
  senhaAcesso: "",
  tema: "claro",
  corDestaque: "azul",
  comissaoPadrao: 0,
  taxaArmazenamentoDia: 0,
  diasAbandono: 90,
  limparSenhaNaEntrega: true,
};

interface AppState {
  loading: boolean;
  online: boolean;
  /** Quantos registros estão presos esperando internet */
  pendentes: number;
  /** Tenta gravar agora o que está preso */
  sincronizar: () => Promise<void>;
  clientes: Cliente[];
  ordens: OrdemServico[];
  produtos: Produto[];
  movimentos: MovimentoCaixa[];
  sessoes: SessaoCaixa[];
  fiados: Fiado[];
  categorias: Categoria[];
  fornecedores: Fornecedor[];
  cotacoes: Cotacao[];
  precos: PrecoFornecedor[];
  contas: ContaPagar[];
  metas: Meta[];
  eventos: Evento[];
  vendas: Venda[];
  tarefas: TarefaDiaria[];
  comandas: Comanda[];
  notas: Nota[];
  config: Config;
  /**
   * O que falhou na última carga.
   *
   * Existe para a tela conseguir separar "está vazio" de "não carregou".
   * Sem essa distinção, uma falha de leitura tem exatamente a mesma cara de
   * um sistema que apagou tudo — e o susto é o mesmo.
   */
  erroCarga: string;
  /**
   * Nomes das tabelas que NÃO carregaram nesta última leitura.
   *
   * A mensagem de erro serve para a pessoa; esta lista serve para o código.
   * Numerar uma venda em cima de uma lista que falhou faz o próximo número
   * nascer 1 e colidir com a primeira venda da loja — e na OS o rastreio
   * público procura pelo número, então o cliente vê o conserto de outra
   * pessoa.
   */
  fontesComFalha: string[];
  /**
   * Ramo que vale na tela agora.
   *
   * Pode vir da loja (Configurações) ou da escolha feita na tela de entrada,
   * que só vale neste aparelho. Toda tela usa ESTE campo, nunca config.ramo
   * direto — senão a escolha local não teria efeito em metade do sistema.
   */
  ramo: Ramo;
  /** Escolha local, quando existe. Só o administrador do sistema tem. */
  ramoAparelho: Ramo | null;
  /** O que a loja contratou. É o que vale para ela, sem exceção. */
  ramoContratado: Ramo;
  trocarRamoAparelho: (r: Ramo | null) => void;
  // ações
  reload: () => Promise<void>;
  saveCliente: (c: Cliente) => Promise<void>;
  removeCliente: (id: string) => Promise<void>;
  saveOrdem: (o: OrdemServico) => Promise<void>;
  removeOrdem: (id: string) => Promise<void>;
  saveProduto: (p: Produto) => Promise<void>;
  removeProduto: (id: string) => Promise<void>;
  saveMovimento: (m: MovimentoCaixa) => Promise<void>;
  removeMovimento: (id: string) => Promise<void>;
  saveSessao: (s: SessaoCaixa) => Promise<void>;
  saveFiado: (f: Fiado) => Promise<void>;
  removeFiado: (id: string) => Promise<void>;
  saveCategoria: (c: Categoria) => Promise<void>;
  removeCategoria: (id: string) => Promise<void>;
  saveFornecedor: (f: Fornecedor) => Promise<void>;
  saveConta: (c: ContaPagar) => Promise<void>;
  removeConta: (id: string) => Promise<void>;
  saveEvento: (e: Evento) => Promise<void>;
  removeEvento: (id: string) => Promise<void>;
  saveComanda: (c: Comanda) => Promise<void>;
  saveNota: (x: Nota) => Promise<void>;
  removeComanda: (id: string) => Promise<void>;
  saveTarefa: (t: TarefaDiaria) => Promise<void>;
  removeTarefa: (id: string) => Promise<void>;
  saveVenda: (v: Venda) => Promise<void>;
  saveMeta: (m: Meta) => Promise<void>;
  removeMeta: (id: string) => Promise<void>;
  saveCotacao: (c: Cotacao) => Promise<void>;
  removeCotacao: (id: string) => Promise<void>;
  savePreco: (p: PrecoFornecedor) => Promise<void>;
  removeFornecedor: (id: string) => Promise<void>;
  /**
   * Devolve `true` só quando a configuração chegou à NUVEM.
   *
   * Void, a tela não tinha como saber: ela mostrava "Salvo!" e liberava o
   * formulário para voltar a seguir a nuvem, mesmo quando a gravação tinha
   * sido recusada. O que a pessoa digitou era descartado na sincronização
   * seguinte — depois de o sistema ter dito que salvou.
   */
  saveConfig: (c: Config) => Promise<boolean>;
}

const Ctx = createContext<AppState | null>(null);

export const useApp = (): AppState => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp deve estar dentro de <AppProvider>");
  return v;
};

function loadConfig(): Config {
  try {
    const raw = localStorage.getItem("sistema-ti:config");
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return DEFAULT_CONFIG;
}

export const AppProvider: React.FC<{
  children: React.ReactNode;
  /** Só o administrador do sistema pode ver o sistema como outro ramo */
  souSuperAdmin?: boolean;
  /** Para o aparelho lembrar o tipo de loja desta conta na próxima entrada */
  email?: string;
}> = ({ children, souSuperAdmin, email }) => {
  const [loading, setLoading] = useState(true);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [ordens, setOrdens] = useState<OrdemServico[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [movimentos, setMovimentos] = useState<MovimentoCaixa[]>([]);
  const [sessoes, setSessoes] = useState<SessaoCaixa[]>([]);
  const [fiados, setFiados] = useState<Fiado[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [cotacoes, setCotacoes] = useState<Cotacao[]>([]);
  const [precos, setPrecos] = useState<PrecoFornecedor[]>([]);
  const [contas, setContas] = useState<ContaPagar[]>([]);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [tarefas, setTarefas] = useState<TarefaDiaria[]>([]);
  const [comandas, setComandas] = useState<Comanda[]>([]);
  const [notas, setNotas] = useState<Nota[]>([]);
  /** Mensagem do que não carregou. Vazio = carregou tudo. */
  const [erroCarga, setErroCarga] = useState("");
  const [fontesComFalha, setFontesComFalha] = useState<string[]>([]);
  const [ramoAparelho, setRamoAparelho] = useState<Ramo | null>(() => lerRamoAparelho());
  /** Ramo CONTRATADO, vindo da loja. Nulo = assistência, como o sistema nasceu. */
  const [ramoLoja, setRamoLoja] = useState<string | null>(null);
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [config, setConfig] = useState<Config>(loadConfig());
  /*
   * A configuração da nuvem já chegou?
   *
   * Enquanto não chegou, `config` é só o que este aparelho tinha guardado —
   * e num aparelho novo isso é o PADRÃO. Gravar nesse estado sobe "Minha
   * Assistência TI" e campos em branco por cima do que a loja tinha,
   * apagando para TODOS os aparelhos de uma vez.
   *
   * Aconteceu de verdade: o celular abriu com o formulário em branco, o
   * dono clicou em Salvar e perdeu nome, telefone, CNPJ, endereço, logo e
   * chat do Telegram.
   */
  const [configCarregada, setConfigCarregada] = useState(false);
  /** A última configuração que ESTE aparelho conseguiu mandar para a nuvem */
  const ultimoEnviado = useRef<Config | null>(null);

  // Aplica o tema (cor + claro/escuro) e reage à mudança do sistema no modo "auto"
  useEffect(() => {
    const modo = config.tema || "claro";
    aplicarTema(config.corDestaque || "azul", modo);
    if (modo !== "auto") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => aplicarTema(config.corDestaque || "azul", "auto");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [config.tema, config.corDestaque]);

  /**
   * Carrega tudo, e uma tabela com problema NÃO derruba as outras.
   *
   * Isto já aconteceu de verdade: uma migração nova ainda não rodada fazia a
   * leitura daquela tabela falhar, o Promise.all rejeitava no primeiro erro
   * e descartava TODOS os outros resultados. A tela abria com o nome padrão
   * da loja e tudo zerado, sem uma linha de aviso — igualzinho a um sistema
   * que apagou os dados. Era só o carregamento que tinha morrido.
   *
   * Duas regras vieram daí:
   *   1. allSettled, não all: cada tabela é independente.
   *   2. Falha aparece na tela. Erro de carga engolido vira "sumiu tudo".
   */
  const reload = useCallback(async () => {
    setLoading(true);
    setErroCarga("");
    setFontesComFalha([]);

    const fontes = [
      { nome: "clientes", carregar: db.clientes.all, aplicar: setClientes },
      { nome: "ordens", carregar: db.ordens.all, aplicar: setOrdens },
      { nome: "produtos", carregar: db.produtos.all, aplicar: setProdutos },
      { nome: "movimentos", carregar: db.movimentos.all, aplicar: setMovimentos },
      { nome: "sessões", carregar: db.sessoes.all, aplicar: setSessoes },
      { nome: "fiados", carregar: db.fiados.all, aplicar: setFiados },
      { nome: "categorias", carregar: db.categorias.all, aplicar: setCategorias },
      { nome: "fornecedores", carregar: db.fornecedores.all, aplicar: setFornecedores },
      { nome: "cotações", carregar: db.cotacoes.all, aplicar: setCotacoes },
      { nome: "preços", carregar: db.precos.all, aplicar: setPrecos },
      { nome: "contas", carregar: db.contas.all, aplicar: setContas },
      { nome: "metas", carregar: db.metas.all, aplicar: setMetas },
      { nome: "agenda", carregar: db.eventos.all, aplicar: setEventos },
      { nome: "checklist", carregar: db.tarefas.all, aplicar: setTarefas },
      { nome: "comandas", carregar: db.comandas.all, aplicar: setComandas },
      { nome: "notas", carregar: db.notas.all, aplicar: setNotas },
      { nome: "vendas", carregar: db.vendas.all, aplicar: setVendas },
    ] as const;

    const resultados = await Promise.allSettled(fontes.map((f) => f.carregar()));
    const falhas: string[] = [];
    const quebradas: string[] = [];

    resultados.forEach((r, i) => {
      if (r.status === "fulfilled") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (fontes[i].aplicar as any)(r.value);
      } else {
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
        console.error(`Falha ao carregar ${fontes[i].nome}:`, r.reason);
        falhas.push(msg);
        quebradas.push(fontes[i].nome);
      }
    });
    setFontesComFalha(quebradas);

    // O ramo contratado vem da loja, não da configuração: é o que foi
    // vendido, e a loja não muda sozinha.
    try {
      const contratado = await db.loja.ramo();
      setRamoLoja(contratado);
      // Guarda para a tela de entrada se apresentar sozinha na próxima vez.
      // É o único jeito honesto de fazer isso: perguntar ao servidor antes do
      // login contaria a qualquer um que aquele e-mail existe.
      if (email) lembrarRamoDaConta(email, ramoDe(contratado));
    } catch (e) {
      // Entra na mesma lista das outras falhas de carga. Sem isso, uma
      // mercearia abria como assistência sem nada na tela explicando —
      // o dono ficava procurando o PDV que o sistema tinha escondido.
      console.error("Falha ao carregar o ramo da loja:", e);
      falhas.push(
        "Tipo de loja: " +
          (e instanceof Error ? e.message : String(e)) +
          "\nEnquanto isso o sistema abre como assistência técnica."
      );
    }

    // Configurações da loja vindas da nuvem (nome, senha, etc.) — mantém aparência local
    try {
      const cloudCfg = await db.config.get();
      if (cloudCfg) setConfig((prev) => ({ ...prev, ...cloudCfg }));
      // Só a partir daqui gravar é seguro. Sem nuvem ligada também libera:
      // aí não existe nada para sobrescrever.
      setConfigCarregada(true);
    } catch (e) {
      // NÃO libera a gravação. Falhou a leitura, o que está na tela pode ser
      // o padrão — e subir o padrão apaga a configuração da loja inteira.
      console.error("Falha ao carregar a configuração da loja:", e);
      falhas.push(
        "Configurações da loja: " +
          (e instanceof Error ? e.message : String(e)) +
          "\nSalvar está bloqueado até a leitura funcionar, para não apagar o que está gravado."
      );
    }

    if (falhas.length > 0) {
      const unicas = [...new Set(falhas)];
      setErroCarga(unicas.join("\n\n"));
      aviso.erro(
        (falhas.length === 1
          ? "Uma parte dos dados não carregou:\n\n"
          : `${falhas.length} partes dos dados não carregaram:\n\n`) + unicas.join("\n\n")
      );
    }

    setLoading(false);
  }, [email]);

  useEffect(() => {
    reload();
  }, [reload]);

  /**
   * O que ficou preso enquanto a internet estava fora.
   *
   * Fica no estado para a tela poder mostrar — descarregar em silêncio seria
   * repetir o erro que a fila veio consertar: o operador precisa saber que
   * existe venda esperando, e precisa saber quando ela entrou.
   */
  const [pendentes, setPendentes] = useState(() => tamanhoDaFila());

  const sincronizar = useCallback(async () => {
    if (tamanhoDaFila() === 0) return;
    const r = await sincronizarPendentes();
    setPendentes(r.restantes);
    if (r.gravados > 0) {
      aviso.sucesso(
        `${r.gravados} registro(s) que estavam esperando internet foram gravados.`
      );
      await reload();
    }
    // Recusado pelo banco não volta para a fila: ele sai de lá e vira aviso,
    // senão seguraria os outros para sempre tentando o impossível.
    if (r.recusados.length > 0) {
      aviso.erro(
        `${r.recusados.length} registro(s) NÃO foram aceitos pelo banco e saíram da fila:\n\n` +
          r.recusados.map((p) => `${p.tabela}: ${p.ultimoErro}`).join("\n")
      );
    }
  }, [reload]);

  /**
   * Tenta descarregar assim que a internet volta, e também ao abrir a aba.
   *
   * O evento "online" do navegador mente com frequência (rede de celular
   * oscilando diz que voltou antes de voltar), por isso a tentativa também
   * acontece ao focar a janela: é quando alguém está de fato olhando.
   */
  useEffect(() => {
    sincronizar();
    const aoVoltar = () => sincronizar();
    window.addEventListener("online", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      window.removeEventListener("online", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [sincronizar]);

  // Recarrega ao voltar para a aba/app (mostra lançamentos feitos pelo WhatsApp ou por outro aparelho)
  useEffect(() => {
    if (!db.online) return;
    const aoVoltar = () => {
      if (document.visibilityState === "visible") reload();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [reload]);

  const saveCliente = async (c: Cliente) => {
    // `gravado` e não `c`: o banco preenche colunas que a tela não tem
    // como saber (o segredo do rastreio é uma), e guardar o objeto que
    // subiu deixaria a tela sem elas até o próximo F5.
    const gravado = await db.clientes.save(c);
    setClientes((prev) => {
      const i = prev.findIndex((x) => x.id === gravado.id);
      if (i >= 0) {
        const n = [...prev];
        n[i] = gravado;
        return n;
      }
      return [...prev, gravado];
    });
  };
  const removeCliente = async (id: string) => {
    await db.clientes.remove(id);
    setClientes((prev) => prev.filter((x) => x.id !== id));
  };

  const saveOrdem = async (o: OrdemServico) => {
    // `gravado` e não `o`: o banco preenche colunas que a tela não tem
    // como saber (o segredo do rastreio é uma), e guardar o objeto que
    // subiu deixaria a tela sem elas até o próximo F5.
    const gravado = await db.ordens.save(o);
    setOrdens((prev) => {
      const i = prev.findIndex((x) => x.id === gravado.id);
      if (i >= 0) {
        const n = [...prev];
        n[i] = gravado;
        return n;
      }
      return [...prev, gravado];
    });
  };
  const removeOrdem = async (id: string) => {
    await db.ordens.remove(id);
    setOrdens((prev) => prev.filter((x) => x.id !== id));
  };

  const saveProduto = async (p: Produto) => {
    // `gravado` e não `p`: o banco preenche colunas que a tela não tem
    // como saber (o segredo do rastreio é uma), e guardar o objeto que
    // subiu deixaria a tela sem elas até o próximo F5.
    const gravado = await db.produtos.save(p);
    setProdutos((prev) => {
      const i = prev.findIndex((x) => x.id === gravado.id);
      if (i >= 0) {
        const n = [...prev];
        n[i] = gravado;
        return n;
      }
      return [...prev, gravado];
    });
  };
  const removeProduto = async (id: string) => {
    await db.produtos.remove(id);
    setProdutos((prev) => prev.filter((x) => x.id !== id));
  };

  const saveMovimento = async (m: MovimentoCaixa) => {
    // `gravado` e não `m`: o banco preenche colunas que a tela não tem
    // como saber (o segredo do rastreio é uma), e guardar o objeto que
    // subiu deixaria a tela sem elas até o próximo F5.
    const gravado = await db.movimentos.save(m);
    setMovimentos((prev) => {
      const i = prev.findIndex((x) => x.id === gravado.id);
      if (i >= 0) {
        const n = [...prev];
        n[i] = gravado;
        return n;
      }
      return [...prev, gravado];
    });
  };
  const removeMovimento = async (id: string) => {
    await db.movimentos.remove(id);
    setMovimentos((prev) => prev.filter((x) => x.id !== id));
  };

  const saveSessao = async (s: SessaoCaixa) => {
    // `gravado` e não `s`: o banco preenche colunas que a tela não tem
    // como saber (o segredo do rastreio é uma), e guardar o objeto que
    // subiu deixaria a tela sem elas até o próximo F5.
    const gravado = await db.sessoes.save(s);
    setSessoes((prev) => {
      const i = prev.findIndex((x) => x.id === gravado.id);
      if (i >= 0) {
        const n = [...prev];
        n[i] = gravado;
        return n;
      }
      return [...prev, gravado];
    });
  };

  const saveFiado = async (f: Fiado) => {
    // `gravado` e não `f`: o banco preenche colunas que a tela não tem
    // como saber (o segredo do rastreio é uma), e guardar o objeto que
    // subiu deixaria a tela sem elas até o próximo F5.
    const gravado = await db.fiados.save(f);
    setFiados((prev) => {
      const i = prev.findIndex((x) => x.id === gravado.id);
      if (i >= 0) {
        const n = [...prev];
        n[i] = gravado;
        return n;
      }
      return [...prev, gravado];
    });
  };
  const removeFiado = async (id: string) => {
    await db.fiados.remove(id);
    setFiados((prev) => prev.filter((x) => x.id !== id));
  };

  const saveCategoria = async (c: Categoria) => {
    // `gravado` e não `c`: o banco preenche colunas que a tela não tem
    // como saber (o segredo do rastreio é uma), e guardar o objeto que
    // subiu deixaria a tela sem elas até o próximo F5.
    const gravado = await db.categorias.save(c);
    setCategorias((prev) => {
      const i = prev.findIndex((x) => x.id === gravado.id);
      if (i >= 0) {
        const n = [...prev];
        n[i] = gravado;
        return n;
      }
      return [...prev, gravado];
    });
  };
  const removeCategoria = async (id: string) => {
    await db.categorias.remove(id);
    // remove também as subclasses da classe apagada
    const filhos = categorias.filter((c) => c.paiId === id).map((c) => c.id);
    for (const fid of filhos) await db.categorias.remove(fid);
    setCategorias((prev) => prev.filter((x) => x.id !== id && x.paiId !== id));
  };

  const saveFornecedor = async (f: Fornecedor) => {
    // `gravado` e não `f`: o banco preenche colunas que a tela não tem
    // como saber (o segredo do rastreio é uma), e guardar o objeto que
    // subiu deixaria a tela sem elas até o próximo F5.
    const gravado = await db.fornecedores.save(f);
    setFornecedores((prev) => {
      const i = prev.findIndex((x) => x.id === gravado.id);
      if (i >= 0) {
        const n = [...prev];
        n[i] = gravado;
        return n;
      }
      return [...prev, gravado];
    });
  };
  const removeFornecedor = async (id: string) => {
    await db.fornecedores.remove(id);
    setFornecedores((prev) => prev.filter((x) => x.id !== id));
  };

  const saveCotacao = async (c: Cotacao) => {
    // `gravado` e não `c`: o banco preenche colunas que a tela não tem
    // como saber (o segredo do rastreio é uma), e guardar o objeto que
    // subiu deixaria a tela sem elas até o próximo F5.
    const gravado = await db.cotacoes.save(c);
    setCotacoes((prev) => {
      const i = prev.findIndex((x) => x.id === gravado.id);
      if (i >= 0) {
        const n = [...prev];
        n[i] = gravado;
        return n;
      }
      return [...prev, gravado];
    });
  };
  const removeCotacao = async (id: string) => {
    await db.cotacoes.remove(id);
    setCotacoes((prev) => prev.filter((x) => x.id !== id));
  };
  const savePreco = async (p: PrecoFornecedor) => {
    const gravado = await db.precos.save(p);
    setPrecos((prev) => [...prev.filter((x) => x.id !== gravado.id), gravado]);
  };

  const saveConta = async (c: ContaPagar) => {
    // `gravado` e não `c`: o banco preenche colunas que a tela não tem
    // como saber (o segredo do rastreio é uma), e guardar o objeto que
    // subiu deixaria a tela sem elas até o próximo F5.
    const gravado = await db.contas.save(c);
    setContas((prev) => {
      const i = prev.findIndex((x) => x.id === gravado.id);
      if (i >= 0) {
        const n = [...prev];
        n[i] = gravado;
        return n;
      }
      return [...prev, gravado];
    });
  };
  const removeConta = async (id: string) => {
    await db.contas.remove(id);
    setContas((prev) => prev.filter((x) => x.id !== id));
  };
  const saveEvento = async (e: Evento) => {
    // `gravado` e não `e`: o banco preenche colunas que a tela não tem
    // como saber (o segredo do rastreio é uma), e guardar o objeto que
    // subiu deixaria a tela sem elas até o próximo F5.
    const gravado = await db.eventos.save(e);
    setEventos((prev) => {
      const i = prev.findIndex((x) => x.id === gravado.id);
      if (i >= 0) {
        const n = [...prev];
        n[i] = gravado;
        return n;
      }
      return [...prev, gravado];
    });
  };
  const removeEvento = async (id: string) => {
    await db.eventos.remove(id);
    setEventos((prev) => prev.filter((x) => x.id !== id));
  };
  /**
   * Põe a nota na FILA. Não emite.
   *
   * A venda nunca espera a nota: quem manda é o robô da Vercel, depois. A
   * tela só grava o pedido pronto e deixa pendente — SEFAZ fora do ar não
   * pode travar o caixa numa sexta cheia.
   */
  const saveNota = async (x: Nota) => {
    const gravado = await db.notas.save(x);
    setNotas((prev) => {
      const i = prev.findIndex((y) => y.id === gravado.id);
      if (i >= 0) {
        const n2 = [...prev];
        n2[i] = gravado;
        return n2;
      }
      return [...prev, gravado];
    });
  };

  const saveComanda = async (c: Comanda) => {
    const gravado = await db.comandas.save(c);
    setComandas((prev) => {
      const i = prev.findIndex((x) => x.id === gravado.id);
      if (i >= 0) {
        const n = [...prev];
        n[i] = gravado;
        return n;
      }
      return [...prev, gravado];
    });
  };
  const removeComanda = async (id: string) => {
    await db.comandas.remove(id);
    setComandas((prev) => prev.filter((x) => x.id !== id));
  };

  const saveTarefa = async (t: TarefaDiaria) => {
    // `gravado` e não `t`: o banco preenche colunas que a tela não tem
    // como saber (o segredo do rastreio é uma), e guardar o objeto que
    // subiu deixaria a tela sem elas até o próximo F5.
    const gravado = await db.tarefas.save(t);
    setTarefas((prev) => {
      const i = prev.findIndex((x) => x.id === gravado.id);
      if (i >= 0) {
        const n = [...prev];
        n[i] = gravado;
        return n;
      }
      return [...prev, gravado];
    });
  };
  const removeTarefa = async (id: string) => {
    await db.tarefas.remove(id);
    setTarefas((prev) => prev.filter((x) => x.id !== id));
  };
  const trocarRamoAparelho = (r: Ramo | null) => {
    definirRamoAparelho(r);
    setRamoAparelho(r);
  };

  const saveVenda = async (v: Venda) => {
    // `gravado` e não `v`: o banco preenche colunas que a tela não tem
    // como saber (o segredo do rastreio é uma), e guardar o objeto que
    // subiu deixaria a tela sem elas até o próximo F5.
    const gravado = await db.vendas.save(v);
    setVendas((prev) => {
      const i = prev.findIndex((x) => x.id === gravado.id);
      if (i >= 0) {
        const n = [...prev];
        n[i] = gravado;
        return n;
      }
      return [...prev, gravado];
    });
  };
  const saveMeta = async (m: Meta) => {
    // `gravado` e não `m`: o banco preenche colunas que a tela não tem
    // como saber (o segredo do rastreio é uma), e guardar o objeto que
    // subiu deixaria a tela sem elas até o próximo F5.
    const gravado = await db.metas.save(m);
    setMetas((prev) => {
      const i = prev.findIndex((x) => x.id === gravado.id);
      if (i >= 0) {
        const n = [...prev];
        n[i] = gravado;
        return n;
      }
      return [...prev, gravado];
    });
  };
  const removeMeta = async (id: string) => {
    await db.metas.remove(id);
    setMetas((prev) => prev.filter((x) => x.id !== id));
  };

  /**
   * Grava a configuração no aparelho E na nuvem.
   *
   * Duas coisas estavam erradas aqui, e as duas são as que este repositório
   * mais briga para não repetir:
   *
   * 1. A lista do que subia era escrita à mão, e toda configuração criada
   *    depois dela ficou de fora — logo, papel da impressora, limite da
   *    gaveta, chat do Telegram. Salvava no aparelho, dizia "salvo", e na
   *    máquina seguinte estava em branco. Agora sobe tudo menos a aparência
   *    e as credenciais (ver lib/config.ts).
   * 2. O erro caía num `.catch(() => {})`. Assinatura vencida ou coluna
   *    faltando deixavam o dono trocar o nome da loja, ver "salvo", e nada
   *    ir para a nuvem.
   */
  const saveConfig = async (c: Config): Promise<boolean> => {
    localStorage.setItem("sistema-ti:config", JSON.stringify(c));
    setConfig(c);
    if (!configCarregada) {
      // Não é só deixar de subir: é AVISAR. Gravar em silêncio só no
      // aparelho faria a pessoa achar que salvou.
      aviso.erro(
        "As configurações da loja ainda não terminaram de carregar da nuvem.\n\n" +
          "Foram salvas neste aparelho, mas NÃO subiram — subir agora apagaria " +
          "o que está gravado. Atualize a página e salve de novo."
      );
      return false;
    }
    /*
     * Pular a gravação quando só a aparência mudou existe para a paleta de
     * cores não virar uma escrita por clique na pré-visualização ao vivo.
     *
     * Mas a comparação tem que ser contra o que ESTE APARELHO já mandou para
     * a nuvem, não contra o que ele tem na tela. Comparando com a tela, o
     * conserto ficava impossível: o computador tinha logo, limite da gaveta e
     * chat do Telegram guardados só nele, a nuvem não tinha nenhum dos três,
     * e clicar em Salvar "sem mudar nada" era descartado — justamente o
     * clique que ia consertar. O celular continuava abrindo sem eles.
     *
     * Nulo = nada foi enviado nesta sessão ainda, então manda.
     */
    const carga = paraNuvem(c);
    // Nada a enviar é sucesso: a nuvem já está com este conteúdo.
    if (ultimoEnviado.current && !precisaGravarNaNuvem(ultimoEnviado.current, c)) return true;
    try {
      // A configuração não tem coluna com valor gerado pelo banco, e quem
      // manda nela é o aparelho: foi justamente sobrescrever a tela com o
      // que voltou da nuvem que apagou a loja inteira uma vez.
      await db.config.save(carga); // retorno-do-banco-nao-importa
      ultimoEnviado.current = c;
      return true;
    } catch (e) {
      aviso.erro(
        "As configurações foram salvas neste aparelho, mas NÃO subiram para a " +
          "nuvem:\n\n" +
          (e instanceof Error ? e.message : String(e)) +
          "\n\nEm outro aparelho elas ainda estão como antes."
      );
      return false;
    }
  };

  const value: AppState = {
    loading,
    online: db.online,
    pendentes,
    sincronizar,
    clientes,
    ordens,
    produtos,
    movimentos,
    sessoes,
    fiados,
    categorias,
    fornecedores,
    cotacoes,
    precos,
    contas,
    metas,
    eventos,
    tarefas,
    comandas,
    notas,
    vendas,
    config,
    erroCarga,
    fontesComFalha,
    // A prévia do aparelho só vale para quem administra o sistema. Para a
    // loja, o que manda é o que ela contratou — senão bastaria escolher
    // outro tipo na tela de entrada para usar o que não pagou.
    ramo: souSuperAdmin ? (ramoAparelho ?? ramoDe(ramoLoja)) : ramoDe(ramoLoja),
    ramoAparelho: souSuperAdmin ? ramoAparelho : null,
    ramoContratado: ramoDe(ramoLoja),
    trocarRamoAparelho,
    reload,
    saveCliente,
    removeCliente,
    saveOrdem,
    removeOrdem,
    saveProduto,
    removeProduto,
    saveMovimento,
    removeMovimento,
    saveSessao,
    saveFiado,
    removeFiado,
    saveCategoria,
    removeCategoria,
    saveFornecedor,
    removeFornecedor,
    saveConta,
    removeConta,
    saveEvento,
    removeEvento,
    saveComanda,
    saveNota,
    removeComanda,
    saveTarefa,
    removeTarefa,
    saveVenda,
    saveMeta,
    removeMeta,
    saveCotacao,
    removeCotacao,
    savePreco,
    saveConfig,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
