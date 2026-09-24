-- =====================================================================
-- Sistema TI · ORÇAMENTO PELO SITE (/orcar/:loja)
-- ---------------------------------------------------------------------
-- Rode no SQL Editor do Supabase. É seguro repetir.
--
-- O cliente escolhe marca, modelo e problema, vê "a partir de R$ X" (da
-- Tabela de serviços) e agenda a avaliação ou chama no WhatsApp. Cada
-- pedido vira uma linha em pedidos_site, que a loja converte em OS.
--
-- Mesma regra do catálogo: a página é aberta sem login, então quem decide
-- o que sai e o que entra são estas duas funções. A tabela de pedidos não
-- aceita gravação de fora — só pela função, que confere tudo de novo:
-- preço (recalculado aqui, não o que a tela mandou), horário livre e
-- quantidade de pedidos por hora.
--
-- Nasce desligado: só aparece para quem ligou em Configurações.
-- =====================================================================

create table if not exists pedidos_site (
  id text primary key,
  "lojaId" uuid not null,
  nome text,
  telefone text,
  marca text,
  modelo text,
  problema text,
  detalhe text,
  preco numeric,
  data text,
  hora text,
  "eventoId" text,
  canal text not null default 'agenda',
  status text not null default 'novo',
  "osId" text,
  "criadoEm" text
);

create index if not exists pedidos_site_loja_idx on pedidos_site ("lojaId", "criadoEm");

alter table pedidos_site enable row level security;

drop policy if exists "loja_ler" on pedidos_site;
create policy "loja_ler" on pedidos_site
  for select to authenticated using ("lojaId" = loja_atual());

-- Insert existe só porque o upsert da tela passa por ele ao mudar o status.
drop policy if exists "loja_inserir" on pedidos_site;
create policy "loja_inserir" on pedidos_site
  for insert to authenticated
  with check ("lojaId" = loja_atual() and loja_pode_gravar());

drop policy if exists "loja_alterar" on pedidos_site;
create policy "loja_alterar" on pedidos_site
  for update to authenticated
  using ("lojaId" = loja_atual() and loja_pode_gravar())
  with check ("lojaId" = loja_atual() and loja_pode_gravar());

-- ---------------------------------------------------------------------
-- O que a página pública recebe: nome, logo, cor, WhatsApp, a tabela de
-- preços (que é pública de propósito) e os horários já ocupados — só data
-- e hora, nunca o nome de quem marcou.
-- ---------------------------------------------------------------------
create or replace function orcamento_publico(p_loja uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'loja', coalesce(nullif(trim(c.dados ->> 'nomeLoja'), ''), l.nome),
    'logo', case when (c.dados ->> 'logoUrl') ~* '^https://' then c.dados ->> 'logoUrl' else null end,
    'cor', case when length(c.dados -> 'orcamentoSite' ->> 'cor') = 7
                 and left(c.dados -> 'orcamentoSite' ->> 'cor', 1) = '#'
                 and substr(c.dados -> 'orcamentoSite' ->> 'cor', 2) !~ '[^0-9a-fA-F]'
           then c.dados -> 'orcamentoSite' ->> 'cor' else null end,
    'whatsapp', nullif(regexp_replace(coalesce(c.dados ->> 'telefoneLoja', ''), '\D', '', 'g'), ''),
    'endereco', nullif(trim(coalesce(c.dados ->> 'enderecoLoja', '')), ''),
    'horario', nullif(trim(coalesce(c.dados ->> 'horarioAtendimento', '')), ''),
    'tabela', case when jsonb_typeof(c.dados -> 'tabelaServicos') = 'object' then c.dados -> 'tabelaServicos' else '{}'::jsonb end,
    'agenda', case when (c.dados -> 'orcamentoSite' ->> 'agendar') = 'true' then c.dados -> 'orcamentoSite' -> 'agenda' else null end,
    'hoje', to_char((now() at time zone 'America/Sao_Paulo'), 'YYYY-MM-DD'),
    'agora', to_char((now() at time zone 'America/Sao_Paulo'), 'HH24:MI'),
    'ocupados', coalesce((
      select jsonb_agg(jsonb_build_object('data', e.data, 'hora', left(e.hora, 5)))
        from eventos e
       where e."lojaId" = l.id
         and coalesce(e.hora, '') <> ''
         and not coalesce(e.concluido, false)
         and e.data >= to_char((now() at time zone 'America/Sao_Paulo'), 'YYYY-MM-DD')
         and e.data <= to_char((now() at time zone 'America/Sao_Paulo') + interval '15 days', 'YYYY-MM-DD')
    ), '[]'::jsonb)
  )
  from lojas l
  join configuracoes c on c.id = l.id::text
  where l.id = p_loja
    and coalesce(l.ativa, true)
    and (c.dados -> 'orcamentoSite' ->> 'ativo') = 'true';
