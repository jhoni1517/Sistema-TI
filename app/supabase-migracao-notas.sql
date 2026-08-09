-- ============================================================
--  Nota fiscal: a fila de emissão e a credencial do emissor
-- ============================================================
--
-- Duas tabelas com regras de acesso OPOSTAS, e essa diferença é o ponto
-- inteiro deste arquivo.
--
--   `notas`             -> a loja lê e o robô escreve
--   `fiscal_credencial` -> NINGUÉM lê pelo navegador. Só o robô.
--
-- ------------------------------------------------------------
-- POR QUE A CREDENCIAL NÃO PODE MORAR EM `configuracoes`
--
-- `configuracoes` sobe para a nuvem, entra no backup e sai no arquivo de
-- exportação — que circula por WhatsApp e e-mail. Um token ali é um token
-- queimado, e com o token do emissor mais o CSC da SEFAZ qualquer um emite
-- nota em nome da loja.
--
-- Por isso `fiscal_credencial` não tem policy de select para `authenticated`.
-- Não é esquecimento: sem policy, o RLS nega. O navegador não lê nem com o
-- login do dono. Quem lê é a função da Vercel, com a chave de serviço, que
-- ignora RLS por definição.
--
-- O efeito prático: a tela mostra SE está configurado, nunca O QUE está
-- configurado. Trocar o token é gravar por cima, nunca ler e editar.
-- ------------------------------------------------------------
--
-- Repetível: pode rodar de novo sem quebrar nada.

/* ---------- A fila de notas ---------- */

create table if not exists notas (
  id text primary key,
  -- A venda que originou. É por ela que a tela liga uma coisa na outra.
  "vendaId" text,
  -- nfce (mercadoria) ou nfse (serviço). Uma OS de assistência gera as duas.
  tipo text not null default 'nfce',
  -- pendente / autorizada / rejeitada / cancelada
  situacao text not null default 'pendente',
  -- O que a SEFAZ devolveu quando recusou, em português, para a tela mostrar
  -- sem mandar ninguém procurar um número em manual.
  erro text,
  -- Quantas vezes já tentamos. Nota rejeitada por dado errado vai falhar
  -- para sempre; sem contar, o robô fica batendo na mesma pedra todo dia.
  tentativas integer not null default 0,
  -- O pedido pronto, montado pela TELA no momento da venda.
  --
  -- O robô não recalcula preço nem imposto: a nota tem que sair com
  -- exatamente o que o cliente pagou. Recalcular na hora do envio abriria a
  -- porta para a nota discordar do cupom que já saiu na mão dele — o preço
  -- pode ter mudado, a promoção pode ter vencido, o produto pode ter sido
  -- editado. O que valeu foi o que valeu.
  pedido jsonb,
  -- O que volta autorizado: chave de 44 dígitos, número, série, protocolo e
  -- o link do DANFE que o cliente recebe.
  chave text,
  numero text,
  serie text,
  protocolo text,
  url text,
  -- A hora da AUTORIZAÇÃO, não a do pedido: é dela que sai o relógio dos 30
  -- minutos de cancelamento.
  "emitidaEm" text,
  "canceladaEm" text,
  "motivoCancelamento" text,
  "criadoEm" text,
  "atualizadoEm" text,
  "lojaId" uuid
);

-- O robô procura o que está pendente; a tela procura pela venda.
create index if not exists notas_pendentes_idx on notas ("lojaId", situacao);
create index if not exists notas_venda_idx on notas ("vendaId");

alter table notas enable row level security;

drop policy if exists "loja_ler" on notas;
create policy "loja_ler" on notas
  for select to authenticated using ("lojaId" = loja_atual());

-- A loja PEDE a nota (insere pendente) e pode pedir cancelamento; quem
-- escreve o resultado é o robô, com a chave de serviço.
drop policy if exists "loja_inserir" on notas;
create policy "loja_inserir" on notas
  for insert to authenticated
  with check ("lojaId" = loja_atual() and loja_pode_gravar());

drop policy if exists "loja_alterar" on notas;
create policy "loja_alterar" on notas
  for update to authenticated
  using ("lojaId" = loja_atual() and loja_pode_gravar())
  with check ("lojaId" = loja_atual() and loja_pode_gravar());

/* ---------- A credencial do emissor ---------- */

create table if not exists fiscal_credencial (
  -- Uma por loja: a chave primária É a loja.
  "lojaId" uuid primary key,
  -- Qual intermediário. Hoje só "focusnfe", mas guardar o nome evita ter
  -- que adivinhar depois qual API aquele token abre.
  emissor text not null default 'focusnfe',
  -- O token da API. NUNCA sai desta tabela para o navegador.
  token text,
  -- O CSC e o ID do CSC da SEFAZ do estado. Alguns emissores pedem, outros
  -- guardam do lado deles.
  csc text,
  "cscId" text,
  -- homologacao / producao. Nasce em homologação de propósito: a primeira
  -- nota de uma loja nova tem que ser de mentira.
  ambiente text not null default 'homologacao',
  "atualizadoEm" text
);

alter table fiscal_credencial enable row level security;

/*
 * NENHUMA POLICY DE SELECT. Não é esquecimento.
 *
 * Sem policy, o RLS nega: o navegador não lê esta tabela nem com o login do
 * dono da loja. Quem lê é a função da Vercel, com a chave de serviço.
 *
 * A loja PODE gravar a própria credencial — é ela que cola o token — e pode
 * gravar por cima para trocar. Mas não lê de volta: a tela mostra SE está
 * configurado, nunca O QUE está.
 */
drop policy if exists "loja_ler" on fiscal_credencial;
drop policy if exists "loja_gravar" on fiscal_credencial;
create policy "loja_gravar" on fiscal_credencial
  for insert to authenticated
  with check ("lojaId" = loja_atual() and loja_pode_gravar());

drop policy if exists "loja_trocar" on fiscal_credencial;
create policy "loja_trocar" on fiscal_credencial
  for update to authenticated
  using ("lojaId" = loja_atual() and loja_pode_gravar())
  with check ("lojaId" = loja_atual() and loja_pode_gravar());

/* ---------- Confere ---------- */

-- Tem que listar as colunas de `notas` e, para `fiscal_credencial`, mostrar
-- APENAS a policy de insert e a de update. Se aparecer uma de select ali,
-- alguém abriu a porta.
select tablename, policyname, cmd
  from pg_policies
 where tablename in ('notas', 'fiscal_credencial')
 order by tablename, cmd;
