import { useEffect, useState } from "react";
import { iaLigada } from "../lib/ia";

/** A tela só mostra botão de IA quando o servidor diz que ela está ligada. */
export function useIaLigada(): boolean {
  const [ligada, setLigada] = useState(false);
  useEffect(() => {
    let vivo = true;
    iaLigada().then((v) => vivo && setLigada(v));
    return () => {
      vivo = false;
    };
  }, []);
  return ligada;
}
