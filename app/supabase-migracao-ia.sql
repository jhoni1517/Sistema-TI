-- =====================================================================
-- Sistema TI · IA (NOTA POR FOTO, DIAGNÓSTICO, OS POR VOZ) E PLANOS
-- ---------------------------------------------------------------------
-- Rode UMA VEZ no SQL Editor do Supabase, DEPOIS do
-- supabase-migracao-pix-os.sql. É seguro repetir.
--
-- O PROBLEMA
--
-- Cada leitura de nota, sugestão de diagnóstico ou OS por voz é uma
-- chamada paga ao Gemini. Sem teto, uma loja no plano mais barato podia
-- gastar mais em IA do que paga de mensalidade — e o teto conferido na
-- tela não segura nada, porque a tela se contorna.
--
-- O teto é conferido AQUI, numa conta atômica: duas leituras ao mesmo
-- tempo no último crédito do mês não passam as duas.
-- =====================================================================

-- ---------- O plano é o que foi VENDIDO ----------
-- A coluna existe desde a primeira migração e nada lia. Agora ela decide
-- limite de IA e WhatsApp automático, então passa a ter a mesma trava do
-- ramo: só o administrador do sistema troca.
alter table lojas add column if not exists plano text default 'essencial';
update lojas set plano = 'essencial' where plano is null or plano not in ('essencial', 'completo');

create or replace function protege_plano_loja()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.plano is distinct from old.plano and not sou_super_admin() then
    raise exception
      'O plano é definido na contratação. Fale com o suporte para mudar de plano.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protege_plano_loja on lojas;
create trigger trg_protege_plano_loja
  before update on lojas
  for each row
  execute function protege_plano_loja();

-- ---------- Quanto cada loja usou no mês ----------
create table if not exists uso_ia (
  "lojaId" uuid not null references lojas (id) on delete cascade,
  mes text not null,
  recurso text not null,
  quantidade integer not null default 0,
  primary key ("lojaId", mes, recurso)
);

alter table uso_ia enable row level security;

-- A loja LÊ o próprio contador (a tela mostra "3 de 20 este mês"), mas
-- não grava: contador que a loja zera não é contador.
drop policy if exists "uso_ia_ler" on uso_ia;
create policy "uso_ia_ler" on uso_ia
  for select to authenticated
  using ("lojaId" = loja_atual());

-- ---------- Gastar um crédito, se houver ----------
-- Devolve o total usado depois de gastar, ou -1 quando o limite do mês já
-- foi atingido. O `where` do `on conflict` é o que torna isto atômico: a
-- linha só sobe se ainda estiver abaixo do limite, dentro do mesmo comando.
--
-- O mês é o do BALCÃO (São Paulo): virar o mês às 21h do dia 30 faria a
-- loja ganhar créditos três horas antes.
create or replace function gastar_ia(p_loja uuid, p_recurso text, p_limite integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mes text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
  v_total integer;
begin
  if p_limite <= 0 then
    return -1;
  end if;
  insert into uso_ia ("lojaId", mes, recurso, quantidade)
  values (p_loja, v_mes, p_recurso, 1)
  on conflict ("lojaId", mes, recurso)
  do update set quantidade = uso_ia.quantidade + 1
   where uso_ia.quantidade < p_limite
  returning quantidade into v_total;
  if v_total is null then
    return -1;
  end if;
  return v_total;
end;
$$;

-- Devolve o crédito quando a IA falhou: a loja não paga por leitura que
-- não voltou.
create or replace function devolver_ia(p_loja uuid, p_recurso text)
returns void
language sql
security definer
set search_path = public
as $$
  update uso_ia
     set quantidade = greatest(0, quantidade - 1)
   where "lojaId" = p_loja
     and recurso = p_recurso
     and mes = to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
$$;

-- Só o servidor (chave de serviço) gasta e devolve. Concedido ao navegador,
-- qualquer loja devolveria os próprios créditos em laço.
revoke all on function gastar_ia(uuid, text, integer) from public;
revoke all on function devolver_ia(uuid, text) from public;
revoke all on function gastar_ia(uuid, text, integer) from anon, authenticated;
revoke all on function devolver_ia(uuid, text) from anon, authenticated;
grant execute on function gastar_ia(uuid, text, integer) to service_role;
grant execute on function devolver_ia(uuid, text) to service_role;

-- ---------- Confere ----------
-- Tem que listar as lojas com plano 'essencial' ou 'completo'.
select nome, plano from lojas order by nome;
