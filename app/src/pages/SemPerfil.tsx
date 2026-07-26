import React from "react";
import { ShieldAlert, LogOut } from "lucide-react";

/**
 * Conta autenticada, porém sem vínculo com nenhuma loja.
 * Acontece no primeiro acesso do dono (antes de rodar o comando de vínculo)
 * ou quando um funcionário ainda não foi liberado pelo responsável.
 */
export const SemPerfil: React.FC<{ email: string; onSair: () => void }> = ({
  email,
  onSair,
}) => (
  <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
    <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
      <ShieldAlert className="mx-auto mb-3 text-amber-500" size={40} />
      <h1 className="text-center text-lg font-bold text-slate-800">
        Conta criada, mas sem acesso a uma loja
      </h1>
      <p className="mt-2 text-center text-sm text-slate-600">
        Sua conta <b>{email}</b> ainda não está vinculada a nenhuma loja.
      </p>

      <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
        <p className="mb-2 font-semibold">Se você é o dono (primeiro acesso):</p>
        <p className="mb-2 text-xs text-slate-500">
          Rode este comando no SQL Editor do Supabase para se tornar o
          responsável pela loja:
        </p>
        <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
{`insert into perfis (id, loja_id, nome, papel)
select u.id,
       (select id from lojas order by "criadoEm" limit 1),
       'Dono', 'dono'
  from auth.users u
 where u.email = '${email}'
on conflict (id) do update set papel = 'dono';`}
        </pre>
        <p className="mt-3 text-xs text-slate-500">
          Depois, atualize esta página.
        </p>
      </div>

      <p className="mt-4 text-center text-xs text-slate-500">
        Se você é funcionário, peça ao responsável para liberar seu acesso em
        <b> Configurações → Equipe</b>.
      </p>

      <div className="mt-5 flex justify-center gap-2">
        <button className="btn-secondary" onClick={() => window.location.reload()}>
          Já vinculei — atualizar
        </button>
        <button className="btn-ghost" onClick={onSair}>
          <LogOut size={16} /> Sair
        </button>
      </div>
    </div>
  </div>
);
