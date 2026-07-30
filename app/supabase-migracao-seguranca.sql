-- =====================================================================
-- Sistema TI · MIGRAÇÃO DE SEGURANÇA E MULTI-LOJA
-- ---------------------------------------------------------------------
-- Rode UMA VEZ no SQL Editor do Supabase.
-- O que este script faz:
--   1. Cria as tabelas de lojas e perfis (usuário -> loja -> papel)
--   2. Adiciona "lojaId" em todas as tabelas de dados
--   3. Move os dados existentes para uma loja principal
--   4. Substitui as políticas "liberado para todos" por regras que só
--      permitem ler/gravar dados da própria loja, com usuário logado
--   5. Cria uma função pública segura para o acompanhamento do cliente,
--      que devolve APENAS o status — nunca senha, valor de custo ou dados
--      de outros clientes
-- =====================================================================

-- ---------- 1. Lojas e perfis ----------
create table if not exists lojas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  documento text,
  telefone text,
  endereco text,
  plano text default 'essencial',
  ativa boolean default true,
  "criadoEm" timestamptz default now()
);

-- Cada usuário do Auth pertence a uma loja e tem um papel
create table if not exists perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  loja_id uuid not null references lojas (id) on delete cascade,
  nome text,
  papel text not null default 'atendente'
    check (papel in ('dono', 'gerente', 'tecnico', 'atendente')),
  ativo boolean default true,
  "criadoEm" timestamptz default now()
);

create index if not exists perfis_loja_idx on perfis (loja_id);

-- ---------- 2. Coluna de loja nas tabelas de dados ----------
alter table clientes      add column if not exists "lojaId" uuid;
alter table produtos      add column if not exists "lojaId" uuid;
alter table ordens        add column if not exists "lojaId" uuid;
alter table movimentos    add column if not exists "lojaId" uuid;
alter table sessoes       add column if not exists "lojaId" uuid;
alter table fiados        add column if not exists "lojaId" uuid;
alter table categorias    add column if not exists "lojaId" uuid;
alter table fornecedores  add column if not exists "lojaId" uuid;
alter table configuracoes add column if not exists "lojaId" uuid;

-- ---------- 3. Migra os dados existentes para uma loja principal ----------
do $$
declare loja uuid;
begin
  select id into loja from lojas order by "criadoEm" limit 1;
  if loja is null then
    insert into lojas (nome) values ('Minha Assistência TI') returning id into loja;
  end if;

  update clientes      set "lojaId" = loja where "lojaId" is null;
  update produtos      set "lojaId" = loja where "lojaId" is null;
  update ordens        set "lojaId" = loja where "lojaId" is null;
  update movimentos    set "lojaId" = loja where "lojaId" is null;
  update sessoes       set "lojaId" = loja where "lojaId" is null;
  update fiados        set "lojaId" = loja where "lojaId" is null;
  update categorias    set "lojaId" = loja where "lojaId" is null;
  update fornecedores  set "lojaId" = loja where "lojaId" is null;
  update configuracoes set "lojaId" = loja where "lojaId" is null;

  raise notice 'Loja principal: %', loja;
end $$;

-- Índices por loja (consultas ficam rápidas mesmo com muitas lojas)
create index if not exists clientes_loja_idx     on clientes ("lojaId");
create index if not exists produtos_loja_idx     on produtos ("lojaId");
create index if not exists ordens_loja_idx       on ordens ("lojaId");
create index if not exists movimentos_loja_idx   on movimentos ("lojaId");
create index if not exists sessoes_loja_idx      on sessoes ("lojaId");
create index if not exists fiados_loja_idx       on fiados ("lojaId");
create index if not exists categorias_loja_idx   on categorias ("lojaId");
create index if not exists fornecedores_loja_idx on fornecedores ("lojaId");

