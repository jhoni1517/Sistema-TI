// ============================================================
//  IA do balcão — Gemini
//  Endpoint: /api/ia?acao=...
//
//    acao=ler-nota     POST { imagem, tipo }        foto de DANFE, cupom ou print
//    acao=diagnostico  POST { tipo, marca, modelo, defeito, resumoLocal }
//    acao=voz          POST { audio, tipo }         áudio gravado no navegador
//
// UMA função para as três, e não ler-nota.js, diagnostico.js e voz-os.js:
// o plano Hobby da Vercel tem teto de 12 funções, e cada arquivo em api/
// conta uma. Com três arquivos o sistema ficaria no limite e a próxima
// função quebraria a implantação inteira.
//
// O QUE ESTE ARQUIVO NUNCA FAZ: gravar. Ele devolve o texto da IA cru; a
// tela passa por lib/ (validação com teste) e mostra para a pessoa
// revisar. Nada entra no estoque, na OS ou no cliente sem alguém
// confirmar — IA erra número, e número errado no estoque é custo errado
// no mês inteiro.
// ============================================================

import { atenderIA } from "./_ia.js";

/** A foto chega já encolhida pela tela; isto é só o teto de segurança */
const MAX_IMAGEM = 4 * 1024 * 1024;
const MAX_AUDIO = 3 * 1024 * 1024;
const TIPOS_IMAGEM = ["image/jpeg", "image/png", "image/webp"];
const TIPOS_AUDIO = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/aac"];

function base64Valido(v, max) {
  const s = String(v || "");
  if (!s || !/^[A-Za-z0-9+/=]+$/.test(s)) throw new Error("Arquivo vazio ou corrompido.");
  if ((s.length * 3) / 4 > max) throw new Error("Arquivo grande demais. Tenta uma foto mais perto ou um áudio mais curto.");
  return s;
}

const curto = (v, max = 400) => String(v || "").slice(0, max).trim();

const INSTRUCAO_NOTA =
  "Você lê notas fiscais brasileiras (DANFE, NFC-e, cupom) e prints de pedido de fornecedor. " +
  "Responda SOMENTE um JSON com o formato " +
  '{"fornecedor": string, "data": "AAAA-MM-DD", "itens": [{"descricao": string, "codigo": string, ' +
  '"quantidade": number, "custoUnitario": number}]}. ' +
  "custoUnitario é o valor de UMA unidade, em reais, com ponto decimal. " +
  "codigo é o código de barras (EAN) ou o código do produto na nota; vazio se não houver. " +
  "Não invente item nem valor: se não conseguir ler, deixe o campo vazio ou 0. " +
  "Ignore linhas de total, frete, desconto e impostos.";

const INSTRUCAO_DIAGNOSTICO =
  "Você é um técnico experiente de assistência técnica de celulares e computadores no Brasil. " +
  "Recebe aparelho, defeito relatado e um resumo do histórico da própria loja. " +
  "Responda SOMENTE um JSON: " +
  '{"causas": [{"causa": string, "chance": "alta"|"media"|"baixa"}], "testes": [string], "observacao": string}. ' +
  "No máximo 5 causas e 8 testes, curtos, em português do Brasil, na ordem em que o técnico deve fazer. " +
  "Não dê preço: o preço vem do histórico da loja.";

const INSTRUCAO_VOZ =
  "Você ouve um atendente de assistência técnica ditando a abertura de uma ordem de serviço, em português do Brasil. " +
  "Responda SOMENTE um JSON: " +
  '{"transcricao": string, "nomeCliente": string, "telefone": string, "tipoAparelho": string, ' +
  '"marca": string, "modelo": string, "defeito": string, "senha": string, "acessorios": string}. ' +
  "telefone só com dígitos. Campo não dito fica vazio — não invente. " +
  "senha é a senha ou padrão do aparelho exatamente como foi dita.";

export default async function handler(req, res) {
  const acao = String(req.query?.acao || "");
  // A tela pergunta se mostra os botões de IA. Só "sim" ou "não": a chave
  // nunca sai daqui. Sem chave na Vercel, os botões nem aparecem — botão
  // que existe e responde "falta chave" é botão quebrado na frente do
  // cliente.
  if (acao === "status") {
    return res.status(200).json({ ligada: Boolean(process.env.GEMINI_API_KEY) });
  }
  try {
    if (acao === "ler-nota") {
      return await atenderIA(req, res, "nota", (b) => {
        const tipo = String(b.tipo || "");
        if (!TIPOS_IMAGEM.includes(tipo)) throw new Error("Mande uma foto (JPEG, PNG ou WebP).");
        return {
          instrucao: INSTRUCAO_NOTA,
          partes: [
            { text: "Leia esta nota e devolva o JSON." },
            { inline_data: { mime_type: tipo, data: base64Valido(b.imagem, MAX_IMAGEM) } },
          ],
        };
      });
    }
    if (acao === "diagnostico") {
      return await atenderIA(req, res, "diagnostico", (b) => {
        if (!curto(b.defeito)) throw new Error("Descreva o defeito antes de perguntar à IA.");
        return {
          instrucao: INSTRUCAO_DIAGNOSTICO,
          partes: [
            {
              text:
                `Aparelho: ${curto(b.tipo, 60)} ${curto(b.marca, 60)} ${curto(b.modelo, 80)}\n` +
                `Defeito relatado: ${curto(b.defeito)}\n` +
                `Histórico da loja: ${curto(b.resumoLocal, 800) || "nenhuma OS parecida"}`,
            },
          ],
        };
      });
    }
    if (acao === "voz") {
      return await atenderIA(req, res, "voz", (b) => {
        const tipo = String(b.tipo || "").split(";")[0];
        if (!TIPOS_AUDIO.includes(tipo)) throw new Error("Formato de áudio não aceito.");
        return {
          instrucao: INSTRUCAO_VOZ,
          partes: [
            { text: "Transcreva e extraia os campos." },
            { inline_data: { mime_type: tipo, data: base64Valido(b.audio, MAX_AUDIO) } },
          ],
        };
      });
    }
    return res.status(404).json({ erro: "ação desconhecida" });
  } catch (e) {
    console.error("IA:", acao, e?.message || e);
    return res.status(500).json({ erro: e instanceof Error ? e.message : String(e) });
  }
}
