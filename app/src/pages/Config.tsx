import React, { useState } from "react";
import { aviso } from "../components/Aviso";
import { ImagemUpload } from "../components/ImagemUpload";
import { Store, KeyRound, Cloud, Download, Upload, Save, Database, Palette, Sun, Moon, Monitor, Percent, FileText, ShieldCheck } from "lucide-react";
import { useApp } from "../store/AppStore";
import { RAMO_META, temRecurso } from "../lib/ramos";
import { REGRA_MEIO_A_MEIO_META, regraDe, type RegraMeioAMeio } from "../lib/pizza";
import {
  REGIME_META,
  regimeDe,
  usaCsosn,
  pendenciasDaLoja,
  type RegimeTributario,
} from "../lib/fiscal";
import { Field, SectionTitle, InputNumero } from "../components/ui";
import { ACCENTS, ACCENT_KEYS } from "../lib/themes";
import { Equipe } from "../components/Equipe";
import { MinhaConta } from "../components/MinhaConta";
import { carregarSessao, type Sessao } from "../lib/auth";
import { importarTudo, type DumpLoja } from "../lib/db";
import { problemaNoChatId } from "../lib/config";
import { CatalogoPublico, TituloCatalogo } from "../components/CatalogoPublico";
import type { Config as ConfigType } from "../lib/types";

