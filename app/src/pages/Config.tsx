import React, { useState } from "react";
import { Store, KeyRound, Cloud, Download, Upload, Save, Database, Palette, Sun, Moon, Monitor, Percent, FileText } from "lucide-react";
import { useApp } from "../store/AppStore";
import { Field, SectionTitle } from "../components/ui";
import { ACCENTS, ACCENT_KEYS } from "../lib/themes";
import type { Config as ConfigType } from "../lib/types";

export const Config: React.FC = () => {
  const { config, saveConfig, reload, clientes, ordens, produtos, movimentos, sessoes, fiados, categorias, fornecedores } = useApp();
  const [form, setForm] = useState<ConfigType>(config);
  const [salvo, setSalvo] = useState(false);

  const salvar = () => {
    saveConfig(form);
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
  };

  // Aparência aplica na hora (pré-visualização ao vivo)
  const setAparencia = (patch: Partial<ConfigType>) => {
    const novo = { ...config, ...form, ...patch };
    setForm(novo);
    saveConfig(novo);
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
      categorias,
      fornecedores,
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
        localStorage.setItem("sistema-ti:categorias", JSON.stringify(d.categorias || []));
        localStorage.setItem("sistema-ti:fornecedores", JSON.stringify(d.fornecedores || []));
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

      {/* Termos do recibo */}
      <div className="card mb-5">
        <h3 className="mb-1 flex items-center gap-2 font-bold text-slate-700"><FileText size={18} /> Termos do recibo (guarda / abandono)</h3>
        <p className="mb-4 text-sm text-slate-500">Aparece no rodapé do recibo da OS. Após o prazo, o aparelho pode ser vendido para custear o serviço ou descartado, conforme a lei.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prazo para retirada (dias)">
            <input type="number" className="input" value={form.diasAbandono ?? 90} onChange={(e) => setForm({ ...form, diasAbandono: +e.target.value })} />
          </Field>
          <Field label="Taxa de armazenamento por dia (R$)">
            <input type="number" className="input" value={form.taxaArmazenamentoDia ?? 0} onChange={(e) => setForm({ ...form, taxaArmazenamentoDia: +e.target.value })} />
          </Field>
        </div>
      </div>

      {/* Segurança */}
      <div className="card mb-5">
        <h3 className="mb-4 flex items-center gap-2 font-bold text-slate-700"><KeyRound size={18} /> Senha de acesso</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Senha do sistema">
            <input className="input" value={form.senhaAcesso} onChange={(e) => setForm({ ...form, senhaAcesso: e.target.value })} />
          </Field>
          <Field label="Comissão padrão do técnico (%)">
            <input type="number" className="input" value={form.comissaoPadrao ?? 0} onChange={(e) => setForm({ ...form, comissaoPadrao: +e.target.value })} />
          </Field>
        </div>
      </div>

      {/* Aparência */}
      <div className="card mb-5">
        <h3 className="mb-4 flex items-center gap-2 font-bold text-slate-700"><Palette size={18} /> Aparência</h3>

        <label className="label">Tema</label>
        <div className="mb-5 grid max-w-md grid-cols-3 gap-2">
          {([
            { k: "claro", nome: "Claro", icon: <Sun size={16} /> },
            { k: "escuro", nome: "Escuro", icon: <Moon size={16} /> },
            { k: "auto", nome: "Automático", icon: <Monitor size={16} /> },
          ] as const).map((t) => (
            <button
              key={t.k}
              onClick={() => setAparencia({ tema: t.k })}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition ${
                (config.tema || "claro") === t.k
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t.icon} {t.nome}
            </button>
          ))}
        </div>

        <label className="label">Cor de destaque</label>
        <div className="flex flex-wrap gap-3">
          {ACCENT_KEYS.map((key) => {
            const a = ACCENTS[key];
            const ativo = (config.corDestaque || "azul") === key;
            return (
              <button
                key={key}
                onClick={() => setAparencia({ corDestaque: key })}
                title={a.nome}
                className={`flex h-11 w-11 items-center justify-center rounded-full ring-2 ring-offset-2 transition ${
                  ativo ? "ring-slate-400 scale-110" : "ring-transparent hover:scale-105"
                }`}
                style={{ backgroundColor: a.hex }}
              >
                {ativo && <span className="font-bold text-white">✓</span>}
              </button>
            );
          })}
        </div>
        <p className="mt-3 flex items-center gap-1 text-xs text-slate-400"><Percent size={12} /> As mudanças de tema aparecem na hora e valem para este dispositivo.</p>
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
