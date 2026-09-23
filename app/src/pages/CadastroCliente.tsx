import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { supabase, supabaseEnabled } from "../lib/supabase";
import { MarcaDaLoja } from "../components/MarcaDaLoja";
import { corDaLoja } from "../lib/rastreio";
import { soDigitos } from "../lib/format";
import { hojeISO } from "../lib/contas";
import { erroDoFormulario, type LojaDaArea } from "../lib/area-cliente";
import { Caixa, Campo, Erro, Botao } from "./AreaCliente";

/**
 * Só o formulário de cadastro: o cliente preenche e o cadastro cai na lista
 * de clientes da loja. Sem senha e sem área — é o "preenche aqui que eu já
 * te cadastro", para adiantar a fila do balcão.
 *
 * Quem grava e confere é a função do banco (supabase-migracao-cadastro-link.sql).
 */
export const CadastroCliente: React.FC = () => {
  const { loja = "" } = useParams();
  const [dadosLoja, setDadosLoja] = useState<LojaDaArea | null | undefined>(undefined);
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [telefone, setTelefone] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [email, setEmail] = useState("");
  const [endereco, setEndereco] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    if (!supabaseEnabled || !supabase || !loja) {
      setDadosLoja(null);
      return;
    }
    supabase
      .rpc("area_cliente_loja", { p_loja: loja })
      .then(({ data, error }) => setDadosLoja(error ? null : ((data as LojaDaArea) ?? null)));
  }, [loja]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const problema = erroDoFormulario({ nome, cpf, telefone, nascimento, email, endereco }, hojeISO());
    if (problema) return setErro(problema);
    if (!supabase) return;
    setErro("");
    setEnviando(true);
    try {
      const { data, error } = await supabase.rpc("cadastrar_cliente_simples", {
        p_loja: loja,
        p_nome: nome.trim(),
        p_cpf: soDigitos(cpf),
        p_telefone: soDigitos(telefone),
        p_nascimento: nascimento,
        p_email: email.trim(),
        p_endereco: endereco.trim(),
      });
      if (error) throw new Error(error.message);
      const r = data as { ok?: boolean; erro?: string };
      if (r?.erro || !r?.ok) return setErro(r?.erro || "Não deu certo. Tenta de novo.");
      setPronto(true);
    } catch (e) {
      setErro("Não deu para enviar agora: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setEnviando(false);
    }
  };

  const cor = corDaLoja(dadosLoja?.cor);

  return (
    <div className="min-h-screen bg-papel p-4 font-grotesca text-tinta">
      <div className="mx-auto max-w-lg py-6">
        <header className="mb-5 overflow-hidden rounded-md border border-linha bg-cartao">
          {cor && <div className="h-1.5" style={{ backgroundColor: cor }} />}
          <div className="flex items-center gap-3 p-4">
            <MarcaDaLoja logoUrl={dadosLoja?.logo || undefined} tamanho={44} />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold leading-tight">{dadosLoja?.nome || "Cadastro"}</h1>
              <p className="text-sm text-tinta-suave">Seu cadastro em um minuto</p>
            </div>
          </div>
        </header>

        {dadosLoja === undefined ? (
          <Caixa>
            <p className="text-center text-tinta-suave">Abrindo...</p>
          </Caixa>
        ) : dadosLoja === null ? (
          <Caixa>
            <p className="text-center font-semibold">Este link não está funcionando.</p>
            <p className="mt-1 text-center text-sm text-tinta-suave">Pede o link de novo pra loja.</p>
          </Caixa>
        ) : pronto ? (
          <Caixa>
            <CheckCircle2 size={40} className="mx-auto mb-2 text-status-pronta" />
            <p className="text-center text-lg font-bold">Pronto, cadastro feito!</p>
            <p className="mt-1 text-center text-sm text-tinta-suave">
              A loja já tem seus dados. Pode fechar esta página.
            </p>
          </Caixa>
        ) : (
          <Caixa>
            <form onSubmit={enviar} className="space-y-3">
              <Campo rotulo="Nome completo" valor={nome} mudar={setNome} auto="name" />
              <Campo rotulo="CPF" valor={cpf} mudar={setCpf} modo="numeric" />
              <Campo rotulo="WhatsApp com DDD" valor={telefone} mudar={setTelefone} modo="tel" auto="tel" />
              <Campo rotulo="Data de nascimento" valor={nascimento} mudar={setNascimento} tipo="date" />
              <Campo rotulo="E-mail (opcional)" valor={email} mudar={setEmail} tipo="email" auto="email" />
              <Campo rotulo="Endereço (opcional)" valor={endereco} mudar={setEndereco} auto="street-address" />
              <Erro texto={erro} />
              <Botao enviando={enviando}>Enviar cadastro</Botao>
              <p className="text-center text-xs text-tinta-suave">Seus dados ficam só com a loja.</p>
            </form>
          </Caixa>
        )}
      </div>
    </div>
  );
};