$$;

revoke all on function orcamento_publico(uuid) from public;
grant execute on function orcamento_publico(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- O pedido. Recusa com frase que o cliente entende.
-- ---------------------------------------------------------------------
create or replace function pedir_orcamento(
  p_loja uuid,
  p_canal text,
  p_nome text,
  p_telefone text,
  p_modelo_id text,
  p_marca text,
  p_modelo text,
  p_problema text,
  p_detalhe text,
  p_data text,
  p_hora text
)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_dados jsonb;
  v_tab jsonb;
  v_ag jsonb;
  v_hoje text := to_char((now() at time zone 'America/Sao_Paulo'), 'YYYY-MM-DD');
  v_limite text := to_char((now() at time zone 'America/Sao_Paulo') + interval '14 days', 'YYYY-MM-DD');
  v_nome text := left(trim(coalesce(p_nome, '')), 80);
  v_tel text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_marca text := left(trim(coalesce(p_marca, '')), 40);
  v_modelo text := left(trim(coalesce(p_modelo, '')), 60);
  v_detalhe text := left(trim(coalesce(p_detalhe, '')), 300);
  v_problema text := coalesce(p_problema, 'outro');
  v_preco numeric;
  v_id text;
  v_evento text;
  v_por integer;
  v_ocupados integer;
begin
  select c.dados into v_dados
    from lojas l join configuracoes c on c.id = l.id::text
   where l.id = p_loja and coalesce(l.ativa, true);
  if v_dados is null or (v_dados -> 'orcamentoSite' ->> 'ativo') is distinct from 'true' then
    raise exception 'Esta loja não está recebendo pedidos pelo site.';
  end if;

  if p_canal not in ('agenda', 'whatsapp') then raise exception 'Pedido inválido.'; end if;
  if v_problema not in ('tela', 'bateria', 'conector', 'nao-liga', 'outro') then v_problema := 'outro'; end if;
  if length(v_tel) in (12, 13) and left(v_tel, 2) = '55' then v_tel := substr(v_tel, 3); end if;
  v_tel := left(v_tel, 11);

  -- Preço recalculado aqui: o que a tela manda pode ter sido mexido.
  v_tab := v_dados -> 'tabelaServicos';
  if jsonb_typeof(v_tab -> 'modelos') = 'array' and coalesce(p_modelo_id, '') <> '' then
    select m.valor ->> 'marca', m.valor ->> 'modelo'
      into v_marca, v_modelo
      from jsonb_array_elements(v_tab -> 'modelos') as m(valor)
     where m.valor ->> 'id' = p_modelo_id
     limit 1;
    if v_modelo is null then
      v_marca := left(trim(coalesce(p_marca, '')), 40);
      v_modelo := left(trim(coalesce(p_modelo, '')), 60);
    elsif v_problema <> 'outro' and jsonb_typeof(v_tab -> 'servicos') = 'array' then
      select min((m.valor -> 'precos' ->> (s.valor ->> 'id'))::numeric)
        into v_preco
        from jsonb_array_elements(v_tab -> 'modelos') as m(valor),
             jsonb_array_elements(v_tab -> 'servicos') as s(valor)
       where m.valor ->> 'id' = p_modelo_id
         and s.valor ->> 'problema' = v_problema
         and (m.valor -> 'precos' ->> (s.valor ->> 'id')) ~ '^[0-9]'
         and (m.valor -> 'precos' ->> (s.valor ->> 'id')) !~ '[^0-9.]'
         and (m.valor -> 'precos' ->> (s.valor ->> 'id')) !~ '[.].*[.]'
         and (m.valor -> 'precos' ->> (s.valor ->> 'id'))::numeric > 0;
    end if;
  end if;

  if v_modelo = '' then raise exception 'Escolha ou escreva o modelo do aparelho.'; end if;
  if p_canal = 'agenda' then
    if length(v_nome) < 2 then raise exception 'Escreva seu nome.'; end if;
    if length(v_tel) not in (10, 11) then raise exception 'Escreva o WhatsApp com DDD.'; end if;
  end if;

  -- Freio contra robô: link público recebe de tudo.
  if (select count(*) from pedidos_site
       where "lojaId" = p_loja
         and "criadoEm" >= to_char(now() - interval '1 hour', 'YYYY-MM-DD"T"HH24:MI:SS')) >= 30 then
    raise exception 'Muitos pedidos agora. Tente em alguns minutos ou chame a loja no WhatsApp.';
  end if;

  -- Tocou duas vezes no botão: devolve o mesmo pedido.
  if v_tel <> '' then
    select id into v_id from pedidos_site
     where "lojaId" = p_loja and telefone = v_tel and modelo = v_modelo and canal = p_canal
       and "criadoEm" >= to_char(now() - interval '10 minutes', 'YYYY-MM-DD"T"HH24:MI:SS')
     limit 1;
    if v_id is not null then return jsonb_build_object('id', v_id, 'preco', v_preco, 'repetido', true); end if;
  end if;

  if p_canal = 'agenda' and coalesce(p_data, '') <> '' then
    v_ag := v_dados -> 'orcamentoSite' -> 'agenda';
    if (v_dados -> 'orcamentoSite' ->> 'agendar') is distinct from 'true' or jsonb_typeof(v_ag) <> 'object' then
      raise exception 'Esta loja não está agendando pelo site. Chame no WhatsApp.';
    end if;
    if length(p_data) <> 10 or p_data !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
       or length(coalesce(p_hora, '')) <> 5 or p_hora !~ '^([01][0-9]|2[0-3]):[0-5][0-9]'
       or p_data < v_hoje or p_data > v_limite then
      raise exception 'Horário inválido. Escolha outro.';
    end if;
    if not (v_ag -> 'dias') @> to_jsonb(extract(dow from p_data::date)::integer)
       or p_hora < coalesce(v_ag ->> 'inicio', '09:00')
       or p_hora >= coalesce(v_ag ->> 'fim', '18:00') then
      raise exception 'A loja não atende nesse horário. Escolha outro.';
    end if;
    v_por := greatest(1, least(20, coalesce(nullif(v_ag ->> 'porHorario', '')::integer, 1)));
    -- Dois clientes no mesmo horário ao mesmo tempo: um espera o outro.
    perform pg_advisory_xact_lock(hashtext(p_loja::text || p_data || p_hora));
    select count(*) into v_ocupados from eventos
     where "lojaId" = p_loja and data = p_data and left(hora, 5) = p_hora and not coalesce(concluido, false);
    if v_ocupados >= v_por then
      raise exception 'Esse horário acabou de ser ocupado. Escolha outro.';
    end if;
    v_evento := gen_random_uuid()::text;
    insert into eventos (id, titulo, tipo, data, hora, observacoes, repetir, "avisarDiasAntes", concluido, "criadoEm", "lojaId")
    values (
      v_evento,
      left('Avaliação: ' || trim(v_marca || ' ' || v_modelo) || ' - ' || v_nome, 120),
      'atendimento', p_data, p_hora,
      'Pedido pelo site. WhatsApp: ' || v_tel || '. Problema: ' || v_problema
        || case when v_detalhe <> '' then '. ' || v_detalhe else '' end,
      'nenhuma', 0, false, to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), p_loja
    );
  end if;

  v_id := gen_random_uuid()::text;
  insert into pedidos_site (id, "lojaId", nome, telefone, marca, modelo, problema, detalhe, preco, data, hora, "eventoId", canal, status, "criadoEm")
  values (
    v_id, p_loja, v_nome, v_tel, v_marca, v_modelo, v_problema, v_detalhe, v_preco,
    case when v_evento is null then null else p_data end,
    case when v_evento is null then null else p_hora end,
    v_evento, p_canal, 'novo', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
  return jsonb_build_object('id', v_id, 'preco', v_preco, 'repetido', false);
end;
$$;

revoke all on function pedir_orcamento(uuid, text, text, text, text, text, text, text, text, text, text) from public;
grant execute on function pedir_orcamento(uuid, text, text, text, text, text, text, text, text, text, text) to anon, authenticated;

select 'ok' as resultado;
