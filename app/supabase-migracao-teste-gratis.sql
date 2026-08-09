-- ============================================================
--  Teste grátis: a loja nova nasce com prazo
-- ============================================================
--
-- O PROBLEMA QUE ISTO CONSERTA
--
-- `situacao_loja()` diz, e continua dizendo:
--
--     if v_vence is null then return 'ativa'; end if;
--
-- Ou seja: loja SEM data de vencimento é ativa para sempre. E era assim que
-- toda loja nova nascia — `venceEm` em branco. Na prática, quem entrava no
-- sistema ganhava acesso ilimitado e de graça, sem nada na tela do
-- administrador indicando isso: a lista mostrava "Em dia", que é verdade e
-- é justamente o que engana.
--
-- Pior: `dias_teste` já existia em `sistema_config`, com campo na tela de
-- Lojas assinantes. Ninguém lia. Era um número que o administrador
-- configurava e que não fazia nada — a mesma classe de defeito de um aviso
-- que não vira cobrança.
--
-- ------------------------------------------------------------
-- POR QUE UM GATILHO, E NÃO UM DEFAULT NA COLUNA
--
-- O prazo do teste é configurável (`sistema_config.dias_teste`) e pode
-- mudar. `default now() + interval '7 days'` congelaria o número no dia em
-- que a coluna foi criada, e mudar a configuração não teria efeito nenhum
-- sobre as lojas seguintes — de novo um campo que não faz nada.
-- ------------------------------------------------------------
--
-- O QUE ESTE ARQUIVO NÃO FAZ, DE PROPÓSITO
--
-- Ele NÃO mexe nas lojas que já existem. Rodar um `update` que põe prazo em
-- quem hoje não tem cortaria o acesso de cliente pagante que só não tem a
-- data preenchida — e cortar acesso de quem paga é o erro mais caro que
-- este sistema pode cometer. As lojas antigas continuam como estão, e o
-- administrador libera o teste uma a uma, pelo botão da tela.
--
-- Repetível: pode rodar de novo sem quebrar nada.

/* ---------- O prazo padrão do teste ---------- */

-- 7 dias: é o que dá para experimentar um sistema de balcão sem que ele
-- vire hábito de graça. Muda na tela de Lojas assinantes.
update sistema_config set dias_teste = coalesce(dias_teste, 7) where id;

/* ---------- A marca do teste ---------- */

/*
 * `venceEm` sozinho não distingue teste de assinatura paga: os dois são uma
 * data no futuro. E a diferença é tudo — para quem está em teste, "sua
 * mensalidade venceu" é uma cobrança de algo que a pessoa nunca contratou, e
 * o recado que deveria virar venda chega como carta de caloteiro.
 *
 * `testeAte` marca até quando aquele prazo é cortesia. A conta de "está em
 * teste" é uma comparação, e não um campo que alguém precisa lembrar de
 * apagar:
 *
 *     em teste  =  "venceEm" <= "testeAte"
 *
 * Pagar chama `registrar_pagamento`, que empurra `venceEm` um mês para
 * frente do maior entre o vencimento atual e hoje. Com isso `venceEm` passa
 * de `testeAte` e a loja deixa de ser teste sozinha, no mesmo instante do
 * pagamento. Nenhuma tela precisa lembrar de limpar nada — e o que ninguém
 * precisa lembrar é o que ninguém esquece.
 */
alter table lojas add column if not exists "testeAte" timestamptz;

/* ---------- A loja nova nasce com prazo ---------- */

create or replace function iniciar_teste_gratis()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_dias integer;
begin
  -- Prazo já informado manda: é o administrador cadastrando uma loja que
  -- já pagou, e sobrescrever isso daria um mês de graça a quem comprou.
  if new."venceEm" is not null then return new; end if;
  -- A loja isenta é a de quem administra o sistema: não tem teste, não tem
  -- cobrança, não vence.
  if coalesce(new.isento, false) then return new; end if;

  select coalesce(dias_teste, 7) into v_dias from sistema_config where id;
  -- Zero ou negativo = a casa não dá teste. Nesse caso a loja nasce sem
  -- prazo, como antes, e o administrador decide.
  if v_dias is null or v_dias <= 0 then return new; end if;

  new."venceEm" := now() + (v_dias || ' days')::interval;
  -- As duas datas nascem iguais: é isso que diz "este prazo é cortesia".
  new."testeAte" := new."venceEm";
  return new;
end $$;

drop trigger if exists lojas_teste_gratis on lojas;
create trigger lojas_teste_gratis
  before insert on lojas
  for each row execute function iniciar_teste_gratis();

/* ---------- Liberar teste para uma loja que já existe ---------- */

