import React, { useMemo, useState } from "react";
import {
  Wallet,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  CalendarClock,
  Power,
  TrendingUp,
} from "lucide-react";
import { aviso } from "../components/Aviso";
import { useApp } from "../store/AppStore";
import { Modal, Field, EmptyState, SectionTitle, InputNumero } from "../components/ui";
import { uid, nowISO, brl, formatDate, txt } from "../lib/format";
import {
  hojeISO,
  soData,
  resumoRenda,
  rendaOrdenada,
  situacaoConta,
  contaQuitada,
  pagarConta,
  saldoDaConta,
  pagoNaReferencia,
  parcialmentePaga,
  diasAteVencer,
  SITUACAO_CONTA_META,
} from "../lib/contas";
import {
  RECORRENCIA_META,
  CATEGORIAS_RENDA,
  type ContaPagar,
  type Recorrencia,
  type FormaPagamento,
} from "../lib/types";

/**
 * Renda fixa: o que ENTRA todo mês, com data.
 *
 * POR QUE ISTO É UMA TELA E NÃO UM FILTRO EM CONTAS A PAGAR
 *
 * A regra desta base é que módulo custa caro e recurso é barato, e a receita
 * fixa nasceu como campo — que foi a decisão certa para a loja que tem uma
 * mensalidade de cliente entre trinta contas a pagar.
 *
 * Só que o pedido veio de outro lugar: uma pessoa que recebe DOIS salários e
 * mais auxílio do governo, e que não tem loja nenhuma. Para ela, "Contas a
 * Pagar" com um filtro escondido é a tela errada — o dinheiro dela não é
 * exceção numa lista de despesas, é o assunto principal. Achar o Bolsa
 * Família no meio de "Energia" e "Fornecedor" é pedir para ela desistir.
 *
 * O que NÃO se duplica: os dados e a conta. Esta tela lê as mesmas
 * `contas_pagar`, filtradas por `tipo === "receber"`, e usa as mesmas
 * funções de vencimento — que são a parte difícil e que já custou caro
 * acertar (dia 31 passando por fevereiro, 29/02, virada de ano). Tela nova
 * com regra própria seria a regra envelhecendo em um dos dois lugares.
 *
 * O QUE ESTA TELA RESPONDE, e a de contas não responderia:
 * "o que já caiu e o que ainda falta cair este mês."
 */

const novaRenda = (): ContaPagar =>
  ({
    id: uid(),
    descricao: "",
    categoria: "Salário",
    valor: 0,
    vencimento: hojeISO(),
    recorrencia: "mensal",
    tipo: "receber",
    lembreteDias: 3,
    ativo: true,
    pagamentos: [],
    criadoEm: nowISO(),
  }) as ContaPagar;

const FORMAS: { k: FormaPagamento; nome: string }[] = [
  { k: "pix", nome: "Pix" },
  { k: "transferencia", nome: "Transferência / depósito" },
  { k: "dinheiro", nome: "Dinheiro" },
  { k: "debito", nome: "Cartão / saque" },
  { k: "outro", nome: "Outro" },
];

