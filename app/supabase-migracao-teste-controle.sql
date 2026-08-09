-- ============================================================
--  Teste grátis: por que não converteu, o que a loja fez, e
--  quantas cortesias ela já levou
-- ============================================================
--
-- A migração anterior (supabase-migracao-teste-gratis.sql) deu ao teste um
-- começo, um fim e botões para esticar e encurtar. Faltava o que transforma
-- "quantas lojas testaram" em decisão:
--
--   1. POR QUE não virou cliente. Hoje o "não converteu" é um número sem
--      história, e três meses disso não dizem se o problema é preço ou é uma
--      tela faltando.
--   2. O QUE a loja fez durante o teste. Quem cadastrou 200 produtos e sumiu
--      esbarrou em alguma coisa concreta; quem cadastrou 3 nunca começou.
--      São dois telefonemas diferentes, e hoje se liga para os dois igual.
--   3. QUANTAS vezes ela já testou. Sem contar, a loja pode testar de mês em
--      mês para sempre e ninguém percebe.
--   4. Se a TOLERÂNCIA de 5 dias vale para teste. Hoje vale, e ninguém
--      decidiu isso: herdou da mensalidade. Sete dias de teste viram doze.
--
-- Repetível: pode rodar de novo sem quebrar nada.
-- Depende de supabase-migracao-assinatura.sql e supabase-migracao-teste-gratis.sql.

/* ---------- Colunas novas ---------- */

-- Por que o teste não virou assinatura. Texto curto, escolhido numa lista na
-- tela — lista fechada dá para contar; campo livre vira depoimento que
-- ninguém soma.
alter table lojas add column if not exists "motivoTeste" text;

-- Quantas cortesias esta loja já levou. A primeira é venda; a terceira é
-- outra conversa.
alter table lojas add column if not exists "testesDados" integer not null default 0;

-- Quantos dias vale REABRIR um teste para quem já testou. Menor que o
-- primeiro de propósito: quem volta já conhece o sistema, e um segundo teste
-- do mesmo tamanho é só mais uma semana de graça.
alter table sistema_config add column if not exists dias_reteste integer default 3;

/*
 * A tolerância vale durante o teste?
 *
 * Nasce FALSA, e é uma decisão, não um detalhe: a tolerância existe para o
 * cliente que paga há dois anos e esqueceu o Pix — segurar o sistema dele por
 * causa de um atraso de três dias seria maldade e custaria mais do que os
 * R$ 79. Quem está em teste não tem essa história: ele combinou sete dias, e
 * sete dias somados a cinco de tolerância viram doze sem ninguém ter
 * decidido isso.
 *
 * Ligar aqui devolve o comportamento antigo, se um dia fizer sentido.
 */
alter table sistema_config add column if not exists tolerancia_no_teste boolean default false;

update sistema_config
   set dias_reteste = coalesce(dias_reteste, 3),
       tolerancia_no_teste = coalesce(tolerancia_no_teste, false)
 where id;

/* ---------- A trava passa a conhecer o teste ---------- */

/*
 * `situacao_loja()` é a função que as políticas de escrita consultam — é ela,
 * e não a tela, que decide se a loja grava. Por isso a regra da tolerância no
 * teste tem que morar AQUI: escondê-la só na tela deixaria a loja gravando
 * por mais cinco dias enquanto o painel dizia que ela estava travada.
 *
 * O resto da função continua igual, palavra por palavra.
 */
create or replace function situacao_loja()
returns text
language plpgsql stable security definer set search_path = public
as $$
declare
  v_vence timestamptz;
  v_teste timestamptz;
  v_bloqueada boolean;
  v_isento boolean;
  v_tolerancia integer;
  v_tol_teste boolean;
begin
  -- Quem administra o sistema nunca é travado pela própria régua
  if sou_super_admin() then return 'ativa'; end if;

  select l."venceEm", l."testeAte", coalesce(l.bloqueada, false), coalesce(l.isento, false)
    into v_vence, v_teste, v_bloqueada, v_isento
    from lojas l
   where l.id = loja_atual();

  if not found then return 'bloqueada'; end if;
  if v_bloqueada then return 'bloqueada'; end if;
  if v_isento then return 'ativa'; end if;
  if v_vence is null then return 'ativa'; end if;

  if now() <= v_vence then return 'ativa'; end if;

  select coalesce(dias_tolerancia, 5), coalesce(tolerancia_no_teste, false)
    into v_tolerancia, v_tol_teste
    from sistema_config where id;

  -- Em teste (venceEm <= testeAte) e sem tolerância combinada: acabou é
  -- acabou. A loja continua CONSULTANDO e IMPRIMINDO tudo — 'leitura' nunca
  -- sequestrou dado de ninguém.
  if v_teste is not null and v_vence <= v_teste and not v_tol_teste then
    return 'leitura';
  end if;

  if now() <= v_vence + (v_tolerancia || ' days')::interval then return 'tolerancia'; end if;
  return 'leitura';
