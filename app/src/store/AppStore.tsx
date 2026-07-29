import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { db } from "../lib/db";
import { aviso } from "../components/Aviso";
import { aplicarTema } from "../lib/themes";
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
  Venda,
  Config,
} from "../lib/types";

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
  config: Config;
  /**
   * O que falhou na última carga.
   *
   * Existe para a tela conseguir separar "está vazio" de "não carregou".
   * Sem essa distinção, uma falha de leitura tem exatamente a mesma cara de
   * um sistema que apagou tudo — e o susto é o mesmo.
   */
  erroCarga: string;
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
  saveVenda: (v: Venda) => Promise<void>;
  saveMeta: (m: Meta) => Promise<void>;
  removeMeta: (id: string) => Promise<void>;
  saveCotacao: (c: Cotacao) => Promise<void>;
  removeCotacao: (id: string) => Promise<void>;
  savePreco: (p: PrecoFornecedor) => Promise<void>;
  removeFornecedor: (id: string) => Promise<void>;
  saveConfig: (c: Config) => void;
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

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
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
  /** Mensagem do que não carregou. Vazio = carregou tudo. */
  const [erroCarga, setErroCarga] = useState("");
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [config, setConfig] = useState<Config>(loadConfig());

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
      { nome: "vendas", carregar: db.vendas.all, aplicar: setVendas },
    ] as const;

    const resultados = await Promise.allSettled(fontes.map((f) => f.carregar()));
    const falhas: string[] = [];

    resultados.forEach((r, i) => {
      if (r.status === "fulfilled") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (fontes[i].aplicar as any)(r.value);
      } else {
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
        console.error(`Falha ao carregar ${fontes[i].nome}:`, r.reason);
        falhas.push(msg);
      }
    });

    // Configurações da loja vindas da nuvem (nome, senha, etc.) — mantém aparência local
    try {
      const cloudCfg = await db.config.get();
      if (cloudCfg) setConfig((prev) => ({ ...prev, ...cloudCfg }));
    } catch (e) {
      console.error("Falha ao carregar a configuração da loja:", e);
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
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

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
    await db.clientes.save(c);
    setClientes((prev) => {
      const i = prev.findIndex((x) => x.id === c.id);
      if (i >= 0) {
        const n = [...prev];
        n[i] = c;
        return n;
      }
      return [...prev, c];
    });
  };
  const removeCliente = async (id: string) => {
    await db.clientes.remove(id);
    setClientes((prev) => prev.filter((x) => x.id !== id));
  };

  const saveOrdem = async (o: OrdemServico) => {
    await db.ordens.save(o);
    setOrdens((prev) => {
      const i = prev.findIndex((x) => x.id === o.id);
      if (i >= 0) {
        const n = [...prev];
        n[i] = o;
        return n;
      }
      return [...prev, o];
    });
  };
  const removeOrdem = async (id: string) => {
    await db.ordens.remove(id);
    setOrdens((prev) => prev.filter((x) => x.id !== id));
  };

  const saveProduto = async (p: Produto) => {
    await db.produtos.save(p);
    setProdutos((prev) => {
      const i = prev.findIndex((x) => x.id === p.id);
      if (i >= 0) {
        const n = [...prev];
        n[i] = p;
        return n;
      }
      return [...prev, p];
    });
  };
  const removeProduto = async (id: string) => {
    await db.produtos.remove(id);
    setProdutos((prev) => prev.filter((x) => x.id !== id));
  };

  const saveMovimento = async (m: MovimentoCaixa) => {
    await db.movimentos.save(m);
    setMovimentos((prev) => {
      const i = prev.findIndex((x) => x.id === m.id);
      if (i >= 0) {
        const n = [...prev];
        n[i] = m;
        return n;
      }
      return [...prev, m];
    });
  };
  const removeMovimento = async (id: string) => {
    await db.movimentos.remove(id);
    setMovimentos((prev) => prev.filter((x) => x.id !== id));
  };

  const saveSessao = async (s: SessaoCaixa) => {
    await db.sessoes.save(s);
    setSessoes((prev) => {
      const i = prev.findIndex((x) => x.id === s.id);
      if (i >= 0) {
        const n = [...prev];
        n[i] = s;
        return n;
      }
      return [...prev, s];
    });
  };

  const saveFiado = async (f: Fiado) => {
    await db.fiados.save(f);
    setFiados((prev) => {
      const i = prev.findIndex((x) => x.id === f.id);
      if (i >= 0) {
        const n = [...prev];
        n[i] = f;
        return n;
      }
      return [...prev, f];
    });
  };
  const removeFiado = async (id: string) => {
    await db.fiados.remove(id);
    setFiados((prev) => prev.filter((x) => x.id !== id));
  };

  const saveCategoria = async (c: Categoria) => {
    await db.categorias.save(c);
    setCategorias((prev) => {
      const i = prev.findIndex((x) => x.id === c.id);
      if (i >= 0) {
        const n = [...prev];
        n[i] = c;
        return n;
      }
      return [...prev, c];
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
    await db.fornecedores.save(f);
    setFornecedores((prev) => {
      const i = prev.findIndex((x) => x.id === f.id);
      if (i >= 0) {
        const n = [...prev];
        n[i] = f;
        return n;
      }
      return [...prev, f];
    });
  };
  const removeFornecedor = async (id: string) => {
    await db.fornecedores.remove(id);
    setFornecedores((prev) => prev.filter((x) => x.id !== id));
  };

  const saveCotacao = async (c: Cotacao) => {
    await db.cotacoes.save(c);
    setCotacoes((prev) => {
      const i = prev.findIndex((x) => x.id === c.id);
      if (i >= 0) {
        const n = [...prev];
        n[i] = c;
        return n;
      }
      return [...prev, c];
    });
  };
  const removeCotacao = async (id: string) => {
    await db.cotacoes.remove(id);
    setCotacoes((prev) => prev.filter((x) => x.id !== id));
  };
  const savePreco = async (p: PrecoFornecedor) => {
    await db.precos.save(p);
    setPrecos((prev) => [...prev.filter((x) => x.id !== p.id), p]);
  };

  const saveConta = async (c: ContaPagar) => {
    await db.contas.save(c);
    setContas((prev) => {
      const i = prev.findIndex((x) => x.id === c.id);
      if (i >= 0) {
        const n = [...prev];
        n[i] = c;
        return n;
      }
      return [...prev, c];
    });
  };
  const removeConta = async (id: string) => {
    await db.contas.remove(id);
    setContas((prev) => prev.filter((x) => x.id !== id));
  };
  const saveEvento = async (e: Evento) => {
    await db.eventos.save(e);
    setEventos((prev) => {
      const i = prev.findIndex((x) => x.id === e.id);
      if (i >= 0) {
        const n = [...prev];
        n[i] = e;
        return n;
      }
      return [...prev, e];
    });
  };
  const removeEvento = async (id: string) => {
    await db.eventos.remove(id);
    setEventos((prev) => prev.filter((x) => x.id !== id));
  };
  const saveVenda = async (v: Venda) => {
    await db.vendas.save(v);
    setVendas((prev) => {
      const i = prev.findIndex((x) => x.id === v.id);
      if (i >= 0) {
        const n = [...prev];
        n[i] = v;
        return n;
      }
      return [...prev, v];
    });
  };
  const saveMeta = async (m: Meta) => {
    await db.metas.save(m);
    setMetas((prev) => {
      const i = prev.findIndex((x) => x.id === m.id);
      if (i >= 0) {
        const n = [...prev];
        n[i] = m;
        return n;
      }
      return [...prev, m];
    });
  };
  const removeMeta = async (id: string) => {
    await db.metas.remove(id);
    setMetas((prev) => prev.filter((x) => x.id !== id));
  };

  const saveConfig = (c: Config) => {
    localStorage.setItem("sistema-ti:config", JSON.stringify(c));
    setConfig(c);
    // sincroniza os dados da loja na nuvem (nome, senha, comissão) — aparência fica local
    db.config
      .save({
        nomeLoja: c.nomeLoja,
        telefoneLoja: c.telefoneLoja,
        enderecoLoja: c.enderecoLoja,
        cnpj: c.cnpj,
        senhaAcesso: c.senhaAcesso,
        comissaoPadrao: c.comissaoPadrao,
        taxaArmazenamentoDia: c.taxaArmazenamentoDia,
        diasAbandono: c.diasAbandono,
      })
      .catch(() => {});
  };

  const value: AppState = {
    loading,
    online: db.online,
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
    vendas,
    config,
    erroCarga,
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