export const Renda: React.FC = () => {
  const { contas, sessoes, saveConta, removeConta, saveMovimento } = useApp();
  const [editando, setEditando] = useState<ContaPagar | null>(null);
  const [recebendo, setRecebendo] = useState<ContaPagar | null>(null);
  const [valorRec, setValorRec] = useState(0);
  const [formaRec, setFormaRec] = useState<FormaPagamento>("pix");
  const [gravando, setGravando] = useState(false);
  const hoje = hojeISO();

  const lista = useMemo(() => rendaOrdenada(contas, hoje), [contas, hoje]);
  const resumo = useMemo(() => resumoRenda(contas, hoje), [contas, hoje]);

  const salvar = async () => {
    if (!editando) return;
    if (!editando.descricao.trim()) {
      return aviso.alerta("Diga de onde vem esse dinheiro. Ex: Salário da fábrica, Bolsa Família.");
    }
    if (!(Number(editando.valor) > 0)) return aviso.alerta("Informe o valor que entra.");
    try {
      // `tipo` é forçado aqui e não vem do formulário: tudo que nasce nesta
      // tela é dinheiro entrando, e um campo a mais só para repetir isso
      // seria uma pergunta cuja resposta a própria tela já deu.
      await saveConta({ ...editando, tipo: "receber" });
      setEditando(null);
    } catch (e) {
      aviso.erro(
        "Não foi possível salvar:\n\n" +
          (e instanceof Error ? e.message : String(e)) +
          "\n\nSe você usa a nuvem, confira se rodou o comando SQL de atualização das tabelas."
      );
    }
  };

  const abrirRecebimento = (c: ContaPagar) => {
    setRecebendo(c);
    // O que ainda falta cair, e não o combinado: de R$ 650 com R$ 400 já
    // recebidos, oferecer R$ 650 de novo faria a pessoa lançar o mês inteiro
    // duas vezes.
    setValorRec(saldoDaConta(c));
    setFormaRec("pix");
  };

  const confirmarRecebimento = async () => {
    if (!recebendo) return;
    if (!(valorRec > 0)) return aviso.alerta("Informe quanto entrou.");
    // Dois toques no balcão viram o mesmo dinheiro entrando duas vezes, e a
    // recorrente pulando dois meses de uma só vez.
    if (gravando) return;
    setGravando(true);
    try {
      const atualizada = pagarConta(recebendo, { valor: valorRec, formaPagamento: formaRec });

      /*
       * Dinheiro primeiro, como em toda gravação do sistema.
       *
       * Falhando no meio, sobra uma entrada no caixa sem a baixa — que salta
       * aos olhos na conferência e se conserta olhando esta tela. Ao
       * contrário, a renda sumiria da lista (a recorrente ainda pularia para
       * o mês seguinte) e o dinheiro nunca teria entrado no caixa: o mês
       * fecharia com menos do que entrou, e ninguém procura por dinheiro que
       * o sistema esqueceu.
       */
      const sessaoAberta = sessoes.find((s) => !s.fechadoEm);
      await saveMovimento({
        id: uid(),
        tipo: "entrada",
        categoria: recebendo.categoria || "Renda fixa",
        descricao:
          `${recebendo.descricao} (${formatDate(recebendo.vencimento)})` +
          // No fechamento do mês ninguém lembra por que o salário entrou
          // pela metade. A marca vai junto, na linha do caixa.
          (valorRec < saldoDaConta(recebendo) ? " - parcial" : ""),
        valor: valorRec,
        formaPagamento: formaRec,
        sessaoId: sessaoAberta?.id,
        data: nowISO(),
      });

      await saveConta(atualizada);
      setRecebendo(null);
      /*
       * A frase tem que combinar com o que ACONTECEU. Dizer "próximo: 05/09"
       * depois de um recebimento parcial faria a pessoa sair da tela achando
       * que o mês está resolvido — e é justamente quem depende deste dinheiro
       * que não pode ser enganado sobre ele.
       */
      const restou = saldoDaConta(atualizada);
      const parcial = atualizada.vencimento === recebendo.vencimento && restou > 0;
      aviso.sucesso(
        parcial
          ? `${brl(valorRec)} lançado no caixa. Ainda faltam ${brl(restou)} desta renda.`
          : recebendo.recorrencia === "unica"
            ? "Recebimento lançado no caixa."
            : `Recebido e lançado no caixa. Próximo: ${formatDate(atualizada.vencimento)}.`
      );
    } catch (e) {
      aviso.erro(e instanceof Error ? e.message : String(e));
    } finally {
      setGravando(false);
    }
  };

  const apagar = async (c: ContaPagar) => {
    /*
     * Desligar é quase sempre o que a pessoa quer, e apagar leva o histórico
     * junto: os meses passados mudariam de valor sozinhos. Por isso o texto
     * oferece a saída antes de perguntar.
     */
    if (
      !confirm(
        `Apagar "${c.descricao}" e todo o histórico de recebimentos?\n\n` +
          "Se você só parou de receber, use o botão de desligar: a renda sai " +
          "da lista do mês e os meses passados continuam certos."
      )
    ) {
      return;
    }
    try {
      await removeConta(c.id);
    } catch (e) {
      aviso.erro(e instanceof Error ? e.message : String(e));
    }
  };

  const alternarAtivo = async (c: ContaPagar) => {
    try {
      await saveConta({ ...c, ativo: !c.ativo });
    } catch (e) {
      aviso.erro(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div>
      <SectionTitle
        title="Renda fixa"
        subtitle="Salários, auxílios e o que mais entra todo mês"
        action={
          <button className="btn-primary" onClick={() => setEditando(novaRenda())}>
            <Plus size={18} /> Nova renda
          </button>
        }
      />

      {/* O retrato do mês. "Já caiu" e "ainda vem" separados é a pergunta
          que esta tela existe para responder. */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card">
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <TrendingUp size={16} /> Entra por mês
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{brl(resumo.previstoMes)}</p>
          <p className="text-xs text-slate-400">
            {resumo.fontes} fonte{resumo.fontes === 1 ? "" : "s"} de renda
          </p>
        </div>
        <div className="card">
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <CheckCircle2 size={16} /> Já caiu este mês
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{brl(resumo.recebidoMes)}</p>
        </div>
        <div className="card">
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <CalendarClock size={16} /> Ainda vem
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{brl(resumo.aReceberMes)}</p>
        </div>
        <div className={`card ${resumo.atrasado > 0 ? "ring-2 ring-red-300" : ""}`}>
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <AlertTriangle size={16} className={resumo.atrasado > 0 ? "text-red-500" : ""} /> Não
            caiu
          </p>
          <p
            className={`mt-1 text-2xl font-bold ${
              resumo.atrasado > 0 ? "text-red-600" : "text-slate-800"
            }`}
          >
            {brl(resumo.atrasado)}
          </p>
        </div>
      </div>

      <div className="card">
        {lista.length === 0 ? (
          <EmptyState
            icon={<Wallet size={40} />}
            title="Nenhuma renda cadastrada"
            hint='Cadastre o que entra todo mês: salário, auxílio, aposentadoria, aluguel que você recebe. O sistema avisa quando está perto de cair e quando não caiu.'
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {lista.map((c) => {
              const sit = situacaoConta(c, hoje);
              const meta = SITUACAO_CONTA_META[sit];
              const dias = diasAteVencer(c.vencimento, hoje);
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                  {/*
                    NO CELULAR O NOME FICA COM A LINHA INTEIRA.
                    
                    Medido em 360px: com o valor, a etiqueta e os quatro
                    botões disputando a mesma linha, sobravam menos de 120px
                    para o nome e "Bolsa Família" virava "Bolsa Famíl...".
                    Nome de renda cortado é o pior corte possível — é ele que
                    diz QUAL dinheiro é, e "Salário meio per..." e "Salário
                    da fáb..." ficam idênticos na pressa.
                  */}
                  <div className="w-full min-w-0 sm:w-auto sm:flex-1">
                    <p
                      className={`truncate font-semibold ${
                        c.ativo ? "text-slate-800" : "text-slate-400 line-through"
                      }`}
                    >
                      {c.descricao}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {c.categoria} · {RECORRENCIA_META[c.recorrencia]?.label || c.recorrencia} ·{" "}
                      {/* "Vencimento" é palavra de dívida. Aqui o dinheiro CAI. */}
                      cai dia {soData(c.vencimento).slice(8, 10)}
                    </p>
                  </div>

                  <div className="text-right">
                    {/* O número grande é o que ainda vem. Sem isso, uma renda
                        que caiu pela metade fica igual a uma que não caiu, e
                        a pessoa conta com dinheiro que já gastou. */}
                    <p className="font-bold text-emerald-600">
                      {brl(parcialmentePaga(c) ? saldoDaConta(c) : Number(c.valor) || 0)}
                    </p>
                    {parcialmentePaga(c) && (
                      <p className="text-[11px] text-slate-400">
                        de {brl(Number(c.valor) || 0)} · já caiu {brl(pagoNaReferencia(c))}
                      </p>
                    )}
                    {c.ativo && !contaQuitada(c) && (
                      <p className="text-[11px] text-slate-400">
                        {dias < 0
                          ? `${-dias} dia(s) atrasado`
                          : dias === 0
                            ? "cai hoje"
                            : `em ${dias} dia(s)`}
                      </p>
                    )}
                  </div>

                  <span
                    className={`badge ${
                      parcialmentePaga(c) ? "bg-amber-100 text-amber-700" : meta.cor
                    }`}
                  >
                    {/* "Paga" e "Atrasada" são palavras de conta a pagar. E
                        "caiu em parte" precisa existir: sem ele, quem recebeu
                        R$ 400 de R$ 650 lê "Não caiu" e liga cobrando tudo. */}
                    {parcialmentePaga(c)
                      ? `Caiu em parte · faltam ${brl(saldoDaConta(c))}`
                      : sit === "paga"
                        ? "Recebido"
                        : sit === "atrasada"
                          ? "Não caiu"
                          : meta.label}
                  </span>

                  <div className="flex items-center gap-1">
                    {c.ativo && !contaQuitada(c) && (
                      <button className="btn-secondary !py-1.5" onClick={() => abrirRecebimento(c)}>
                        Recebi
                      </button>
                    )}
                    <button
                      className="btn-ghost !p-2"
                      title={c.ativo ? "Desligar" : "Religar"}
                      onClick={() => alternarAtivo(c)}
                    >
                      <Power size={15} className={c.ativo ? "" : "text-slate-300"} />
                    </button>
                    <button className="btn-ghost !p-2" onClick={() => setEditando(c)}>
                      <Pencil size={15} />
                    </button>
                    <button className="btn-ghost !p-2 text-red-500" onClick={() => apagar(c)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editando && (
        <Modal
          open
          onClose={() => setEditando(null)}
          title={editando.descricao ? "Editar renda" : "Nova renda"}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setEditando(null)}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={salvar}>
                Salvar
              </button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="De onde vem *" className="sm:col-span-2">
              <input
                className="input"
                value={editando.descricao}
                onChange={(e) => setEditando({ ...editando, descricao: e.target.value })}
                placeholder="Ex: Salário da fábrica, Bolsa Família, Aluguel da casa"
              />
            </Field>

            <Field label="Tipo">
              <select
                className="input"
                value={editando.categoria}
                onChange={(e) => setEditando({ ...editando, categoria: e.target.value })}
              >
                {CATEGORIAS_RENDA.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Valor que entra (R$) *">
              <InputNumero
                className="input"
                value={editando.valor}
                onChange={(v) => setEditando({ ...editando, valor: v ?? 0 })}
              />
            </Field>

            <Field label="Cai no dia">
              <input
                type="date"
                className="input"
                value={soData(editando.vencimento)}
                onChange={(e) => setEditando({ ...editando, vencimento: e.target.value })}
              />
            </Field>

            <Field label="Repete">
              <select
                className="input"
                value={editando.recorrencia}
                onChange={(e) =>
                  setEditando({ ...editando, recorrencia: e.target.value as Recorrencia })
                }
              >
                {(Object.keys(RECORRENCIA_META) as Recorrencia[]).map((r) => (
                  <option key={r} value={r}>
                    {RECORRENCIA_META[r].label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Avisar quantos dias antes" className="sm:col-span-2">
              <InputNumero
                className="input"
                value={editando.lembreteDias}
                onChange={(v) => setEditando({ ...editando, lembreteDias: v ?? 3 })}
              />
            </Field>

            <Field label="Observações" className="sm:col-span-2">
              <textarea
                className="input"
                rows={2}
                value={txt(editando.observacoes)}
                onChange={(e) => setEditando({ ...editando, observacoes: e.target.value })}
                placeholder="Ex: cai junto com o 13o em dezembro"
              />
            </Field>
          </div>
        </Modal>
      )}

      {recebendo && (
        <Modal
          open
          onClose={() => setRecebendo(null)}
          title={`Recebi: ${recebendo.descricao}`}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setRecebendo(null)}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={confirmarRecebimento} disabled={gravando}>
                {gravando ? "Lançando..." : "Confirmar"}
              </button>
            </>
          }
        >
          <div className="grid gap-4">
            {/* Com parte já recebida, o número que importa é o que FALTA.
                Sem esta linha não há como saber de quanto ainda é a diferença
                na hora de digitar. */}
            {parcialmentePaga(recebendo) && (
              <p className="rounded-lg bg-slate-50 p-2.5 text-sm text-slate-600">
                Combinado {brl(Number(recebendo.valor) || 0)} · já caiu{" "}
                {brl(pagoNaReferencia(recebendo))} ·{" "}
                <b className="text-amber-700">faltam {brl(saldoDaConta(recebendo))}</b>
              </p>
            )}
            <Field label="Quanto entrou (R$)">
              <InputNumero className="input" value={valorRec} onChange={(v) => setValorRec(v ?? 0)} />
              {/*
                O valor vem preenchido com o cadastrado e PODE ser mudado, e
                isso importa: auxílio muda de valor, salário tem desconto e
                hora extra. Gravar sempre o valor de cadastro faria a tela
                mentir para o lado otimista — e quem depende do dinheiro é
                justamente quem não pode ser enganado sobre ele.
              */}
              {/*
                Compara com o que FALTA, e não com o cadastrado. Numa renda de
                R$ 650 com R$ 400 já recebidos, lançar os R$ 250 certos
                disparava "diferente do cadastrado (R$ 650,00)" — um alarme
                falso justamente no lançamento correto, e alarme que dispara
                sempre é alarme que ninguém lê.
              */}
              {valorRec !== saldoDaConta(recebendo) && (
                <p className="mt-1 text-xs text-amber-600">
                  Diferente do previsto ({brl(saldoDaConta(recebendo))}). Vai entrar o
                  valor digitado.
                </p>
              )}
            </Field>
            <Field label="Como entrou">
              <select
                className="input"
                value={formaRec}
                onChange={(e) => setFormaRec(e.target.value as FormaPagamento)}
              >
                {FORMAS.map((f) => (
                  <option key={f.k} value={f.k}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </Field>
            {/*
              O aviso muda conforme o valor digitado. Quem recebeu R$ 400 de
              R$ 650 precisa saber, ANTES de confirmar, que a renda continua na
              lista esperando os R$ 250 — e que a data não vai pular para o mês
              que vem. Um texto fixo dizendo "a próxima data é calculada
              sozinha" seria mentira em metade dos casos.
            */}
            {(() => {
              const falta = Math.round((saldoDaConta(recebendo) - valorRec) * 100) / 100;
              if (falta > 0) {
                return (
                  <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
                    Caiu só uma parte: entram {brl(valorRec)} no Caixa e esta renda
                    CONTINUA na lista esperando <b>{brl(falta)}</b>, na mesma data.
                  </p>
                );
              }
              return (
                <p className="text-xs text-slate-500">
                  Entra no Caixa como entrada.
                  {recebendo.recorrencia !== "unica" &&
                    " A próxima data é calculada sozinha, e o dia do mês é preservado."}
                </p>
              );
            })()}
          </div>
        </Modal>
      )}
    </div>
  );
};
