import React, { useCallback, useEffect, useState } from "react";
import { aviso } from "./Aviso";
import {
  UserPlus,
  Users,
  ShieldCheck,
  Trash2,
  Ticket,
  Copy,
  Check,
  Store,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import {
  NOME_PAPEL,
  criarConvite,
  listarConvites,
  apagarConvite,
  linkConvite,
  type Convite,
  type Papel,
  type Perfil,
} from "../lib/auth";

const PAPEIS: Papel[] = ["dono", "gerente", "tecnico", "atendente"];

const DESCRICAO: Record<Papel, string> = {
  dono: "Acesso total, inclusive configurações e relatórios financeiros",
  gerente: "Tudo, exceto trocar o dono da loja",
  tecnico: "Ordens de serviço, clientes e estoque",
  atendente: "Ordens de serviço, clientes, caixa e fiado",
};

const venceEm = (iso: string): string => {
  const dias = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  if (dias < 0) return "vencido";
  if (dias === 0) return "vence hoje";
  return `vence em ${dias} dia${dias > 1 ? "s" : ""}`;
};

/** Gestão de funcionários da loja (visível para dono e gerente) */
export const Equipe: React.FC<{
  meuId: string;
  meuPapel: Papel;
  souSuperAdmin?: boolean;
}> = ({ meuId, meuPapel, souSuperAdmin }) => {
  const [lista, setLista] = useState<Perfil[]>([]);
  const [convites, setConvites] = useState<Convite[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [msg, setMsg] = useState("");
  const [novoPapel, setNovoPapel] = useState<Papel>("atendente");
  const [novoNome, setNovoNome] = useState("");
  const [gerando, setGerando] = useState(false);
  const [copiado, setCopiado] = useState("");

  const podeGerenciar = meuPapel === "dono" || meuPapel === "gerente";

  const carregar = useCallback(async () => {
    if (!supabase) return;
    setCarregando(true);
    const { data } = await supabase
      .from("perfis")
      .select("id, loja_id, nome, papel, ativo, super_admin")
      .order("papel");
    setLista((data as Perfil[]) || []);
    if (podeGerenciar) setConvites(await listarConvites());
    setCarregando(false);
  }, [podeGerenciar]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const atualizar = async (p: Perfil, campos: Partial<Perfil>) => {
    if (!supabase) return;
    const { error } = await supabase.from("perfis").update(campos).eq("id", p.id);
    if (error) {
      setMsg("Não foi possível alterar: " + error.message);
      return;
    }
    setMsg("");
    carregar();
  };

  const remover = async (p: Perfil) => {
    if (!supabase) return;
    if (p.id === meuId) return aviso.alerta("Você não pode remover o seu próprio acesso.");
    if (!confirm(`Remover o acesso de ${p.nome || "este usuário"}?`)) return;
    await supabase.from("perfis").delete().eq("id", p.id);
    carregar();
  };

  const gerar = async (novaLoja: boolean) => {
    setGerando(true);
    setMsg("");
    try {
      await criarConvite(novaLoja ? "dono" : novoPapel, novoNome, novaLoja);
      setNovoNome("");
      await carregar();
      aviso.sucesso("Convite criado. Copie o link abaixo e mande para a pessoa.");
    } catch (e) {
      /*
       * O erro vai no AVISO, não num parágrafo no topo do card.
       *
       * `msg` é renderizado logo abaixo do título, e o botão "Liberar nova
       * loja" fica no fim de um card comprido. No celular, clicar no botão
       * escrevia o erro a duas telas de rolagem de distância: a pessoa via o
       * botão piscar e nada acontecer, e concluía que estava quebrado. Erro
       * que a pessoa não vê é erro engolido, mesmo estando na tela.
       */
      aviso.erro(e instanceof Error ? e.message : String(e));
    } finally {
      setGerando(false);
    }
  };

  const copiar = async (c: Convite) => {
    const texto = linkConvite(c.codigo);
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // Alguns navegadores bloqueiam a área de transferência; mostrar já resolve
      prompt("Copie o link do convite:", texto);
    }
    setCopiado(c.codigo);
    setTimeout(() => setCopiado(""), 2000);
  };

  const descartar = async (c: Convite) => {
    if (!confirm(`Cancelar o convite ${c.codigo}?`)) return;
    await apagarConvite(c.codigo);
    carregar();
  };

  const pendentes = convites.filter((c) => !c.usado_por);

  return (
    <div className="card mb-5">
      <h3 className="mb-1 flex items-center gap-2 font-bold text-slate-700">
        <Users size={18} /> Equipe e permissões
      </h3>
      <p className="mb-4 text-sm text-slate-500">
        Cada pessoa entra com o próprio e-mail e senha. As permissões valem no
        banco de dados, não só na tela.
      </p>

      {msg && <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{msg}</p>}

      {carregando ? (
        <p className="py-4 text-center text-sm text-slate-400">Carregando...</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {lista.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <ShieldCheck size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">
                  {p.nome || "(sem nome)"}{" "}
                  {p.id === meuId && <span className="text-xs text-slate-400">— você</span>}
                </p>
                <p className="text-xs text-slate-400">{DESCRICAO[p.papel]}</p>
              </div>

              {podeGerenciar && p.id !== meuId ? (
                <>
                  <select
                    className="input !w-auto !py-1.5 text-sm"
                    value={p.papel}
                    onChange={(e) => atualizar(p, { papel: e.target.value as Papel })}
                  >
                    {PAPEIS.filter((x) => x !== "dono" || meuPapel === "dono").map((x) => (
                      <option key={x} value={x}>
                        {NOME_PAPEL[x]}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1.5 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={p.ativo}
                      onChange={(e) => atualizar(p, { ativo: e.target.checked })}
                    />
                    Ativo
                  </label>
                  <button className="btn-ghost !p-2 text-red-500" onClick={() => remover(p)}>
                    <Trash2 size={15} />
                  </button>
                </>
              ) : (
                <span className="badge bg-slate-100 text-slate-600">{NOME_PAPEL[p.papel]}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {podeGerenciar && (
        <div className="mt-5 rounded-xl bg-slate-50 p-4">
          <p className="mb-1 flex items-center gap-1.5 font-semibold text-slate-700">
            <UserPlus size={16} /> Convidar para a equipe
          </p>
          <p className="mb-3 text-xs text-slate-500">
            Gere um código, mande o link no WhatsApp e pronto. Sem convite,
            ninguém consegue criar conta neste sistema.
          </p>

          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[10rem] flex-1">
              <label className="label">Nome (opcional)</label>
              <input
                className="input"
                placeholder="Ex: João — balcão"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Papel</label>
              <select
                className="input !w-auto"
                value={novoPapel}
                onChange={(e) => setNovoPapel(e.target.value as Papel)}
              >
                {PAPEIS.filter((x) => x !== "dono" || meuPapel === "dono").map((x) => (
                  <option key={x} value={x}>
                    {NOME_PAPEL[x]}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn-primary" disabled={gerando} onClick={() => gerar(false)}>
              <Ticket size={16} /> Gerar convite
            </button>
          </div>

          {souSuperAdmin && (
            <div className="mt-4 border-t border-slate-200 pt-3">
              <p className="mb-2 text-xs text-slate-500">
                Você administra o sistema. Este botão libera uma{" "}
                <b>assistência nova</b>, com dados totalmente separados dos seus —
                é assim que outro cliente começa a usar o sistema.
              </p>
              <button className="btn-secondary" disabled={gerando} onClick={() => gerar(true)}>
                <Store size={16} /> Liberar nova loja
              </button>
            </div>
          )}

          {pendentes.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold text-slate-600">Convites em aberto</p>
              {pendentes.map((c) => (
                <div
                  key={c.codigo}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2.5"
                >
                  <code className="rounded bg-slate-900 px-2 py-1 font-mono text-sm tracking-widest text-white">
                    {c.codigo}
                  </code>
                  <div className="min-w-0 flex-1 text-xs text-slate-500">
                    {c.nova_loja ? (
                      <b className="text-brand-600">Loja nova</b>
                    ) : (
                      NOME_PAPEL[c.papel]
                    )}
                    {c.nome ? ` · ${c.nome}` : ""} · {venceEm(c.expira_em)}
                  </div>
                  <button className="btn-secondary !py-1.5 text-xs" onClick={() => copiar(c)}>
                    {copiado === c.codigo ? <Check size={14} /> : <Copy size={14} />}
                    {copiado === c.codigo ? "Copiado" : "Copiar link"}
                  </button>
                  <button className="btn-ghost !p-1.5 text-slate-400" onClick={() => descartar(c)}>
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