end $$;

grant execute on function situacao_loja() to authenticated;

/* ---------- Liberar teste passa a contar ---------- */

create or replace function liberar_teste(p_loja uuid, p_dias integer default null)
returns timestamptz
language plpgsql security definer set search_path = public
as $$
declare
  v_dias integer;
  v_pagou timestamptz;
  v_novo timestamptz;
begin
  if not sou_super_admin() then
    raise exception 'Só quem administra o sistema pode liberar teste.';
  end if;

  select "ultimoPagamento" into v_pagou from lojas where id = p_loja;
  if not found then raise exception 'Loja não encontrada.'; end if;
  if v_pagou is not null then
    raise exception 'Esta loja já pagou. Teste é só para quem nunca pagou; use "Pagou 1 mês" para renovar.';
  end if;

  select coalesce(p_dias, dias_teste, 7) into v_dias from sistema_config where id;
  if v_dias is null or v_dias <= 0 then
    raise exception 'O prazo de teste está zerado em Ajustes.';
  end if;

  v_novo := now() + (v_dias || ' days')::interval;
  update lojas
     set "venceEm" = v_novo,
         "testeAte" = v_novo,
         -- Cortesia nova zera o motivo anterior: ele era do teste passado.
         "motivoTeste" = null,
         "testesDados" = coalesce("testesDados", 0) + 1
   where id = p_loja;
  return v_novo;
end $$;

grant execute on function liberar_teste(uuid, integer) to authenticated;

/* ---------- Encerrar, agora anotando o motivo ---------- */

/*
 * A assinatura muda de 1 para 2 argumentos, então a antiga precisa sair
 * antes: com as duas no banco, chamar `encerrar_teste(id)` viraria
 * "function name is not unique" e o botão pararia de funcionar.
 */
drop function if exists encerrar_teste(uuid);

create or replace function encerrar_teste(p_loja uuid, p_motivo text default null)
returns timestamptz
language plpgsql security definer set search_path = public
as $$
declare
  v_teste timestamptz;
  v_vence timestamptz;
begin
  if not sou_super_admin() then
    raise exception 'Só quem administra o sistema pode mexer em teste.';
  end if;

  select "testeAte", "venceEm" into v_teste, v_vence from lojas where id = p_loja;
  if not found then raise exception 'Loja não encontrada.'; end if;
  if v_teste is null or v_vence is null or v_vence > v_teste then
    raise exception 'Esta loja não está em teste.';
  end if;

  update lojas
     set "venceEm" = now(),
         "testeAte" = now(),
         "motivoTeste" = coalesce(nullif(trim(p_motivo), ''), "motivoTeste")
   where id = p_loja;
  return now();
end $$;

grant execute on function encerrar_teste(uuid, text) to authenticated;

/* ---------- Anotar o motivo sem encerrar nada ---------- */

/*
 * O motivo quase nunca aparece no momento em que o teste acaba: ele aparece
 * três dias depois, no telefonema. Sem um jeito de anotar fora do
 * encerramento, a informação se perde exatamente quando ela existe.
 */
