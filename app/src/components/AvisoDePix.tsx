import { useEffect, useRef } from "react";
import { aviso } from "./Aviso";
import { useApp } from "../store/AppStore";
import { supabase } from "../lib/supabase";
import { codigoOS } from "../lib/format";
import { notificar } from "../lib/notificacoes";
import { temModulo } from "../lib/ramos";
import {
  pixQueCairam,
  textoDoPixRecebido,
  SEGUNDOS_ENTRE_OLHADAS_DO_PIX,
  type PixPago,
} from "../lib/pix";

/**
 * "O cliente pagou e eu não fiquei sabendo."
 *
 * O Pix pelo link entra no caixa sozinho, pelo servidor — e justamente por
 * isso ninguém via: o dinheiro estava lá, mas a tela aberta no balcão só
 * mostrava depois de um F5, e o cliente chegava para buscar o aparelho
 * antes de alguém conferir.
 *
 * Com o sistema aberto, a cada 30 segundos olha SÓ a tabela de cobranças
 * (é pequena; recarregar tudo a cada 30s pesaria no 4G do balcão). Caiu Pix
 * novo: aviso na tela, notificação do navegador e recarga dos dados, para
 * o caixa e a OS já mostrarem o pagamento. Com o sistema fechado, quem
 * avisa é o Telegram da loja (api/pix.js).
 *
 * Só avisa o que caiu DEPOIS de a tela abrir: abrir o sistema de manhã e
 * receber o aviso dos Pix de ontem seria barulho.
 */
export function AvisoDePix(): null {
  const { ordens, reload, ramo } = useApp();
  const vistos = useRef(new Set<string>());
  const desde = useRef(new Date().toISOString());
  const ordensRef = useRef(ordens);
  ordensRef.current = ordens;

  useEffect(() => {
    // Pix pelo link só existe onde existe OS com link de acompanhamento.
    if (!supabase || !temModulo(ramo, "os")) return;
    let parado = false;

    const olhar = async () => {
      if (document.visibilityState !== "visible") return;
      const { data, error } = await supabase!
        .from("pix_cobrancas")
        .select("id,valor,osId,pagoEm")
        .eq("status", "approved")
        .gte("pagoEm", desde.current)
        .order("pagoEm", { ascending: true })
        .limit(20);
      // Tabela ainda não criada (migração 26 não rodada) ou sem rede: fica
      // quieto. É aviso extra, não a gravação — o dinheiro já está no banco.
      if (error || parado) return;
      const novos = pixQueCairam(data as PixPago[], vistos.current);
      if (novos.length === 0) return;
      for (const p of novos) {
        vistos.current.add(String(p.id));
        const os = ordensRef.current.find((o) => o.id === p.osId);
        const texto = textoDoPixRecebido(p.valor, os ? codigoOS(os.numero) : "");
        aviso.sucesso(`Pix recebido: ${texto}`);
        notificar("Pix recebido", texto, { chave: `pix:${p.id}`, url: "#/ordens" });
      }
      try {
        await reload();
      } catch {
        /* a recarga tem o próprio aviso de falha de carga */
      }
    };

    const t = setInterval(olhar, SEGUNDOS_ENTRE_OLHADAS_DO_PIX * 1000);
    return () => {
      parado = true;
      clearInterval(t);
    };
  }, [reload, ramo]);

  return null;
}
