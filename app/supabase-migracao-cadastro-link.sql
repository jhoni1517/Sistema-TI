-- =====================================================================
-- Sistema TI · CADASTRO PELO LINK (SÓ O FORMULÁRIO)
-- ---------------------------------------------------------------------
-- Rode no SQL Editor do Supabase, DEPOIS do
-- supabase-migracao-area-cliente.sql. É seguro repetir.
--
-- A área do cliente pede senha. Para quem só quer adiantar a fila do
-- balcão — "preenche aqui que eu já te cadastro" — a senha é um passo a
-- mais que ninguém pediu. Este link é só o formulário: o cliente preenche
-- e o cadastro cai na lista de clientes da loja.
--
-- Mesmas travas do cadastro com senha, e escritas UMA vez só, na função
-- `_cliente_pelo_link` que as duas portas usam:
--   - área do cliente ligada e loja com a assinatura em dia;
--   - CPF que já existe não é sobrescrito;
--   - no máximo 30 cadastros pelo link por hora, contra robô.
-- =====================================================================

alter table clientes add column if not exists email text;
alter table clientes add column if not exists endereco text;

-- Valida, confere e grava o cliente. Devolve { id } ou { erro }.
create or replace function _cliente_pelo_link(
  p_loja uuid,
  p_nome text,
  p_cpf text,
  p_telefone text,
  p_nascimento text,
  p_email text,
  p_endereco text,
  p_ja_existe text
)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions
as $$
declare
  v_loja lojas%rowtype;
  v_cpf text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  v_tel text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_nome text := trim(coalesce(p_nome, ''));
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_end text := nullif(trim(coalesce(p_endereco, '')), '');
  v_nasc date;
  v_id text;
  v_tolerancia integer;
begin
  select * into v_loja from lojas where id = p_loja;
  if not found or not coalesce(v_loja.area_cliente_ativa, false) or not coalesce(v_loja.ativa, true) then
    return jsonb_build_object('erro', 'Este link não está funcionando. Peça o link de novo para a loja.');
  end if;

  -- Cadastro GRAVA: mesma régua da assinatura da loja.
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
  if length(coalesce(v_email, '')) > 120 or length(coalesce(v_end, '')) > 200 then
    return jsonb_build_object('erro', 'E-mail ou endereço grande demais.');
  end if;
  begin
    v_nasc := p_nascimento::date;
  exception when others then
    return jsonb_build_object('erro', 'Confira a data de nascimento.');
  end;
  if v_nasc < date '1900-01-01' or v_nasc > current_date then
    return jsonb_build_object('erro', 'Confira a data de nascimento.');
  end if;

  -- CPF que já existe NÃO é sobrescrito: o link é público, e aceitar
  -- trocaria o telefone do cliente de verdade pelo de quem digitou.
  if exists (
    select 1 from clientes
     where "lojaId" = p_loja
       and regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = v_cpf
  ) then
    return jsonb_build_object('erro', p_ja_existe, 'jaExiste', true);
  end if;

  if (select count(*) from cliente_acesso
       where loja_id = p_loja and pelo_link and criado_em > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('erro', 'Muitos cadastros agora. Tente de novo daqui a pouco.');
  end if;

  v_id := gen_random_uuid()::text;
  insert into clientes (id, "lojaId", nome, telefone, cpf, nascimento, email, endereco, observacoes, "criadoEm")
  values (
    v_id, p_loja, v_nome, v_tel, v_cpf, to_char(v_nasc, 'YYYY-MM-DD'), v_email, v_end,
    'Cadastro feito pelo próprio cliente, pelo link.',
    to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  -- Linha sem senha: conta para o freio de 30 por hora, e o botão Acesso
  -- da loja cria a senha depois, se o cliente quiser a área.
  insert into cliente_acesso (cliente_id, loja_id, pelo_link)
  values (v_id, p_loja, true);

  return jsonb_build_object('id', v_id);
end $$;

-- ---------- Só o formulário ----------
drop function if exists cadastrar_cliente_simples(uuid, text, text, text, text, text, text);
create function cadastrar_cliente_simples(
  p_loja uuid,
  p_nome text,
  p_cpf text,
  p_telefone text,
  p_nascimento text,
  p_email text,
  p_endereco text
)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions
as $$
declare
  r jsonb;
begin
  r := _cliente_pelo_link(
    p_loja, p_nome, p_cpf, p_telefone, p_nascimento, p_email, p_endereco,
    'Você já tem cadastro nesta loja. Não precisa fazer de novo.'
  );
  if r ? 'erro' then
    return r;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Cadastro com senha (área do cliente) ----------
-- Passa a usar a mesma função: duas cópias das travas divergiriam no dia
-- em que alguém mexesse numa só.
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
  r jsonb;
  v_id text;
begin
  if length(coalesce(p_senha, '')) < 6 or length(p_senha) > 72 then
    return jsonb_build_object('erro', 'A senha precisa de pelo menos 6 caracteres.');
  end if;

  r := _cliente_pelo_link(
    p_loja, p_nome, p_cpf, p_telefone, p_nascimento, null, null,
    'Você já tem cadastro nesta loja. Entre com CPF e senha, ou peça pelo WhatsApp da loja o link para criar sua senha.'
  );
  if r ? 'erro' then
    return r;
  end if;

  v_id := r ->> 'id';
  update cliente_acesso set senha_hash = crypt(p_senha, gen_salt('bf')) where cliente_id = v_id;
  return jsonb_build_object('token', _cliente_nova_sessao(v_id, p_loja));
end $$;

revoke all on function _cliente_pelo_link(uuid, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function cadastrar_cliente_simples(uuid, text, text, text, text, text, text) from public;
revoke all on function cadastrar_cliente_publico(uuid, text, text, text, text, text) from public;
grant execute on function cadastrar_cliente_simples(uuid, text, text, text, text, text, text) to anon, authenticated;
grant execute on function cadastrar_cliente_publico(uuid, text, text, text, text, text) to anon, authenticated;

select 'ok' as resultado;
