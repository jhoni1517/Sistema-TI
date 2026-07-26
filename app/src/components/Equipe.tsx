import React, { useCallback, useEffect, useState } from "react";
import { UserPlus, Users, ShieldCheck, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { NOME_PAPEL, type Papel, type Perfil } from "../lib/auth";


const PAPEIS: Papel[] = ["dono", "gerente", "tecnico", "atendente"];

const DESCRICAO: Record<Papel, string> = {
  dono: "Acesso total, inclusive configurações e relatórios financeiros",
  gerente: "Tudo, exceto trocar o dono da loja",
  tecnico: "Ordens de serviço, clientes e estoque",
  atendente: "Ordens de serviço, clientes, caixa e fiado",
};

/** Gestão de funcionários da loja (visível para dono e gerente) */
export const Equipe: React.FC<{ meuId: string; meuPapel: Papel }> = ({ meuId, meuPapel }) => {
  const [lista, setLista] = useState<Perfil[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [msg, setMsg] = useState("");

  const podeGerenciar = meuPapel === "dono" || meuPapel === "gerente";

  const carregar = useCallback(async () => {
    if (!supabase) return;
    setCarregando(true);
    const { data } = await supabase
      .from("perfis")
      .select("id, loja_id, nome, papel, ativo")
      .order("papel");
    setLista((data as Perfil[]) || []);
    setCarregando(false);
  }, []);

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
    if (p.id === meuId) return alert("Você não pode remover o seu próprio acesso.");
    if (!confirm(`Remover o acesso de ${p.nome || "este usuário"}?`)) return;
    await supabase.from("perfis").delete().eq("id", p.id);
    carregar();
  };

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
                  {p.nome || "(sem nome)"} {p.id === meuId && <span className="text-xs text-slate-400">— você</span>}
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
                      <option key={x} value={x}>{NOME_PAPEL[x]}</option>
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
        <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">
          <p className="mb-1 flex items-center gap-1 font-semibold text-slate-700">
            <UserPlus size={15} /> Como adicionar um funcionário
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-slate-600">
            <li>Peça para ele abrir o sistema e clicar em <b>"Criar conta"</b> com o e-mail dele.</li>
            <li>Depois que a conta for criada, ele aparece aqui para você definir o papel.</li>
            <li>Enquanto você não liberar, ele não enxerga nenhum dado da loja.</li>
          </ol>
        </div>
      )}
    </div>
  );
};
