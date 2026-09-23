import React, { useEffect, useRef, useState } from "react";
import { Mic, Square, UserPlus } from "lucide-react";
import { aviso } from "./Aviso";
import { useIaLigada } from "./useIaLigada";
import { useApp } from "../store/AppStore";
import { perguntarIA, paraBase64, usoDoMes } from "../lib/ia";
import { lerOSPorVoz, clienteDaVoz, preencherPelaVoz, type OSPorVoz as Ditado } from "../lib/voz-os";
import { uid, nowISO } from "../lib/format";
import type { Cliente, OrdemServico } from "../lib/types";

/** Uma OS se dita em menos de um minuto; mais que isso é conversa gravada junto */
const SEGUNDOS_MAXIMOS = 60;

/**
 * O microfone da OS nova.
 *
 * Grava no navegador, a IA transcreve e separa os campos, e o formulário é
 * PREENCHIDO — nunca salvo. A pessoa confere o que a IA ouviu e salva com
 * o botão de sempre. Só os campos vazios mudam: o que já foi digitado fica.
 *
 * Cliente que não está cadastrado não é criado sozinho: aparece o botão
 * "Cadastrar", e só grava se alguém clicar.
 */
export const OSPorVoz: React.FC<{
  os: OrdemServico;
  clientes: Cliente[];
  comSenha: boolean;
  onPreencher: (patch: Partial<OrdemServico>) => void;
}> = ({ os, clientes, comSenha, onPreencher }) => {
  const { saveCliente } = useApp();
  const gravador = useRef<MediaRecorder | null>(null);
  const pedacos = useRef<Blob[]>([]);
  const limite = useRef<number | undefined>(undefined);
  const [gravando, setGravando] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const [ditado, setDitado] = useState<Ditado | null>(null);
  const [semCadastro, setSemCadastro] = useState(false);
  const [uso, setUso] = useState("");
  const ligada = useIaLigada();

  // Sair da tela com o microfone ligado deixaria a bolinha vermelha do
  // navegador acesa, gravando nada, até fechar a aba.
  useEffect(
    () => () => {
      window.clearTimeout(limite.current);
      gravador.current?.stream.getTracks().forEach((t) => t.stop());
    },
    []
  );

  const suportado = typeof window !== "undefined" && "MediaRecorder" in window && !!navigator.mediaDevices;
  // Sem chave do Gemini na Vercel, o microfone nem aparece.
  if (!suportado || !ligada) return null;

  const enviar = async (audio: Blob) => {
    setOuvindo(true);
    try {
      const r = await perguntarIA("voz", { audio: await paraBase64(audio), tipo: audio.type || "audio/webm" });
      const v = lerOSPorVoz(r.bruto);
      const cliente = clienteDaVoz(v, clientes);
      onPreencher(preencherPelaVoz(os, v, cliente, comSenha));
      setDitado(v);
      setSemCadastro(!cliente && !!v.nomeCliente);
      setUso(usoDoMes(r.usados, r.limite));
      aviso.sucesso("Formulário preenchido. Confira o que a IA ouviu antes de salvar.");
    } catch (e) {
      aviso.erro("Não deu para usar o áudio:\n\n" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setOuvindo(false);
    }
  };

  const comecar = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      pedacos.current = [];
      r.ondataavailable = (e) => e.data.size && pedacos.current.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        window.clearTimeout(limite.current);
        setGravando(false);
        const audio = new Blob(pedacos.current, { type: r.mimeType.split(";")[0] || "audio/webm" });
        if (audio.size > 0) enviar(audio);
      };
      gravador.current = r;
      r.start();
      setGravando(true);
      limite.current = window.setTimeout(() => r.state === "recording" && r.stop(), SEGUNDOS_MAXIMOS * 1000);
    } catch {
      aviso.erro(
        "O navegador não liberou o microfone. Toque no cadeado ao lado do endereço do site e permita o microfone."
      );
    }
  };

  const cadastrar = async () => {
    if (!ditado) return;
    const novo: Cliente = { id: uid(), nome: ditado.nomeCliente, telefone: ditado.telefone, criadoEm: nowISO() } as Cliente;
    try {
      await saveCliente(novo);
      onPreencher({ clienteId: novo.id });
      setSemCadastro(false);
      aviso.sucesso(`${novo.nome} cadastrado(a) e escolhido(a) nesta OS.`);
    } catch (e) {
      aviso.erro("Não foi possível cadastrar o cliente:\n\n" + (e instanceof Error ? e.message : String(e)));
    }
  };

  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        {!gravando ? (
          <button className="btn-secondary" disabled={ouvindo} onClick={comecar}>
            <Mic size={16} /> {ouvindo ? "Entendendo o áudio..." : "Ditar a OS"}
          </button>
        ) : (
          <button className="btn-danger" onClick={() => gravador.current?.stop()}>
            <Square size={16} /> Parar e preencher
          </button>
        )}
        <span className="text-xs text-slate-500">
          {gravando
            ? "Gravando... fala nome, telefone, aparelho, defeito, senha e acessórios."
            : "Fala e o formulário se preenche. Nada é salvo sem você conferir."}
        </span>
      </div>

      {ditado && (
        <div className="mt-2 text-xs text-slate-600">
          <p>
            <b>A IA ouviu:</b> “{ditado.transcricao || "sem transcrição"}”{uso ? ` · ${uso}` : ""}
          </p>
          {ditado.avisos.map((a, i) => (
            <p key={i} className="text-amber-700">
              {a}
            </p>
          ))}
          {semCadastro && (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-amber-800">
              {ditado.nomeCliente}
              {ditado.telefone ? ` (${ditado.telefone})` : ""} não está cadastrado(a).
              <button className="btn-secondary !py-1 text-xs" onClick={cadastrar}>
                <UserPlus size={13} /> Cadastrar
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  );
};
