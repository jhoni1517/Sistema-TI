-- =====================================================================
-- Sistema TI · ASSINATURA E CONTROLE DE LOJAS
-- ---------------------------------------------------------------------
-- Rode UMA VEZ no SQL Editor do Supabase, depois das outras migrações.
--
-- O que isto monta: cada loja tem um vencimento. Passado o prazo mais a
-- tolerância, a loja continua ENXERGANDO e imprimindo tudo, mas não grava
-- nada novo. A trava vale no banco de dados — não adianta mexer no
-- navegador, porque as políticas de escrita não passam.
--
-- Nunca apagamos nem escondemos os dados de quem atrasou. Além de ser o
-- certo, sequestrar dado de cliente é o caminho mais curto para um
-- processo judicial.
-- =====================================================================

-- ---------- 1. Campos de assinatura na loja ----------
alter table lojas add column if not exists "venceEm" timestamptz;
alter table lojas add column if not exists valor_mensal numeric default 0;
alter table lojas add column if not exists bloqueada boolean default false;
alter table lojas add column if not exists observacoes text;
alter table lojas add column if not exists "ultimoPagamento" timestamptz;
-- WhatsApp do responsável pela loja, usado pelo botão "Cobrar"
alter table lojas add column if not exists whatsapp text;
-- Loja isenta de mensalidade. A SUA loja entra aqui: seria absurdo o
-- sistema travar o próprio dono por falta de pagamento a si mesmo.
alter table lojas add column if not exists isento boolean default false;

-- Lojas que já existem entram com 14 dias de teste a partir de hoje
update lojas
   set "venceEm" = now() + interval '14 days'
 where "venceEm" is null;

-- A loja de quem administra o sistema nunca é cobrada
update lojas
   set isento = true
 where id in (select loja_id from perfis where coalesce(super_admin, false));

-- ---------- 2. Configuração do sistema (sua, não das lojas) ----------
-- Uma linha só. As lojas LEEM (precisam ver a chave Pix para pagar),
-- mas apenas o administrador do sistema pode ESCREVER.
create table if not exists sistema_config (
  id boolean primary key default true check (id),
  chave_pix text,
  titular_pix text,
  whatsapp_suporte text,
  valor_padrao numeric default 79,
  dias_teste integer default 14,
  dias_tolerancia integer default 5,
  mensagem_vencimento text
);

insert into sistema_config (id) values (true) on conflict (id) do nothing;

alter table sistema_config enable row level security;

drop policy if exists "sistema_config_ler" on sistema_config;
create policy "sistema_config_ler" on sistema_config
  for select to authenticated using (true);

-- ---------- 3. Funções de situação ----------
create or replace function sou_super_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select super_admin from perfis where id = auth.uid() and ativo), false);
$$;

/**
 * Situação da assinatura da loja logada:
 *   'ativa'      — em dia (ou em teste)
 *   'tolerancia' — venceu, mas ainda dentro do prazo de graça
 *   'leitura'    — passou da tolerância: consulta e imprime, não grava
 *   'bloqueada'  — desligada manualmente pelo administrador
 */
create or replace function situacao_loja()
returns text
language plpgsql stable security definer set search_path = public
as $$
declare
  v_vence timestamptz;
  v_bloqueada boolean;
  v_isento boolean;
  v_tolerancia integer;
begin
  -- Quem administra o sistema nunca é travado pela própria régua
  if sou_super_admin() then return 'ativa'; end if;

  select l."venceEm", coalesce(l.bloqueada, false), coalesce(l.isento, false)
    into v_vence, v_bloqueada, v_isento
    from lojas l
   where l.id = loja_atual();

  if not found then return 'bloqueada'; end if;
  if v_bloqueada then return 'bloqueada'; end if;
  if v_isento then return 'ativa'; end if;
  if v_vence is null then return 'ativa'; end if;

  select coalesce(dias_tolerancia, 5) into v_tolerancia from sistema_config where id;

  if now() <= v_vence then return 'ativa'; end if;
  if now() <= v_vence + (v_tolerancia || ' days')::interval then return 'tolerancia'; end if;
  return 'leitura';
end $$;

/** A loja pode gravar? É esta função que as políticas de escrita consultam. */
create or replace function loja_pode_gravar()
returns boolean
language sql stable security definer set search_path = public
as $$ select situacao_loja() in ('ativa', 'tolerancia'); $$;

grant execute on function situacao_loja() to authenticated;
grant execute on function loja_pode_gravar() to authenticated;
grant execute on function sou_super_admin() to authenticated;

