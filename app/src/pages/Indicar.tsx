import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Gift } from "lucide-react";
import { supabase, supabaseEnabled } from "../lib/supabase";
import { abrirWhatsapp } from "../lib/format";
import { INDICACAO_PENDENTE, normalizarCodigo, mensagemQueroPorIndicacao } from "../lib/indicacao";

/**
 * O link que um lojista manda para outro: "fulano te indicou".
 *
 * Sem login. O código fica guardado no aparelho e é usado sozinho quando a
 * conta da loja nova ficar pronta (ver `AplicarIndicacao` no Layout) — o
 * caminho passa por convite e e-mail, e ninguém lembra de um código dias
 * depois.
 */
export const Indicar: React.FC = () => {
  const { codigo = "" } = useParams();
  const navigate = useNavigate();
  const cod = normalizarCodigo(codigo);
  const [quem, setQuem] = useState<string | null | undefined>(undefined);
  const [contato, setContato] = useState("");

  useEffect(() => {
    if (!supabaseEnabled || !supabase || !cod) return setQuem(null);
    supabase.rpc("loja_que_indica", { p_codigo: cod }).then(({ data, error }) => {
      const nome = !error && typeof data === "string" ? data : null;
      setQuem(nome);
      if (nome) {
        try {
          localStorage.setItem(INDICACAO_PENDENTE, cod);
        } catch {
          /* sem armazenamento: o código segue no recado do WhatsApp */
        }
      }
    });
    supabase.rpc("contato_do_sistema").then(({ data }) => setContato(typeof data === "string" ? data : ""));
  }, [cod]);

  return (
    <div className="min-h-screen bg-papel p-4 font-grotesca text-tinta">
      <div className="mx-auto max-w-md py-10">
        <div className="rounded-md border border-linha bg-cartao p-6 text-center">
          {quem === undefined ? (
            <p className="text-tinta-suave">Abrindo...</p>
          ) : quem === null ? (
            <>
              <p className="font-semibold">Este link de indicação não está valendo.</p>
              <p className="mt-1 text-sm text-tinta-suave">Peça o link de novo para quem te indicou.</p>
            </>
          ) : (
            <>
              <Gift size={40} className="mx-auto text-sinal" />
              <h1 className="mt-3 text-2xl font-bold">{quem} te indicou</h1>
              <p className="mt-2 text-tinta-suave">
                O sistema de ordem de serviço, caixa e estoque que a {quem} usa. Entrando por este link você ganha{" "}
                <b className="text-tinta">30 dias a mais de teste grátis</b>.
              </p>
              <p className="valor mt-4 inline-block rounded bg-papel px-3 py-1 text-lg font-bold tracking-widest">{cod}</p>
              <div className="mt-5 grid gap-2">
                {contato && (
                  <button className="btn-primary" onClick={() => abrirWhatsapp(contato, mensagemQueroPorIndicacao(quem, cod))}>
                    Quero minha conta
                  </button>
                )}
                <button className="btn-secondary" onClick={() => navigate("/")}>
                  Ver o sistema funcionando
                </button>
              </div>
              <p className="mt-4 text-xs text-tinta-suave">
                O bônus entra sozinho quando sua loja for criada neste aparelho. Em outro, é só digitar o código em
                Assinatura.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
