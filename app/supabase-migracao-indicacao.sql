-- =====================================================================
-- Sistema TI · INDIQUE E GANHE (lojista indica lojista)
-- ---------------------------------------------------------------------
-- Rode no SQL Editor do Supabase, DEPOIS do
-- supabase-migracao-trava-assinatura.sql. É seguro repetir.
--
-- Cada loja tem um código. Quem entra por ele ganha 30 dias a mais de
-- teste; quem indicou ganha 1 mês quando a indicada paga a primeira
-- mensalidade.
--
-- O crédito é do BANCO, não da tela:
--   - quem ganha os 30 dias é a função usar_indicacao, uma vez por loja,
--     só antes do primeiro pagamento e só nos primeiros 30 dias de vida;
--   - quem ganha o mês é um gatilho no "ultimoPagamento": vale para o
--     pagamento registrado à mão, pelo Pix ou pelo que vier. A marca
--     bonus_indicacao_em faz o mês cair UMA vez só, mesmo que o pagamento
--     seja registrado de novo.
-- =====================================================================

alter table lojas add column if not exists codigo_indicacao text;
alter table lojas add column if not exists indicada_por uuid references lojas (id) on delete set null;
alter table lojas add column if not exists indicada_em timestamptz;
alter table lojas add column if not exists bonus_indicacao_em timestamptz;
create unique index if not exists lojas_codigo_indicacao_idx on lojas (codigo_indicacao);

-- Sem letras que se confundem no WhatsApp (0/O, 1/I)
create or replace function gerar_codigo_indicacao()
returns text
language plpgsql volatile
set search_path = public
as $$
declare
  v text;
begin
  loop
    select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (floor(random() * 32) + 1)::int, 1), '')
      into v from generate_series(1, 6);
    exit when not exists (select 1 from lojas where codigo_indicacao = v);
  end loop;
  return v;
end $$;

create or replace function lojas_codigo_indicacao()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.codigo_indicacao is null then
    new.codigo_indicacao := gerar_codigo_indicacao();
  end if;
  return new;
end $$;

drop trigger if exists trg_lojas_codigo_indicacao on lojas;
create trigger trg_lojas_codigo_indicacao
  before insert on lojas
  for each row execute function lojas_codigo_indicacao();

-- As lojas que já existem ganham o código agora. (Sem bloco DO: o editor
-- do Supabase se perde em cifrão fora do lugar de sempre.) Dois sorteios
-- iguais no mesmo comando são 1 em bilhões; se acontecer, o índice único
-- recusa e é só rodar de novo.
update lojas set codigo_indicacao = gerar_codigo_indicacao() where codigo_indicacao is null;

-- ---------- A trava da assinatura cobre as colunas novas ----------
-- Sem isto, o dono marcava a própria loja como indicada, ou apagava a
-- marca do bônus para ganhar o mês de novo.
create or replace function protege_assinatura_loja()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') or sou_super_admin() then
    return new;
  end if;
  if new."venceEm" is distinct from old."venceEm"
     or new."testeAte" is distinct from old."testeAte"
     or new."ultimoPagamento" is distinct from old."ultimoPagamento"
     or new.bloqueada is distinct from old.bloqueada
     or new.isento is distinct from old.isento
     or new.ativa is distinct from old.ativa
     or new.valor_mensal is distinct from old.valor_mensal
     or new."testesDados" is distinct from old."testesDados"
     or new."motivoTeste" is distinct from old."motivoTeste"
     or new.codigo_indicacao is distinct from old.codigo_indicacao
     or new.indicada_por is distinct from old.indicada_por
     or new.indicada_em is distinct from old.indicada_em
     or new.bonus_indicacao_em is distinct from old.bonus_indicacao_em then
    raise exception
      'A assinatura só muda pelo suporte. Fale com quem te vendeu o sistema.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protege_assinatura_loja on lojas;
create trigger trg_protege_assinatura_loja
  before update on lojas
  for each row
  execute function protege_assinatura_loja();

-- ---------- O link público: de quem é este código? ----------
-- Só o nome da loja. É o que aparece na página "Fulano te indicou".
create or replace function loja_que_indica(p_codigo text)
returns text
language sql stable security definer set search_path = public
as $$
  select nome from lojas
   where codigo_indicacao = upper(trim(coalesce(p_codigo, '')))
     and coalesce(ativa, true)
   limit 1;
$$;

-- ---------- O código da minha loja ----------
create or replace function meu_codigo_indicacao()
returns text
language sql stable security definer set search_path = public
as $$
  select codigo_indicacao from lojas where id = loja_atual();
$$;

