-- =====================================================================
-- Sistema TI · ÁREA DO CLIENTE
-- ---------------------------------------------------------------------
-- Rode no SQL Editor do Supabase, DEPOIS do supabase-migracao-ia.sql.
-- É seguro repetir.
--
-- O QUE FAZ
--
-- Um link por loja onde o próprio cliente se cadastra (nome, CPF, WhatsApp,
-- nascimento e uma senha que ELE cria) e depois entra com CPF e senha para
-- ver todas as OS dele: as da bancada agora e as que já foram entregues,
-- com garantia e tempo de casa.
--
-- POR QUE A SENHA NÃO É A DATA DE NASCIMENTO
--
-- CPF circula em todo cadastro de loja, e o aniversário está no Facebook.
-- Quem soubesse os dois veria nome, aparelhos e valores de todos os
-- consertos da pessoa. A senha é criada pelo cliente; esqueceu, a loja
-- manda pelo WhatsApp de sempre um link pessoal, que vale 48 horas e uma
-- vez só, para ele criar outra.
--
-- POR QUE O CLIENTE NÃO É USUÁRIO DO SUPABASE
--
-- Usuário do Auth entra nas políticas da loja (loja_atual, perfis). Cliente
-- de loja não pode chegar perto disso. Aqui ele só existe para as funções
-- abaixo, que são a ÚNICA porta: as duas tabelas novas não têm política
-- nenhuma, então nem a loja nem o navegador leem senha ou sessão.
--
-- CPF JÁ CADASTRADO NÃO É SOBRESCRITO
--
-- Se o cadastro pelo link aceitasse CPF que já existe, qualquer um criava
-- uma senha em cima do cliente de verdade e passava a ver as OS dele.
-- Cliente que já é da loja entra pelo link que a loja manda.
-- =====================================================================

-- A loja escolhe ligar. Nasce desligada, como o catálogo.
alter table lojas add column if not exists area_cliente_ativa boolean default false;

-- As colunas que as funções leem. Migração pede o que precisa e não
-- confia na ordem (a lição do catálogo).
alter table clientes add column if not exists nascimento text;
alter table clientes add column if not exists cpf text;
alter table ordens add column if not exists rastreio text;
alter table ordens add column if not exists "previsaoEntrega" text;

-- ---------- Senha e sessão ----------
create table if not exists cliente_acesso (
  cliente_id text primary key,
  loja_id uuid not null,
  senha_hash text,
  -- Cinco erros seguidos seguram a conta por 15 minutos. Sem isso, CPF é
  -- público e a senha de seis números cai em uma tarde de tentativa.
  tentativas integer not null default 0,
  bloqueado_ate timestamptz,
  link_token text,
  link_expira timestamptz,
  criado_em timestamptz not null default now(),
  pelo_link boolean not null default false
);
create index if not exists cliente_acesso_loja_idx on cliente_acesso (loja_id);
create unique index if not exists cliente_acesso_link_idx on cliente_acesso (link_token);

create table if not exists cliente_sessoes (
  token text primary key,
  cliente_id text not null,
  loja_id uuid not null,
  expira_em timestamptz not null
);
create index if not exists cliente_sessoes_cliente_idx on cliente_sessoes (cliente_id);

-- Sem política = ninguém lê nem grava pela API. Só as funções.
alter table cliente_acesso enable row level security;
alter table cliente_sessoes enable row level security;
revoke all on cliente_acesso from anon, authenticated;
revoke all on cliente_sessoes from anon, authenticated;

-- ---------- A loja por trás do link ----------
-- Devolve só o que a loja já imprime na OS. Área desligada devolve nada.
drop function if exists area_cliente_loja(uuid);
create function area_cliente_loja(p_loja uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
           'nome', coalesce(nullif(trim(c.dados ->> 'nomeLoja'), ''), l.nome),
           'logo', case when (c.dados ->> 'logoUrl') ~* '^https://' then c.dados ->> 'logoUrl' end,
           'cor', case
                    when (c.dados ->> 'corDestaque') !~ '[^a-z]'
                     and length(c.dados ->> 'corDestaque') between 1 and 20
                    then c.dados ->> 'corDestaque'
                  end,
           'whatsapp', nullif(regexp_replace(coalesce(c.dados ->> 'telefoneLoja', ''), '\D', '', 'g'), '')
         )
    from lojas l
    left join configuracoes c on c.id = l.id::text
   where l.id = p_loja
     and coalesce(l.area_cliente_ativa, false)
     and coalesce(l.ativa, true)
   limit 1;
