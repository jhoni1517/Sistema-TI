-- =====================================================================
-- Sistema TI · AVALIAÇÃO DO ATENDIMENTO E DEPOIMENTOS
-- ---------------------------------------------------------------------
-- Rode no SQL Editor do Supabase. É seguro repetir.
--
-- Depois da entrega, o link de rastreio pergunta a nota (1 a 5) e um
-- comentário. Nota 4 ou 5: o cliente recebe o link do Google e pode
-- autorizar o comentário na página pública de depoimentos. Nota 1 a 3:
-- vira aviso só para a loja.
--
-- A loja NÃO grava avaliação: senão dava para inventar depoimento de cinco
-- estrelas. A tabela só recebe pela função avaliar_atendimento, que exige
-- o segredo do link da OS entregue. A loja só marca "resolvido" e pode
-- esconder um depoimento — nunca publicar sem o sim do cliente.
-- =====================================================================

create table if not exists avaliacoes (
  id text primary key,
  "lojaId" uuid not null,
  "osId" text not null,
  numero integer,
  nota integer not null check (nota between 1 and 5),
  comentario text,
  publicar boolean not null default false,
  nome text,
  aparelho text,
  "criadoEm" text,
  resolvido boolean not null default false,
  resolucao text,
  oculto boolean not null default false
);

create unique index if not exists avaliacoes_os_uidx on avaliacoes ("lojaId", "osId");

alter table avaliacoes enable row level security;

drop policy if exists "loja_ler" on avaliacoes;
create policy "loja_ler" on avaliacoes
  for select to authenticated using ("lojaId" = loja_atual());

