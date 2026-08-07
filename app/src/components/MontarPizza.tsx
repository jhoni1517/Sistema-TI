import React, { useMemo, useState } from "react";
import { Pizza, X } from "lucide-react";
import { Modal } from "./ui";
import { brl, txt } from "../lib/format";
import { produtosParaOS } from "../lib/busca";
import { precoEfetivo } from "../lib/promocao";
import {
  precoDosSabores,
  descricaoDosSabores,
  regraDe,
  REGRA_MEIO_A_MEIO_META,
  type Sabor,
} from "../lib/pizza";
import type { ItemVenda, Produto } from "../lib/types";

/**
 * Monta uma pizza de 2 a 4 sabores.
 *
 * A escolha é de SABOR, não de produto: cada sabor é um produto do cardápio,
 * mas o que entra no carrinho é uma linha só, com o preço já resolvido pela
 * regra da casa. Somar dois produtos no carrinho cobraria duas pizzas.
 *
 * O preço aparece atualizado a cada sabor marcado, junto do nome da regra
 * que está valendo. Sem isso o atendente descobre o valor só no total, e
 * quando ele discorda do que a casa cobra já é tarde: a discussão acontece
 * com o cliente na frente.
 *
 * Máximo de quatro porque é o que a massa comporta e o que as casas
 * praticam; acima disso a fração vira propaganda enganosa no cupom.
 */
const MAXIMO = 4;

export const MontarPizza: React.FC<{
  produtos: Produto[];
  regra?: string | null;
  onMontou: (item: ItemVenda) => void;
  onFechar: () => void;
}> = ({ produtos, regra, onMontou, onFechar }) => {
  const [termo, setTermo] = useState("");
  const [escolhidos, setEscolhidos] = useState<Produto[]>([]);

  const regraAtual = regraDe(regra);
  const lista = useMemo(() => produtosParaOS(produtos, termo, 8), [produtos, termo]);

  /* O preço que vale é o efetivo: promoção com prazo manda no PDV e não
     pode parar de valer só porque a pizza passou pelo montador. */
  const sabores: Sabor[] = escolhidos.map((p) => ({
    nome: txt(p.nome).trim(),
    preco: precoEfetivo(p),
  }));

  const preco = precoDosSabores(sabores, regraAtual);
  const descricao = descricaoDosSabores(sabores);

  const alternar = (p: Produto) => {
    setEscolhidos((prev) => {
      const jaTem = prev.some((x) => x.id === p.id);
      if (jaTem) return prev.filter((x) => x.id !== p.id);
      if (prev.length >= MAXIMO) return prev;
      return [...prev, p];
    });
    setTermo("");
  };

  const confirmar = () => {
    if (escolhidos.length === 0) return;
    onMontou({
      // Sem `produtoId`: a linha não é um produto do cadastro, é a
      // combinação. Vincular a um dos sabores baixaria o estoque de um só e
      // faria o relatório dizer que se vendeu uma calabresa inteira.
      descricao,
      quantidade: 1,
      precoUnit: preco,
      custoUnit: escolhidos.reduce((s, p) => s + (Number(p.custo) || 0), 0) / escolhidos.length,
      sabores,
    });
  };

  return (
    <Modal
      open
      onClose={onFechar}
      title="Montar pizza"
      maxWidth="max-w-lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button className="btn-primary" disabled={escolhidos.length === 0} onClick={confirmar}>
            {escolhidos.length === 0 ? "Escolha os sabores" : `Lançar por ${brl(preco)}`}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {escolhidos.length > 0 && (
          <div className="rounded-xl bg-brand-50 p-4">
            <p className="flex items-center gap-1.5 text-sm font-bold text-brand-700">
              <Pizza size={15} /> {descricao}
            </p>
            <p className="mt-2 text-2xl font-bold text-brand-700">{brl(preco)}</p>
            {/* Diz QUAL regra produziu esse número. O atendente que discorda
                precisa saber onde mudar, e o dono precisa ver que a regra
                dele está valendo. */}
            <p className="mt-1 text-xs text-brand-700/80">
              {REGRA_MEIO_A_MEIO_META[regraAtual].label} — muda em Configurações
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {escolhidos.map((p) => (
                <button
                  key={p.id}
                  onClick={() => alternar(p)}
                  className="chip bg-white text-xs text-slate-700 ring-1 ring-slate-200"
                >
                  {txt(p.nome)} · {brl(precoEfetivo(p))}
                  <X size={12} />
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="label">
            {escolhidos.length >= MAXIMO
              ? `Máximo de ${MAXIMO} sabores`
              : `Sabor ${escolhidos.length + 1}`}
          </label>
          <input
            autoFocus
            className="input"
            placeholder="Buscar sabor no cardápio..."
            value={termo}
            disabled={escolhidos.length >= MAXIMO}
            onChange={(e) => setTermo(e.target.value)}
          />
        </div>

        {escolhidos.length < MAXIMO && (
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {lista.map((p) => {
              const marcado = escolhidos.some((x) => x.id === p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => alternar(p)}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition ${
                    marcado
                      ? "border-brand-500 bg-brand-50"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">
                    {txt(p.nome)}
                  </span>
                  <span className="shrink-0 text-sm font-bold text-slate-800">
                    {brl(precoEfetivo(p))}
                  </span>
                </button>
              );
            })}
            {lista.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-400">
                Nenhum sabor encontrado com esse nome.
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