/*
 * O botão da tela chama esta função.
 *
 * Ela existe como função do banco, e não como um update direto da tela, por
 * um motivo: quem pode mexer em prazo de assinatura é só quem administra o
 * sistema. `security definer` mais a checagem de super admin garantem isso
 * do lado do banco — a trava não pode depender de a tela esconder o botão.
 */
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
  /*
   * Quem já pagou não volta para teste.
   *
   * `liberar_teste` conta a partir de HOJE. Chamada numa loja que pagou o
   * ano inteiro, ela jogaria o vencimento de dezembro para a semana que vem
   * — cortar acesso de cliente pagante é o erro mais caro deste sistema, e
   * a trava não pode depender de a tela esconder o botão.
   */
  if v_pagou is not null then
    raise exception 'Esta loja já pagou. Teste é só para quem nunca pagou; use "Pagou 1 mês" para renovar.';
  end if;

  select coalesce(p_dias, dias_teste, 7) into v_dias from sistema_config where id;
  if v_dias is null or v_dias <= 0 then
    raise exception 'O prazo de teste está zerado em Ajustes.';
  end if;

  -- A partir de HOJE, e não do vencimento anterior: liberar teste para quem
  -- está vencido há três meses não pode dar três meses de crédito.
  v_novo := now() + (v_dias || ' days')::interval;
  update lojas set "venceEm" = v_novo, "testeAte" = v_novo where id = p_loja;
  return v_novo;
end $$;

grant execute on function liberar_teste(uuid, integer) to authenticated;

/* ---------- Esticar ou encurtar um teste que já está correndo ---------- */

/*
 * O teste sem controle é pior do que teste nenhum.
 *
 * A primeira versão disto só sabia LIGAR o teste. Depois de ligado não havia
 * mais botão: a loja que pediu mais três dias para testar com o movimento do
 * fim de semana só podia ser atendida no SQL, e quem entrou por engano
 * ficava sete dias ocupando a lista. Uma cortesia que não dá para ajustar
 * vira ou favor no banco de dados ou "não dá".
 *
 * Move as DUAS datas juntas, e é isso que preserva `venceEm <= testeAte`.
 * Mexer só em `venceEm` faria a loja deixar de ser teste ao ganhar um dia a
 * mais — e ela passaria a receber cobrança de mensalidade.
 *
 * Não serve para loja pagante: empurrar vencimento de quem paga é
 * `registrar_pagamento`, que também anota a data do pagamento.
 */
create or replace function ajustar_teste(p_loja uuid, p_dias integer)
returns timestamptz
language plpgsql security definer set search_path = public
as $$
declare
  v_teste timestamptz;
  v_vence timestamptz;
  v_novo timestamptz;
begin
  if not sou_super_admin() then
    raise exception 'Só quem administra o sistema pode mexer em teste.';
  end if;
  if p_dias is null or p_dias = 0 then
    raise exception 'Informe quantos dias esticar (positivo) ou encurtar (negativo).';
  end if;

  select "testeAte", "venceEm" into v_teste, v_vence from lojas where id = p_loja;
  if not found then raise exception 'Loja não encontrada.'; end if;
  if v_teste is null or v_vence is null or v_vence > v_teste then
    raise exception 'Esta loja não está em teste.';
  end if;

  -- Esticar um teste que já acabou conta de hoje: dar três dias a quem
  -- venceu há um mês devolveria uma data no passado, ou seja, nada.
  v_novo := greatest(v_teste, now()) + (p_dias || ' days')::interval;
  -- Encurtar não volta no tempo: o menor teste possível é o que acaba agora.
  if v_novo < now() then v_novo := now(); end if;

  update lojas set "venceEm" = v_novo, "testeAte" = v_novo where id = p_loja;
  return v_novo;
end $$;

grant execute on function ajustar_teste(uuid, integer) to authenticated;

/*
 * Encerrar o teste hoje.
 *
 * Existe separado de `ajustar_teste(-999)` porque é a ação que o
 * administrador realmente quer nomear: "esta não vai virar cliente, tira da
 * frente". A loja não perde nada — continua consultando e imprimindo, como
 * qualquer loja vencida. Só para de cadastrar.
 */
create or replace function encerrar_teste(p_loja uuid)
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

  update lojas set "venceEm" = now(), "testeAte" = now() where id = p_loja;
  return now();
end $$;

grant execute on function encerrar_teste(uuid) to authenticated;

/* ---------- Confere ---------- */

-- 1) O gatilho tem que aparecer.
select tgname from pg_trigger where tgname = 'lojas_teste_gratis';

-- 2) As três funções do teste.
select proname from pg_proc
 where proname in ('iniciar_teste_gratis', 'liberar_teste', 'ajustar_teste', 'encerrar_teste')
 order by proname;

-- 3) O retrato de todo mundo: quem está em teste, quem paga e quem usa de
--    graça sem data para acabar. É esta lista que a tela de Lojas mostra.
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
       "venceEm", "testeAte", "ultimoPagamento"
  from lojas
 order by situacao, nome;

/*
 * NÃO existe backfill de `testeAte` aqui, de propósito.
 *
 * Loja com `venceEm` preenchido pode ser teste antigo ou cliente pagante que
 * renovou na mão. Marcar todo mundo como teste faria o robô mandar recado de
 * "seu teste acabou" para quem pagou no mês passado. Quem sabe a diferença é
 * o administrador, e o botão da tela põe uma a uma em teste.
 */
