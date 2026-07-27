-- =====================================================================
-- Sistema TI · CONVITES (fecha o cadastro aberto)
-- ---------------------------------------------------------------------
-- Rode UMA VEZ no SQL Editor do Supabase, DEPOIS da migração de segurança.
--
-- Problema que isto resolve: qualquer pessoa conseguia clicar em
-- "Criar conta". Ela não via dado nenhum (sem perfil, sem acesso), mas
-- entupia a lista de usuários e via instruções internas do sistema.
--
-- A partir daqui, criar conta exige um CÓDIGO DE CONVITE, e quem gera o
-- convite é o dono ou o gerente, direto na tela de Configurações.
-- Ninguém mais precisa abrir o SQL Editor para liberar um funcionário.
-- =====================================================================

-- Marca quem administra o sistema inteiro (você), e não só uma loja.
-- Só o super admin pode liberar uma LOJA nova — é assim que você aluga
-- o sistema para outra assistência sem mexer no banco.
alter table perfis add column if not exists super_admin boolean default false;

-- O primeiro dono cadastrado vira o administrador do sistema
update perfis
   set super_admin = true
 where papel = 'dono'
   and id = (select id from perfis where papel = 'dono' order by "criadoEm" limit 1);

-- ---------- Tabela de convites ----------
create table if not exists convites (
  codigo text primary key,
  -- loja_id nulo + nova_loja = true significa "este convite cria uma loja nova"
  loja_id uuid references lojas (id) on delete cascade,
  nova_loja boolean not null default false,
  papel text not null
    check (papel in ('dono', 'gerente', 'tecnico', 'atendente')),
  nome text,
  criado_por uuid references auth.users (id) on delete set null,
  expira_em timestamptz not null default now() + interval '7 days',
  usado_por uuid references auth.users (id) on delete set null,
  usado_em timestamptz,
  "criadoEm" timestamptz not null default now()
);

create index if not exists convites_loja_idx on convites (loja_id);

alter table convites enable row level security;

-- Dono e gerente enxergam e apagam apenas os convites da própria loja.
-- A criação passa obrigatoriamente pela função abaixo (que valida o papel).
drop policy if exists "convites_da_loja" on convites;
create policy "convites_da_loja" on convites
  for select to authenticated
  using (loja_id = loja_atual() and papel_atual() in ('dono', 'gerente'));

drop policy if exists "convites_apagar" on convites;
create policy "convites_apagar" on convites
  for delete to authenticated
  using (loja_id = loja_atual() and papel_atual() in ('dono', 'gerente'));

-- ---------- Geração do código ----------
-- Alfabeto sem 0/O/1/I: o código é ditado por telefone e no WhatsApp,
-- então caractere ambíguo vira suporte perdido.
create or replace function gerar_codigo_convite()
returns text
language sql volatile
as $$
  select string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (floor(random() * 32) + 1)::int, 1),
    ''
  )
  from generate_series(1, 10);
$$;

-- ---------- Criar convite ----------
create or replace function criar_convite(
  p_papel text default 'atendente',
  p_nome text default null,
  p_nova_loja boolean default false,
  p_dias integer default 7
)
returns text
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_codigo text;
  v_meu_papel text;
  v_minha_loja uuid;
  v_super boolean;
  v_papel text;
  v_loja uuid;
