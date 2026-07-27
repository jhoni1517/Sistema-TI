import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Registra o service worker (PWA / offline) apenas em produção
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  let recarregando = false;
  // Quando uma versão nova do sistema assume, recarrega uma vez sozinho —
  // assim ninguém fica olhando para uma tela antiga sem saber.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (recarregando) return;
    recarregando = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => reg.update())
      .catch(() => {
        /* ignora falha de registro */
      });
  });
}