-- ---------- 4. Políticas: separar leitura de escrita ----------
-- Antes havia uma política "for all" por tabela. Agora a leitura continua
-- livre para a própria loja, e a escrita passa a exigir assinatura válida.
do $$
declare t text;
begin
  foreach t in array array[
    'clientes','produtos','ordens','movimentos','sessoes',
    'fiados','categorias','fornecedores','configuracoes',
    'cotacoes','precos_fornecedor'
  ]
  loop
    -- a tabela pode não existir se a migração de cotações não rodou ainda
    if to_regclass(t) is null then continue; end if;

    execute format('drop policy if exists "acesso_total" on %I;', t);
    execute format('drop policy if exists "loja_isolada" on %I;', t);
    execute format('drop policy if exists "loja_ler" on %I;', t);
    execute format('drop policy if exists "loja_inserir" on %I;', t);
    execute format('drop policy if exists "loja_alterar" on %I;', t);
    execute format('drop policy if exists "loja_apagar" on %I;', t);

    -- Ler: sempre que a loja for a sua. Quem atrasou continua consultando.
    execute format($f$
      create policy "loja_ler" on %I
        for select to authenticated
        using ("lojaId" = loja_atual());
    $f$, t);

    -- Gravar: só com assinatura em dia (ou dentro da tolerância)
    execute format($f$
      create policy "loja_inserir" on %I
        for insert to authenticated
        with check ("lojaId" = loja_atual() and loja_pode_gravar());
    $f$, t);

    execute format($f$
      create policy "loja_alterar" on %I
        for update to authenticated
        using ("lojaId" = loja_atual() and loja_pode_gravar())
        with check ("lojaId" = loja_atual() and loja_pode_gravar());
    $f$, t);

    execute format($f$
      create policy "loja_apagar" on %I
        for delete to authenticated
        using ("lojaId" = loja_atual() and loja_pode_gravar());
    $f$, t);
  end loop;
end $$;

-- ---------- 5. O administrador do sistema enxerga todas as lojas ----------
drop policy if exists "minha_loja_ler" on lojas;
create policy "minha_loja_ler" on lojas
  for select to authenticated
  using (id = loja_atual() or sou_super_admin());

drop policy if exists "minha_loja_editar" on lojas;
create policy "minha_loja_editar" on lojas
  for update to authenticated
  using (
    -- o dono ajusta os dados da própria loja...
    (id = loja_atual() and papel_atual() = 'dono')
    -- ...e o administrador do sistema ajusta a assinatura de qualquer uma
    or sou_super_admin()
  )
  with check (id = loja_atual() or sou_super_admin());

drop policy if exists "sistema_config_admin" on sistema_config;
create policy "sistema_config_admin" on sistema_config
  for update to authenticated
  using (sou_super_admin())
  with check (sou_super_admin());

-- O administrador também precisa ver os perfis de todas as lojas para saber
-- quantas pessoas usam cada uma
drop policy if exists "perfis_ler" on perfis;
create policy "perfis_ler" on perfis
  for select to authenticated
  using (loja_id = loja_atual() or sou_super_admin());

-- ---------- 6. Registrar um pagamento (usado pelo painel) ----------
-- Feito como função para que a regra de renovação fique num lugar só:
-- quem paga ADIANTADO soma em cima do vencimento que ainda tinha (não
-- perde os dias que sobravam), e quem paga ATRASADO passa a contar de
-- hoje (não paga pelo período em que ficou travado).
create or replace function registrar_pagamento(
  p_loja uuid,
  p_meses integer default 1,
  p_valor numeric default null
)
returns timestamptz
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_base timestamptz;
  v_novo timestamptz;
begin
  if not sou_super_admin() then
    raise exception 'Apenas o administrador do sistema pode registrar pagamentos.';
  end if;

  select greatest(coalesce("venceEm", now()), now()) into v_base
    from lojas where id = p_loja;

  if not found then raise exception 'Loja não encontrada.'; end if;

  v_novo := v_base + (greatest(p_meses, 1) || ' months')::interval;

  update lojas
     set "venceEm" = v_novo,
         "ultimoPagamento" = now(),
         bloqueada = false,
         valor_mensal = coalesce(p_valor, valor_mensal)
   where id = p_loja;

  return v_novo;
end $$;

grant execute on function registrar_pagamento(uuid, integer, numeric) to authenticated;

-- =====================================================================
-- DEPOIS DE RODAR:
--   1. Entre no sistema e abra o menu "Lojas" (só você enxerga).
--   2. Preencha sua chave Pix e o valor mensal em "Ajustes do sistema".
--   3. Use "Liberar nova loja" em Configurações -> Equipe para cada
--      cliente novo. Ele começa com 14 dias de teste automaticamente.
-- =====================================================================

-- ---------- 7. Registro dos avisos já enviados ----------
-- Sem isto, a rotina diária mandaria o mesmo aviso todo santo dia até a
-- loja pagar. O gatilho é loja + tipo + data de vencimento: quando a loja
-- renova, a referência muda e o ciclo recomeça sozinho.
create table if not exists avisos_cobranca (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas (id) on delete cascade,
  tipo text not null,
  referencia text not null,
  "criadoEm" timestamptz not null default now(),
  unique (loja_id, tipo, referencia)
);

alter table avisos_cobranca enable row level security;

-- Só o administrador do sistema lê. A rotina do servidor usa a chave
-- service_role, que não passa por estas políticas.
drop policy if exists "avisos_admin" on avisos_cobranca;
create policy "avisos_admin" on avisos_cobranca
  for select to authenticated
  using (sou_super_admin());
