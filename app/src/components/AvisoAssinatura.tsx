import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Lock } from "lucide-react";
import { obterLoja } from "../lib/db";
import { minhaSituacao, minhaLoja, diasParaVencer, type Situacao } from "../lib/assinatura";

/**
 * Faixa de aviso da assinatura.
 *
 * Existe para que ninguém descubra que a mensalidade venceu ao tentar
 * salvar uma OS com o cliente esperando no balcão. A situação vem do banco,
 * que é quem decide de verdade — a tela só antecipa a notícia.
 */
export const AvisoAssinatura: React.FC = () => {
  const [situacao, setSituacao] = useState<Situacao | null>(null);
  const [dias, setDias] = useState<number | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const s = await minhaSituacao();
      if (!vivo) return;
      setSituacao(s);

      // Só busca a data quando ela muda a mensagem (vencendo ou vencida)
      const id = obterLoja();
      if (!id) return;
      const loja = await minhaLoja(id);
      if (vivo) setDias(diasParaVencer(loja?.venceEm));
    })();
    return () => {
      vivo = false;
    };
  }, []);

  if (!situacao) return null;

  // Em dia e longe do vencimento: não polui a tela
  if (situacao === "ativa" && (dias === null || dias > 5)) return null;

  if (situacao === "ativa") {
    return (
      <Faixa cor="bg-amber-50 text-amber-800 border-amber-200" icone={<AlertTriangle size={16} />}>
        Sua mensalidade vence em <b>{dias} dia{dias === 1 ? "" : "s"}</b>.{" "}
        <Link to="/assinatura" className="font-bold underline">
          Ver como pagar
        </Link>
      </Faixa>
    );
  }

  if (situacao === "tolerancia") {
    return (
      <Faixa cor="bg-amber-50 text-amber-800 border-amber-200" icone={<AlertTriangle size={16} />}>
        Mensalidade vencida. O sistema ainda funciona por poucos dias.{" "}
        <Link to="/assinatura" className="font-bold underline">
          Regularizar agora
        </Link>
      </Faixa>
    );
  }

  return (
    <Faixa cor="bg-red-50 text-red-800 border-red-200" icone={<Lock size={16} />}>
      Cadastro pausado por falta de pagamento. Você continua consultando e
      imprimindo tudo.{" "}
      <Link to="/assinatura" className="font-bold underline">
        Liberar sistema
      </Link>
    </Faixa>
  );
};

const Faixa: React.FC<{ cor: string; icone: React.ReactNode; children: React.ReactNode }> = ({
  cor,
  icone,
  children,
}) => (
  <div
    className={`no-print flex items-center justify-center gap-2 border-b px-4 py-2 text-center text-sm ${cor}`}
  >
    <span className="shrink-0">{icone}</span>
    <span>{children}</span>
  </div>
);