-- ---------------------------------------------------------------------
-- A nota que o cliente já deu nesta OS (para a página mostrar "obrigado").
-- ---------------------------------------------------------------------
create or replace function avaliacao_da_os(p_loja uuid, p_numero integer, p_token text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object('nota', a.nota, 'comentario', a.comentario, 'publicar', a.publicar)
    from ordens o
    join avaliacoes a on a."lojaId" = o."lojaId" and a."osId" = o.id
   where o."lojaId" = p_loja
     and o.numero = p_numero
     and o.rastreio = nullif(trim(coalesce(p_token, '')), '')
   limit 1;
$$;

revoke all on function avaliacao_da_os(uuid, integer, text) from public;
grant execute on function avaliacao_da_os(uuid, integer, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Avaliar. Uma por OS; dá para mudar de ideia por 30 dias.
-- Devolve o link do Google só para nota 4 ou 5.
-- ---------------------------------------------------------------------
create or replace function avaliar_atendimento(
  p_loja uuid,
  p_numero integer,
  p_token text,
  p_nota integer,
  p_comentario text,
  p_publicar boolean
)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_os ordens%rowtype;
  v_nome text;
  v_antiga avaliacoes%rowtype;
  v_google text;
  v_coment text := left(trim(coalesce(p_comentario, '')), 500);
begin
  if p_nota is null or p_nota < 1 or p_nota > 5 then
    raise exception 'Escolha uma nota de 1 a 5.';
  end if;

  select * into v_os from ordens
   where "lojaId" = p_loja
     and numero = p_numero
     and rastreio = nullif(trim(coalesce(p_token, '')), '')
     and status = 'entregue'
   limit 1;
  if v_os.id is null then
    raise exception 'A avaliação abre depois que o aparelho é entregue.';
  end if;

  select * into v_antiga from avaliacoes where "lojaId" = p_loja and "osId" = v_os.id;
  if v_antiga.id is not null and v_antiga."criadoEm" < to_char(now() - interval '30 days', 'YYYY-MM-DD"T"HH24:MI:SS') then
    raise exception 'O prazo para mudar esta avaliação acabou.';
  end if;

  select split_part(trim(coalesce(c.nome, '')), ' ', 1) into v_nome
    from clientes c where c.id = v_os."clienteId" and c."lojaId" = p_loja;

  insert into avaliacoes (id, "lojaId", "osId", numero, nota, comentario, publicar, nome, aparelho, "criadoEm")
  values (
    gen_random_uuid()::text, p_loja, v_os.id, v_os.numero, p_nota, nullif(v_coment, ''),
    coalesce(p_publicar, false) and p_nota >= 4 and v_coment <> '',
    left(nullif(v_nome, ''), 40),
    left(nullif(trim(coalesce(v_os.marca, '') || ' ' || coalesce(v_os.modelo, '')), ''), 60),
    to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  )
  on conflict ("lojaId", "osId") do update set
    nota = excluded.nota,
    comentario = excluded.comentario,
    publicar = excluded.publicar,
    -- Mudou para nota boa: o aviso ao dono deixa de valer. Mudou para ruim:
    -- volta a ser aviso, mesmo que tenha sido resolvido antes.
    resolvido = case when excluded.nota >= 4 then avaliacoes.resolvido else false end;

  if p_nota >= 4 then
    select c.dados ->> 'linkAvaliacao' into v_google
      from configuracoes c where c.id = p_loja::text;
    if coalesce(v_google, '') !~* '^https://' then v_google := null; end if;
  end if;

  return jsonb_build_object('google', v_google);
end;
$$;

revoke all on function avaliar_atendimento(uuid, integer, text, integer, text, boolean) from public;
grant execute on function avaliar_atendimento(uuid, integer, text, integer, text, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------
-- A loja marca como resolvido ou esconde um depoimento. Só isso.
-- ---------------------------------------------------------------------
create or replace function resolver_avaliacao(p_id text, p_resolvido boolean, p_resolucao text, p_oculto boolean)
returns boolean
language plpgsql volatile security definer set search_path = public
as $$
begin
  if not loja_pode_gravar() then
    raise exception 'Não foi possível salvar: a assinatura do sistema está vencida.';
  end if;
  update avaliacoes
     set resolvido = coalesce(p_resolvido, resolvido),
         resolucao = left(coalesce(p_resolucao, resolucao), 300),
         oculto = coalesce(p_oculto, oculto)
   where id = p_id and "lojaId" = loja_atual();
  return found;
end;
$$;

revoke all on function resolver_avaliacao(text, boolean, text, boolean) from public;
grant execute on function resolver_avaliacao(text, boolean, text, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- A página pública /depoimentos/:loja. Só comentário autorizado, nota 4
-- ou 5, não escondido, com primeiro nome e aparelho. A média é de TODAS
-- as notas, inclusive as ruins: média só das boas seria mentira.
-- ---------------------------------------------------------------------
create or replace function depoimentos_publicos(p_loja uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'loja', coalesce(nullif(trim(c.dados ->> 'nomeLoja'), ''), l.nome),
    'logo', case when (c.dados ->> 'logoUrl') ~* '^https://' then c.dados ->> 'logoUrl' else null end,
    'whatsapp', nullif(regexp_replace(coalesce(c.dados ->> 'telefoneLoja', ''), '\D', '', 'g'), ''),
    'google', case when (c.dados ->> 'linkAvaliacao') ~* '^https://' then c.dados ->> 'linkAvaliacao' else null end,
    'total', (select count(*) from avaliacoes a where a."lojaId" = l.id),
    'media', (select round(avg(a.nota)::numeric, 1) from avaliacoes a where a."lojaId" = l.id),
    'depoimentos', coalesce((
      select jsonb_agg(x order by x ->> 'data' desc)
        from (
          select jsonb_build_object(
                   'nome', coalesce(a.nome, 'Cliente'),
                   'aparelho', a.aparelho,
                   'nota', a.nota,
                   'comentario', a.comentario,
                   'data', left(a."criadoEm", 10)
                 ) as x
            from avaliacoes a
           where a."lojaId" = l.id
             and a.publicar
             and not a.oculto
             and a.nota >= 4
             and coalesce(a.comentario, '') <> ''
           order by a."criadoEm" desc
           limit 60
        ) s
    ), '[]'::jsonb)
  )
  from lojas l
  left join configuracoes c on c.id = l.id::text
  where l.id = p_loja and coalesce(l.ativa, true);
$$;

revoke all on function depoimentos_publicos(uuid) from public;
grant execute on function depoimentos_publicos(uuid) to anon, authenticated;

select 'ok' as resultado;
