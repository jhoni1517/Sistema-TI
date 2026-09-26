/*
 * Sequência do período grátis: quantas vezes o cliente abriu o rastreio.
 *
 * No dia 7 do teste a loja recebe "você já economizou X ligações". O X é
 * isto: cada OS aberta pelo cliente num dia é uma ligação a menos no balcão
 * perguntando "e aí, ficou pronto?". Um por OS por dia: o cliente que dá F5
 * dez vezes fez uma ligação só.
 *
 * A anotação passa pela mesma conferência do rastreio (número + código do
 * link). Sem o código certo, não anota nada — senão qualquer um inflaria o
 * número de qualquer loja.
 *
 * Repetível: if not exists, create or replace, drop policy if exists.
 */

create table if not exists rastreios_abertos (
  loja uuid not null references lojas (id) on delete cascade,
  numero integer not null,
  dia text not null,
  primary key (loja, numero, dia)
);

alter table rastreios_abertos enable row level security;

drop policy if exists rastreios_abertos_ler on rastreios_abertos;
create policy rastreios_abertos_ler on rastreios_abertos
  for select to authenticated using (loja = loja_atual());

create or replace function anotar_rastreio(p_loja uuid, p_numero integer, p_token text)
returns void
language plpgsql volatile security definer set search_path = public
as $$
begin
  -- A própria loja abrindo o link (o passo "ver o link que o cliente
  -- recebe") não é ligação economizada.
  if loja_atual() = p_loja then return; end if;
  if not exists (
    select 1 from ordens
     where "lojaId" = p_loja
       and numero = p_numero
       and rastreio = nullif(trim(coalesce(p_token, '')), '')
  ) then
    return;
  end if;
  insert into rastreios_abertos (loja, numero, dia)
  values (p_loja, p_numero, to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'))
  on conflict do nothing;
end $$;

grant execute on function anotar_rastreio(uuid, integer, text) to anon, authenticated;

create or replace function rastreios_da_loja()
returns bigint
language sql stable security definer set search_path = public
as $$
  select count(*) from rastreios_abertos where loja = loja_atual();
$$;

grant execute on function rastreios_da_loja() to authenticated;

/* ---------- Confere ---------- */

-- Deve aparecer: anotar_rastreio | 3 e rastreios_da_loja | 0
select proname, pronargs from pg_proc
 where proname in ('anotar_rastreio', 'rastreios_da_loja')
 order by proname;
