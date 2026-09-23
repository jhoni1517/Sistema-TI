import React, { useEffect, useState } from "react";
import { Copy, MessageCircle, UserRound } from "lucide-react";
import { aviso } from "./Aviso";
import { db, obterLoja } from "../lib/db";
import { abrirWhatsapp } from "../lib/format";
import { linkDaArea, mensagemDeCadastro } from "../lib/area-cliente";

/**
 * Liga a área do cliente e entrega o link de cadastro.
 *
 * Nasce desligada, como o catálogo: link público que grava cadastro na loja
 * é decisão do dono, não padrão.
 */
export const AreaDoClienteLoja: React.FC<{ nomeLoja?: string }> = ({ nomeLoja }) => {
  const link = linkDaArea(`${window.location.origin}${window.location.pathname}`, obterLoja());
  const [ativa, setAtiva] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    db.loja
      .areaClienteAtiva()
      .then(setAtiva)
      .catch(() => setAtiva(false))
      .finally(() => setCarregando(false));
  }, []);

  const alternar = async () => {
    setSalvando(true);
    try {
      await db.loja.definirAreaCliente(!ativa);
      setAtiva(!ativa);
      aviso.sucesso(!ativa ? "Área do cliente no ar." : "Área do cliente desligada. O link para de abrir.");
    } catch (e) {
      aviso.erro("Não foi possível mudar a área do cliente:\n\n" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSalvando(false);
    }
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(link);
      aviso.sucesso("Link copiado.");
    } catch {
      prompt("Copie o link:", link);
    }
  };

  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-tinta">
        <UserRound size={15} /> Área do cliente
      </p>
      <p className="mb-3 text-sm text-tinta-suave">
        O cliente se cadastra sozinho pelo link e depois entra com CPF e senha para ver os consertos dele: os da
        bancada e os que já foram feitos, com garantia. Quem já é cliente recebe o acesso pelo botão
        <b> Acesso</b> na tela Clientes.
      </p>

      <button
        type="button"
        disabled={carregando || salvando}
        onClick={alternar}
        className={`flex w-full items-center justify-between gap-3 rounded-md border p-3 text-left ${
          ativa ? "border-status-pronta bg-status-pronta/10" : "border-linha bg-concreto"
        } ${carregando || salvando ? "opacity-60" : ""}`}
      >
        <span>
          <span className="block font-semibold text-tinta">
            {carregando ? "Conferindo..." : ativa ? "No ar" : "Desligada"}
          </span>
          <span className="block text-xs text-tinta-suave">
            {ativa ? "Quem tem o link consegue se cadastrar" : "O link não abre"}
          </span>
        </span>
        <span className={`relative h-7 w-12 shrink-0 rounded-full ${ativa ? "bg-status-pronta" : "bg-linha"}`}>
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${ativa ? "left-6" : "left-1"}`} />
        </span>
      </button>

      {ativa && link && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-secondary !py-1.5 text-xs" onClick={copiar}>
            <Copy size={14} /> Copiar link de cadastro
          </button>
          <button
            type="button"
            className="btn-secondary !py-1.5 text-xs"
            onClick={() => abrirWhatsapp("", mensagemDeCadastro(nomeLoja || "", link))}
          >
            <MessageCircle size={14} /> Mandar no WhatsApp
          </button>
        </div>
      )}
    </div>
  );
};
