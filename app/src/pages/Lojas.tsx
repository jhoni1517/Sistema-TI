import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Store,
  CheckCircle2,
  Ban,
  Unlock,
  Save,
  Settings2,
  Search,
  CalendarClock,
  Wallet,
  MessageCircle,
  KeyRound,
  Copy,
} from "lucide-react";
import { aviso } from "../components/Aviso";
import { SectionTitle, Field, Modal, EmptyState, InputNumero } from "../components/ui";
import { brl, formatDate, txt, abrirWhatsapp } from "../lib/format";
import { normalizar } from "../lib/busca";
import { gerarLinkDeSenha } from "../lib/auth";
import { RAMOS, RAMO_META, ramoDe } from "../lib/ramos";
import { mensagemCobranca, tipoDoAviso, AVISO_META } from "../lib/cobranca";
import {
  listarLojas,
  carregarSistemaConfig,
  salvarSistemaConfig,
  registrarPagamento,
  definirBloqueio,
  atualizarLoja,
  situacaoDe,
  diasParaVencer,
  SITUACAO_META,
  type Loja,
  type SistemaConfig,
} from "../lib/assinatura";

/**
 * Painel do administrador do sistema.
 * É a tela de quem aluga o sistema — não a de quem usa a loja. Só aparece
 * para quem tem super_admin, e as políticas do banco recusam qualquer
 * tentativa vinda de outra conta.
 */
/**
 * Valor da mensalidade, gravado só ao sair do campo.
 *
 * Precisa de estado próprio porque a gravação é por linha da lista: um
 * campo controlado pelo valor da loja reescreveria o texto a cada tecla, e
 * apagar para digitar outro número ficava impossível.
 */
const ValorMensal: React.FC<{ valor: number; onSalvar: (v: number) => void }> = ({
  valor,
  onSalvar,
}) => {
  const [v, setV] = useState<number | undefined>(valor);
  useEffect(() => setV(valor), [valor]);
  return (
    <InputNumero
      className="input !w-24 !py-1.5 text-sm"
      value={v}
      onChange={setV}
      onBlur={() => {
      if (v !== undefined && v !== valor) onSalvar(v);
      if (v === undefined) setV(valor);
      }}
    />
  );
};