-- ---------- 4. Funções auxiliares de permissão ----------
-- Retornam a loja e o papel do usuário logado, sem expor a tabela de perfis.
create or replace function loja_atual()
returns uuid
language sql stable security definer set search_path = public
as $$ select loja_id from perfis where id = auth.uid() and ativo $$;

create or replace function papel_atual()
returns text
language sql stable security definer set search_path = public
as $$ select papel from perfis where id = auth.uid() and ativo $$;

-- ---------- 5. Políticas de acesso (o coração da segurança) ----------
alter table lojas         enable row level security;
alter table perfis        enable row level security;
alter table clientes      enable row level security;
alter table produtos      enable row level security;
alter table ordens        enable row level security;
alter table movimentos    enable row level security;
alter table sessoes       enable row level security;
alter table fiados        enable row level security;
alter table categorias    enable row level security;
alter table fornecedores  enable row level security;
alter table configuracoes enable row level security;

-- Remove as políticas antigas "liberado para todos"
do $$
declare t text;
begin
  foreach t in array array[
    'clientes','produtos','ordens','movimentos','sessoes',
    'fiados','categorias','fornecedores','configuracoes'
  ]
  loop
    execute format('drop policy if exists "acesso_total" on %I;', t);
    execute format('drop policy if exists "loja_isolada" on %I;', t);
    -- Só enxerga e altera linhas da própria loja, e só se estiver logado.
    execute format($f$
      create policy "loja_isolada" on %I
        for all to authenticated
        using ("lojaId" = loja_atual())
        with check ("lojaId" = loja_atual());
    $f$, t);
  end loop;
end $$;

-- Loja: o usuário só vê a própria; só o dono edita
drop policy if exists "minha_loja_ler" on lojas;
create policy "minha_loja_ler" on lojas
  for select to authenticated using (id = loja_atual());

drop policy if exists "minha_loja_editar" on lojas;
create policy "minha_loja_editar" on lojas
  for update to authenticated
  using (id = loja_atual() and papel_atual() = 'dono')
  with check (id = loja_atual());

-- Perfis: cada um vê os colegas da própria loja; só dono/gerente altera
drop policy if exists "perfis_ler" on perfis;
create policy "perfis_ler" on perfis
  for select to authenticated using (loja_id = loja_atual());

drop policy if exists "perfis_gerenciar" on perfis;
create policy "perfis_gerenciar" on perfis
  for all to authenticated
  using (loja_id = loja_atual() and papel_atual() in ('dono', 'gerente'))
  with check (loja_id = loja_atual() and papel_atual() in ('dono', 'gerente'));

-- ---------- 6. Acompanhamento público (sem expor nada sensível) ----------
-- O cliente consulta pelo código da OS e recebe SOMENTE o status.
-- Senhas do aparelho, custos e dados de outros clientes nunca saem daqui.
--
-- As funções consultar_os e responder_orcamento MORAM AGORA em
-- supabase-migracao-opcoes-os.sql, e não mais aqui.
--
-- O motivo é prático: elas mudaram para entender as alternativas do
-- orçamento (fonte de 500W ou de 200W). Se a versão antiga continuasse
-- neste arquivo, rodar de novo o supabase-migracao-seguranca.sql — que é
-- exatamente o que a documentação manda fazer quando aparece erro de função
-- desatualizada — devolveria a versão velha e a página do cliente voltaria
-- a somar as duas fontes.
--
-- Rode o supabase-migracao-opcoes-os.sql depois deste.

-- =====================================================================
-- DEPOIS DE RODAR:
--   1. Crie sua conta no sistema (tela de login -> "Criar conta")
--   2. Rode o comando abaixo trocando o e-mail pelo seu, para virar dono
--      da loja principal:
--
--   insert into perfis (id, loja_id, nome, papel)
--   select u.id, (select id from lojas order by "criadoEm" limit 1),
--          'Dono', 'dono'
--     from auth.users u where u.email = 'SEU-EMAIL@EXEMPLO.COM'
--   on conflict (id) do update set papel = 'dono';
-- =====================================================================
