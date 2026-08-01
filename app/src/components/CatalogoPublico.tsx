import React, { useEffect, useState } from "react";
import { Store, Copy, ExternalLink, MessageCircle } from "lucide-react";
import { aviso } from "./Aviso";
import { db, obterLoja } from "../lib/db";
import { abrirWhatsapp } from "../lib/format";

/**
 * A vitrine pública: liga, desliga e manda o link.
 *
 * Mora num componente porque aparece em dois lugares. O que vale é o do
 * Estoque: o catálogo é a lista de produtos publicada, e é olhando os
 * produtos que alguém pensa "queria mandar isso para o cliente". Enterrado
 * no meio do formulário de Configurações, ninguém achava — e quem abria o
 * link recebia "este catálogo não está disponível" sem saber o porquê.
 */
export const CatalogoPublico: React.FC<{ nomeLoja?: string }> = ({ nomeLoja }) => {
  const loja = obterLoja();
  const link = loja
    ? `${window.location.origin}${window.location.pathname}#/catalogo/${loja}`
    : "";

  const [ativo, setAtivo] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    // Falha aqui não pode derrubar a tela inteira: sem resposta, o
    // interruptor fica desligado, que é o lado seguro de errar.
    db.loja
      .catalogoAtivo()
      .then(setAtivo)
      .catch(() => setAtivo(false))
      .finally(() => setCarregando(false));
  }, []);

  const alternar = async (ligar: boolean) => {
    setSalvando(true);
    try {
      await db.loja.definirCatalogo(ligar);
      setAtivo(ligar);
      aviso.sucesso(
        ligar
          ? "Catálogo no ar. Qualquer pessoa com o link vê nome, foto e preço."
          : "Catálogo desligado. O link para de abrir."
      );
    } catch (e) {
      // Engolir aqui faria o interruptor voltar sozinho sem explicação, e a
      // loja acharia que publicou quando não publicou.
      aviso.erro(
        "Não foi possível mudar o catálogo:\n\n" +
          (e instanceof Error ? e.message : String(e))
      );
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div>
      <p className="mb-3 text-sm text-slate-500">
        Uma página com foto e preço dos seus produtos, para mandar no WhatsApp em
        vez de mandar foto por foto. Mostra nome, foto, preço e se tem ou não tem
        — nunca custo, margem, fornecedor nem a quantidade exata.
      </p>

      {/* O interruptor primeiro, porque é a decisão. O link só serve depois
          que ela foi tomada. */}
      <button
        type="button"
        disabled={carregando || salvando}
        onClick={() => alternar(!ativo)}
        className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition ${
          ativo
            ? "border-emerald-300 bg-emerald-50"
            : "border-slate-200 bg-slate-50"
        } ${carregando || salvando ? "opacity-60" : ""}`}
      >
        <span className="min-w-0">
          <span
            className={`block font-semibold ${ativo ? "text-emerald-700" : "text-slate-700"}`}
          >
            {carregando ? "Conferindo..." : ativo ? "No ar" : "Desligado"}
          </span>
          <span className="block text-xs text-slate-500">
            {ativo
              ? "Qualquer pessoa com o link vê seus preços"
              : "Ninguém consegue abrir o link"}
          </span>
        </span>
        <span
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${
            ativo ? "bg-emerald-500" : "bg-slate-300"
          }`}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${
              ativo ? "left-6" : "left-1"
            }`}
          />
        </span>
      </button>

      {!ativo && !carregando && (
        <p className="mt-2 text-xs text-slate-400">
          Nasce desligado: ninguém publica preço sem escolher publicar. Lembre
          que concorrente também abre o link.
        </p>
      )}

      {ativo && !link && (
        <p className="mt-3 text-xs text-amber-700">Entre de novo para gerar o link.</p>
      )}

      {ativo && link && (
        <div className="mt-3">
          <input
            readOnly
            className="input w-full !py-2 text-xs"
            value={link}
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              className="btn-primary !py-2 text-xs"
              onClick={() =>
                // Sem emoji: em alguns aparelhos chega como "?" e suja o recado.
                abrirWhatsapp(
                  "",
                  `Confira os produtos da ${nomeLoja || "nossa loja"}:\n${link}`
                )
              }
            >
              <MessageCircle size={16} /> Mandar no WhatsApp
            </button>
            <button
              className="btn-secondary !py-2 text-xs"
              onClick={() => {
                navigator.clipboard?.writeText(link);
                aviso.sucesso("Link copiado.");
              }}
            >
              <Copy size={16} /> Copiar
            </button>
            <a
              className="btn-secondary !py-2 text-xs"
              href={link}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={16} /> Ver como o cliente vê
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

/** O cabeçalho com o ícone, para quem mostra isto dentro de uma caixa */
export const TituloCatalogo: React.FC = () => (
  <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-600">
    <Store size={15} /> Catálogo público
  </p>
);
