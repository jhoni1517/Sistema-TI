import React, { useState } from "react";
import { Store, KeyRound, Cloud, Download, Upload, Save, Database } from "lucide-react";
import { useApp } from "../store/AppStore";
import { Field, SectionTitle } from "../components/ui";
import type { Config as ConfigType } from "../lib/types";

export const Config: React.FC = () => {
  const { config, saveConfig, reload, clientes, ordens, produtos, movimentos, sessoes, fiados } = useApp();
  const [form, setForm] = useState<ConfigType>(config);
  const [salvo, setSalvo] = useState(false);

  const salvar = () => {
    saveConfig(form);
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
  };

  const exportar = () => {
    const dump = {
      exportadoEm: new Date().toISOString(),
      clientes,
      ordens,
      produtos,
      movimentos,
      sessoes,
      fiados,
    };
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backup-sistema-ti-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const d = JSON.parse(reader.result as string);
        if (!confirm("Isso substituirá os dados locais atuais. Continuar?")) return;
        localStorage.setItem("sistema-ti:clientes", JSON.stringify(d.clientes || []));
        localStorage.setItem("sistema-ti:ordens", JSON.stringify(d.ordens || []));
        localStorage.setItem("sistema-ti:produtos", JSON.stringify(d.produtos || []));
        localStorage.setItem("sistema-ti:movimentos", JSON.stringify(d.movimentos || []));
        localStorage.setItem("sistema-ti:sessoes", JSON.stringify(d.sessoes || []));
        localStorage.setItem("sistema-ti:fiados", JSON.stringify(d.fiados || []));
        reload();
        alert("Backup importado com sucesso!");
      } catch {
        alert("Arquivo inválido.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="max-w-3xl">
      <SectionTitle title="Configurações" subtitle="Dados da loja, segurança e backup" />

      {/* Dados da loja */}
      <div className="card mb-5">
        <h3 className="mb-4 flex items-center gap-2 font-bold text-slate-700"><Store size={18} /> Dados da loja</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome da loja" className="sm:col-span-2">
            <input className="input" value={form.nomeLoja} onChange={(e) => setForm({ ...form, nomeLoja: e.target.value })} />
          </Field>
          <Field label="Telefone">
            <input className="input" value={form.telefoneLoja} onChange={(e) => setForm({ ...form, telefoneLoja: e.target.value })} />
          </Field>
          <Field label="CNPJ / CPF">
            <input className="input" value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} />
          </Field>
          <Field label="Endereço" className="sm:col-span-2">
            <input className="input" value={form.enderecoLoja} onChange={(e) => setForm({ ...form, enderecoLoja: e.target.value })} />
          </Field>
        </div>
      </div>

      {/* Segurança */}
      <div className="card mb-5">
        <h3 className="mb-4 flex items-center gap-2 font-bold text-slate-700"><KeyRound size={18} /> Senha de acesso</h3>
        <Field label="Senha do sistema" className="max-w-xs">
          <input className="input" value={form.senhaAcesso} onChange={(e) => setForm({ ...form, senhaAcesso: e.target.value })} />
        </Field>
      </div>

      {/* Nuvem */}
      <div className="card mb-5">
        <h3 className="mb-1 flex items-center gap-2 font-bold text-slate-700"><Cloud size={18} /> Sincronização na nuvem (Supabase)</h3>
        <p className="mb-4 text-sm text-slate-500">
          Preencha para acessar os mesmos dados no PC e no celular. Crie um projeto grátis em supabase.com,
          rode o script SQL do arquivo <code className="rounded bg-slate-100 px-1">supabase-schema.sql</code> e cole abaixo a URL e a chave <b>anon</b>.
        </p>
        <div className="grid gap-4">
          <Field label="Supabase URL">
            <input className="input" placeholder="https://xxxx.supabase.co" value={form.supabaseUrl || ""} onChange={(e) => setForm({ ...form, supabaseUrl: e.target.value })} />
          </Field>
          <Field label="Supabase anon key">
            <input className="input" placeholder="eyJhbGciOi..." value={form.supabaseKey || ""} onChange={(e) => setForm({ ...form, supabaseKey: e.target.value })} />
          </Field>
        </div>
        <p className="mt-2 text-xs text-amber-600">Após salvar, recarregue a página para ativar a nuvem.</p>
      </div>

      {/* Backup */}
      <div className="card mb-5">
        <h3 className="mb-4 flex items-center gap-2 font-bold text-slate-700"><Database size={18} /> Backup dos dados</h3>
        <div className="flex flex-wrap gap-3">
          <button className="btn-secondary" onClick={exportar}><Download size={16} /> Exportar backup</button>
          <label className="btn-secondary cursor-pointer">
            <Upload size={16} /> Importar backup
            <input type="file" accept="application/json" className="hidden" onChange={importar} />
          </label>
        </div>
      </div>

      <div className="sticky bottom-4 flex items-center gap-3">
        <button className="btn-primary shadow-lg" onClick={salvar}><Save size={16} /> Salvar configurações</button>
        {salvo && <span className="text-sm font-semibold text-emerald-600">✓ Salvo!</span>}
      </div>
    </div>
  );
};