export const Config: React.FC = () => {
  const { config, saveConfig, reload, ramoContratado, clientes, ordens, produtos, movimentos, sessoes, fiados, categorias, fornecedores, cotacoes, precos } = useApp();
  const [form, setForm] = useState<ConfigType>(config);
  const [salvo, setSalvo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [sessao, setSessao] = useState<Sessao | null>(null);
  /** A pessoa já mexeu em algum campo? Enquanto não, o formulário segue a nuvem. */
  const [mexeu, setMexeu] = useState(false);

  /*
   * O formulário nasce com o que o APARELHO tinha e nunca era atualizado.
   *
   * `useState(config)` só vale na primeira renderização. A configuração da
   * loja chega da nuvem um instante depois, e o formulário continuava
   * mostrando o padrão — "Minha Assistência TI", telefone em branco, sem
   * logo, sem chat do Telegram.
   *
   * Isso já seria ruim. O grave é o passo seguinte: clicar em Salvar subia
   * esse formulário em branco por cima do que a loja tinha, apagando para
   * TODOS os aparelhos. Foi exatamente o que aconteceu — o celular abriu
   * vazio, o dono salvou, e o computador perdeu tudo junto.
   *
   * Enquanto ninguém mexeu num campo, o formulário acompanha a nuvem. Depois
   * que mexeu, para de acompanhar: recarregar por cima de quem está digitando
   * é o outro jeito de perder o que a pessoa acabou de escrever.
   */
  React.useEffect(() => {
    if (!mexeu) setForm(config);
  }, [config, mexeu]);

  /** Toda alteração de campo passa por aqui, para o formulário parar de seguir a nuvem */
  const mudar = (patch: Partial<ConfigType>) => {
    setMexeu(true);
    setForm((f) => ({ ...f, ...patch }));
  };

  React.useEffect(() => {
    carregarSessao().then(setSessao);
  }, []);

  const salvar = async () => {
    // Recusa antes de gravar. Só avisar não bastaria: o campo já sobe para o
    // banco, e um token que chegou lá já saiu no backup.
    const erroChat = problemaNoChatId(form.telegramChatId || "");
    if (erroChat) return aviso.erro(erroChat);

    /*
     * "Salvo!" só depois de a nuvem confirmar.
     *
     * Antes a tela dizia "Salvo!" e zerava `mexeu` na hora, sem esperar. Com
     * a gravação recusada — leitura da nuvem ainda em curso, assinatura
     * vencida, rede fora — acontecia o pior dos dois mundos: a pessoa lia
     * "Salvo!" e, como o formulário voltava a seguir a nuvem, tudo que ela
     * tinha digitado era descartado na sincronização seguinte.
     *
     * `mexeu` continua ligado quando falha: é ele que segura o texto na tela
     * para a pessoa tentar de novo sem redigitar.
     */
    const subiu = await saveConfig(form);
    if (!subiu) return;
    setMexeu(false);
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
            <input className="input" value={form.nomeLoja} onChange={(e) => mudar({ nomeLoja: e.target.value })} />
          </Field>
          <Field label="Telefone">
            <input className="input" value={form.telefoneLoja} onChange={(e) => mudar({ telefoneLoja: e.target.value })} />
          </Field>
          <Field label="CNPJ / CPF">
            <input className="input" value={form.cnpj} onChange={(e) => mudar({ cnpj: e.target.value })} />
          </Field>
          <Field label="Endereço" className="sm:col-span-2">
            <input className="input" value={form.enderecoLoja} onChange={(e) => mudar({ enderecoLoja: e.target.value })} />
          </Field>
          {/* Sai na mensagem de aparelho pronto, junto do endereço e do
              telefone. Antes o cliente lia "dentro do nosso horário de
              atendimento" e tinha que ligar para descobrir qual era. */}
          <Field label="Horário de atendimento" className="sm:col-span-2">
            <input
              className="input"
              placeholder="Seg a Sex, 9h as 18h. Sab, 9h as 13h"
              value={form.horarioAtendimento || ""}
              onChange={(e) => mudar({ horarioAtendimento: e.target.value })}
            />
            <p className="mt-1 text-xs text-slate-400">
              Sai na mensagem de aparelho pronto, junto do endereço e do telefone.
            </p>
          </Field>

          {/* A logo entra no recibo impresso e na página que o cliente abre.
              É o que faz o papel parecer da loja e não de um sistema. */}
          <div className="sm:col-span-2">
            <ImagemUpload
              label="Logo da loja"
              url={form.logoUrl}
              /* Grava na hora, porque a dica logo abaixo promete isso. Só
                 mexer no formulário deixava o endereço da imagem esperando
                 um Salvar que ninguém dá — o arquivo subia para o depósito e
                 o sistema esquecia onde ele estava. */
              onChange={(logoUrl) => {
                const novo = { ...config, ...form, logoUrl };
                setForm(novo);
                saveConfig(novo);
              }}
              pasta="logo"
              lado={400}
              formato="faixa"
              dica="Aparece no recibo impresso e na página de acompanhamento do cliente. A imagem é enviada na hora — não precisa clicar em Salvar para ela subir."
            />
          </div>

          <Field label="Limite de dinheiro na gaveta (R$)">
            <InputNumero
              className="input"
              value={form.limiteGaveta}
              onChange={(limiteGaveta) => mudar({ limiteGaveta })}
            />
            <p className="mt-1 text-xs text-slate-400">
              Passando disso, o Caixa sugere uma sangria. Vazio = sem aviso.
            </p>
          </Field>

          {/* Avisos no Telegram DESTA loja. A rotina diária mandava tudo
              para um chat só, o do operador do sistema: nome e dívida de
              cliente iam parar no celular de outra pessoa, e quem precisava
              do lembrete não recebia nada. */}
          <Field label="Avisos no Telegram (chat id)">
            <input
              className="input"
              value={form.telegramChatId || ""}
              onChange={(e) => mudar({ telegramChatId: e.target.value.trim() })}
              placeholder="ex.: 123456789"
              inputMode="numeric"
            />
            {/* O token do robô já foi colado aqui uma vez. Este campo vai
                para o banco e sai no backup, que circula por conversa —
                segredo colado aqui está queimado no minuto seguinte. */}
            {problemaNoChatId(form.telegramChatId || "") && (
              <p className="mt-1 whitespace-pre-line rounded-lg bg-rose-50 p-2 text-xs text-rose-700">
                {problemaNoChatId(form.telegramChatId || "")}
              </p>
            )}
            <p className="mt-1 text-xs text-slate-400">
              Contas a pagar, agenda, aniversários e fiado vencido chegam aqui todo
              dia. Para descobrir o seu numero, abra o robo no Telegram e mande
              /start — ele responde com o chat id. Vazio = esta loja nao recebe aviso.
            </p>
          </Field>

          {/* Papel da impressora. O recibo saía sempre em A4 e a bobina do
              balcão cortava a metade direita de tudo, inclusive do total. */}
          <Field label="Papel da impressora">
            <select
              className="input"
              value={form.papelImpressao || "a4"}
              onChange={(e) =>
                mudar({ papelImpressao: e.target.value as "a4" | "58" | "80" })
              }
            >
              <option value="a4">Folha comum (A4)</option>
              <option value="80">Bobina térmica 80mm</option>
              <option value="58">Bobina térmica 58mm</option>
            </select>
            <p className="mt-1 text-xs text-slate-400">
              Na bobina o recibo sai em coluna única, sem tabela lado a lado.
            </p>
          </Field>

          {/* O catálogo mora no Estoque, junto dos produtos que ele publica.
              Aqui ficava enterrado no meio do formulário e ninguém achava. */}
          <div className="sm:col-span-2 rounded-xl border border-slate-200 p-3">
            <TituloCatalogo />
            <CatalogoPublico nomeLoja={form.nomeLoja} />
            <p className="mt-2 text-xs text-slate-400">
              Este mesmo botão fica em <b>Estoque &rarr; Catálogo</b>, que é onde
              ele é mais fácil de achar.
            </p>
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
            <InputNumero value={form.diasAbandono ?? 90} onChange={(v) => mudar({ diasAbandono: v })} />
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
                    onClick={() => mudar({ formatoBalanca: f.k })}
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

          {temRecurso(ramoContratado, "meioAMeio") && (
            <Field label="Pizza de mais de um sabor: quanto cobrar?" className="sm:col-span-2">
              <div className="grid max-w-md gap-2">
                {(Object.keys(REGRA_MEIO_A_MEIO_META) as RegraMeioAMeio[]).map((k) => {
                  const meta = REGRA_MEIO_A_MEIO_META[k];
                  const ativa = regraDe(form.regraMeioAMeio) === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => mudar({ regraMeioAMeio: k })}
                      className={`rounded-lg border px-3 py-2 text-left transition ${
                        ativa
                          ? "border-brand-500 bg-brand-50"
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <span
                        className={`block text-sm font-semibold ${ativa ? "text-brand-700" : "text-slate-700"}`}
                      >
                        {meta.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {meta.explicacao}
                      </span>
                    </button>
                  );
                })}
              </div>
              {/* Duas opções e não três: somar as metades dá exatamente a
                  média, então oferecer as duas seria pedir para escolher
                  entre coisas idênticas. Ver lib/pizza.ts. */}
              <p className="mt-1 text-xs text-slate-400">
                Vale no balcão, no delivery e na comanda. Mudar aqui não altera
                pedido já fechado.
              </p>
            </Field>
          )}

          {/*
            Dados fiscais da loja.
            NENHUMA CREDENCIAL AQUI. O CSC da SEFAZ e o token do emissor são
            segredos, e esta tela sobe para a nuvem, entra no backup e sai no
            arquivo de exportação — que circula por WhatsApp e e-mail. Um
            token aqui é um token queimado. Ver lib/fiscal.ts.
          */}
          <Field label="Inscrição Estadual" className="sm:col-span-2">
            <input
              className="input"
              inputMode="numeric"
              placeholder="Só números"
              value={form.inscricaoEstadual || ""}
              onChange={(e) => mudar({ inscricaoEstadual: e.target.value })}
            />
            <p className="mt-1 text-xs text-slate-400">
              {pendenciasDaLoja(form).length === 0
                ? "Dados fiscais da loja completos."
                : `Falta para emitir nota: ${pendenciasDaLoja(form).join("; ")}.`}
            </p>
          </Field>

          <Field label="Inscrição Municipal" className="sm:col-span-2">
            <input
              className="input"
              inputMode="numeric"
              placeholder="Só quem cobra serviço precisa"
              value={form.inscricaoMunicipal || ""}
              onChange={(e) => mudar({ inscricaoMunicipal: e.target.value })}
            />
            <p className="mt-1 text-xs text-slate-400">
              É o registro na PREFEITURA, e vale para a nota de serviço (NFS-e).
              A Estadual, logo acima, vale para a nota de mercadoria. Uma
              assistência técnica precisa das duas: vende peça e cobra mão de obra.
            </p>
          </Field>

          <Field label="Regime tributário" className="sm:col-span-2">
            <div className="grid max-w-md gap-2">
              {(Object.keys(REGIME_META) as RegimeTributario[]).map((k) => {
                const meta = REGIME_META[k];
                const ativo = regimeDe(form.regimeTributario) === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => mudar({ regimeTributario: k })}
                    className={`rounded-lg border px-3 py-2 text-left transition ${
                      ativo ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className={`block text-sm font-semibold ${ativo ? "text-brand-700" : "text-slate-700"}`}
                    >
                      {meta.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">{meta.descricao}</span>
                  </button>
                );
              })}
            </div>
          </Field>

          {/* Padrões que valem para o produto que não tem o dele. Ficam aqui
              porque são quase sempre iguais na loja inteira — obrigar a
              digitar os quatro em duzentos produtos é o caminho para ninguém
              preencher nenhum. */}
          <Field label={usaCsosn(regimeDe(form.regimeTributario)) ? "CSOSN padrão" : "CST padrão"}>
            <input
              className="input"
              inputMode="numeric"
              placeholder={usaCsosn(regimeDe(form.regimeTributario)) ? "102" : "00"}
              value={
                (usaCsosn(regimeDe(form.regimeTributario))
                  ? form.csosnPadrao
                  : form.cstPadrao) || ""
              }
              onChange={(e) =>
                mudar(
                  usaCsosn(regimeDe(form.regimeTributario))
                    ? { csosnPadrao: e.target.value }
                    : { cstPadrao: e.target.value }
                )
              }
            />
          </Field>

          <Field label="CFOP padrão">
            <input
              className="input"
              inputMode="numeric"
              placeholder="5102"
              value={form.cfopPadrao || ""}
              onChange={(e) => mudar({ cfopPadrao: e.target.value })}
            />
            <p className="mt-1 text-xs text-slate-400">
              Nota de consumidor é sempre dentro do estado, então começa em 5.
            </p>
          </Field>

          <Field label="CNAE principal">
            <input
              className="input"
              inputMode="numeric"
              placeholder="5611201"
              value={form.cnae || ""}
              onChange={(e) => mudar({ cnae: e.target.value })}
            />
            <p className="mt-1 text-xs text-slate-400">
              Está no cartão do CNPJ. Restaurante costuma ser 5611-2/01.
            </p>
          </Field>

          {/*
            Endereço PARTIDO em campos, só para a nota.

            O endereço lá de cima continua sendo a linha única que sai no
            recibo e na mensagem do cliente. A nota precisa dos campos
            separados, e partir a linha depois não é confiável: "Rua 15 de
            Novembro, 1500" tem número no nome da rua.
          */}
          <div className="sm:col-span-2">
            <p className="label">Endereço para a nota fiscal</p>
            <p className="mb-2 text-xs text-slate-400">
              A nota exige o endereço em campos separados. O endereço lá de cima
              continua valendo para o recibo e para as mensagens.
            </p>
            <div className="grid gap-3 sm:grid-cols-6">
              <div className="sm:col-span-4">
                <input
                  className="input"
                  placeholder="Rua"
                  value={form.nfLogradouro || ""}
                  onChange={(e) => mudar({ nfLogradouro: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <input
                  className="input"
                  placeholder="Número"
                  value={form.nfNumero || ""}
                  onChange={(e) => mudar({ nfNumero: e.target.value })}
                />
              </div>
              <div className="sm:col-span-3">
                <input
                  className="input"
                  placeholder="Bairro"
                  value={form.nfBairro || ""}
                  onChange={(e) => mudar({ nfBairro: e.target.value })}
                />
              </div>
              <div className="sm:col-span-3">
                <input
                  className="input"
                  inputMode="numeric"
                  placeholder="CEP"
                  value={form.nfCep || ""}
                  onChange={(e) => mudar({ nfCep: e.target.value })}
                />
              </div>
              <div className="sm:col-span-3">
                <input
                  className="input"
                  placeholder="Cidade"
                  value={form.nfMunicipio || ""}
                  onChange={(e) => mudar({ nfMunicipio: e.target.value })}
                />
              </div>
              <div className="sm:col-span-1">
                <input
                  className="input"
                  placeholder="UF"
                  maxLength={2}
                  value={form.nfUf || ""}
                  onChange={(e) => mudar({ nfUf: e.target.value.toUpperCase() })}
                />
              </div>
              <div className="sm:col-span-2">
                <input
                  className="input"
                  inputMode="numeric"
                  placeholder="Código IBGE"
                  value={form.nfCodigoIbge || ""}
                  onChange={(e) => mudar({ nfCodigoIbge: e.target.value })}
                />
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              O código IBGE tem 7 dígitos e é da CIDADE, não da loja. São José
              dos Pinhais é 4125506. Para outras cidades, procure em
              cidades.ibge.gov.br.
            </p>
          </div>

          <Field label="Link para o cliente avaliar a loja" className="sm:col-span-2">
            <input
              className="input"
              placeholder="https://g.page/r/.../review"
              value={form.linkAvaliacao || ""}
              onChange={(e) => mudar({ linkAvaliacao: e.target.value })}
            />
            <p className="mt-1 text-xs text-slate-400">
              Entra na mensagem de WhatsApp e no recibo, mas só quando a OS é
              ENTREGUE. Pedir estrela antes de o serviço terminar é pedir no
              pior momento. No Google Meu Negócio: Início, botão Avaliações,
              Obtenha mais avaliações, e copie o link.
            </p>
          </Field>
          <Field label="Taxa de armazenamento por dia (R$)">
            <InputNumero value={form.taxaArmazenamentoDia ?? 0} onChange={(v) => mudar({ taxaArmazenamentoDia: v })} />
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
            <InputNumero value={form.comissaoPadrao ?? 0} onChange={(v) => mudar({ comissaoPadrao: v })} />
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
            onChange={(e) => mudar({ limparSenhaNaEntrega: e.target.checked })}
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
            <input className="input" placeholder="https://xxxx.supabase.co" value={form.supabaseUrl || ""} onChange={(e) => mudar({ supabaseUrl: e.target.value })} />
          </Field>
          <Field label="Supabase anon key">
            <input className="input" placeholder="eyJhbGciOi..." value={form.supabaseKey || ""} onChange={(e) => mudar({ supabaseKey: e.target.value })} />
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
