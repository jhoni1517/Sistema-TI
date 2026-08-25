import React from "react";
import { Link } from "react-router-dom";
import { PackageX, ArrowLeft, MessageCircle } from "lucide-react";
import { useApp } from "../store/AppStore";
import { RAMO_META, type Modulo } from "../lib/ramos";

/**
 * Tela de módulo que a loja não contratou.
 *
 * Redirecionar calado seria mais fácil, mas quem clicou num link recebido
 * pelo WhatsApp, ou digitou o endereço, cairia no painel sem entender por
 * quê — e ia achar que o sistema quebrou. Dizer o que é e como conseguir
 * custa uma tela e evita um chamado.
 *
 * O tom importa: quem está lendo é cliente pagante que abriu a porta
 * errada, não alguém tentando burlar. Nada de "acesso negado".
 */
const NOME_MODULO: Record<Modulo, string> = {
  os: "Ordens de Serviço",
  rastreio: "Acompanhamento público",
  pdv: "Vender (frente de caixa)",
  delivery: "Entregas",
  mesas: "Comandas de mesa",
  producao: "Fila de preparo",
};

export const ForaDoPlano: React.FC<{ modulo: Modulo }> = ({ modulo }) => {
  const { ramoContratado, config } = useApp();
  const contratado = RAMO_META[ramoContratado];
  const suporte = (config.telefoneLoja || "").replace(/\D/g, "");

  return (
    <div className="mx-auto max-w-md py-10 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <PackageX size={32} />
      </div>

      <h1 className="text-xl font-bold text-slate-800">
        {NOME_MODULO[modulo]} não faz parte do seu plano
      </h1>

      <p className="mt-2 text-sm text-slate-600">
        Seu sistema é o de <b>{contratado.label}</b> — {contratado.descricao.toLowerCase() /* texto-cru-proposital: virar a frase em minúscula no meio do texto, não comparar nada */}.
        Esta tela pertence a outro tipo de loja.
      </p>

      <p className="mt-4 text-sm text-slate-500">
        Se o seu negócio mudou ou você quer conhecer os outros módulos, fale com
        o suporte. Nada do que você já cadastrou se perde ao trocar de plano.
      </p>

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link to="/" className="btn-primary">
          <ArrowLeft size={18} /> Voltar ao painel
        </Link>
        {suporte.length >= 10 && (
          <a
            href={`https://wa.me/55${suporte}?text=${encodeURIComponent(
              `Olá! Gostaria de saber sobre o módulo ${NOME_MODULO[modulo]}.`
            )}`}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary"
          >
            <MessageCircle size={18} /> Falar com o suporte
          </a>
        )}
      </div>
    </div>
  );
};
