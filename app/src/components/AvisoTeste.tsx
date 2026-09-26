import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Hourglass, X } from "lucide-react";
import { useApp } from "../store/AppStore";
import { aviso } from "./Aviso";
import { supabase } from "../lib/supabase";
import { emDemo, obterLoja } from "../lib/db";
import { whatsappLink } from "../lib/format";
import { primeirosPassos } from "../lib/onboarding";
import { temModulo } from "../lib/ramos";
import { minhaLoja, emTeste, carregarSistemaConfig, type Loja } from "../lib/assinatura";
import { etapaDoTeste, recadoDoTeste, diasDoTeste, type UsoNoTeste } from "../lib/sequencia-teste";

/**
 * O recado do período grátis no Painel (regras em lib/sequencia-teste.ts).
 * Um por vez, e some quando a pessoa dispensa: aviso que não sai de cima
 * vira papel de parede.
 */
export const AvisoTeste: React.FC = () => {
  const { config, produtos, ordens, vendas, ramo, saveConfig } = useApp();
  const navigate = useNavigate();
  const [loja, setLoja] = useState<Loja | null>(null);
  const [rastreios, setRastreios] = useState(0);
  const [suporte, setSuporte] = useState("");

  useEffect(() => {
    const id = obterLoja();
    if (emDemo() || !id || !supabase) return;
    let vivo = true;
    minhaLoja(id)
      .then((l) => vivo && setLoja(l))
      .catch(() => undefined);
    // O número do dia 7. Sem a migração, fica zero e o recado ensina a mandar o link.
    supabase
      .rpc("rastreios_da_loja")
      .then(({ data }) => vivo && setRastreios(Number(data) || 0), () => undefined);
    carregarSistemaConfig()
      .then((c) => vivo && setSuporte(c?.whatsapp_suporte || ""))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);

  const temOS = temModulo(ramo, "os");
  const uso = useMemo((): UsoNoTeste | null => {
    if (!loja || !emTeste(loja) || !loja.criadoEm || !loja.venceEm) return null;
    const passos = primeirosPassos(config, { produtos: produtos.length, ordens: ordens.length, vendas: vendas.length }, temOS);
    return {
      ...diasDoTeste(loja.criadoEm, loja.venceEm, new Date().toISOString().slice(0, 10)),
      passosCompletos: passos.every((p) => p.feito),
      ordens: ordens.length,
      vendas: vendas.length,
      rastreios,
      temOS,
    };
  }, [loja, config, produtos.length, ordens.length, vendas.length, rastreios, temOS]);

  const etapa = uso ? etapaDoTeste(uso) : null;
  if (!uso || !etapa || (config.avisosTeste || []).includes(etapa)) return null;
  const r = recadoDoTeste(etapa, uso);

  const dispensar = async () => {
    try {
      await saveConfig({ ...config, avisosTeste: [...(config.avisosTeste || []), etapa] });
    } catch (e) {
      aviso.erro("Não salvou: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const acao =
    etapa === "d1"
      ? { texto: "Ver os passos", ir: () => navigate("/config") }
      : etapa === "d3" && suporte
        ? { texto: "Chamar no WhatsApp", ir: () => window.open(whatsappLink(suporte, "Oi! Estou no teste do Sistema TI e queria ajuda para configurar."), "_blank", "noopener") }
        : etapa === "d7" && temOS
          ? { texto: "Ver as OS", ir: () => navigate("/ordens") }
          : etapa === "d25"
            ? { texto: "Garantir a vaga", ir: () => navigate("/assinatura") }
            : null;

  return (
    <div className="card mb-6 border-l-4 border-sinal">
      <div className="flex items-start gap-3">
        <Hourglass size={20} className="mt-0.5 shrink-0 text-sinal" />
        <div className="min-w-0 flex-1">
          <p className="font-bold">{r.titulo}</p>
          <p className="mt-1 text-sm text-tinta-suave">{r.texto}</p>
          {acao && (
            <button className="btn-primary mt-3" onClick={acao.ir}>
              {acao.texto}
            </button>
          )}
        </div>
        <button className="shrink-0 p-1 text-tinta-suave" onClick={dispensar} aria-label="Dispensar aviso">
          <X size={18} />
        </button>
      </div>
    </div>
  );
};