export const Lojas: React.FC = () => {
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [cfg, setCfg] = useState<SistemaConfig>({});
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [ajustes, setAjustes] = useState(false);
  const [erro, setErro] = useState("");
  const [senha, setSenha] = useState<{ email: string; link: string; gerando: boolean } | null>(
    null
  );

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const [l, c] = await Promise.all([listarLojas(), carregarSistemaConfig()]);
      setLojas(l);
      if (c) setCfg(c);
    } catch (e) {
      setErro(
        (e instanceof Error ? e.message : String(e)) +
          " — se for a primeira vez, confira se você rodou o supabase-migracao-assinatura.sql."
      );
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const tolerancia = cfg.dias_tolerancia ?? 5;

  const lista = useMemo(() => {
    const b = normalizar(busca);
    return lojas
      .filter((l) => normalizar(l.nome).includes(b))
      .sort((a, b2) => (diasParaVencer(a.venceEm) ?? 0) - (diasParaVencer(b2.venceEm) ?? 0));
  }, [lojas, busca]);

  const resumo = useMemo(() => {
    let ativas = 0;
    let problema = 0;
    let receita = 0;
    for (const l of lojas) {
      if (l.isento) continue; // a sua própria loja não é receita
      const s = situacaoDe(l, tolerancia);
      if (s === "ativa" || s === "tolerancia") {
        ativas++;
        receita += Number(l.valor_mensal) || 0;
      } else {
        problema++;
      }
    }
    return { ativas, problema, receita };
  }, [lojas, tolerancia]);

  /**
   * Abre o WhatsApp com a cobrança pronta, no tom certo para a situação:
   * lembrete antes de vencer, aviso no dia, e depois do travamento o texto
   * que deixa claro que nenhum dado foi apagado.
   */
  const cobrar = (l: Loja) => {
    const dias = diasParaVencer(l.venceEm);
    const tipo = tipoDoAviso(dias, tolerancia);
    if (!tipo) return aviso.info("Esta loja está em dia — nada a cobrar.");

    const tel = txt(l.whatsapp).replace(/\D/g, "");
    if (tel.length < 10) {
      return aviso.alerta("Preencha o WhatsApp desta loja para cobrar com um clique.");
    }
    abrirWhatsapp(
      tel,
      mensagemCobranca(tipo, {
        nomeLoja: txt(l.nome),
        valor: l.valor_mensal,
        dias,
        chavePix: cfg.chave_pix,
        titularPix: cfg.titular_pix,
      })
    );
  };

  const pagar = async (l: Loja, meses: number) => {
    if (!confirm(`Confirmar ${meses} mês(es) de pagamento para "${l.nome}"?`)) return;
    try {
      const novo = await registrarPagamento(l.id, meses);
      aviso.sucesso(`Renovado até ${formatDate(novo)}.`);
      carregar();
    } catch (e) {
      aviso.erro(e instanceof Error ? e.message : String(e));
    }
  };

  const alternarBloqueio = async (l: Loja) => {
    const bloquear = !l.bloqueada;
    if (
      bloquear &&
      !confirm(
        `Bloquear "${l.nome}"? A loja perde o acesso por completo, inclusive a consulta. Use só em último caso.`
      )
    ) {
      return;
    }
    try {
      await definirBloqueio(l.id, bloquear);
      carregar();
    } catch (e) {
      aviso.erro(e instanceof Error ? e.message : String(e));
    }
  };

  const mudarWhatsapp = async (l: Loja, whatsapp: string) => {
    try {
      await atualizarLoja(l.id, { whatsapp });
      setLojas((prev) => prev.map((x) => (x.id === l.id ? { ...x, whatsapp } : x)));
    } catch (e) {
      aviso.erro(e instanceof Error ? e.message : String(e));
    }
  };

  const mudarRamo = async (l: Loja, ramo: string) => {
    if (ramoDe(l.ramo) === ramo) return;
    if (
      !confirm(
        `Mudar "${l.nome}" para ${RAMO_META[ramoDe(ramo)].label}?\n\n` +
          "As telas que não pertencem ao novo plano deixam de aparecer para ela. " +
          "Nenhum dado é apagado: o que sai do menu continua guardado."
      )
    ) {
      return;
    }
    try {
      await atualizarLoja(l.id, { ramo });
      setLojas((prev) => prev.map((x) => (x.id === l.id ? { ...x, ramo } : x)));
      aviso.sucesso(`${l.nome} agora usa ${RAMO_META[ramoDe(ramo)].label}.`);
    } catch (e) {
      aviso.erro(e instanceof Error ? e.message : String(e));
    }
  };

  const mudarValor = async (l: Loja, valor: number) => {
    try {
      await atualizarLoja(l.id, { valor_mensal: valor });
      setLojas((prev) => prev.map((x) => (x.id === l.id ? { ...x, valor_mensal: valor } : x)));
    } catch (e) {
      aviso.erro(e instanceof Error ? e.message : String(e));
    }
  };

  /**
   * Gera o link de troca de senha e deixa pronto para copiar.
   * É a saída para quando o e-mail não chega — o que hoje é o normal,
   * porque o SMTP próprio ainda não está configurado.
   */
  const gerarSenha = async () => {
    if (!senha) return;
    setSenha({ ...senha, gerando: true, link: "" });
    try {
      const link = await gerarLinkDeSenha(senha.email);
      setSenha({ email: senha.email, link, gerando: false });
    } catch (e) {
      setSenha({ ...senha, gerando: false });
      aviso.erro(e instanceof Error ? e.message : String(e));
    }
  };

  const salvarAjustes = async () => {
    try {
      await salvarSistemaConfig(cfg);
      setAjustes(false);
      aviso.sucesso("Ajustes salvos.");
    } catch (e) {
      aviso.erro(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div>
      <SectionTitle
        title="Lojas assinantes"
        subtitle="Quem usa o sistema, quem está em dia e quem atrasou"
        action={
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-secondary"
              onClick={() => setSenha({ email: "", link: "", gerando: false })}
            >
              <KeyRound size={18} /> Liberar senha
            </button>
            <button className="btn-secondary" onClick={() => setAjustes(true)}>
              <Settings2 size={18} /> Ajustes do sistema
            </button>
          </div>
        }
      />

      {erro && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{erro}</p>}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="card">
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <CheckCircle2 size={14} /> Lojas ativas
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{resumo.ativas}</p>
        </div>
        <div className="card">
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <CalendarClock size={14} /> Em atraso
          </p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{resumo.problema}</p>
        </div>
        <div className="card bg-gradient-to-br from-brand-600 to-brand-800 text-white ring-brand-700">
          <p className="flex items-center gap-2 text-xs text-brand-100">
            <Wallet size={14} /> Receita mensal
          </p>
          <p className="mt-1 text-2xl font-bold">{brl(resumo.receita)}</p>
        </div>
      </div>

      <div className="relative mb-4 max-w-md">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className="input pl-10"
          placeholder="Buscar loja..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {carregando ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="esqueleto h-20 w-full" />
          ))}
        </div>
      ) : lista.length === 0 ? (
        <EmptyState
          icon={<Store size={48} />}
          title="Nenhuma loja ainda"
          hint="Use 'Liberar nova loja' em Configurações → Equipe para convidar a primeira."
        />
      ) : (
        <div className="space-y-3">
          {lista.map((l) => {
            const s = situacaoDe(l, tolerancia);
            const dias = diasParaVencer(l.venceEm);
            return (
              <div key={l.id} className="card flex flex-wrap items-center gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Store size={20} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-800">{txt(l.nome)}</span>
                    <span className={`badge ${SITUACAO_META[s].color}`}>
                      {SITUACAO_META[s].label}
                    </span>
                    {l.isento ? (
                      <span className="badge bg-brand-100 text-brand-700">Sua loja · isenta</span>
                    ) : (
                      (() => {
                        const t = tipoDoAviso(dias, tolerancia);
                        return t && s === "ativa" ? (
                          <span className={`badge ${AVISO_META[t].cor}`}>{AVISO_META[t].label}</span>
                        ) : null;
                      })()
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {l.isento ? (
                      "Sem cobrança"
                    ) : l.venceEm ? (
                      <>
                        Vence {formatDate(l.venceEm)}
                        {dias !== null && (
                          <>
                            {" · "}
                            {dias >= 0
                              ? `faltam ${dias} dia${dias === 1 ? "" : "s"}`
                              : `${Math.abs(dias)} dia${Math.abs(dias) === 1 ? "" : "s"} em atraso`}
                          </>
                        )}
                      </>
                    ) : (
                      "sem vencimento definido"
                    )}
                    {l.ultimoPagamento && ` · último pagamento ${formatDate(l.ultimoPagamento)}`}
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <input
                    className="input !w-36 !py-1.5 text-sm"
                    placeholder="WhatsApp"
                    defaultValue={txt(l.whatsapp)}
                    onBlur={(e) => {
                      if (e.target.value !== txt(l.whatsapp)) mudarWhatsapp(l, e.target.value);
                    }}
                  />
                  {/* O plano é o que foi vendido. Muda só aqui, e o banco
                      recusa a troca vinda da própria loja. */}
                  <select
                    className="input !w-40 !py-1.5 text-sm"
                    value={ramoDe(l.ramo)}
                    onChange={(e) => mudarRamo(l, e.target.value)}
                  >
                    {RAMOS.map((r) => (
                      <option key={r} value={r}>
                        {RAMO_META[r].label}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-slate-400">R$</span>
                  <ValorMensal
                    valor={Number(l.valor_mensal) || 0}
                    onSalvar={(v) => mudarValor(l, v)}
                  />
                </div>

                <div className={`flex flex-wrap gap-2 ${l.isento ? "hidden" : ""}`}>
                  {!l.isento && tipoDoAviso(dias, tolerancia) && (
                    <button className="btn-secondary !py-1.5 text-xs" onClick={() => cobrar(l)}>
                      <MessageCircle size={14} /> Cobrar
                    </button>
                  )}
                  <button className="btn-success !py-1.5 text-xs" onClick={() => pagar(l, 1)}>
                    <CheckCircle2 size={14} /> Pagou 1 mês
                  </button>
                  <button className="btn-secondary !py-1.5 text-xs" onClick={() => pagar(l, 12)}>
                    12 meses
                  </button>
                  <button
                    className={`!py-1.5 text-xs ${l.bloqueada ? "btn-secondary" : "btn-ghost text-red-500"}`}
                    onClick={() => alternarBloqueio(l)}
                  >
                    {l.bloqueada ? (
                      <>
                        <Unlock size={14} /> Desbloquear
                      </>
                    ) : (
                      <>
                        <Ban size={14} /> Bloquear
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ---------- Liberar senha de uma loja ---------- */}
      <Modal
        open={!!senha}
        onClose={() => setSenha(null)}
        title="Liberar troca de senha"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setSenha(null)}>
              Fechar
            </button>
            <button className="btn-primary" onClick={gerarSenha} disabled={senha?.gerando}>
              <KeyRound size={16} /> {senha?.gerando ? "Gerando..." : "Gerar link"}
            </button>
          </>
        }
      >
        <p className="mb-4 text-sm text-slate-500">
          Para quando a loja perdeu a senha e o e-mail de recuperação não chega.
          O link é do próprio Supabase, vale uma vez só e expira em 1 hora.
          Mande pelo WhatsApp e confirme com quem pediu antes — quem tem o link
          entra na conta.
        </p>
        <Field label="E-mail da conta">
          <input
            className="input"
            type="email"
            autoFocus
            placeholder="loja@exemplo.com"
            value={senha?.email || ""}
            onChange={(e) => senha && setSenha({ ...senha, email: e.target.value, link: "" })}
            onKeyDown={(e) => e.key === "Enter" && gerarSenha()}
          />
        </Field>

        {senha?.link && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-sm font-semibold text-emerald-800">Link pronto</p>
            <p className="mt-1 break-all rounded bg-white p-2 text-xs text-slate-600">
              {senha.link}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                className="btn-secondary !py-1.5 text-xs"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(senha.link);
                    aviso.sucesso("Link copiado.");
                  } catch {
                    aviso.alerta("Não consegui copiar. Selecione o texto e copie na mão.");
                  }
                }}
              >
                <Copy size={14} /> Copiar
              </button>
              <button
                className="btn-success !py-1.5 text-xs"
                onClick={() =>
                  abrirWhatsapp(
                    "",
                    `Link para você criar uma senha nova no Sistema TI:\n\n${senha.link}\n\n` +
                      "Vale uma vez só e expira em 1 hora. Não repasse para ninguém."
                  )
                }
              >
                <MessageCircle size={14} /> Enviar no WhatsApp
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ---------- Ajustes do sistema ---------- */}
      <Modal
        open={ajustes}
        onClose={() => setAjustes(false)}
        title="Ajustes do sistema"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setAjustes(false)}>
              Cancelar
            </button>
            <button className="btn-primary" onClick={salvarAjustes}>
              <Save size={16} /> Salvar
            </button>
          </>
        }
      >
        <p className="mb-4 text-sm text-slate-500">
          É isto que as lojas veem na tela de assinatura quando precisam pagar.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Chave Pix" className="sm:col-span-2">
            <input
              className="input"
              placeholder="CPF, CNPJ, telefone, e-mail ou aleatória"
              value={cfg.chave_pix || ""}
              onChange={(e) => setCfg({ ...cfg, chave_pix: e.target.value })}
            />
          </Field>
          <Field label="Titular da chave">
            <input
              className="input"
              value={cfg.titular_pix || ""}
              onChange={(e) => setCfg({ ...cfg, titular_pix: e.target.value })}
            />
          </Field>
          <Field label="WhatsApp para comprovante">
            <input
              className="input"
              placeholder="(11) 99999-9999"
              value={cfg.whatsapp_suporte || ""}
              onChange={(e) => setCfg({ ...cfg, whatsapp_suporte: e.target.value })}
            />
          </Field>
          <Field label="Valor mensal padrão (R$)">
            <InputNumero
              className="input"
              value={cfg.valor_padrao ?? 79}
              onChange={(v) => setCfg({ ...cfg, valor_padrao: (v ?? 0) })}
            />
          </Field>
          <Field label="Dias de teste grátis">
            <InputNumero
              className="input"
              value={cfg.dias_teste ?? 14}
              onChange={(v) => setCfg({ ...cfg, dias_teste: (v ?? 0) })}
            />
          </Field>
          <Field label="Dias de tolerância após vencer" className="sm:col-span-2">
            <InputNumero
              className="input"
              value={cfg.dias_tolerancia ?? 5}
              onChange={(v) => setCfg({ ...cfg, dias_tolerancia: (v ?? 0) })}
            />
            <p className="mt-1 text-xs text-slate-400">
              Passado este prazo, a loja continua consultando e imprimindo, mas
              não cadastra nada novo até acertar.
            </p>
          </Field>
        </div>
      </Modal>
    </div>
  );
};
