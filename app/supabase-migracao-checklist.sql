-- ============================================================
--  Checklist diário
-- ============================================================
--
-- O que se repete todo dia e não tem data: beber água, conferir a bancada,
-- passar no fornecedor às duas, fechar o caixa antes de sair.
--
-- Por que não usar a agenda: agenda guarda compromisso COM data ("dia 14,
-- buscar o notebook do Fulano"). Enfiar rotina ali obrigaria a criar um
-- evento por dia, para sempre, e a agenda viraria um borrão onde o
-- compromisso de verdade se perde.
--
-- Por que "feitoEm" é uma LISTA de dias e não um `feito` booleano: uma
-- bandeira obrigaria alguém a desmarcar tudo toda manhã, e ninguém faz
-- isso. No terceiro dia a lista estaria toda marcada e não diria mais nada.
-- Guardando os dias, ela nasce limpa sozinha — e ainda dá para ver a
-- sequência, que é o número que faz não querer quebrar a corrente.
--
-- A tela poda a lista em 90 dias antes de gravar: esta tabela é lida
-- inteira a cada carga, como `produtos`, e foi foto em base64 lida a cada
-- F5 que ensinou essa lição aqui.
--
-- Repetível: pode rodar de novo sem quebrar nada.

create table if not exists tarefas (
  id text primary key,
  titulo text not null,
  -- "HH:MM". Vazio = vale para o dia todo, sem hora para cobrar.
  horario text,
  -- Dias da semana em que vale (0 = domingo). Vazio = todo dia.
  dias jsonb not null default '[]'::jsonb,
  -- Datas AAAA-MM-DD em que foi cumprida. Texto puro, sem fuso: guardar
  -- timestamptz aqui já custou um dia de diferença em outras telas.
  "feitoEm" jsonb not null default '[]'::jsonb,
  -- Manda lembrete no Telegram no horário marcado
  avisar boolean not null default false,
  -- Último dia em que o robô já mandou, para não repetir o mesmo aviso
  "avisadoEm" text,
  ativo boolean not null default true,
  "criadoEm" text,
  "atualizadoEm" text,
  "lojaId" uuid
);

create index if not exists tarefas_loja_idx on tarefas ("lojaId");
-- O robô procura por loja e por quem pediu aviso: sem isto ele varre a
-- tabela inteira de todas as lojas a cada disparo.
create index if not exists tarefas_aviso_idx on tarefas ("lojaId", avisar, horario);

alter table tarefas enable row level security;

-- Mesmo isolamento das demais tabelas: cada loja só vê o que é seu, e a
-- gravação exige assinatura em dia.
drop policy if exists "loja_ler" on tarefas;
create policy "loja_ler" on tarefas
  for select to authenticated using ("lojaId" = loja_atual());

drop policy if exists "loja_inserir" on tarefas;
create policy "loja_inserir" on tarefas
  for insert to authenticated
  with check ("lojaId" = loja_atual() and loja_pode_gravar());

drop policy if exists "loja_alterar" on tarefas;
create policy "loja_alterar" on tarefas
  for update to authenticated
  using ("lojaId" = loja_atual() and loja_pode_gravar())
  with check ("lojaId" = loja_atual() and loja_pode_gravar());

drop policy if exists "loja_apagar" on tarefas;
create policy "loja_apagar" on tarefas
  for delete to authenticated
  using ("lojaId" = loja_atual() and loja_pode_gravar());

-- ---------- Confere ----------
select column_name, data_type
  from information_schema.columns
 where table_name = 'tarefas'
 order by ordinal_position;