$$;

-- Sessão nova: 30 dias. Quem abre a área no celular não quer digitar
-- senha toda vez que o conserto muda de etapa.
create or replace function _cliente_nova_sessao(p_cliente text, p_loja uuid)
returns text
language plpgsql volatile security definer set search_path = public, extensions
as $$
declare
  v_token text := encode(gen_random_bytes(24), 'hex');
begin
  delete from cliente_sessoes where cliente_id = p_cliente and expira_em < now();
  insert into cliente_sessoes (token, cliente_id, loja_id, expira_em)
  values (v_token, p_cliente, p_loja, now() + interval '30 days');
  return v_token;
end $$;

-- ---------- Cadastro pelo próprio cliente ----------
-- Devolve { token } ou { erro }. Erro volta como texto, não como exceção,
-- para a tela mostrar a frase exata.
drop function if exists cadastrar_cliente_publico(uuid, text, text, text, text, text);
create function cadastrar_cliente_publico(
  p_loja uuid,
  p_nome text,
  p_cpf text,
  p_telefone text,
  p_nascimento text,
  p_senha text
)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions
as $$
declare
  v_loja lojas%rowtype;
  v_cpf text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  v_tel text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_nome text := trim(coalesce(p_nome, ''));
  v_nasc date;
  v_id text;
  v_tolerancia integer;