begin
  select papel, loja_id, coalesce(super_admin, false)
    into v_meu_papel, v_minha_loja, v_super
    from perfis
   where id = auth.uid() and ativo;

  if v_meu_papel is null then
    raise exception 'Sem permissão para convidar.';
  end if;

  if p_nova_loja then
    -- Convite que abre uma loja nova (uso comercial do sistema)
    if not v_super then
      raise exception 'Apenas o administrador do sistema pode liberar uma loja nova.';
    end if;
    v_loja := null;
    v_papel := 'dono';
  else
    if v_meu_papel not in ('dono', 'gerente') then
      raise exception 'Sem permissão para convidar.';
    end if;
    if p_papel not in ('dono', 'gerente', 'tecnico', 'atendente') then
      raise exception 'Papel inválido.';
    end if;
    -- Gerente não promove ninguém a dono
    if p_papel = 'dono' and v_meu_papel <> 'dono' then
      raise exception 'Somente o dono pode convidar outro dono.';
    end if;
    v_loja := v_minha_loja;
    v_papel := p_papel;
  end if;

  loop
    v_codigo := gerar_codigo_convite();
    exit when not exists (select 1 from convites where codigo = v_codigo);
  end loop;

  insert into convites (codigo, loja_id, nova_loja, papel, nome, criado_por, expira_em)
  values (
    v_codigo, v_loja, p_nova_loja, v_papel, nullif(trim(p_nome), ''), auth.uid(),
    now() + (greatest(least(p_dias, 90), 1) || ' days')::interval
  );

  return v_codigo;
end $$;

-- ---------- Conferir um código (usado na tela de criar conta) ----------
-- Devolve só se o código serve ou não. Nunca revela de qual loja ele é,
-- para que um código chutado não vire fonte de informação.
create or replace function convite_valido(p_codigo text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from convites
     where codigo = upper(trim(p_codigo))
       and usado_por is null
       and expira_em > now()
  );
$$;

-- ---------- Aceitar convite ----------
create or replace function aceitar_convite(
  p_codigo text,
  p_nome text default null,
  p_nome_loja text default null
)
returns text
language plpgsql volatile security definer set search_path = public
as $$
declare
  c record;
  v_loja uuid;
begin
  if auth.uid() is null then
    raise exception 'Faça login antes de usar o convite.';
  end if;

  if exists (select 1 from perfis where id = auth.uid()) then
    raise exception 'Sua conta já está vinculada a uma loja.';
  end if;

  select * into c
    from convites
   where codigo = upper(trim(p_codigo))
     and usado_por is null
     and expira_em > now()
   for update;

  if not found then
    raise exception 'Código inválido, já usado ou expirado.';
  end if;

  if c.nova_loja then
    insert into lojas (nome)
    values (coalesce(nullif(trim(p_nome_loja), ''), 'Minha Assistência'))
    returning id into v_loja;
  else
    v_loja := c.loja_id;
  end if;

  insert into perfis (id, loja_id, nome, papel)
  values (
    auth.uid(),
    v_loja,
    coalesce(nullif(trim(p_nome), ''), c.nome),
    c.papel
  );

  update convites
     set usado_por = auth.uid(), usado_em = now()
   where codigo = c.codigo;

  return v_loja::text;
end $$;

revoke all on function criar_convite(text, text, boolean, integer) from public;
revoke all on function aceitar_convite(text, text, text) from public;
revoke all on function convite_valido(text) from public;
grant execute on function criar_convite(text, text, boolean, integer) to authenticated;
grant execute on function aceitar_convite(text, text, text) to authenticated;
grant execute on function convite_valido(text) to anon, authenticated;

-- Índice que faltava: a tabela de configurações também é consultada por loja
create index if not exists configuracoes_loja_idx on configuracoes ("lojaId");

-- ---------- Correção: configurações da loja ficaram órfãs ----------
-- Antes existia uma linha única com id = 'app'. Agora cada loja tem a sua,
-- identificada pelo id da loja. Sem esta linha, o nome da loja, o tema e os
-- termos do recibo sumiriam da tela depois da migração de segurança.
update configuracoes c
   set id = c."lojaId"::text
 where c.id = 'app'
   and c."lojaId" is not null
   and not exists (
     select 1 from configuracoes o where o.id = c."lojaId"::text
   );

-- =====================================================================
-- DEPOIS DE RODAR:
--   Nada. Vá em Configurações -> Equipe e clique em "Convidar".
--   Para liberar uma LOJA NOVA (outro cliente seu), use o botão
--   "Liberar nova loja", que só aparece para você.
-- =====================================================================
