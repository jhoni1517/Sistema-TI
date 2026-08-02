import React from "react";
import { Wrench } from "lucide-react";

/**
 * O quadradinho da loja no topo do sistema.
 *
 * Com logo cadastrada, é a logo. Sem logo, é a chave inglesa no gradiente
 * laranja — que é a marca do sistema e serve enquanto a loja não tem a dela.
 *
 * Existe como componente porque aparece em três lugares (menu lateral, barra
 * do celular e abertura), e três cópias divergem no dia em que alguém mexe
 * numa só.
 *
 * A logo vem do endereço do arquivo, não do arquivo: `produtos` e
 * `configuracoes` são lidos inteiros em toda carga, e imagem embutida faria
 * cada F5 baixar megabytes no 4G do balcão.
 */
export const MarcaDaLoja: React.FC<{
  logoUrl?: string;
  /** Lado do quadrado em pixels */
  tamanho?: number;
  className?: string;
}> = ({ logoUrl, tamanho = 36, className = "" }) => {
  const lado = { width: tamanho, height: tamanho };

  if (logoUrl) {
    return (
      <div
        style={lado}
        className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white ${className}`}
      >
        {/* Fundo branco de propósito: logo de loja quase sempre vem com
            fundo transparente ou claro, e sobre o menu escuro ela some. */}
        <img
          src={logoUrl}
          alt=""
          className="h-full w-full object-contain"
          /* Falha de carregamento não pode deixar um ícone quebrado no topo
             do sistema o dia inteiro. */
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={lado}
      className={`flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 ${className}`}
    >
      <Wrench
        size={Math.round(tamanho * 0.5)}
        className="text-stone-900"
        strokeWidth={2.5}
      />
    </div>
  );
};
