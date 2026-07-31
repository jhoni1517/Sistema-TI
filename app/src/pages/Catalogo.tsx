import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Search, MessageCircle, Store, ShieldCheck, ImageOff } from "lucide-react";
import { supabase, supabaseEnabled } from "../lib/supabase";
import { brl, txt, whatsappLink } from "../lib/format";
import { normalizar } from "../lib/busca";

/**
 * Vitrine pública da loja, para mandar num link só.
 *
 * A loja manda foto de produto no WhatsApp uma por uma, o dia inteiro, e o
 * cliente pergunta preço de coisa que está na prateleira. Aqui ele abre, vê
 * o que tem e chama já dizendo o que quer.
 *
 * O que NÃO aparece: custo, margem, fornecedor e quantidade exata.
 * Concorrente também abre o link, e quantidade exata em vitrine é convite
 * para negociar em cima do estoque parado. O corte é feito no banco, na
 * função catalogo_loja — filtrar só aqui na tela não esconde nada de quem
 * sabe abrir o painel do navegador.
 */

interface ItemCatalogo {
  nome: string;
  imagem: string | null;
  categoria: string | null;
  por_peso: boolean;
  preco: number;
  preco_de: number | null;
  tem: boolean;
}

interface Vitrine {
  loja: string;
  logo: string | null;
  whatsapp: string | null;
  recado: string | null;
  itens: ItemCatalogo[] | null;
}

export const Catalogo: React.FC = () => {
  const { loja } = useParams();
  const [dados, setDados] = useState<Vitrine | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!loja || !supabaseEnabled || !supabase) {
        setErro("Link incompleto.");
        setCarregando(false);
        return;
      }
      try {
        const { data, error } = await supabase.rpc("catalogo_loja", { p_loja: loja });
        if (error) throw error;
        const linha = Array.isArray(data) ? data[0] : data;
        if (!vivo) return;
        // Sem linha: a loja não ligou o catálogo, ou está desligada. Não dá
        // para distinguir de propósito — quem não publicou não precisa
        // explicar nada a quem chegou pelo link.
        if (!linha) setErro("Este catálogo não está disponível.");
        else setDados(linha as Vitrine);
      } catch {
        if (vivo) setErro("Não foi possível abrir o catálogo agora.");
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [loja]);

  const itens = useMemo(() => {
    const t = normalizar(busca);
    const lista = dados?.itens || [];
    if (!t) return lista;
    return lista.filter(
      (i) => normalizar(i.nome).includes(t) || normalizar(i.categoria).includes(t)
    );
  }, [dados, busca]);

  const pedir = (item?: ItemCatalogo) => {
    const texto = item
      ? `Olá! Vi no catálogo e queria saber sobre: ${item.nome} (${brl(item.preco)}${
          item.por_peso ? "/kg" : ""
        }).`
      : "Olá! Vi o catálogo e queria fazer um pedido.";
    window.open(whatsappLink(txt(dados?.whatsapp), texto), "_blank");
  };

  if (carregando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-400">
        Carregando...
      </div>
    );
  }

  if (erro || !dados) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="rounded-2xl bg-white p-8 text-center shadow">
          <Store className="mx-auto mb-3 text-slate-300" size={36} />
          <p className="font-semibold text-slate-700">{erro || "Catálogo indisponível"}</p>
          <p className="mt-1 text-sm text-slate-400">Peça um novo link para a loja.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <header className="bg-white shadow-sm">
        <div className="mx-auto max-w-3xl px-4 py-6 text-center">
          {dados.logo && (
            <img
              src={dados.logo}
              alt=""
              className="mx-auto mb-3 max-h-16 object-contain"
            />
          )}
          <h1 className="text-xl font-bold text-slate-800">{dados.loja}</h1>
          {dados.recado && <p className="mt-1 text-sm text-slate-500">{dados.recado}</p>}
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4">
        <div className="relative my-4">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-10"
            placeholder="Buscar produto"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>

        {itens.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">
            {busca ? `Nada encontrado para "${busca}".` : "Catálogo vazio no momento."}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {itens.map((i, n) => (
              <button
                key={`${i.nome}-${n}`}
                onClick={() => dados.whatsapp && pedir(i)}
                className={`overflow-hidden rounded-xl bg-white text-left shadow-sm ${
                  i.tem ? "" : "opacity-60"
                }`}
              >
                <div className="flex aspect-square items-center justify-center bg-slate-100">
                  {i.imagem ? (
                    <img
                      src={i.imagem}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImageOff size={26} className="text-slate-300" />
                  )}
                </div>
                <div className="p-2.5">
                  <p className="line-clamp-2 min-h-[2.5rem] text-sm font-medium text-slate-800">
                    {i.nome}
                  </p>
                  {i.preco_de != null && (
                    <p className="text-xs text-slate-400 line-through">{brl(i.preco_de)}</p>
                  )}
                  <p
                    className={`text-base font-bold ${
                      i.preco_de != null ? "text-emerald-600" : "text-slate-800"
                    }`}
                  >
                    {brl(i.preco)}
                    {i.por_peso && <span className="text-xs font-normal"> /kg</span>}
                  </p>
                  {!i.tem && (
                    <p className="mt-0.5 text-xs text-amber-600">Sob encomenda</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        <p className="mt-8 flex items-center justify-center gap-1 text-center text-xs text-slate-400">
          <ShieldCheck size={12} /> Preços sujeitos a alteração. Confirme na loja.
        </p>
      </div>

      {/* Botão fixo: o objetivo da página inteira é virar uma conversa. */}
      {dados.whatsapp && (
        <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white p-3">
          <div className="mx-auto max-w-3xl">
            <button className="btn-primary w-full !py-3" onClick={() => pedir()}>
              <MessageCircle size={18} /> Fazer pedido pelo WhatsApp
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
