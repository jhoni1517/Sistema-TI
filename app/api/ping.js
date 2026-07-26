// Teste rápido: se abrir esta URL e aparecer "pong", as funções estão publicadas.
export default function handler(req, res) {
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.status(200).send("pong - as funcoes do servidor estao funcionando");
}
