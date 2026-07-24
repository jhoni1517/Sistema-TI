import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { db } from "../lib/db";
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
  Config,
} from "../lib/types";

const DEFAULT_CONFIG: Config = {
  nomeLoja: "Minha Assistência TI",
  telefoneLoja: "",
  enderecoLoja: "",
  cnpj: "",
  senhaAcesso: "1234",
  tema: "claro",
  corDestaque: "azul",
  comissaoPadrao: 0,
  taxaArmazenamentoDia: 0,
  diasAbandono: 90,
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
  config: Config;
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

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [c, o, p, m, s, f, cat, forn] = await Promise.all([
        db.clientes.all(),
        db.ordens.all(),
        db.produtos.all(),
        db.movimentos.all(),
        db.sessoes.all(),
        db.fiados.all(),
        db.categorias.all(),
        db.fornecedores.all(),
      ]);
      setClientes(c);
      setOrdens(o);
      setProdutos(p);
      setMovimentos(m);
      setSessoes(s);
      setFiados(f);
      setCategorias(cat);
      setFornecedores(forn);
      // Configurações da loja vindas da nuvem (nome, senha, etc.) — mantém aparência local
      const cloudCfg = await db.config.get();
      if (cloudCfg) setConfig((prev) => ({ ...prev, ...cloudCfg }));
    } catch (e) {
      console.error("Erro ao carregar dados:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
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
    config,
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
    saveConfig,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
