// Impressão limpa via iframe oculto — não depende da tela/tema do app.
/**
 * Largura do papel.
 *
 * "a4" é a folha comum; "58" e "80" são as bobinas térmicas de balcão, em
 * milímetros. O recibo saía sempre em A4 e, na bobina, a impressora cortava
 * a metade direita de tudo — inclusive do total.
 */
export type Papel = "a4" | "58" | "80";

const MEDIDAS: Record<Papel, { largura: string; margem: string; fonte: string }> = {
  a4: { largura: "auto", margem: "12mm", fonte: "13px" },
  // 58mm de bobina tem ~48mm imprimíveis; 80mm tem ~72mm. Usar a largura
  // cheia joga o fim de cada linha para fora da área de impressão.
  "58": { largura: "48mm", margem: "2mm", fonte: "10px" },
  "80": { largura: "72mm", margem: "3mm", fonte: "11px" },
};

export function printHTML(inner: string, title = "Impressão", papel: Papel = "a4"): void {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
  });
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) return;

  doc.open();
  doc.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title>
  <style>
    @page { margin: ${MEDIDAS[papel].margem}; size: ${papel === "a4" ? "auto" : MEDIDAS[papel].largura + " auto"}; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: ${MEDIDAS[papel].fonte}; line-height: 1.4; margin: 0; ${papel === "a4" ? "" : `width:${MEDIDAS[papel].largura};`} }
    ${
      papel === "a4"
        ? ""
        : `/* Bobina: sem colunas lado a lado, que não cabem em 48mm.
             O que era linha de duas colunas vira duas linhas. */
           .row { display: block; }
           .box { border: 0; padding: 0; margin-bottom: 6px; }
           .tot { width: 100%; margin-left: 0; }
           .sign { display: block; margin-top: 24px; }
           .sign div { margin-top: 18px; }
           .head h1 { font-size: 14px; }
           table { font-size: ${MEDIDAS[papel].fonte}; }
           th, td { padding: 2px 1px; }`
    }
    h1,h2,h3 { margin: 0; }
    .center { text-align: center; }
    .right { text-align: right; }
    .muted { color: #666; }
    .head { text-align: center; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 14px; }
    .head h1 { font-size: 20px; }
    .head p { margin: 2px 0; font-size: 12px; color: #444; }
    .row { display: flex; justify-content: space-between; gap: 16px; }
    .box { border: 1px solid #ddd; border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; }
    .label { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #888; }
    .val { font-size: 13px; margin-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; }
    th { text-align: left; font-size: 11px; text-transform: uppercase; color: #888; border-bottom: 1px solid #ccc; padding: 6px 4px; }
    td { padding: 6px 4px; border-bottom: 1px solid #eee; }
    .tot { margin-left: auto; width: 260px; }
    .tot .line { display: flex; justify-content: space-between; padding: 3px 0; }
    .tot .grand { border-top: 1px solid #111; margin-top: 4px; padding-top: 6px; font-size: 16px; font-weight: bold; }
    .sign { display: flex; gap: 40px; margin-top: 40px; }
    .sign div { flex: 1; text-align: center; border-top: 1px solid #111; padding-top: 4px; font-size: 11px; }
    .foot { margin-top: 20px; text-align: center; font-size: 11px; color: #666; }
    .badge { display: inline-block; padding: 2px 8px; border: 1px solid #111; border-radius: 999px; font-size: 11px; font-weight: bold; }
  </style></head><body>${inner}</body></html>`);
  doc.close();

  const w = iframe.contentWindow;
  const done = () => setTimeout(() => iframe.remove(), 1000);
  setTimeout(() => {
    w?.focus();
    w?.print();
    done();
  }, 300);
}
