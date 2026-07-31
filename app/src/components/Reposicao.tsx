import React, { useMemo, useState } from "react";
import { ShoppingBasket, MessageCircle, AlertTriangle } from "lucide-react";
import { aviso } from "./Aviso";
import { Modal, Field, InputNumero } from "./ui";
import { useApp } from "../store/AppStore";
import { brl, txt, abrirWhatsapp } from "../lib/format";
import {
  sugestaoDeCompra,
  custoDaReposicao,
  mensagemDePedido,
} from "../lib/reposicao";

/**
 * O que comprar, e quanto.
 *
 * O estoque mínimo do cadastro é um número que alguém chutou e nunca mais
 * olhou: ele não sabe que o arroz saiu 40 vezes este mês e a caixa de som
 * saiu uma, então avisa os dois do mesmo jeito — e o dono aprende a ignorar
 * o aviso.
 *
 * Aqui a conta olha o consumo real. Quem não sai não entra na lista: pedir
 * reposição de item parado é exatamente como o estoque encalha.
 */
export const Reposicao: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { produtos, vendas, fornecedores, config } = useApp();
  const [diasObservados, setDiasObservados] = useState(30);
  const [coberturaDias, setCoberturaDias] = useState(15);
  const [fora, setFora] = useState<Set<string>>(new Set());

  const lista = useMemo(
    () => sugestaoDeCompra(produtos, vendas, { diasObservados, coberturaDias }),
    [produtos, vendas, diasObservados, coberturaDias]
  );
  const escolhidos = lista.filter((r) => !fora.has(r.produtoId));

  const mandar = (telefone: string) => {
    if (escolhidos.length === 0) return aviso.alerta("Nada escolhido para pedir.");
    abrirWhatsapp(telefone, mensagemDePedido(escolhidos, config.nomeLoja));
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="O que comprar"
      maxWidth="max-w-2xl"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Fechar
          </button>
          <button className="btn-primary" onClick={() => mandar("")}>
            <MessageCircle size={16} /> Enviar pedido
          </button>
        </>
      }
    >
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <Field label="Olhar o consumo dos últimos (dias)">
          <InputNumero
            className="input"
            min={7}
            value={diasObservados}
            onChange={(v) => setDiasObservados(v ?? 30)}
          />
        </Field>
        <Field label="A compra precisa durar (dias)">
          <InputNumero
            className="input"
            min={1}
            value={coberturaDias}
            onChange={(v) => setCoberturaDias(v ?? 15)}
          />
          <p className="mt-1 text-xs text-slate-400">
            Normalmente o intervalo entre duas idas ao fornecedor.
          </p>
        </Field>
      </div>

      {lista.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">
          Nada para repor. Só entra aqui o que teve saída no período — item
          parado com estoque zerado não é falta, é acerto, e aparece em
          Relatórios como dinheiro parado.
        </p>
      ) : (
        <>
          <p className="mb-2 rounded-lg bg-slate-50 p-3 text-sm">
            <b className="text-lg text-slate-800">{brl(custoDaReposicao(escolhidos))}</b>{" "}
            <span className="text-slate-500">
              para repor {escolhidos.length} item(ns), ao último custo conhecido
            </span>
          </p>

          <div className="max-h-[42vh] space-y-1 overflow-y-auto">
            {lista.map((r) => {
              const dentro = !fora.has(r.produtoId);
              return (
                <label
                  key={r.produtoId}
                  className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 ${
                    r.urgente ? "border-amber-300 bg-amber-50" : "border-slate-100"
                  } ${dentro ? "" : "opacity-40"}`}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0"
                    checked={dentro}
                    onChange={() =>
                      setFora((f) => {
                        const novo = new Set(f);
                        if (novo.has(r.produtoId)) novo.delete(r.produtoId);
                        else novo.add(r.produtoId);
                        return novo;
                      })
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-700">
                      {r.nome}
                      {r.zerado && (
                        <span className="badge ml-2 bg-red-100 text-red-700">
                          <AlertTriangle size={10} /> acabou
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-slate-400">
                      tem {r.emEstoque} · sai {r.porDia}/dia ·{" "}
                      {r.diasAteAcabar === 0
                        ? "sem estoque"
                        : `acaba em ${Math.floor(r.diasAteAcabar)} dia(s)`}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-bold text-slate-800">{r.sugerido}</span>
                    <span className="block text-xs text-slate-400">{brl(r.custo)}</span>
                  </span>
                </label>
              );
            })}
          </div>

          {fornecedores.length > 0 && (
            <div className="mt-3">
              <p className="label">Mandar direto para um fornecedor</p>
              <div className="flex flex-wrap gap-2">
                {fornecedores
                  .filter((f) => txt(f.telefone).trim())
                  .slice(0, 6)
                  .map((f) => (
                    <button
                      key={f.id}
                      className="btn-secondary !py-1.5 text-xs"
                      onClick={() => mandar(txt(f.telefone))}
                    >
                      <MessageCircle size={13} /> {f.nome}
                    </button>
                  ))}
              </div>
            </div>
          )}

          <p className="mt-3 flex items-start gap-2 text-xs text-slate-500">
            <ShoppingBasket size={14} className="mt-0.5 shrink-0" />
            Quem não teve saída no período não aparece: pedir reposição de item
            parado é exatamente como o estoque encalha.
          </p>
        </>
      )}
    </Modal>
  );
};