-- ---------- Loja nova usa o código de quem indicou ----------
create or replace function usar_indicacao(p_codigo text)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_minha lojas%rowtype;
  v_quem uuid;
  v_novo timestamptz;
begin
  if papel_atual() is distinct from 'dono' then
    return jsonb_build_object('erro', 'Só o dono da loja pode usar um código de indicação.');
  end if;
  select * into v_minha from lojas where id = loja_atual() for update;
  if not found then
    return jsonb_build_object('erro', 'Loja não encontrada.');
  end if;
  if v_minha.indicada_por is not null then
    return jsonb_build_object('erro', 'Esta loja já usou um código de indicação.');
  end if;
  -- O bônus é de boas-vindas: quem já paga ou já está há mais de 30 dias
  -- no sistema não é loja nova.
  if v_minha."ultimoPagamento" is not null or v_minha."criadoEm" < now() - interval '30 days' then
    return jsonb_build_object('erro', 'O código de indicação vale só nos primeiros 30 dias, antes do primeiro pagamento.');
  end if;

  select id into v_quem from lojas
   where codigo_indicacao = upper(trim(coalesce(p_codigo, '')))
     and coalesce(ativa, true);
  if v_quem is null then
    return jsonb_build_object('erro', 'Código não encontrado. Confira as letras com quem te indicou.');
  end if;
  if v_quem = v_minha.id then
    return jsonb_build_object('erro', 'Esse é o código da sua própria loja.');
  end if;

  -- Os 30 dias entram como TESTE (testeAte junto): é cortesia, não
  -- pagamento, e o aviso da tela continua dizendo "teste grátis".
  v_novo := greatest(coalesce(v_minha."venceEm", now()), now()) + interval '30 days';
  update lojas
     set indicada_por = v_quem,
         indicada_em = now(),
         "venceEm" = case when coalesce(isento, false) then "venceEm" else v_novo end,
         "testeAte" = case when coalesce(isento, false) then "testeAte" else v_novo end
   where id = v_minha.id;

  return jsonb_build_object('ok', true, 'venceEm', v_novo);
end $$;

-- ---------- A indicada pagou: quem indicou ganha 1 mês ----------
create or replace function bonus_de_indicacao()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_marcou integer;
begin
  if new.indicada_por is null or new."ultimoPagamento" is null or new.bonus_indicacao_em is not null then
    return null;
  end if;

  -- A marca vem ANTES do crédito e só pega se ainda estava vazia: dois
  -- pagamentos registrados juntos não dão dois meses.
  update lojas set bonus_indicacao_em = now()
   where id = new.id and bonus_indicacao_em is null;
  get diagnostics v_marcou = row_count;
  if v_marcou = 0 then return null; end if;

  -- Quem indicou e ainda está em teste continua em teste, com mais um mês
  -- (testeAte anda junto). Quem já paga ganha o mês como pago.
  update lojas
     set "testeAte" = case
           when "testeAte" is not null and "venceEm" <= "testeAte"
             then greatest(coalesce("venceEm", now()), now()) + interval '1 month'
           else "testeAte" end,
         "venceEm" = greatest(coalesce("venceEm", now()), now()) + interval '1 month'
   where id = new.indicada_por
     and not coalesce(isento, false);
  return null;
end $$;

drop trigger if exists trg_bonus_de_indicacao on lojas;
create trigger trg_bonus_de_indicacao
  after update of "ultimoPagamento" on lojas
  for each row execute function bonus_de_indicacao();

-- ---------- A lista "quem eu indiquei" ----------
create or replace function minhas_indicacoes()
returns table (nome text, desde timestamptz, situacao text)
language sql stable security definer set search_path = public
as $$
  select l.nome,
         l.indicada_em,
         case
           when l.bonus_indicacao_em is not null then 'pagou'
           when l."venceEm" is not null and l."venceEm" < now() then 'nao_pagou'
           else 'em_teste'
         end
    from lojas l
   where l.indicada_por = loja_atual()
     and papel_atual() in ('dono', 'gerente')
   order by l.indicada_em desc;
$$;

revoke all on function gerar_codigo_indicacao() from public, anon, authenticated;
revoke all on function loja_que_indica(text) from public;
revoke all on function meu_codigo_indicacao() from public;
revoke all on function usar_indicacao(text) from public;
revoke all on function minhas_indicacoes() from public;
grant execute on function loja_que_indica(text) to anon, authenticated;
grant execute on function meu_codigo_indicacao() to authenticated;
grant execute on function usar_indicacao(text) to authenticated;
grant execute on function minhas_indicacoes() to authenticated;

select 'ok' as resultado;
