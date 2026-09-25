-- =====================================================================
-- Sistema TI · AUDITORIA (quem fez o quê)
-- ---------------------------------------------------------------------
-- Rode no SQL Editor do Supabase. É seguro repetir.
--
-- Registro imutável: só inserção. Não existe política de alteração nem
-- de exclusão, e um gatilho recusa as duas até para quem tem a chave de
-- serviço. Quem e quando o BANCO carimba, por cima do que a tela mandar:
-- senão bastava mandar outro nome.
--
-- Só o dono lê. Qualquer pessoa da loja registra (é ela que faz a ação).
-- Mudança de papel na equipe é registrada pelo próprio banco.
-- =====================================================================

create table if not exists auditoria (
  id text primary key,
  "lojaId" uuid not null,
  acao text not null,
  alvo text,
  antes text,
  depois text,
  valor numeric,
  motivo text,
  "usuarioId" uuid,
  usuario text,
  "criadoEm" text
);

create index if not exists auditoria_loja_idx on auditoria ("lojaId", "criadoEm");

alter table auditoria enable row level security;

drop policy if exists "dono_ler" on auditoria;
create policy "dono_ler" on auditoria
  for select to authenticated
  using ("lojaId" = loja_atual() and papel_atual() = 'dono');

drop policy if exists "loja_registrar" on auditoria;
create policy "loja_registrar" on auditoria
  for insert to authenticated
  with check ("lojaId" = loja_atual());

-- Quem e quando: o banco decide.
create or replace function carimba_auditoria()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null then
    new."usuarioId" := auth.uid();
    new.usuario := coalesce((select nullif(trim(nome), '') from perfis where id = auth.uid()), 'Sem nome');
  end if;
  new."criadoEm" := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  new.alvo := left(new.alvo, 120);
  new.motivo := left(new.motivo, 300);
  new.antes := left(new.antes, 2000);
  new.depois := left(new.depois, 2000);
  return new;
end;
$$;

drop trigger if exists carimba_auditoria on auditoria;
create trigger carimba_auditoria before insert on auditoria
  for each row execute function carimba_auditoria();

create or replace function auditoria_imutavel()
returns trigger
language plpgsql
as $$
begin
  raise exception 'A auditoria não se altera nem se apaga.';
end;
$$;

drop trigger if exists auditoria_imutavel on auditoria;
create trigger auditoria_imutavel before update or delete on auditoria
  for each row execute function auditoria_imutavel();

-- Mudança de papel ou desligamento na equipe: registrada aqui, e não na
-- tela, porque há mais de um caminho para mudar um perfil.
create or replace function audita_perfil()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.papel is distinct from old.papel or new.ativo is distinct from old.ativo then
    insert into auditoria (id, "lojaId", acao, alvo, antes, depois)
    values (
      gen_random_uuid()::text,
      new.loja_id,
      'permissao',
      coalesce(nullif(trim(new.nome), ''), 'Sem nome'),
      old.papel || case when coalesce(old.ativo, true) then '' else ' (desligado)' end,
      new.papel || case when coalesce(new.ativo, true) then '' else ' (desligado)' end
    );
  end if;
  return new;
end;
$$;

drop trigger if exists audita_perfil on perfis;
create trigger audita_perfil after update on perfis
  for each row execute function audita_perfil();

select 'ok' as resultado;