begin
  select * into v_loja from lojas where id = p_loja;
  if not found or not coalesce(v_loja.area_cliente_ativa, false) or not coalesce(v_loja.ativa, true) then
    return jsonb_build_object('erro', 'Este link não está funcionando. Peça o link de novo para a loja.');
  end if;

  -- Cadastro GRAVA: segue a mesma régua da assinatura que o sistema usa
  -- para a loja. Entrar e consultar continuam liberados (a trava nunca
  -- sequestra dado), só o cadastro novo espera.
  select coalesce(dias_tolerancia, 5) into v_tolerancia from sistema_config where id;
  if coalesce(v_loja.bloqueada, false)
     or (not coalesce(v_loja.isento, false)
         and v_loja."venceEm" is not null
         and now() > v_loja."venceEm" + (coalesce(v_tolerancia, 5) || ' days')::interval) then
    return jsonb_build_object('erro', 'A loja não está recebendo cadastros agora. Fale com ela pelo WhatsApp.');
  end if;

  if length(v_nome) < 3 or length(v_nome) > 120 then
    return jsonb_build_object('erro', 'Escreva seu nome completo.');
  end if;
  if length(v_cpf) <> 11 or v_cpf = repeat(left(v_cpf, 1), 11) then
    return jsonb_build_object('erro', 'Confira o CPF: são 11 números.');
  end if;
  if length(v_tel) not between 10 and 11 then
    return jsonb_build_object('erro', 'Confira o WhatsApp com DDD.');
  end if;
  if length(coalesce(p_senha, '')) < 6 or length(p_senha) > 72 then
    return jsonb_build_object('erro', 'A senha precisa de pelo menos 6 caracteres.');
  end if;
  begin
    v_nasc := p_nascimento::date;
  exception when others then
    return jsonb_build_object('erro', 'Confira a data de nascimento.');
  end;
  if v_nasc < date '1900-01-01' or v_nasc > current_date then
    return jsonb_build_object('erro', 'Confira a data de nascimento.');
  end if;

  if exists (
    select 1 from clientes
     where "lojaId" = p_loja
       and regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = v_cpf
  ) then
    return jsonb_build_object(
      'erro',
      'Você já tem cadastro nesta loja. Entre com CPF e senha, ou peça pelo WhatsApp da loja o link para criar sua senha.'
    );
  end if;

  -- Freio contra robô: link de cadastro é público. Uma loja de bairro não
  -- recebe 30 cadastros pelo link em uma hora.
  if (select count(*) from cliente_acesso
       where loja_id = p_loja and pelo_link and criado_em > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('erro', 'Muitos cadastros agora. Tente de novo daqui a pouco.');
  end if;

  v_id := gen_random_uuid()::text;
  insert into clientes (id, "lojaId", nome, telefone, cpf, nascimento, observacoes, "criadoEm")
  values (
    v_id, p_loja, v_nome, v_tel, v_cpf, to_char(v_nasc, 'YYYY-MM-DD'),
    'Cadastro feito pelo próprio cliente, pelo link.',
    to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  insert into cliente_acesso (cliente_id, loja_id, senha_hash, pelo_link)
  values (v_id, p_loja, crypt(p_senha, gen_salt('bf')), true);

  return jsonb_build_object('token', _cliente_nova_sessao(v_id, p_loja));
end $$;

-- ---------- Entrar com CPF e senha ----------
drop function if exists entrar_cliente(uuid, text, text);
create function entrar_cliente(p_loja uuid, p_cpf text, p_senha text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions
as $$
declare
  v_cpf text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  v_cli text;
  a cliente_acesso%rowtype;
begin
  if not exists (select 1 from lojas where id = p_loja and coalesce(area_cliente_ativa, false)) then
    return jsonb_build_object('erro', 'Este link não está funcionando. Peça o link de novo para a loja.');
  end if;

  select id into v_cli from clientes
   where "lojaId" = p_loja
     and length(v_cpf) = 11
     and regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = v_cpf
   order by "criadoEm"
   limit 1;

  if v_cli is not null then
    select * into a from cliente_acesso where cliente_id = v_cli for update;
  end if;

  if v_cli is null or a.cliente_id is null or a.senha_hash is null then
    return jsonb_build_object(
      'erro',
      'Não achamos senha para este CPF. Se você já é cliente, peça pelo WhatsApp da loja o link para criar a sua.'
    );
  end if;

  if a.bloqueado_ate is not null and a.bloqueado_ate > now() then
    return jsonb_build_object('erro', 'Muitas tentativas erradas. Espere 15 minutos ou peça um link novo para a loja.');
  end if;

  -- Erro de senha NÃO é exceção: exceção desfaz a contagem de tentativas,
  -- e a trava de 5 erros nunca travaria nada.
  if a.senha_hash <> crypt(coalesce(p_senha, ''), a.senha_hash) then
    update cliente_acesso
       set tentativas = a.tentativas + 1,
           bloqueado_ate = case when a.tentativas + 1 >= 5 then now() + interval '15 minutes' end
     where cliente_id = v_cli;
    return jsonb_build_object('erro', 'CPF ou senha não conferem.');
  end if;

  update cliente_acesso set tentativas = 0, bloqueado_ate = null where cliente_id = v_cli;
  return jsonb_build_object('token', _cliente_nova_sessao(v_cli, p_loja));
end $$;

-- ---------- Link para criar a senha (a loja gera) ----------
-- Só quem é da loja do cliente gera. Devolve o segredo que vai no link.
drop function if exists gerar_acesso_cliente(text);
create function gerar_acesso_cliente(p_cliente text)
returns text
language plpgsql volatile security definer set search_path = public, extensions
as $$
declare
  v_loja uuid;
  v_token text := encode(gen_random_bytes(18), 'hex');
begin
  select "lojaId" into v_loja from clientes where id = p_cliente;
  if v_loja is null or v_loja <> loja_atual() then
    raise exception 'Cliente não encontrado nesta loja.';
  end if;
  if not exists (select 1 from lojas where id = v_loja and coalesce(area_cliente_ativa, false)) then
    raise exception 'Ligue a Área do cliente em Configurações antes de mandar o acesso.';
  end if;

  insert into cliente_acesso (cliente_id, loja_id, link_token, link_expira)
  values (p_cliente, v_loja, v_token, now() + interval '48 hours')
  on conflict (cliente_id) do update
     set link_token = excluded.link_token,
         link_expira = excluded.link_expira;
  return v_token;
end $$;

-- ---------- Criar a senha pelo link ----------
drop function if exists definir_senha_cliente(uuid, text, text);
create function definir_senha_cliente(p_loja uuid, p_link text, p_senha text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions
as $$
declare
  a cliente_acesso%rowtype;
begin
  if length(coalesce(p_senha, '')) < 6 or length(p_senha) > 72 then
    return jsonb_build_object('erro', 'A senha precisa de pelo menos 6 caracteres.');
  end if;

  select * into a from cliente_acesso
   where loja_id = p_loja
     and link_token = nullif(trim(coalesce(p_link, '')), '')
   for update;

  if a.cliente_id is null or a.link_expira is null or a.link_expira < now() then
    return jsonb_build_object('erro', 'Este link venceu ou já foi usado. Peça um novo para a loja.');
  end if;

  -- O link vale uma vez: depois de usado, quem achar a conversa no
  -- celular de outra pessoa não troca a senha de novo.
  update cliente_acesso
     set senha_hash = crypt(p_senha, gen_salt('bf')),
         link_token = null, link_expira = null,
         tentativas = 0, bloqueado_ate = null
   where cliente_id = a.cliente_id;
  -- Senha nova derruba as sessões antigas.
  delete from cliente_sessoes where cliente_id = a.cliente_id;

  return jsonb_build_object('token', _cliente_nova_sessao(a.cliente_id, p_loja));
end $$;

-- ---------- O que o cliente vê ----------
-- Nome, data de cadastro e as OS dele. De cada OS, só o que o rastreio já
-- mostra mais o defeito que ELE contou e as datas. O total sai do próprio
-- consultar_os, para a regra do dinheiro continuar existindo em um lugar
-- só do banco (orçamentos alternativos nunca somam).
drop function if exists area_do_cliente(text);
create function area_do_cliente(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  s cliente_sessoes%rowtype;
  v_cli clientes%rowtype;
begin
  select * into s from cliente_sessoes
   where token = nullif(trim(coalesce(p_token, '')), '')
     and expira_em > now();
  if s.token is null then
    return jsonb_build_object('erro', 'sessao');
  end if;

  select * into v_cli from clientes where id = s.cliente_id and "lojaId" = s.loja_id;
  if v_cli.id is null then
    return jsonb_build_object('erro', 'sessao');
  end if;

  return jsonb_build_object(
    'nome', v_cli.nome,
    'desde', left(coalesce(
      (select min(x) from (
         select v_cli."criadoEm" as x
         union all
         select o."criadoEm" from ordens o where o."lojaId" = s.loja_id and o."clienteId" = v_cli.id
       ) d where x is not null),
      ''), 10),
    'loja', area_cliente_loja(s.loja_id),
    'ordens', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'numero', o.numero,
                 'status', o.status,
                 'tipoAparelho', o."tipoAparelho",
                 'marca', o.marca,
                 'modelo', o.modelo,
                 'defeito', o."defeitoRelatado",
                 'criadoEm', o."criadoEm",
                 'entregueEm', o."entregueEm",
                 'garantiaDias', o."garantiaDias",
                 'previsao', o."previsaoEntrega",
                 'rastreio', o.rastreio,
                 'total', (select c.total from consultar_os(s.loja_id, o.numero, o.rastreio) c)
               )
               order by o."criadoEm" desc
             )
        from ordens o
       where o."lojaId" = s.loja_id
         and o."clienteId" = v_cli.id
    ), '[]'::jsonb)
  );
end $$;

drop function if exists sair_cliente(text);
create function sair_cliente(p_token text)
returns void
language sql volatile security definer set search_path = public
as $$
  delete from cliente_sessoes where token = p_token;
$$;

-- Função auxiliar não é porta pública.
revoke all on function _cliente_nova_sessao(text, uuid) from public, anon, authenticated;

revoke all on function area_cliente_loja(uuid) from public;
revoke all on function cadastrar_cliente_publico(uuid, text, text, text, text, text) from public;
revoke all on function entrar_cliente(uuid, text, text) from public;
revoke all on function gerar_acesso_cliente(text) from public;
revoke all on function definir_senha_cliente(uuid, text, text) from public;
revoke all on function area_do_cliente(text) from public;
revoke all on function sair_cliente(text) from public;

grant execute on function area_cliente_loja(uuid) to anon, authenticated;
grant execute on function cadastrar_cliente_publico(uuid, text, text, text, text, text) to anon, authenticated;
grant execute on function entrar_cliente(uuid, text, text) to anon, authenticated;
grant execute on function definir_senha_cliente(uuid, text, text) to anon, authenticated;
grant execute on function area_do_cliente(text) to anon, authenticated;
grant execute on function sair_cliente(text) to anon, authenticated;
grant execute on function gerar_acesso_cliente(text) to authenticated;

select 'ok' as resultado;
