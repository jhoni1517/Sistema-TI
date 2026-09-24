import React, { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Smartphone, QrCode, Copy, Camera, X } from "lucide-react";
import { useApp } from "../store/AppStore";
import { Modal, InputNumero } from "./ui";
import { aviso } from "./Aviso";
import { obterLoja, emDemo } from "../lib/db";
import { enviarImagem } from "../lib/imagens";
import { brl, uid, nowISO, abrirWhatsapp } from "../lib/format";
import { FORMAS_DE_COMPRA } from "../lib/pagamento";
import { sessaoAberta } from "../lib/caixa";
import { imeiValido, pareceImei } from "../lib/imei";
import {
  CHECKLIST_USADO,
  avaliar,
  chaveDoModelo,
  novoTokenDaFicha,
  produtoSeminovo,
  linkDaFicha,
} from "../lib/seminovo";
import type { FormaPagamento, MovimentoCaixa, Produto } from "../lib/types";

const origem = () => window.location.origin + window.location.pathname;

/** "Avaliar usado", em Estoque: checklist, preço e a compra */
export const AvaliarUsado: React.FC<{ onFechar: () => void }> = ({ onFechar }) => {
  const { config, saveConfig, sessoes, saveMovimento, saveProduto } = useApp();
  const [modelo, setModelo] = useState("");
  const [imei, setImei] = useState("");
  const [referencia, setReferencia] = useState<number | undefined>();
  const [ok, setOk] = useState<Record<string, boolean>>({});
  const [bateria, setBateria] = useState<number | undefined>();
  const [pago, setPago] = useState<number | undefined>();
  const [venda, setVenda] = useState<number | undefined>();
  const [garantia, setGarantia] = useState<number | undefined>(90);
  const [forma, setForma] = useState<FormaPagamento | "troca">("pix");
  const [fotos, setFotos] = useState<string[]>([]);
  const [subindo, setSubindo] = useState(false);
  const [gravando, setGravando] = useState(false);

  // A referência que a loja já usou para este modelo volta sozinha.
  useEffect(() => {
    const lembrada = config.referenciasSeminovos?.[chaveDoModelo(modelo)];
    if (lembrada && referencia === undefined) setReferencia(lembrada);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelo]);

  const conta = useMemo(() => avaliar({ referencia: referencia || 0, ok, bateria }), [referencia, ok, bateria]);

  const subirFotos = async (lista: FileList | null) => {
    const arquivos = Array.from(lista || []).slice(0, 6 - fotos.length);
    if (!arquivos.length) return;
    setSubindo(true);
    try {
      for (const f of arquivos) {
        const url = await enviarImagem(f, obterLoja() || "", "seminovos");
        setFotos((v) => [...v, url]);
      }
    } catch (e) {
      aviso.erro("Foto não subiu: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSubindo(false);
    }
  };

  const comprar = async () => {
    // Clique duplo no balcão lançaria a compra duas vezes no caixa.
    if (gravando) return;
    if (!modelo.trim()) return aviso.alerta("Escreva o modelo do aparelho.");
    const custo = pago ?? conta.oferta;
    const precoVenda = venda ?? conta.venda;
    if (!(precoVenda > 0)) return aviso.alerta("Falta o preço de venda. Informe o preço de referência do modelo.");
    if (emDemo()) return aviso.alerta("Na loja de exemplo a compra não é gravada. Crie sua conta para usar.");
    setGravando(true);
    try {
      /*
       * DINHEIRO PRIMEIRO, como toda entrada de mercadoria. Comprar o usado é
       * compra de estoque: sai do caixa, mas não é despesa do mês — vira
       * custo quando o aparelho for vendido. Na troca não sai dinheiro: o
       * valor abate na venda que o balcão faz em seguida.
       */
      if (forma !== "troca" && custo > 0) {
        const mov: MovimentoCaixa = {
          id: uid(),
          tipo: "saida",
          categoria: "Compra de seminovo",
          descricao: `Compra de usado - ${modelo.trim()}`,
          valor: custo,
          formaPagamento: forma,
          compraEstoque: true,
          sessaoId: sessaoAberta(sessoes)?.id,
          data: nowISO(),
        };
        await saveMovimento(mov);
      }
      await saveProduto(
        produtoSeminovo({
          id: uid(),
          modelo,
          venda: precoVenda,
          custo,
          criadoEm: nowISO(),
          ficha: {
            ok,
            bateria: bateria || undefined,
            imei: imei.trim() || undefined,
            fotos,
            garantiaDias: garantia ?? 0,
            avaliadoEm: nowISO(),
            ficha: novoTokenDaFicha(),
            troca: forma === "troca" || undefined,
          },
        })
      );
      if (referencia && referencia > 0) {
        saveConfig({
          ...config,
          referenciasSeminovos: { ...(config.referenciasSeminovos || {}), [chaveDoModelo(modelo)]: referencia },
        });
      }
      aviso.sucesso(
        forma === "troca"
          ? `Aparelho no estoque. Na venda, dê ${brl(custo)} de desconto pela troca.`
          : "Aparelho comprado e no estoque, com a ficha pronta."
      );
      onFechar();
    } catch (e) {
      aviso.erro("Não gravou a compra: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setGravando(false);
    }
  };

  return (
    <Modal
      open
      onClose={onFechar}
      title="Avaliar aparelho usado"
      maxWidth="max-w-2xl"
      footer={
        <button className="btn-primary ml-auto" onClick={comprar} disabled={gravando || subindo}>
          {gravando ? "Gravando..." : forma === "troca" ? "Receber na troca" : "Comprar e pôr no estoque"}
        </button>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Modelo</label>
            <input className="input" value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="iPhone 11 128GB" />
          </div>
          <div>
            <label className="label">IMEI</label>
            <input className="input" value={imei} onChange={(e) => setImei(e.target.value)} />
            {pareceImei(imei) && !imeiValido(imei) && (
              <p className="mt-1 text-xs font-semibold text-red-700">O último dígito não confere. Confira em *#06#.</p>
            )}
          </div>
          <div>
            <label className="label">Preço de venda dele perfeito</label>
            <InputNumero className="input" value={referencia} onChange={setReferencia} placeholder="quanto vende em ótimo estado" />
          </div>
          <div>
            <label className="label">Saúde da bateria (%)</label>
            <InputNumero className="input" value={bateria} onChange={setBateria} max={100} />
          </div>
        </div>

        <div>
          <p className="label">Marque o que PASSOU no teste</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {CHECKLIST_USADO.map((i) => (
              <label key={i.k} className="flex items-center gap-2 rounded-md border border-linha p-2 text-sm">
                <input type="checkbox" className="h-5 w-5" checked={!!ok[i.k]} onChange={(e) => setOk({ ...ok, [i.k]: e.target.checked })} />
                <span className="flex-1">{i.rotulo}</span>
                {!ok[i.k] && <span className="valor text-xs text-red-700">-{Math.round(i.fator * 100)}%</span>}
              </label>
            ))}
          </div>
        </div>

        {(referencia || 0) > 0 && (
          <div className="grid grid-cols-2 gap-2 rounded-md bg-papel p-3">
            <div>
              <p className="text-xs text-tinta-suave">Vende nessas condições por</p>
              <p className="valor text-lg font-bold">{brl(conta.venda)}</p>
            </div>
            <div>
              <p className="text-xs text-tinta-suave">Ofereça até</p>
              <p className="valor text-lg font-bold text-sinal">{brl(conta.oferta)}</p>
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">Valor pago</label>
            <InputNumero className="input" value={pago} onChange={setPago} placeholder={conta.oferta ? String(conta.oferta) : ""} />
          </div>
          <div>
            <label className="label">Preço de venda</label>
            <InputNumero className="input" value={venda} onChange={setVenda} placeholder={conta.venda ? String(conta.venda) : ""} />
          </div>
          <div>
            <label className="label">Garantia (dias)</label>
            <InputNumero className="input" value={garantia} onChange={setGarantia} />
          </div>
        </div>

        <div>
          <p className="label">Pago em</p>
          <div className="flex flex-wrap gap-2">
            {[...FORMAS_DE_COMPRA.map((f) => ({ k: f.k as FormaPagamento | "troca", nome: f.nome })), { k: "troca" as const, nome: "Troca (abate na venda)" }].map((f) => (
              <button
                key={f.k}
                type="button"
                onClick={() => setForma(f.k)}
                className={`chip text-sm ${forma === f.k ? "bg-sinal text-white" : "bg-cartao text-tinta-suave ring-1 ring-linha"}`}
              >
                {f.nome}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="label">Fotos do aparelho (até 6)</p>
          <div className="flex flex-wrap gap-2">
            {fotos.map((u) => (
              <div key={u} className="relative">
                <img src={u} alt="" className="h-16 w-16 rounded object-cover" />
                <button className="absolute -right-1 -top-1 rounded-full bg-cartao p-0.5 ring-1 ring-linha" onClick={() => setFotos(fotos.filter((x) => x !== u))} aria-label="Tirar foto">
                  <X size={12} />
                </button>
              </div>
            ))}
            {fotos.length < 6 && (
              <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded border-2 border-dashed border-linha text-tinta-suave">
                <Camera size={20} />
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => subirFotos(e.target.files)} />
              </label>
            )}
          </div>
          {subindo && <p className="mt-1 text-xs text-tinta-suave">Enviando fotos...</p>}
        </div>
      </div>
    </Modal>
  );
};

/** Botão em Estoque. Só aparece para quem tem o recurso (assistência). */
export const BotaoAvaliarUsado: React.FC = () => {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button className="btn-secondary" onClick={() => setAberto(true)}>
        <Smartphone size={18} /> Avaliar usado
      </button>
      {aberto && <AvaliarUsado onFechar={() => setAberto(false)} />}
    </>
  );
};

/** O link e o QR da ficha, para mandar ou imprimir na etiqueta */
export const FichaDoSeminovo: React.FC<{ produto: Produto; onFechar: () => void }> = ({ produto, onFechar }) => {
  const link = linkDaFicha(origem(), obterLoja(), produto.seminovo?.ficha);
  const [qr, setQr] = useState("");
  useEffect(() => {
    if (link) QRCode.toDataURL(link, { width: 240, margin: 1 }).then(setQr).catch(() => setQr(""));
  }, [link]);
  return (
    <Modal open onClose={onFechar} title={`Ficha: ${produto.nome}`} maxWidth="max-w-md">
      {!link ? (
        <p className="text-sm text-tinta-suave">Este produto não tem ficha de seminovo.</p>
      ) : (
        <div className="space-y-3 text-center">
          {qr && <img src={qr} alt="QR da ficha" className="mx-auto h-48 w-48" />}
          <p className="text-sm text-tinta-suave">Cole o QR no aparelho da vitrine ou mande o link para quem perguntar.</p>
          <p className="break-all rounded bg-papel p-2 font-mono text-xs">{link}</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              className="btn-secondary"
              onClick={() =>
                navigator.clipboard
                  .writeText(link)
                  .then(() => aviso.sucesso("Link copiado."))
                  .catch(() => aviso.alerta("Não deu para copiar. Segure o dedo no link."))
              }
            >
              <Copy size={16} /> Copiar
            </button>
            <button className="btn-primary" onClick={() => abrirWhatsapp("", `${produto.nome}: veja a ficha completa, com fotos e garantia:\n${link}`)}>
              WhatsApp
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export const IconeFicha = QrCode;
