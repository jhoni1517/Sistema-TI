import React, { useState } from "react";
import { aviso } from "../components/Aviso";
import { ImagemUpload } from "../components/ImagemUpload";
import { Store, KeyRound, Cloud, Download, Upload, Save, Database, Palette, Sun, Moon, Monitor, Percent, FileText, ShieldCheck } from "lucide-react";
import { useApp } from "../store/AppStore";
import { RAMO_META, temRecurso } from "../lib/ramos";
import { Field, SectionTitle, InputNumero } from "../components/ui";
import { ACCENTS, ACCENT_KEYS } from "../lib/themes";
import { Equipe } from "../components/Equipe";
import { MinhaConta } from "../components/MinhaConta";
import { carregarSessao, type Sessao } from "../lib/auth";
import { importarTudo, type DumpLoja } from "../lib/db";
import type { Config as ConfigType } from "../lib/types";

export const Config: React.FC = () => {
  const { config, saveConfig, reload, ramoContratado, clientes, ordens, produtos, movimentos, sessoes, fiados, categorias, fornecedores, cotacoes, precos } = useApp();
  const [form, setForm] = useState<ConfigType>(config);
  const [salvo, setSalvo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [sessao, setSessao] = useState<Sessao | null>(null);

  React.useEffect(() => {
    carregarSessao().then(setSessao);
  }, []);

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
    // A configuração vai junto, MENOS as credenciais da nuvem: um backup
    // costuma ser mandado por e-mail ou WhatsApp, e a chave não pode ir a
    // reboque. Cotações e histórico de preços entram porque são dados que
    // levam meses para acumular e não têm como ser recriados.
    const { supabaseUrl: _u, supabaseKey: _k, senhaAcesso: _s, ...configSegura } = config;
    const dump = {
      exportadoEm: new Date().toISOString(),
      versao: 2,
      config: configSegura,
      clientes,
      ordens,
      produtos,
      movimentos,
      sessoes,
      fiados,
      categorias,
      fornecedores,
      cotacoes,
      precos,
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
    // Permite escolher o mesmo arquivo de novo depois de um erro
    e.target.value = "";

    const reader = new FileReader();
    reader.onload = async () => {
      let d: Record<string, unknown>;
      try {
        d = JSON.parse(reader.result as string);
      } catch {
        return aviso.erro("Arquivo inválido: não é um backup do sistema.");
      }
      if (!d || typeof d !== "object" || !Array.isArray(d.clientes)) {
        return aviso.erro("Arquivo inválido: não parece um backup deste sistema.");
      }

      const total = ["clientes", "ordens", "produtos", "movimentos", "sessoes", "fiados", "categorias", "fornecedores", "cotacoes", "precos"]
        .reduce((s2, k) => s2 + (Array.isArray(d[k]) ? (d[k] as unknown[]).length : 0), 0);

      if (
        !confirm(
          `Importar ${total} registro(s)? Registros com o mesmo código serão sobrescritos pelos do arquivo.`
        )
      ) {
        return;
      }

      setImportando(true);
      try {
        const r = await importarTudo(d as DumpLoja);
        await reload();
        if (r.falhas > 0) {
          aviso.alerta(
            `${r.gravados} registro(s) importado(s), ${r.falhas} recusado(s). ` +
              "Se a assinatura estiver vencida, a gravação fica bloqueada."
          );
        } else {
          aviso.sucesso(`${r.gravados} registro(s) importado(s).`);
        }
      } catch (err) {
        aviso.erro(
          "Falha ao importar: " + (err instanceof Error ? err.message : String(err))
        );
      } finally {
        setImportando(false);
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

          {/* A logo entra no recibo impresso e na página que o cliente abre.
              É o que faz o papel parecer da loja e não de um sistema. */}
          <div className="sm:col-span-2">
            <ImagemUpload
              label="Logo da loja"
              url={form.logoUrl}
              onChange={(logoUrl) => setForm({ ...form, logoUrl })}
              pasta="logo"
              lado={400}
              formato="faixa"
              dica="Aparece no recibo impresso e na página de acompanhamento do cliente. A imagem é enviada na hora — não precisa clicar em Salvar para ela subir."
            />
          </div>

          {/* O ramo é o que a loja CONTRATOU, não uma preferência: quem
              comprou mercearia podia se virar pizzaria sozinho e usar o que
              não pagou. Quem muda é o administrador do sistema, e o banco
              recusa a troca vinda daqui. */}
          <div className="sm:col-span-2">
            <label className="label">Seu sistema</label>
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-800">
                  {RAMO_META[ramoContratado].label}
                </p>
                <p className="text-xs text-slate-500">
                  {RAMO_META[ramoContratado].descricao}
                </p>
              </div>
              {sessao?.perfil?.super_admin ? (
                <span className="badge bg-brand-100 text-brand-700">
                  Troque em Lojas assinantes
                </span>
              ) : (
                <span className="badge bg-slate-200 text-slate-600">Plano contratado</span>
              )}
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Para conhecer os outros tipos de sistema ou trocar de plano, fale
              com o suporte. Nada do que você cadastrou se perde na troca.
            </p>
          </div>
        </div>
      </div>

      {/* Termos do recibo */}
      <div className="card mb-5">
        <h3 className="mb-1 flex items-center gap-2 font-bold text-slate-700"><FileText size={18} /> Termos do recibo (guarda / abandono)</h3>
        <p className="mb-4 text-sm text-slate-500">Aparece no rodapé do recibo da OS. Após o prazo, o aparelho pode ser vendido para custear o serviço ou descartado, conforme a lei.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prazo para retirada (dias)">
            <InputNumero value={form.diasAbandono ?? 90} onChange={(v) => setForm({ ...form, diasAbandono: v })} />
          </Field>
          {temRecurso(ramoContratado, "peso") && (
            <Field label="A balança grava o quê na etiqueta?" className="sm:col-span-2">
              <div className="grid max-w-md grid-cols-2 gap-2">
                {([
                  { k: "peso", nome: "Peso (gramas)" },
                  { k: "preco", nome: "Preço (centavos)" },
                ] as const).map((f) => (
                  <button
                    key={f.k}
                    type="button"
                    onClick={() => setForm({ ...form, formatoBalanca: f.k })}
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                      (form.formatoBalanca || "peso") === f.k
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {f.nome}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-400">
                As duas formas existem. Se o peso lançado sair mil vezes maior ou
                menor do que devia, é este ajuste que está trocado — a sequência
                de dígitos é a mesma nos dois formatos.
              </p>
            </Field>
          )}

          <Field label="Link para o cliente avaliar a loja" className="sm:col-span-2">
            <input
              className="input"
              placeholder="https://g.page/r/.../review"
              value={form.linkAvaliacao || ""}
              onChange={(e) => setForm({ ...form, linkAvaliacao: e.target.value })}
            />
            <p className="mt-1 text-xs text-slate-400">
              Entra na mensagem de WhatsApp e no recibo, mas só quando a OS é
              ENTREGUE. Pedir estrela antes de o serviço terminar é pedir no
              pior momento. No Google Meu Negócio: Início, botão Avaliações,
              Obtenha mais avaliações, e copie o link.
            </p>
          </Field>
          <Field label="Taxa de armazenamento por dia (R$)">
            <InputNumero value={form.taxaArmazenamentoDia ?? 0} onChange={(v) => setForm({ ...form, taxaArmazenamentoDia: v })} />
          </Field>
        </div>
      </div>

      {/* Minha conta */}
      {sessao && <MinhaConta sessao={sessao} />}

      {/* Equipe e permissões */}
      {sessao?.perfil && (
        <Equipe
          meuId={sessao.perfil.id}
          meuPapel={sessao.perfil.papel}
          souSuperAdmin={sessao.perfil.super_admin}
        />
      )}

      {/* Operação */}
      <div className="card mb-5">
        <h3 className="mb-4 flex items-center gap-2 font-bold text-slate-700"><KeyRound size={18} /> Operação</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Comissão padrão do técnico (%)">
            <InputNumero value={form.comissaoPadrao ?? 0} onChange={(v) => setForm({ ...form, comissaoPadrao: v })} />
          </Field>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          A senha de acesso é individual: cada pessoa entra com o próprio e-mail
          e troca a senha aqui mesmo, em "Minha conta".
        </p>
      </div>

      {/* Proteção dos dados do cliente */}
      <div className="card mb-5">
        <h3 className="mb-1 flex items-center gap-2 font-bold text-slate-700">
          <ShieldCheck size={18} /> Proteção dos dados do cliente
        </h3>
        <p className="mb-4 text-sm text-slate-500">
          A senha e o padrão de desbloqueio do aparelho são guardados
          criptografados. Nem num backup do banco eles aparecem em texto legível.
        </p>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-slate-50 p-3">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4"
            checked={form.limparSenhaNaEntrega !== false}
            onChange={(e) => setForm({ ...form, limparSenhaNaEntrega: e.target.checked })}
          />
          <span className="text-sm">
            <b className="text-slate-700">Apagar a senha do aparelho na entrega</b>
            <span className="mt-0.5 block text-xs text-slate-500">
              Recomendado. Depois que o aparelho volta para o dono, guardar a
              senha dele não serve para nada e só aumenta o estrago em caso de
              vazamento.
            </span>
          </span>
        </label>

        <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-400">
          <ShieldCheck size={13} className="mt-0.5 shrink-0" />
          Quem abre a senha de um aparelho fica registrado com data e hora.
        </p>
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
          <label className={`btn-secondary cursor-pointer ${importando ? "pointer-events-none opacity-60" : ""}`}>
            <Upload size={16} /> {importando ? "Importando..." : "Importar backup"}
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