create or replace function anotar_motivo_teste(p_loja uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not sou_super_admin() then
    raise exception 'Só quem administra o sistema pode anotar isto.';
  end if;
  update lojas set "motivoTeste" = nullif(trim(p_motivo), '') where id = p_loja;
end $$;

grant execute on function anotar_motivo_teste(uuid, text) to authenticated;

/* ---------- Reabrir o teste de quem já testou ---------- */

/*
 * Separado de `ajustar_teste` porque é outra coisa.
 *
 * `ajustar_teste(+7)` é para o teste que está correndo — a loja pediu mais
 * uns dias. `reabrir_teste` é para quem testou, sumiu, e um mês depois volta
 * pedindo para ver de novo. Usar o mesmo botão para os dois esconderia
 * justamente o que interessa: quantas vezes aquela loja já usou de graça.
 *
 * Prazo menor por padrão (dias_reteste = 3): quem volta já conhece o sistema
 * e não precisa aprender de novo. Uma reabertura do mesmo tamanho do teste
 * original é só mais uma semana de graça com outro nome.
 */
create or replace function reabrir_teste(p_loja uuid, p_dias integer default null)
returns timestamptz
language plpgsql security definer set search_path = public
as $$
declare
  v_teste timestamptz;
  v_vence timestamptz;
  v_pagou timestamptz;
  v_dias integer;
  v_novo timestamptz;
begin
  if not sou_super_admin() then
    raise exception 'Só quem administra o sistema pode reabrir teste.';
  end if;

  select "testeAte", "venceEm", "ultimoPagamento"
    into v_teste, v_vence, v_pagou
    from lojas where id = p_loja;
  if not found then raise exception 'Loja não encontrada.'; end if;
  if v_pagou is not null then
    raise exception 'Esta loja já pagou. Use "Pagou 1 mês" para renovar.';
  end if;
  if v_teste is null or v_vence is null or v_vence > v_teste then
    raise exception 'Esta loja não está em teste.';
  end if;
  -- Reabrir teste que ainda está correndo daria dias de graça a quem já os
  -- tem. Para esse caso o botão é o "+3 / +7 / +15".
  if v_vence > now() then
    raise exception 'O teste desta loja ainda está correndo. Use os botões de esticar.';
  end if;

  select coalesce(p_dias, dias_reteste, 3) into v_dias from sistema_config where id;
  if v_dias is null or v_dias <= 0 then
    raise exception 'O prazo de reabertura está zerado em Ajustes.';
  end if;

  v_novo := now() + (v_dias || ' days')::interval;
  update lojas
     set "venceEm" = v_novo,
         "testeAte" = v_novo,
         "motivoTeste" = null,
         "testesDados" = coalesce("testesDados", 0) + 1
   where id = p_loja;
  return v_novo;
end $$;

grant execute on function reabrir_teste(uuid, integer) to authenticated;

/* ---------- O que cada loja fez lá dentro ---------- */

/*
 * Quantos clientes, produtos, ordens e vendas cada loja tem.
 *
 * Por que é função do banco e não consulta da tela: as políticas de leitura
 * só devolvem linhas da PRÓPRIA loja (`"lojaId" = loja_atual()`). Quem
 * administra o sistema não enxerga o conteúdo das lojas dos outros pela via
 * normal — e é certo que não enxergue.
 *
 * O que sai daqui é CONTAGEM, nunca conteúdo. Saber que a loja cadastrou 200
 * produtos é da sua relação comercial com ela; saber QUAIS produtos, o nome
 * dos clientes ou o valor das vendas não é, e nunca vai passar por aqui.
 *
 * `count(*)` por tabela é barato numa base de bairro e roda uma vez quando a
 * tela abre. Se um dia doer, vira uma tabela de resumo atualizada pelo cron.
 */
create or replace function resumo_uso_lojas()
returns table (
  loja uuid,
  clientes bigint,
  produtos bigint,
  ordens bigint,
  vendas bigint
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_loja uuid;
  v_sql text;
begin
  if not sou_super_admin() then return; end if;

  for v_loja in select id from lojas loop
    loja := v_loja;
    clientes := 0; produtos := 0; ordens := 0; vendas := 0;
    -- Tabela que ainda não existe (migração não rodada) conta zero em vez de
    -- derrubar a tela inteira: é a mesma regra do `Promise.allSettled` na
    -- carga — uma fonte com problema não pode zerar tudo o que veio junto.
    if to_regclass('clientes') is not null then
      execute 'select count(*) from clientes where "lojaId" = $1' into clientes using v_loja;
    end if;
    if to_regclass('produtos') is not null then
      execute 'select count(*) from produtos where "lojaId" = $1' into produtos using v_loja;
    end if;
    if to_regclass('ordens') is not null then
      execute 'select count(*) from ordens where "lojaId" = $1' into ordens using v_loja;
    end if;
    if to_regclass('vendas') is not null then
      execute 'select count(*) from vendas where "lojaId" = $1' into vendas using v_loja;
    end if;
    return next;
  end loop;
end $$;

grant execute on function resumo_uso_lojas() to authenticated;

/* ---------- Confere ---------- */

-- 1) As funções todas.
select proname, pronargs from pg_proc
 where proname in (
   'situacao_loja', 'liberar_teste', 'ajustar_teste', 'encerrar_teste',
   'reabrir_teste', 'anotar_motivo_teste', 'resumo_uso_lojas'
 )
 order by proname;

-- 2) O retrato de todo mundo, agora com motivo e quantas cortesias já levou.
select nome,
       case
         when coalesce(isento, false)                     then 'isenta (sua)'
         when "venceEm" is null                           then 'SEM PRAZO - de graça para sempre'
         when "testeAte" is not null
          and "venceEm" <= "testeAte"
          and "venceEm" >= now()                          then 'em teste'
         when "testeAte" is not null
          and "venceEm" <= "testeAte"                     then 'testou e nao converteu'
         else 'pagante'
       end as situacao,
       "venceEm", "testesDados", "motivoTeste"
  from lojas
 order by situacao, nome;

-- 3) O que cada loja construiu lá dentro. Só contagem.
select * from resumo_uso_lojas();
