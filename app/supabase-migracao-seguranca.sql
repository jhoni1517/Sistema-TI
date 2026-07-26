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
create or replace function consultar_os(p_loja uuid, p_numero integer)
returns table (
  numero integer,
  status text,
  marca text,
  modelo text,
  "primeiroNome" text,
  total numeric,
  "atualizadoEm" text
)
language sql stable security definer set search_path = public
as $$
  select
    o.numero,
    o.status,
    o.marca,
    o.modelo,
    split_part(coalesce(c.nome, ''), ' ', 1) as "primeiroNome",
    case
      when o.status in ('pronta', 'aguardando_aprovacao')
      then coalesce(o."maoDeObra", 0) - coalesce(o.desconto, 0) + coalesce((
        select sum((p ->> 'precoUnit')::numeric * (p ->> 'quantidade')::numeric)
        from jsonb_array_elements(coalesce(o.pecas, '[]'::jsonb)) p
      ), 0)
      else null
    end as total,
    o."atualizadoEm"
  from ordens o
  left join clientes c on c.id = o."clienteId"
  where o."lojaId" = p_loja and o.numero = p_numero
  limit 1;
$$;

-- O cliente pode aprovar ou recusar o orçamento — e só isso.
create or replace function responder_orcamento(
  p_loja uuid, p_numero integer, p_aprovar boolean
)
returns boolean
language plpgsql volatile security definer set search_path = public
as $$
declare afetadas int;
begin
  update ordens
     set status = case when p_aprovar then 'aprovada' else 'cancelada' end,
         "aprovadoEm" = case when p_aprovar then now()::text else "aprovadoEm" end,
         "recusadoEm" = case when p_aprovar then "recusadoEm" else now()::text end,
         "atualizadoEm" = now()::text,
         historico = coalesce(historico, '[]'::jsonb) || jsonb_build_object(
           'data', now()::text,
           'status', case when p_aprovar then 'aprovada' else 'cancelada' end,
           'nota', case when p_aprovar then 'Aprovado pelo cliente'
                        else 'Recusado pelo cliente' end
         )
   where "lojaId" = p_loja
     and numero = p_numero
     -- trava: só responde enquanto estiver aguardando aprovação
     and status = 'aguardando_aprovacao';
  get diagnostics afetadas = row_count;
  return afetadas > 0;
end $$;

revoke all on function consultar_os(uuid, integer) from public;
revoke all on function responder_orcamento(uuid, integer, boolean) from public;
grant execute on function consultar_os(uuid, integer) to anon, authenticated;
grant execute on function responder_orcamento(uuid, integer, boolean) to anon, authenticated;

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
