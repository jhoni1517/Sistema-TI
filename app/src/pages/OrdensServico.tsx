import React, { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import {
  Plus,
  Search,
  Wrench,
  Eye,
  Pencil,
  Trash2,
  MessageCircle,
  Printer,
  Smartphone,
  KeyRound,
  Trash,
  DollarSign,
  HandCoins,
  Link as LinkIcon,
} from "lucide-react";
import { useApp } from "../store/AppStore";
import { Modal, Field, EmptyState, SectionTitle } from "../components/ui";
import { PatternLock } from "../components/PatternLock";
import { printHTML } from "../lib/print";
import { reciboOS } from "../lib/recibo";
import { uid, nowISO, brl, whatsappLink, formatDateTime, codigoOS } from "../lib/format";
import { totalOS, totalPecas, custoPecas, lucroOS } from "../lib/calc";
import {
  OS_STATUS_META,
  type OrdemServico,
  type OSStatus,
  type PecaOS,
  type FormaPagamento,
  type Config,
} from "../lib/types";

const CHECKLIST_ITENS = [
  "Liga normalmente",
  "Tela sem trincos",
  "Touch funciona",
  "Botões OK",
  "Câmera OK",
  "Alto-falante OK",
  "Carrega",
  "Molhou / oxidação",
];

const STATUS_LIST = Object.keys(OS_STATUS_META) as OSStatus[];

const novaOS = (numero: number): OrdemServico => ({
  id: uid(),
  numero,
  clienteId: "",
  tipoAparelho: "Celular",
  marca: "",
  modelo: "",
  cor: "",
  imeiSerial: "",
  senhaAparelho: "",
  padraoDesbloqueio: "",
  contaVinculada: "",
  acessorios: "",
  defeitoRelatado: "",
  defeitoConstatado: "",
  checklist: {},
  pecas: [],
  maoDeObra: 0,
  desconto: 0,
  status: "aberta",
  tecnico: "",
  garantiaDias: 90,
  historico: [{ data: nowISO(), status: "aberta" }],
  observacoes: "",
  criadoEm: nowISO(),
  atualizadoEm: nowISO(),
});

export const OrdensServico: React.FC = () => {
  const { ordens, clientes, produtos, config, saveOrdem, removeOrdem, saveMovimento, saveProduto, saveFiado } = useApp();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<OSStatus | "todas" | "abertas">("abertas");
  const [editando, setEditando] = useState<OrdemServico | null>(null);
  const [detalhe, setDetalhe] = useState<OrdemServico | null>(null);

  const nomeCliente = (id: string) => clientes.find((c) => c.id === id)?.nome || "—";
  const cliente = (id: string) => clientes.find((c) => c.id === id);

  const proximoNumero = useMemo(
    () => (ordens.reduce((m, o) => Math.max(m, o.numero), 0) || 0) + 1,
    [ordens]
  );

  const lista = useMemo(() => {
    const b = busca.toLowerCase();
    return [...ordens]
      .filter((o) => {
        if (filtro === "abertas") return !["entregue", "cancelada"].includes(o.status);
        if (filtro !== "todas") return o.status === filtro;
        return true;
      })
      .filter((o) => {
        const nome = nomeCliente(o.clienteId).toLowerCase();
        return (
          nome.includes(b) ||
          codigoOS(o.numero).toLowerCase().includes(b) ||
          o.modelo.toLowerCase().includes(b) ||
          o.marca.toLowerCase().includes(b)
        );
      })
      .sort((a, b) => b.numero - a.numero);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordens, busca, filtro, clientes]);

  const salvar = async () => {
    if (!editando) return;
    if (!editando.clienteId) return alert("Selecione o cliente.");
    if (!editando.defeitoRelatado.trim()) return alert("Descreva o defeito relatado.");
    await saveOrdem({ ...editando, atualizadoEm: nowISO() });
    setEditando(null);
  };

  const mudarStatus = async (o: OrdemServico, status: OSStatus) => {
    const atualizado: OrdemServico = {
      ...o,
      status,
      atualizadoEm: nowISO(),
      historico: [...o.historico, { data: nowISO(), status }],
    };
    await saveOrdem(atualizado);
    setDetalhe(atualizado);
  };

  const baixarEstoqueEEntregar = async (o: OrdemServico) => {
    for (const p of o.pecas) {
      if (p.produtoId) {
        const prod = produtos.find((x) => x.id === p.produtoId);
        if (prod) {
          await saveProduto({
            ...prod,
            quantidade: Math.max(0, prod.quantidade - p.quantidade),
          });
        }
      }
    }
    await saveOrdem({
      ...o,
      status: "entregue",
      entregueEm: nowISO(),
      atualizadoEm: nowISO(),
      historico: [...o.historico, { data: nowISO(), status: "entregue" }],
    });
  };

  const avisarCliente = (o: OrdemServico) => {
    const c = cliente(o.clienteId);
    if (!c?.telefone) return alert("Cliente sem telefone cadastrado.");
    const msg =
      `*${config.nomeLoja}*\n\n` +
      `Olá ${c.nome}! Segue a atualização da sua ordem de serviço ${codigoOS(o.numero)}.\n\n` +
      `Aparelho: ${o.marca} ${o.modelo}\n` +
      `Situação: *${OS_STATUS_META[o.status].label}*\n\n` +
      `${OS_STATUS_META[o.status].cliente}\n\n` +
      (o.status === "pronta" || o.status === "aguardando_aprovacao"
        ? `Valor do serviço: ${brl(totalOS(o))}\n\n`
        : "") +
      `Qualquer dúvida, estamos à disposição. Obrigado pela preferência!`;
    window.open(whatsappLink(c.telefone, msg), "_blank");
  };

  return (
    <div>
      <SectionTitle
        title="Ordens de Serviço"
        subtitle={`${ordens.length} no total`}
        action={
          <button
            className="btn-primary"
            onClick={() => setEditando(novaOS(proximoNumero))}
          >
            <Plus size={18} /> Nova OS
          </button>
        }
      />

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(["abertas", "todas", ...STATUS_LIST] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
              filtro === f
                ? "bg-brand-600 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {f === "abertas" ? "Em aberto" : f === "todas" ? "Todas" : OS_STATUS_META[f as OSStatus].label}
          </button>
        ))}
      </div>

      <div className="relative mb-4 max-w-md">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className="input pl-10"
          placeholder="Buscar por cliente, código ou aparelho..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {lista.length === 0 ? (
        <EmptyState icon={<Wrench size={48} />} title="Nenhuma ordem de serviço" hint="Clique em 'Nova OS' para começar." />
      ) : (
        <div className="space-y-3">
          {lista.map((o) => (
            <div key={o.id} className="card flex flex-wrap items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Smartphone size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold text-slate-400">{codigoOS(o.numero)}</span>
                  <span className={`badge ${OS_STATUS_META[o.status].color}`}>{OS_STATUS_META[o.status].label}</span>
                </div>
                <p className="truncate font-bold text-slate-800">{nomeCliente(o.clienteId)}</p>
                <p className="truncate text-sm text-slate-500">
                  {o.marca} {o.modelo} · {o.defeitoRelatado}
                </p>
              </div>
              <div className="text-right">
                <p className="font-bold text-slate-800">{brl(totalOS(o))}</p>
                <p className="text-xs text-slate-400">{formatDateTime(o.atualizadoEm)}</p>
              </div>
              <div className="flex gap-1.5">
                <button className="btn-ghost !p-2" title="Detalhes" onClick={() => setDetalhe(o)}>
                  <Eye size={16} />
                </button>
                <button className="btn-ghost !p-2" title="Avisar cliente" onClick={() => avisarCliente(o)}>
                  <MessageCircle size={16} className="text-emerald-600" />
                </button>
                <button className="btn-ghost !p-2" title="Editar" onClick={() => setEditando(o)}>
                  <Pencil size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL FORM */}
      {editando && (
        <OSForm
          os={editando}
          setOs={setEditando}
          clientes={clientes}
          produtos={produtos}
          onSave={salvar}
          onClose={() => setEditando(null)}
        />
      )}

      {/* MODAL DETALHE */}
      {detalhe && (
        <OSDetalhe
          os={detalhe}
          clienteNome={nomeCliente(detalhe.clienteId)}
          cliente={cliente(detalhe.clienteId)}
          config={config}
          onClose={() => setDetalhe(null)}
          onStatus={(s) => mudarStatus(detalhe, s)}
          onAvisar={() => avisarCliente(detalhe)}
          onEditar={() => {
            setEditando(detalhe);
            setDetalhe(null);
          }}
          onExcluir={async () => {
            if (confirm(`Excluir a OS ${codigoOS(detalhe.numero)}?`)) {
              await removeOrdem(detalhe.id);
              setDetalhe(null);
            }
          }}
          onReceber={async (forma) => {
            const mov = {
              id: uid(),
              tipo: "entrada" as const,
              categoria: "OS",
              descricao: `${codigoOS(detalhe.numero)} - ${nomeCliente(detalhe.clienteId)}`,
              valor: totalOS(detalhe),
              formaPagamento: forma,
              osId: detalhe.id,
              custoRelacionado: custoPecas(detalhe),
              data: nowISO(),
            };
            await saveMovimento(mov);
            await baixarEstoqueEEntregar(detalhe);
            setDetalhe(null);
            alert("Pagamento registrado no caixa e OS marcada como entregue!");
          }}
          onFiado={async () => {
            await saveFiado({
              id: uid(),
              clienteId: detalhe.clienteId,
              descricao: `${codigoOS(detalhe.numero)} · ${detalhe.marca} ${detalhe.modelo}`,
              osId: detalhe.id,
              valor: totalOS(detalhe),
              pagamentos: [],
              quitado: false,
              criadoEm: nowISO(),
            });
            await baixarEstoqueEEntregar(detalhe);
            setDetalhe(null);
            alert("OS entregue e lançada em 'A Receber' (fiado)!");
          }}
        />
      )}
    </div>
  );
};

// ============ FORMULÁRIO ============
const OSForm: React.FC<{
  os: OrdemServico;
  setOs: (o: OrdemServico) => void;
  clientes: { id: string; nome: string }[];
  produtos: { id: string; nome: string; preco: number; custo: number }[];
  onSave: () => void;
  onClose: () => void;
}> = ({ os, setOs, clientes, produtos, onSave, onClose }) => {
  const addPeca = () =>
    setOs({
      ...os,
      pecas: [...os.pecas, { descricao: "", quantidade: 1, custoUnit: 0, precoUnit: 0 }],
    });
  const setPeca = (i: number, p: PecaOS) => {
    const n = [...os.pecas];
    n[i] = p;
    setOs({ ...os, pecas: n });
  };
  const delPeca = (i: number) => setOs({ ...os, pecas: os.pecas.filter((_, x) => x !== i) });

  const vincularProduto = (i: number, produtoId: string) => {
    const prod = produtos.find((p) => p.id === produtoId);
    if (!prod) return setPeca(i, { ...os.pecas[i], produtoId: undefined });
    setPeca(i, {
      ...os.pecas[i],
      produtoId: prod.id,
      descricao: prod.nome,
      precoUnit: prod.preco,
      custoUnit: prod.custo,
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Ordem de Serviço ${codigoOS(os.numero)}`}
      maxWidth="max-w-4xl"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={onSave}>Salvar OS</button>
        </>
      }
    >
      <div className="space-y-6">
        {/* Cliente & Status */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cliente *">
            <ClienteSelect clientes={clientes} value={os.clienteId} onChange={(id) => setOs({ ...os, clienteId: id })} />
          </Field>
          <Field label="Status">
            <select
              className="input"
              value={os.status}
              onChange={(e) => setOs({ ...os, status: e.target.value as OSStatus })}
            >
              {STATUS_LIST.map((s) => (
                <option key={s} value={s}>{OS_STATUS_META[s].label}</option>
              ))}
            </select>
          </Field>
        </div>

        {/* Aparelho */}
        <fieldset className="rounded-xl border border-slate-200 p-4">
          <legend className="flex items-center gap-1 px-2 text-sm font-bold text-slate-600">
            <Smartphone size={15} /> Dados do aparelho
          </legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Tipo">
              <select
                className="input"
                value={os.tipoAparelho}
                onChange={(e) => setOs({ ...os, tipoAparelho: e.target.value })}
              >
                {["Celular", "Notebook", "PC", "Tablet", "Impressora", "Console", "Outro"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Marca">
              <input className="input" value={os.marca} onChange={(e) => setOs({ ...os, marca: e.target.value })} />
            </Field>
            <Field label="Modelo">
              <input className="input" value={os.modelo} onChange={(e) => setOs({ ...os, modelo: e.target.value })} />
            </Field>
            <Field label="Cor">
              <input className="input" value={os.cor} onChange={(e) => setOs({ ...os, cor: e.target.value })} />
            </Field>
            <Field label="IMEI / Nº de série">
              <input className="input" value={os.imeiSerial} onChange={(e) => setOs({ ...os, imeiSerial: e.target.value })} />
            </Field>
            <Field label="Acessórios entregues">
              <input className="input" placeholder="chip, cartão, capa..." value={os.acessorios} onChange={(e) => setOs({ ...os, acessorios: e.target.value })} />
            </Field>
          </div>
        </fieldset>

        {/* Senhas */}
        <fieldset className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
          <legend className="flex items-center gap-1 px-2 text-sm font-bold text-amber-700">
            <KeyRound size={15} /> Acesso / Senhas (confidencial)
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Senha / PIN">
              <input className="input" value={os.senhaAparelho} onChange={(e) => setOs({ ...os, senhaAparelho: e.target.value })} />
            </Field>
            <Field label="Conta vinculada (Google/Apple)">
              <input className="input" value={os.contaVinculada} onChange={(e) => setOs({ ...os, contaVinculada: e.target.value })} />
            </Field>
          </div>
          <div className="mt-4">
            <label className="label">Padrão de desbloqueio (desenhe tocando nos pontos)</label>
            <PatternLock value={os.padraoDesbloqueio} onChange={(v) => setOs({ ...os, padraoDesbloqueio: v })} />
          </div>
        </fieldset>

        {/* Defeito e checklist */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Defeito relatado pelo cliente *">
            <textarea className="input" rows={3} value={os.defeitoRelatado} onChange={(e) => setOs({ ...os, defeitoRelatado: e.target.value })} />
          </Field>
          <Field label="Defeito constatado / laudo técnico">
            <textarea className="input" rows={3} value={os.defeitoConstatado} onChange={(e) => setOs({ ...os, defeitoConstatado: e.target.value })} />
          </Field>
        </div>

        <div>
          <label className="label">Checklist de entrada</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CHECKLIST_ITENS.map((item) => (
              <label key={item} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded"
                  checked={!!os.checklist[item]}
                  onChange={(e) => setOs({ ...os, checklist: { ...os.checklist, [item]: e.target.checked } })}
                />
                {item}
              </label>
            ))}
          </div>
        </div>

        {/* Peças */}
        <fieldset className="rounded-xl border border-slate-200 p-4">
          <legend className="px-2 text-sm font-bold text-slate-600">Peças e produtos</legend>
          <div className="space-y-2">
            {os.pecas.map((p, i) => (
              <div key={i} className="grid grid-cols-12 items-end gap-2">
                <div className="col-span-12 sm:col-span-4">
                  <label className="label">Descrição</label>
                  <input className="input" value={p.descricao} onChange={(e) => setPeca(i, { ...p, descricao: e.target.value })} />
                </div>
                <div className="col-span-6 sm:col-span-3">
                  <label className="label">Do estoque</label>
                  <select className="input" value={p.produtoId || ""} onChange={(e) => vincularProduto(i, e.target.value)}>
                    <option value="">Manual</option>
                    {produtos.map((pr) => (
                      <option key={pr.id} value={pr.id}>{pr.nome}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-3 sm:col-span-1">
                  <label className="label">Qtd</label>
                  <input type="number" min={1} className="input" value={p.quantidade} onChange={(e) => setPeca(i, { ...p, quantidade: +e.target.value })} />
                </div>
                <div className="col-span-4 sm:col-span-1">
                  <label className="label">Custo</label>
                  <input type="number" className="input" value={p.custoUnit} onChange={(e) => setPeca(i, { ...p, custoUnit: +e.target.value })} />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <label className="label">Preço</label>
                  <input type="number" className="input" value={p.precoUnit} onChange={(e) => setPeca(i, { ...p, precoUnit: +e.target.value })} />
                </div>
                <div className="col-span-1">
                  <button className="btn-ghost !p-2 text-red-500" onClick={() => delPeca(i)}>
                    <Trash size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button className="btn-secondary mt-3 !py-1.5 text-xs" onClick={addPeca}>
            <Plus size={14} /> Adicionar peça
          </button>
        </fieldset>

        {/* Financeiro */}
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Mão de obra (R$)">
            <input type="number" className="input" value={os.maoDeObra} onChange={(e) => setOs({ ...os, maoDeObra: +e.target.value })} />
          </Field>
          <Field label="Desconto (R$)">
            <input type="number" className="input" value={os.desconto} onChange={(e) => setOs({ ...os, desconto: +e.target.value })} />
          </Field>
          <Field label="Garantia (dias)">
            <input type="number" className="input" value={os.garantiaDias} onChange={(e) => setOs({ ...os, garantiaDias: +e.target.value })} />
          </Field>
          <Field label="Técnico responsável">
            <input className="input" value={os.tecnico} onChange={(e) => setOs({ ...os, tecnico: e.target.value })} />
          </Field>
        </div>

        <div className="flex flex-wrap justify-end gap-6 rounded-xl bg-slate-50 p-4 text-sm">
          <span>Peças: <b>{brl(totalPecas(os))}</b></span>
          <span>Custo: <b className="text-red-600">{brl(custoPecas(os))}</b></span>
          <span>Total: <b className="text-lg text-slate-800">{brl(totalOS(os))}</b></span>
          <span>Lucro: <b className="text-emerald-600">{brl(lucroOS(os))}</b></span>
        </div>

        <Field label="Observações internas">
          <textarea className="input" rows={2} value={os.observacoes} onChange={(e) => setOs({ ...os, observacoes: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
};

// ============ DETALHE / IMPRESSÃO ============
const OSDetalhe: React.FC<{
  os: OrdemServico;
  clienteNome: string;
  cliente?: { nome: string; telefone: string; cpf?: string };
  config: Config;
  onClose: () => void;
  onStatus: (s: OSStatus) => void;
  onAvisar: () => void;
  onEditar: () => void;
  onExcluir: () => void;
  onReceber: (forma: FormaPagamento) => void;
  onFiado: () => void;
}> = ({ os, clienteNome, cliente, config, onClose, onStatus, onAvisar, onEditar, onExcluir, onReceber, onFiado }) => {
  const [forma, setForma] = useState<FormaPagamento>("dinheiro");

  const trackingUrl = `${window.location.origin}${window.location.pathname}#/rastreio/${codigoOS(os.numero)}`;
  const imprimir = () => {
    printHTML(reciboOS(os, cliente, config), codigoOS(os.numero));
  };
  const linkRastreio = () => {
    const url = trackingUrl;
    if (cliente?.telefone) {
      const msg = `Acompanhe o status do seu aparelho na ${config.nomeLoja}:\n${url}`;
      window.open(whatsappLink(cliente.telefone, msg), "_blank");
    } else {
      navigator.clipboard?.writeText(url);
      alert("Link de acompanhamento copiado:\n" + url);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Detalhes · ${codigoOS(os.numero)}`}
      maxWidth="max-w-3xl"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2 no-print">
          <div className="flex gap-2">
            <button className="btn-secondary text-red-600" onClick={onExcluir}><Trash2 size={16} /></button>
            <button className="btn-secondary" onClick={imprimir}><Printer size={16} /> Imprimir</button>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={linkRastreio}><LinkIcon size={16} /> Link p/ cliente</button>
            <button className="btn-success" onClick={onAvisar}><MessageCircle size={16} /> Avisar</button>
            <button className="btn-primary" onClick={onEditar}><Pencil size={16} /> Editar</button>
          </div>
        </div>
      }
    >
      <div className="space-y-5" id="os-print">
        {/* Cabeçalho impressão */}
        <div className="hidden border-b pb-3 print:block">
          <h2 className="text-xl font-bold">{config.nomeLoja}</h2>
          <p className="text-sm text-slate-500">{config.enderecoLoja} · {config.telefoneLoja}</p>
        </div>

        <div className="flex items-center justify-between">
          <span className={`badge ${OS_STATUS_META[os.status].color}`}>{OS_STATUS_META[os.status].label}</span>
          <span className="text-sm text-slate-400">Aberta em {formatDateTime(os.criadoEm)}</span>
        </div>

        {/* Etiqueta com QR Code de acompanhamento */}
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
          <div className="shrink-0 rounded bg-white p-1.5 ring-1 ring-slate-200">
            <QRCodeImg text={trackingUrl} size={84} />
          </div>
          <div className="text-xs text-slate-500">
            <p className="text-sm font-bold text-slate-700">Etiqueta de acompanhamento</p>
            <p>Cole no aparelho — o cliente escaneia e vê o status da OS.</p>
            <p className="mt-1 font-mono font-bold text-slate-600">{codigoOS(os.numero)}</p>
          </div>
        </div>

        {/* Alterar status */}
        <div className="no-print">
          <label className="label">Alterar estado do equipamento</label>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_LIST.map((s) => (
              <button
                key={s}
                onClick={() => onStatus(s)}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                  os.status === s ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {OS_STATUS_META[s].label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Info label="Cliente" value={clienteNome} />
          <Info label="Telefone" value={cliente?.telefone || "—"} />
          <Info label="Aparelho" value={`${os.tipoAparelho} ${os.marca} ${os.modelo}`} />
          <Info label="Cor / IMEI" value={`${os.cor || "—"} · ${os.imeiSerial || "—"}`} />
          <Info label="Acessórios" value={os.acessorios || "—"} />
          <Info label="Técnico" value={os.tecnico || "—"} />
        </div>

        <div className="rounded-xl bg-amber-50 p-3 print:hidden">
          <p className="mb-1 flex items-center gap-1 text-xs font-bold text-amber-700"><KeyRound size={13} /> Acesso (confidencial)</p>
          <div className="grid gap-1 text-sm sm:grid-cols-3">
            <span>Senha: <b>{os.senhaAparelho || "—"}</b></span>
            <span>Padrão: <b>{os.padraoDesbloqueio || "—"}</b></span>
            <span>Conta: <b>{os.contaVinculada || "—"}</b></span>
          </div>
          {os.padraoDesbloqueio && os.padraoDesbloqueio.includes("-") && (
            <div className="mt-3">
              <PatternLock value={os.padraoDesbloqueio} readOnly size={120} />
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Info label="Defeito relatado" value={os.defeitoRelatado} />
          <Info label="Laudo técnico" value={os.defeitoConstatado || "—"} />
        </div>

        {/* Peças */}
        {os.pecas.length > 0 && (
          <div>
            <p className="label">Peças / serviços</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-slate-400">
                  <th className="py-1">Item</th>
                  <th className="py-1 text-center">Qtd</th>
                  <th className="py-1 text-right">Preço</th>
                  <th className="py-1 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {os.pecas.map((p, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-1.5">{p.descricao}</td>
                    <td className="py-1.5 text-center">{p.quantidade}</td>
                    <td className="py-1.5 text-right">{brl(p.precoUnit)}</td>
                    <td className="py-1.5 text-right">{brl(p.precoUnit * p.quantidade)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Totais */}
        <div className="ml-auto max-w-xs space-y-1 text-sm">
          <Linha label="Peças" value={brl(totalPecas(os))} />
          <Linha label="Mão de obra" value={brl(os.maoDeObra)} />
          {os.desconto > 0 && <Linha label="Desconto" value={`- ${brl(os.desconto)}`} />}
          <div className="flex justify-between border-t pt-1 text-base font-bold">
            <span>Total</span>
            <span>{brl(totalOS(os))}</span>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400">
          Garantia de {os.garantiaDias} dias · {config.nomeLoja}
        </p>

        {/* Receber pagamento */}
        {os.status !== "entregue" && os.status !== "cancelada" && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-emerald-50 p-3 no-print">
            <DollarSign size={18} className="text-emerald-600" />
            <span className="text-sm font-semibold text-emerald-800">Receber e entregar:</span>
            <select className="input !w-auto !py-1.5 text-sm" value={forma} onChange={(e) => setForma(e.target.value as FormaPagamento)}>
              <option value="dinheiro">Dinheiro</option>
              <option value="pix">Pix</option>
              <option value="debito">Débito</option>
              <option value="credito">Crédito</option>
              <option value="transferencia">Transferência</option>
            </select>
            <button className="btn-success !py-1.5 text-sm" onClick={() => onReceber(forma)}>
              Receber {brl(totalOS(os))}
            </button>
            <button className="btn-secondary !py-1.5 text-sm" onClick={onFiado} title="Entregar e deixar para pagar depois">
              <HandCoins size={15} /> Fiado
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
};

// Seletor de cliente com busca
const ClienteSelect: React.FC<{
  clientes: { id: string; nome: string }[];
  value?: string;
  onChange: (id: string) => void;
}> = ({ clientes, value, onChange }) => {
  const sel = clientes.find((c) => c.id === value);
  const [q, setQ] = useState(sel?.nome || "");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setQ(clientes.find((c) => c.id === value)?.nome || "");
  }, [value, clientes]);
  const filtro = clientes
    .filter((c) => c.nome.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 8);
  return (
    <div className="relative">
      <input
        className="input"
        placeholder="Digite o nome do cliente..."
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          if (!e.target.value) onChange("");
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && filtro.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg bg-white shadow-lg ring-1 ring-slate-200">
          {filtro.map((c) => (
            <button
              key={c.id}
              type="button"
              className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              onMouseDown={() => {
                onChange(c.id);
                setQ(c.nome);
                setOpen(false);
              }}
            >
              {c.nome}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const QRCodeImg: React.FC<{ text: string; size?: number }> = ({ text, size = 84 }) => {
  const [src, setSrc] = useState("");
  useEffect(() => {
    QRCode.toDataURL(text, { width: size, margin: 1 }).then(setSrc).catch(() => setSrc(""));
  }, [text, size]);
  return src ? <img src={src} width={size} height={size} alt="QR de acompanhamento" className="rounded" /> : null;
};

const Info: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <p className="text-xs font-semibold uppercase text-slate-400">{label}</p>
    <p className="text-sm text-slate-800">{value}</p>
  </div>
);
const Linha: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex justify-between text-slate-600">
    <span>{label}</span>
    <span>{value}</span>
  </div>
);
