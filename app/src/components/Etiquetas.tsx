import React, { useMemo, useState } from "react";
import { Printer, Search, Barcode, Tag } from "lucide-react";
import { aviso } from "./Aviso";
import { Modal, InputNumero } from "./ui";
import { useApp } from "../store/AppStore";
import { printHTML } from "../lib/print";
import { folhaDeEtiquetas } from "../lib/recibo";
import { brl, txt } from "../lib/format";
import { normalizar } from "../lib/busca";
import { etiquetasDe, proximoCodigoInterno, ehCodigoInterno } from "../lib/etiqueta";
import { precoEfetivo, promocaoValendo } from "../lib/promocao";
import type { Produto } from "../lib/types";

/**
 * Imprimir etiqueta de prateleira.
 *
 * Duas coisas que a prateleira exigia e o sistema não dava:
 *
 * - **Produto sem código de fábrica** (granel, fracionado, peça avulsa) só
 *   podia ser achado digitando o nome, e digitar nome com fila é onde o item
 *   errado entra no carrinho.
 * - **Preço escrito à mão** nunca acompanha a promoção, e a diferença entre
 *   a prateleira e o caixa aparece na frente do cliente.
 */
export const Etiquetas: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { produtos, config, saveProduto } = useApp();
  const [busca, setBusca] = useState("");
  const [quantidades, setQuantidades] = useState<Record<string, number>>({});
  const [gerando, setGerando] = useState(false);

  const lista = useMemo(() => {
    const t = normalizar(busca);
    return produtos
      .filter((p) => !p.servico)
      .filter((p) => (!t ? true : normalizar(p.nome).includes(t)))
      .sort((a, b) => txt(a.nome).localeCompare(txt(b.nome)))
      .slice(0, 60);
  }, [produtos, busca]);

  const escolhidos = useMemo(
    () => produtos.filter((p) => (quantidades[p.id] || 0) > 0),
    [produtos, quantidades]
  );

  const totalEtiquetas = escolhidos.reduce((s, p) => s + (quantidades[p.id] || 0), 0);

  /**
   * Cria o código de barras interno de quem não tem.
   *
   * Gerar na hora da impressão em vez de exigir cadastro antes: quem chega
   * aqui já está com o produto na mão querendo etiquetar.
   */
  const gerarCodigos = async () => {
    const semCodigo = escolhidos.filter((p) => !txt(p.codigoBarras).trim());
    if (semCodigo.length === 0) return aviso.info("Todos os escolhidos já têm código.");
    if (
      !confirm(
        `Criar código de barras da loja para ${semCodigo.length} produto(s)?\n\n` +
          "O código começa com 2, que é a faixa reservada à própria loja — nenhum " +
          "fabricante usa, então não colide com produto de prateleira."
      )
    ) {
      return;
    }
    setGerando(true);
    try {
      // Um por vez, recontando: gerar todos de uma vez a partir da mesma
      // lista criaria códigos repetidos, e código repetido faz o leitor
      // trazer o produto errado com o mesmo bipe.
      let base: Produto[] = produtos;
      for (const p of semCodigo) {
        const codigo = proximoCodigoInterno(base);
        const atualizado = { ...p, codigoBarras: codigo };
        await saveProduto(atualizado);
        base = [...base, atualizado];
      }
      aviso.sucesso(`${semCodigo.length} código(s) criado(s).`);
    } catch (e) {
      aviso.erro(
        "Não foi possível criar os códigos:\n\n" + (e instanceof Error ? e.message : String(e))
      );
    } finally {
      setGerando(false);
    }
  };

  const imprimir = () => {
    if (escolhidos.length === 0) return aviso.alerta("Escolha ao menos um produto.");
    // Sempre A4: a folha de etiquetas é uma grade de três colunas, e forçar
    // isso na bobina de 48mm cortaria duas delas.
    printHTML(folhaDeEtiquetas(etiquetasDe(escolhidos, quantidades), config), "Etiquetas", "a4");
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Etiquetas de prateleira"
      maxWidth="max-w-2xl"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Fechar
          </button>
          <button className="btn-secondary" disabled={gerando} onClick={gerarCodigos}>
            <Barcode size={16} /> Criar código
          </button>
          <button className="btn-primary" onClick={imprimir}>
            <Printer size={16} /> Imprimir {totalEtiquetas > 0 ? `(${totalEtiquetas})` : ""}
          </button>
        </>
      }
    >
      <div className="relative mb-3">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          autoFocus
          className="input pl-10"
          placeholder="Filtrar produtos"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      <p className="mb-3 text-xs text-slate-500">
        O preço da etiqueta é o mesmo que o caixa cobra — com promoção valendo, sai o
        promocional. Etiqueta com o preço cheio durante a promoção é pior do que não ter
        etiqueta.
      </p>

      <div className="max-h-[45vh] space-y-1 overflow-y-auto">
        {lista.map((p) => (
          <div
            key={p.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-100 px-3 py-2"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-700">
                {p.nome}
                {promocaoValendo(p) && (
                  <span className="badge ml-2 bg-emerald-100 text-emerald-700">
                    <Tag size={10} /> promoção
                  </span>
                )}
              </span>
              <span className="block text-xs text-slate-400">
                {brl(precoEfetivo(p))}
                {p.porPeso ? "/kg" : ""} ·{" "}
                {txt(p.codigoBarras).trim()
                  ? `${p.codigoBarras}${ehCodigoInterno(p.codigoBarras || "") ? " (da loja)" : ""}`
                  : "sem código"}
              </span>
            </span>
            <div className="w-24">
              <InputNumero
                className="input !py-1.5 text-sm"
                min={0}
                value={quantidades[p.id] ?? 0}
                onChange={(v) => setQuantidades((q) => ({ ...q, [p.id]: v ?? 0 }))}
              />
            </div>
          </div>
        ))}
        {lista.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-400">Nenhum produto.</p>
        )}
      </div>
    </Modal>
  );
};
