-- =====================================================================
-- Sistema TI · AGENDA (compromissos, aniversários, atendimentos externos)
-- ---------------------------------------------------------------------
-- Rode UMA VEZ no SQL Editor do Supabase, depois das outras migrações.
-- É seguro repetir: tudo aqui é "if not exists" ou recria a política.
-- =====================================================================

create table if not exists eventos (
  id text primary key,
  titulo text not null,
  tipo text not null default 'atendimento'
    check (tipo in ('atendimento','aniversario','entrega','reuniao','lembrete')),
  -- Só a data, sem hora e sem fuso. Guardar timestamptz aqui já custou um dia
  -- de diferença em outras telas deste sistema.
  data text not null,
  hora text,
  "clienteId" text,
  local text,
  observacoes text,
  repetir text not null default 'nenhuma'
    check (repetir in ('nenhuma','semanal','mensal','anual')),
  -- Quantos dias antes começar a avisar. 0 = só no dia.
  "avisarDiasAntes" integer not null default 0,
  concluido boolean not null default false,
  "criadoEm" text,
  "lojaId" uuid
);

create index if not exists eventos_loja_idx on eventos ("lojaId");
create index if not exists eventos_data_idx on eventos ("lojaId", data);

-- Aniversário do cliente. A agenda monta o evento sozinha a partir daqui,
-- todo ano, sem precisar cadastrar nada à mão.
alter table clientes add column if not exists nascimento text;

alter table eventos enable row level security;

-- Mesmo isolamento das demais tabelas: cada loja só vê o que é seu, e a
-- gravação exige assinatura em dia.
drop policy if exists "loja_ler" on eventos;
create policy "loja_ler" on eventos
  for select to authenticated using ("lojaId" = loja_atual());

drop policy if exists "loja_inserir" on eventos;
create policy "loja_inserir" on eventos
  for insert to authenticated
  with check ("lojaId" = loja_atual() and loja_pode_gravar());

drop policy if exists "loja_alterar" on eventos;
create policy "loja_alterar" on eventos
  for update to authenticated
  using ("lojaId" = loja_atual() and loja_pode_gravar())
  with check ("lojaId" = loja_atual() and loja_pode_gravar());

drop policy if exists "loja_apagar" on eventos;
create policy "loja_apagar" on eventos
  for delete to authenticated
  using ("lojaId" = loja_atual() and loja_pode_gravar());

-- ---------- Confere ----------
select column_name, data_type
  from information_schema.columns
 where table_name = 'eventos'
 order by ordinal_position;
